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

function readIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

async function auditLog(sql, action, cabinetId, req, details = null) {
  try {
    await sql`insert into admin_logs (action, cabinet_id, ip, user_agent, details)
              values (${action}, ${cabinetId}, ${readIp(req)}, ${(req.headers['user-agent'] || '').slice(0, 200)}, ${JSON.stringify(details)})`;
  } catch (err) {
    // ne pas casser la requete principale si l'audit log echoue
    console.error('audit log failed', err.message);
  }
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

// === Validation stricte (defense en profondeur contre payloads abuses) ===
const RE_CABINET_ID = /^cabinet-[0-9]+$/;
const RE_DEPT_CODE = /^(0[1-9]|[1-8][0-9]|9[0-5]|97[1-6])$/; // 01..95 + 971..976
const RE_EMAIL = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const RE_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// Telephone : accepte chiffres, espaces, +, ., -, (, ), X (masque de cabinets)
// Exemples valides : "04.94.XX.XX.XX", "+33 6 12 34 56 78", "01 23 45 67 89"
const RE_TEL = /^[+()0-9 \-.\sXx]{6,30}$/;

// Coupe a N caracteres max pour empecher payload mega-mega
function trimStr(v, max = 200) {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) : v;
}
function sanitizeStrArray(arr, max = 50, itemMax = 200) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === 'string')
    .slice(0, max)
    .map((s) => trimStr(s, itemMax));
}
function sanitizeEmails(arr) {
  const clean = sanitizeStrArray(arr, 10, 200);
  return clean.filter((e) => RE_EMAIL.test(e));
}
function sanitizeDepartements(arr) {
  const clean = sanitizeStrArray(arr, 50, 5);
  return clean.filter((d) => RE_DEPT_CODE.test(d));
}
function validateProperties(props) {
  if (!props || typeof props !== 'object') {
    return { error: 'properties manquant' };
  }
  if (typeof props.nom === 'string' && props.nom.trim().length < 2) {
    return { error: 'nom trop court (2+ caracteres)' };
  }
  if (props.couleur !== undefined && !RE_HEX_COLOR.test(props.couleur)) {
    return { error: 'couleur invalide (attendu #RRGGBB)' };
  }
  if (props.phone !== undefined && props.phone !== null && props.phone !== '' && !RE_TEL.test(props.phone)) {
    return { error: 'telephone invalide' };
  }
  if (props.emails !== undefined && !Array.isArray(props.emails)) {
    return { error: 'emails doit etre un tableau' };
  }
  if (props.departements !== undefined && !Array.isArray(props.departements)) {
    return { error: 'departements doit etre un tableau' };
  }
  return { ok: true };
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
      if (!RE_CABINET_ID.test(payload.id)) return json(res, 400, { error: 'id invalide (format cabinet-NN)' });

      const [existing] = await sql`select * from cabinets where id = ${payload.id}`;
      if (!existing) return json(res, 404, { error: `Cabinet ${payload.id} introuvable` });

      const props = payload.properties || payload;
      const v = validateProperties(props);
      if (v.error) return json(res, 400, { error: v.error });

      // Sanitize : applique les filtres stricts avant merge
      const merged = {
        nom: trimStr(props.nom ?? existing.nom),
        adresse: trimStr(props.adresse ?? existing.adresse, 300),
        phone: trimStr(props.phone ?? existing.phone, 30),
        emails: Array.isArray(props.emails) ? sanitizeEmails(props.emails) : existing.emails,
        tribunaux: Array.isArray(props.tribunaux) ? sanitizeStrArray(props.tribunaux, 50, 80) : existing.tribunaux,
        cours_appel: Array.isArray(props.cours_appel) ? sanitizeStrArray(props.cours_appel, 20, 80) : existing.cours_appel,
        departements: Array.isArray(props.departements) ? sanitizeDepartements(props.departements) : existing.departements,
        couleur: props.couleur ?? existing.couleur,
        badges: Array.isArray(props.badges) ? sanitizeStrArray(props.badges, 20, 50) : existing.badges,
        display_name: trimStr(props.display_name ?? existing.display_name, 200),
        place_id: trimStr(props.place_id ?? existing.place_id, 200),
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

      // Construit le diff avant/apres pour l'audit (sera consomme par
      // la vue historique pour afficher chaque changement comme dans
      // la preview de la sheet).
      const AUDIT_FIELDS = ['nom', 'adresse', 'phone', 'emails', 'tribunaux', 'cours_appel', 'departements', 'couleur'];
      const diff = {};
      for (const k of AUDIT_FIELDS) {
        const b = existing[k];
        const a = merged[k];
        if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) {
          diff[k] = { before: b ?? null, after: a ?? null };
        }
      }

      const rows = await sql`select * from cabinets order by id`;
      await auditLog(sql, 'edit', payload.id, req, { nom: merged.nom, diff });
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
      // Priorite : payload.id > payload.properties.id > auto-genere.
      // Note : le frontend admin envoie payload.id directement (pas via properties).
      const id = payload.id || props.id || `cabinet-${Date.now()}`;
      if (!RE_CABINET_ID.test(id)) return json(res, 400, { error: 'id invalide (format cabinet-NN)' });

      const v = validateProperties(props);
      if (v.error) return json(res, 400, { error: v.error });
      if (typeof props.nom !== 'string' || props.nom.trim().length < 2) {
        return json(res, 400, { error: 'nom requis (2+ caracteres)' });
      }

      const clean = {
        nom: trimStr(props.nom),
        adresse: trimStr(props.adresse || null, 300),
        phone: trimStr(props.phone || null, 30),
        emails: sanitizeEmails(props.emails || []),
        tribunaux: sanitizeStrArray(props.tribunaux || [], 50, 80),
        cours_appel: sanitizeStrArray(props.cours_appel || [], 20, 80),
        departements: sanitizeDepartements(props.departements || []),
        couleur: props.couleur || '#1e3a5f',
        badges: sanitizeStrArray(props.badges || [], 20, 50),
        display_name: trimStr(props.display_name || '', 200),
        place_id: trimStr(props.place_id || null, 200),
      };

      await sql`
        insert into cabinets (
          id, nom, adresse, phone, emails, tribunaux, cours_appel,
          departements, couleur, badges, display_name, place_id,
          longitude, latitude
        ) values (
          ${id}, ${clean.nom}, ${clean.adresse}, ${clean.phone},
          ${clean.emails}, ${clean.tribunaux}, ${clean.cours_appel},
          ${clean.departements}, ${clean.couleur}, ${clean.badges},
          ${clean.display_name}, ${clean.place_id},
          ${props.longitude ?? null}, ${props.latitude ?? null}
        )
      `;

      const rows = await sql`select * from cabinets order by id`;
      // Snapshot des champs crees (pour la vue historique)
      const addedDiff = {};
      const ADD_FIELDS = ['nom', 'adresse', 'phone', 'emails', 'tribunaux', 'cours_appel', 'departements', 'couleur'];
      for (const k of ADD_FIELDS) {
        const v = clean[k];
        const isEmpty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
        if (!isEmpty) addedDiff[k] = { before: null, after: v };
      }
      await auditLog(sql, 'add', id, req, { nom: clean.nom, diff: addedDiff });
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
      if (!RE_CABINET_ID.test(payload.id)) return json(res, 400, { error: 'id invalide' });

      // Snapshot avant delete pour pouvoir montrer ce qui a ete supprime
      // dans l'historique.
      const [existing] = await sql`select * from cabinets where id = ${payload.id}`;
      await sql`delete from cabinets where id = ${payload.id}`;

      const rows = await sql`select * from cabinets order by id`;
      let deleteDiff = null;
      if (existing) {
        deleteDiff = {};
        const DEL_FIELDS = ['nom', 'adresse', 'phone', 'emails', 'tribunaux', 'cours_appel', 'departements', 'couleur'];
        for (const k of DEL_FIELDS) {
          const v = existing[k];
          const isEmpty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
          if (!isEmpty) deleteDiff[k] = { before: v, after: null };
        }
      }
      await auditLog(sql, 'delete', payload.id, req, {
        nom: existing ? existing.nom : null,
        diff: deleteDiff,
      });
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
