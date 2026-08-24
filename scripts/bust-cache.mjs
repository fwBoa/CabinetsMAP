#!/usr/bin/env node
// scripts/bust-cache.mjs
// Ajoute ?v=<hash> aux <script src="assets/admin/*.js"> dans admin.html
// pour forcer le navigateur a re-telecharger les scripts quand le contenu change.
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

// Liste des scripts a hasher
const SCRIPTS = [
  'assets/admin/api.js',
  'assets/admin/auth.js',
  'assets/admin/cabinets.js',
];

let html = readFileSync(HTML_PATH, 'utf8');
let updated = 0;

for (const scriptPath of SCRIPTS) {
  const absPath = resolve(ROOT, scriptPath);
  if (!existsSync(absPath)) {
    console.warn(`[bust-cache] Fichier absent, skip : ${scriptPath}`);
    continue;
  }
  const content = readFileSync(absPath);
  // Hash court (8 chars) suffisant pour ce besoin
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  const versionedPath = `${scriptPath}?v=${hash}`;

  // Regex pour matcher : <script src="<scriptPath>" ...> (peut deja avoir ?v=)
  // On remplace par la version avec hash frais
  const escapedPath = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<script\\s+src=["']${escapedPath}(\\?v=[a-f0-9]+)?["']`,
    'g'
  );

  const before = html;
  html = html.replace(regex, `<script src="${versionedPath}"`);

  if (html !== before) {
    updated++;
    console.log(`[bust-cache] ${scriptPath} -> ${versionedPath}`);
  }
}

if (updated > 0) {
  writeFileSync(HTML_PATH, html, 'utf8');
  console.log(`[bust-cache] admin.html mis a jour (${updated} scripts)`);
} else {
  console.log('[bust-cache] Aucun changement (hash identiques)');
}
