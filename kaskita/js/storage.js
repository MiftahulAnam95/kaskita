/* ==========================================================
   KasKita — storage.js
   Penyimpanan LocalStorage dengan versi skema + fallback memori.
   ========================================================== */
(function () {
  'use strict';

  var DATA_KEY = 'kaskita:data';
  var ROLE_KEY = 'kaskita:role';
  var memory = {};
  var persistent = true;

  function read(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { persistent = false; return memory[key] === undefined ? null : memory[key]; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); }
    catch (e) { persistent = false; memory[key] = value; }
  }
  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { persistent = false; }
    delete memory[key];
  }

  function isValid(d) {
    return !!d && d.schemaVersion === window.KasKitaData.SCHEMA_VERSION &&
      d.config && Array.isArray(d.members) && Array.isArray(d.payments) &&
      Array.isArray(d.subsidyRequests) && Array.isArray(d.transactions);
  }

  function save(data) { write(DATA_KEY, JSON.stringify(data)); }

  // Inisialisasi: pakai data tersimpan jika valid & versinya cocok, jika tidak buat data awal.
  function load() {
    var raw = read(DATA_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      } catch (e) { /* data rusak -> dibuat ulang */ }
    }
    var fresh = window.KasKitaData.createInitialData();
    save(fresh);
    return fresh;
  }

  function reset() { remove(DATA_KEY); return load(); }

  var ROLES = ['treasurer', 'chair', 'member'];
  function loadRole() { var r = read(ROLE_KEY); return ROLES.indexOf(r) >= 0 ? r : 'treasurer'; }
  function saveRole(role) { write(ROLE_KEY, role); }

  window.KasKitaStorage = {
    load: load, save: save, reset: reset,
    loadRole: loadRole, saveRole: saveRole,
    isPersistent: function () { return persistent; }
  };
})();
