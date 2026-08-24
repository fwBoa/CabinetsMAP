// assets/admin/cabinets.js
// UI liste + sheet d'edition des cabinets.
// Depend de AppAdmin.api, AppAdmin.auth (toast, setView).

(function () {
  'use strict';

  const AppAdmin = window.AppAdmin || (window.AppAdmin = {});

  // === State ===
  const state = {
    cabinets: [],
    sha: null,
    loading: false,
    editingId: null, // null = mode "ajout"
    sheetOpen: false,
  };

  // === DOM ===
  const els = {};

  function cacheDom() {
    els.list = document.getElementById('cabinetList');
    els.listEmpty = document.getElementById('listEmpty');
    els.listCount = document.getElementById('listCount');
    els.listLoading = document.getElementById('listLoading');
    els.addBtn = document.getElementById('addBtn');
    els.refreshBtn = document.getElementById('refreshBtn');

    els.sheet = document.getElementById('cabinetSheet');
    els.sheetTitle = document.getElementById('sheetTitle');
    els.sheetClose = document.getElementById('sheetClose');
    els.sheetForm = document.getElementById('sheetForm');
    els.sheetSubmit = document.getElementById('sheetSubmit');
    els.sheetDelete = document.getElementById('sheetDelete');

    // Widget multi-departements (remplace l'ancien champ texte fDepartements)
    els.fDepartements = document.getElementById('fDepartements');
    els.fDepartementsTags = document.getElementById('fDepartementsTags');
    els.fDepartementsSearch = document.getElementById('fDepartementsSearch');
    els.fDepartementsResults = document.getElementById('fDepartementsResults');

    els.fNom = document.getElementById('fNom');
    els.fAdresse = document.getElementById('fAdresse');
    els.fPhone = document.getElementById('fPhone');
    els.fEmails = document.getElementById('fEmails');
    els.fDepartements = document.getElementById('fDepartements');
    els.fTribunaux = document.getElementById('fTribunaux');
    els.fCoursAppel = document.getElementById('fCoursAppel');
    els.fCouleur = document.getElementById('fCouleur');
    els.formError = document.getElementById('formError');

    // Init picker depts (apres que App.DEPARTEMENTS soit dispo)
    if (window.App && typeof window.App.adminDeptPicker === 'object') {
      els.deptPicker = window.App.adminDeptPicker.init({
        hiddenId: 'fDepartements',
        tagsId: 'fDepartementsTags',
        searchId: 'fDepartementsSearch',
        resultsId: 'fDepartementsResults',
      });
    }

    els.confirmModal = document.getElementById('confirmModal');
    els.confirmMsg = document.getElementById('confirmMsg');
    els.confirmOk = document.getElementById('confirmOk');
    els.confirmCancel = document.getElementById('confirmCancel');

    els.sheetPreviewBtn = document.getElementById('sheetPreviewBtn');
    els.sheetPreview = document.getElementById('sheetPreview');
    els.previewContent = document.getElementById('previewContent');
    els.previewClose = document.getElementById('previewClose');
  }

  // === Helpers UI ===
  // Wrapper : accepte (message-string, variant-string) ou ({message, variant, action})
  // On delegue a AppAdmin.toast (= auth.js showToast) avec les 2 args qu'il attend.
  function toast(arg1, arg2) {
    if (!AppAdmin.toast) return;
    if (typeof arg1 === 'string') {
      AppAdmin.toast(arg1, arg2);
    } else if (arg1 && typeof arg1 === 'object') {
      // showToast(message, opts) : on passe le texte comme message et l'objet comme opts
      AppAdmin.toast(arg1.message || '', arg1);
    }
  }

  // Toast specialise pour le resultat d'une mutation.
  // 3 cas : succes (deploye), en attente de validation manuelle, echec.
  // result = { merged: bool, prNumber, prUrl, mergeReason }
  function showMutationToast(result, verb) {
    const link = result.prUrl ? { href: result.prUrl, label: 'Voir le détail technique' } : null;
    if (result.merged) {
      toast({
        message: `Cabinet ${verb}. La carte sera mise à jour dans quelques secondes.`,
        variant: 'success',
        action: link,
      });
    } else {
      const reason = result.mergeReason
        ? ` Raison : ${result.mergeReason.toLowerCase().replace(/^./, c => c.toUpperCase())}.`
        : '';
      toast({
        message: `Modification prise en compte mais validation automatique refusée.${reason} Un administrateur doit intervenir.`,
        variant: 'warning',
        action: link,
      });
    }
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.dataset.busy = busy ? '1' : '';
    if (busy) button.dataset.originalText = button.textContent;
    if (busy) button.textContent = 'Envoi...';
    else if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }

  function openConfirm(message, onConfirm) {
    els.confirmMsg.textContent = message;
    els.confirmModal.hidden = false;
    const handler = () => {
      els.confirmOk.removeEventListener('click', handler);
      els.confirmModal.hidden = true;
      onConfirm();
    };
    const cancel = () => {
      els.confirmCancel.removeEventListener('click', cancel);
      els.confirmOk.removeEventListener('click', handler);
      els.confirmModal.hidden = true;
    };
    els.confirmOk.addEventListener('click', handler);
    els.confirmCancel.addEventListener('click', cancel);
  }

  // === Liste ===
  async function loadCabinets() {
    if (state.loading) return;
    state.loading = true;
    els.listLoading.hidden = false;
    els.list.hidden = true;
    els.listEmpty.hidden = true;
    try {
      const data = await AppAdmin.api.listCabinets();
      state.cabinets = data.cabinets || [];
      state.sha = data.sha;
      renderList();
    } catch (err) {
      if (err.status === 401) {
        // Session expiree -> retour au login
        if (AppAdmin.setView) AppAdmin.setView('login');
        toast('Session expirée, reconnectez-vous.', 'error');
      } else {
        toast('Erreur de chargement : ' + (err.message || 'inconnue'), 'error');
      }
    } finally {
      state.loading = false;
      els.listLoading.hidden = true;
    }
  }

  function renderList() {
    els.list.replaceChildren();
    els.listCount.textContent = state.cabinets.length;
    if (!state.cabinets.length) {
      els.listEmpty.hidden = false;
      els.list.hidden = true;
      return;
    }
    els.list.hidden = false;
    const sorted = [...state.cabinets].sort((a, b) =>
      (a.properties?.nom || '').localeCompare(b.properties?.nom || '', 'fr')
    );
    sorted.forEach(c => els.list.appendChild(createCard(c)));
  }

  function createCard(cabinet) {
    const p = cabinet.properties || {};
    const li = document.createElement('li');
    li.className = 'admin-card';

    const dot = document.createElement('span');
    dot.className = 'admin-card__dot';
    if (p.couleur) dot.style.backgroundColor = p.couleur;

    const main = document.createElement('div');
    main.className = 'admin-card__main';

    const name = document.createElement('div');
    name.className = 'admin-card__name';
    name.textContent = p.nom || '(sans nom)';

    const meta = document.createElement('div');
    meta.className = 'admin-card__meta';
    const depts = (p.departements || []).length;
    const tri = (p.tribunaux || []).length;
    meta.textContent = `${p.adresse || 'Adresse non renseignée'} · ${depts} dept. · ${tri} trib.`;

    main.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'admin-card__actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-card__btn admin-card__btn--edit';
    editBtn.textContent = 'Modifier';
    editBtn.addEventListener('click', () => openSheet(cabinet));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'admin-card__btn admin-card__btn--delete';
    delBtn.textContent = '×';
    delBtn.setAttribute('aria-label', 'Supprimer ' + (p.nom || ''));
    delBtn.addEventListener('click', () => confirmDelete(cabinet));

    actions.append(editBtn, delBtn);
    li.append(dot, main, actions);
    return li;
  }

  // === Sheet ===
  function openSheet(cabinet) {
    state.editingId = cabinet?.properties?.id || null;
    state.sheetOpen = true;
    els.sheetTitle.textContent = cabinet ? 'Modifier le cabinet' : 'Ajouter un cabinet';
    els.sheetDelete.hidden = !cabinet;

    // Pre-remplir ou vider
    const p = cabinet?.properties || {};
    els.fNom.value = p.nom || '';
    els.fAdresse.value = p.adresse || '';
    els.fPhone.value = p.phone || '';
    els.fEmails.value = (p.emails || []).join(', ');
    // Le picker multi-depts met a jour fDepartements (hidden) via setValues
    if (els.deptPicker) {
      els.deptPicker.setValues(p.departements || []);
    } else if (els.fDepartements) {
      // Fallback si le picker n'est pas init (degrade gracieux)
      els.fDepartements.value = (p.departements || []).join(', ');
    }
    els.fTribunaux.value = (p.tribunaux || []).join(', ');
    els.fCoursAppel.value = (p.cours_appel || []).join(', ');
    els.fCouleur.value = p.couleur || '#1e3a5f';

    els.formError.textContent = '';
    els.sheet.hidden = false;
    setTimeout(() => els.fNom.focus(), 50);
  }

  function closeSheet() {
    state.sheetOpen = false;
    els.sheet.hidden = true;
  }

  function parseList(str) {
    return String(str || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  function validateForm() {
    if (!els.fNom.value.trim()) return 'Le nom est obligatoire.';
    if (els.fNom.value.length > 200) return 'Le nom dépasse 200 caractères.';
    const emails = parseList(els.fEmails.value);
    for (const e of emails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return `Email invalide : ${e}`;
    }
    const hex = els.fCouleur.value.trim();
    if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) return 'Couleur invalide (format #RRGGBB).';
    return null;
  }

  function collectPayload() {
    const properties = {
      nom: els.fNom.value.trim(),
      adresse: els.fAdresse.value.trim(),
      phone: els.fPhone.value.trim(),
      emails: parseList(els.fEmails.value),
      tribunaux: parseList(els.fTribunaux.value),
      cours_appel: parseList(els.fCoursAppel.value),
      departements: parseList(els.fDepartements.value),
      couleur: els.fCouleur.value.trim() || '#1e3a5f',
      badges: [],
      display_name: '',
      place_id: null,
    };
    if (state.editingId) {
      const existing = state.cabinets.find(c => c.properties?.id === state.editingId);
      if (existing) {
        properties.display_name = existing.properties?.display_name || '';
        properties.place_id = existing.properties?.place_id || null;
        properties.badges = existing.properties?.badges || [];
        return { id: state.editingId, properties, geometry: existing.geometry };
      }
      return { id: state.editingId, properties };
    }
    return { properties };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    els.formError.textContent = '';
    const err = validateForm();
    if (err) { els.formError.textContent = err; return; }
    setBusy(els.sheetSubmit, true);
    try {
      const payload = collectPayload();
      const action = state.editingId ? 'edit' : 'add';
      const result = await AppAdmin.api.mutateCabinet(action, payload);
      const verb = action === 'add' ? 'créé' : 'mis à jour';
      showMutationToast(result, verb);
      closeSheet();
      await loadCabinets();
    } catch (err) {
      if (err.status === 401) {
        toast('Session expirée, reconnectez-vous.', 'error');
      } else if (err.status === 409) {
        toast(err.message || 'Une modification similaire existe déjà.', 'error');
      } else {
        els.formError.textContent = err.message || 'Erreur';
      }
    } finally {
      setBusy(els.sheetSubmit, false);
    }
  }

  function confirmDelete(cabinet) {
    const name = cabinet.properties?.nom || 'ce cabinet';
    openConfirm(`Supprimer définitivement « ${name} » de la carte ?`, async () => {
      setBusy(els.sheetDelete, true);
      try {
        const result = await AppAdmin.api.mutateCabinet('delete', { id: cabinet.properties.id });
        showMutationToast(result, 'supprimé');
        closeSheet();
        await loadCabinets();
      } catch (err) {
        if (err.status === 401) {
          toast('Session expirée, reconnectez-vous.', 'error');
        } else {
          toast('Erreur : ' + (err.message || 'inconnue'), 'error');
        }
      } finally {
        setBusy(els.sheetDelete, false);
      }
    });
  }

  // === Bind ===
  function bind() {
    if (els.addBtn) els.addBtn.addEventListener('click', () => openSheet(null));
    if (els.refreshBtn) els.refreshBtn.addEventListener('click', loadCabinets);
    if (els.sheetClose) els.sheetClose.addEventListener('click', closeSheet);
    if (els.sheetForm) els.sheetForm.addEventListener('submit', handleSubmit);
    if (els.sheetDelete) els.sheetDelete.addEventListener('click', () => {
      const cab = state.cabinets.find(c => c.properties?.id === state.editingId);
      if (cab) confirmDelete(cab);
    });
    if (els.sheetPreviewBtn) els.sheetPreviewBtn.addEventListener('click', togglePreview);
    if (els.previewClose) els.previewClose.addEventListener('click', () => {
      els.sheetPreview.hidden = true;
    });
    // Escape ferme sheet
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.confirmModal.hidden) els.confirmModal.hidden = true;
        else if (state.sheetOpen) closeSheet();
      }
    });
  }

  // === Récapitulatif des changements (preview lisible, cote utilisateur) ===
  // Retourne { intro, items } ou { intro, empty: true }.
  // Chaque item est un objet decrivant un changement de facon humaine :
  //   { label, kind: 'unchanged'|'added'|'removed'|'changed', before, after, additions, removals }
  // Les "kind" sont ensuite rendus en HTML (avant/apres, ajouts, retraits).
  function buildDiffPreview() {
    const fieldLabels = {
      nom: 'Nom',
      adresse: 'Adresse',
      phone: 'Téléphone',
      emails: 'Emails',
      tribunaux: 'Tribunaux',
      cours_appel: "Cours d'appel",
      departements: 'Départements',
      couleur: 'Couleur',
      display_name: 'Nom affiché',
      place_id: 'Identifiant Google',
      badges: 'Badges',
    };

    const deptsMap = (window.App && window.App.DEPARTEMENTS) || [];
    const deptLabel = code => {
      const d = deptsMap.find(x => x.code === code);
      return d ? `${code} (${d.nom})` : code;
    };

    // Formate une valeur pour affichage (jamais de JSON brut).
    const fmt = (key, value) => {
      if (value === undefined || value === null || value === '') return '—';
      if (Array.isArray(value)) {
        if (value.length === 0) return '—';
        if (key === 'departements') return value.map(deptLabel).join(', ');
        return value.join(', ');
      }
      if (key === 'couleur') {
        // Affiche le code hex + un petit carre de couleur
        return value;
      }
      return String(value);
    };

    if (!state.editingId) {
      // ADD : tous les champs sont nouveaux.
      // On masque les champs vides / valeur par defaut pour ne pas polluer le récap.
      const payload = collectPayload().properties;
      const items = [];
      const isEmpty = (key, value) => {
        if (value === undefined || value === null || value === '') return true;
        if (Array.isArray(value) && value.length === 0) return true;
        // Couleur par defaut : on n'affiche que si l'utilisateur l'a changee
        if (key === 'couleur' && value === '#1e3a5f') return true;
        return false;
      };
      Object.keys(payload).forEach(k => {
        if (['badges', 'display_name', 'place_id'].includes(k)) return;
        if (!fieldLabels[k]) return;
        if (isEmpty(k, payload[k])) return;
        items.push({
          label: fieldLabels[k],
          kind: 'added',
          after: fmt(k, payload[k]),
        });
      });
      if (items.length === 0) {
        return {
          intro: 'Ce cabinet sera créé sur la carte après validation automatique.',
          items: [],
          empty: true,
        };
      }
      return {
        intro: 'Ce cabinet sera créé sur la carte après validation automatique.',
        items,
        empty: false,
      };
    }

    // EDIT : comparaison avant/apres
    const existing = state.cabinets.find(c => c.properties?.id === state.editingId);
    if (!existing) {
      return {
        intro: 'Cabinet introuvable dans la liste actuelle.',
        items: [],
        empty: true,
      };
    }
    const payload = collectPayload().properties;
    const before = existing.properties || {};
    const items = [];
    Object.keys(fieldLabels).forEach(k => {
      if (!(k in payload) && !(k in before)) return;
      // Champs techniques caches si pas remplis
      if (['badges', 'display_name', 'place_id'].includes(k)) return;

      const b = before[k];
      const a = payload[k] !== undefined ? payload[k] : b;
      const bStr = JSON.stringify(b ?? null);
      const aStr = JSON.stringify(a ?? null);
      if (bStr === aStr) return;

      const item = { label: fieldLabels[k] };

      // Pour les listes (emails, tribunaux, cours_appel, departements) on
      // decompose en ajouts/retraits pour plus de clarte.
      if (Array.isArray(a) && Array.isArray(b)) {
        const aSet = new Set(a.map(String));
        const bSet = new Set(b.map(String));
        const additions = a.filter(x => !bSet.has(String(x)));
        const removals = b.filter(x => !aSet.has(String(x)));
        item.kind = (additions.length && removals.length) ? 'changed'
                  : (additions.length ? 'added' : 'removed');
        item.additions = additions.map(v => fmt(k, [v]).replace(/,$/, '').trim());
        item.removals = removals.map(v => fmt(k, [v]).replace(/,$/, '').trim());
        if (additions.length === 0 && removals.length === 0) return;
      } else {
        item.kind = 'changed';
        item.before = fmt(k, b);
        item.after = fmt(k, a);
      }
      items.push(item);
    });

    if (items.length === 0) {
      return {
        intro: 'Aucun changement détecté par rapport à la version actuelle.',
        items: [],
        empty: true,
      };
    }

    return {
      intro: `Modifications du cabinet « ${before.nom || ''} ».`,
      items,
      empty: false,
    };
  }

  // Rend le récap en HTML dans #previewContent.
  function renderPreviewContent(diff) {
    const root = els.previewContent;
    if (!root) return;
    root.innerHTML = '';

    if (diff.empty) {
      const p = document.createElement('p');
      p.className = 'admin-preview__empty';
      p.textContent = diff.empty === true ? 'Aucune modification à afficher.' : diff.intro;
      root.appendChild(p);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'admin-preview__list';

    diff.items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'admin-preview__item admin-preview__item--' + item.kind;

      const label = document.createElement('span');
      label.className = 'admin-preview__label';
      label.textContent = item.label;

      const value = document.createElement('div');
      value.className = 'admin-preview__value';

      if (item.kind === 'changed' && (item.before || item.after)) {
        if (item.before && item.before !== '—') {
          const before = document.createElement('span');
          before.className = 'admin-preview__before';
          before.textContent = item.before;
          value.appendChild(before);
          const arrow = document.createElement('span');
          arrow.className = 'admin-preview__arrow';
          arrow.textContent = '→';
          arrow.setAttribute('aria-hidden', 'true');
          value.appendChild(arrow);
        }
        const after = document.createElement('span');
        after.className = 'admin-preview__after';
        after.textContent = item.after;
        value.appendChild(after);
      } else if (item.kind === 'added') {
        if (item.additions && item.additions.length) {
          item.additions.forEach(v => {
            const tag = document.createElement('span');
            tag.className = 'admin-preview__tag admin-preview__tag--add';
            tag.textContent = '+ ' + v;
            value.appendChild(tag);
          });
        } else if (item.after) {
          const tag = document.createElement('span');
          tag.className = 'admin-preview__tag admin-preview__tag--add';
          tag.textContent = '+ ' + item.after;
          value.appendChild(tag);
        }
        if (item.removals && item.removals.length) {
          item.removals.forEach(v => {
            const tag = document.createElement('span');
            tag.className = 'admin-preview__tag admin-preview__tag--remove';
            tag.textContent = '− ' + v;
            value.appendChild(tag);
          });
        }
      } else if (item.kind === 'removed') {
        if (item.removals && item.removals.length) {
          item.removals.forEach(v => {
            const tag = document.createElement('span');
            tag.className = 'admin-preview__tag admin-preview__tag--remove';
            tag.textContent = '− ' + v;
            value.appendChild(tag);
          });
        }
        if (item.additions && item.additions.length) {
          item.additions.forEach(v => {
            const tag = document.createElement('span');
            tag.className = 'admin-preview__tag admin-preview__tag--add';
            tag.textContent = '+ ' + v;
            value.appendChild(tag);
          });
        }
      }

      li.append(label, value);
      ul.appendChild(li);
    });

    root.appendChild(ul);
  }

  function togglePreview() {
    if (!els.sheetPreview) return;
    if (els.sheetPreview.hidden) {
      const err = validateForm();
      if (err) {
        els.formError.textContent = err;
        return;
      }
      els.formError.textContent = '';
      const diff = buildDiffPreview();
      const introEl = document.getElementById('previewIntro');
      if (introEl) introEl.textContent = diff.intro || '';
      renderPreviewContent(diff);
      els.sheetPreview.hidden = false;
      els.sheetPreviewBtn.textContent = 'Masquer le récapitulatif';
    } else {
      els.sheetPreview.hidden = true;
      els.sheetPreviewBtn.textContent = 'Voir les changements';
    }
  }

  function reset() {
    state.cabinets = [];
    state.sha = null;
    state.editingId = null;
    state.loading = false;
    if (els.list) {
      els.list.replaceChildren();
      els.list.hidden = true;
    }
    if (els.listEmpty) els.listEmpty.hidden = true;
    if (els.listLoading) els.listLoading.hidden = true;
    if (els.listCount) els.listCount.textContent = '0';
  }

  // === Init ===
  function init() {
    cacheDom();
    bind();
    // Charge les cabinets uniquement apres confirmation de session par auth.js
    // (sinon on declenche un 401+toast 'Session expiree' au premier load)
    if (typeof AppAdmin.onAuthenticated === 'function') {
      AppAdmin.onAuthenticated(loadCabinets);
    }
  }

  // Eviter la double-init : avec defer, readyState peut etre 'interactive' au moment
  // ou l'IIFE s'execute, ET DOMContentLoaded peut fire ensuite. On utilise un flag.
  let initialized = false;
  function initOnce() {
    if (initialized) return;
    initialized = true;
    return init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnce);
  } else {
    initOnce();
  }

  AppAdmin.cabinets = { state, loadCabinets, openSheet, closeSheet, reset };
})();
