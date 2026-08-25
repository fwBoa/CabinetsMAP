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

  // Callbacks executes apres confirmation de session (status check OK ou login reussi)
  const authCallbacks = [];
  AppAdmin.onAuthenticated = function (fn) {
    if (typeof fn === 'function') authCallbacks.push(fn);
  };
  function fireAuthenticated() {
    while (authCallbacks.length) {
      try { authCallbacks.shift()(); } catch (e) { console.error('onAuthenticated callback failed', e); }
    }
  }

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
    const password = els.input.value.trim();
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      const result = await AppAdmin.api.authLogin(password);
      setError('');
      els.input.value = ''; // clear le mot de passe en memoire
      showToast('Connecté', 'success');
      setView('list');
      fireAuthenticated();
    } catch (err) {
      setError(err.message === 'Mot de passe invalide'
        ? 'Mot de passe incorrect.'
        : (err.message || 'Erreur de connexion.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await AppAdmin.api.authLogout();
      showToast('Déconnecté');
      // Vider l'etat local pour qu'un futur login reparte d'une liste vide
      if (AppAdmin.cabinets?.reset) AppAdmin.cabinets.reset();
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
        fireAuthenticated();
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

  // Eviter la double-init : avec defer, readyState peut etre 'interactive' au moment
  // ou l'IIFE s'execute, ET DOMContentLoaded peut fire ensuite. On utilise un flag.
  let initialized = false;
  function initOnce() {
    if (initialized) return;
    initialized = true;
    return init();
  }
  document.addEventListener('DOMContentLoaded', initOnce);
  if (document.readyState !== 'loading') initOnce();
})();
