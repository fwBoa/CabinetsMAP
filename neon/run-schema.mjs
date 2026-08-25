// Execute schema.sql sur Neon.
// Usage: DATABASE_URL=... node neon/run-schema.mjs

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL manquant');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

// Split schema into top-level blocks separated by blank lines and comments.
// Each block is a complete SQL command (CREATE TABLE, CREATE FUNCTION, etc.).
const statements = schema
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(/\n\s*\n/)
  .map(s => s.replace(/\n+/g, ' ').trim())
  .filter(s => s.length > 0)
  .map(s => s.endsWith(';') ? s : s + ';');

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  try {
    await sql.query(stmt);
  } catch (err) {
    console.error(`Failed on statement ${i + 1}:`);
    console.error(stmt);
    throw err;
  }
}
console.log('Schema applied successfully');
