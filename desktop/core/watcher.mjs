// Project file watching without fs.watch({ recursive }): on Linux that mode places an inotify watch on every
// directory, .git and node_modules included, and reports exhaustion (ENOSPC) as an unhandled 'error' event.
import { readdirSync, statSync, watch } from 'node:fs';
import path from 'node:path';

export const SKIPPED_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', '__pycache__', '.venv', 'venv', '.next', '.cache', 'dist', 'release', 'build', 'target', 'coverage']);
export const MAX_WATCHED_DIRS = 2000;

export function watchTree(root, onChange, { maxDirs = MAX_WATCHED_DIRS, watchDir = watch } = {}) {
  const watchers = new Map();
  let closed = false, exhausted = false;

  const unwatch = dir => {
    for (const [watched, w] of watchers) {
      if (watched === dir || watched.startsWith(dir + path.sep)) { w.close(); watchers.delete(watched); }
    }
  };

  const add = dir => {
    if (closed || exhausted || watchers.has(dir)) return;
    if (watchers.size >= maxDirs) { exhausted = true; return; }
    let w;
    try {
      w = watchDir(dir, (_, name) => name && changed(dir, name.toString()));
    } catch (e) {
      if (e.code === 'ENOSPC' || e.code === 'EMFILE') exhausted = true;
      return;
    }
    // A missing listener turns any later watcher error into an uncaught exception in the main process.
    w.on('error', () => { w.close(); watchers.delete(dir); });
    watchers.set(dir, w);
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch {}
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) add(path.join(dir, entry.name));
    }
  };

  const changed = (dir, name) => {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    if (rel.split(path.sep).some(part => SKIPPED_DIRS.has(part))) return;
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { unwatch(full); }
    if (isDir) add(full);
    else onChange(rel);
  };

  add(root);
  return {
    get size() { return watchers.size; },
    get exhausted() { return exhausted; },
    close() { closed = true; for (const w of watchers.values()) w.close(); watchers.clear(); },
  };
}
