#!/usr/bin/env node
// neon/migrate-audit-log.mjs
// Migration ciblee : cree la table admin_logs si absente.
// Idempotent (peut etre joue plusieurs fois).
// Usage: DATABASE_URL=postgresql://... node neon/migrate-audit-log.mjs

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL manquant');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const statements = [
  `create table if not exists admin_logs (
     id bigserial primary key,
     at timestamptz default now(),
     action text not null,
     cabinet_id text,
     user_sub text default 'admin',
     ip text,
     user_agent text,
     details jsonb
   )`,
  `create index if not exists idx_admin_logs_at on admin_logs(at desc)`,
  `create index if not exists idx_admin_logs_action on admin_logs(action)`,
  `create index if not exists idx_admin_logs_cabinet on admin_logs(cabinet_id) where cabinet_id is not null`,
];

for (const stmt of statements) {
  try {
    await sql.query(stmt);
    console.log('OK:', stmt.split('\n')[0]);
  } catch (err) {
    console.error('FAIL:', stmt.split('\n')[0]);
    throw err;
  }
}

const [{ count }] = await sql`select count(*)::int as count from admin_logs`;
console.log(`admin_logs OK (rows: ${count})`);
