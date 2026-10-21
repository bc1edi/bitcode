// LAN access over real HTTPS on loopback: password, cookie session, rate limit, and only chat reading/sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPassword, ensureCertificate, hashPassword, startLanServer } from '../core/lan.mjs';
import { setup, sessionIn } from './helpers.mjs';

const request = (port, method, url, { body, cookie } = {}) => new Promise((resolve, reject) => {
  const req = https.request({ host: '127.0.0.1', port, method, path: url, rejectUnauthorized: false, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } }, res => {
    let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text }));
  });
  req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
});

test('passwords are hashed with scrypt and too-short ones are refused', () => {
  const stored = hashPassword('correct horse battery');
  assert.match(stored, /^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.equal(checkPassword('correct horse battery', stored), true); assert.equal(checkPassword('wrong', stored), false);
  assert.throws(() => hashPassword('short'), /at least 10/);
});

test('LAN server: login, cookie, chat list and send; approvals and commands refused; brute force slowed', async () => {
  const { c, root } = setup();
  const tls = ensureCertificate(mkdtempSync(path.join(tmpdir(), 'bitcode-lan-')));
  const lan = await startLanServer({ host: '127.0.0.1', port: 0, tls, passwordHash: hashPassword('correct horse battery'), page: '<p>ok</p>', script: '', invoke: (m, p, o) => c.invoke(m, p, o) });
  const port = lan.server.address().port;
  try {
    const { s } = await sessionIn(c, root);
    assert.equal((await request(port, 'GET', '/')).status, 200);
    assert.equal((await request(port, 'GET', '/api/sessions')).status, 401);
    assert.equal((await request(port, 'POST', '/api/login', { body: { password: 'nope' } })).status, 401);
    const ok = await request(port, 'POST', '/api/login', { body: { password: 'correct horse battery' } });
    assert.equal(ok.status, 200); assert.match(ok.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
    const cookie = ok.headers['set-cookie'][0].split(';')[0];
    assert.equal((await request(port, 'GET', '/api/sessions', { cookie })).body[0].sessionId, s.sessionId);
    assert.equal((await request(port, 'GET', `/api/session?id=${s.sessionId}`, { cookie })).body.name, s.name);
    assert.equal((await request(port, 'POST', '/api/send', { cookie, body: { sessionId: s.sessionId, text: '/approve x' } })).status, 400);
    await assert.rejects(c.invoke('approval.resolve', { requestId: 'x', digest: 'y', sessionId: s.sessionId, decision: 'approve' }, 'remote'), { code: 'FORBIDDEN_ORIGIN' });
    await assert.rejects(c.invoke('chat.submit', { sessionId: s.sessionId, text: '/approve x' }, 'remote'), { code: 'FORBIDDEN_ORIGIN' });
    assert.equal((await request(port, 'POST', '/api/send', { cookie, body: { sessionId: s.sessionId, text: 'ciao dal telefono' } })).status, 200);
    assert.equal((await c.invoke('session.open', { sessionId: s.sessionId })).messages.at(-1).content, 'ciao dal telefono');
    for (let i = 0; i < 5; i++) await request(port, 'POST', '/api/login', { body: { password: 'bad' } });
    assert.equal((await request(port, 'POST', '/api/login', { body: { password: 'correct horse battery' } })).status, 429);
    assert.equal((await request(port, 'POST', '/api/logout', { cookie })).status, 200);
    assert.equal((await request(port, 'GET', '/api/sessions', { cookie })).status, 401);
  } finally { await lan.close(); c.shutdown(); }
});
