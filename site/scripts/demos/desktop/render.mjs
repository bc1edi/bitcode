// Turns a desktop capture into the site's media: an H.264 MP4 (and, for loops, WebM),
// a WebP poster, English and Italian WebVTT captions and a plain-text transcript.
// Frames are never edited; time is only re-mapped where the capture marked a faster
// playback segment, and that segment carries the on-screen speed badge.
//
//   node site/scripts/demos/desktop/render.mjs <capture-dir> <out-dir> <id> [--loop] [--from S] [--to S]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [captureDir, outDir, id, ...flags] = process.argv.slice(2);
if (!captureDir || !outDir || !id) throw new Error('Usage: render.mjs <capture-dir> <out-dir> <id> [--loop] [--from S] [--to S]');
// --from/--to take output seconds or the name of an instant the storyboard marked.
const flag = name => { const i = flags.indexOf(name); if (i < 0) return null; const v = flags[i + 1]; return v in (capture.named || {}) ? outputTime(capture.named[v]) : Number(v); };
const loop = flags.includes('--loop');
const capture = JSON.parse(readFileSync(path.join(captureDir, 'capture.json'), 'utf8'));
const FPS = 30;

// Wall-clock seconds -> output seconds, integrating 1/speed across the marks.
const marks = capture.marks;
function outputTime(t) {
  let out = 0;
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].t, to = i + 1 < marks.length ? marks[i + 1].t : Infinity;
    if (t <= from) break;
    out += (Math.min(t, to) - from) / marks[i].speed;
  }
  return out;
}
const from = flag('--from') ?? (loop && capture.loopFrom ? outputTime(capture.loopFrom) : 0);
const to = flag('--to') ?? (loop && capture.loopTo ? outputTime(capture.loopTo) : outputTime(capture.end));
const frames = capture.frames.map(f => ({ ...f, at: outputTime(f.t) }));

// Concat list: each frame holds until the next one; the screencast only sends changes.
const list = [];
let previous = frames.filter(f => f.at <= from).at(-1) ?? frames[0];
let cursor = from;
for (const frame of frames.filter(f => f.at > from && f.at < to)) {
  list.push({ file: previous.file, duration: frame.at - cursor });
  previous = frame; cursor = frame.at;
}
list.push({ file: previous.file, duration: to - cursor + (loop ? 0 : 1.2) });
mkdirSync(outDir, { recursive: true });
const listFile = path.join(captureDir, `${id}.concat.txt`);
writeFileSync(listFile, list.filter(x => x.duration > 0).map(x => `file '${path.join(captureDir, x.file)}'\nduration ${x.duration.toFixed(4)}`).join('\n') + `\nfile '${path.join(captureDir, previous.file)}'\n`);

const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const input = ['-f', 'concat', '-safe', '0', '-i', listFile];
const scale = loop ? `fps=${FPS},scale=1440:-2:flags=lanczos` : `fps=${FPS},scale=1920:1080:flags=lanczos`;
const mp4 = path.join(outDir, loop ? `${id}.mp4` : `${id}-16x9.mp4`);
ffmpeg([...input, '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', loop ? '26' : '22', '-tune', 'stillimage', '-movflags', '+faststart', '-an', mp4]);
if (loop) ffmpeg([...input, '-vf', scale, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', path.join(outDir, `${id}.webm`)]);
const posterAt = Math.max(0, (capture.posterAt != null ? outputTime(capture.posterAt) : (loop ? from : to - .2)) - from);
ffmpeg(['-ss', posterAt.toFixed(3), '-i', mp4, '-frames:v', '1', '-vf', loop ? 'scale=1440:-2' : 'scale=1600:-2', '-c:v', 'libwebp', '-quality', '82', path.join(outDir, loop ? `${id}.webp` : `${id}-poster.webp`)]);
// Loops are posters on first paint; phones get a lighter one through srcset.
if (loop) ffmpeg(['-ss', posterAt.toFixed(3), '-i', mp4, '-frames:v', '1', '-vf', 'scale=720:-2', '-c:v', 'libwebp', '-quality', '78', path.join(outDir, `${id}-720.webp`)]);

const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
if (!loop) {
  const stamp = s => { const ms = Math.round(s * 1000); return new Date(ms).toISOString().slice(11, 23); };
  // In an excerpt, the caption already on screen at the cut starts at 0; earlier ones are dropped.
  const timed = capture.cues.map(c => ({ ...c, at: outputTime(c.t) - from }));
  const cues = timed.filter((c, i) => c.at >= 0 ? c.at < duration : !(timed[i + 1]?.at <= 0)).map(c => ({ ...c, at: Math.max(0, c.at) }));
  for (const lang of ['en', 'it']) {
    const body = cues.map((c, i) => `${i + 1}\n${stamp(c.at)} --> ${stamp(Math.min(duration, i + 1 < cues.length ? cues[i + 1].at : duration))}\n${c[lang]}`).join('\n\n');
    writeFileSync(path.join(outDir, `${id}.${lang}.vtt`), `WEBVTT\n\n${body}\n`);
  }
  const fast = marks.filter(m => m.speed > 1).map(m => `${m.speed}×`);
  writeFileSync(path.join(outDir, `${id}-transcript.txt`), [
    `bitcode Desktop — ${capture.title}`,
    `Recorded ${new Date(capture.start * 1000).toISOString()} · ${capture.model || 'no model'} · source commit ${capture.sourceCommit}`,
    '', capture.provenance,
    fast.length ? `Segments marked on screen play back faster (${[...new Set(fast)].join(', ')}).` : 'Played back in real time.',
    '', ...cues.map(c => `[${stamp(c.at).slice(3, 8)}] ${c.en}`),
    ...(capture.notes.length ? ['', ...capture.notes] : []), '',
  ].join('\n'));
}
const manifestFile = path.join(outDir, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { version: 1, demos: {} };
manifest.demos[id] = {
  scenario: capture.id, title: capture.title, model: capture.model, loop,
  recordedAt: new Date(capture.start * 1000).toISOString(), sourceCommit: capture.sourceCommit, workingTreeModified: capture.workingTreeModified,
  duration: Math.round(duration * 10) / 10, speeds: [...new Set(marks.map(m => m.speed))].filter(s => s > 1), provenance: capture.provenance,
  files: { video: path.basename(mp4), ...(loop ? { webm: `${id}.webm`, poster: `${id}.webp` } : { poster: `${id}-poster.webp`, captions: [`${id}.en.vtt`, `${id}.it.vtt`], transcript: `${id}-transcript.txt` }) },
};
manifest.demos = Object.fromEntries(Object.entries(manifest.demos).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${id}: ${duration.toFixed(1)} s → ${path.relative(process.cwd(), outDir)}`);
