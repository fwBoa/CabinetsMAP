// api/cabinets.js
// Endpoint CRUD direct sur Neon (Postgres).
// GET : liste des cabinets (auth admin)
// POST { action, payload } : edit/add/delete en base (auth admin)

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
  if (!session) { json(res, 401, { error: 'Non authentifie' }); return null; }
  return session;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('Body vide');
  return JSON.parse(raw);
}

function rowToFeature(row) {
  return {
    type: 'Feature',
    properties: {
      id: row.id,
      nom: row.nom,
      adresse: row.adresse,
      phone: row.phone,
      emails: row.emails || [],
      tribunaux: row.tribunaux || [],
      cours_appel: row.cours_appel || [],
      departements: row.departements || [],
      couleur: row.couleur,
      badges: row.badges || [],
      display_name: row.display_name,
      place_id: row.place_id,
    },
    geometry: {
      type: 'Point',
      coordinates: row.longitude != null && row.latitude != null
        ? [Number(row.longitude), Number(row.latitude)]
        : null,
    },
  };
}

// === GET : liste ===
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    try {
      const sql = getSql();
      const rows = await sql`select * from cabinets order by id`;
      return json(res, 200, {
        cabinets: rows.map(rowToFeature),
        count: rows.length,
      });
    } catch (err) {
      console.error('cabinets GET error', err);
      return json(res, 500, { error: 'Lecture impossible', detail: err.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Methode non autorisee' });
  }

  if (!requireAuth(req, res)) return;

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return json(res, 400, { error: 'Body JSON invalide', detail: e.message }); }

  const { action, payload } = body;
  if (!['edit', 'add', 'delete'].includes(action)) {
    return json(res, 400, { error: 'Action invalide (edit, add, delete)' });
  }
  if (!payload || typeof payload !== 'object') {
    return json(res, 400, { error: 'Payload manquant' });
  }

  try {
    const sql = getSql();

    if (action === 'edit') {
      if (!payload.id) return json(res, 400, { error: 'id requis pour edit' });

      const [existing] = await sql`select * from cabinets where id = ${payload.id}`;
      if (!existing) return json(res, 404, { error: `Cabinet ${payload.id} introuvable` });

      const props = payload.properties || payload;
      const merged = {
        nom: props.nom ?? existing.nom,
        adresse: props.adresse ?? existing.adresse,
        phone: props.phone ?? existing.phone,
        emails: props.emails ?? existing.emails,
        tribunaux: props.tribunaux ?? existing.tribunaux,
        cours_appel: props.cours_appel ?? existing.cours_appel,
        departements: props.departements ?? existing.departements,
        couleur: props.couleur ?? existing.couleur,
        badges: props.badges ?? existing.badges,
        display_name: props.display_name ?? existing.display_name,
        place_id: props.place_id ?? existing.place_id,
        longitude: props.longitude ?? existing.longitude,
        latitude: props.latitude ?? existing.latitude,
      };

      await sql`
        update cabinets set
          nom = ${merged.nom},
          adresse = ${merged.adresse},
          phone = ${merged.phone},
          emails = ${merged.emails},
          tribunaux = ${merged.tribunaux},
          cours_appel = ${merged.cours_appel},
          departements = ${merged.departements},
          couleur = ${merged.couleur},
          badges = ${merged.badges},
          display_name = ${merged.display_name},
          place_id = ${merged.place_id},
          longitude = ${merged.longitude},
          latitude = ${merged.latitude}
        where id = ${payload.id}
      `;

      const rows = await sql`select * from cabinets order by id`;
      return json(res, 200, {
        ok: true,
        action,
        id: payload.id,
        merged: true,
        cabinets: rows.map(rowToFeature),
        count: rows.length,
      });
    }

    if (action === 'add') {
      const props = payload.properties || payload;
      const id = props.id || `cabinet-${Date.now()}`;

      await sql`
        insert into cabinets (
          id, nom, adresse, phone, emails, tribunaux, cours_appel,
          departements, couleur, badges, display_name, place_id,
          longitude, latitude
        ) values (
          ${id}, ${props.nom}, ${props.adresse || null}, ${props.phone || null},
          ${props.emails || []}, ${props.tribunaux || []}, ${props.cours_appel || []},
          ${props.departements || []}, ${props.couleur || '#1e3a5f'}, ${props.badges || []},
          ${props.display_name || ''}, ${props.place_id || null},
          ${props.longitude ?? null}, ${props.latitude ?? null}
        )
      `;

      const rows = await sql`select * from cabinets order by id`;
      return json(res, 200, {
        ok: true,
        action,
        id,
        cabinets: rows.map(rowToFeature),
        count: rows.length,
      });
    }

    if (action === 'delete') {
      if (!payload.id) return json(res, 400, { error: 'id requis pour delete' });
      await sql`delete from cabinets where id = ${payload.id}`;

      const rows = await sql`select * from cabinets order by id`;
      return json(res, 200, {
        ok: true,
        action,
        id: payload.id,
        cabinets: rows.map(rowToFeature),
        count: rows.length,
      });
    }
  } catch (err) {
    console.error('cabinets mutation error', err);
    return json(res, 500, { error: 'Mutation impossible', detail: err.message });
  }
}
