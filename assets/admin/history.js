// assets/admin/history.js
// Sheet d'historique : affiche les 30 derniers jours d'evenements admin.
// S'appuie sur AppAdmin.api.listHistory (api/admin-history.js) + AppAdmin.toast.

(function () {
  'use strict';

  const AppAdmin = window.AppAdmin || (window.AppAdmin = {});

  const state = {
    open: false,
    loading: false,
    entries: [],
  };

  const els = {};

  function cacheDom() {
    els.sheet = document.getElementById('historySheet');
    els.close = document.getElementById('historyClose');
    els.body = document.getElementById('historyBody');
    els.empty = document.getElementById('historyEmpty');
    els.loading = document.getElementById('historyLoading');
    els.error = document.getElementById('historyError');
    els.count = document.getElementById('historyCount');
    els.backdrop = els.sheet ? els.sheet.querySelector('.admin-sheet__backdrop') : null;
    els.openBtn = document.getElementById('historyBtn');
  }

  function toast(msg, variant) {
    if (AppAdmin.toast) AppAdmin.toast(msg, variant);
  }

  // === Rendu ===

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function actionLabel(action) {
    switch (action) {
      case 'add': return { text: '+ Ajouté', cls: 'is-add' };
      case 'edit': return { text: '✎ Modifié', cls: 'is-edit' };
      case 'delete': return { text: '× Supprimé', cls: 'is-delete' };
      case 'login': return { text: '→ Connexion', cls: 'is-login' };
      case 'login_failed': return { text: '⚠ Connexion refusée', cls: 'is-warn' };
      default: return { text: action, cls: '' };
    }
  }

  function summarizeDetails(entry) {
    const d = entry.details;
    if (!d) return null;
    if (entry.action === 'edit' && Array.isArray(d.fields) && d.fields.length) {
      return `Champs : ${d.fields.join(', ')}`;
    }
    if (entry.action === 'add' && d.nom) {
      return `Nom : ${d.nom}`;
    }
    return null;
  }

  function renderEntries() {
    if (!els.body) return;
    els.body.innerHTML = '';
    if (!state.entries.length) {
      if (els.empty) els.empty.hidden = false;
      if (els.count) els.count.textContent = '0';
      return;
    }
    if (els.empty) els.empty.hidden = true;
    if (els.count) els.count.textContent = String(state.entries.length);

    const frag = document.createDocumentFragment();
    for (const e of state.entries) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const badge = actionLabel(e.action);

      const when = document.createElement('time');
      when.className = 'history-item__when';
      when.dateTime = e.at;
      when.textContent = formatDate(e.at);

      const badgeEl = document.createElement('span');
      badgeEl.className = `history-item__action ${badge.cls}`;
      badgeEl.textContent = badge.text;

      const nameEl = document.createElement('span');
      nameEl.className = 'history-item__name';
      nameEl.textContent = e.cabinet_nom || e.cabinet_id || '';

      const summary = summarizeDetails(e);
      let summaryEl = null;
      if (summary) {
        summaryEl = document.createElement('p');
        summaryEl.className = 'history-item__summary';
        summaryEl.textContent = summary;
      }

      const head = document.createElement('div');
      head.className = 'history-item__head';
      head.appendChild(when);
      head.appendChild(badgeEl);
      if (nameEl.textContent) head.appendChild(nameEl);

      li.appendChild(head);
      if (summaryEl) li.appendChild(summaryEl);
      frag.appendChild(li);
    }
    els.body.appendChild(frag);
  }

  // === Data ===

  async function load() {
    if (state.loading) return;
    state.loading = true;
    if (els.loading) els.loading.hidden = false;
    if (els.error) els.error.textContent = '';
    try {
      const data = await AppAdmin.api.listHistory(30, 200);
      state.entries = Array.isArray(data.entries) ? data.entries : [];
    } catch (err) {
      console.error('history load failed', err);
      if (els.error) els.error.textContent = 'Impossible de charger l\'historique.';
      toast('Erreur lors du chargement de l\'historique', 'error');
      state.entries = [];
    } finally {
      state.loading = false;
      if (els.loading) els.loading.hidden = true;
      renderEntries();
    }
  }

  // === Open/Close ===

  function open() {
    if (!els.sheet) return;
    els.sheet.hidden = false;
    els.sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-sheet-open');
    state.open = true;
    // Charge au premier open (et refresh a chaque open suivant)
    load();
  }

  function close() {
    if (!els.sheet) return;
    els.sheet.hidden = true;
    els.sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-sheet-open');
    state.open = false;
  }

  function bind() {
    if (els.openBtn) els.openBtn.addEventListener('click', open);
    if (els.close) els.close.addEventListener('click', close);
    if (els.backdrop) els.backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) close();
    });
  }

  function init() {
    cacheDom();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  AppAdmin.history = { open, close, reload: load };
})();