// Importe cabinets.geojson et departements.geojson dans Neon.
// Usage: DATABASE_URL=... node neon/import-cabinets.mjs

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL manquant');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function run() {
  const cabinetsGeo = JSON.parse(readFileSync(join(root, 'cabinets.geojson'), 'utf8'));
  const deptsGeo = JSON.parse(readFileSync(join(root, 'departements.geojson'), 'utf8'));

  // Import cabinets
  for (const feature of cabinetsGeo.features) {
    const p = feature.properties;
    const [lon, lat] = feature.geometry?.coordinates || [null, null];

    await sql`
      insert into cabinets (
        id, nom, adresse, phone, emails, tribunaux, cours_appel,
        departements, couleur, badges, display_name, place_id,
        longitude, latitude
      ) values (
        ${p.id}, ${p.nom}, ${p.adresse || null}, ${p.phone || null},
        ${p.emails || []}, ${p.tribunaux || []}, ${p.cours_appel || []},
        ${p.departements || []}, ${p.couleur}, ${p.badges || []},
        ${p.display_name || ''}, ${p.place_id || null},
        ${lon}, ${lat}
      )
      on conflict (id) do update set
        nom = excluded.nom,
        adresse = excluded.adresse,
        phone = excluded.phone,
        emails = excluded.emails,
        tribunaux = excluded.tribunaux,
        cours_appel = excluded.cours_appel,
        departements = excluded.departements,
        couleur = excluded.couleur,
        badges = excluded.badges,
        display_name = excluded.display_name,
        place_id = excluded.place_id,
        longitude = excluded.longitude,
        latitude = excluded.latitude;
    `;
    console.log('imported', p.id, p.nom);
  }

  // Import departements
  for (const feature of deptsGeo.features) {
    const code = feature.properties?.code;
    const nom = feature.properties?.nom;
    const region = feature.properties?.region;
    if (!code || !nom) continue;

    await sql`
      insert into departements (code, nom, region, geometry)
      values (${code}, ${nom}, ${region || null}, ${JSON.stringify(feature.geometry)}::jsonb)
      on conflict (code) do update set
        nom = excluded.nom,
        region = excluded.region,
        geometry = excluded.geometry;
    `;
  }

  const counts = await sql`select (select count(*) from cabinets) as cabinets, (select count(*) from departements) as departements`;
  console.log('Done:', counts[0]);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
