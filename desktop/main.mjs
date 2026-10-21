// Electron main process: windows, tray, notifications, secret store, PTYs and
// the trusted origin of every control message. The renderer has no Node.
import { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, ipcMain, nativeImage, powerSaveBlocker, safeStorage, screen, shell, session as electronSession } from 'electron';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bitcodeHome } from '../src/paths.mjs';
import { loadAgents } from '../src/agents.mjs';
import { createController, fileVersion } from './core/controller.mjs';
import { probeSandbox, spawnWorker } from './core/sandbox.mjs';
import { atomicJSON, fail, loadJSON, workspacePath } from './core/primitives.mjs';
import { createAttachments } from './core/attachments.mjs';
import { HIDDEN_ARG, MIN_WINDOW, autostartEntry, autostartFile, createCrashPolicy, restoreBounds, trayModel } from './core/shell.mjs';
import { watchTree } from './core/watcher.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url)); // dist/
const home = bitcodeHome();
const UI = path.join(appDir, 'ui', 'index.html');
let win = null, tray = null, quitting = false, controller, awakeBlocker = null;
const startHidden = process.argv.includes(HIDDEN_ARG);
const windowFile = path.join(home, 'desktop', 'window.json');

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => show()); // re-opening path when the tray icon is not visible

// ---- secret store (§11, 5A): libsecret via safeStorage, else memory only ----
const secretFile = path.join(home, 'desktop', 'secrets.json');
const memory = new Map();
const secretStore = () => {
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend?.() : 'os';
  return { secure: safeStorage.isEncryptionAvailable() && !['basic_text', 'unknown'].includes(backend), backend };
};
const secrets = {
  get(name) {
    if (memory.has(name)) return memory.get(name);
    const stored = loadJSON(secretFile, {})[name];
    if (!stored || !secretStore().secure) return undefined;
    try { const v = safeStorage.decryptString(Buffer.from(stored, 'base64')); memory.set(name, v); return v; } catch { return undefined; }
  },
  put(name, value) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(name) || typeof value !== 'string' || !value) throw fail('INVALID_PARAMS');
    memory.set(name, value); controller?.redactor.add(value);
    const { secure } = secretStore();
    if (secure) { const all = loadJSON(secretFile, {}); all[name] = safeStorage.encryptString(value).toString('base64'); atomicJSON(secretFile, all); }
    return { persisted: secure };
  },
  delete(name) { memory.delete(name); const all = loadJSON(secretFile, {}); delete all[name]; atomicJSON(secretFile, all); return true; },
  names() { return [...new Set([...memory.keys(), ...Object.keys(loadJSON(secretFile, {}))])]; }
};

// ---- PTYs (§10): owned by the user, never connected to agent input ----
const ptys = new Map();
let ptyModule;
async function openPty({ projectId }) {
  ptyModule ??= await import('node-pty').catch(e => { throw fail('PTY_UNAVAILABLE', e.message); });
  if (ptys.size >= 8) throw fail('BUSY', 'Too many terminals');
  const project = (await controller.invoke('project.list')).find(p => p.projectId === projectId); if (!project) throw fail('NOT_FOUND');
  const shell = process.env.SHELL || '/bin/bash';
  const term = ptyModule.spawn(shell, [], { name: 'xterm-256color', cols: 100, rows: 24, cwd: project.root, env: { ...process.env, TERM: 'xterm-256color', BITCODE_DESKTOP: '1' } });
  const ptyId = crypto.randomUUID();
  ptys.set(ptyId, term);
  term.onData(data => send('pty', { ptyId, data }));
  term.onExit(({ exitCode }) => { ptys.delete(ptyId); send('pty', { ptyId, exit: exitCode }); });
  return { ptyId, shell };
}
const ptyOf = id => ptys.get(id) || (() => { throw fail('NOT_FOUND', 'Unknown terminal'); })();

// ---- project watchers: external edits reach open buffers as file.changed ----
const watchers = new Map();
function watchProject({ projectId, root }) {
  if (watchers.has(projectId) || !existsSync(root)) return;
  const pending = new Map();
  watchers.set(projectId, watchTree(root, rel => {
    if (pending.has(rel)) return;
    pending.set(rel, setTimeout(() => {
      pending.delete(rel);
      try { send('file', { projectId, path: rel, version: fileVersion(workspacePath(root, rel)), by: 'disk' }); } catch {}
    }, 150));
  }));
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send('bitcode:event', { channel, payload }); }
// A notification without a live reference can be collected before its click arrives.
const shownNotifications = new Set();
function notify(title, body, target) {
  if (!Notification.isSupported() || (win?.isVisible() && win.isFocused())) return;
  const n = new Notification({ title, body, silent: false });
  shownNotifications.add(n);
  const release = () => shownNotifications.delete(n);
  n.on('click', () => { show(); if (target) send('navigate', target); release(); });
  n.on('close', release); n.on('failed', release);
  n.show();
}
function show() { if (!win) createWindow(); else { win.show(); win.focus(); } }
const toggle = () => (win?.isVisible() && win.isFocused() ? win.hide() : show());

let geometryTimer = null;
function saveGeometry() {
  clearTimeout(geometryTimer); geometryTimer = null;
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  try { atomicJSON(windowFile, { ...(win.isMaximized() ? win.getNormalBounds() : win.getBounds()), maximized: win.isMaximized() }); } catch {}
}
const queueGeometry = () => { clearTimeout(geometryTimer); geometryTimer = setTimeout(saveGeometry, 400); };

function watchRenderer(w) {
  const policy = createCrashPolicy();
  w.webContents.on('render-process-gone', async (_, { reason }) => {
    const step = policy.next(reason);
    if (step === 'reload') return setTimeout(() => { if (!w.isDestroyed()) w.webContents.reload(); }, 100);
    if (step !== 'stop') return;
    const { response } = await dialog.showMessageBox({ type: 'error', buttons: ['Ricarica', 'Esci'], defaultId: 0, cancelId: 1,
      message: 'La finestra di Bitcode continua a chiudersi', detail: `Motivo: ${reason}. Le attività in corso proseguono nel processo principale.` });
    if (response === 0 && !w.isDestroyed()) { policy.reset(); w.webContents.reload(); } else quit();
  });
}

function createWindow({ visible = true } = {}) {
  let saved = null; try { saved = restoreBounds(loadJSON(windowFile, null), screen.getAllDisplays().map(d => d.workArea)); } catch {}
  win = new BrowserWindow({ width: saved?.width || 1440, height: saved?.height || 900, ...(saved ? { x: saved.x, y: saved.y } : {}), minWidth: MIN_WINDOW.width, minHeight: MIN_WINDOW.height, show: visible,
    title: 'Bitcode', backgroundColor: '#f7f7f4', icon: path.join(appDir, 'ui', 'icon.png'),
    webPreferences: { preload: path.join(appDir, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  if (saved?.maximized) win.maximize();
  win.setMenuBarVisibility(false);
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) win.on(event, queueGeometry);
  for (const event of ['show', 'hide']) win.on(event, updateTray);
  watchRenderer(win);
  win.on('close', e => { saveGeometry(); if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.loadFile(UI);
  // Smoke check for CI/dev: render, save a screenshot, exit.
  if (process.env.BITCODE_DESKTOP_SCREENSHOT) win.webContents.once('did-finish-load', () => setTimeout(async () => {
    writeFileSync(process.env.BITCODE_DESKTOP_SCREENSHOT, (await win.capturePage()).toPNG());
    quitting = true; controller.shutdown(); app.exit(0);
  }, 2500));
}

// Suspension would stall running agents, so it is blocked only while any run is active.
function keepAwake(active) {
  if (active && awakeBlocker === null) awakeBlocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (!active && awakeBlocker !== null) { powerSaveBlocker.stop(awakeBlocker); awakeBlocker = null; }
}

function updateTray() {
  const runs = controller.activeRuns(), model = trayModel({ runs, pending: controller.pending() });
  keepAwake(runs.length > 0);
  if (!tray) return;
  const activity = () => { show(); send('navigate', { view: 'activity' }); };
  tray.setToolTip(model.tooltip);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Nascondi Bitcode' : 'Apri Bitcode', click: toggle },
    { type: 'separator' },
    ...(model.approvals.length ? [{ label: 'Richieste in attesa', enabled: false }, ...model.approvals.map(a => ({ label: a.label, click: activity })),
      ...(model.moreApprovals ? [{ label: `Altre ${model.moreApprovals}…`, click: activity }] : []), { type: 'separator' }] : []),
    { label: runs.length ? `${runs.length} attività in corso` : 'Nessuna attività in corso', enabled: false },
    ...model.runs.map(r => ({ label: `Annulla: ${r.label}`, click: () => controller.invoke('run.cancel', { runId: r.runId }, 'tray') })),
    { type: 'separator' },
    { label: 'Esci', click: quit }
  ]));
}

async function quit() {
  const active = controller.activeRuns().length;
  if (active) {
    const { response } = await dialog.showMessageBox(win?.isVisible() ? win : undefined, { type: 'warning', buttons: ['Annulla', 'Termina attività ed esci'], defaultId: 0, cancelId: 0,
      message: `${active} attività in corso`, detail: 'Uscendo le attività vengono interrotte e non riprendono automaticamente.' });
    if (response !== 1) return;
  }
  shutdown(); app.quit();
}
function shutdown() { quitting = true; saveGeometry(); keepAwake(false); controller?.shutdown(); for (const t of ptys.values()) t.kill(); }

// Autostart is offered only for packaged builds: a development Electron binary cannot start the app on its own.
const launcher = () => (process.env.APPIMAGE && path.isAbsolute(process.env.APPIMAGE) ? process.env.APPIMAGE : process.execPath);
const autostart = {
  get: () => ({ supported: process.platform === 'linux' && app.isPackaged, enabled: existsSync(autostartFile({ home: app.getPath('home') })) }),
  set: enabled => {
    if (!autostart.get().supported) throw fail('UNSUPPORTED', 'Avvio automatico disponibile solo nel pacchetto installato');
    const file = autostartFile({ home: app.getPath('home') });
    if (enabled) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, autostartEntry({ executable: launcher() }), { mode: 0o644 }); } else rmSync(file, { force: true });
    return autostart.get();
  }
};

// ---- attachments: files and folders shared in a chat are copied into the project's allegati/ ----
const attachments = new Map();
async function attachmentsFor(projectId) {
  const project = (await controller.invoke('project.list')).find(p => p.projectId === projectId); if (!project) throw fail('NOT_FOUND');
  if (!attachments.has(projectId)) attachments.set(projectId, createAttachments(project.root));
  return attachments.get(projectId);
}
const asBytes = data => (data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);

// ---- trusted IPC: origin comes from the verified sender, never the payload ----
const mainMethods = {
  'app.info': () => ({ version: app.getVersion(), home, secretStore: secretStore(), secrets: secrets.names(), platform: process.platform }),
  'dialog.openFolder': async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; },
  'secrets.put': ({ name, value }) => secrets.put(name, value),
  'secrets.delete': ({ name }) => secrets.delete(name),
  'pty.open': openPty,
  'pty.write': ({ ptyId, data }) => { if (typeof data !== 'string' || data.length > 65536) throw fail('INVALID_PARAMS'); ptyOf(ptyId).write(data); return true; },
  'pty.resize': ({ ptyId, cols, rows }) => { if (!(cols > 1 && rows > 1 && cols < 1000 && rows < 500)) throw fail('INVALID_PARAMS'); ptyOf(ptyId).resize(cols | 0, rows | 0); return true; },
  'pty.close': ({ ptyId }) => { ptyOf(ptyId).kill(); ptys.delete(ptyId); return true; },
  // Dropped or pasted bytes come from the UI; picked paths never do (they come from a native dialog owned by this process).
  'attach.put': async ({ projectId, group, top, rel, data }) => {
    const bytes = asBytes(data); if (!bytes || typeof group !== 'string' || group.length > 80 || typeof rel !== 'string') throw fail('INVALID_PARAMS');
    try { return (await attachmentsFor(projectId)).put({ group, top: typeof top === 'string' ? top : undefined, rel, bytes }); } catch (e) { throw fail(e.code || 'INVALID_PARAMS', e.message); }
  },
  'attach.pick': async ({ projectId, kind }) => {
    const store = await attachmentsFor(projectId);
    const r = await dialog.showOpenDialog(win, { properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'] });
    return r.canceled ? { items: [], skipped: [] } : store.importPaths(r.filePaths);
  },
  'attach.remove': async ({ projectId, top }) => { try { return (await attachmentsFor(projectId)).remove(String(top)); } catch (e) { throw fail(e.code || 'INVALID_PARAMS', e.message); } },
  'clipboard.write': ({ text }) => { if (typeof text !== 'string' || text.length > 1_000_000) throw fail('INVALID_PARAMS'); clipboard.writeText(text); return true; },
  'clipboard.read': () => clipboard.readText().slice(0, 1_000_000),
  // Links in answers open in the system browser; only plain http(s) URLs, never file:, javascript: or custom schemes.
  'app.autostart.get': () => autostart.get(),
  'app.autostart.set': ({ enabled }) => autostart.set(enabled === true),
  'app.openExternal': async ({ url }) => { const u = new URL(String(url)); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw fail('INVALID_PARAMS'); await shell.openExternal(u.href); return true; },
  'app.quit': quit
};
ipcMain.handle('bitcode:invoke', async (event, message) => {
  try {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame.url.startsWith('file://')) throw fail('FORBIDDEN_ORIGIN');
    if (!message || typeof message.method !== 'string') throw fail('INVALID_PARAMS');
    const origin = `ui:${win.id}`, params = message.params ?? {};
    const result = mainMethods[message.method] ? await mainMethods[message.method](params) : await controller.invoke(message.method, params, origin);
    if (message.method === 'project.open') watchProject(result);
    return { ok: true, result: result === undefined ? null : result };
  } catch (e) { return { ok: false, error: { code: e.code || 'INTERNAL', message: e.message } }; }
});

app.whenReady().then(() => {
  electronSession.defaultSession.setPermissionRequestHandler((_, __, cb) => cb(false));
  const sandbox = probeSandbox();
  controller = createController({ home, appDir, sandbox, secrets, agents: loadAgents({ bundledDir: path.join(appDir, 'agents') }),
    spawnWorker: opts => spawnWorker({ ...opts, runtime: process.execPath }),
    emit: (channel, payload) => {
      send(channel, payload);
      if (channel === 'approval' && payload.status === 'pending') notify('Bitcode · approvazione richiesta', `${payload.subject?.project || ''} · ${payload.kind}`, { view: 'activity' });
      if (channel === 'run' && ['success', 'error', 'interrupted'].includes(payload.state)) notify(`Bitcode · attività ${payload.state === 'success' ? 'completata' : 'terminata con errore'}`, payload.prompt.slice(0, 60), { view: 'chat', sessionId: payload.sessionId });
      if (channel === 'run' || channel === 'approval') updateTray();
    } });
  controller.invoke('project.list').then(list => list.forEach(watchProject));
  try { tray = new Tray(nativeImage.createFromPath(path.join(appDir, 'ui', 'icon.png')).resize({ width: 22, height: 22 })); tray.on('click', toggle); updateTray(); } catch { tray = null; }
  // --hidden (used by autostart) starts in the tray; without a tray the window must stay reachable.
  createWindow({ visible: !(startHidden && tray) });
});
app.on('window-all-closed', () => { /* stay alive in the tray; quit is explicit */ });
// Electron turns SIGTERM, SIGINT and SIGHUP into this event. A nested app.quit()
// during it is ignored, so without active runs the quit proceeds right here.
app.on('before-quit', e => {
  if (quitting) return;
  if (controller?.activeRuns().length) { e.preventDefault(); quit(); } else shutdown();
});
