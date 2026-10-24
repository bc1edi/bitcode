// Drives the real bitcode Desktop (Electron build in desktop/dist) and records what
// its window paints. The app, its controller, the sandboxed worker, the models and
// the RGB node are all real; only the input comes from this script. Two overlays are
// injected into the page for the viewer: a pointer that travels to each target before
// the click, and a badge shown while the recording is played back faster.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const desktop = path.join(repo, 'desktop');
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Content size in CSS pixels; the window is painted at 1.5x, so frames are 1920x1080.
export const VIEWPORT = { width: 1280, height: 720, scale: 1.5 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const OVERLAY = `(() => {
  if (document.getElementById('demo-pointer')) return;
  const pointer = document.createElement('div');
  pointer.id = 'demo-pointer';
  Object.assign(pointer.style, { position: 'fixed', left: '0', top: '0', width: '22px', height: '22px', zIndex: 2147483647, pointerEvents: 'none',
    transform: 'translate(640px, 420px)', transition: 'transform 0ms', willChange: 'transform' });
  pointer.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.6 L16.6 12.4 Z" fill="#f7f7f4" stroke="#0b0e11" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ring = document.createElement('div');
  Object.assign(ring.style, { position: 'fixed', width: '34px', height: '34px', marginLeft: '-17px', marginTop: '-17px', borderRadius: '50%', zIndex: 2147483646,
    pointerEvents: 'none', border: '2px solid #f7931a', opacity: '0', transform: 'scale(.4)', transition: 'opacity 380ms ease, transform 380ms ease' });
  ring.id = 'demo-ring';
  const badge = document.createElement('div');
  badge.id = 'demo-speed';
  Object.assign(badge.style, { position: 'fixed', right: '24px', top: '68px', zIndex: 2147483647, pointerEvents: 'none', padding: '5px 10px', borderRadius: '999px',
    font: '600 12px/1.2 "JetBrains Mono", ui-monospace, monospace', color: '#0b0e11', background: '#f7931a', opacity: '0', transition: 'opacity 200ms ease' });
  document.body.append(ring, pointer, badge);
})()`;

export async function launch({ name, settings = {}, config = {}, project, env = {} }) {
  const { _electron } = require(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
  const work = path.join(process.env.DESKTOP_DEMO_TMP || '/tmp', `bitcode-desktop-demo-${name}`);
  rmSync(work, { recursive: true, force: true });
  const home = path.join(work, 'home');
  mkdirSync(path.join(home, 'desktop'), { recursive: true });
  writeFileSync(path.join(home, 'desktop', 'settings.json'), JSON.stringify({ v: 1, lang: 'en', theme: 'dark', maxActive: 3, maxLocal: 1, model: null, satModels: {}, localOnly: false,
    notifyRuns: false, notifyApprovals: false, snippets: [], transcriptionModel: null, remoteMode: 'off', ...settings }));
  writeFileSync(path.join(home, 'config.json'), JSON.stringify(config));
  let root = null;
  if (project) {
    root = path.join(work, project);
    cpSync(path.join(fixtures, project), root, { recursive: true });
    const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-20T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-20T10:00:00Z' } });
    git(['init', '-q', '-b', 'main']); git(['add', '-A']);
    git(['-c', 'user.name=bitcode demo', '-c', 'user.email=demo@bitcode.invalid', 'commit', '-qm', 'Initial commit']);
  }
  const app = await _electron.launch({
    executablePath: path.join(desktop, 'node_modules/electron/dist/electron'),
    // A private profile keeps the recording apart from any bitcode Desktop the user has open.
    args: ['--no-sandbox', '--ozone-platform=x11', `--force-device-scale-factor=${VIEWPORT.scale}`, `--user-data-dir=${path.join(work, 'profile')}`, desktop],
    // The app's terminal runs a plain sh with a short prompt: no host name or home path on screen.
    env: { ...process.env, BITCODE_HOME: home, SHELL: '/bin/sh', PS1: '$ ', ...env },
  });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, { width, height }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(width, height); w.center(); }, VIEWPORT);
  if (root) await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, root);
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(OVERLAY);
  return new Session({ app, win, home, root, work });
}

class Session {
  constructor({ app, win, home, root, work }) {
    Object.assign(this, { app, win, home, root, work });
    this.frames = []; this.marks = []; this.cues = []; this.notes = [];
    this.pointer = { x: 640, y: 420 };
  }

  now() { return Date.now() / 1000; }

  async record(dir) {
    this.dir = dir;
    mkdirSync(path.join(dir, 'frames'), { recursive: true });
    this.cdp = await this.win.context().newCDPSession(this.win);
    this.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = `frames/${String(this.frames.length).padStart(6, '0')}.jpg`;
      writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
      this.frames.push({ file, t: metadata.timestamp ?? this.now() });
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    this.start = this.now();
    this.marks.push({ t: this.start, speed: 1 });
  }

  // Everything after this plays back `factor` times faster, with a visible badge.
  async speed(factor) {
    await this.win.evaluate(f => { const b = document.getElementById('demo-speed'); b.textContent = `▶▶ ${f}×`; b.style.opacity = f > 1 ? '1' : '0'; }, factor);
    await sleep(250);
    this.marks.push({ t: this.now(), speed: factor });
  }

  caption(en, it) { this.cues.push({ t: this.now(), en, it }); }
  note(text) { this.notes.push(text); }
  wait(ms) { return sleep(ms); }

  async moveTo(target, { duration } = {}) {
    const box = await target.boundingBox();
    if (!box) throw new Error('Target has no box');
    const x = box.x + Math.min(box.width / 2, 28 + box.width / 4), y = box.y + box.height / 2;
    const distance = Math.hypot(x - this.pointer.x, y - this.pointer.y);
    const ms = duration ?? Math.round(Math.min(900, 260 + distance * .9));
    await this.win.evaluate(([x, y, ms]) => { const p = document.getElementById('demo-pointer'); p.style.transition = `transform ${ms}ms cubic-bezier(.22,1,.36,1)`; p.style.transform = `translate(${x}px, ${y}px)`; }, [x, y, ms]);
    this.pointer = { x, y };
    await sleep(ms + 60);
  }

  async click(target, { pause = 220 } = {}) {
    await target.waitFor({ state: 'visible' });
    await target.scrollIntoViewIfNeeded();
    await this.moveTo(target);
    await this.win.evaluate(([x, y]) => { const r = document.getElementById('demo-ring'); r.style.transition = 'none'; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.opacity = '1'; r.style.transform = 'scale(.4)';
      requestAnimationFrame(() => { r.style.transition = 'opacity 420ms ease, transform 420ms ease'; r.style.opacity = '0'; r.style.transform = 'scale(1.3)'; }); }, [this.pointer.x, this.pointer.y]);
    await target.click();
    await sleep(pause);
  }

  async type(target, text, { delay = 38, pause = 300 } = {}) {
    await this.click(target, { pause: 120 });
    await target.pressSequentially(text, { delay });
    await sleep(pause);
  }

  // Waits for a condition while the app works, at the given playback speed.
  async until(predicate, { speed = 1, timeout = 900_000, poll = 500, label = 'condition' } = {}) {
    if (speed !== 1) await this.speed(speed);
    const end = Date.now() + timeout;
    while (!(await predicate())) {
      if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
      await sleep(poll);
    }
    if (speed !== 1) await this.speed(1);
  }

  async stop(meta) {
    await sleep(400);
    await this.cdp.send('Page.stopScreencast');
    const end = this.now();
    writeFileSync(path.join(this.dir, 'capture.json'), JSON.stringify({ ...meta, start: this.start, end, viewport: VIEWPORT, marks: this.marks, cues: this.cues, notes: this.notes, frames: this.frames }, null, 1));
    await this.app.close();
  }
}
