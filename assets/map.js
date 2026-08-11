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
    const spinner = loader.querySelector('.splash__spinner');
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
      setupMapLayers();
      bindMapEvents();
      // Laisser le loader visible quelques instants de plus pour que la carte
      // apparaisse complètement stabilisée avant de révéler l’interface.
      setTimeout(() => {
        hideLoader();
        App.emit('map:loaded', {});
        U.announce(`${S.cabinets.length} cabinets disponibles sur ${S.departements.length} départements.`);
      }, 800);
    });

    S.map.on('error', (e) => {
      const err = e.error || {};
      const msg = String(err.message || e.message || '');
      // Le fond blanc n'utilise pas de tuiles, donc la plupart des erreurs sont non bloquantes
      const isFatal = msg.toLowerCase().includes('style') || msg.toLowerCase().includes('webgl');
      console.warn('Erreur MapLibre (non bloquante) :', msg || e);
      if (isFatal) {
        setLoaderError('Problème technique avec la carte. Réessayez ou continuez avec la liste.', true);
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

    setupInsetLayers();
  }

  let omInsetMarkers = [];
  let tooltipEl = null;
  let tooltipRaf = null;
  let hoverDeptId = null;
  let hoverCabinetId = null;
  let omHoverId = null;
  let lastTooltipTargetId = null;

  function getTooltip() {
    if (!tooltipEl) tooltipEl = document.getElementById('mapTooltip');
    return tooltipEl;
  }

  function showTooltip(html, x, y) {
    const el = getTooltip();
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('map-tooltip--visible');
    el.setAttribute('aria-hidden', 'false');
    positionTooltip(el, x, y);
  }

  function hideTooltip() {
    const el = getTooltip();
    if (!el) return;
    el.classList.remove('map-tooltip--visible');
    el.setAttribute('aria-hidden', 'true');
  }

  function positionTooltip(el, x, y) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + rect.width > vw - 8) left = x - rect.width - 8;
    if (top + rect.height > vh - 8) top = y - rect.height - 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function eachCoord(geometry, fn) {
    const coords = geometry.coordinates;
    if (geometry.type === 'Polygon') {
      coords.forEach(ring => ring.forEach(fn));
    } else if (geometry.type === 'MultiPolygon') {
      coords.forEach(polygon => polygon.forEach(ring => ring.forEach(fn)));
    }
  }

  function getGeometryCentroid(geometry) {
    let lon = 0, lat = 0, n = 0;
    eachCoord(geometry, (p) => { lon += p[0]; lat += p[1]; n += 1; });
    return n ? [lon / n, lat / n] : [0, 0];
  }

  function getGeometryBBox(geometry) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    eachCoord(geometry, (p) => {
      if (p[0] < minLon) minLon = p[0];
      if (p[0] > maxLon) maxLon = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    });
    return { minLon, maxLon, minLat, maxLat };
  }

  function createInsetFeature(feature, target, slot, maxSlotSize, minScale) {
    const geometry = JSON.parse(JSON.stringify(feature.geometry));
    const bbox = getGeometryBBox(geometry);
    const w = bbox.maxLon - bbox.minLon;
    const h = bbox.maxLat - bbox.minLat;
    const maxDim = Math.max(w || 0, h || 0, 0.0001);
    let scale = maxSlotSize / maxDim;
    if (scale < minScale) scale = minScale;
    if (scale > 3) scale = 3;
    const centroid = getGeometryCentroid(geometry);
    const targetLon = target[0] + slot[0];
    const targetLat = target[1] + slot[1];
    eachCoord(geometry, (p) => {
      p[0] = (p[0] - centroid[0]) * scale + targetLon;
      p[1] = (p[1] - centroid[1]) * scale + targetLat;
    });
    return {
      type: 'Feature',
      properties: {
        code: feature.properties.code,
        nom: feature.properties.nom,
        fillColor: feature.properties.fillColor,
        primaryCabinetId: feature.properties.primaryCabinetId,
        cabinetCount: feature.properties.cabinetCount,
        omInset: true
      },
      geometry
    };
  }

  function createInsetGeometries() {
    const groups = C.OM_INSET_GROUPS;
    const maxSlot = C.OM_INSET_MAX_SLOT_SIZE;
    const minScale = C.OM_INSET_MIN_SCALE;
    const features = [];
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      group.codes.forEach((code, index) => {
        const codeStr = String(code);
        const real = S.departements.find(d => String(d.properties.code) === codeStr);
        if (!real) return;
        const slot = group.slots[index] || [0, 0];
        features.push(createInsetFeature(real, group.target, slot, maxSlot, minScale));
      });
    });
    return { type: 'FeatureCollection', features };
  }

  function setupInsetLayers() {
    const map = S.map;
    if (!map) return;
    map.addSource('om-insets', {
      type: 'geojson',
      data: createInsetGeometries(),
      promoteId: 'code',
      generateId: false
    });
    map.addLayer({
      id: 'om-insets-fill',
      type: 'fill',
      source: 'om-insets',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': 0.9
      }
    });
    map.addLayer({
      id: 'om-insets-outline',
      type: 'line',
      source: 'om-insets',
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.2,
        'line-opacity': 1
      }
    });
    bindInsetEvents();
    createInsetLabels();
    updateInsetVisibility();
  }

  function createInsetLabels() {
    if (!S.map) return;
    omInsetMarkers.forEach(m => m.remove());
    omInsetMarkers = [];
    const groups = C.OM_INSET_GROUPS;
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      const el = document.createElement('div');
      el.className = 'om-inset__label-marker';
      const inner = document.createElement('div');
      inner.className = 'om-inset__label-marker__text';
      inner.textContent = group.title;
      el.appendChild(inner);
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(group.target)
        .addTo(S.map);
      omInsetMarkers.push(marker);
    });
  }

  function bindInsetEvents() {
    const map = S.map;
    if (!map || !map.getLayer('om-insets-fill')) return;

    map.on('click', 'om-insets-fill', (e) => {
      const feature = e.features && e.features[0];
      if (!feature) return;
      const code = String(feature.properties.code);
      const real = S.departements.find(d => String(d.properties.code) === code);
      if (!real || !S.map) return;
      const cabs = App.getCabinetsForDept(code);
      if (!cabs.length) return;
      goToDept(code, 7);
      if (cabs.length === 1) {
        App.emit('map:cabinetClick', { feature: cabs[0] });
      } else {
        App.emit('map:deptClick', { feature: real, cabs });
      }
    });

    map.on('dblclick', 'om-insets-fill', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const feature = e.features && e.features[0];
      if (!feature || !S.map) return;
      const code = String(feature.properties.code);
      goToDept(code, 8);
    });
  }

  function goToDept(code, zoom) {
    if (!S.map) return;
    const real = S.departements.find(d => String(d.properties.code) === String(code));
    if (!real) return;
    const center = U.polygonCentroid(real.geometry);
    const current = S.map.getCenter();
    const distDeg = Math.hypot(center[0] - current.lng, center[1] - current.lat);
    if (distDeg > C.OM_INSET_JUMP_THRESHOLD_DEG) {
      S.map.jumpTo({ center, zoom });
    } else {
      S.map.flyTo({ center, zoom, speed: 0.8, curve: 1.2 });
    }
  }

  function updateInsetVisibility() {
    const isMobile = window.innerWidth <= C.mobileBreakpoint;
    const map = S.map;
    if (map && map.getLayer('om-insets-fill')) {
      const visibility = isMobile ? 'none' : 'visible';
      map.setLayoutProperty('om-insets-fill', 'visibility', visibility);
      map.setLayoutProperty('om-insets-outline', 'visibility', visibility);
    }
    omInsetMarkers.forEach(m => { m.getElement().style.display = isMobile ? 'none' : ''; });
    const chips = document.getElementById('omInsetChips');
    if (chips) chips.hidden = !isMobile;
  }

  function setDeptHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'departements', id }, { hover: isHover });
  }

  function setCabinetHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'cabinets', id }, { hover: isHover });
  }

  function setOmInsetHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'om-insets', id }, { hover: isHover });
  }

  function updateHoverTargets(nextDeptId, nextCabinetId, nextOmId) {
    if (nextDeptId !== hoverDeptId) {
      if (hoverDeptId != null) setDeptHoverState(hoverDeptId, false);
      if (nextDeptId != null) setDeptHoverState(nextDeptId, true);
      hoverDeptId = nextDeptId;
      S.hoveredDeptId = nextDeptId;
    }
    if (nextCabinetId !== hoverCabinetId) {
      if (hoverCabinetId != null) setCabinetHoverState(hoverCabinetId, false);
      if (nextCabinetId != null) setCabinetHoverState(nextCabinetId, true);
      hoverCabinetId = nextCabinetId;
    }
    if (nextOmId !== omHoverId) {
      if (omHoverId != null) setOmInsetHoverState(omHoverId, false);
      if (nextOmId != null) setOmInsetHoverState(nextOmId, true);
      omHoverId = nextOmId;
    }
  }

  function clearHoverTargets() {
    updateHoverTargets(null, null, null);
  }

  function bindMapEvents() {
    const map = S.map;

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

    map.on('mousemove', (e) => {
      if (U.isCoarsePointer() || !e.originalEvent || tooltipRaf) return;
      tooltipRaf = requestAnimationFrame(() => {
        tooltipRaf = null;
        if (!S.map) return;
        const features = S.map.queryRenderedFeatures(e.point, {
          layers: ['cabinets-hit', 'depts-fill', 'om-insets-fill']
        });
        const top = features[0];
        if (!top) {
          clearHoverTargets();
          hideTooltip();
          map.getCanvas().style.cursor = '';
          lastTooltipTargetId = null;
          return;
        }

        const layerId = top.layer.id;
        const targetId = `${layerId}-${top.id}`;
        let html = '';
        let show = false;

        if (layerId === 'cabinets-hit') {
          updateHoverTargets(null, top.id, null);
          html = cabinetTooltipHtml(top);
          show = true;
        } else if ((layerId === 'depts-fill' || layerId === 'om-insets-fill') && !S.selectedFeature) {
          const code = String(top.properties.code);
          const cabs = App.getCabinetsForDept(code);
          if (cabs.length) {
            updateHoverTargets(
              layerId === 'depts-fill' ? top.id : null,
              null,
              layerId === 'om-insets-fill' ? top.id : null
            );
            html = deptTooltipHtml(top, cabs);
            show = true;
          } else {
            updateHoverTargets(null, null, null);
          }
        } else {
          updateHoverTargets(null, null, null);
        }

        if (show) {
          if (lastTooltipTargetId !== targetId) {
            showTooltip(html, e.point.x, e.point.y);
            lastTooltipTargetId = targetId;
          } else {
            const el = getTooltip();
            if (el && el.classList.contains('map-tooltip--visible')) {
              positionTooltip(el, e.originalEvent.clientX, e.originalEvent.clientY);
            }
          }
          map.getCanvas().style.cursor = 'pointer';
        } else {
          hideTooltip();
          map.getCanvas().style.cursor = '';
          lastTooltipTargetId = null;
        }
      });
    });

    map.on('mouseout', () => {
      if (tooltipRaf) {
        cancelAnimationFrame(tooltipRaf);
        tooltipRaf = null;
      }
      clearHoverTargets();
      hideTooltip();
      map.getCanvas().style.cursor = '';
      lastTooltipTargetId = null;
    });

    map.on('click', (e) => {
      const deptFeatures = map.queryRenderedFeatures(e.point, { layers: ['depts-fill'] });
      const cabFeatures = map.queryRenderedFeatures(e.point, { layers: ['cabinets-hit'] });
      if (!deptFeatures.length && !cabFeatures.length) {
        App.emit('map:selectionCleared', {});
      }
    });
  }

  function deptTooltipHtml(feature, cabs) {
    const code = String(feature.properties.code);
    const deptName = App.getDeptName(code);
    const main = cabs[0].properties;
    if (cabs.length > 1) {
      const others = cabs.slice(1);
      return `
        <div class="map-tooltip__header" style="--tt-accent:${main.couleur}">
          <span class="map-tooltip__avatar" style="background:${main.couleur}" aria-hidden="true">${U.initials(main.nom)}</span>
          <div class="map-tooltip__meta">
            <div class="map-tooltip__title">${deptName}</div>
            <div class="map-tooltip__text">${cabs.length} cabinets : ${cabs.map(c => c.properties.nom).join(', ')}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="map-tooltip__header" style="--tt-accent:${main.couleur}">
        <span class="map-tooltip__avatar" style="background:${main.couleur}" aria-hidden="true">${U.initials(main.nom)}</span>
        <div class="map-tooltip__meta">
          <div class="map-tooltip__title">${main.nom}</div>
          <div class="map-tooltip__text">Couvre ${deptName}</div>
        </div>
      </div>
    `;
  }

  function cabinetTooltipHtml(feature) {
    const p = feature.properties;
    return `
      <div class="map-tooltip__header" style="--tt-accent:${p.couleur}">
        <span class="map-tooltip__avatar" style="background:${p.couleur}" aria-hidden="true">${U.initials(p.nom)}</span>
        <div class="map-tooltip__meta">
          <div class="map-tooltip__title">${p.nom}</div>
          <div class="map-tooltip__text">${p.adresse || ''}</div>
        </div>
      </div>
    `;
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
        const cabs = App.getCabinetsForDept(code);
        goToDept(code, 7);
        if (cabs.length === 1) {
          App.emit('map:cabinetClick', { feature: cabs[0] });
        } else if (cabs.length > 1) {
          App.emit('map:deptClick', { feature: dept, cabs });
        }
      });
    });
    updateInsetVisibility();
  }

  function getMobileMapPadding() {
    if (window.innerWidth > C.mobileBreakpoint) {
      return { top: 100, bottom: 60, left: 420, right: 380 };
    }
    const panelHeight = getMobilePanelHeight();
    const bottom = Math.max(110, Math.min(panelHeight + 24, window.innerHeight * 0.6));
    return { top: 80, bottom, left: 12, right: 12 };
  }

  function getMobilePanelHeight() {
    if (window.innerWidth > C.mobileBreakpoint) return 0;
    const detail = document.getElementById('detailPanel');
    const sidebar = document.getElementById('sidebar');
    let h = 0;
    if (detail && !detail.classList.contains('detail-panel--hidden')) {
      h = Math.max(h, detail.getBoundingClientRect().height);
    }
    if (sidebar && !sidebar.classList.contains('sidebar--closed')) {
      h = Math.max(h, sidebar.getBoundingClientRect().height);
    }
    return h;
  }

  function recenterMapForMobilePanel() {
    if (!S.map || window.innerWidth > C.mobileBreakpoint) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const panelHeight = getMobilePanelHeight();
        if (!panelHeight) return;
        const shiftPixels = Math.max(panelHeight * 0.55, 80);
        S.map.panBy([0, -shiftPixels], { duration: U.prefersReducedMotion() ? 0 : 400 });
      });
    });
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
    getMobilePanelHeight,
    setLoaderError,
    hideLoader,
  };
})();
