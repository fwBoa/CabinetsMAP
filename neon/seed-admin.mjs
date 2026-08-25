// Cree ou met a jour le hash du mot de passe admin.
// Usage: ADMIN_PASSWORD=... DATABASE_URL=... node neon/seed-admin.mjs

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!DATABASE_URL || !ADMIN_PASSWORD) {
  console.error('Usage: ADMIN_PASSWORD=... DATABASE_URL=... node neon/seed-admin.mjs');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 8) {
  console.error('Le mot de passe doit faire au moins 8 caracteres');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

await sql`
  insert into admin_settings (key, value, updated_at)
  values ('password_hash', ${hash}, now())
  on conflict (key) do update set
    value = excluded.value,
    updated_at = excluded.updated_at;
`;

console.log('Admin password hash updated.');
