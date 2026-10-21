// LAN access (remote mode "lan"): an HTTPS server on the local network, behind a
// password, for chatting from a phone. It exposes only listing, reading and
// sending chat messages; approvals, payments, settings and files stay on the
// desktop window, and the controller refuses every other human-only method.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual, X509Certificate } from 'node:crypto';
import path from 'node:path';

export const hashPassword = password => {
  if (typeof password !== 'string' || password.length < 10) throw Object.assign(new Error('Password must be at least 10 characters'), { code: 'INVALID_PARAMS' });
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
};
export const checkPassword = (password, stored) => {
  const [, salt, hex] = String(stored || '').split(':');
  if (!salt || !hex || typeof password !== 'string') return false;
  const want = Buffer.from(hex, 'hex');
  return timingSafeEqual(want, scryptSync(password, Buffer.from(salt, 'hex'), want.length));
};

// Self-signed certificate made once with the system openssl; the app shows its fingerprint to compare on the phone.
export function ensureCertificate(dir) {
  const key = path.join(dir, 'lan-key.pem'), cert = path.join(dir, 'lan-cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '825', '-subj', '/CN=bitcode-desktop', '-keyout', key, '-out', cert], { stdio: 'ignore', timeout: 20_000 });
  }
  const pem = readFileSync(cert, 'utf8');
  return { key: readFileSync(key, 'utf8'), cert: pem, fingerprint: new X509Certificate(pem).fingerprint256 };
}

const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };

export function createLanHandler({ invoke, passwordHash, page, script, now = Date.now, sessionMs = 12 * 3600_000 }) {
  const tokens = new Map(), failures = new Map();
  const authed = req => {
    const token = /(?:^|;\s*)bc_lan=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1], at = token && tokens.get(token);
    if (!at || now() - at > sessionMs) { if (token) tokens.delete(token); return false; }
    return true;
  };
  const readBody = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 256 * 1024) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
  });
  const handler = async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
    const url = new URL(req.url, 'https://lan.invalid'), ip = req.socket?.remoteAddress || '?';
    try {
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(page); }
      if (req.method === 'GET' && url.pathname === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(script); }
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const f = failures.get(ip) || { n: 0, until: 0 };
        if (f.until > now()) return json(res, 429, { error: 'Too many attempts: wait a minute' });
        const { password } = await readBody(req);
        if (!checkPassword(password, passwordHash)) { f.n++; if (f.n >= 5) { f.until = now() + 60_000; f.n = 0; } failures.set(ip, f); return json(res, 401, { error: 'Wrong password' }); }
        failures.delete(ip);
        const token = randomBytes(32).toString('hex'); tokens.set(token, now());
        return json(res, 200, { ok: true }, { 'set-cookie': `bc_lan=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionMs / 1000)}` });
      }
      if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
      if (!authed(req)) return json(res, 401, { error: 'Login required' });
      if (req.method === 'POST' && req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return json(res, 403, { error: 'Forbidden origin' });
      if (req.method === 'GET' && url.pathname === '/api/sessions') return json(res, 200, (await invoke('session.list', {})).filter(s => !s.archived).slice(0, 100));
      if (req.method === 'GET' && url.pathname === '/api/session') {
        const s = await invoke('session.open', { sessionId: url.searchParams.get('id') || '' });
        return json(res, 200, { sessionId: s.sessionId, name: s.name, active: s.active, messages: s.messages.filter(m => m.role !== 'tool').slice(-200), pending: s.pending.length });
      }
      if (req.method === 'POST' && url.pathname === '/api/send') {
        const { sessionId, text } = await readBody(req);
        if (typeof text !== 'string' || !text.trim() || text.trim().startsWith('/')) return json(res, 400, { error: 'Only plain messages from LAN access' });
        const r = await invoke('chat.submit', { sessionId, text }, 'remote');
        return json(res, 200, { run: r.run?.runId || null });
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') { tokens.clear(); return json(res, 200, { ok: true }, { 'set-cookie': 'bc_lan=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict' }); }
      return json(res, 404, { error: 'Not found' });
    } catch (e) { return json(res, e.status || ({ NOT_FOUND: 404, BUSY: 409, FORBIDDEN_ORIGIN: 403 }[e.code] || 400), { error: e.message, code: e.code || null }); }
  };
  return { handler, revokeAll: () => tokens.clear() };
}

export function startLanServer({ host, port, tls, ...options }) {
  const { handler, revokeAll } = createLanHandler(options);
  const server = https.createServer({ key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2' }, handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, revokeAll, close: () => new Promise(r => { revokeAll(); server.close(() => r()); server.closeAllConnections?.(); }) }));
  });
}
