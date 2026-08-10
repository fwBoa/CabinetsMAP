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

  function openSidebar() {
    sidebar.classList.remove('sidebar--closed');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Fermer la liste');
    menuToggle.classList.add('icon-btn--active');
  }

  function closeSidebar() {
    sidebar.classList.add('sidebar--closed');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Ouvrir la liste');
    menuToggle.classList.remove('icon-btn--active');
  }

  function toggleSidebar() {
    sidebar.classList.contains('sidebar--closed') ? openSidebar() : closeSidebar();
  }

  menuToggle.addEventListener('click', toggleSidebar);
  sidebarHandle.addEventListener('click', toggleSidebar);
  sidebarHandle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSidebar(); }
  });

  function openBottomSheet() {
    detailPanel.classList.remove('detail-panel--hidden', 'detail-panel--snap-open');
    detailPanel.classList.add('detail-panel--snap-peek');
    detailPanel.style.height = '';
  }

  function closeBottomSheet() {
    detailPanel.classList.add('detail-panel--hidden');
    detailPanel.classList.remove('detail-panel--snap-open', 'detail-panel--snap-peek');
    detailPanel.style.height = '';
  }

  function initBottomSheet() {
    const handle = document.getElementById('detailPanelHandle');
    if (!handle) return;
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    function onStart(clientY) {
      isDragging = true;
      startY = clientY;
      startHeight = detailPanel.getBoundingClientRect().height;
      detailPanel.style.transition = 'none';
      document.body.style.userSelect = 'none';
    }

    function onMove(clientY) {
      if (!isDragging) return;
      const delta = startY - clientY;
      const newHeight = Math.min(window.innerHeight * 0.85, Math.max(80, startHeight + delta));
      detailPanel.style.height = `${newHeight}px`;
    }

    function onEnd(clientY) {
      if (!isDragging) return;
      isDragging = false;
      detailPanel.style.transition = '';
      document.body.style.userSelect = '';
      const delta = startY - clientY;
      const currentHeight = detailPanel.getBoundingClientRect().height;
      const vh = window.innerHeight;
      const openThreshold = vh * 0.55;
      const closeThreshold = vh * 0.22;

      if (delta < -40 || currentHeight > openThreshold) {
        detailPanel.classList.add('detail-panel--snap-open');
        detailPanel.classList.remove('detail-panel--snap-peek');
        detailPanel.style.height = '';
      } else if (delta > 40 || currentHeight < closeThreshold) {
        closeSelection();
      } else {
        detailPanel.classList.remove('detail-panel--snap-open');
        detailPanel.classList.add('detail-panel--snap-peek');
        detailPanel.style.height = '';
        App.map.recenterMapForMobilePanel();
      }
    }

    handle.addEventListener('pointerdown', (e) => {
      onStart(e.clientY);
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (isDragging) e.preventDefault();
      onMove(e.clientY);
    });
    handle.addEventListener('pointerup', (e) => onEnd(e.clientY));
    handle.addEventListener('pointercancel', () => {
      isDragging = false;
      detailPanel.style.transition = '';
      document.body.style.userSelect = '';
    });
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

  function highlightCabinet(feature) {
    if (!feature || !feature.properties) return;
    S.selectedFeature = feature;
    S.activeCabinetId = feature.properties.id;

    clearActiveCard();
    activateSidebarCard(S.activeCabinetId);
    App.map.highlightCabinetTerritory(S.activeCabinetId);
    showCabinetDetail(feature);

    U.announce(`${feature.properties.nom}, ${feature.properties.adresse || 'adresse non renseignée'}`);

    if (window.innerWidth <= C.mobileBreakpoint) {
      closeSidebar();
    }
  }

  function selectCabinet(feature) {
    if (!feature || !feature.properties) return;
    highlightCabinet(feature);
    App.emit('ui:selectCabinet', { feature });
  }

  function showCabinetDetail(feature) {
    const p = feature.properties;
    const avatar = document.getElementById('detailAvatar');
    avatar.style.background = p.couleur;
    avatar.textContent = U.initials(p.nom);
    document.getElementById('detailTitle').textContent = p.nom;
    document.getElementById('detailSubtitle').textContent = `${(p.departements || []).length} départements couverts · Siège : ${p.adresse || 'non renseigné'}`;

    const body = document.getElementById('detailBody');
    const deptsHtml = (p.departements || []).map(code => `<span class="detail-panel__dept">${code}</span>`).join('');

    const contactButtons = [];
    if (p.phone) {
      contactButtons.push(`<a class="detail-panel__btn" href="tel:${p.phone.replace(/[^\d+]/g, '')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${p.phone}</a>`);
    }
    if (p.emails && p.emails.length) {
      contactButtons.push(`<a class="detail-panel__btn" href="mailto:${p.emails[0]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${p.emails[0]}</a>`);
    }

    const tribunauxNote = (Array.isArray(p.tribunaux) && p.tribunaux.length)
      ? `<div class="detail-panel__section">
           <p class="detail-panel__section-title">Tribunaux de rattachement</p>
           <p class="detail-panel__text">${p.tribunaux.join(' · ')}</p>
         </div>`
      : '';

    body.innerHTML = `
      <div class="detail-panel__section">
        <p class="detail-panel__section-title">Adresse</p>
        <p class="detail-panel__text">${p.adresse || 'Adresse non renseignée'}</p>
      </div>
      <div class="detail-panel__section">
        <p class="detail-panel__section-title">Départements couverts</p>
        <div class="detail-panel__departments">${deptsHtml || '<span class="detail-panel__text">Non renseigné</span>'}</div>
      </div>
      ${tribunauxNote}
      <div class="detail-panel__section">
        <div class="detail-panel__actions">
          ${p.adresse ? `<a class="detail-panel__btn" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.adresse)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>Itinéraire</a>` : ''}
          ${contactButtons.join('')}
        </div>
      </div>
    `;

    openBottomSheet();
    if (window.innerWidth <= C.mobileBreakpoint) {
      closeSidebar();
      App.map.recenterMapForMobilePanel();
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

    openBottomSheet();
    if (window.innerWidth <= C.mobileBreakpoint) {
      closeSidebar();
      App.map.recenterMapForMobilePanel();
    }
  }

  function closeSelection() {
    S.selectedFeature = null;
    S.activeCabinetId = null;
    clearActiveCard();
    closeBottomSheet();
    App.emit('ui:clearSelection', {});
  }

  detailClose.addEventListener('click', closeSelection);

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
        }
      });
      btn.addEventListener('mouseleave', () => {
        const id = btn.dataset.id;
        btn.classList.remove('cabinet-card--hover');
        if (S.map) {
          S.map.setFeatureState({ source: 'cabinets', id }, { hover: false });
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

  function resetAll() {
    searchInput.value = '';
    S.searchTerm = '';
    searchClear.hidden = true;
    renderList();
    U.announce('Recherche réinitialisée.');
  }

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
        if (window.innerWidth <= C.mobileBreakpoint) closeSidebar();
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
    S.map.flyTo({ center: C.OM_CENTER, zoom: C.OM_ZOOM, speed: 0.8, curve: 1.2 });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      let handled = false;
      if (!detailPanel.classList.contains('detail-panel--hidden')) {
        closeSelection();
        handled = true;
      }
      if (window.innerWidth <= C.mobileBreakpoint && !sidebar.classList.contains('sidebar--closed')) {
        closeSidebar();
        menuToggle.focus();
        handled = true;
      }
      if (handled) e.preventDefault();
    }
  });

  function updateSidebarForViewport() {
    if (window.innerWidth > C.mobileBreakpoint) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }
  window.addEventListener('resize', U.debounce(updateSidebarForViewport, 150));

  App.on('map:loaded', () => {
    renderSidebar();
    App.map.initOmInset();
  });

  App.on('map:cabinetClick', ({ feature }) => {
    if (feature) highlightCabinet(feature);
  });

  App.on('map:cabinetDblClick', ({ feature }) => {
    if (feature) selectCabinet(feature);
  });

  App.on('map:deptClick', ({ feature, cabs }) => {
    if (feature && cabs) showDeptDetail(feature, cabs);
  });

  App.on('map:selectionCleared', () => {
    closeSelection();
  });

  App.on('ui:resetSearch', () => {
    resetAll();
  });

  if (window.innerWidth > C.mobileBreakpoint) {
    openSidebar();
  } else {
    closeSidebar();
  }

  initBottomSheet();

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
  };
})();
