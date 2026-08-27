// assets/admin/history.js
// Sheet d'historique : affiche les 30 derniers jours d'evenements cabinets
// (add / edit / delete uniquement — pas les connexions).
// Chaque evenement montre le detail de chaque champ modifie
// (meme presentation que la preview de la sheet d'edition).

(function () {
  'use strict';

  const AppAdmin = window.AppAdmin || (window.AppAdmin = {});

  const state = {
    open: false,
    loading: false,
    entries: [],
  };

  const els = {};

  // Labels humains pour chaque champ
  const FIELD_LABELS = {
    nom: 'Nom',
    adresse: 'Adresse',
    phone: 'Téléphone',
    emails: 'Emails',
    tribunaux: 'Tribunaux',
    cours_appel: "Cours d'appel",
    departements: 'Départements',
    couleur: 'Couleur',
  };

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

  // === Helpers de formatage ===

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
      default: return { text: action, cls: '' };
    }
  }

  // Formate une valeur pour affichage (jamais de JSON brut).
  function formatValue(value) {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) {
      if (value.length === 0) return '—';
      return value.join(', ');
    }
    return String(value);
  }

  // === Rendu ===

  function makeTag(text, kind) {
    const tag = document.createElement('span');
    tag.className = `admin-preview__tag admin-preview__tag--${kind}`;
    tag.textContent = (kind === 'add' ? '+ ' : '− ') + text;
    return tag;
  }

  function isEmpty(v) {
    return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  }

  // Rend un champ de diff en <li class="admin-preview__item ...">.
  // Pour les listes : additions / removals en tags (comme la preview).
  // Pour les scalaires : avant → apres.
  function renderFieldItem(fieldKey, change) {
    const label = FIELD_LABELS[fieldKey] || fieldKey;
    const li = document.createElement('li');

    const labelEl = document.createElement('span');
    labelEl.className = 'admin-preview__label';
    labelEl.textContent = label;

    const value = document.createElement('div');
    value.className = 'admin-preview__value';

    const before = change?.before;
    const after = change?.after;
    const bEmpty = isEmpty(before);
    const aEmpty = isEmpty(after);

    // Cas : listes → additions/removals
    if (Array.isArray(before) || Array.isArray(after)) {
      const b = Array.isArray(before) ? before : [];
      const a = Array.isArray(after) ? after : [];
      const bSet = new Set(b.map(String));
      const aSet = new Set(a.map(String));
      const additions = a.filter(x => !bSet.has(String(x)));
      const removals = b.filter(x => !aSet.has(String(x)));

      if (additions.length === 0 && removals.length === 0) return null;

      additions.forEach(v => value.appendChild(makeTag(v, 'add')));
      removals.forEach(v => value.appendChild(makeTag(v, 'remove')));

      li.className = 'admin-preview__item admin-preview__item--' +
        (additions.length && removals.length ? 'changed'
         : additions.length ? 'added' : 'removed');
    }
    // Cas : scalaire → avant → apres
    else {
      if (bEmpty && aEmpty) return null;
      const bStr = formatValue(before);
      const aStr = formatValue(after);

      let kind = 'changed';
      if (bEmpty && !aEmpty) kind = 'added';
      else if (!bEmpty && aEmpty) kind = 'removed';

      li.className = 'admin-preview__item admin-preview__item--' + kind;

      if (kind === 'changed') {
        const beforeEl = document.createElement('span');
        beforeEl.className = 'admin-preview__before';
        beforeEl.textContent = bStr;
        value.appendChild(beforeEl);
        const arrow = document.createElement('span');
        arrow.className = 'admin-preview__arrow';
        arrow.textContent = '→';
        arrow.setAttribute('aria-hidden', 'true');
        value.appendChild(arrow);
        const afterEl = document.createElement('span');
        afterEl.className = 'admin-preview__after';
        afterEl.textContent = aStr;
        value.appendChild(afterEl);
      } else if (kind === 'removed') {
        value.appendChild(makeTag(bStr, 'remove'));
      } else {
        value.appendChild(makeTag(aStr, 'add'));
      }
    }

    li.appendChild(labelEl);
    li.appendChild(value);
    return li;
  }

  // Rend toutes les cles d'un diff en <ul class="admin-preview__list">
  function renderDiff(diff) {
    if (!diff || typeof diff !== 'object' || !Object.keys(diff).length) return null;
    const ul = document.createElement('ul');
    ul.className = 'admin-preview__list';
    let hasItems = false;
    for (const fieldKey of Object.keys(FIELD_LABELS)) {
      const change = diff[fieldKey];
      if (!change) continue;
      const li = renderFieldItem(fieldKey, change);
      if (li) {
        ul.appendChild(li);
        hasItems = true;
      }
    }
    return hasItems ? ul : null;
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

      // Nom du cabinet : details.nom (snapshot au moment de l'action) en priorite,
      // sinon cabinet_nom (join avec la table actuelle, peut etre null si supprime).
      const nom = e.details?.nom || e.cabinet_nom || e.cabinet_id || '';

      const head = document.createElement('div');
      head.className = 'history-item__head';
      head.appendChild(when);
      head.appendChild(badgeEl);
      if (nom) {
        const nameEl = document.createElement('span');
        nameEl.className = 'history-item__name';
        nameEl.textContent = nom;
        head.appendChild(nameEl);
      }
      li.appendChild(head);

      // Diff par champ (meme look que la preview)
      const diffList = renderDiff(e.details?.diff);
      if (diffList) {
        const wrap = document.createElement('div');
        wrap.className = 'history-item__diff';
        wrap.appendChild(diffList);
        li.appendChild(wrap);
      }

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