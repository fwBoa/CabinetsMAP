// assets/admin/auth.js
// UI login admin : formulaire, gestion de la session, navigation entre vues.
// Pattern IIFE pour eviter les collisions globales.

(function () {
  'use strict';

  const AppAdmin = window.AppAdmin || (window.AppAdmin = {});

  // === DOM refs ===
  const els = {
    main: document.querySelector('.admin-main'),
    loginView: document.getElementById('loginView'),
    listView: document.getElementById('listView'),
    nav: document.getElementById('adminNav'),
    form: document.getElementById('loginForm'),
    input: document.getElementById('codeInput'),
    submit: document.getElementById('loginSubmit'),
    error: document.getElementById('loginError'),
    logout: document.getElementById('logoutBtn'),
    toast: document.getElementById('toast'),
  };

  // === Helpers UI ===
  function showToast(message, opts) {
    if (!els.toast) return;
    // Retrocompat : showToast('msg', 'success') ou showToast('msg', { ... })
    let variant = null, action = null;
    if (typeof opts === 'string') {
      variant = opts;
    } else if (opts && typeof opts === 'object') {
      variant = opts.variant || null;
      action = opts.action || null;
    }
    const text = typeof message === 'string' ? message : (message?.message || '');
    els.toast.replaceChildren();
    const span = document.createElement('span');
    span.className = 'admin-toast__text';
    span.textContent = text;
    els.toast.appendChild(span);
    if (action && action.href && action.label) {
      const link = document.createElement('a');
      link.href = action.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'admin-toast__action';
      link.textContent = action.label;
      els.toast.appendChild(link);
    }
    els.toast.className = 'admin-toast' + (variant ? ' admin-toast--' + variant : '');
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    // Auto-dismiss apres 8s si action, sinon 3.5s
    const ttl = action ? 8000 : 3500;
    showToast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, ttl);
  }

  // Expose toast + setView pour les autres modules (cabinets.js, ...)
  AppAdmin.toast = showToast;
  AppAdmin.setView = setView;

  function setError(msg) {
    els.error.textContent = msg || '';
  }

  function setView(view) {
    if (view === 'list') {
      els.main.dataset.view = 'list';
      els.loginView.hidden = true;
      els.listView.hidden = false;
      els.nav.hidden = false;
    } else {
      els.main.dataset.view = 'login';
      els.loginView.hidden = false;
      els.listView.hidden = true;
      els.nav.hidden = true;
    }
  }

  function setBusy(busy) {
    els.submit.disabled = busy;
    els.submit.textContent = busy ? 'Connexion...' : 'Se connecter';
    els.input.disabled = busy;
  }

  // === Handlers ===
  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    const code = els.input.value.trim();
    if (code.length < 8) {
      setError('Le code doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      const result = await AppAdmin.api.authLogin(code);
      setError('');
      els.input.value = ''; // clear le code en memoire
      showToast('Connecté', 'success');
      setView('list');
    } catch (err) {
      setError(err.message === 'Code invalide'
        ? 'Code incorrect.'
        : (err.message || 'Erreur de connexion.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await AppAdmin.api.authLogout();
      showToast('Déconnecté');
      setView('login');
    } catch (err) {
      showToast('Erreur lors de la déconnexion', 'error');
    }
  }

  async function init() {
    // Verifier si on a deja une session valide
    try {
      const status = await AppAdmin.api.authStatus();
      if (status.authenticated) {
        setView('list');
        return;
      }
    } catch {
      // Pas grave, on reste sur le login
    }
    setView('login');
    els.input.focus();
  }

  // === Bind ===
  if (els.form) els.form.addEventListener('submit', handleLogin);
  if (els.logout) els.logout.addEventListener('click', handleLogout);
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
