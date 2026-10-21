// Project watcher: per-directory watches, skipped heavy folders, a hard cap, and errors that never escape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { watchTree } from '../core/watcher.mjs';

const tree = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bitcode-watch-'));
  for (const dir of ['src/lib', '.git/refs/heads', 'node_modules/pkg', 'dist']) mkdirSync(path.join(root, dir), { recursive: true });
  return root;
};
const fakeWatch = () => {
  const watched = new Map();
  const watchDir = (dir, listener) => {
    const w = Object.assign(new EventEmitter(), { listener, closed: false, close() { this.closed = true; } });
    watched.set(dir, w); return w;
  };
  return { watched, watchDir };
};
const until = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error('timeout'); await new Promise(r => setTimeout(r, 20)); }
};

test('watches source directories and skips .git, node_modules and build output', () => {
  const root = tree(), { watched, watchDir } = fakeWatch();
  const handle = watchTree(root, () => {}, { watchDir });
  assert.deepEqual([...watched.keys()].map(d => path.relative(root, d)).sort(), ['', 'src', path.join('src', 'lib')]);
  handle.close();
  assert.ok([...watched.values()].every(w => w.closed));
});

test('a watcher error closes that watcher instead of throwing', () => {
  const root = tree(), { watched, watchDir } = fakeWatch();
  const handle = watchTree(root, () => {}, { watchDir });
  const src = watched.get(path.join(root, 'src'));
  assert.doesNotThrow(() => src.emit('error', Object.assign(new Error('limit'), { code: 'ENOSPC' })));
  assert.ok(src.closed);
  assert.equal(handle.size, 2);
});

test('stops adding watches at the cap and when the system limit is reached', () => {
  const root = tree();
  const capped = watchTree(root, () => {}, { maxDirs: 1, watchDir: fakeWatch().watchDir });
  assert.equal(capped.size, 1); assert.ok(capped.exhausted);
  let calls = 0;
  const failing = watchTree(root, () => {}, { watchDir: () => { calls++; throw Object.assign(new Error('limit'), { code: 'ENOSPC' }); } });
  assert.equal(calls, 1); assert.ok(failing.exhausted);
});

test('reports file changes and follows new directories', () => {
  const root = tree(), { watched, watchDir } = fakeWatch(), changes = [];
  watchTree(root, rel => changes.push(rel), { watchDir });
  mkdirSync(path.join(root, 'src', 'new'));
  watched.get(path.join(root, 'src')).listener('rename', 'new');
  assert.ok(watched.has(path.join(root, 'src', 'new')));
  writeFileSync(path.join(root, 'src', 'new', 'a.js'), '1');
  watched.get(path.join(root, 'src', 'new')).listener('change', 'a.js');
  watched.get(root).listener('rename', '.git');
  assert.deepEqual(changes, [path.join('src', 'new', 'a.js')]);
});

test('works with the real fs.watch', async () => {
  const root = tree(), changes = [];
  const handle = watchTree(root, rel => changes.push(rel));
  try {
    writeFileSync(path.join(root, 'src', 'lib', 'x.js'), '1');
    writeFileSync(path.join(root, '.git', 'refs', 'heads', 'chore'), '1');
    await until(() => changes.includes(path.join('src', 'lib', 'x.js')));
    assert.ok(!changes.some(c => c.startsWith('.git')));
  } finally { handle.close(); }
});
