// assets/admin/api.js
// Client API minimaliste pour les endpoints Vercel Functions.
// Pattern : objet AppAdmin.api avec methodes retourne des Promesses.
// Toutes les requetes utilisent credentials: 'include' pour envoyer/recevoir
// le cookie de session HttpOnly.

(function () {
  'use strict';

  const AppAdmin = window.AppAdmin || (window.AppAdmin = {});
  const BASE = '/api';

  async function request(method, path, body) {
    const init = {
      method,
      credentials: 'include', // envoyer/recevoir le cookie de session
      headers: { 'Accept': 'application/json' },
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (err) {
      const e = new Error('Erreur réseau');
      e.cause = err;
      throw e;
    }
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const e = new Error((data && data.error) || `HTTP ${res.status}`);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  AppAdmin.api = {
    // === Auth ===
    authStatus() {
      return request('GET', '/admin-auth');
    },
    authLogin(code) {
      return request('POST', '/admin-auth', { code });
    },
    authLogout() {
      return request('DELETE', '/admin-auth');
    },
    // === Cabinets ===
    listCabinets() {
      return request('GET', '/cabinets');
    },
    mutateCabinet(action, payload) {
      return request('POST', '/cabinets', { action, payload });
    },
  };
})();
