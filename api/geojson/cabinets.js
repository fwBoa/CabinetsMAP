// api/geojson/cabinets.js
// Genere le GeoJSON public des cabinets a la volee depuis Neon.
// Endpoint public, sans auth, mis en cache courte duree par Vercel CDN.

import { getSql } from '../_lib/db.js';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    const sql = getSql();
    const rows = await sql`select * from cabinets order by id`;

    const geojson = {
      type: 'FeatureCollection',
      features: rows.map(rowToFeature),
    };

    res.setHeader('Content-Type', 'application/geo+json');
    // Cache CDN 60 secondes (les mutations admin sont immediates mais on evite de frapper la DB)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).end(JSON.stringify(geojson, null, 2));
  } catch (err) {
    console.error('geojson/cabinets error', err);
    res.status(500).json({ error: 'Generation impossible', detail: err.message });
  }
}
