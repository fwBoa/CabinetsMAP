// api/_lib/db.js
// Client Neon partage pour les Vercel Functions.

import { neon } from '@neondatabase/serverless';

let _sql = null;

export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL manquant');
    _sql = neon(url);
  }
  return _sql;
}
