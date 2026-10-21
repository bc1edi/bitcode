import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup, sessionIn, until } from './helpers.mjs';
import { plansDir } from '../../src/plans.mjs';
import { promptHistory } from '../ui/workbench.js';

test('archived chats keep their data and expiry and can be restored', async () => {
  const { c, root } = setup();
  try {
    const { s } = await sessionIn(c, root);
    const archived = await c.invoke('session.update', { sessionId: s.sessionId, archived: true }, 'ui:1');
    assert.equal(archived.archived, true); assert.equal(archived.expiresAt, s.expiresAt);
    assert.equal((await c.invoke('session.list', {}))[0].archived, true);
    assert.equal((await c.invoke('session.update', { sessionId: s.sessionId, archived: false }, 'ui:1')).archived, false);
  } finally { c.shutdown(); }
});

test('finished runs land in the usage ledger, which survives a restart and filters by period and project', async () => {
  const { c, root, home, workers } = setup();
  try {
    const { p, s } = await sessionIn(c, root);
    await c.invoke('chat.submit', { sessionId: s.sessionId, text: 'work' }, 'ui:1');
    await until(() => workers.length);
    workers[0].onMessage({ type: 'done', answer: 'ok' });
    await until(() => c.activeRuns().length === 0);
    appendFileSync(path.join(home, 'desktop', 'usage.jsonl'), JSON.stringify({ at: Date.now() - 40 * 86_400_000, projectId: 'p_old', model: 'old/model', state: 'error', inputTokens: 5, outputTokens: 5 }) + '\nnot json\n');
    const week = await c.invoke('usage.stats', { days: 7 });
    assert.equal(week.total.runs, 1); assert.equal(week.byProject[0].key, p.projectId); assert.equal(week.byDay.length, 1);
    const all = await c.invoke('usage.stats', { days: 0 });
    assert.equal(all.total.runs, 2); assert.equal(all.total.errors, 1); assert.equal(all.total.inputTokens, 5);
    assert.equal((await c.invoke('usage.stats', { days: 0, projectId: 'p_old' })).total.runs, 1);
    assert.equal((await c.invoke('usage.stats', { days: 12345 })).days, 7);
  } finally { c.shutdown(); }
});

test('project notes and to-dos are human-written and bounded; plans come from /plan files', async () => {
  const { c, root, home } = setup();
  const previous = process.env.BITCODE_HOME; process.env.BITCODE_HOME = home;
  try {
    const { p } = await sessionIn(c, root);
    assert.deepEqual(await c.invoke('notes.get', { projectId: p.projectId }), { text: '', todos: [] });
    await assert.rejects(c.invoke('notes.set', { projectId: p.projectId, text: 'x', todos: [] }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    const saved = await c.invoke('notes.set', { projectId: p.projectId, text: 'idea', todos: [{ text: 'test fee', done: 'yes' }, { text: '   ' }] }, 'ui:1');
    assert.equal(saved.todos.length, 1); assert.equal(saved.todos[0].done, false); assert.ok(saved.todos[0].id);
    assert.equal((await c.invoke('notes.get', { projectId: p.projectId })).text, 'idea');
    await assert.rejects(c.invoke('notes.set', { projectId: p.projectId, text: 'x'.repeat(200_001) }, 'ui:1'), { code: 'INVALID_PARAMS' });
    const dir = plansDir(p.root); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '2026-01-01.md'), '# Add fee estimate\n\nsteps'); writeFileSync(path.join(dir, '2026-02-01.md'), 'no heading');
    const plans = await c.invoke('plans.list', { projectId: p.projectId });
    assert.deepEqual(plans.map(x => x.title), ['2026-02-01.md', 'Add fee estimate']);
  } finally { c.shutdown(); if (previous === undefined) delete process.env.BITCODE_HOME; else process.env.BITCODE_HOME = previous; }
});

test('prompt history lists this chat’s prompts newest first without consecutive repeats', () => {
  assert.deepEqual(promptHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'b' }, { role: 'user', content: 'b' }, { role: 'user', content: ' ' }]), ['b', 'a']);
  assert.deepEqual(promptHistory(undefined), []);
});

test('fork copies a chat, move re-homes it, AI rename and compaction use the chat model without tools', async () => {
  const calls = [];
  const { c, root, workers } = setup({ callModelImpl: async ({ system, messages, tools }) => { calls.push({ system, content: messages[0].content, tools }); return { text: system.startsWith('Write a short title') ? '"Stima delle fee."\nextra' : 'summary of old turns' }; } });
  try {
    const { s } = await sessionIn(c, root);
    await assert.rejects(c.invoke('session.rename.ai', { sessionId: s.sessionId }, 'ui:1'), { code: 'INVALID_PARAMS' });
    for (const [i, text] of ['primo', 'secondo', 'terzo'].entries()) {
      await c.invoke('chat.submit', { sessionId: s.sessionId, text }, 'ui:1');
      await until(() => workers.length === i + 1);
      workers[i].onMessage({ type: 'done', answer: `ok ${i}` });
      await until(() => c.activeRuns().length === 0);
    }
    const renamed = await c.invoke('session.rename.ai', { sessionId: s.sessionId }, 'ui:1');
    assert.equal(renamed.name, 'Stima delle fee');
    const fork = await c.invoke('session.fork', { sessionId: s.sessionId }, 'ui:1');
    assert.match(fork.name, /copia$/);
    assert.equal((await c.invoke('session.open', { sessionId: fork.sessionId })).messages.filter(m => m.role === 'user').length, 3);
    const other = await c.invoke('project.open', { path: mkdtempSync(path.join(tmpdir(), 'bitcode-proj2-')) });
    await assert.rejects(c.invoke('session.move', { sessionId: fork.sessionId, projectId: other.projectId }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    assert.equal((await c.invoke('session.move', { sessionId: fork.sessionId, projectId: other.projectId }, 'ui:1')).projectId, other.projectId);
    assert.equal((await c.invoke('session.open', { sessionId: fork.sessionId })).messages.length > 0, true);
    const compacted = await c.invoke('session.compact', { sessionId: s.sessionId }, 'ui:1');
    assert.equal(compacted.compacted, true);
    const after = (await c.invoke('session.open', { sessionId: s.sessionId })).messages;
    assert.match(after[0].content, /^Earlier conversation summary/); assert.deepEqual(after.filter(m => m.role === 'user').slice(1).map(m => m.content), ['secondo', 'terzo']);
    assert.equal((await c.invoke('session.compact', { sessionId: s.sessionId }, 'ui:1')).compacted, true);
  } finally { c.shutdown(); }
  assert.ok(calls.length >= 2 && calls.every(x => x.tools.length === 0));
});

test('git panel operations: branches, switch, log, show, stash and refusal of unsafe names', async () => {
  const { c, root } = setup();
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
  try {
    const { p } = await sessionIn(c, root);
    git('init', '-q', '-b', 'main'); writeFileSync(path.join(root, 'a.txt'), '1\n'); git('add', '.'); git('commit', '-qm', 'first');
    assert.deepEqual((await c.invoke('git.branches', { projectId: p.projectId })).branches.map(b => b.name), ['main']);
    await assert.rejects(c.invoke('git.checkout', { projectId: p.projectId, branch: '--orphan', create: true }, 'ui:1'), { code: 'INVALID_PARAMS' });
    await c.invoke('git.checkout', { projectId: p.projectId, branch: 'feat/fees', create: true }, 'ui:1');
    assert.equal((await c.invoke('git.branches', { projectId: p.projectId })).current, 'feat/fees');
    const log = await c.invoke('git.log', { projectId: p.projectId });
    assert.equal(log[0].subject, 'first'); assert.match(await c.invoke('git.show', { projectId: p.projectId, hash: log[0].short }), /a\.txt/);
    writeFileSync(path.join(root, 'a.txt'), '2\n');
    await c.invoke('git.stash', { projectId: p.projectId, action: 'push', message: 'wip' }, 'ui:1');
    const stashes = await c.invoke('git.stashes', { projectId: p.projectId });
    assert.equal(stashes.length, 1); assert.match(stashes[0].message, /wip/);
    await assert.rejects(c.invoke('git.stash', { projectId: p.projectId, action: 'pop', ref: 'HEAD; rm -rf' }, 'ui:1'), { code: 'INVALID_PARAMS' });
    await c.invoke('git.stash', { projectId: p.projectId, action: 'pop', ref: stashes[0].ref }, 'ui:1');
    assert.equal(readFileSync(path.join(root, 'a.txt'), 'utf8'), '2\n');
    assert.ok((await c.invoke('fs.files', { projectId: p.projectId })).includes('a.txt'));
    await assert.rejects(c.invoke('git.remote', { projectId: p.projectId, action: 'push' }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
  } finally { c.shutdown(); }
});

test('scheduled tasks validate input, compute the next run and start a manual-mode chat', async () => {
  const { c, root, workers } = setup();
  try {
    const { p } = await sessionIn(c, root);
    await assert.rejects(c.invoke('schedule.save', { projectId: p.projectId, prompt: 'x', every: 'minutely' }, 'ui:1'), { code: 'INVALID_PARAMS' });
    await assert.rejects(c.invoke('schedule.save', { projectId: p.projectId, prompt: 'x', every: 'daily' }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    const t = await c.invoke('schedule.save', { projectId: p.projectId, name: 'Fee report', prompt: 'Riassumi le fee', every: 'daily', at: '07:30' }, 'ui:1');
    const next = new Date(t.nextRunAt); assert.equal(next.getHours(), 7); assert.equal(next.getMinutes(), 30); assert.ok(t.nextRunAt > Date.now());
    const weekly = await c.invoke('schedule.save', { projectId: p.projectId, prompt: 'x', every: 'weekly', weekday: 0, at: '10:00' }, 'ui:1');
    assert.equal(new Date(weekly.nextRunAt).getDay(), 0);
    const started = await c.invoke('schedule.runNow', { id: t.id }, 'ui:1');
    await until(() => workers.length === 1);
    const meta = (await c.invoke('session.list', {})).find(x => x.sessionId === started.sessionId);
    assert.equal(meta.mode, 'manual'); assert.match(meta.name, /^⏰ Fee report/);
    assert.equal((await c.invoke('schedule.list', {})).length, 2);
    await c.invoke('schedule.delete', { id: weekly.id }, 'ui:1');
    assert.equal((await c.invoke('schedule.list', {})).length, 1);
  } finally { c.shutdown(); }
});

test('session goal reaches the worker prompt; snippets are validated settings', async () => {
  const { c, root, workers } = setup();
  try {
    const { s } = await sessionIn(c, root);
    assert.equal((await c.invoke('session.update', { sessionId: s.sessionId, goal: '  Tutti i test verdi  ' }, 'ui:1')).goal, 'Tutti i test verdi');
    await c.invoke('chat.submit', { sessionId: s.sessionId, text: 'vai' }, 'ui:1');
    await until(() => workers.length && workers[0].sent.some(m => m.type === 'start'));
    assert.match(workers[0].sent.find(m => m.type === 'start').systemExtra, /Session goal set by the user.*Tutti i test verdi/);
    await assert.rejects(c.invoke('settings.set', { key: 'snippets', value: [{ name: 'bad name', text: 'x' }] }, 'ui:1'), { code: 'INVALID_PARAMS' });
    assert.equal((await c.invoke('settings.set', { key: 'snippets', value: [{ name: 'fee', text: 'Usa sat/vB' }] }, 'ui:1')).snippets.length, 1);
  } finally { c.shutdown(); }
});

test('MCP catalog adds and removes only its own entry in the shared config', async () => {
  const { c, home } = setup();
  const previous = process.env.BITCODE_HOME; process.env.BITCODE_HOME = home;
  try {
    mkdirSync(home, { recursive: true }); writeFileSync(path.join(home, 'config.json'), JSON.stringify({ model: 'x/y', mcp: { mine: { command: 'keep-me' } } }));
    await assert.rejects(c.invoke('mcp.add', { id: 'memory' }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    await c.invoke('mcp.add', { id: 'memory' }, 'ui:1');
    let cfg = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8'));
    assert.deepEqual(Object.keys(cfg.mcp).sort(), ['memory', 'mine']); assert.equal(cfg.model, 'x/y');
    await c.invoke('mcp.remove', { id: 'memory' }, 'ui:1');
    cfg = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8'));
    assert.deepEqual(cfg.mcp, { mine: { command: 'keep-me' } });
    await assert.rejects(c.invoke('mcp.remove', { id: 'mine' }, 'ui:1'), { code: 'NOT_FOUND' });
  } finally { c.shutdown(); if (previous === undefined) delete process.env.BITCODE_HOME; else process.env.BITCODE_HOME = previous; }
});

test('timeline reverts the file writes of a turn, refusing when a file changed afterwards', async () => {
  const { c, root, workers } = setup();
  const crypto = await import('node:crypto'); const h = t => crypto.createHash('sha256').update(t).digest('hex');
  try {
    const { s } = await sessionIn(c, root);
    writeFileSync(path.join(root, 'keep.txt'), 'old\n');
    const write = async (w, rel, content, base) => { const { result } = await w.request('mutation.acquire', { tool: 'write_file', args: { path: rel, content }, baseVersion: base }); writeFileSync(path.join(root, rel), content); await w.request('mutation.release', { leaseId: result.leaseId }); };
    await c.invoke('chat.submit', { sessionId: s.sessionId, text: 'edit' }, 'ui:1');
    await until(() => workers.length === 1);
    await write(workers[0], 'keep.txt', 'new\n', h('old\n'));
    await write(workers[0], 'added.txt', 'hi\n', null);
    workers[0].onMessage({ type: 'done', answer: 'ok' }); await until(() => c.activeRuns().length === 0);
    const [turn] = await c.invoke('session.timeline', { sessionId: s.sessionId });
    assert.deepEqual(turn.files.map(f => [f.path, f.op, f.changedSince]), [['keep.txt', 'modify', false], ['added.txt', 'create', false]]);
    await assert.rejects(c.invoke('run.revert', { runId: turn.runId }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    writeFileSync(path.join(root, 'keep.txt'), 'edited by hand\n');
    await assert.rejects(c.invoke('run.revert', { runId: turn.runId }, 'ui:1'), { code: 'REVERT_CONFLICT' });
    writeFileSync(path.join(root, 'keep.txt'), 'new\n');
    const reverted = await c.invoke('run.revert', { runId: turn.runId }, 'ui:1');
    assert.equal(reverted.reverted, true);
    assert.equal(readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'old\n'); assert.equal(existsSync(path.join(root, 'added.txt')), false);
    await assert.rejects(c.invoke('run.revert', { runId: turn.runId }, 'ui:1'), { code: 'INVALID_PARAMS' });
  } finally { c.shutdown(); }
});

test('the agent todo list is display-only, redacted, bounded and kept on the chat', async () => {
  const { c, root, workers, events } = setup();
  try {
    const { s } = await sessionIn(c, root);
    await c.invoke('chat.submit', { sessionId: s.sessionId, text: 'plan' }, 'ui:1');
    await until(() => workers.length === 1);
    const res = await workers[0].request('todo.update', { items: [{ text: 'leggi il codice', done: true }, { text: 'scrivi i test' }, { text: ' ' }, ...Array.from({ length: 40 }, (_, i) => ({ text: `x${i}` }))] });
    assert.match(res.result, /1\/30 done/);
    assert.ok(events.some(([ch, p]) => ch === 'session' && p.type === 'todo' && p.data.items.length === 30));
    assert.deepEqual((await c.invoke('session.open', { sessionId: s.sessionId })).todo.slice(0, 2), [{ text: 'leggi il codice', done: true }, { text: 'scrivi i test', done: false }]);
  } finally { c.shutdown(); }
});

test('GitHub issues and pull requests come from the origin remote, with the saved token, read-only', async () => {
  const seen = [];
  const githubFetch = async (url, opts) => { seen.push({ url, auth: opts.headers.authorization }); return { ok: true, json: async () => [
    { number: 7, title: 'Fee estimate is wrong', user: { login: 'a' }, state: 'open', html_url: 'https://github.com/o/r/issues/7', updated_at: '2026-10-01T00:00:00Z', labels: [{ name: 'bug' }] },
    { number: 8, title: 'PR shown as issue', pull_request: {}, html_url: 'https://github.com/o/r/pull/8' }] }; };
  const { c, root } = setup({ githubFetch, secrets: { get: name => (name === 'github' ? 'ghp_test' : undefined) } });
  try {
    const { p } = await sessionIn(c, root);
    assert.deepEqual(await c.invoke('github.items', { projectId: p.projectId }), { repo: null, items: [] });
    execFileSync('git', ['-C', root, 'init', '-q']); execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:o/r.git']);
    const r = await c.invoke('github.items', { projectId: p.projectId });
    assert.equal(r.repo, 'o/r'); assert.deepEqual(r.items.map(x => x.number), [7]); assert.deepEqual(r.items[0].labels, ['bug']);
    assert.equal(seen[0].url, 'https://api.github.com/repos/o/r/issues?state=open&per_page=50'); assert.equal(seen[0].auth, 'Bearer ghp_test');
  } finally { c.shutdown(); }
});

test('fetch, pull and push work against a real (local bare) remote and report ahead/behind', async () => {
  const { c, root } = setup();
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { env }).toString();
  try {
    const bare = mkdtempSync(path.join(tmpdir(), 'bitcode-bare-')), other = mkdtempSync(path.join(tmpdir(), 'bitcode-other-'));
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(root, 'init', '-q', '-b', 'main'); writeFileSync(path.join(root, 'a.txt'), '1\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'one');
    git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-q', '-u', 'origin', 'main');
    const { p } = await sessionIn(c, root);
    writeFileSync(path.join(root, 'a.txt'), '2\n'); git(root, 'commit', '-qam', 'two');
    assert.equal((await c.invoke('git.branches', { projectId: p.projectId })).ahead, 1);
    await c.invoke('git.remote', { projectId: p.projectId, action: 'push' }, 'ui:1');
    assert.equal(git(bare, 'log', '--format=%s', '-1', 'main').trim(), 'two');
    execFileSync('git', ['clone', '-q', bare, other], { env }); writeFileSync(path.join(other, 'b.txt'), 'x\n'); git(other, 'add', '.'); git(other, 'commit', '-qm', 'three'); git(other, 'push', '-q');
    await c.invoke('git.remote', { projectId: p.projectId, action: 'fetch' }, 'ui:1');
    assert.equal((await c.invoke('git.branches', { projectId: p.projectId })).behind, 1);
    await c.invoke('git.remote', { projectId: p.projectId, action: 'pull' }, 'ui:1');
    assert.ok(existsSync(path.join(root, 'b.txt')));
    assert.equal((await c.invoke('git.branches', { projectId: p.projectId })).behind, 0);
  } finally { c.shutdown(); }
});

test('dictation needs an explicit transcription model and honours local-only mode', async () => {
  const seen = [];
  const transcribeFetch = async (url, opts) => { seen.push({ url, model: opts.body.get('model'), size: opts.body.get('file').size }); return { ok: true, json: async () => ({ text: ' ciao mondo ' }) }; };
  const { c } = setup({ transcribeFetch });
  try {
    const audio = Buffer.from('fake-webm').toString('base64');
    await assert.rejects(c.invoke('audio.transcribe', { audio }, 'ui:1'), { code: 'NOT_CONFIGURED' });
    await c.invoke('settings.set', { key: 'transcriptionModel', value: 'ollama/whisper' }, 'ui:1');
    await assert.rejects(c.invoke('audio.transcribe', { audio }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    const r = await c.invoke('audio.transcribe', { audio, lang: 'it' }, 'ui:1');
    assert.equal(r.text, 'ciao mondo'); assert.equal(seen[0].url, 'http://127.0.0.1:11434/v1/audio/transcriptions'); assert.equal(seen[0].model, 'whisper'); assert.equal(seen[0].size, 9);
    await c.invoke('settings.set', { key: 'transcriptionModel', value: 'cloud/whisper-1' }, 'ui:1');
    await c.invoke('settings.set', { key: 'localOnly', value: true }, 'ui:1');
    await assert.rejects(c.invoke('audio.transcribe', { audio }, 'ui:1'), { code: 'LOCAL_ONLY' });
  } finally { c.shutdown(); }
});

test('Hash recommends a remote mode from the given facts; the human applies it through settings', async () => {
  const calls = [];
  const { c } = setup({ callModelImpl: async ({ system, messages }) => { calls.push({ system, content: messages[0].content }); return { text: 'Ecco: {"mode":"ssh","reasons":["nessuna porta aperta"],"risks":["chiavi SSH da proteggere"]}' }; } });
  try {
    await assert.rejects(c.invoke('remote.advice', { facts: {} }, 'worker'), { code: 'FORBIDDEN_ORIGIN' });
    const advice = await c.invoke('remote.advice', { facts: { sshd: true, lan: 1 } }, 'ui:1');
    assert.equal(advice.mode, 'ssh'); assert.deepEqual(advice.reasons, ['nessuna porta aperta']);
    assert.match(calls[0].system, /Verification and security|Review evidence/); assert.match(calls[0].content, /"sshd":true/);
    assert.equal((await c.invoke('settings.get', {})).remoteMode, 'off');
    await assert.rejects(c.invoke('settings.set', { key: 'remoteMode', value: 'internet' }, 'ui:1'), { code: 'INVALID_PARAMS' });
    assert.equal((await c.invoke('settings.set', { key: 'remoteMode', value: 'ssh' }, 'ui:1')).remoteMode, 'ssh');
  } finally { c.shutdown(); }
});

test('GitLab remotes list issues and merge requests with the saved gitlab token', async () => {
  const seen = [];
  const githubFetch = async (url, opts) => { seen.push({ url, token: opts.headers['private-token'] }); return { ok: true, json: async () => [{ iid: 3, title: 'Fee bump', author: { username: 'b' }, state: 'opened', web_url: 'https://gitlab.com/g/sub/r/-/merge_requests/3', updated_at: '2026-10-01T00:00:00Z', labels: ['fees'], draft: true }] }; };
  const { c, root } = setup({ githubFetch, secrets: { get: name => (name === 'gitlab' ? 'glpat-test' : undefined) } });
  try {
    const { p } = await sessionIn(c, root);
    execFileSync('git', ['-C', root, 'init', '-q']); execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'https://gitlab.com/g/sub/r.git']);
    const r = await c.invoke('github.items', { projectId: p.projectId, kind: 'pulls' });
    assert.equal(r.host, 'gitlab'); assert.equal(r.repo, 'g/sub/r'); assert.deepEqual(r.items.map(x => [x.number, x.draft]), [[3, true]]);
    assert.equal(seen[0].url, 'https://gitlab.com/api/v4/projects/g%2Fsub%2Fr/merge_requests?state=opened&per_page=50'); assert.equal(seen[0].token, 'glpat-test');
  } finally { c.shutdown(); }
});
