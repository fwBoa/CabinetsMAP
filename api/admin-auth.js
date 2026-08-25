// api/admin-auth.js
// Auth admin : mot de passe unique stocke dans Neon (bcrypt).
// POST { password: string } -> 200 + cookie session si OK.
// DELETE -> logout.
// GET -> status session.

import bcrypt from 'bcryptjs';
import { getSql } from './_lib/db.js';
import {
  signSession,
  verifySession,
  buildSessionCookie,
  buildClearCookie,
  SESSION_COOKIE_NAME,
} from './_lib/session.js';
import { readCookie } from './_lib/_util.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function ttlSeconds() {
  const raw = process.env.ADMIN_SESSION_TTL_SECONDS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 28800; // 8h
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'GET') {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    const payload = verifySession(token, process.env.SESSION_SECRET);
    return json(res, 200, { authenticated: !!payload, user: payload?.sub || null });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildClearCookie());
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Méthode non autorisée' });
  }

  let body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(res, 400, { error: 'Body JSON invalide' });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) {
    return json(res, 400, { error: 'Mot de passe manquant' });
  }

  function readIp(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      'unknown'
    );
  }

  async function audit(action) {
    try {
      const sql = getSql();
      await sql`insert into admin_logs (action, ip, user_agent)
                values (${action}, ${readIp(req)}, ${(req.headers['user-agent'] || '').slice(0, 200)})`;
    } catch (e) {
      console.error('audit log failed', e.message);
    }
  }

  try {
    const sql = getSql();
    const rows = await sql`select value from admin_settings where key = 'password_hash'`;
    const hash = rows[0]?.value;
    if (!hash || !bcrypt.compareSync(password, hash)) {
      await audit('login_fail');
      return json(res, 401, { error: 'Mot de passe invalide' });
    }
    await audit('login');

    const now = Math.floor(Date.now() / 1000);
    const ttl = ttlSeconds();
    const token = signSession(
      { sub: 'admin', iat: now, exp: now + ttl },
      process.env.SESSION_SECRET
    );

    res.setHeader('Set-Cookie', buildSessionCookie(token, ttl));
    return json(res, 200, { ok: true, user: 'admin', expiresIn: ttl });
  } catch (err) {
    console.error('admin-auth error', err);
    return json(res, 500, { error: 'Erreur interne' });
  }
}
