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

  function setLoaderError(message, canRetry = true) {
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
    S.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

    S.map.on('load', () => {
      S.mapLoaded = true;
      setupMapLayers();
      setupCompassVisibility();
      setupDisclaimerVisibility();
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
      filter: ['==', ['coalesce', ['get', 'outremer_only'], false], false],
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
      filter: ['all',
        ['==', ['coalesce', ['get', 'outremer_only'], false], false],
        ['==', ['get', 'id'], '']
      ],
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
      filter: ['==', ['coalesce', ['get', 'outremer_only'], false], false],
      paint: {
        'circle-radius': 8,
        'circle-color': '#ffffff',
        'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'cabinets-hit',
      type: 'circle',
      source: 'cabinets',
      filter: ['==', ['coalesce', ['get', 'outremer_only'], false], false],
      paint: {
        'circle-radius': 18,
        'circle-color': 'transparent',
        'circle-opacity': 0,
        'circle-stroke-width': 0
      }
    });

    setupInsetLayers();
    setupOmCabinetLayers();
  }

  let omInsetMarkers = [];
  let omTitleMarker = null;
  let tooltipEl = null;
  let tooltipRaf = null;
  let hoverDeptId = null;
  let hoverCabinetId = null;
  let omHoverId = null;
  let hoverOmCabinetId = null;
  let lastTooltipTargetId = null;

  function getTooltip() {
    if (!tooltipEl) tooltipEl = document.getElementById('mapTooltip');
    return tooltipEl;
  }

  function showTooltip(content, x, y) {
    const el = getTooltip();
    if (!el) return;
    el.replaceChildren();
    if (content) el.appendChild(content);
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
    if (geometry.type === 'Point') {
      fn(geometry.coordinates);
      return;
    }
    const coords = geometry.coordinates;
    if (geometry.type === 'Polygon') {
      coords.forEach(ring => ring.forEach(fn));
    } else if (geometry.type === 'MultiPolygon') {
      coords.forEach(polygon => polygon.forEach(ring => ring.forEach(fn)));
    }
  }

  function getGeometryCentroid(geometry) {
    if (geometry.type === 'Point') return geometry.coordinates.slice();
    let lon = 0, lat = 0, n = 0;
    eachCoord(geometry, (p) => { lon += p[0]; lat += p[1]; n += 1; });
    return n ? [lon / n, lat / n] : [0, 0];
  }

  function getGeometryBBox(geometry) {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const delta = 0.0001;
      return { minLon: lon - delta, maxLon: lon + delta, minLat: lat - delta, maxLat: lat + delta };
    }
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    eachCoord(geometry, (p) => {
      if (p[0] < minLon) minLon = p[0];
      if (p[0] > maxLon) maxLon = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    });
    return { minLon, maxLon, minLat, maxLat };
  }

  function makeBoundingBoxPolygon(minLon, minLat, maxLon, maxLat) {
    return {
      type: 'Polygon',
      coordinates: [[
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat]
      ]]
    };
  }

  function makeSyntheticCircle(centroid, radiusDeg, segments = 64) {
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring.push([centroid[0] + Math.cos(a) * radiusDeg, centroid[1] + Math.sin(a) * radiusDeg]);
    }
    ring.push([ring[0][0], ring[0][1]]);
    return { type: 'Polygon', coordinates: [ring] };
  }

  function makeSyntheticMarker(centroid, radiusDeg) {
    return makeSyntheticCircle(centroid, radiusDeg, 12);
  }

  const POLYNESIA_ISLAND_LABELS = {
    '41': 'Tahiti',
    '51': 'Hiva Oa',
    '54': 'Nuku Hiva'
  };

  function makeMainIslandsOnly(geometry, minPoints = 30) {
    const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates
      : geometry.type === 'Polygon' ? [geometry.coordinates]
      : [];
    if (!polygons.length) return { geometry, keptIndices: [] };
    const keptIndices = [];
    const kept = [];
    polygons.forEach((poly, idx) => {
      if (poly[0] && poly[0].length >= minPoints) {
        kept.push(poly);
        keptIndices.push(idx);
      }
    });
    if (!kept.length) return { geometry, keptIndices: [] };
    return { geometry: { type: 'MultiPolygon', coordinates: kept }, keptIndices };
  }

  // Disposition cible des îles principales de Polynésie (987), en coordonnées
  // relatives avant le scaling global de l'inset. Chaque île est agrandie
  // (scale) puis son centroïde est placé à la position cible, ce qui préserve
  // les tailles relatives et la géographie (Marquises au NE, Tahiti au SO)
  // sans chevauchement.
  const POLYNESIA_ISLAND_LAYOUT = {
    '41': { pos: [0, 0], scale: 4.0 },      // Tahiti (la plus grande)
    '51': { pos: [1.5, 2.5], scale: 2.5 },  // Hiva Oa (Marquises, à l'est de Tahiti)
    '54': { pos: [4.5, 2.5], scale: 2.5 }   // Nuku Hiva (plus au nord-est)
  };

  function layoutPolynesiaIslands(geometry, keptIndices) {
    const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
      : geometry.type === 'Polygon' ? [geometry.coordinates]
      : [];
    if (!polys.length) return geometry;
    polys.forEach((poly, i) => {
      const layout = POLYNESIA_ISLAND_LAYOUT[String(keptIndices[i])];
      if (!layout) return;
      const ring = poly[0];
      if (!ring || !ring.length) return;
      let cx = 0, cy = 0;
      ring.forEach(p => { cx += p[0]; cy += p[1]; });
      cx /= ring.length;
      cy /= ring.length;
      ring.forEach(p => {
        p[0] = layout.pos[0] + (p[0] - cx) * layout.scale;
        p[1] = layout.pos[1] + (p[1] - cy) * layout.scale;
      });
    });
    return geometry;
  }

  function makeArchipelagoConstellation(geometry, radiusDeg) {
    const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates
      : geometry.type === 'Polygon' ? [geometry.coordinates]
      : [];
    if (!polygons.length) return geometry;
    const circles = polygons.map(poly => {
      const ring = poly[0];
      let lon = 0, lat = 0;
      ring.forEach(p => { lon += p[0]; lat += p[1]; });
      const cx = lon / ring.length;
      const cy = lat / ring.length;
      return makeSyntheticMarker([cx, cy], radiusDeg);
    });
    return { type: 'MultiPolygon', coordinates: circles.map(f => f.coordinates) };
  }

  function makeArchipelagoMarkers(geometry, radiusDeg, targetClusterCount) {
    const type = geometry.type;
    const polygons = type === 'Polygon' ? [geometry.coordinates]
      : type === 'MultiPolygon' ? geometry.coordinates
      : [];
    if (!polygons.length) return geometry;
    const centroids = polygons.map(poly => {
      const ring = poly[0];
      let lon = 0, lat = 0;
      ring.forEach(p => { lon += p[0]; lat += p[1]; });
      return [lon / ring.length, lat / ring.length];
    });
    let clusterCentroids;
    if (targetClusterCount && centroids.length > targetClusterCount) {
      clusterCentroids = clusterByGrid(centroids, targetClusterCount);
    } else {
      clusterCentroids = centroids;
    }
    const circles = clusterCentroids.map(c => makeSyntheticMarker(c, radiusDeg));
    return { type: 'MultiPolygon', coordinates: circles.map(f => f.coordinates) };
  }

  function clusterByGrid(centroids, targetCount) {
    let best = null;
    let bestGap = Infinity;
    let cellSize = 1.0;
    for (let iter = 0; iter < 30; iter++) {
      const cells = new Map();
      centroids.forEach((c, i) => {
        const key = `${Math.floor(c[0] / cellSize)}|${Math.floor(c[1] / cellSize)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      });
      const n = cells.size;
      const gap = Math.abs(n - targetCount);
      if (gap < bestGap) {
        bestGap = gap;
        best = Array.from(cells.values()).map(indices => {
          let lon = 0, lat = 0;
          indices.forEach(i => { lon += centroids[i][0]; lat += centroids[i][1]; });
          return [lon / indices.length, lat / indices.length];
        });
        if (n === targetCount) break;
      }
      if (n > targetCount) cellSize *= 1.4;
      else cellSize /= 1.3;
      if (cellSize < 0.01 || cellSize > 100) break;
    }
    return best || centroids;
  }

  function createInsetFeature(feature, target, slot, maxSlotSize, minScale) {
    let geometry = JSON.parse(JSON.stringify(feature.geometry));
    const code = String(feature.properties.code);
    const bbox = getGeometryBBox(geometry);
    const targetLon = target[0] + slot[0];
    const w = bbox.maxLon - bbox.minLon;
    const h = bbox.maxLat - bbox.minLat;
    const maxDim = Math.max(w || 0, h || 0, 0.0001);
    const oversize = maxDim > maxSlotSize;
    const tooMicro = maxDim < 0.3;
    const polyCount = geometry.type === 'MultiPolygon' ? geometry.coordinates.length
      : geometry.type === 'Polygon' ? 1 : 0;
    const isMegaArchipelago = oversize && polyCount > 12;
    const isArchipelago = oversize && polyCount >= 2 && polyCount <= 12;
    const isMainIslandsOnly = code === '987' && polyCount > 12;
    let keptIndices = null;
    if (isMainIslandsOnly) {
      const res = makeMainIslandsOnly(feature.geometry, 30);
      geometry = res.geometry;
      keptIndices = res.keptIndices;
      layoutPolynesiaIslands(geometry, keptIndices);
    } else if (isMegaArchipelago) {
      geometry = makeArchipelagoConstellation(feature.geometry, 0.15);
    } else if (isArchipelago) {
      const targetClusterCount = Math.min(polyCount, 5);
      geometry = makeArchipelagoMarkers(feature.geometry, 0.4, targetClusterCount);
    } else if (oversize) {
      geometry = makeBoundingBoxPolygon(bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat);
    } else if (tooMicro) {
      const centroid = getGeometryCentroid(geometry);
      geometry = makeSyntheticMarker(centroid, 0.35);
    }
    const newBbox = getGeometryBBox(geometry);
    const nw = newBbox.maxLon - newBbox.minLon;
    const nh = newBbox.maxLat - newBbox.minLat;
    const newMaxDim = Math.max(nw || 0, nh || 0, 0.0001);
    let scale = maxSlotSize / newMaxDim;
    if (scale < minScale) scale = minScale;
    if (scale > 3) scale = 3;
    // Taille minimum de rendu lisible, indépendante de la taille réelle du territoire.
    const minRenderDim = C.OM_INSET_MIN_RENDER_DIM || 0.9;
    const minScaleByWidth = (nw || 0.0001) < minRenderDim ? minRenderDim / (nw || 0.0001) : 0;
    const minScaleByHeight = (nh || 0.0001) < minRenderDim ? minRenderDim / (nh || 0.0001) : 0;
    scale = Math.max(scale, minScaleByWidth, minScaleByHeight);
    const centroid = getGeometryCentroid(geometry);
    const targetLat = target[1] + slot[1];
    eachCoord(geometry, (p) => {
      p[0] = (p[0] - centroid[0]) * scale + targetLon;
      p[1] = (p[1] - centroid[1]) * scale + targetLat;
    });
    const islandLabels = isMainIslandsOnly ? collectIslandLabels(geometry, keptIndices) : null;
    return {
      type: 'Feature',
      properties: {
        code: feature.properties.code,
        nom: feature.properties.nom,
        fillColor: feature.properties.fillColor,
        primaryCabinetId: feature.properties.primaryCabinetId,
        cabinetCount: feature.properties.cabinetCount,
        omInset: true,
        isSynthetic: tooMicro || oversize || isArchipelago || isMegaArchipelago || isMainIslandsOnly,
        islandLabels
      },
      geometry
    };
  }

  function collectIslandLabels(transformedGeometry, keptIndices) {
    const polys = transformedGeometry.type === 'MultiPolygon' ? transformedGeometry.coordinates
      : transformedGeometry.type === 'Polygon' ? [transformedGeometry.coordinates]
      : [];
    if (!polys.length) return [];
    const labels = [];
    polys.forEach((poly, i) => {
      const ring = poly[0];
      if (!ring || !ring.length) return;
      const key = String(keptIndices[i]);
      const name = POLYNESIA_ISLAND_LABELS[key];
      if (!name) return;
      let lon = 0, lat = -Infinity;
      ring.forEach(p => { lon += p[0]; if (p[1] > lat) lat = p[1]; });
      // Position du label : centroïde en longitude, point le plus au nord en
      // latitude, pour ancrer le label juste au-dessus de l'île.
      labels.push({ name, lng: lon / ring.length, lat });
    });
    return labels;
  }

  function createInsetBackdropGeometries() {
    const groups = C.OM_INSET_GROUPS;
    const padding = 1.0;
    const features = [];
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      const slots = group.slots || [[0, 0]];
      const offsets = slots.map(s => s[0]);
      const minOffset = Math.min(...offsets);
      const maxOffset = Math.max(...offsets);
      const minLon = group.target[0] + minOffset - padding;
      const maxLon = group.target[0] + maxOffset + padding;
      const minLat = group.target[1] - padding;
      const maxLat = group.target[1] + padding;
      features.push({
        type: 'Feature',
        properties: { omInsetBackdrop: true, group: key },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat]
          ]]
        }
      });
    });
    return { type: 'FeatureCollection', features };
  }

  function createInsetGeometries() {
    const groups = C.OM_INSET_GROUPS;
    const defaultMaxSlot = C.OM_INSET_MAX_SLOT_SIZE;
    const minScale = C.OM_INSET_MIN_SCALE;
    const features = [];
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      group.codes.forEach((code, index) => {
        const codeStr = String(code);
        const real = S.departements.find(d => String(d.properties.code) === codeStr);
        if (!real) return;
        const slot = group.slots[index] || [0, 0];
        const slotSize = (group.slotSizes && group.slotSizes[index] != null)
          ? group.slotSizes[index]
          : defaultMaxSlot;
        const f = createInsetFeature(real, group.target, slot, slotSize, minScale);
        if (f) features.push(f);
      });
    });
    return { type: 'FeatureCollection', features };
  }

  function setupInsetLayers() {
    const map = S.map;
    if (!map) return;
    const insetData = createInsetGeometries();
    map.addSource('om-insets-backdrop', {
      type: 'geojson',
      data: createInsetBackdropGeometries(),
      generateId: false
    });
    map.addSource('om-insets', {
      type: 'geojson',
      data: insetData,
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
      id: 'om-insets-backdrop',
      type: 'fill',
      source: 'om-insets-backdrop',
      paint: {
        'fill-color': 'rgba(255, 255, 255, 0.08)',
        'fill-outline-color': 'rgba(0, 0, 0, 0.04)'
      }
    }, 'om-insets-fill');
    map.addLayer({
      id: 'om-insets-outline',
      type: 'line',
      source: 'om-insets',
      paint: {
        'line-color': '#ffffff',
        'line-width': [
          'case',
          ['get', 'isSynthetic'], 1.6,
          1.2
        ],
        'line-opacity': 1
      }
    });
    map.addLayer({
      id: 'om-insets-outline-dashed',
      type: 'line',
      source: 'om-insets',
      filter: ['==', ['get', 'isSynthetic'], true],
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.6,
        'line-dasharray': [2, 2],
        'line-opacity': 1
      }
    });
    bindInsetEvents();
    createInsetLabels();
    createPolynesiaLabels(insetData.features);
    createOmTitleLabel();
    updateInsetVisibility();
  }

  function createInsetLabels() {
    if (!S.map) return;
    omInsetMarkers.forEach(m => m.remove());
    omInsetMarkers = [];
    const groups = C.OM_INSET_GROUPS;
    Object.keys(groups).forEach((key) => {
      const group = groups[key];
      group.codes.forEach((code, index) => {
        const codeStr = String(code);
        const dept = S.departements.find(d => String(d.properties.code) === codeStr);
        const slot = group.slots[index] || [0, 0];
        const el = document.createElement('div');
        el.className = 'om-inset__label-marker';
        const inner = document.createElement('div');
        inner.className = 'om-inset__label-marker__text';
        inner.textContent = dept ? dept.properties.nom : codeStr;
        el.appendChild(inner);
        // Label sous l'inset (anchor='top' = haut de l'élément ancré à la coordonnée).
        // Le Pacifique place ses îles secondaires (Marquises) au-dessus du centroïde :
        // on décale davantage le label global pour éviter le chevauchement avec
        // les labels internes (ex. TAHITI).
        const labelLatOffset = group.labelLatOffset != null ? group.labelLatOffset : -0.75;
        const lng = group.target[0] + slot[0];
        const lat = group.target[1] + slot[1] + labelLatOffset;
        const marker = new maplibregl.Marker({ element: el, anchor: 'top' })
          .setLngLat([lng, lat])
          .addTo(S.map);
        omInsetMarkers.push(marker);
      });
    });
  }

  // Titre 'DOM-TOM-COM' rendu directement sur la carte, au-dessus de
  // l'ensemble des territoires d'outre-mer. Visible a toutes les echelles,
  // sert d'en-tete a la zone OM. Positionne a mi-chemin entre les
  // groupes Antilles et Ocean Indien, legerement au-dessus (lat 40).
  function createOmTitleLabel() {
    if (!S.map) return;
    if (omTitleMarker) { omTitleMarker.remove(); omTitleMarker = null; }
    const el = document.createElement('div');
    el.className = 'om-title-label';
    const inner = document.createElement('span');
    inner.className = 'om-title-label__text';
    inner.textContent = 'DOM-TOM-COM';
    el.appendChild(inner);
    // Positionne au-dessus du groupe Pacifique, legerement decale vers
    // la droite (lng 0) pour eviter d'etre colle au bord gauche.
    omTitleMarker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -6] })
      .setLngLat([0, 40])
      .addTo(S.map);
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
      // Les insets sont des représentations schématiques placées près de la France.
      // Un clic simple ouvre la fiche sans quitter la vue actuelle ;
      // le double-clic permet de naviguer vers le territoire réel.
      if (cabs.length === 1) {
        App.emit('map:cabinetClick', { feature: cabs[0], skipMapMove: true });
      } else {
        App.emit('map:deptClick', { feature: real, cabs, skipMapMove: true });
      }
    });

    map.on('dblclick', 'om-insets-fill', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Les insets sont schématiques : on ne zoome jamais vers le territoire réel,
      // même en double-clic.
    });
  }

  const OM_CABINET_ANCHOR = [2.5, 38];

  function createOmCabinetFeatures() {
    const outremer = S.cabinets.filter(f => f.properties && f.properties.outremer_only);
    return {
      type: 'FeatureCollection',
      features: outremer.map((f, index) => {
        const spread = (index - (outremer.length - 1) / 2) * 1.4;
        return {
          type: 'Feature',
          properties: { ...f.properties },
          geometry: {
            type: 'Point',
            coordinates: [OM_CABINET_ANCHOR[0] + spread, OM_CABINET_ANCHOR[1]]
          }
        };
      })
    };
  }

  let omCabinetLabelMarkers = [];
  let polynesiaIslandLabelMarkers = [];

  function createOmCabinetLabels(features) {
    omCabinetLabelMarkers.forEach(m => m.remove());
    omCabinetLabelMarkers = [];
    features.forEach(feature => {
      const p = feature.properties || {};
      const address = p.display_name || p.adresse || '';
      const city = address.split(',').slice(-2, -1)[0]?.trim() || address.split(',')[0]?.trim() || '';
      if (!city) return;
      const el = document.createElement('div');
      el.className = 'om-cabinet-label';
      const inner = document.createElement('span');
      inner.className = 'om-cabinet-label__text';
      inner.textContent = city;
      el.appendChild(inner);
      const coords = feature.geometry.coordinates;
      const marker = new maplibregl.Marker({ element: el, anchor: 'left', offset: [10, 0] })
        .setLngLat(coords)
        .addTo(S.map);
      omCabinetLabelMarkers.push(marker);
    });
  }

  function createPolynesiaLabels(features) {
    polynesiaIslandLabelMarkers.forEach(m => m.remove());
    polynesiaIslandLabelMarkers = [];

    const poly = features.find(f => String(f.properties.code) === '987');
    if (!poly) return;
    const labels = poly.properties.islandLabels || [];
    labels.forEach(l => {
      const el = document.createElement('div');
      el.className = 'polynesia-island-label';
      const inner = document.createElement('span');
      inner.className = 'polynesia-island-label__text';
      inner.textContent = l.name;
      el.appendChild(inner);
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -4] })
        .setLngLat([l.lng, l.lat])
        .addTo(S.map);
      polynesiaIslandLabelMarkers.push(marker);
    });
  }

  function setupOmCabinetLayers() {
    const map = S.map;
    if (!map) return;
    const data = createOmCabinetFeatures();
    if (!data.features.length) return;

    map.addSource('om-cabinets', {
      type: 'geojson',
      data,
      promoteId: 'id',
      generateId: false
    });

    map.addLayer({
      id: 'om-cabinets-circles',
      type: 'circle',
      source: 'om-cabinets',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'om-cabinets-hover',
      type: 'circle',
      source: 'om-cabinets',
      paint: {
        'circle-radius': 9,
        'circle-color': '#ffffff',
        'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'om-cabinets-selected',
      type: 'circle',
      source: 'om-cabinets',
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': 9,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-width': 3,
        'circle-stroke-color': ['get', 'couleur'],
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: 'om-cabinets-hit',
      type: 'circle',
      source: 'om-cabinets',
      paint: {
        'circle-radius': 20,
        'circle-color': 'transparent',
        'circle-opacity': 0,
        'circle-stroke-width': 0
      }
    });

    map.on('click', 'om-cabinets-hit', (e) => {
      const feature = e.features && e.features[0];
      if (feature) App.emit('map:cabinetClick', { feature, skipMapMove: true });
    });

    map.on('dblclick', 'om-cabinets-hit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const feature = e.features && e.features[0];
      if (feature) App.emit('map:cabinetDblClick', { feature });
    });

    createOmCabinetLabels(data.features);
  }

  function updateOmCabinetSelection(cabinetId) {
    if (!S.map || !S.map.getLayer('om-cabinets-selected')) return;
    S.map.setFilter('om-cabinets-selected', ['==', ['get', 'id'], String(cabinetId || '')]);
  }

  const OM_CODES = ['971', '972', '973', '974', '976', '987', '988'];

  function isOmCode(code) {
    return OM_CODES.includes(String(code));
  }

  function goToDept(code, zoom) {
    if (!S.map || isOmCode(code)) return;
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
    const visibility = 'visible';
    if (map && map.getLayer('om-insets-fill')) {
      map.setLayoutProperty('om-insets-fill', 'visibility', visibility);
      map.setLayoutProperty('om-insets-outline', 'visibility', visibility);
      if (map.getLayer('om-insets-outline-dashed')) {
        map.setLayoutProperty('om-insets-outline-dashed', 'visibility', visibility);
      }
    }
    if (map && map.getLayer('om-insets-backdrop')) {
      map.setLayoutProperty('om-insets-backdrop', 'visibility', visibility);
    }
    omInsetMarkers.forEach(m => { m.getElement().style.display = ''; });
    // Les marqueurs de cabinets outre-mer sont liés aux insets visuels.
    ['om-cabinets-circles', 'om-cabinets-hover', 'om-cabinets-selected', 'om-cabinets-hit'].forEach(layerId => {
      if (map && map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });
  }

  // Affiche ou masque le bouton compass de MapLibre selon le bearing actuel.
  // L'icone au repos (carré avec 4 fleches) est peu parlante ; on la cache
  // tant que la carte est orientee au nord, et on la revele des qu'on tourne.
  function updateCompassVisibility() {
    if (!S.map) return;
    const compass = S.map.getContainer().querySelector('.maplibregl-ctrl-compass');
    if (!compass) return;
    const hasRotation = Math.abs(S.map.getBearing()) > 0.5 || Math.abs(S.map.getPitch()) > 0.5;
    compass.classList.toggle('maplibregl-ctrl-compass--visible', hasRotation);
  }

  function setupCompassVisibility() {
    if (!S.map) return;
    updateCompassVisibility();
    S.map.on('rotate', updateCompassVisibility);
    S.map.on('pitch', updateCompassVisibility);
    S.map.on('moveend', updateCompassVisibility);
  }

  // Affiche le disclaimer 'proportions non respectees' uniquement quand
  // l'utilisateur zoome fortement : a ce niveau, l'ecart entre la metropole
  // (a l'echelle reelle) et les outremers (repliees en insets) devient
  // trompeur et le message prend tout son sens.
  function updateDisclaimerVisibility() {
    if (!S.map) return;
    const disclaimer = document.getElementById('mapDisclaimer');
    if (!disclaimer) return;
    const visible = S.map.getZoom() >= C.DISCLAIMER_MIN_ZOOM;
    disclaimer.classList.toggle('map-disclaimer--visible', visible);
  }

  function setupDisclaimerVisibility() {
    if (!S.map) return;
    updateDisclaimerVisibility();
    S.map.on('zoom', updateDisclaimerVisibility);
    S.map.on('moveend', updateDisclaimerVisibility);
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

  function setOmCabinetHoverState(id, isHover) {
    if (id == null || !S.map) return;
    S.map.setFeatureState({ source: 'om-cabinets', id }, { hover: isHover });
  }

  function updateHoverTargets(nextDeptId, nextCabinetId, nextOmId, nextOmCabinetId = null) {
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
    if (nextOmCabinetId !== hoverOmCabinetId) {
      if (hoverOmCabinetId != null) setOmCabinetHoverState(hoverOmCabinetId, false);
      if (nextOmCabinetId != null) setOmCabinetHoverState(nextOmCabinetId, true);
      hoverOmCabinetId = nextOmCabinetId;
    }
  }

  function clearHoverTargets() {
    updateHoverTargets(null, null, null, null);
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
      const code = String(feature.properties.code);
      if (isOmCode(code)) return;
      const cabs = App.getCabinetsForDept(code);
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
      if (window.innerWidth <= C.mobileBreakpoint || U.isCoarsePointer() || !e.originalEvent || tooltipRaf) return;
      tooltipRaf = requestAnimationFrame(() => {
        tooltipRaf = null;
        if (!S.map) return;
        const features = S.map.queryRenderedFeatures(e.point, {
          layers: ['cabinets-hit', 'om-cabinets-hit', 'depts-fill', 'om-insets-fill']
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
          updateHoverTargets(null, top.id, null, null);
          html = cabinetTooltipHtml(top);
          show = true;
        } else if (layerId === 'om-cabinets-hit') {
          updateHoverTargets(null, null, null, top.id);
          html = cabinetTooltipHtml(top);
          show = true;
        } else if ((layerId === 'depts-fill' || layerId === 'om-insets-fill') && !S.selectedFeature) {
          const code = String(top.properties.code);
          const cabs = App.getCabinetsForDept(code);
          if (cabs.length) {
            updateHoverTargets(
              layerId === 'depts-fill' ? top.id : null,
              null,
              layerId === 'om-insets-fill' ? top.id : null,
              null
            );
            html = deptTooltipHtml(top, cabs);
            show = true;
          } else {
            updateHoverTargets(null, null, null, null);
          }
        } else {
          updateHoverTargets(null, null, null, null);
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
      hideTooltip();
      const deptFeatures = map.queryRenderedFeatures(e.point, { layers: ['depts-fill', 'om-insets-fill'] });
      const cabFeatures = map.queryRenderedFeatures(e.point, { layers: ['cabinets-hit', 'om-cabinets-hit'] });
      if (!deptFeatures.length && !cabFeatures.length) {
        App.emit('map:selectionCleared', {});
      }
    });
  }

  function buildTooltipFragment() {
    const root = document.createElement('div');
    root.className = 'map-tooltip__header';
    const avatar = document.createElement('span');
    avatar.className = 'map-tooltip__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('div');
    meta.className = 'map-tooltip__meta';
    const title = document.createElement('div');
    title.className = 'map-tooltip__title';
    const text = document.createElement('div');
    text.className = 'map-tooltip__text';
    meta.append(title, text);
    root.append(avatar, meta);
    return { root, avatar, title, text };
  }

  function deptTooltipHtml(feature, cabs) {
    const code = String(feature.properties.code);
    const deptName = App.getDeptName(code);
    const main = cabs[0].properties;
    const color = U.sanitizeColor(main.couleur);
    const { root, avatar, title, text } = buildTooltipFragment();
    root.style.setProperty('--tt-accent', color);
    avatar.style.background = color;
    avatar.textContent = U.initials(main.nom);
    if (cabs.length > 1) {
      const list = cabs.map(c => c.properties.nom).join(', ');
      title.textContent = deptName;
      text.textContent = `${cabs.length} cabinets : ${list}`;
    } else {
      title.textContent = main.nom;
      text.textContent = `Couvre ${deptName}`;
    }
    return root;
  }

  function cabinetTooltipHtml(feature) {
    const p = feature.properties;
    const color = U.sanitizeColor(p.couleur);
    const { root, avatar, title, text } = buildTooltipFragment();
    root.style.setProperty('--tt-accent', color);
    avatar.style.background = color;
    avatar.textContent = U.initials(p.nom);
    title.textContent = p.nom;
    text.textContent = p.adresse || '';
    return root;
  }

  function createOmChipsHTML() {
    const omCodes = ['971', '972', '973', '974', '976', '987', '988'];
    const container = document.createDocumentFragment();
    omCodes.forEach(code => {
      const entry = S.deptIndex.get(code);
      const color = U.sanitizeColor(entry ? entry.color : '');
      const btn = document.createElement('button');
      btn.className = 'om-inset__chip';
      btn.type = 'button';
      btn.dataset.code = code;
      btn.setAttribute('aria-label', `Département ${code}`);
      const dot = document.createElement('span');
      dot.className = 'om-inset__chip-dot';
      dot.style.background = color;
      const codeText = document.createTextNode(code);
      btn.append(dot, codeText);
      container.appendChild(btn);
    });
    return container;
  }

  function bindOmChips(container) {
    container.querySelectorAll('.om-inset__chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        const dept = S.departements.find(d => String(d.properties.code) === code);
        if (!dept || !S.map) return;
        const cabs = App.getCabinetsForDept(code);
        // Les chips outre-mer ouvrent la fiche sans déplacer la carte.
        if (cabs.length === 1) {
          App.emit('map:cabinetClick', { feature: cabs[0], skipMapMove: true });
        } else if (cabs.length > 1) {
          App.emit('map:deptClick', { feature: dept, cabs, skipMapMove: true });
        }
      });
    });
  }

  function initOmInset() {
    const floatContainer = document.getElementById('omInsetChips');
    if (!floatContainer) return;
    const fragment = createOmChipsHTML();
    floatContainer.replaceChildren(fragment);
    bindOmChips(floatContainer);
    updateInsetVisibility();
  }

  function getMobileMapPadding() {
    if (window.innerWidth > C.mobileBreakpoint) {
      // Padding modéré : laisse la zone zoomée centrée et lisible, sans écraser
      // le zoom (un padding trop large rendait le zoom imperceptible).
      return { top: 80, bottom: 60, left: 60, right: 60 };
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
    if (p.outremer_only) {
      // Les cabinets outre-mer uniquement n'ont pas de siège sur la carte principale.
      // Ils sont représentés par des insets et un marqueur schématique ;
      // on ne déplace pas la carte pour rester sur la vue France.
      return;
    }
    // Zoom vers le siège du cabinet (point géocodé) pour un zoom fort et
    // perceptible. Le territoire couvert reste visible via la surbrillance.
    const coords = feature.geometry.coordinates;
    if (coords && coords[0] != null && coords[1] != null) {
      flyTo(coords.slice(), 8);
      return;
    }
    // Fallback : fitBounds sur les départements couverts (siège non géocodé).
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
    updateOmCabinetSelection(cabinetId);
  }

  function resetDeptOpacity() {
    if (!S.map) return;
    S.map.getSource('depts-dim').setData({ type: 'FeatureCollection', features: [] });
    S.map.setFilter('cabinets-selected', ['==', ['get', 'id'], '']);
    updateOmCabinetSelection(null);
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

  function refreshCabinets() {
    if (!S.map) return;
    const src = S.map.getSource('cabinets');
    if (!src) return;
    src.setData({ type: 'FeatureCollection', features: S.cabinets });
  }

  App.map = {
    initMap,
    initOmInset,
    flyToCabinet,
    goToDept,
    resetView,
    recenterMapForMobilePanel,
    highlightCabinetTerritory,
    resetDeptOpacity,
    refreshCabinets,
    setLoaderError,
    hideLoader,
  };
})();
