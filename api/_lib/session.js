// api/_lib/session.js
// Sign/verify HMAC cookies pour la session admin.
// Format : base64url(JSON.stringify(payload)).base64url(hmacSha256(secret, body))
// Payload : { sub: "admin", iat: number, exp: number }

import crypto from 'node:crypto';

const ALG = 'sha256';
const COOKIE_NAME = 'cm_admin_session';

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function signSession(payload, secret) {
  if (!secret) throw new Error('SESSION_SECRET manquant');
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(crypto.createHmac(ALG, secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64urlEncode(crypto.createHmac(ALG, secret).update(body).digest());
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // expiré
    }
    return payload;
  } catch {
    return null;
  }
}

export function buildSessionCookie(token, ttlSeconds) {
  const isProd = process.env.VERCEL_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${ttlSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
