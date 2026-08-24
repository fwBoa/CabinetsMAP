// api/_lib/github.js
// Wrapper minimaliste pour l'API GitHub.
// Gere : lecture du fichier, creation de branche, commit, PR.
// Tout est serveur-only (le token ne quitte jamais Vercel).

import { Buffer } from 'node:buffer';

const API = 'https://api.github.com';

function authHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'cabinetsmap-admin',
  };
}

async function ghFetch(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// === Lecture ===
export async function getFile(path, token) {
  const data = await ghFetch(`/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/contents/${encodeURI(path)}?ref=${process.env.GITHUB_DEFAULT_BRANCH}`, {}, token);
  return {
    sha: data.sha,
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    path: data.path,
  };
}

// === Refs ===
export async function getMainSha(token) {
  const data = await ghFetch(`/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/git/ref/heads/${process.env.GITHUB_DEFAULT_BRANCH}`, {}, token);
  return data.object.sha;
}

export async function createBranch(branchName, fromSha, token) {
  return ghFetch(
    `/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/git/refs`,
    { method: 'POST', body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }) },
    token
  );
}

// === Commit fichier ===
export async function commitFile(path, content, message, branch, sha, token) {
  return ghFetch(
    `/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/contents/${encodeURI(path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        sha,
        committer: {
          name: 'CabinetsMAP Admin',
          email: 'admin@cabinetsmap.local',
        },
        author: {
          name: 'CabinetsMAP Admin',
          email: 'admin@cabinetsmap.local',
        },
      }),
    },
    token
  );
}

// === PR ===
export async function createPullRequest({ title, body, head, base }, token) {
  return ghFetch(
    `/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({ title, body, head, base, maintainer_can_modify: true }),
    },
    token
  );
}

// === Validation du cabinet ===
// Normalise et valide les champs d'un cabinet avant commit.
export function normalizeCabinet(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Cabinet invalide');
  }
  const nom = String(input.nom || '').trim();
  if (!nom) throw new Error('Le nom du cabinet est obligatoire');
  if (nom.length > 200) throw new Error('Le nom dépasse 200 caractères');

  return {
    nom,
    adresse: String(input.adresse || '').trim(),
    phone: String(input.phone || '').trim(),
    emails: Array.isArray(input.emails) ? input.emails.map(String).filter(Boolean) : [],
    tribunaux: Array.isArray(input.tribunaux) ? input.tribunaux.map(String).filter(Boolean) : [],
    cours_appel: Array.isArray(input.cours_appel) ? input.cours_appel.map(String).filter(Boolean) : [],
    departements: Array.isArray(input.departements) ? input.departements.map(String).filter(Boolean) : [],
    couleur: /^#[0-9a-fA-F]{6}$/.test(input.couleur) ? input.couleur : '#1e3a5f',
    badges: Array.isArray(input.badges) ? input.badges : [],
    display_name: String(input.display_name || '').trim(),
    place_id: Number.isInteger(input.place_id) ? input.place_id : null,
  };
}

// === Mutation du FeatureCollection ===
export function applyMutation(geojson, action, payload) {
  if (!geojson || geojson.type !== 'FeatureCollection') {
    throw new Error('GeoJSON invalide');
  }
  const features = Array.isArray(geojson.features) ? [...geojson.features] : [];

  if (action === 'edit') {
    const idx = features.findIndex(f => f.properties && f.properties.id === payload.id);
    if (idx === -1) throw new Error(`Cabinet ${payload.id} introuvable`);
    features[idx] = {
      ...features[idx],
      properties: { ...features[idx].properties, ...payload.properties, id: payload.id },
    };
    return { features, name: features[idx].properties.nom };
  }

  if (action === 'add') {
    const newId = 'cabinet-' + String(Date.now()).slice(-6) + '-' + Math.random().toString(36).slice(2, 6);
    const feature = {
      type: 'Feature',
      properties: { ...payload.properties, id: newId },
      geometry: payload.geometry || { type: 'Point', coordinates: [2.2137, 46.2276] }, // centre France par défaut
    };
    features.push(feature);
    return { features, name: payload.properties.nom, newId };
  }

  if (action === 'delete') {
    const idx = features.findIndex(f => f.properties && f.properties.id === payload.id);
    if (idx === -1) throw new Error(`Cabinet ${payload.id} introuvable`);
    const removed = features.splice(idx, 1)[0];
    return { features, name: removed.properties.nom };
  }

  throw new Error(`Action inconnue: ${action}`);
}

// === Format de la branche et du commit/PR ===
export function branchNameFor(action, cabinetName) {
  const slug = (cabinetName || 'cabinet')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `admin/${action}-${slug || 'cabinet'}-${ts}`;
}

export function commitTitleFor(action, cabinetName) {
  return `feat(cabinets): ${action} ${cabinetName || 'cabinet'}`;
}
