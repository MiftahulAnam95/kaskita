/* ==========================================================
   KasKita — boot.js
   Layar muat (splash) agar tidak ada "blank putih" saat masuk
   ke website. File ini sengaja tidak bergantung pada file lain
   sehingga bisa dipanggil paling awal.

   Kontrak singkat:
     KasKitaBoot.progress('teks')  -> ganti pesan pada splash
     KasKitaBoot.done()            -> tutup splash (dengan waktu
                                      tampil minimum + fade)
     KasKitaBoot.ready(fn)         -> jalankan fn setelah splash
                                      tertutup
     KasKitaBoot.onChartReady(fn)  -> jalankan fn setelah Chart.js
                                      (CDN, dimuat async) siap
   ========================================================== */
(function () {
  'use strict';

  var MIN_SHOW = 0;     // ms — 0: masuk langsung tanpa menahan splash (lihat permintaan "langsung masuk")
  var HARD_CAP = 12000;  // ms — jaring pengaman bila ada yang gagal
  var FADE = 260;        // ms — harus sama dengan transisi .boot pada CSS
  var CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

  function time() {
    return (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  }

  var started = time();
  var booted = false;
  var finishRequested = false;
  var readyCbs = [];
  var chartCbs = [];
  var chartState = 'idle'; // idle | loading | ready | failed

  function el(id) { return document.getElementById(id); }

  function progress(text) {
    var node = el('boot-text');
    if (node && text) node.textContent = text;
  }

  function setBar(ratio) {
    var bar = el('boot-bar');
    if (!bar) return;
    ratio = Math.max(0.06, Math.min(1, ratio));
    bar.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
  }

  // Splash tetap "hidup": bar bergerak perlahan menuju 90% sampai app siap.
  function animateBar() {
    var values = [0.18, 0.42, 0.62, 0.75, 0.88];
    values.forEach(function (v, i) {
      window.setTimeout(function () { if (!booted) setBar(v); }, 90 + i * 260);
    });
  }

  function markBody(cls, removeCls) {
    if (!document.body) return;
    document.body.classList.add(cls);
    if (removeCls) document.body.classList.remove(removeCls);
  }

  /* ---------- Chart.js: dimuat async agar tidak memblokir tampilan ---------- */
  function chartLoaded() {
    if (chartState === 'ready') return true;
    chartState = 'ready';
    var cbs = chartCbs.slice();
    chartCbs = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) { /* diabaikan */ } });
    return true;
  }

  function loadChart() {
    if (window.Chart) { chartLoaded(); return; }
    if (chartState === 'loading' || chartState === 'failed') return;
    chartState = 'loading';
    var s = document.createElement('script');
    s.src = CHART_URL;
    s.async = true;
    s.onload = chartLoaded;
    s.onerror = function () { chartState = 'failed'; }; // aplikasi memakai grafik cadangan
    document.head.appendChild(s);
  }

  function onChartReady(cb) {
    if (typeof cb !== 'function') return;
    if (chartState === 'ready' || window.Chart) { cb(); return; }
    chartCbs.push(cb);
  }

  /* ---------- Menutup splash ---------- */
  function hide() {
    var node = el('boot');
    setBar(1);
    if (node) {
      node.classList.add('is-done');
      node.setAttribute('aria-hidden', 'true');
      window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, FADE + 60);
    }
    booted = true;
    markBody('is-ready', 'is-booting');

    // Beri tahu shell bahwa aplikasi sudah jalan (dipakai jaring pengaman di index.html).
    try { document.dispatchEvent(new Event('kaskita:ready')); } catch (e) { /* diabaikan */ }

    var cbs = readyCbs.slice();
    readyCbs = [];
    cbs.forEach(function (cb) { try { cb(); } catch (e) { /* diabaikan */ } });

    // Unduh pustaka grafik hanya setelah halaman terlihat.
    loadChart();
  }

  function done() {
    if (finishRequested) return;
    finishRequested = true;
    var wait = Math.max(0, MIN_SHOW - (time() - started));
    window.setTimeout(hide, wait);
  }

  function ready(cb) {
    if (typeof cb !== 'function') return;
    if (booted) { cb(); return; }
    readyCbs.push(cb);
  }

  /* ---------- Jaring pengaman ---------- */
  // Bila aplikasi gagal sebelum siap, shell menampilkan pesan gagal; batas ini
  // hanya menutup splash jika tidak ada kegagalan yang terdeteksi.
  // Hard cap hanya menutup splash jika bundel tidak menandai kegagalan.
  window.setTimeout(function () {
    if (!window.__kaskitaEntryFailed) done();
  }, HARD_CAP);
  // Halaman dipulihkan dari cache (tombol back) — aplikasi sudah ter-render,
  // jadi splash tidak boleh muncul lagi.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var node = el('boot');
    if (node && node.parentNode) node.parentNode.removeChild(node);
    markBody('is-ready', 'is-booting');
  });

  if (document.body) markBody('is-booting'); else document.addEventListener('DOMContentLoaded', function () { markBody('is-booting'); });

  window.KasKitaBoot = {
    progress: progress,
    setProgress: setBar,
    done: done,
    ready: ready,
    onChartReady: onChartReady,
    isBooted: function () { return booted; }
  };

  animateBar();
  setBar(0.08);
})();
