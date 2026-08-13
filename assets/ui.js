(function () {
  'use strict';

  const App = window.App;
  const S = App.state;
  const U = App.utils;
  const C = App.config;

  const sidebar = document.getElementById('sidebar');
  const sidebarHandle = document.getElementById('sidebarHandle');
  const menuToggle = document.getElementById('menuToggle');
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const detailPanel = document.getElementById('detailPanel');
  const detailClose = document.getElementById('detailClose');
  const sheetDetailView = document.getElementById('sheetDetailView');
  const sheetDetailBack = document.getElementById('sheetDetailBack');
  const sheetDetailExpand = document.getElementById('sheetDetailExpand');
  const sheetDetailClose = document.getElementById('sheetDetailClose');

  // Desktop sidebar state
  let sidebarSnap = 'peek';
  const SIDEBAR_SNAPS = ['closed', 'peek', 'half', 'full'];

  function setSidebarSnap(state, opts = {}) {
    if (!SIDEBAR_SNAPS.includes(state)) state = 'peek';
    sidebarSnap = state;
    sidebar.classList.remove('sidebar--closed', 'sidebar--peek', 'sidebar--half', 'sidebar--full');
    sidebar.style.height = '';
    sidebar.classList.add(`sidebar--${state}`);
    const isOpen = state !== 'closed';
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Fermer la liste' : 'Ouvrir la liste');
    menuToggle.classList.toggle('icon-btn--active', isOpen);
    if (isOpen && S.map && opts.recenter !== false) App.map.recenterMapForMobilePanel();
  }

  function openSidebar() { setSidebarSnap('peek'); }
  function closeSidebar() { setSidebarSnap('closed'); }
  function expandSidebarHalf() { setSidebarSnap('half'); }
  function expandSidebarFull() { setSidebarSnap('full'); }

  function toggleSidebar() {
    setSidebarSnap(sidebarSnap === 'closed' ? 'peek' : 'closed');
  }

  // Mobile single-sheet state
  const SHEET_SNAPS = ['closed', 'peek', 'half', 'full'];
  let sheetSnap = 'peek';
  const SHEET_HEIGHTS = { closed: 44, peek: 180, half: 0.55, full: 0.75 };

  function isMobile() { return window.innerWidth <= C.mobileBreakpoint; }

  function setSheetSnap(state, opts = {}) {
    if (!SHEET_SNAPS.includes(state)) state = 'peek';
    sheetSnap = state;
    sidebar.classList.remove('bottom-sheet--closed', 'bottom-sheet--peek', 'bottom-sheet--half', 'bottom-sheet--full');
    sidebar.style.height = '';
    sidebar.classList.add(`bottom-sheet--${state}`);

    if (state === 'closed') {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Ouvrir la liste');
      menuToggle.classList.remove('icon-btn--active');
    } else {
      menuToggle.setAttribute('aria-expanded', 'true');
      menuToggle.setAttribute('aria-label', 'Fermer la liste');
      menuToggle.classList.add('icon-btn--active');
    }

    if (state !== 'closed' && S.map && opts.recenter !== false) App.map.recenterMapForMobilePanel();
  }

  function openSheet() { setSheetSnap('peek'); }
  function closeSheet() { setSheetSnap('closed'); }
  function expandSheetHalf() { setSheetSnap('half'); }
  function expandSheetFull() { setSheetSnap('full'); }

  function cycleSheetSnap() {
    if (sheetSnap === 'closed') { setSheetSnap('peek'); return; }
    const idx = SHEET_SNAPS.indexOf(sheetSnap);
    setSheetSnap(SHEET_SNAPS[(idx + 1) % SHEET_SNAPS.length]);
  }

  function initSheetDrag() {
    if (!sidebarHandle) return;
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    let moved = false;

    sidebarHandle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleSheetSnap(); }
    });

    function onStart(clientY) {
      isDragging = true;
      moved = false;
      startY = clientY;
      startHeight = sidebar.getBoundingClientRect().height;
      sidebar.style.transition = 'none';
      document.body.style.userSelect = 'none';
    }

    function onMove(clientY) {
      if (!isDragging) return;
      if (Math.abs(clientY - startY) > 3) moved = true;
      const delta = startY - clientY;
      const maxH = window.innerHeight * 0.92;
      const newHeight = Math.min(maxH, Math.max(44, startHeight + delta));
      sidebar.style.height = `${newHeight}px`;
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      sidebar.style.transition = '';
      document.body.style.userSelect = '';

      if (!moved) {
        cycleSheetSnap();
        return;
      }

      const currentHeight = sidebar.getBoundingClientRect().height;
      const vh = window.innerHeight;

      const targets = [
        { key: 'closed', height: SHEET_HEIGHTS.closed },
        { key: 'peek', height: SHEET_HEIGHTS.peek },
        { key: 'half', height: Math.round(vh * SHEET_HEIGHTS.half) },
        { key: 'full', height: Math.round(vh * SHEET_HEIGHTS.full) }
      ];
      let nearest = targets.reduce((best, t) => {
        const dist = Math.abs(currentHeight - t.height);
        return dist < best.dist ? { key: t.key, dist } : best;
      }, { key: 'peek', dist: Infinity });

      setSheetSnap(nearest.key);
    }

    sidebarHandle.addEventListener('pointerdown', (e) => {
      onStart(e.clientY);
      sidebarHandle.setPointerCapture(e.pointerId);
    });
    sidebarHandle.addEventListener('pointermove', (e) => {
      if (isDragging) e.preventDefault();
      onMove(e.clientY);
    });
    sidebarHandle.addEventListener('pointerup', (e) => onEnd(e.clientY));
    sidebarHandle.addEventListener('pointercancel', () => {
      isDragging = false;
      sidebar.style.transition = '';
      document.body.style.userSelect = '';
    });
  }

  function syncPanelState(state, opts = {}) {
    if (isMobile()) {
      setSheetSnap(state, opts);
    } else {
      setSidebarSnap(state === 'closed' ? 'closed' : 'peek', opts);
    }
  }

  function activateSidebarCard(id) {
    clearActiveCard();
    const card = document.querySelector(`.cabinet-card[data-id="${id}"]`);
    if (!card) return;
    card.classList.add('cabinet-card--active');
    if (!U.prefersReducedMotion()) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      card.scrollIntoView({ block: 'nearest' });
    }
  }

  function clearActiveCard() {
    document.querySelectorAll('.cabinet-card').forEach(btn => btn.classList.remove('cabinet-card--active', 'cabinet-card--hover'));
    document.querySelectorAll('.legend__item').forEach(item => item.classList.remove('legend__item--active'));
  }

  function renderDetailBody(p) {
    const deptsHtml = (p.departements || []).map(code => `<span class="detail-panel__dept">${code}</span>`).join('');

    return `
      <div class="detail-panel__section">
        <p class="detail-panel__section-title">Départements couverts</p>
        <div class="detail-panel__departments">${deptsHtml || '<span class="detail-panel__text">Non renseigné</span>'}</div>
      </div>
    `;
  }

  function renderMobileDetailBody(p) {
    const deptsHtml = (p.departements || []).map(code => `<span class="sheet-detail__dept">${code}</span>`).join('');
    const phone = p.phone ? p.phone.replace(/[^\d+]/g, '') : null;

    return `
      ${p.adresse ? `<a class="sheet-detail__row sheet-detail__link" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.adresse)}" target="_blank" rel="noopener noreferrer">
        <span class="sheet-detail__label">Adresse</span>
        <span class="sheet-detail__value">${p.adresse}</span>
      </a>` : ''}
      ${phone ? `<a class="sheet-detail__row sheet-detail__link" href="tel:${phone}">
        <span class="sheet-detail__label">Téléphone</span>
        <span class="sheet-detail__value">${p.phone}</span>
      </a>` : ''}
      ${p.emails && p.emails.length ? `<a class="sheet-detail__row sheet-detail__link" href="mailto:${p.emails[0]}">
        <span class="sheet-detail__label">Email</span>
        <span class="sheet-detail__value">${p.emails[0]}</span>
      </a>` : ''}
      <div class="sheet-detail__row">
        <span class="sheet-detail__label">Départements couverts</span>
        <div class="sheet-detail__departments">${deptsHtml || '<span class="sheet-detail__value">Non renseigné</span>'}</div>
      </div>
    `;
  }

  function highlightCabinet(feature) {
    if (!feature || !feature.properties) return;
    S.selectedFeature = feature;
    S.activeCabinetId = feature.properties.id;

    clearActiveCard();
    activateSidebarCard(S.activeCabinetId);
    App.map.highlightCabinetTerritory(S.activeCabinetId);
    showCabinetDetail(feature);

    U.announce(`${feature.properties.nom}, ${feature.properties.adresse || 'adresse non renseignée'}`);
  }

  function selectCabinet(feature) {
    if (!feature || !feature.properties) return;
    highlightCabinet(feature);
    App.emit('ui:selectCabinet', { feature });
  }

  function showCabinetDetail(feature) {
    const p = feature.properties;

    // Desktop detail panel
    const avatar = document.getElementById('detailAvatar');
    avatar.style.background = p.couleur;
    avatar.textContent = U.initials(p.nom);
    document.getElementById('detailTitle').textContent = p.nom;
    document.getElementById('detailSubtitle').textContent = `${(p.departements || []).length} départements couverts · Siège : ${p.adresse || 'non renseigné'}`;
    document.getElementById('detailBody').innerHTML = renderDetailBody(p);

    if (isMobile()) {
      document.getElementById('sheetDetailBody').innerHTML = renderMobileDetailBody(p);
      sheetDetailView.hidden = false;
      setSheetSnap('half', { recenter: false });
    } else {
      setSidebarSnap('peek', { recenter: false });
      setDetailSnap('peek', { recenter: false });
    }
  }

  function showDeptDetail(feature, cabs) {
    const code = String(feature.properties.code);
    const deptName = App.getDeptName(code);
    S.activeCabinetId = null;
    S.selectedFeature = null;
    clearActiveCard();

    const avatar = document.getElementById('detailAvatar');
    avatar.style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    avatar.textContent = code;
    document.getElementById('detailTitle').textContent = deptName;
    document.getElementById('detailSubtitle').textContent = `${cabs.length} cabinets interviennent sur ce département`;

    const body = document.getElementById('detailBody');
    body.innerHTML = cabs.map(cab => {
      const p = cab.properties;
      return `
        <div class="cabinet-card" data-id="${p.id}" role="button" tabindex="0" style="margin-bottom:8px;">
          <div class="cabinet-card__row">
            <span class="cabinet-card__dot" style="background:${p.couleur}" aria-hidden="true"></span>
            <span class="cabinet-card__name">${p.nom}</span>
          </div>
          <span class="cabinet-card__meta">${p.adresse || ''}</span>
        </div>
      `;
    }).join('');

    body.querySelectorAll('.cabinet-card').forEach(card => {
      const activateCard = () => {
        const cab = App.getCabinetById(card.dataset.id);
        if (cab) selectCabinet(cab);
      };
      card.addEventListener('click', activateCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateCard(); }
      });
    });

    if (isMobile()) {
      // On mobile, department detail is just the list of cabinets in the same sheet list.
      sheetDetailView.hidden = true;
      setSheetSnap('half', { recenter: false });
    } else {
      setDetailSnap('peek', { recenter: false });
    }
  }

  function setDetailSnap(state, opts = {}) {
    detailPanel.classList.remove('detail-panel--peek', 'detail-panel--half', 'detail-panel--full', 'detail-panel--hidden');
    detailPanel.style.height = '';
    detailPanel.classList.add(`detail-panel--${state}`);
    if (state !== 'hidden' && S.map && opts.recenter !== false) App.map.recenterMapForMobilePanel();
  }

  function closeBottomSheet() {
    setDetailSnap('hidden');
  }

  function closeSelection() {
    S.selectedFeature = null;
    S.activeCabinetId = null;
    clearActiveCard();
    closeBottomSheet();
    if (isMobile()) {
      sheetDetailView.hidden = true;
      setSheetSnap('half', { recenter: false });
    } else {
      setSidebarSnap('peek', { recenter: false });
    }
    App.emit('ui:clearSelection', {});
  }

  function resetAll() {
    searchInput.value = '';
    S.searchTerm = '';
    searchClear.hidden = true;
    renderList();
    U.announce('Recherche réinitialisée.');
  }

  detailClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSelection();
  });

  sheetDetailClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSelection();
  });

  sheetDetailExpand.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile()) setSheetSnap('full', { recenter: false });
  });

  sheetDetailBack.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile()) {
      sheetDetailView.hidden = true;
      setSheetSnap('half', { recenter: false });
    }
  });

  detailPanel.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.detail-panel__close');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeSelection();
    }
  });

  menuToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile()) {
      setSheetSnap(sheetSnap === 'closed' ? 'peek' : 'closed');
    } else {
      toggleSidebar();
    }
  });

  function renderSidebar() {
    document.getElementById('sidebarKpiCabinets').textContent = S.cabinets.length;
    document.getElementById('sidebarKpiDepts').textContent = S.deptIndex.size;
    renderList();
    renderLegend();
  }

  function getFilteredCabinets() {
    const term = U.normalize(S.searchTerm);
    if (!term) return S.cabinets;
    return S.cabinets.filter(c => {
      const p = c.properties;
      const depts = (p.departements || []).map(code => App.getDeptName(code)).join(' ');
      const fields = [p.nom, p.adresse, p.phone, depts].concat(p.emails || []).concat(p.cours_appel || []).join(' ');
      return U.normalize(fields).includes(term);
    });
  }

  function renderList() {
    const list = document.getElementById('cabinetList');
    const filtered = getFilteredCabinets();
    list.innerHTML = '';
    updateResultCount(filtered.length);

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'sidebar__empty';
      li.setAttribute('role', 'status');
      li.innerHTML = `
        <p class="sidebar__empty-title">Aucun cabinet trouvé</p>
        <p class="sidebar__empty-text">Essayez une autre recherche.</p>
        <button class="btn btn--primary" id="emptyResetBtn" type="button">Tout afficher</button>
      `;
      list.appendChild(li);
      li.querySelector('#emptyResetBtn').addEventListener('click', resetAll);
      U.announce('Aucun cabinet ne correspond à la recherche.');
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((f, index) => {
      const p = f.properties;
      const li = document.createElement('li');
      li.className = 'sidebar__item';
      li.style.setProperty('--index', index);
      const btn = document.createElement('button');
      btn.className = 'cabinet-card';
      btn.type = 'button';
      btn.dataset.id = p.id;
      const label = [p.nom, p.adresse].filter(Boolean).join(', ');
      btn.setAttribute('aria-label', label);
      const deptCount = (p.departements || []).length;
      const deptLabel = deptCount > 1 ? 'départements' : 'département';
      btn.innerHTML = `
        <div class="cabinet-card__row">
          <span class="cabinet-card__dot" style="background:${p.couleur}" aria-hidden="true"></span>
          <span class="cabinet-card__name">${p.nom}</span>
        </div>
        <span class="cabinet-card__meta">${p.adresse || 'Adresse non renseignée'} · ${deptCount} ${deptLabel}</span>
      `;
      li.appendChild(btn);
      fragment.appendChild(li);
    });
    list.appendChild(fragment);

    bindCardHoverSync();
    U.announce(`${filtered.length} cabinet${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}.`);
  }

  function updateResultCount(count) {
    const plural = count > 1 ? 's' : '';
    document.getElementById('resultCount').textContent = `${count} cabinet${plural}`;
    document.getElementById('resetFiltersBtn').hidden = !S.searchTerm;
  }

  function bindCardHoverSync() {
    document.querySelectorAll('.cabinet-card').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        const id = btn.dataset.id;
        document.querySelectorAll('.cabinet-card').forEach(b => b.classList.remove('cabinet-card--hover'));
        btn.classList.add('cabinet-card--hover');
        if (S.map) {
          S.map.setFeatureState({ source: 'cabinets', id }, { hover: true });
          S.map.setFeatureState({ source: 'om-cabinets', id }, { hover: true });
        }
      });
      btn.addEventListener('mouseleave', () => {
        const id = btn.dataset.id;
        btn.classList.remove('cabinet-card--hover');
        if (S.map) {
          S.map.setFeatureState({ source: 'cabinets', id }, { hover: false });
          S.map.setFeatureState({ source: 'om-cabinets', id }, { hover: false });
        }
      });
    });
  }

  document.getElementById('cabinetList').addEventListener('click', (e) => {
    const card = e.target.closest('.cabinet-card');
    if (!card) return;
    const feature = App.getCabinetById(card.dataset.id);
    if (feature) highlightCabinet(feature);
  });

  document.getElementById('cabinetList').addEventListener('dblclick', (e) => {
    const card = e.target.closest('.cabinet-card');
    if (!card) return;
    const feature = App.getCabinetById(card.dataset.id);
    if (feature) selectCabinet(feature);
  });

  const handleSearch = U.debounce((value) => {
    S.searchTerm = value;
    renderList();
  }, 120);

  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
    searchClear.hidden = !e.target.value.trim();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    S.searchTerm = '';
    searchClear.hidden = true;
    renderList();
  });

  function renderLegend() {
    const legend = document.getElementById('cabinetLegend');
    legend.innerHTML = '<p class="legend__title">Cabinets par couleur</p>';
    const items = document.createElement('div');
    items.className = 'legend__items';
    S.cabinets.forEach(cab => {
      const p = cab.properties;
      const item = document.createElement('button');
      item.className = 'legend__item';
      item.type = 'button';
      item.title = `Voir ${p.nom}`;
      item.dataset.id = p.id;
      item.innerHTML = `<span class="legend__swatch" style="background:${p.couleur}" aria-hidden="true"></span><span>${p.nom}</span>`;
      item.addEventListener('click', () => {
        selectCabinet(cab);
        if (isMobile()) setSheetSnap('full', { recenter: false });
      });
      items.appendChild(item);
    });
    legend.appendChild(items);
  }

  document.getElementById('resetFiltersBtn').addEventListener('click', resetAll);
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    closeSelection();
    resetAll();
    App.map.resetView();
  });

  document.getElementById('omTrigger').addEventListener('click', () => {
    if (!S.map) return;
    S.map.jumpTo({ center: C.FRANCE_CENTER, zoom: C.FRANCE_ZOOM });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      let handled = false;
      if (!detailPanel.classList.contains('detail-panel--hidden')) {
        closeSelection();
        handled = true;
      }
      if (isMobile() && sheetSnap !== 'closed') {
        if (!sheetDetailView.hidden) {
          sheetDetailView.hidden = true;
          setSheetSnap('half', { recenter: false });
        } else {
          closeSheet();
          menuToggle.focus();
        }
        handled = true;
      } else if (!isMobile() && !sidebar.classList.contains('sidebar--closed')) {
        closeSidebar();
        menuToggle.focus();
        handled = true;
      }
      if (handled) e.preventDefault();
    }
  });

  function updateLayoutForViewport() {
    if (isMobile()) {
      detailPanel.classList.add('detail-panel--mobile-hidden');
      sidebar.classList.remove('sidebar--closed', 'sidebar--peek', 'sidebar--half', 'sidebar--full');
      sidebar.classList.add('bottom-sheet', `bottom-sheet--${sheetSnap}`);
      if (S.selectedFeature && sheetSnap !== 'full') {
        sheetDetailView.hidden = false;
        setSheetSnap('full', { recenter: false });
      }
    } else {
      detailPanel.classList.remove('detail-panel--mobile-hidden');
      sidebar.classList.remove('bottom-sheet', 'bottom-sheet--closed', 'bottom-sheet--peek', 'bottom-sheet--half', 'bottom-sheet--full');
      sidebar.style.height = '';
      setSidebarSnap(sidebarSnap === 'closed' ? 'closed' : 'peek', { recenter: false });
      if (S.selectedFeature) {
        setDetailSnap('peek', { recenter: false });
      } else {
        setDetailSnap('hidden');
      }
    }
  }
  window.addEventListener('resize', U.debounce(updateLayoutForViewport, 150));

  App.on('map:loaded', () => {
    renderSidebar();
    App.map.initOmInset();
  });

  App.on('map:cabinetClick', ({ feature, skipMapMove }) => {
    if (!feature) return;
    if (isMobile() && !skipMapMove) {
      App.map.flyToCabinet(feature);
    }
    highlightCabinet(feature);
  });

  App.on('map:cabinetDblClick', ({ feature }) => {
    if (feature) selectCabinet(feature);
  });

  App.on('map:deptClick', ({ feature, cabs, skipMapMove }) => {
    if (!feature || !cabs) return;
    if (isMobile() && !skipMapMove) {
      App.map.goToDept(String(feature.properties.code), 8);
    }
    showDeptDetail(feature, cabs);
  });

  App.on('map:selectionCleared', () => {
    closeSelection();
  });

  App.on('ui:resetSearch', () => {
    resetAll();
  });

  initSheetDrag();
  updateLayoutForViewport();

  App.ui = {
    renderSidebar,
    renderList,
    highlightCabinet,
    selectCabinet,
    showCabinetDetail,
    showDeptDetail,
    closeSelection,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    resetAll,
    activateSidebarCard,
    clearActiveCard,
    openSheet,
    closeSheet,
    expandSheetHalf,
    expandSheetFull,
    setSheetSnap,
  };
})();
