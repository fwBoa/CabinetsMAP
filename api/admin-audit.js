// api/admin-audit.js
// Renvoie les dernieres entrees du journal d'audit.
// Endpoint debug : reserve a l'admin authentifie.

import { getSql } from './_lib/db.js';
import { readCookie } from './_lib/_util.js';
import { verifySession, SESSION_COOKIE_NAME } from './_lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requireAuth(req, res) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  const session = verifySession(token, process.env.SESSION_SECRET);
  if (!session) {
    json(res, 401, { error: 'Non authentifie' });
    return null;
  }
  return session;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAuth(req, res)) return;

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

  try {
    const sql = getSql();
    const rows = await sql`
      select id, at, action, cabinet_id, ip, user_agent, details
      from admin_logs
      order by at desc
      limit ${limit}
    `;
    return json(res, 200, { count: rows.length, entries: rows });
  } catch (err) {
    console.error('admin-audit error', err);
    return json(res, 500, { error: 'Lecture impossible', detail: err.message });
  }
}
