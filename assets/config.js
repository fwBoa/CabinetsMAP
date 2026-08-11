(function () {
  'use strict';

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');

  window.App = {
    state: {
      cabinets: [],
      departements: [],
      deptIndex: new Map(),
      cabinetById: new Map(),
      map: null,
      mapLoaded: false,
      selectedFeature: null,
      activeCabinetId: null,
      searchTerm: '',
      hoveredDeptId: null,
      hoverPopup: null,
      isErrorState: false,
    },

    config: {
      IGN_STYLE: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        sources: {},
        layers: [{
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#f8fafc' }
        }]
      },
      colors: {
        bg: '#f8fafc',
        uncovered: '#f8fafc',
        dim: '#ffffff',
        dimOpacity: 0.55,
      },
      mobileBreakpoint: 768,
      OM_CENTER: [-60, 15],
      OM_ZOOM: 4.5,
      FRANCE_CENTER: [2.5, 46.6],
      FRANCE_ZOOM: 5.2,
      OM_INSET_GROUPS: {
        antilles: {
          title: 'Antilles-Guyane',
          codes: ['971', '972', '973'],
          target: [5.5, 50.8],
          slots: [[-1.05, 0.45], [1.05, 0.45], [0, -0.95]]
        },
        ocean: {
          title: 'Océan Indien',
          codes: ['974', '976'],
          target: [9.5, 40.5],
          slots: [[-0.85, 0], [0.85, 0]]
        },
        pacifique: {
          title: 'Pacifique',
          codes: ['987', '988'],
          target: [-3, 41],
          slots: [[-0.85, 0], [0.85, 0]]
        }
      },
      OM_INSET_JUMP_THRESHOLD_DEG: 35,
      OM_INSET_MAX_SLOT_SIZE: 1.3,
      OM_INSET_MIN_SCALE: 0.03,
    },

    events: {},

    on(name, fn) {
      (this.events[name] ||= []).push(fn);
    },

    off(name, fn) {
      const list = this.events[name];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },

    emit(name, data) {
      (this.events[name] || []).forEach(fn => {
        try {
          fn(data);
        } catch (err) {
          console.error('Event bus error in', name, err);
        }
      });
    },

    utils: {
      announce(message) {
        const region = document.getElementById('ariaRegion');
        if (!region) return;
        region.textContent = '';
        requestAnimationFrame(() => { region.textContent = message; });
      },

      debounce(fn, delay) {
        let t;
        return (...args) => {
          clearTimeout(t);
          t = setTimeout(() => fn(...args), delay);
        };
      },

      normalize(str) {
        return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      },

      initials(name) {
        return String(name).split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
      },

      polygonCentroid(geometry) {
        const coords = geometry.type === 'Polygon' ? geometry.coordinates[0]
          : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0]
          : [];
        if (!coords.length) return [0, 0];
        let x = 0, y = 0;
        coords.forEach(([lon, lat]) => { x += lon; y += lat; });
        return [x / coords.length, y / coords.length];
      },

      prefersReducedMotion() {
        return motionQuery.matches;
      },

      isCoarsePointer() {
        return coarseQuery.matches;
      },
    }
  };

  // Data accessors rely on App.state; exposed as App methods for convenience.
  window.App.getDeptName = function (code) {
    const f = window.App.state.departements.find(d => String(d.properties.code) === String(code));
    return f ? f.properties.nom : code;
  };

  window.App.getCabinetsForDept = function (code) {
    const entry = window.App.state.deptIndex.get(code);
    if (!entry) return [];
    return entry.cabinetIds.map(id => window.App.state.cabinetById.get(id)).filter(Boolean);
  };

  window.App.getCabinetById = function (id) {
    return window.App.state.cabinetById.get(id);
  };

  window.App.getDeptColor = function (code) {
    const entry = window.App.state.deptIndex.get(code);
    return entry ? entry.color : '#e8e4ea';
  };
})();
