#!/usr/bin/env node
// scripts/test-admin-e2e.mjs
// Tests E2E pour l'espace admin CabinetsMAP.
// Cible : les Vercel Functions en production (ou local via vercel dev).
//
// Couvre :
//   - Authentification (POST password, GET status, DELETE logout)
//   - Liste cabinets (GET /api/cabinets)
//   - Mutation edit (POST action=edit) puis restauration
//   - Mutation add (POST action=add) puis delete (cleanup immediat en DB)
//   - GeoJSON public (/api/geojson/cabinets)
//   - Sanity check HTML (admin.html charge les assets sans 404)
//
// Usage :
//   node scripts/test-admin-e2e.mjs                                  # prod
//   BASE_URL=http://localhost:3000 node scripts/test-admin-e2e.mjs   # local
//   SKIP_MUTATIONS=1 node scripts/test-admin-e2e.mjs                # lecture seule
//
// Variables d'env :
//   BASE_URL          : URL de base (defaut: https://cabinetsmap.vercel.app)
//   ADMIN_PASSWORD    : mot de passe admin (defaut: CGC-EDIT-2026)
//   SKIP_MUTATIONS    : si "1", n'exécute pas les tests destructifs

const BASE_URL = process.env.BASE_URL || 'https://cabinetsmap.vercel.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CGC-EDIT-2026';
const SKIP_MUTATIONS = process.env.SKIP_MUTATIONS === '1';

// === Mini-framework de tests (zero dependances) ===
const results = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  log(`\n\x1b[1m\x1b[34m▶ ${name}\x1b[0m`);
}

function log(msg) {
  console.log(msg);
}

function assert(name, condition, detail = '') {
  const ok = !!condition;
  results.push({ suite: currentSuite, name, ok, detail });
  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const detailStr = detail ? ` — ${detail}` : '';
  log(`  ${icon} ${name}${detailStr}`);
  if (!ok) process.exitCode = 1;
}

async function checkStatus(url, init = {}) {
  const res = await fetch(url, init);
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : null;
  let body;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    status: res.status,
    body,
    cookie,
    setCookieRaw: setCookie,
    headers: res.headers,
  };
}

// === Tests ===

async function testAuth() {
  suite('Authentification');

  // 1. GET status sans cookie
  let r = await checkStatus(`${BASE_URL}/api/admin-auth`);
  assert('GET status sans cookie', r.status === 200 && r.body?.authenticated === false);

  // 2. POST password invalide
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'WRONG-PASSWORD-12345' }),
  });
  assert('POST password invalide → 401', r.status === 401 && r.body?.error);

  // 3. POST password vide → 400
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: '' }),
  });
  assert('POST password vide → 400', r.status === 400 && r.body?.error);

  // 4. PUT method → 405
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'PUT',
  });
  assert('PUT method → 405', r.status === 405);

  // 5. POST password valide → cookie
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  assert('POST password valide → 200 + cookie', r.status === 200 && r.body?.ok && r.cookie);
  const sessionCookie = r.cookie;

  // 6. GET status avec cookie
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    headers: { Cookie: sessionCookie },
  });
  assert('GET status avec cookie', r.status === 200 && r.body?.authenticated === true);

  // 7. DELETE logout
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  });
  assert('DELETE logout → 200', r.status === 200 && r.body?.ok);

  // 8. Le cookie de clear est bien envoyé
  const setCookieRaw = r.setCookieRaw || '';
  assert(
    'DELETE envoie un cookie de clear',
    /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(setCookieRaw),
    setCookieRaw.slice(0, 100)
  );

  // 9. Re-login pour la suite des tests
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  return r.cookie;
}

async function testPublicGeoJson() {
  suite('GeoJSON public (/api/geojson/cabinets)');

  const r = await checkStatus(`${BASE_URL}/api/geojson/cabinets`);
  assert('GET → 200', r.status === 200);
  assert('Type FeatureCollection', r.body?.type === 'FeatureCollection');
  assert('Features array', Array.isArray(r.body?.features));
  assert('Au moins 1 cabinet', (r.body?.features?.length || 0) >= 1,
    `features=${r.body?.features?.length}`);

  // Cache-Control present (60s CDN)
  const cacheControl = r.headers.get('cache-control') || '';
  assert('Cache-Control 60s', /max-age=60/.test(cacheControl), cacheControl);
}

async function testListCabinets(sessionCookie) {
  suite('Liste cabinets (GET /api/cabinets)');

  // 1. Sans cookie → 401
  let r = await checkStatus(`${BASE_URL}/api/cabinets`);
  assert('GET sans cookie → 401', r.status === 401);

  // 2. Avec cookie → 200 + features
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    headers: { Cookie: sessionCookie },
  });
  assert('GET avec cookie → 200', r.status === 200);
  assert('Réponse contient cabinets[]', Array.isArray(r.body?.cabinets));
  assert('Au moins 1 cabinet', (r.body?.count || 0) >= 1, `count=${r.body?.count}`);

  return r.body?.cabinets || [];
}

async function testEdit(sessionCookie, cabinets) {
  if (SKIP_MUTATIONS) {
    suite('Mutation edit (SKIP_MUTATIONS=1)');
    log('  ⊘ skip');
    return null;
  }

  suite('Mutation edit (POST action=edit)');
  const target = cabinets[0];
  const originalCouleur = target.properties?.couleur || '#1e3a5f';
  const newCouleur = '#10b981';

  const r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: {
        id: target.properties.id,
        properties: { couleur: newCouleur },
      },
    }),
  });

  assert('edit → 200 + ok', r.status === 200 && r.body?.ok, `status=${r.status}`);
  assert('edit merged=true', r.body?.merged === true);
  assert(
    'La nouvelle couleur est dans la réponse',
    r.body?.cabinets?.find?.((c) => c.properties.id === target.properties.id)
      ?.properties?.couleur === newCouleur
  );

  return {
    cabinetId: target.properties.id,
    originalCouleur,
    newCouleur,
  };
}

async function testRestore(sessionCookie, editResult) {
  if (SKIP_MUTATIONS || !editResult) return;
  suite('Restore après edit');

  const r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: {
        id: editResult.cabinetId,
        properties: { couleur: editResult.originalCouleur },
      },
    }),
  });

  assert(
    'restore → couleur d\'origine',
    r.body?.cabinets?.find?.((c) => c.properties.id === editResult.cabinetId)
      ?.properties?.couleur === editResult.originalCouleur
  );
}

async function testAddAndDelete(sessionCookie) {
  if (SKIP_MUTATIONS) {
    suite('Mutation add+delete (SKIP_MUTATIONS=1)');
    log('  ⊘ skip');
    return;
  }

  suite('Mutation add + delete (cycle complet)');
  // ID numerique avec Date.now() complet (13 chiffres) pour eviter les collisions
  // aux runs rapproches. Suffixe ajoute pour traçabilite.
  const TEST_ID = `cabinet-${Date.now()}-t`;

  // 1. ADD
  let r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add',
      payload: {
        id: TEST_ID,
        nom: 'Cabinet test E2E',
        adresse: '42 Rue de Test - 75000 PARIS',
        phone: '01.23.45.67.89',
        emails: ['test@e2e.fr'],
        departements: ['75'],
        tribunaux: ['PARIS'],
        cours_appel: ['PARIS'],
        couleur: '#1e3a5f',
      },
    }),
  });
  assert(`add (${TEST_ID}) → 200 + ok`, r.status === 200 && r.body?.ok);
  assert('Le cabinet apparaît dans la réponse',
    r.body?.cabinets?.some?.((c) => c.properties.id === TEST_ID));

  // 2. DELETE (cleanup immediat)
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      payload: { id: TEST_ID },
    }),
  });
  assert(`delete (${TEST_ID}) → 200 + ok`, r.status === 200 && r.body?.ok);
  assert('Le cabinet n\'est plus dans la réponse',
    !r.body?.cabinets?.some?.((c) => c.properties.id === TEST_ID));

  // 3. DELETE sur ID inexistant → 404 (graceful)
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      payload: { id: 'cabinet-inexistant' },
    }),
  });
  log(`  ℹ delete cabinet inexistant → status=${r.status}`);
  assert('delete inexistant → pas de 500', r.status !== 500);
}

// Regresion : apres tous les tests, on doit avoir EXACTEMENT 13 cabinets
// canoniques en base (pas de pollution par les tests add/delete).
async function testNoTestPollution(sessionCookie) {
  suite('Regresion — pas de pollution par les tests');

  const r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    headers: { Cookie: sessionCookie },
  });
  assert('GET → 200', r.status === 200);

  const cabinets = r.body?.cabinets || [];
  const idPattern = /^cabinet-\d{2}$/; // EXACTEMENT cabinet-NN avec 2 chiffres
  const polluted = cabinets.filter(c => !idPattern.test(c.properties.id));

  assert(
    `Exactement 13 cabinets canoniques (vu ${cabinets.length})`,
    cabinets.length === 13,
    cabinets.map(c => c.properties.id).join(',')
  );
  assert(
    `Aucun cabinet pollue par les tests (vu ${polluted.length})`,
    polluted.length === 0,
    polluted.map(c => c.properties.id).join(',')
  );
}

async function testHtmlSanity() {
  suite('Sanity check HTML admin.html');

  const res = await fetch(`${BASE_URL}/admin.html`);
  const html = await res.text();

  assert('admin.html → 200', res.status === 200);

  const assetFiles = [
    'assets/admin/api.js',
    'assets/admin/auth.js',
    'assets/admin/cabinets.js',
    'assets/admin/styles.css',
  ];

  for (const js of assetFiles) {
    const present = html.includes(js);
    assert(`admin.html référence ${js}`, present);
  }

  for (const js of assetFiles) {
    const r = await fetch(`${BASE_URL}/${js}`);
    assert(`${js} → 200`, r.status === 200);
  }

  // Pas de mention "code d'accès" (on utilise "mot de passe")
  assert('Mention "mot de passe" présente', /mot de passe/i.test(html));
  assert('Pas de mention "code d\'accès"', !/code d.accès/i.test(html));
}

// Regression : charge "Chargement des cabinets…" qui restait visible après login.
// Cause : `.admin-list__loading { display:flex }` surchargeait `[hidden]{display:none}`.
// Test : verifie que la regle `[hidden]{display:none}` est bien dans la CSS servie.
async function testListLoadingHiddenCss() {
  suite('Regresssion CSS — #listLoading[hidden] vraiment masque');

  const res = await fetch(`${BASE_URL}/assets/admin/styles.css`);
  assert('styles.css → 200', res.status === 200);

  const css = await res.text();

  // Regles critiques ajoutees dans le fix commit 974e834
  assert(
    'CSS : .admin-list__loading[hidden] { display: none }',
    /\.admin-list__loading\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/.test(css)
  );
  assert(
    'CSS : .admin-list__empty[hidden] { display: none }',
    /\.admin-list__empty\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/.test(css)
  );
  assert(
    'CSS : .admin-list__items[hidden] { display: none }',
    /\.admin-list__items\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/.test(css)
  );

  // Sanity : la regle display:flex existe toujours (sinon regression inverse)
  assert(
    'CSS : .admin-list__loading garde display:flex',
    /\.admin-list__loading\s*\{[^}]*display\s*:\s*flex/.test(css)
  );
}

// Regression : chargement visible meme apres loadCabinets().finally.
// Verifie que l'attribut HTML `hidden` est pose sur #listLoading cote serveur.
async function testListLoadingHtmlMarkup() {
  suite('Regresssion HTML — #listLoading declare en [hidden] dans admin.html');

  const res = await fetch(`${BASE_URL}/admin.html`);
  const html = await res.text();

  // L'element #listLoading doit avoir l'attribut hidden dans le HTML statique.
  // Regex tolerant aux espaces et sauts de ligne.
  const re = /id=["']listLoading["'][^>]*hidden|hidden[^>]*id=["']listLoading["']/;
  assert(
    '#listLoading a l\'attribut HTML hidden',
    re.test(html),
    html.match(/<div[^>]*listLoading[^>]*>/)?.[0]?.slice(0, 120) ?? 'absent'
  );

  // Et pas de `display:flex !important` ou hack qui resurpasserait [hidden]
  assert(
    'Pas de hack display:flex sur listLoading',
    !/listLoading[^}]*display\s*:\s*flex\s*!important/i.test(html)
  );
}

// Regression anti-indexation : admin + carte doivent rester noindex.
async function testRobotsAndHeaders() {
  suite('Anti-indexation (robots.txt + headers)');

  // robots.txt -> Disallow: /
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  const robots = await robotsRes.text();
  assert('robots.txt → 200', robotsRes.status === 200);
  assert('robots.txt contient "Disallow: /"',
    /Disallow:\s*\/\s*$/m.test(robots) || robots.includes('Disallow: /'),
    robots.split('\n').slice(0, 3).join(' | '));

  // Bots IA bloques
  for (const bot of ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider']) {
    const botLine = new RegExp(`User-agent:\\s*${bot}[\\s\\S]{0,200}Disallow:\\s*/`, 'i');
    assert(`robots.txt bloque ${bot}`, botLine.test(robots));
  }

  // admin.html -> X-Robots-Tag noindex
  const adminHead = await fetch(`${BASE_URL}/admin.html`, { method: 'HEAD' });
  const xRobotsAdmin = adminHead.headers.get('x-robots-tag') || '';
  assert('admin.html : X-Robots-Tag noindex',
    /noindex/.test(xRobotsAdmin), xRobotsAdmin);

  // / (carte) -> X-Robots-Tag noindex aussi
  const indexHead = await fetch(`${BASE_URL}/`, { method: 'HEAD' });
  const xRobotsIndex = indexHead.headers.get('x-robots-tag') || '';
  assert('Carte / : X-Robots-Tag noindex',
    /noindex/.test(xRobotsIndex), xRobotsIndex);

  // carte -> meta robots noindex dans le HTML
  const indexHtml = await (await fetch(`${BASE_URL}/`)).text();
  assert('Carte : meta robots noindex',
    /<meta\s+name=["']robots["']\s+content=["']noindex/i.test(indexHtml));
}

// Regression : rate limit sur /api/admin-auth et /api/cabinets.
async function testRateLimit() {
  suite('Rate limit (middleware.js)');

  // Verifie que les headers X-RateLimit-* sont exposes
  const r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'WRONG-PWD-RATE-LIMIT-TEST' }),
  });
  assert('POST auth expose X-RateLimit-Limit',
    r.headers.get('x-ratelimit-limit') !== null,
    r.headers.get('x-ratelimit-limit'));
  assert('POST auth expose X-RateLimit-Remaining',
    r.headers.get('x-ratelimit-remaining') !== null);

  // Le endpoint public geoJSON a un seuil plus eleve
  const g = await checkStatus(`${BASE_URL}/api/geojson/cabinets`);
  assert('GET /api/geojson expose aussi X-RateLimit-Limit',
    g.headers.get('x-ratelimit-limit') !== null);

  // On ne declenche PAS le 429 dans cette suite (risque de bloquer les tests suivants)
  // Mais on verifie qu'au moins 1 hit ne depasse pas la limite.
  assert('POST auth avec mdp invalide → 401 (sous la limite)',
    r.status === 401, `status=${r.status}`);
}

// Regression : payload abuse vers l'API ne doit pas polluer la DB
async function testServerValidation(sessionCookie) {
  suite('Validation serveur (anti-XSS payload abuse)');

  // ID invalide (pas cabinet-NN)
  let r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'evil-id"; DROP TABLE cabinets;--', properties: { nom: 'x' } }
    }),
  });
  assert('ID avec injection SQL → 400', r.status === 400, `status=${r.status}`);

  // couleur invalide
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'cabinet-01', properties: { couleur: 'javascript:alert(1)' } }
    }),
  });
  assert('Couleur "javascript:..." → 400', r.status === 400, `status=${r.status}`);

  // departement invalide
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'cabinet-01', properties: { departements: ['<script>', '99', '971'] } }
    }),
  });
  assert('Deps avec <script> + 99 (invalide) + 971 → sanitized = 200',
    r.status === 200, `status=${r.status}`);

  // nom trop court
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'cabinet-01', properties: { nom: 'a' } }
    }),
  });
  assert('nom="a" (1 char) → 400', r.status === 400, `status=${r.status}`);
}

// Regression : table admin_logs creee et alimentee.
async function testAuditLogSchema(sessionCookie) {
  if (SKIP_MUTATIONS) {
    suite('Audit log schema (SKIP_MUTATIONS=1)');
    log('  ⊘ skip');
    return;
  }
  suite('Audit log (table admin_logs)');

  // Verifie qu'apres une mutation, on peut lire la table via le cookie admin
  // (on ne sait pas SELECT directement sans endpoint, donc on verifie juste
  // qu'aucune mutation ne casse avec un message lie aux logs)
  const r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'GET',
    headers: { Cookie: sessionCookie },
  });
  assert('GET apres mutations ne casse pas',
    r.status === 200 && r.body?.count >= 1, `status=${r.status}`);
}

// === Main ===
async function main() {
  log(`\x1b[1mCabinetsMAP — Tests E2E admin (Neon + Vercel Functions)\x1b[0m`);
  log(`  URL        : ${BASE_URL}`);
  log(`  Password   : ${ADMIN_PASSWORD ? '***' + ADMIN_PASSWORD.slice(-4) : '(non fourni)'}`);
  log(`  Mutations  : ${SKIP_MUTATIONS ? 'désactivées' : 'activées'}`);

  const start = Date.now();

  try {
    await testHtmlSanity();
    await testListLoadingHiddenCss();
    await testListLoadingHtmlMarkup();
    await testRobotsAndHeaders();
    await testRateLimit();
    await testPublicGeoJson();

    const sessionCookie = await testAuth();
    const cabinets = await testListCabinets(sessionCookie);

    await testServerValidation(sessionCookie);

    const editResult = await testEdit(sessionCookie, cabinets);
    await testRestore(sessionCookie, editResult);
    await testAddAndDelete(sessionCookie);
    await testAuditLogSchema(sessionCookie);
    await testNoTestPollution(sessionCookie);
  } catch (err) {
    log(`\n\x1b[31m✗ Erreur fatale : ${err.message}\x1b[0m`);
    log(err.stack);
    process.exitCode = 1;
  }

  // === Résumé ===
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = total - passed;
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  log(`\n\x1b[1m=== Résumé ===\x1b[0m`);
  log(`  Total   : ${total}`);
  log(`  Passés  : \x1b[32m${passed}\x1b[0m`);
  log(`  Échoués : \x1b[${failed > 0 ? '31' : '32'}${failed}\x1b[0m`);
  log(`  Durée   : ${duration}s`);

  if (failed > 0) {
    log(`\n\x1b[31mÉchecs :\x1b[0m`);
    for (const r of results.filter(r => !r.ok)) {
      log(`  ✗ [${r.suite}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    process.exitCode = 1;
  }

  log('');
  process.exit(process.exitCode || 0);
}

main();
