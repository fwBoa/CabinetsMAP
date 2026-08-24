#!/usr/bin/env node
// scripts/validate-cabinets.mjs
// Validation structurelle et semantique de cabinets.geojson.
// Utilise par le workflow GitHub Actions validate-pr pour empecher
// les merges qui casseraient la carte.
//
// Verifie :
// - JSON valide et FeatureCollection
// - Chaque feature a un id unique, un nom, des coordonnees [lon, lat] en France
// - Couleur au format #RRGGBB
// - Emails au format valide si presents
// - Codes departements parmi la liste INSEE (103 depts)
//
// Usage : node scripts/validate-cabinets.mjs [chemin/vers/cabinets.geojson]
// Exit code 0 si OK, 1 sinon.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const FILE = process.argv[2] || resolve(ROOT, 'cabinets.geojson');

// 103 depts francais : 96 metro + 5 DOM + 2 COM
// (meme liste que assets/admin/departements-liste.js, recopiee ici pour
// eviter que ce script depende du bundle admin.)
const VALID_DEPTS = new Set([
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19',
  '2A','2B',
  '21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59',
  '60','61','62','63','64','65','66','67','68','69','70','71','72','73','74','75','76','77','78','79',
  '80','81','82','83','84','85','86','87','88','89','90','91','92','93','94','95',
  '971','972','973','974','976','987','988',
]);

// Bounding box approximative de la France (metro + DOM)
const FRANCE_BOUNDS = {
  // Metro + Corse
  metro: { lonMin: -5, lonMax: 10, latMin: 41, latMax: 51.5 },
  // Guadeloupe / Martinique
  antilles: { lonMin: -62, lonMax: -60, latMin: 14, latMax: 17 },
  // Guyane
  guyane: { lonMin: -55, lonMax: -51, latMin: 2, latMax: 6 },
  // Reunion
  reunion: { lonMin: 55, lonMax: 56, latMax: -20, latMin: -22 },
  // Mayotte
  mayotte: { lonMin: 45, lonMax: 45.5, latMin: -13, latMax: -12.5 },
  // Polynesie (987)
  polynesie: { lonMin: -155, lonMax: -134, latMin: -28, latMax: -7 },
  // Nouvelle-Caledonie (988)
  nouvellecaledonie: { lonMin: 163, lonMax: 169, latMin: -23, latMax: -19 },
};

function inAnyBounds(lon, lat) {
  for (const b of Object.values(FRANCE_BOUNDS)) {
    if (lon >= b.lonMin && lon <= b.lonMax && lat >= b.latMin && lat <= b.latMax) return true;
  }
  return false;
}

const errors = [];
const warnings = [];

function err(feature, msg) {
  const id = feature?.properties?.id || '(sans id)';
  errors.push(`[${id}] ${msg}`);
}
function warn(feature, msg) {
  const id = feature?.properties?.id || '(sans id)';
  warnings.push(`[${id}] ${msg}`);
}

if (!existsSync(FILE)) {
  console.error(`Fichier introuvable : ${FILE}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`JSON invalide : ${e.message}`);
  process.exit(1);
}

if (data.type !== 'FeatureCollection') {
  errors.push(`type attendu 'FeatureCollection', recu '${data.type}'`);
}

if (!Array.isArray(data.features)) {
  errors.push('features[] manquant');
  console.error('=== ERREURS ===');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}

const seenIds = new Set();
let dupIds = 0;

data.features.forEach((f, i) => {
  const ctx = `feature[${i}]`;

  if (!f.properties || typeof f.properties !== 'object') {
    err(f, `${ctx} : properties manquant`);
    return;
  }
  const p = f.properties;

  // id
  if (!p.id || typeof p.id !== 'string') {
    err(f, 'id manquant ou invalide');
  } else {
    if (seenIds.has(p.id)) {
      err(f, `id en double : '${p.id}'`);
      dupIds++;
    }
    seenIds.add(p.id);
  }

  // nom
  if (!p.nom || typeof p.nom !== 'string' || !p.nom.trim()) {
    err(f, 'nom manquant');
  } else if (p.nom.length > 200) {
    err(f, `nom trop long (${p.nom.length} > 200)`);
  }

  // couleur
  if (p.couleur && !/^#[0-9a-fA-F]{6}$/.test(p.couleur)) {
    err(f, `couleur invalide '${p.couleur}' (attendu #RRGGBB)`);
  }

  // emails
  if (Array.isArray(p.emails)) {
    p.emails.forEach(e => {
      if (typeof e !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        err(f, `email invalide '${e}'`);
      }
    });
  } else if (p.emails !== undefined) {
    err(f, 'emails doit etre un tableau');
  }

  // tribunaux / cours_appel
  ['tribunaux', 'cours_appel'].forEach(k => {
    if (p[k] !== undefined && !Array.isArray(p[k])) {
      err(f, `${k} doit etre un tableau`);
    } else if (Array.isArray(p[k])) {
      p[k].forEach(t => {
        if (typeof t !== 'string' || !t.trim()) {
          err(f, `${k} contient une valeur vide`);
        }
      });
    }
  });

  // departements
  if (!Array.isArray(p.departements)) {
    err(f, 'departements doit etre un tableau');
  } else {
    if (p.departements.length === 0) {
      warn(f, 'aucun departement renseigne');
    }
    p.departements.forEach(code => {
      if (!VALID_DEPTS.has(code)) {
        err(f, `code departement inconnu '${code}'`);
      }
    });
  }

  // geometry
  if (!f.geometry || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) {
    err(f, 'geometry doit etre Point avec coordinates[]');
  } else {
    const [lon, lat] = f.geometry.coordinates;
    if (typeof lon !== 'number' || typeof lat !== 'number') {
      err(f, `coordinates invalides [${lon}, ${lat}]`);
    } else if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      err(f, `coordinates hors limites [${lon}, ${lat}]`);
    } else if (!inAnyBounds(lon, lat)) {
      warn(f, `coordinates hors bounding box France [${lon}, ${lat}]`);
    }
  }
});

// Resume
console.log(`Cabinets valides : ${data.features.length - errors.length > 0 ? 'OK' : 'KO'}`);
console.log(`  Features       : ${data.features.length}`);
console.log(`  IDs uniques    : ${seenIds.size}`);
console.log(`  Erreurs        : ${errors.length}`);
console.log(`  Avertissements : ${warnings.length}`);

if (warnings.length) {
  console.log('\n=== AVERTISSEMENTS ===');
  warnings.forEach(w => console.log('  ⚠ ' + w));
}

if (errors.length) {
  console.error('\n=== ERREURS ===');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}

console.log('\n✓ cabinets.geojson est valide.');
