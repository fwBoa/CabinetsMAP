// api/admin-history.js
// Historique des modifications cabinets + connexions admin sur les N derniers jours.
// Fenetre par defaut : 30 jours glissants.
// Reserve a l'admin authentifie (cookie session).

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

  // Fenetre en jours (defaut 30, min 1, max 365)
  const daysRaw = parseInt(req.query.days, 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  try {
    const sql = getSql();
    // On recupere les events triés du plus recent au plus ancien,
    // joints au nom du cabinet si cabinet_id present (pour l'affichage).
    const rows = await sql`
      select
        l.id,
        l.at,
        l.action,
        l.cabinet_id,
        l.user_sub,
        l.ip,
        l.user_agent,
        l.details,
        c.nom as cabinet_nom
      from admin_logs l
      left join cabinets c on c.id = l.cabinet_id
      where l.at >= now() - (${days} || ' days')::interval
      order by l.at desc
      limit ${limit}
    `;
    return json(res, 200, {
      days,
      count: rows.length,
      entries: rows,
    });
  } catch (err) {
    console.error('admin-history error', err);
    return json(res, 500, { error: 'Lecture impossible', detail: err.message });
  }
}