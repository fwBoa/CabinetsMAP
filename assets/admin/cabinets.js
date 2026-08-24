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
  // Distingue merge auto-OK, merge en attente manuelle, ou check rouge.
  // result = { merged: bool, prNumber, prUrl, mergeReason }
  function showMutationToast(result, verb) {
    const prLink = result.prUrl ? { href: result.prUrl, label: 'Voir la PR' } : null;
    if (result.merged) {
      toast({
        message: `Cabinet ${verb} et déployé ! 🚀`,
        variant: 'success',
        action: prLink,
      });
    } else {
      const reason = result.mergeReason
        ? ` (${result.mergeReason.toLowerCase().slice(0, 80)})`
        : '';
      toast({
        message: `Cabinet ${verb} — PR #${result.prNumber} à merger${reason}`,
        variant: 'warning',
        action: prLink,
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
      const verb = action === 'add' ? 'ajouté' : 'modifié';
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
    openConfirm(`Supprimer définitivement "${name}" ? Cette action ouvre une PR de suppression.`, async () => {
      setBusy(els.sheetDelete, true);
      try {
        const result = await AppAdmin.api.mutateCabinet('delete', { id: cabinet.properties.id });
        showMutationToast(result, 'suppression envoyée');
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

  // === Preview diff ===
  function buildDiffPreview() {
    if (!state.editingId) {
      // ADD : on affiche ce qui sera envoye
      const payload = collectPayload().properties;
      return `Nouvelle feature qui sera ajoutee a cabinets.geojson :

{
  "type": "Feature",
  "properties": ${JSON.stringify(payload, null, 2)},
  ...
}`;
    }
    // EDIT : on compare avant/apres
    const existing = state.cabinets.find(c => c.properties?.id === state.editingId);
    if (!existing) return '(cabinet introuvable)';
    const payload = collectPayload().properties;
    const before = existing.properties || {};
    const after = { ...before, ...payload, id: before.id };
    const lines = [];
    lines.push(`Cabinet : ${before.nom} (${before.id})`);
    lines.push('');
    const fields = Object.keys(after);
    for (const f of fields) {
      const b = JSON.stringify(before[f]);
      const a = JSON.stringify(after[f]);
      if (b === a) continue;
      if (!(f in before)) {
        lines.push(`+ ${f}: ${a}`);
      } else if (!(f in payload)) {
        lines.push(`  ${f}: (conserve)`);
      } else {
        lines.push(`- ${f}: ${b}`);
        lines.push(`+ ${f}: ${a}`);
      }
    }
    return lines.join('\n');
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
      els.previewContent.textContent = buildDiffPreview();
      els.sheetPreview.hidden = false;
      els.sheetPreviewBtn.textContent = 'Masquer';
    } else {
      els.sheetPreview.hidden = true;
      els.sheetPreviewBtn.textContent = 'Prévisualiser';
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
