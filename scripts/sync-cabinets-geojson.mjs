// scripts/sync-cabinets-geojson.mjs
// Synchronise cabinets.geojson LOCAL depuis Neon (source de verite).
//
// Pourquoi : avant ce script, cabinets.geojson etait edite a la main et
// pouvait deriver silencieusement de Neon. Maintenant Neon est la seule
// source de verite et ce script regenere le miroir local a la demande.
//
// Usage :
//   node scripts/sync-cabinets-geojson.mjs                 # utilise prod
//   BASE_URL=https://... node scripts/sync-cabinets-geojson.mjs
//
// Securite : aucun cabinet du fichier local n'est conserve ; on ecrase
// integralement avec la liste Neon. Pas de fusion, pas d'heuristique.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'cabinets.geojson');

const BASE_URL = process.env.BASE_URL || 'https://cabinetsmap.vercel.app';

async function main() {
  const url = `${BASE_URL}/api/geojson/cabinets?sync=${Date.now()}`;
  console.log(`[sync] GET ${url}`);
  const r = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (!r.ok) {
    console.error(`[sync] HTTP ${r.status} -> abandon`);
    process.exit(1);
  }
  const data = await r.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    console.error('[sync] Reponse invalide (pas un FeatureCollection)');
    process.exit(1);
  }

  // On retire les champs derives du runtime (display_name, place_id, geometry
  // issus du geocodage) pour garder un fichier commit-able lisible et stable.
  const clean = {
    type: 'FeatureCollection',
    features: data.features.map((f) => ({
      type: 'Feature',
      properties: {
        id: f.properties.id,
        nom: f.properties.nom,
        adresse: f.properties.adresse,
        phone: f.properties.phone,
        emails: f.properties.emails || [],
        tribunaux: f.properties.tribunaux || [],
        cours_appel: f.properties.cours_appel || [],
        departements: f.properties.departements || [],
        couleur: f.properties.couleur,
        badges: f.properties.badges || [],
      },
      geometry: f.geometry && f.geometry.coordinates
        ? f.geometry
        : { type: 'Point', coordinates: null },
    })),
  };

  writeFileSync(OUT, JSON.stringify(clean, null, 2) + '\n', 'utf-8');
  console.log(`[sync] OK ${clean.features.length} cabinets ecrits -> ${OUT}`);
}

main().catch((err) => {
  console.error('[sync] crash:', err);
  process.exit(2);
});