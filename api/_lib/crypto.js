// api/_lib/crypto.js
// Helpers crypto pour la verif du code d'acces.
// On hash cote serveur le code recu en clair avec SHA-256,
// et on compare avec ADMIN_CODE_HASH (stocke en env var Vercel).

import crypto from 'node:crypto';

export function sha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Verifie un code en clair contre le hash stocke en env var.
// Retourne true si OK, false sinon (inclut le cas env var manquante).
export function verifyAccessCode(code) {
  const expected = process.env.ADMIN_CODE_HASH;
  if (!expected || typeof code !== 'string') return false;
  return safeEqual(sha256(code), expected);
}
