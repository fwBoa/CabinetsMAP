#!/usr/bin/env node
// scripts/bust-cache.mjs
// Ajoute ?v=<hash> aux <script src="..."> et <link href="..."> dans admin.html
// pour forcer le navigateur a re-telecharger JS + CSS quand leur contenu change.
//
// Execute automatiquement par Vercel avant chaque deploy (vercel.json buildCommand).
// Peut aussi etre lance manuellement : node scripts/bust-cache.mjs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HTML_PATH = resolve(ROOT, 'admin.html');

if (!existsSync(HTML_PATH)) {
  console.error(`[bust-cache] admin.html introuvable : ${HTML_PATH}`);
  process.exit(1);
}

// Liste complete : tous les JS + CSS charges par admin.html.
// Note : ne PAS mettre assets/styles.css ici (il est inline dans index.html
// via build_index.py). Ici on gere uniquement les assets/admin/*.
const ASSETS = [
  'assets/admin/api.js',
  'assets/admin/auth.js',
  'assets/admin/cabinets.js',
  'assets/admin/departements-liste.js',
  'assets/admin/departements-picker.js',
  'assets/admin/styles.css',
];

let html = readFileSync(HTML_PATH, 'utf8');
let updated = 0;

for (const assetPath of ASSETS) {
  const absPath = resolve(ROOT, assetPath);
  if (!existsSync(absPath)) {
    console.warn(`[bust-cache] Fichier absent, skip : ${assetPath}`);
    continue;
  }
  const content = readFileSync(absPath);
  // Hash court (8 chars) suffisant pour ce besoin
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  const versionedPath = `${assetPath}?v=${hash}`;

  // Detecte si c'est un script ou un link CSS
  const escapedPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pour <script> : remplace le src, preserve le reste
  const scriptRe = new RegExp(
    `(<script\\s+src=["'])${escapedPath}(\\?v=[a-f0-9]+)?(["'])`,
    'g'
  );
  // Pour <link rel="stylesheet"> : remplace le href, preserve le rel.
  // IMPORTANT : on capture tout ce qui precede href (peut etre absent) pour
  // que le remplacement garde le rel. Sinon le CSS devient un <link> sans
  // stylesheet et le navigateur ignore la ressource (bug vecu en prod le 26/08/2026).
  const linkRe = new RegExp(
    `(<link[^>]*?)(href=["'])${escapedPath}(\\?v=[a-f0-9]+)?(["'])`,
    'g'
  );

  const before = html;
  html = html.replace(scriptRe, `$1${versionedPath}$3`);
  // Pour le link, on garantit rel="stylesheet" dans le remplacement
  html = html.replace(linkRe, (match, prefix, hrefAttr, version, endQuote) => {
    // Si rel manque dans prefix, on le rajoute
    const hasRel = /rel\s*=\s*["']stylesheet["']/i.test(prefix);
    const relPart = hasRel ? '' : ' rel="stylesheet"';
    return `${prefix}${relPart} ${hrefAttr}${versionedPath}${endQuote}`;
  });

  if (html !== before) {
    updated++;
    console.log(`[bust-cache] ${assetPath} -> ${versionedPath}`);
  }
}

if (updated > 0) {
  writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`[bust-cache] admin.html mis a jour (${updated} assets)`);
} else {
  console.log('[bust-cache] Aucun changement (hash identiques)');
}
