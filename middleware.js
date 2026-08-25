// middleware.js (racine du projet, runtime Edge Vercel)
// S'execute AVANT chaque Function / page. Responsabilites :
//   - Rate limiting : anti brute-force sur /api/admin-auth et /api/cabinets
//   - Headers CORS serres
//   - Anti-indexation renforcee (X-Robots-Tag)
//
// Limites (par IP, fenetre glissante 10 min) :
//   - /api/admin-auth : 20 hits (login bcrypt ~100ms CPU)
//   - /api/cabinets   : 100 hits (CRUD rapide)
//
// Stockage : Map en memoire. Suffit pour ce projet (~1 admin connu).
// Pour scale-out : brancher Vercel KV ou Upstash Redis.

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT_AUTH = 20;
const LIMIT_CABINETS = 100;
const LIMIT_GEOJSON = 600; // public, autorise plus (cold cache)

const bucket = new Map();

function getClientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function getLimit(pathname) {
  if (pathname === '/api/admin-auth') return LIMIT_AUTH;
  if (pathname === '/api/cabinets') return LIMIT_CABINETS;
  if (pathname === '/api/geojson/cabinets') return LIMIT_GEOJSON;
  return null;
}

function check(ip, limit) {
  const now = Date.now();
  const entry = bucket.get(ip);
  if (!entry || entry.resetAt < now) {
    bucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }
  entry.count++;
  const allowed = entry.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt,
  };
}

// Purge periodique (evite fuite memoire)
let lastPurge = 0;
function maybePurge(now) {
  if (now - lastPurge > WINDOW_MS) {
    lastPurge = now;
    for (const [ip, entry] of bucket) {
      if (entry.resetAt < now) bucket.delete(ip);
    }
  }
}

export const config = {
  matcher: ['/api/:path*', '/admin', '/admin.html', '/admin/:path*'],
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const now = Date.now();
  maybePurge(now);

  // ============================================================
  // Headers commun (toutes les requetes matchees)
  // ============================================================
  const headers = new Headers();
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  // Anti-indexation admin + API
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, noarchive, nosnippet'
    );
    headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );
  } else if (pathname.startsWith('/api/')) {
    headers.set(
      'X-Robots-Tag',
      'noindex, nofollow, noarchive, nosnippet'
    );
  }

  // ============================================================
  // Rate limiting
  // ============================================================
  const ip = getClientIp(req);
  const limit = getLimit(pathname);

  if (limit !== null) {
    const r = check(ip, limit);
    headers.set('X-RateLimit-Limit', String(limit));
    headers.set('X-RateLimit-Remaining', String(r.remaining));
    headers.set(
      'X-RateLimit-Reset',
      String(Math.floor(r.resetAt / 1000))
    );

    if (!r.allowed) {
      const retryAfter = Math.ceil((r.resetAt - now) / 1000);
      headers.set('Retry-After', String(retryAfter));
      headers.set('X-RateLimit-Remaining', '0');
      return new Response(
        JSON.stringify({
          error: 'Trop de requetes. Reessayez dans ' + retryAfter + 's.',
        }),
        {
          status: 429,
          headers,
        }
      );
    }
  }

  // ============================================================
  // Laisser passer, mais enrichir la reponse
  // ============================================================
  const response = new Response(null, { status: 200 });
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const runtime = 'edge';
