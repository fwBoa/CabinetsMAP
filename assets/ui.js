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
  const detailBack = document.getElementById('detailBack');
  const sheetDetailView = document.getElementById('sheetDetailView');
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

  // Mobile territory card state
  const SHEET_SNAPS = ['closed', 'open'];
  let sheetSnap = 'closed';
  let sheetMode = 'list'; // 'list' | 'detail'

  function isMobile() { return window.innerWidth <= C.mobileBreakpoint; }

  function setSheetMode(mode) {
    sheetMode = mode === 'detail' ? 'detail' : 'list';
    sidebar.classList.toggle('bottom-sheet--detail', sheetMode === 'detail');
  }

  function setSheetSnap(state, opts = {}) {
    if (!SHEET_SNAPS.includes(state)) state = 'closed';
    sheetSnap = state;
    sidebar.classList.remove('bottom-sheet--closed', 'bottom-sheet--open');
    sidebar.style.height = '';
    sidebar.classList.add(`bottom-sheet--${state}`);

    if (state === 'closed') {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Ouvrir la fiche');
      menuToggle.classList.remove('icon-btn--active');
    } else {
      menuToggle.setAttribute('aria-expanded', 'true');
      menuToggle.setAttribute('aria-label', 'Fermer la fiche');
      menuToggle.classList.add('icon-btn--active');
    }

    if (state !== 'closed' && S.map && opts.recenter !== false) App.map.recenterMapForMobilePanel();
  }

  function openSheet() { setSheetSnap('open'); }
  function closeSheet() { setSheetSnap('closed'); }

  function toggleSheet() {
    if (sheetSnap === 'closed') {
      // Le handle ouvre la liste des cabinets (mode liste par défaut).
      setSheetMode('list');
      sheetDetailView.hidden = true;
      openSheet();
    } else {
      closeSheet();
    }
  }

  function initSheetDrag() {
    if (!sidebarHandle) return;
    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    let moved = false;

    sidebarHandle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSheet();
      }
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
      const maxH = window.innerHeight * 0.55;
      const newHeight = Math.min(maxH, Math.max(44, startHeight + delta));
      sidebar.style.height = `${newHeight}px`;
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      sidebar.style.transition = '';
      document.body.style.userSelect = '';

      if (!moved) {
        toggleSheet();
        return;
      }

      const currentHeight = sidebar.getBoundingClientRect().height;
      const threshold = window.innerHeight * 0.22;
      setSheetSnap(currentHeight < threshold ? 'closed' : 'open');
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
  }

  function renderDetailBody(p) {
    const fragment = document.createDocumentFragment();

    const addressSection = document.createElement('div');
    addressSection.className = 'detail-panel__section';
    const addressTitle = document.createElement('p');
    addressTitle.className = 'detail-panel__section-title';
    addressTitle.textContent = 'Adresse';
    const addressText = document.createElement('p');
    addressText.className = 'detail-panel__text';
    addressText.textContent = p.adresse || 'Adresse non renseignée';
    addressSection.append(addressTitle, addressText);
    fragment.appendChild(addressSection);

    const deptsSection = document.createElement('div');
    deptsSection.className = 'detail-panel__section';
    const deptsTitle = document.createElement('p');
    deptsTitle.className = 'detail-panel__section-title';
    deptsTitle.textContent = 'Départements couverts';
    const deptsWrap = document.createElement('div');
    deptsWrap.className = 'detail-panel__departments';
    if (p.departements && p.departements.length) {
      p.departements.forEach(code => {
        const span = document.createElement('span');
        span.className = 'detail-panel__dept';
        span.textContent = code;
        deptsWrap.appendChild(span);
      });
    } else {
      const none = document.createElement('span');
      none.className = 'detail-panel__text';
      none.textContent = 'Non renseigné';
      deptsWrap.appendChild(none);
    }
    deptsSection.append(deptsTitle, deptsWrap);
    fragment.appendChild(deptsSection);

    if (Array.isArray(p.tribunaux) && p.tribunaux.length) {
      const tribSection = document.createElement('div');
      tribSection.className = 'detail-panel__section';
      const tribTitle = document.createElement('p');
      tribTitle.className = 'detail-panel__section-title';
      tribTitle.textContent = 'Tribunaux de rattachement';
      const tribText = document.createElement('p');
      tribText.className = 'detail-panel__text';
      tribText.textContent = p.tribunaux.join(' · ');
      tribSection.append(tribTitle, tribText);
      fragment.appendChild(tribSection);
    }

    const actionsSection = document.createElement('div');
    actionsSection.className = 'detail-panel__section';
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'detail-panel__actions';

    if (p.adresse) {
      const itineraire = document.createElement('a');
      itineraire.className = 'detail-panel__btn';
      itineraire.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.adresse)}`;
      itineraire.target = '_blank';
      itineraire.rel = 'noopener noreferrer';
      itineraire.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg><span>Itinéraire</span>';
      actionsWrap.appendChild(itineraire);
    }

    if (p.phone) {
      const phone = document.createElement('a');
      phone.className = 'detail-panel__btn';
      phone.href = `tel:${p.phone.replace(/[^\d+]/g, '')}`;
      phone.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${U.escapeHtml(p.phone)}</span>`;
      actionsWrap.appendChild(phone);
    }

    if (p.emails && p.emails.length) {
      const email = document.createElement('a');
      email.className = 'detail-panel__btn';
      email.href = `mailto:${p.emails[0]}`;
      email.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span>${U.escapeHtml(p.emails[0])}</span>`;
      actionsWrap.appendChild(email);
    }

    if (actionsWrap.children.length) {
      actionsSection.appendChild(actionsWrap);
      fragment.appendChild(actionsSection);
    }

    return fragment;
  }

  function renderMobileTerritoryNote(feature, cabs) {
    const fragment = document.createDocumentFragment();
    if (!feature || !feature.properties) return fragment;
    const p = feature.properties;

    const title = document.createElement('h3');
    title.className = 'sheet-detail__title';
    const subtitle = document.createElement('p');
    subtitle.className = 'sheet-detail__subtitle';

    if (p.nom) {
      title.textContent = p.nom;
      subtitle.textContent = `${(p.departements || []).length} départements couverts · Siège : ${p.adresse || 'non renseigné'}`;
    } else {
      const code = String(p.code);
      const deptName = App.getDeptName(code);
      const count = cabs ? cabs.length : 0;
      title.textContent = deptName;
      subtitle.textContent = `${count} cabinet${count > 1 ? 's' : ''} intervient${count > 1 ? 'ent' : ''} sur ce département`;
    }

    fragment.append(title, subtitle);
    return fragment;
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
    avatar.style.background = U.sanitizeColor(p.couleur);
    avatar.textContent = U.initials(p.nom);
    document.getElementById('detailTitle').textContent = p.nom;
    document.getElementById('detailSubtitle').textContent = `${(p.departements || []).length} départements couverts · Siège : ${p.adresse || 'non renseigné'}`;

    const detailBody = document.getElementById('detailBody');
    detailBody.innerHTML = '';
    detailBody.appendChild(renderDetailBody(p));
    // Un cabinet reste dans le detailPanel : pas de bouton 'retour à la liste'.
    if (detailBack) detailBack.hidden = true;

    if (isMobile()) {
      const sheetDetailBody = document.getElementById('sheetDetailBody');
      sheetDetailBody.innerHTML = '';
      sheetDetailBody.appendChild(renderMobileTerritoryNote(feature));
      sheetDetailView.hidden = false;
      setSheetMode('detail');
      setSheetSnap('open', { recenter: false });
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
    avatar.style.background = U.sanitizeColor(getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim());
    avatar.textContent = code;
    document.getElementById('detailTitle').textContent = deptName;
    const count = cabs.length;
    document.getElementById('detailSubtitle').textContent =
      `${count} cabinet${count > 1 ? 's' : ''} intervien${count > 1 ? 'nent' : 't'} sur ce département`;
    // Le detailPanel affiche ici un departement : on propose un retour a la liste.
    if (detailBack && !isMobile()) detailBack.hidden = false;

    const body = document.getElementById('detailBody');
    body.innerHTML = '';
    cabs.forEach(cab => {
      const p = cab.properties;
      const card = document.createElement('div');
      card.className = 'cabinet-card';
      card.dataset.id = p.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.style.marginBottom = '8px';

      const row = document.createElement('div');
      row.className = 'cabinet-card__row';

      const dot = document.createElement('span');
      dot.className = 'cabinet-card__dot';
      dot.style.background = U.sanitizeColor(p.couleur);
      dot.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'cabinet-card__name';
      name.textContent = p.nom;

      row.append(dot, name);

      const meta = document.createElement('span');
      meta.className = 'cabinet-card__meta';
      meta.textContent = p.adresse || '';

      card.append(row, meta);

      const activateCard = () => {
        const selected = App.getCabinetById(card.dataset.id);
        if (selected) selectCabinet(selected);
      };
      card.addEventListener('click', activateCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateCard(); }
      });

      body.appendChild(card);
    });

    if (isMobile()) {
      const sheetDetailBody = document.getElementById('sheetDetailBody');
      sheetDetailBody.innerHTML = '';
      sheetDetailBody.appendChild(renderMobileTerritoryNote(feature, cabs));
      sheetDetailView.hidden = false;
      setSheetMode('detail');
      setSheetSnap('open', { recenter: false });
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
      setSheetMode('list');
      setSheetSnap('closed', { recenter: false });
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

  if (detailBack) {
    detailBack.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Ferme le detailPanel departement et reactive le focus sur la sidebar.
      closeSelection();
      if (typeof openSidebar === 'function') openSidebar();
    });
  }

  sheetDetailClose.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeSelection();
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
      toggleSheet();
    } else {
      toggleSidebar();
    }
  });

  function renderSidebar() {
    document.getElementById('sidebarKpiCabinets').textContent = S.cabinets.length;
    document.getElementById('sidebarKpiDepts').textContent = S.deptIndex.size;
    renderList();
  }

  function getFilteredCabinets() {
    const rawTerm = (S.searchTerm || '').trim();
    if (!rawTerm) return S.cabinets;
    // Tokenisation : on splitte sur les espaces, chaque token doit matcher
    // au moins un champ (AND logique). 'BORDEAUX 33' devient ['bordeaux','33'].
    // Les tokens de moins de 2 caracteres (ex: 'a', '0') sont ignores pour
    // eviter les faux positifs (un 'd' matche presque tout).
    const tokens = U.normalize(rawTerm).split(/\s+/).filter(t => t.length >= 2);
    if (!tokens.length) return S.cabinets;
    return S.cabinets.filter(c => {
      const p = c.properties;
      const deptNames = (p.departements || []).map(code => App.getDeptName(code)).join(' ');
      const deptCodes = (p.departements || []).join(' ');
      // On retire les codes postaux (séquences de 5 chiffres) de l'adresse pour
      // éviter qu'un code postal ne matche à tort un numéro de département.
      const adresseSansCp = (p.adresse || '').replace(/\b\d{5}\b/g, ' ');
      const fields = [p.nom, adresseSansCp, p.phone, deptNames, deptCodes]
        .concat(p.emails || [])
        .concat(p.cours_appel || [])
        .concat(p.tribunaux || [])
        .join(' ');
      const normalizedFields = U.normalize(fields);
      return tokens.every(t => normalizedFields.includes(t));
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

      const title = document.createElement('p');
      title.className = 'sidebar__empty-title';
      title.textContent = 'Aucun cabinet trouvé';

      const text = document.createElement('p');
      text.className = 'sidebar__empty-text';
      text.textContent = 'Essayez une autre recherche.';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn btn--primary';
      resetBtn.id = 'emptyResetBtn';
      resetBtn.type = 'button';
      resetBtn.textContent = 'Tout afficher';

      li.append(title, text, resetBtn);
      list.appendChild(li);
      resetBtn.addEventListener('click', resetAll);
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

      const row = document.createElement('div');
      row.className = 'cabinet-card__row';

      const dot = document.createElement('span');
      dot.className = 'cabinet-card__dot';
      dot.style.background = U.sanitizeColor(p.couleur);
      dot.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'cabinet-card__name';
      name.appendChild(highlightMatch(p.nom, getSearchTokens()));

      row.append(dot, name);

      const meta = document.createElement('span');
      meta.className = 'cabinet-card__meta';
      // Si la recherche matche un tribunal, on l'affiche dans la meta (limite 3)
      // pour que le hit soit visible meme si le nom/adresse ne le contiennent pas.
      const tokens = getSearchTokens();
      const matchedTribunaux = (p.tribunaux || []).filter(t =>
        tokens.some(tok => U.normalize(t).includes(tok))
      ).slice(0, 3);
      const tribunauxSuffix = matchedTribunaux.length
        ? ` · ${matchedTribunaux.join(' · ')}`
        : '';
      meta.appendChild(
        highlightMatch(`${p.adresse || 'Adresse non renseignée'} · ${deptCount} ${deptLabel}${tribunauxSuffix}`, tokens)
      );

      btn.append(row, meta);
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

  // Met en evidence les occurrences des tokens de recherche dans un texte.
  // Retourne un DocumentFragment avec des <mark> autour des matches.
  // Si pas de token ou aucun match, retourne un textNode simple.
  function highlightMatch(text, tokens) {
    if (!text || !tokens || !tokens.length) {
      return document.createTextNode(text || '');
    }
    const normalizedText = U.normalize(text);
    // On cherche les positions de chaque token dans le texte normalise,
    // puis on reporte ces positions sur le texte original.
    const ranges = [];
    tokens.forEach(token => {
      let from = 0;
      while (true) {
        const idx = normalizedText.indexOf(token, from);
        if (idx === -1) break;
        ranges.push([idx, idx + token.length]);
        from = idx + token.length;
      }
    });
    if (!ranges.length) return document.createTextNode(text);
    // Fusionner les ranges qui se chevauchent pour eviter les <mark> imbriques
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) {
        last[1] = Math.max(last[1], ranges[i][1]);
      } else {
        merged.push(ranges[i].slice());
      }
    }
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    merged.forEach(([start, end]) => {
      if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(start, end);
      fragment.appendChild(mark);
      cursor = end;
    });
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    return fragment;
  }

  // Renvoie les tokens normalises de la recherche courante (>= 2 chars).
  function getSearchTokens() {
    const raw = (S.searchTerm || '').trim();
    if (!raw) return [];
    return U.normalize(raw).split(/\s+/).filter(t => t.length >= 2);
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

  document.getElementById('resetFiltersBtn').addEventListener('click', resetAll);
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    closeSelection();
    resetAll();
    App.map.resetView();
  });

  document.getElementById('omTrigger').addEventListener('click', () => {
    if (!S.map) return;
    // Recentrage sur l'ensemble des outremers (Antilles, Réunion, Pacifique).
    // Voir OM_INSET_GROUPS pour les coordonnées de chaque cluster.
    S.map.jumpTo({ center: C.OM_OVERVIEW_CENTER, zoom: C.OM_OVERVIEW_ZOOM });
    U.announce('Vue centrée sur les départements et régions d\'outre-mer.');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      let handled = false;
      if (!detailPanel.classList.contains('detail-panel--hidden')) {
        closeSelection();
        handled = true;
      }
      if (isMobile() && sheetSnap !== 'closed') {
        closeSelection();
        menuToggle.focus();
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
    } else {
      detailPanel.classList.remove('detail-panel--mobile-hidden');
      sidebar.classList.remove('bottom-sheet', 'bottom-sheet--closed', 'bottom-sheet--open');
      sidebar.classList.remove('bottom-sheet--detail');
      sidebar.style.height = '';
      // Sur desktop, le bottom-sheet mobile n'est pas utilisé : on s'assure
      // qu'aucun reliquat (mode detail, body rempli) ne fuit dans la sidebar.
      sheetDetailView.hidden = true;
      // Préserver le snap en cours (closed/peek/half/full) au lieu de forcer
      // 'peek' : permet de garder le choix utilisateur quand un futur mécanisme
      // (resize handle, bouton, etc.) activera les snaps intermédiaires.
      const desktopSnap = sidebarSnap === 'closed' ? 'closed' : sidebarSnap;
      setSidebarSnap(desktopSnap, { recenter: false });
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
    setSheetSnap,
  };
})();
