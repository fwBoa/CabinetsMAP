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

    els.fNom = document.getElementById('fNom');
    els.fAdresse = document.getElementById('fAdresse');
    els.fPhone = document.getElementById('fPhone');
    els.fEmails = document.getElementById('fEmails');
    els.fDepartements = document.getElementById('fDepartements');
    els.fTribunaux = document.getElementById('fTribunaux');
    els.fCoursAppel = document.getElementById('fCoursAppel');
    els.fCouleur = document.getElementById('fCouleur');
    els.formError = document.getElementById('formError');

    els.confirmModal = document.getElementById('confirmModal');
    els.confirmMsg = document.getElementById('confirmMsg');
    els.confirmOk = document.getElementById('confirmOk');
    els.confirmCancel = document.getElementById('confirmCancel');
  }

  // === Helpers UI ===
  function toast(msg, variant) {
    if (AppAdmin.toast) AppAdmin.toast(msg, variant);
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
      toast('Erreur de chargement : ' + err.message, 'error');
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
    els.fDepartements.value = (p.departements || []).join(', ');
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
      if (result.prUrl) {
        toast(`PR #${result.prNumber} créée — ${result.prUrl}`, 'success');
      }
      closeSheet();
      await loadCabinets();
    } catch (err) {
      els.formError.textContent = err.message || 'Erreur';
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
        toast(`PR #${result.prNumber} créée pour la suppression`, 'success');
        closeSheet();
        await loadCabinets();
      } catch (err) {
        toast('Erreur : ' + err.message, 'error');
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
    // Escape ferme sheet
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.confirmModal.hidden) els.confirmModal.hidden = true;
        else if (state.sheetOpen) closeSheet();
      }
    });
  }

  // === Init ===
  function init() {
    cacheDom();
    bind();
    loadCabinets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  AppAdmin.cabinets = { state, loadCabinets, openSheet, closeSheet };
})();
