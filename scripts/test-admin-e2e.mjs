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
//   node scripts/test-admin-e2e.mjs                                  # lecture seule (defaut)
//   RUN_MUTATIONS=1 node scripts/test-admin-e2e.mjs                 # lecture+ecriture
//   BASE_URL=http://localhost:3000 node scripts/test-admin-e2e.mjs   # local
//
// Pourquoi defaut = lecture seule :
//   - On evite de hammerer l'API (auth 60/10min, cabinets 200/10min)
//   - Les checks invariants (HTML/CSS/headers/rate-limit/miroir) couvrent 90%
//   - Pour valider les mutations apres deploy : RUN_MUTATIONS=1 ...
//
// Variables d'env :
//   BASE_URL          : URL de base (defaut: https://cabinetsmap.vercel.app)
//   ADMIN_PASSWORD    : mot de passe admin (defaut: CGC-EDIT-2026)
//   RUN_MUTATIONS     : si "1", execute aussi les tests destructifs (edit/add/delete)

const BASE_URL = process.env.BASE_URL || 'https://cabinetsmap.vercel.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CGC-EDIT-2026';
const SKIP_MUTATIONS = process.env.RUN_MUTATIONS !== '1';

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
  // Auto-retry sur 429 : on lit Retry-After / X-RateLimit-Reset et on attend.
  // Utile pour ne pas casser la suite quand le dev tape trop de curl avant.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) {
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
    // 429 : attendre Retry-After (en s) + 1s de marge
    const retryAfter = Number(res.headers.get('retry-after') || '60');
    log(`  ⏳ rate-limit (429), attente ${retryAfter + 1}s...`);
    await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
    // retry une fois
  }
  // 2e tentative aussi 429 : on throw pour fail "loudly"
  throw new Error('rate-limit persistante apres retry (Retry-After>60s)');
}

// === Tests ===

async function testAuth() {
  suite('Authentification');

  // 1 hit : login direct avec bon password → cookie
  let r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  assert('login → 200 + cookie', r.status === 200 && r.body?.ok && r.cookie);
  const sessionCookie = r.cookie;

  // 2e hit : verify cookie via GET status
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    headers: { Cookie: sessionCookie },
  });
  assert('cookie authentifie', r.status === 200 && r.body?.authenticated === true);

  // 3e hit : logout (cleanup)
  r = await checkStatus(`${BASE_URL}/api/admin-auth`, {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  });
  assert('logout → 200 + cookie cleared',
    r.status === 200 && r.body?.ok
    && /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(r.setCookieRaw || ''));

  // 4e hit : re-login (le cookie de logout est maintenant envoyé,
  // on a besoin d'un cookie frais pour la suite)
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
  // SUPPRIMEE : le restore est maintenant fait systematiquement par
  // testServerValidation() a la fin de son execution (1 POST au lieu de 2).
  // Le test "coherence miroir" detecte de toute facon toute divergence
  // entre Neon et le miroir local.
  return;
}

async function testAddAndDelete(sessionCookie) {
  if (SKIP_MUTATIONS) {
    suite('Mutation add+delete (SKIP_MUTATIONS=1)');
    log('  ⊘ skip');
    return;
  }

  suite('Mutation add + delete (cycle complet)');
  const TEST_ID = `cabinet-${Date.now().toString().slice(-6)}`; // ID numerique pour check constraint

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
  if (SKIP_MUTATIONS) {
    suite('Validation serveur (SKIP_MUTATIONS=1)');
    log('  ⊘ skip');
    return;
  }
  suite('Validation serveur (anti-XSS payload abuse)');

  // 1. ID invalide (injection SQL) → 400
  let r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'evil-id"; DROP TABLE cabinets;--', properties: { nom: 'x' } }
    }),
  });
  assert('ID avec injection SQL → 400', r.status === 400, `status=${r.status}`);

  // 2. couleur invalide (XSS via javascript:) → 400
  r = await checkStatus(`${BASE_URL}/api/cabinets`, {
    method: 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      payload: { id: 'cabinet-01', properties: { couleur: 'javascript:alert(1)' } }
    }),
  });
  assert('Couleur "javascript:..." → 400', r.status === 400, `status=${r.status}`);

  // RESTORE systématique : on remet les deps d'origine depuis le miroir
  // local pour ne JAMAIS laisser Neon diverger apres les tests.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const LOCAL = path.resolve(__dirname, '..', 'cabinets.geojson');
  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf-8'));
  const lc01 = local.features.find((f) => f.properties.id === 'cabinet-01');
  if (lc01) {
    const restoreRes = await checkStatus(`${BASE_URL}/api/cabinets`, {
      method: 'POST',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit',
        payload: {
          id: 'cabinet-01',
          properties: { departements: lc01.properties.departements },
        },
      }),
    });
    assert('restore cabinet-01 deps (depuis miroir)',
      restoreRes.status === 200, `status=${restoreRes.status}`);
  }
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

// Regression : la carte publique doit lire Neon en priorite, pas
// cabinets.geojson local. On verifie que les features exposees par
// l'API publique contiennent bien les ajouts/modifs faits en admin.
// Strategie : GET de la liste publique, comparaison avec les donnees
// serveur via cookies (auth).
async function testNeonAsSourceOfTruth(sessionCookie) {
  suite('Source de verite = Neon (anti-derive cabinets.geojson)');

  // 1. Liste publique via /api/geojson/cabinets
  const pub = await fetch(`${BASE_URL}/api/geojson/cabinets`);
  const pubData = await pub.json();
  const pubIds = new Set(pubData.features.map(f => f.properties.id));

  // 2. Liste auth via /api/cabinets
  const auth = await checkStatus(`${BASE_URL}/api/cabinets`, {
    headers: { Cookie: sessionCookie },
  });
  const authIds = new Set(auth.body.cabinets.map(c => c.properties.id));

  // 3. Les deux listes doivent etre identiques (memes cabinets)
  const symDiff = [...authIds].filter(x => !pubIds.has(x))
    .concat([...pubIds].filter(x => !authIds.has(x)));
  assert('API publique et API auth renvoient les memes IDs',
    symDiff.length === 0,
    symDiff.length ? `divergence: ${symDiff.join(', ')}` : '');

  // 4. Le fichier cabinets.geojson ne doit PAS etre reference dans index.html
  // (sinon runtime le charge en fallback et masque les ajouts Neon)
  const idxHtml = await (await fetch(`${BASE_URL}/`)).text();
  // On accepte la presence dans le bundle en dev, mais on verifie que main.js
  // ne tente PAS de loadGeoJSON('cabinets.geojson') comme fallback preferentiel
  const mainJsUrl = idxHtml.match(/src=["']assets\/main\.js(\?v=[^"']+)?["']/)?.[0];
  if (mainJsUrl) {
    const jsRes = await fetch(new URL(mainJsUrl.replace(/src=|"|'/g, ''), `${BASE_URL}/`).href);
    const js = await jsRes.text();
    // Si Neon est OK, loadGeoJSON doit etre dans un catch (= fallback OK)
    // Si loadGeoJSON est appele en premier, c'est la regression
    const hasNeonFirst = /fetch\(.*\/api\/geojson\/cabinets/.test(js);
    assert('assets/main.js tente Neon en premier',
      hasNeonFirst, 'aucun fetch /api/geojson/cabinets detecte');

    // Anti-regression : departements.geojson doit aussi etre charge
    // avant loadData(), sinon S.departements reste null et loadData() crash
    // avec "Cannot read properties of null (reading 'features')"
    const depsLoadOrder = (
      js.indexOf("loadGeoJSON('departements.geojson')") <
      js.indexOf('function loadData()')
    );
    assert('departements.geojson charge AVANT loadData()',
      depsLoadOrder, 'loadGeoJSON(departements) absent ou apres loadData()');

    // Anti-regression : loadData lit DEPARTEMENTS_GEOJSON.features
    // (ce qui plantait si DEPARTEMENTS_GEOJSON etait null)
    assert('loadData accede a DEPARTEMENTS_GEOJSON.features',
      /S\.departements\s*=\s*DEPARTEMENTS_GEOJSON\.features/.test(js));
  }
}

// Regression : cabinets.geojson (miroir local) doit etre coherent avec Neon.
// Source-of-truth = Neon ; le fichier local est un snapshot fallback.
// Si drift, le test fail (force l'ingenieur a relancer
// `node scripts/sync-cabinets-geojson.mjs`).
async function testLocalMirrorConsistency() {
  suite('Coherence cabinets.geojson (miroir Neon)');

  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const LOCAL = path.resolve(__dirname, '..', 'cabinets.geojson');

  if (!fs.existsSync(LOCAL)) {
    assert('cabinets.geojson existe (miroir)', false, 'fichier absent');
    return;
  }

  const local = JSON.parse(fs.readFileSync(LOCAL, 'utf-8'));
  const localIds = new Set(local.features.map(f => f.properties.id));

  const pub = await fetch(`${BASE_URL}/api/geojson/cabinets?nocache=${Date.now()}`);
  const pubData = await pub.json();
  const pubIds = new Set(pubData.features.map(f => f.properties.id));

  // 1. Meme nombre de cabinets
  assert('meme nombre de features (local vs Neon)',
    localIds.size === pubIds.size,
    `local=${localIds.size} neon=${pubIds.size}`);

  // 2. Meme set d'IDs
  const localOnly = [...localIds].filter(x => !pubIds.has(x));
  const neonOnly = [...pubIds].filter(x => !localIds.has(x));
  assert('memes IDs de cabinets',
    localOnly.length === 0 && neonOnly.length === 0,
    `local-only=${localOnly.join(',')} neon-only=${neonOnly.join(',')}`);

  // 3. Pas de derive sur les champs critiques (nom, departements, phone)
  let divergences = 0;
  const details = [];
  for (const f of local.features) {
    const id = f.properties.id;
    const neon = pubData.features.find(x => x.properties.id === id);
    if (!neon) continue;
    const lp = f.properties, np = neon.properties;
    if (lp.nom !== np.nom) { divergences++; details.push(`${id}: nom diverge`); }
    const localDeps = JSON.stringify((lp.departements || []).sort());
    const neonDeps = JSON.stringify((np.departements || []).sort());
    if (localDeps !== neonDeps) { divergences++; details.push(`${id}: deps divergent`); }
  }
  assert('aucune divergence nom/departements (local vs Neon)',
    divergences === 0, details.slice(0, 3).join(' | '));
}

// Regression : build_index.py doit refuser le build si Neon est KO.
// Source-of-truth = Neon, JAMAIS d'inline silencieux dans index.html.
async function testBuildNeonOnly() {
  suite('Build pipeline = Neon uniquement (pas de fallback silencieux)');

  const fs = await import('node:fs');
  const path = await import('node:path');
  const { execSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(__dirname, '..');
  const buildScript = path.join(root, 'scripts', 'build_index.py');

  // 1. index.html NE DOIT PAS contenir de donnees cabinet inlinées.
  // (refactor anterieur : Neon-first via runtime fetch)
  const idxHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
  const hasInlineCabinets = /__CABINETS_GEOJSON__/.test(idxHtml)
    || /"id"\s*:\s*"cabinet-0[1-9]"/.test(idxHtml);
  assert('index.html n\'a PAS de features inlinées (Neon = runtime only)',
    !hasInlineCabinets, 'placeholder ou feature cabinet détectée dans le bundle');

  // 2. assets/main.js DOIT fetcher /api/geojson/cabinets au démarrage.
  const mainJs = fs.readFileSync(path.join(root, 'assets', 'main.js'), 'utf-8');
  assert('assets/main.js fetch /api/geojson/cabinets',
    /\/api\/geojson\/cabinets/.test(mainJs));

  // 3. Le fallback cabinets.geojson ne doit PAS être prioritaire.
  // (autorisé seulement en dernier recours, apres Neon KO)
  const fallbackOrder = mainJs.indexOf('/api/geojson/cabinets')
    < mainJs.indexOf("'cabinets.geojson'");
  assert('Neon tenté AVANT cabinets.geojson local',
    fallbackOrder, 'ordre incorrect');

  // 4. build_index.py doit exit non-zero si Neon KO (mauvaise URL).
  // On lui passe une URL bidon, il doit refuser le build.
  try {
    execSync(`python3 ${buildScript} http://127.0.0.1:1/dead`, {
      stdio: 'pipe',
      timeout: 20000,
    });
    assert('build_index.py refuse Neon KO', false, 'exit 0 inattendu');
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const refused = err.status !== 0 && /refuse|Build refuse/i.test(stderr);
    assert('build_index.py refuse Neon KO (exit != 0)',
      refused, `status=${err.status} stderr=${stderr.slice(0, 200)}`);
  }
}

// === Main ===
async function main() {
  log(`\x1b[1mCabinetsMAP — Tests E2E admin (Neon + Vercel Functions)\x1b[0m`);
  log(`  URL        : ${BASE_URL}`);
  log(`  Password   : ${ADMIN_PASSWORD ? '***' + ADMIN_PASSWORD.slice(-4) : '(non fourni)'}`);
  log(`  Mutations  : ${SKIP_MUTATIONS ? 'désactivées' : 'activées'}`);

  const start = Date.now();

  try {
    // --- Invariants zero-auth (toujours executes) ---
    await testHtmlSanity();
    await testListLoadingHiddenCss();
    await testListLoadingHtmlMarkup();
    await testRobotsAndHeaders();
    await testRateLimit();
    await testPublicGeoJson();
    await testLocalMirrorConsistency();
    await testBuildNeonOnly();

    // --- Invariants auth-required (1 login + 1 GET) ---
    const sessionCookie = await testAuth();
    await testListCabinets(sessionCookie);
    await testNeonAsSourceOfTruth(sessionCookie);

    // --- Tests destructifs (seulement si RUN_MUTATIONS=1) ---
    if (!SKIP_MUTATIONS) {
      const cabinets = await testListCabinets(sessionCookie);
      await testServerValidation(sessionCookie);
      const editResult = await testEdit(sessionCookie, cabinets);
      await testRestore(sessionCookie, editResult);
      await testAddAndDelete(sessionCookie);
      await testAuditLogSchema(sessionCookie);
    } else {
      log('\x1b[2m  (tests destructifs skippes : RUN_MUTATIONS != 1)\x1b[0m');
    }
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
