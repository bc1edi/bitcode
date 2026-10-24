// Records desktop walkthroughs from the real app. Raw frames stay outside the website.
//   node site/scripts/demos/desktop/record.mjs <capture-root> <scenario> [...]
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, repo } from './rig.mjs';
import { scenarios } from './scenarios.mjs';

const [output, ...names] = process.argv.slice(2);
if (!output || !names.length) throw new Error(`Usage: record.mjs <capture-root> <${Object.keys(scenarios).join('|')}>...`);
const root = path.resolve(output);
if (root === repo || root.startsWith(repo + path.sep)) throw new Error('Keep raw captures outside the repository.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim();
const workingTreeModified = execFileSync('git', ['status', '--porcelain', 'desktop', 'src'], { cwd: repo }).toString().trim() !== '';

for (const name of names) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown scenario ${name}`);
  const session = await launch({ name, ...scenario.launch });
  const dir = path.join(root, name);
  try {
    await session.record(dir);
    await scenario.run(session);
  } catch (error) {
    await session.win.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
    await session.app.close().catch(() => {});
    throw error;
  }
  await session.stop({ id: name, title: scenario.title, model: scenario.model || null, provenance: scenario.provenance, posterAt: session.posterAt ?? null, loopFrom: session.loopFrom ?? null, loopTo: session.loopTo ?? null, sourceCommit, workingTreeModified });
  console.log(`${name}: ${session.frames.length} frames → ${dir}`);
}
