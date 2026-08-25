(async function () {
  'use strict';

  const App = window.App;
  const S = App.state;
  const U = App.utils;
  const C = App.config;

  // GeoJSON literals are replaced inline by scripts/build_index.py.
  // In development (Live Server) they are fetched as relative files.
  async function loadGeoJSON(filename) {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`HTTP ${response.status} sur ${filename}`);
    return response.json();
  }

  // Source de verite = Neon (Postgres), via /api/geojson/cabinets.
// Le try/catch historique capturait la ReferenceError sur __CABINETS_GEOJSON__
// (placeholder jamais injecte dans assets/main.js) pour basculer sur le
// fichier local. Maintenant on essaie d'abord Neon (avec timeout court),
// puis fallback fichiers statiques si offline.
  let CABINETS_GEOJSON = null;
  let DEPARTEMENTS_GEOJSON = null;
  try {
    const neonUrl = (window.App?.config?.GEOJSON_CABINETS_URL) || '/api/geojson/cabinets';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(neonUrl, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      CABINETS_GEOJSON = await res.json();
    }
  } catch (_) { /* Neon injoignable, on tente le fallback */ }

  if (!CABINETS_GEOJSON) {
    try {
      CABINETS_GEOJSON = await loadGeoJSON('cabinets.geojson');
      DEPARTEMENTS_GEOJSON = await loadGeoJSON('departements.geojson');
    } catch (err) {
      App.map.setLoaderError('Impossible de charger les données du réseau.', true);
      return false;
    }
  }

  // Synchronisation live avec la base Neon (Vercel Function).
  // On garde les GeoJSON inline comme source initiale (rapide, offline-safe),
  // puis on fetch /api/geojson/cabinets en background pour recuperer les
  // dernieres modifications admin. Si l'API repond, on remplace les
  // features sans recharger la page.
  async function refreshFromApi() {
    try {
      const res = await fetch('/api/geojson/cabinets?_t=' + Date.now(), {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const fresh = await res.json();
      if (!Array.isArray(fresh.features) || !fresh.features.length) return;

      CABINETS_GEOJSON = fresh;
      if (typeof loadData === 'function') {
        loadData();
        if (S.map && typeof App.map.refreshCabinets === 'function') {
          App.map.refreshCabinets();
        } else if (S.map && typeof App.map.initMap === 'function') {
          // Pas de refresh expose : on repeint la couche markers si dispo
          App.map.refreshMarkers?.();
        }
      }
    } catch (err) {
      // silencieux : on garde l'inline en cas d'erreur reseau
    }
  }

  const mapMain = document.querySelector('.map-main');
  const retryBtn = document.getElementById('retryBtn');
  const continueBtn = document.getElementById('continueBtn');

  function loadData() {
    try {
      S.cabinets = CABINETS_GEOJSON.features || [];
      S.departements = DEPARTEMENTS_GEOJSON.features || [];
      buildDeptIndex();
      return true;
    } catch (err) {
      console.error(err);
      App.map.setLoaderError('Impossible de charger les données du réseau.', true);
      return false;
    }
  }

  function buildDeptIndex() {
    S.deptIndex.clear();
    S.cabinetById.clear();

    S.cabinets.forEach(cab => {
      const p = cab.properties;
      S.cabinetById.set(p.id, cab);
      (p.departements || []).forEach(code => {
        if (!S.deptIndex.has(code)) {
          S.deptIndex.set(code, { cabinetIds: [], primary: null, color: null });
        }
        S.deptIndex.get(code).cabinetIds.push(p.id);
      });
    });

    S.deptIndex.forEach((entry) => {
      entry.primary = entry.cabinetIds[0];
      const cab = S.cabinetById.get(entry.primary);
      entry.color = cab ? cab.properties.couleur : '#cccccc';
    });

    S.departements.forEach(f => {
      const code = String(f.properties.code);
      const entry = S.deptIndex.get(code);
      f.properties.fillColor = entry ? entry.color : C.colors.uncovered;
      f.properties.primaryCabinetId = entry ? entry.primary : null;
      f.properties.cabinetCount = entry ? entry.cabinetIds.length : 0;
    });
  }

  function bindGlobalEvents() {
    retryBtn.addEventListener('click', () => {
      if (S.map) { S.map.remove(); S.map = null; }
      if (loadData()) App.map.initMap();
    });

    continueBtn.addEventListener('click', () => {
      App.map.hideLoader();
      App.ui.renderSidebar();
      U.announce('La carte n\'a pas pu être chargée. La liste des cabinets est disponible.');
    });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionQuery.addEventListener('change', () => {
      if (S.map && S.mapLoaded) { S.map.setPitch(0); S.map.setBearing(0); }
    });
  }

  function init() {
    mapMain.classList.add('map-main--visible');
    if (loadData()) {
      App.map.initMap();
      // Sync live avec Neon : on tente un refresh apres l'affichage initial
      // et periodiquement (toutes les 2 min) pour recuperer les editions admin.
      refreshFromApi();
      setInterval(refreshFromApi, 120000);
    }
  }

  bindGlobalEvents();
  init();
})();
