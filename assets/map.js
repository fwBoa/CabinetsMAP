(function () {
  'use strict';

  const App = window.App;
  const S = App.state;
  const U = App.utils;
  const C = App.config;

  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');
  const loaderActions = document.getElementById('loaderActions');
  const retryBtn = document.getElementById('retryBtn');
  const continueBtn = document.getElementById('continueBtn');

  function setLoaderError(message, canRetry = true) {
    S.isErrorState = true;
    loader.classList.remove('hidden');
    loader.style.display = '';
    loaderText.textContent = message;
    loaderActions.style.display = 'flex';
    retryBtn.style.display = canRetry ? 'inline-flex' : 'none';
    const spinner = loader.querySelector('.loader__spinner');
    if (spinner) spinner.style.display = 'none';
  }

  function hideLoader() {
    loader.classList.add('hidden');
    loaderActions.style.display = 'none';
    S.isErrorState = false;
  }

  function initMap() {
    S.mapLoaded = false;
    loaderText.textContent = 'Chargement de la cartographie…';
    loaderActions.style.display = 'none';

    S.map = new maplibregl.Map({
      container: 'map',
      style: C.IGN_STYLE,
      center: C.FRANCE_CENTER,
      zoom: C.FRANCE_ZOOM,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
      doubleClickZoom: false,
      locale: {
        'FullscreenControl.Enter': 'Plein écran',
        'FullscreenControl.Exit': 'Quitter le plein écran',
        'NavigationControl.ResetBearing': "Réinitialiser l'orientation",
        'NavigationControl.ZoomIn': 'Zoomer',
        'NavigationControl.ZoomOut': 'Dézoomer'
      }
    });

    S.map.getCanvas().style.touchAction = 'manipulation';
    S.map.getCanvas().setAttribute('aria-hidden', 'true');

    S.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    S.map.addControl(new maplibregl.FullscreenControl({ container: document.querySelector('body') }), 'bottom-right');

    S.map.on('load', () => {
      S.mapLoaded = true;
      hideLoader();
      setupMapLayers();
      bindMapEvents();
      App.emit('map:loaded', {});
      U.announce(`${S.cabinets.length} cabinets disponibles sur ${S.departements.length} départements.`);
    });

    S.map.on('error', (e) => {
      const err = e.error || {};
      const msg = String(err.message || e.message || '');
      const isTileError = msg.toLowerCase().includes('tile') || err.status === 404 || err.status === 503;
      console.warn('Erreur MapLibre :', e);
      if (!isTileError) {
        setLoaderError('Impossible de charger la carte. Vérifiez votre connexion.', true);
        App.emit('map:error', e);
      }
    });
  }

  function setupMapLayers() {
    const map = S.map;

    map.addSource('departements', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: S.departements },
      promoteId: 'code',
      generateId: false
    });

    map.addSource('depts-dim', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'code',
      generateId: false
    });

    map.addSource('cabinets', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: S.cabinets },
      promoteId: 'id',
      generateId: false
    });

    map.addLayer({
      id: 'depts-fill',
      type: 'fill',
      source: 'departements',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['case',
          ['boolean', ['feature-state', 'hover'], false], 0.95,
          0.85
        ]
      }
    });

    map.addLayer({
      id: 'depts-dim',
      type: 'fill',
      source: 'depts-dim',
      paint: {
        'fill-color': C.colors.dim,
        'fill-opacity': C.colors.dimOpacity
      }
    });

    map.addLayer({
      id: 'depts-outline',
      type: 'line',
      source: 'departements',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1],
        'line-opacity': 0.95
      }
    });

    map.addLayer({
      id: 'cabinets-circles',
      type: 'circle',
      source: 'cabinets',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'cabinets-selected',
      type: 'circle',
      source: 'cabinets',
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': 8,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-width': 3,
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'cabinets-hover',
      type: 'circle',
      source: 'cabinets',
      filter: ['boolean', ['feature-state', 'hover'], false],
      paint: {
        'circle-radius': 8,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-width': 3,
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'cabinets-hit',
      type: 'circle',
      source: 'cabinets',
      paint: {
        'circle-radius': 18,
        'circle-color': 'transparent',
        'circle-opacity': 0,
        'circle-stroke-width': 0
      }
    });
  }

  function setDeptHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'departements', id }, { hover: isHover });
  }

  function setCabinetHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'cabinets', id }, { hover: isHover });
  }

  function bindMapEvents() {
    const map = S.map;

    map.on('mouseenter', 'depts-fill', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      if (e.features.length > 0) {
        const next = e.features[0];
        if (S.hoveredDeptId !== null && S.hoveredDeptId !== next.id) {
          setDeptHoverState(S.hoveredDeptId, false);
        }
        S.hoveredDeptId = next.id;
        setDeptHoverState(S.hoveredDeptId, true);

        const code = String(next.properties.code);
        const cabs = App.getCabinetsForDept(code);
        if (cabs.length && !S.selectedFeature && !U.isCoarsePointer()) {
          if (S.hoverPopup) S.hoverPopup.remove();
          S.hoverPopup = createDeptHoverPopup(next, cabs, e.lngLat).addTo(map);
        }
      }
    });

    map.on('mousemove', 'depts-fill', (e) => {
      if (S.hoverPopup && e.features.length > 0) {
        S.hoverPopup.setLngLat(e.lngLat);
      }
    });

    map.on('mouseleave', 'depts-fill', () => {
      map.getCanvas().style.cursor = '';
      if (S.hoveredDeptId !== null) {
        setDeptHoverState(S.hoveredDeptId, false);
        S.hoveredDeptId = null;
      }
      if (S.hoverPopup) { S.hoverPopup.remove(); S.hoverPopup = null; }
    });

    map.on('click', 'depts-fill', (e) => {
      const feature = e.features && e.features[0];
      if (!feature) return;
      const code = String(feature.properties.code);
      const cabs = App.getCabinetsForDept(code);
      if (cabs.length === 1) {
        App.emit('map:cabinetClick', { feature: cabs[0] });
      } else if (cabs.length > 1) {
        App.emit('map:deptClick', { feature, cabs });
      }
    });

    map.on('dblclick', 'depts-fill', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const feature = e.features && e.features[0];
      if (!feature) return;
      const cabs = App.getCabinetsForDept(String(feature.properties.code));
      if (cabs.length >= 1) {
        const center = U.polygonCentroid(feature.geometry);
        map.flyTo({ center, zoom: 8, speed: 0.8, curve: 1.2, padding: getMobileMapPadding() });
      }
    });

    map.on('mouseenter', 'cabinets-hit', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      if (e.features.length > 0) {
        setCabinetHoverState(e.features[0].id, true);
      }
    });

    map.on('mouseleave', 'cabinets-hit', (e) => {
      map.getCanvas().style.cursor = '';
      if (e.features.length > 0) {
        setCabinetHoverState(e.features[0].id, false);
      }
    });

    map.on('click', 'cabinets-hit', (e) => {
      const feature = e.features && e.features[0];
      if (feature) App.emit('map:cabinetClick', { feature });
    });

    map.on('dblclick', 'cabinets-hit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const feature = e.features && e.features[0];
      if (feature) App.emit('map:cabinetDblClick', { feature });
    });

    map.on('click', (e) => {
      const deptFeatures = map.queryRenderedFeatures(e.point, { layers: ['depts-fill'] });
      const cabFeatures = map.queryRenderedFeatures(e.point, { layers: ['cabinets-hit'] });
      if (!deptFeatures.length && !cabFeatures.length) {
        App.emit('map:selectionCleared', {});
      }
    });
  }

  function createDeptHoverPopup(feature, cabs, lngLat) {
    const code = String(feature.properties.code);
    const deptName = App.getDeptName(code);
    const main = cabs[0].properties;
    const html = `
      <div class="popup__header">
        <span class="popup__avatar" style="background:${main.couleur}" aria-hidden="true">${U.initials(main.nom)}</span>
        <div class="popup__meta">
          <h3 class="popup__title">${deptName}</h3>
          <p class="popup__subtitle">${cabs.length > 1 ? cabs.length + ' cabinets couvrent ce territoire' : 'Couvert par ' + main.nom}</p>
        </div>
      </div>
    `;
    return new maplibregl.Popup({
      offset: 12,
      closeButton: false,
      closeOnClick: false,
      anchor: 'bottom',
      className: 'hover-popup'
    }).setLngLat(lngLat || U.polygonCentroid(feature.geometry))
      .setHTML(html);
  }

  function initOmInset() {
    const container = document.getElementById('omInsetChips');
    if (!container) return;
    const omCodes = ['971', '972', '973', '974', '976', '987', '988'];
    container.innerHTML = omCodes.map(code => {
      const entry = S.deptIndex.get(code);
      const color = entry ? entry.color : '#cccccc';
      return `
        <button class="om-inset__chip" type="button" data-code="${code}" aria-label="Département ${code}">
          <span class="om-inset__chip-dot" style="background:${color}"></span>
          ${code}
        </button>
      `;
    }).join('');
    container.querySelectorAll('.om-inset__chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        const dept = S.departements.find(d => String(d.properties.code) === code);
        if (!dept || !S.map) return;
        const center = U.polygonCentroid(dept.geometry);
        S.map.flyTo({ center, zoom: 7, speed: 0.8, curve: 1.2 });
      });
    });
  }

  function getMobileMapPadding() {
    if (window.innerWidth <= C.mobileBreakpoint) {
      return { top: 80, bottom: Math.min(220, window.innerHeight * 0.32), left: 12, right: 12 };
    }
    return { top: 100, bottom: 60, left: 420, right: 380 };
  }

  function recenterMapForMobilePanel() {
    if (!S.map || window.innerWidth > C.mobileBreakpoint) return;
    const panel = document.getElementById('detailPanel');
    if (panel.classList.contains('detail-panel--hidden')) return;
    const panelHeight = panel.getBoundingClientRect().height || window.innerHeight * 0.3;
    const shiftPixels = Math.max(panelHeight * 0.55, 80);
    S.map.panBy([0, -shiftPixels], { duration: U.prefersReducedMotion() ? 0 : 400 });
  }

  function flyToCabinet(feature) {
    if (!S.map || !feature) return;
    const p = feature.properties;
    const depts = (p.departements || []).map(code => S.departements.find(d => String(d.properties.code) === code)).filter(Boolean);
    if (depts.length) {
      const bounds = depts.reduce((acc, d) => {
        const c = U.polygonCentroid(d.geometry);
        if (!acc) return [c[0], c[1], c[0], c[1]];
        return [Math.min(acc[0], c[0]), Math.min(acc[1], c[1]), Math.max(acc[2], c[0]), Math.max(acc[3], c[1])];
      }, null);
      if (bounds) {
        S.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: getMobileMapPadding(), maxZoom: 9, duration: U.prefersReducedMotion() ? 0 : 900 });
        return;
      }
    }
    flyTo(feature.geometry.coordinates.slice(), Math.max(S.map.getZoom(), 8));
  }

  function flyTo(coords, zoom) {
    if (!S.map) return;
    S.map.easeTo({
      center: coords,
      zoom: zoom || Math.max(S.map.getZoom(), 12),
      duration: U.prefersReducedMotion() ? 0 : 650,
      easing: t => t * (2 - t)
    });
  }

  function resetView() {
    App.emit('ui:clearSelection', {});
    App.emit('ui:resetSearch', {});
    if (S.map) {
      S.map.easeTo({
        center: C.FRANCE_CENTER,
        zoom: C.FRANCE_ZOOM,
        pitch: 0,
        bearing: 0,
        duration: U.prefersReducedMotion() ? 0 : 800,
        easing: t => t * (2 - t)
      });
    }
    U.announce('Vue réinitialisée. Tous les cabinets sont affichés.');
  }

  function highlightCabinetTerritory(cabinetId) {
    if (!S.map) return;
    const dimFeatures = S.departements.filter(f => {
      const pid = f.properties.primaryCabinetId;
      return pid != null && pid !== cabinetId;
    });
    S.map.getSource('depts-dim').setData({ type: 'FeatureCollection', features: dimFeatures });
    S.map.setFilter('cabinets-selected', ['==', ['get', 'id'], String(cabinetId || '')]);
  }

  function resetDeptOpacity() {
    if (!S.map) return;
    S.map.getSource('depts-dim').setData({ type: 'FeatureCollection', features: [] });
    S.map.setFilter('cabinets-selected', ['==', ['get', 'id'], '']);
    if (S.hoveredDeptId != null) {
      setDeptHoverState(S.hoveredDeptId, false);
      S.hoveredDeptId = null;
    }
  }

  App.on('ui:selectCabinet', ({ feature }) => {
    if (!feature) return;
    highlightCabinetTerritory(feature.properties.id);
    flyToCabinet(feature);
  });

  App.on('ui:clearSelection', () => {
    resetDeptOpacity();
  });

  App.map = {
    initMap,
    initOmInset,
    flyToCabinet,
    flyTo,
    resetView,
    recenterMapForMobilePanel,
    highlightCabinetTerritory,
    resetDeptOpacity,
    getMobileMapPadding,
    setLoaderError,
    hideLoader,
  };
})();
