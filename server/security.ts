import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

let credentials: { username: string; salt: string; hash: string };
export function getCredentials() {
  if (credentials) return credentials;
  const username = process.env.APP_USERNAME || 'clinician';
  const password = process.env.APP_PASSWORD;
  if (password) {
    if (password.length < 16 || username.includes(':')) throw new Error('APP_PASSWORD must have at least 16 characters; APP_USERNAME cannot contain a colon.');
    const salt = randomBytes(16).toString('hex');
    return credentials = { username, salt, hash: scryptSync(password, salt, 32).toString('hex') };
  }
  const directory = path.resolve('.runtime');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'credentials.json');
  if (fs.existsSync(filename)) return credentials = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const generated = randomBytes(24).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  credentials = { username, salt, hash: scryptSync(generated, salt, 32).toString('hex') };
  fs.writeFileSync(filename, JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'login.txt'), `Username: ${username}\nPassword: ${generated}\n`, { flag: 'wx', mode: 0o600 });
  return credentials;
}

export function clinicianIdentity() {
  return { name: getCredentials().username, role: 'Clinician' };
}

const requests = new Map<string, { count: number; reset: number }>();
export const authenticate: RequestHandler = (req, res, next) => {
  if (res.locals.authenticated) { next(); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) {
    res.status(403).json({ error: 'Only localhost access is supported.' }); return;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
    res.status(403).json({ error: 'Cross-origin access is not allowed.' }); return;
  }
  const now = Date.now();
  for (const [key, value] of requests) if (value.reset < now) requests.delete(key);
  const key = req.socket.remoteAddress || 'local';
  const budget = requests.get(key) || { count: 0, reset: now + 60_000 };
  requests.set(key, budget);
  if (++budget.count > 300) { res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Too many requests. Retry in a minute.' }); return; }
  const stored = getCredentials();
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const separator = supplied.indexOf(':');
  // Hash before comparison so both sides always have the same fixed size.
  const expectedUser = createHash('sha256').update(stored.username).digest();
  const actualUser = createHash('sha256').update(supplied.slice(0, separator)).digest();
  const suppliedHash = scryptSync(supplied.slice(separator + 1, separator + 1025), stored.salt, 32);
  if (separator < 0 || !timingSafeEqual(actualUser, expectedUser) || !timingSafeEqual(suppliedHash, Buffer.from(stored.hash, 'hex'))) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Local discharge workspace", charset="UTF-8"');
    res.status(401).send('Sign in using the credentials in .runtime/login.txt or APP_USERNAME / APP_PASSWORD.'); return;
  }
  res.locals.authenticated = true;
  next();
};
