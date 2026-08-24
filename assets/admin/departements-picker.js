// assets/admin/departements-picker.js
// Widget de selection multi-departements pour le formulaire admin.
// Expose App.adminDeptPicker.init(hiddenInputId, tagsContainerId, searchInputId, resultsListId)
//
// Comportement :
// - L'utilisateur tape du texte dans le champ recherche (nom OU code).
// - Une liste filtree des departements correspondants apparait.
// - Clic / Entree sur un resultat = ajoute un tag (chip bleu avec ×).
// - Clic sur le × du tag = retire le departement.
// - Les codes selectionnes sont stockes (separes par virgule) dans l'input hidden,
//   ce qui permet de garder le meme flux de serialisation (parseList(value)).
//
// Dependances : window.App.DEPARTEMENTS (defini par departements-liste.js).

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function init({ hiddenId, tagsId, searchId, resultsId }) {
    const hidden = $(hiddenId);
    const tagsBox = $(tagsId);
    const search = $(searchId);
    const results = $(resultsId);
    if (!hidden || !tagsBox || !search || !results) {
      console.warn('[dept-picker] elements manquants', { hiddenId, tagsId, searchId, resultsId });
      return null;
    }

    const all = (window.App && window.App.DEPARTEMENTS) || [];
    // Index pour recherche rapide : lower-case nom + code
    const indexed = all.map(d => ({
      code: d.code,
      nom: d.nom,
      region: d.region,
      haystack: (d.nom + ' ' + d.code + ' ' + d.region).toLowerCase(),
    }));

    // Set des codes selectionnes
    let selected = new Set();

    function syncHidden() {
      // Trie numeriquement pour coherence visuelle (01, 02, ..., 2A, 2B, ..., 95, 971, ...)
      const codes = Array.from(selected);
      codes.sort((a, b) => {
        const na = /^\d+$/.test(a) ? parseInt(a, 10) : 999;
        const nb = /^\d+$/.test(b) ? parseInt(b, 10) : 999;
        if (na !== nb) return na - nb;
        return a.localeCompare(b);
      });
      hidden.value = codes.join(', ');
    }

    function renderTags() {
      tagsBox.innerHTML = '';
      if (selected.size === 0) {
        const hint = document.createElement('span');
        hint.className = 'dept-picker__hint';
        hint.textContent = 'Aucun département sélectionné.';
        tagsBox.appendChild(hint);
        return;
      }
      const codes = Array.from(selected);
      codes.sort((a, b) => {
        const na = /^\d+$/.test(a) ? parseInt(a, 10) : 999;
        const nb = /^\d+$/.test(b) ? parseInt(b, 10) : 999;
        if (na !== nb) return na - nb;
        return a.localeCompare(b);
      });
      codes.forEach(code => {
        const dept = all.find(d => d.code === code);
        if (!dept) return;
        const tag = document.createElement('span');
        tag.className = 'dept-tag';
        tag.innerHTML = `<span class="dept-tag__code">${escapeHtml(code)}</span><span class="dept-tag__name">${escapeHtml(dept.nom)}</span>`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dept-tag__remove';
        btn.setAttribute('aria-label', `Retirer ${dept.nom}`);
        btn.dataset.code = code;
        btn.textContent = '×';
        tag.appendChild(btn);
        tagsBox.appendChild(tag);
      });
    }

    function renderResults(term) {
      const q = (term || '').trim().toLowerCase();
      results.innerHTML = '';
      // Si champ vide : on n'affiche PAS la liste complete (trop long),
      // juste un message d'aide.
      if (!q) {
        results.hidden = true;
        return;
      }
      // Filtrage
      let matches = indexed;
      if (q.length >= 1) {
        matches = indexed.filter(d => d.haystack.includes(q));
      }
      // On affiche au max 30 résultats pour eviter le flood
      matches = matches.slice(0, 30);
      if (matches.length === 0) {
        const li = document.createElement('li');
        li.className = 'dept-picker__empty';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-disabled', 'true');
        li.textContent = 'Aucun département ne correspond.';
        results.appendChild(li);
        results.hidden = false;
        return;
      }
      matches.forEach(d => {
        const li = document.createElement('li');
        li.className = 'dept-picker__item';
        li.setAttribute('role', 'option');
        li.dataset.code = d.code;
        const isSelected = selected.has(d.code);
        if (isSelected) li.classList.add('dept-picker__item--selected');
        li.innerHTML = `<span class="dept-picker__code">${escapeHtml(d.code)}</span><span class="dept-picker__name">${escapeHtml(d.nom)}</span><span class="dept-picker__region">${escapeHtml(d.region)}</span>`;
        results.appendChild(li);
      });
      results.hidden = false;
    }

    // === Events ===

    search.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });

    search.addEventListener('focus', () => {
      // N'affiche la liste que si le champ contient deja du texte
      if (search.value.trim()) renderResults(search.value);
    });

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = results.querySelector('.dept-picker__item');
        if (first) {
          add(first.dataset.code);
          search.value = '';
          results.hidden = true;
          search.focus();
        }
      } else if (e.key === 'Escape') {
        results.hidden = true;
        search.blur();
      } else if (e.key === 'Backspace' && !search.value && selected.size > 0) {
        // Backspace dans champ vide = retire le dernier tag
        const last = Array.from(selected).pop();
        remove(last);
      }
    });

    results.addEventListener('click', (e) => {
      const item = e.target.closest('.dept-picker__item');
      if (!item) return;
      add(item.dataset.code);
      search.value = '';
      results.hidden = true;
      search.focus();
    });

    tagsBox.addEventListener('click', (e) => {
      const btn = e.target.closest('.dept-tag__remove');
      if (!btn) return;
      remove(btn.dataset.code);
    });

    // Clic en dehors = ferme la liste
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dept-picker')) {
        results.hidden = true;
      }
    });

    function add(code) {
      code = String(code || '').trim();
      if (!code) return;
      // Zero-padding si l'utilisateur tape "1" -> "01"
      if (/^\d$/.test(code)) code = '0' + code;
      if (!all.some(d => d.code === code)) {
        // Code inconnu : on l'ignore silencieusement pour eviter d'envoyer
        // un code qui ne sera pas reconnu par la carte
        console.warn('[dept-picker] code inconnu ignore:', code);
        return false;
      }
      selected.add(code);
      syncHidden();
      renderTags();
      return true;
    }

    function remove(code) {
      selected.delete(code);
      syncHidden();
      renderTags();
    }

    function setValues(codes) {
      // Accepte tableau ou string "75, 33, 13"
      selected.clear();
      const list = Array.isArray(codes)
        ? codes
        : String(codes || '').split(',').map(s => s.trim()).filter(Boolean);
      list.forEach(code => add(code));
      syncHidden();
      renderTags();
    }

    function getValues() {
      return Array.from(selected);
    }

    // Premier rendu
    renderTags();

    return { add, remove, setValues, getValues, syncHidden, renderTags };
  }

  window.App = window.App || {};
  window.App.adminDeptPicker = { init };
})();
