// api/admin-auth.js
// Endpoint d'authentification admin.
// POST { code: string } -> 200 + cookie session si OK, 401 sinon.
// DELETE -> 200 + clear cookie (logout).
// GET -> 200 { authenticated: boolean } pour verifier la session.

import { verifyAccessCode } from './_lib/crypto.js';
import {
  signSession,
  verifySession,
  buildSessionCookie,
  buildClearCookie,
  SESSION_COOKIE_NAME,
} from './_lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(/;\s*/);
  for (const part of parts) {
    const [k, ...v] = part.split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function ttlSeconds() {
  const raw = process.env.ADMIN_SESSION_TTL_SECONDS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 28800; // 8h par defaut
}

export default async function handler(req, res) {
  // CORS minimaliste (meme origine en pratique, mais on accepte GET depuis le frontend)
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

  // Lecture body JSON
  let body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(res, 400, { error: 'Body JSON invalide' });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!code) {
    return json(res, 400, { error: 'Code manquant' });
  }

  if (!verifyAccessCode(code)) {
    // Reponse generique pour ne pas confirmer/infirmer l'existence du hash
    return json(res, 401, { error: 'Code invalide' });
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = ttlSeconds();
  const token = signSession(
    { sub: 'admin', iat: now, exp: now + ttl },
    process.env.SESSION_SECRET
  );

  res.setHeader('Set-Cookie', buildSessionCookie(token, ttl));
  return json(res, 200, { ok: true, user: 'admin', expiresIn: ttl });
}
