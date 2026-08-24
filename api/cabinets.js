// api/cabinets.js
// Endpoint CRUD pour les cabinets (admin seulement).
// GET : retourne la liste des cabinets (lecture seule depuis GitHub raw)
// POST { action, payload } : edit/add/delete via PR auto
//
// Toutes les mutations passent par une PR qu'un humain doit merger.

import { readCookie } from './_lib/_util.js';
import { verifySession, SESSION_COOKIE_NAME } from './_lib/session.js';
import {
  getFile,
  getMainSha,
  createBranch,
  commitFile,
  createPullRequest,
  normalizeCabinet,
  applyMutation,
  branchNameFor,
  commitTitleFor,
} from './_lib/github.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requireAuth(req, res) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  const session = verifySession(token, process.env.SESSION_SECRET);
  if (!session) { json(res, 401, { error: 'Non authentifié' }); return null; }
  return session;
}

function requireGithubToken(res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { json(res, 500, { error: 'GITHUB_TOKEN manquant côté serveur' }); return null; }
  return token;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('Body vide');
  return JSON.parse(raw);
}

// === GET : liste ===
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'GET') {
    // Lecture autorisee pour les utilisateurs authentifies
    if (!requireAuth(req, res)) return;
    try {
      const file = await getFile('cabinets.geojson', process.env.GITHUB_TOKEN);
      const geojson = JSON.parse(file.content);
      return json(res, 200, {
        cabinets: geojson.features || [],
        sha: file.sha,
        count: (geojson.features || []).length,
      });
    } catch (err) {
      return json(res, 500, { error: 'Lecture impossible', detail: err.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Méthode non autorisée' });
  }

  if (!requireAuth(req, res)) return;
  const ghToken = requireGithubToken(res);
  if (!ghToken) return;

  // Lecture + validation body
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
    // 1. Charger le fichier courant
    const file = await getFile('cabinets.geojson', ghToken);
    const geojson = JSON.parse(file.content);

    // 2. Construire le payload normalisé pour la mutation
    let mutationPayload;
    if (action === 'edit' || action === 'add') {
      // Pour edit : on garde id + geometry du cabinet existant
      const existing = action === 'edit'
        ? geojson.features.find(f => f.properties?.id === payload.id)
        : null;
      const normalized = normalizeCabinet(payload.properties || payload);
      if (action === 'edit') {
        if (!payload.id) return json(res, 400, { error: 'id requis pour edit' });
        if (!existing) return json(res, 400, { error: `Cabinet ${payload.id} introuvable` });
        mutationPayload = { id: payload.id, properties: normalized };
      } else {
        mutationPayload = {
          properties: normalized,
          geometry: existing?.geometry,
        };
      }
    } else if (action === 'delete') {
      if (!payload.id) return json(res, 400, { error: 'id requis pour delete' });
      mutationPayload = { id: payload.id };
    }

    // 3. Appliquer la mutation
    const { features, name, newId: createdId } = applyMutation(geojson, action, mutationPayload);
    const newGeojson = { ...geojson, features };

    // 4. Préparer branche + commit + PR
    const branchName = branchNameFor(action, name);
    const title = commitTitleFor(action, name);
    const mainSha = await getMainSha(ghToken);
    await createBranch(branchName, mainSha, ghToken);
    await commitFile(
      'cabinets.geojson',
      JSON.stringify(newGeojson, null, 2) + '\n',
      title,
      branchName,
      file.sha,
      ghToken
    );

    // 5. Ouvrir PR
    const prBody = [
      `**Action** : \`${action}\``,
      `**Cabinet** : ${name}`,
      createdId ? `**Nouvel ID** : \`${createdId}\`` : '',
      '',
      'Créé automatiquement depuis l\'espace admin. À merger après review.',
    ].filter(Boolean).join('\n');

    const pr = await createPullRequest({
      title,
      body: prBody,
      head: branchName,
      base: process.env.GITHUB_DEFAULT_BRANCH,
    }, ghToken);

    return json(res, 200, {
      ok: true,
      action,
      name,
      newId: createdId || null,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branch: branchName,
    });
  } catch (err) {
    if (err.status === 422 && /Reference already exists/i.test(err.message || '')) {
      return json(res, 409, { error: 'Une PR existe déjà pour cette modification (réessaie dans 1 minute).' });
    }
    if (err.status === 401) {
      return json(res, 500, { error: 'Token GitHub invalide côté serveur. Révoque et régénère le PAT.' });
    }
    if (err.status === 404 && action === 'edit') {
      return json(res, 404, { error: 'Cabinet introuvable (id peut-être modifié entre-temps).' });
    }
    return json(res, 500, { error: 'Mutation impossible', detail: err.message });
  }
}
