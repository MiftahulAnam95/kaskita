/* ==========================================================
   KasKita — app.js
   Logika aplikasi (vanilla JS). Semua angka dihitung dari
   satu sumber: db.transactions (saldo) dan db.payments (iuran).
   DATA SIMULASI — bukan uang sungguhan.
   ========================================================== */
(function () {
  'use strict';

  // Pengelola layar muat (js/boot.js). Cadangan kecil bila file itu tidak ada.
  var Boot = window.KasKitaBoot || {
    progress: function () {}, done: function () {},
    ready: function (fn) { fn(); }, onChartReady: function (fn) { fn(); }
  };

  Boot.progress('Memuat data kas…');
  var Store = window.KasKitaStorage;
  var db = Store.load();
  var cfg = function () { return db.config; };

  /* ---------------------------------------------------------
     Konstanta & state UI
     --------------------------------------------------------- */
  var PAGES = [
    { id: 'ringkasan', label: 'Ringkasan', icon: 'dashboard', title: 'Ringkasan Kas' },
    { id: 'pembayaran', label: 'Pembayaran', icon: 'users', title: 'Pembayaran Anggota' },
    { id: 'subsidi', label: 'Subsidi', icon: 'file', title: 'Subsidi Tugas Kelompok' },
    { id: 'bukukas', label: 'Buku Kas', icon: 'book', title: 'Buku Kas' },
    { id: 'laporan', label: 'Laporan', icon: 'chart', title: 'Laporan Keuangan' }
  ];
  var ROLES = {
    treasurer: { label: 'Bendahara', desc: 'Mencatat pembayaran, transaksi, dan pencairan subsidi.' },
    chair: { label: 'Ketua Kelas', desc: 'Menyetujui atau menolak pengajuan subsidi.' },
    member: { label: 'Anggota', desc: 'Hanya melihat saldo, status pembayaran, pengajuan, dan laporan.' }
  };
  var PERMS = {
    treasurer: ['pay', 'member', 'txn', 'subsidy', 'ready', 'disburse', 'export'],
    chair: ['approve'],
    member: []
  };
  var PERM_TEXT = {
    pay: ['mencatat pembayaran anggota', 'Bendahara'],
    member: ['mengelola anggota', 'Bendahara'],
    txn: ['menambah transaksi kas', 'Bendahara'],
    subsidy: ['menginput pengajuan subsidi', 'Bendahara'],
    ready: ['memverifikasi pengajuan subsidi', 'Bendahara'],
    disburse: ['mencatat pencairan subsidi', 'Bendahara'],
    export: ['mengekspor laporan CSV', 'Bendahara'],
    approve: ['menyetujui atau menolak pengajuan', 'Ketua Kelas']
  };
  var CAT_IN = ['Iuran mingguan', 'Pemasukan lainnya'];
  var CAT_OUT = ['Subsidi tugas kelompok', 'Operasional kelas', 'Pengeluaran lainnya'];
  var CAT_SUBSIDY = 'Subsidi tugas kelompok';
  var SUB_STATUS = {
    pending: { label: 'Menunggu Persetujuan Ketua', cls: 'b-warning' },
    approved: { label: 'Disetujui Ketua', cls: 'b-info' },
    ready: { label: 'Siap Dicairkan', cls: 'b-primary' },
    disbursed: { label: 'Sudah Dicairkan', cls: 'b-solid' },
    rejected: { label: 'Ditolak', cls: 'b-danger' }
  };
  var PAY_STATUS = {
    lunas: { label: 'Lunas', cls: 'b-success' },
    sebagian: { label: 'Sebagian', cls: 'b-warning' },
    belum: { label: 'Belum lunas', cls: 'b-danger' }
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  var ui = {
    role: Store.loadRole(),
    page: 'ringkasan',
    pay: { q: '', period: db.config.activePeriod, status: 'all' },
    sub: { q: '', status: 'all' },
    led: { q: '', type: 'all', cat: 'all', from: '', to: '' },
    rep: { range: 'all' }
  };
  var chart = null;
  var sheetReturnFocus = null;

  /* ---------------------------------------------------------
     Helper umum
     --------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rp(n) {
    n = Math.round(Number(n) || 0);
    return (n < 0 ? '-' : '') + 'Rp' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmtDate(iso) {
    if (!iso) return '-';
    var p = iso.split('-');
    return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function periodLabel(id) {
    var p = cfg().periods.filter(function (x) { return x.id === id; })[0];
    return p ? p.label : id;
  }
  function monthShort(id) { var p = id.split('-'); return MONTHS[+p[1] - 1] + ' ' + String(p[0]).slice(2); }
  function monthOf(date) { return date.slice(0, 7); }
  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  }
  function pad3(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }
  function nextId(prefix, list) {
    var max = 0;
    list.forEach(function (x) { var n = parseInt(String(x.id).split('-').pop().replace(/\D/g, ''), 10); if (n > max) max = n; });
    return prefix + '-' + pad3(max + 1);
  }
  function parseMoney(str) {
    var s = String(str == null ? '' : str).replace(/rp/i, '').replace(/[\s.]/g, '');
    if (!/^\d+$/.test(s)) return NaN;
    return parseInt(s, 10);
  }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime()); }
  function memberById(id) { return db.members.filter(function (m) { return m.id === id; })[0]; }
  function requestById(id) { return db.subsidyRequests.filter(function (r) { return r.id === id; })[0]; }
  function txnById(id) { return db.transactions.filter(function (t) { return t.id === id; })[0]; }
  function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }

  /* ---------------------------------------------------------
     Ikon (path Lucide, inline — tidak butuh CDN sehingga tidak bisa gagal dimuat)
     --------------------------------------------------------- */
  var ICONS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
    up: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  function ic(name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  /* ---------------------------------------------------------
     Perhitungan keuangan (satu sumber: transactions & payments)
     --------------------------------------------------------- */
  function ledgerOf(list) {
    var bal = cfg().openingBalance || 0;
    return list.map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) { return a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i; })
      .map(function (x) {
        bal += x.t.type === 'income' ? x.t.amount : -x.t.amount;
        var o = {}; for (var k in x.t) o[k] = x.t[k];
        o.balance = bal;
        return o;
      });
  }
  function ledger() { return ledgerOf(db.transactions); }
  function currentBalance() { var l = ledger(); return l.length ? l[l.length - 1].balance : (cfg().openingBalance || 0); }
  function firstNegative(newTxn) {
    var l = ledgerOf(db.transactions.concat([newTxn]));
    for (var i = 0; i < l.length; i++) if (l[i].balance < 0) return l[i];
    return null;
  }
  function flows(list) {
    var inc = 0, out = 0;
    list.forEach(function (t) { if (t.type === 'income') inc += t.amount; else out += t.amount; });
    return { inc: inc, out: out };
  }
  function includedIn(m, period) { return m.active && period >= m.startPeriod; }

  function memberPeriod(memberId, period) {
    var fee = cfg().weeklyFee, n = cfg().weeksPerPeriod, target = fee * n;
    var weeks = [], total = 0;
    for (var w = 1; w <= n; w++) {
      var ps = db.payments.filter(function (p) { return p.memberId === memberId && p.period === period && p.week === w; });
      var paid = ps.reduce(function (s, p) { return s + p.amount; }, 0);
      total += paid;
      weeks.push({ week: w, paid: paid, payments: ps, status: paid >= fee ? 'paid' : paid > 0 ? 'partial' : 'unpaid' });
    }
    // Status "lunas" hanya jika jumlah yang benar-benar dibayar memenuhi seluruh kewajiban periode.
    return { weeks: weeks, total: total, target: target, status: total >= target ? 'lunas' : total > 0 ? 'sebagian' : 'belum' };
  }
  function periodSummary(period) {
    var r = { count: 0, lunas: 0, sebagian: 0, belum: 0, collected: 0, target: 0, pct: 0 };
    db.members.filter(function (m) { return includedIn(m, period); }).forEach(function (m) {
      var s = memberPeriod(m.id, period);
      r.count++; r[s.status]++;
      r.collected += Math.min(s.total, s.target); r.target += s.target;
    });
    r.pct = r.target ? Math.round(r.collected / r.target * 100) : 0;
    return r;
  }
  function monthlyFlows() {
    return cfg().periods.map(function (p) {
      var f = flows(db.transactions.filter(function (t) { return monthOf(t.date) === p.id; }));
      return { id: p.id, label: p.label, inc: f.inc, out: f.out };
    });
  }
  function effectiveSubsidy(r) {
    if (r.status === 'rejected') return 0;
    if (r.status === 'disbursed') return r.disbursedAmount;
    if (r.approvedAmount != null) return r.approvedAmount;
    return r.requestedAmount;
  }

  /* ---------------------------------------------------------
     Hak akses (simulasi) & notifikasi
     --------------------------------------------------------- */
  function can(perm) { return PERMS[ui.role].indexOf(perm) >= 0; }
  function guard(perm) {
    if (can(perm)) return true;
    var t = PERM_TEXT[perm];
    toast('Peran ' + ROLES[ui.role].label + ' tidak dapat ' + t[0] + '. Ganti ke peran ' + t[1] + ' pada kontrol "Simulasi peran" untuk mencoba.', 'error');
    return false;
  }
  function toast(msg, type) {
    type = type || 'success';
    var root = $('#toast-root'); if (!root) return;
    while (root.children.length >= 3) root.removeChild(root.firstChild);
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = ic(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info') + '<span>' + esc(msg) + '</span>';
    el.addEventListener('click', function () { el.remove(); });
    root.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, type === 'error' ? 6500 : 4200);
  }

  /* ---------------------------------------------------------
     Sheet (bottom sheet di mobile / dialog di desktop) & konfirmasi
     --------------------------------------------------------- */
  function openSheet(title, body) {
    var root = $('#sheet-root');
    var already = !!root.firstChild;
    if (!already) sheetReturnFocus = document.activeElement;
    root.innerHTML =
      '<div class="overlay' + (already ? ' no-anim' : '') + '" data-action="overlay">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">' +
      '<div class="sheet-head"><h2 id="sheet-title">' + esc(title) + '</h2>' +
      '<button type="button" class="icon-btn" data-action="close-sheet" aria-label="Tutup">' + ic('x') + '</button></div>' +
      '<div class="sheet-body">' + body + '</div></div></div>';
    document.body.classList.add('no-scroll');
    // Fokus ke dialog (bukan ke input) agar keyboard virtual tidak langsung menutupi form.
    var target = $('.sheet', root);
    if (target && target.focus) target.focus({ preventScroll: true });
  }
  function closeSheet() {
    var root = $('#sheet-root');
    if (!root || !root.firstChild) return;
    root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    if (sheetReturnFocus && sheetReturnFocus.isConnected && sheetReturnFocus.focus) sheetReturnFocus.focus({ preventScroll: true });
    sheetReturnFocus = null;
  }
  var confirmResolve = null;
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var root = $('#confirm-root');
      var prev = document.activeElement;
      var danger = o.tone === 'danger';
      var details = (o.details || []).map(function (d) { return '<div><dt>' + esc(d[0]) + '</dt><dd>' + esc(d[1]) + '</dd></div>'; }).join('');
      root.innerHTML =
        '<div class="overlay dialog-overlay" data-action="confirm-overlay"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">' +
        '<h2 id="dlg-title">' + esc(o.title) + '</h2><p id="dlg-msg">' + esc(o.message || '') + '</p>' +
        (details ? '<dl class="dl">' + details + '</dl>' : '') +
        '<div class="dialog-actions"><button type="button" class="btn btn-secondary" id="dlg-cancel">Batal</button>' +
        '<button type="button" class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="dlg-ok">' + esc(o.confirmText || 'Ya, lanjutkan') + '</button></div></div></div>';
      function done(v) {
        confirmResolve = null; root.innerHTML = '';
        if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
        resolve(v);
      }
      confirmResolve = done;
      $('#dlg-cancel').addEventListener('click', function () { done(false); });
      $('#dlg-ok').addEventListener('click', function () { done(true); });
      (danger ? $('#dlg-cancel') : $('#dlg-ok')).focus();
    });
  }

  /* ---------------------------------------------------------
     Komponen form
     --------------------------------------------------------- */
  function field(id, label, control, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + control +
      '<p class="hint" id="' + id + '-hint">' + (hint || '') + '</p><p class="field-error" id="' + id + '-err" role="alert"></p></div>';
  }
  function sel(id, options, value, placeholder, attrs) {
    var h = '<select class="input" id="' + id + '" ' + (attrs || '') + '>';
    if (placeholder) h += '<option value="">' + esc(placeholder) + '</option>';
    options.forEach(function (o) {
      h += '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    });
    return h + '</select>';
  }
  function moneyInput(id, value) {
    return '<input class="input" id="' + id + '" type="text" inputmode="numeric" autocomplete="off" data-money value="' + esc(value || '') + '" placeholder="contoh: 10000">';
  }
  function setErr(id, msg) {
    var e = $('#' + id + '-err'), i = $('#' + id);
    if (e) e.textContent = msg || '';
    if (i) { i.classList.toggle('invalid', !!msg); if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }
  }
  function showErrors(errs) {
    var first = null;
    Object.keys(errs).forEach(function (id) { setErr(id, errs[id]); if (!first) first = id; });
    if (first) { var el = $('#' + first); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } }
  }
  function clearErrors(root) {
    $$('.field-error', root).forEach(function (e) { e.textContent = ''; });
    $$('.invalid', root).forEach(function (e) { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); });
    var fe = $('.form-error', root); if (fe) fe.textContent = '';
  }
  function permBtn(perm, cls, action, label, icon, attrs) {
    var locked = !can(perm);
    return '<button type="button" class="btn ' + cls + (locked ? ' locked' : '') + '" data-action="' + action + '" ' + (attrs || '') +
      (locked ? ' title="Hanya ' + PERM_TEXT[perm][1] + '"' : '') + '>' + ic(locked ? 'lock' : icon) + label + '</button>';
  }
  function pageHead(title, desc, actions, badgeHtml) {
    return '<div class="page-head"><div><div class="title-row"><h1>' + title + '</h1>' + (badgeHtml || '') + '</div><p>' + desc + '</p></div>' +
      (actions ? '<div class="page-head-actions no-print">' + actions + '</div>' : '') + '</div>';
  }
  function emptyState(title, text, icon) {
    return '<div class="empty">' + ic(icon || 'inbox') + '<strong>' + esc(title) + '</strong><span>' + esc(text) + '</span></div>';
  }

  /* ---------------------------------------------------------
     Komponen tampilan kecil
     --------------------------------------------------------- */
  function txnRow(t) {
    var inc = t.type === 'income';
    return '<button type="button" class="row-item" data-action="open-txn" data-id="' + t.id + '">' +
      '<span class="t-icon ' + (inc ? 'in' : 'out') + '">' + ic(inc ? 'down' : 'up') + '</span>' +
      '<span class="row-main"><span class="row-title">' + esc(t.description) + '</span><span class="row-sub">' + fmtDate(t.date) + ' · ' + esc(t.category) + '</span></span>' +
      '<span class="row-side"><span class="amount ' + (inc ? 'in' : 'out') + '">' + (inc ? '+' : '-') + rp(t.amount) + '</span></span></button>';
  }
  function subCard(r) {
    var st = SUB_STATUS[r.status];
    return '<button type="button" class="sub-card" data-action="open-sub" data-id="' + r.id + '">' +
      '<div class="sub-top"><div style="min-width:0"><div class="row-sub">' + esc(r.groupName) + ' · ' + esc(r.course) + '</div>' +
      '<div class="row-title" style="margin-top:2px">' + esc(r.assignment) + '</div></div>' +
      '<div style="text-align:right;flex:none"><div class="amount">' + rp(r.requestedAmount) + '</div><div class="row-sub">diajukan</div></div></div>' +
      '<div class="sub-meta">' + badge(st.cls, st.label) + '<span>' + fmtDate(r.submittedAt) + '</span></div></button>';
  }

  /* ---------------------------------------------------------
     HALAMAN: Ringkasan
     --------------------------------------------------------- */
  function pageRingkasan() {
    var c = cfg(), p = c.activePeriod;
    var led = ledger();
    var bal = currentBalance();
    var month = flows(led.filter(function (t) { return monthOf(t.date) === p; }));
    var ps = periodSummary(p);
    var subs = db.subsidyRequests.slice().sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : b.id < a.id ? -1 : 1; }).slice(0, 3);
    var recent = led.slice().reverse().slice(0, 5);
    var perMonth = c.weeklyFee * c.weeksPerPeriod;
    var active = db.members.filter(function (m) { return m.active; }).length;
    var pending = db.subsidyRequests.filter(function (r) { return r.status === 'pending'; }).length;

    return pageHead('Ringkasan Kas', 'Pantau iuran, saldo, dan subsidi tugas kelompok.', '', badge('b-demo', 'Mode Demo')) +
      '<div class="grid metrics">' +
      '<div class="card metric hero"><div class="metric-label"><span class="metric-icon">' + ic('wallet') + '</span>Saldo Kas</div><div class="metric-value num">' + rp(bal) + '</div><div class="metric-sub">Dihitung dari seluruh transaksi di Buku Kas</div></div>' +
      '<div class="card metric"><div class="metric-label"><span class="metric-icon in">' + ic('down') + '</span>Pemasukan Bulan Ini</div><div class="metric-value num">' + rp(month.inc) + '</div><div class="metric-sub">' + esc(periodLabel(p)) + '</div></div>' +
      '<div class="card metric"><div class="metric-label"><span class="metric-icon out">' + ic('up') + '</span>Pengeluaran Bulan Ini</div><div class="metric-value num">' + rp(month.out) + '</div><div class="metric-sub">' + esc(periodLabel(p)) + '</div></div>' +
      '<div class="card metric"><div class="metric-label"><span class="metric-icon">' + ic('users') + '</span>Pembayaran Anggota</div><div class="metric-value num">' + ps.lunas + '<span class="muted" style="font-size:18px;font-weight:600"> / ' + ps.count + ' lunas</span></div><div class="metric-sub">' + ps.pct + '% kewajiban terbayar</div></div>' +
      '</div>' +

      '<div class="grid two-col section">' +
      '<section class="card" aria-labelledby="h-prog"><div class="card-head"><h2 class="card-title" id="h-prog">Progress Pembayaran · ' + esc(periodLabel(p)) + '</h2></div>' +
      '<div class="pct-row"><span class="pct-big num">' + ps.pct + '%</span><span class="muted num">' + rp(ps.collected) + ' dari ' + rp(ps.target) + '</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + ps.pct + '" aria-label="Progress pembayaran iuran"><i style="width:' + ps.pct + '%"></i></div>' +
      '<div class="stat-trio"><div class="s-ok"><b>' + ps.lunas + '</b><span>Lunas</span></div><div class="s-part"><b>' + ps.sebagian + '</b><span>Sebagian</span></div><div class="s-no"><b>' + ps.belum + '</b><span>Belum lunas</span></div></div>' +
      '<p class="hint" style="margin-top:12px">Total ' + active + ' anggota aktif. Yang belum lunas: ' + (ps.sebagian + ps.belum) + ' anggota.</p></section>' +

      '<section class="card" aria-labelledby="h-rule"><div class="card-head"><h2 class="card-title" id="h-rule">Aturan Iuran</h2></div>' +
      '<p class="muted">Iuran ' + rp(c.weeklyFee) + ' per minggu. Target ' + rp(perMonth) + ' per bulan berarti <b>' + c.weeksPerPeriod + ' kali pembayaran mingguan</b> — bukan biaya tambahan di luar iuran mingguan.</p>' +
      '<div class="rules"><div><b class="num">' + rp(perMonth) + '</b><span>per anggota / bulan</span></div><div><b class="num">' + rp(perMonth * active) + '</b><span>potensi / bulan (' + active + ' anggota)</span></div><div><b class="num">' + rp(perMonth * active * c.monthsPerYear) + '</b><span>potensi / ' + c.monthsPerYear + ' bulan</span></div></div>' +
      '<p class="hint" style="margin-top:12px">Potensi dihitung jika semua anggota selalu membayar. Seluruh data di prototype ini adalah simulasi.</p></section>' +
      '</div>' +

      '<section class="card section" aria-labelledby="h-chart"><div class="card-head"><h2 class="card-title" id="h-chart">Arus Kas per Bulan</h2></div>' +
      '<div class="chart-box" id="chart-box"><div class="skeleton" style="height:100%"></div></div>' +
      '<div class="legend"><span><i style="background:var(--success)"></i>Pemasukan</span><span><i style="background:var(--danger)"></i>Pengeluaran</span></div>' +
      '<ul class="flow-list">' + monthlyFlows().map(function (m) {
        return '<li><span>' + esc(m.label) + '</span><span><span class="in num">+' + rp(m.inc) + '</span> &nbsp; <span class="out num">-' + rp(m.out) + '</span></span></li>';
      }).join('') + '</ul></section>' +

      '<div class="grid two-col section">' +
      '<section class="card" aria-labelledby="h-sub"><div class="card-head"><h2 class="card-title" id="h-sub">Pengajuan Subsidi Terbaru</h2>' +
      (pending ? badge('b-warning', pending + ' menunggu') : '') + '</div><div class="list">' +
      (subs.length ? subs.map(function (r) {
        var st = SUB_STATUS[r.status];
        return '<button type="button" class="row-item" data-action="open-sub" data-id="' + r.id + '"><span class="row-main"><span class="row-sub">' + esc(r.groupName) + ' · ' + fmtDate(r.submittedAt) + '</span><span class="row-title">' + esc(r.assignment) + '</span><span>' + badge(st.cls, st.label) + '</span></span>' +
          '<span class="row-side"><span class="amount">' + rp(r.requestedAmount) + '</span></span></button>';
      }).join('') : emptyState('Belum ada pengajuan', 'Pengajuan subsidi akan tampil di sini.', 'file')) +
      '</div><div style="margin-top:8px"><button type="button" class="link-btn" data-action="goto" data-page="subsidi">Lihat semua pengajuan ' + ic('chevron') + '</button></div></section>' +

      '<section class="card" aria-labelledby="h-tx"><div class="card-head"><h2 class="card-title" id="h-tx">Transaksi Terbaru</h2>' +
      '<button type="button" class="link-btn" data-action="goto" data-page="bukukas">Lihat Semua</button></div><div class="list">' +
      (recent.length ? recent.map(txnRow).join('') : emptyState('Belum ada transaksi', 'Catat pembayaran atau transaksi untuk memulai.', 'book')) +
      '</div></section></div>';
  }

  function drawChart() {
    var box = $('#chart-box'); if (!box) return;
    if (chart) { chart.destroy(); chart = null; }
    var rows = monthlyFlows();
    function fallback() {
      var max = 1; rows.forEach(function (r) { max = Math.max(max, r.inc, r.out); });
      box.innerHTML = '<div class="fb" role="img" aria-label="Grafik batang pemasukan dan pengeluaran per bulan">' + rows.map(function (r) {
        return '<div class="fb-col"><div class="fb-bars"><i class="bi" style="height:' + (r.inc / max * 100) + '%"></i><i class="bo" style="height:' + (r.out / max * 100) + '%"></i></div><small>' + esc(monthShort(r.id)) + '</small></div>';
      }).join('') + '</div>';
    }
    if (!window.Chart) {
      fallback();
      // Chart.js dimuat tidak-blocking oleh js/boot.js; begitu siap, grafik
      // digambar ulang (hanya bila halaman ringkasan masih tampil).
      Boot.onChartReady(function () { if (ui.page === 'ringkasan') drawChart(); });
      return;
    }
    try {
      box.innerHTML = '<canvas id="cash-chart" role="img" aria-label="Grafik batang pemasukan dan pengeluaran per bulan"></canvas>';
      chart = new window.Chart($('#cash-chart'), {
        type: 'bar',
        data: {
          labels: rows.map(function (r) { return monthShort(r.id); }),
          datasets: [
            { label: 'Pemasukan', data: rows.map(function (r) { return r.inc; }), backgroundColor: '#23845B', borderRadius: 6, maxBarThickness: 36 },
            { label: 'Pengeluaran', data: rows.map(function (r) { return r.out; }), backgroundColor: '#C74747', borderRadius: 6, maxBarThickness: 36 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + rp(ctx.parsed.y); } } }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { maxTicksLimit: 5, callback: function (v) { return v >= 1000 ? (v / 1000) + 'rb' : v; } } }
          }
        }
      });
    } catch (e) { chart = null; fallback(); }
  }

  /* ---------------------------------------------------------
     HALAMAN: Pembayaran
     --------------------------------------------------------- */
  function payFiltered() {
    var f = ui.pay, q = f.q.trim().toLowerCase();
    return db.members.filter(function (m) { return includedIn(m, f.period); })
      .map(function (m) { return { m: m, s: memberPeriod(m.id, f.period) }; })
      .filter(function (x) {
        return (f.status === 'all' || x.s.status === f.status) &&
          (!q || (x.m.name + ' ' + x.m.memberNumber).toLowerCase().indexOf(q) >= 0);
      });
  }
  function paySummaryHtml() {
    var ps = periodSummary(ui.pay.period);
    return '<div class="summary-line"><span><b>' + ps.lunas + '</b> lunas</span><span><b>' + ps.sebagian + '</b> sebagian</span><span><b>' + ps.belum + '</b> belum lunas</span>' +
      '<span>Terkumpul <b class="num">' + rp(ps.collected) + '</b> dari <b class="num">' + rp(ps.target) + '</b></span></div>';
  }
  function payListHtml() {
    var rows = payFiltered();
    var h = rows.length ? '<div class="member-grid">' + rows.map(function (x) {
      var st = PAY_STATUS[x.s.status];
      return '<button type="button" class="member" data-action="open-member" data-id="' + x.m.id + '">' +
        '<span class="avatar">' + esc(initials(x.m.name)) + '</span>' +
        '<span class="member-main"><strong>' + esc(x.m.name) + '</strong><small>' + esc(x.m.memberNumber) + '</small>' +
        '<span class="weeks" aria-label="Status per minggu">' + x.s.weeks.map(function (w) {
          return '<span class="wk ' + w.status + '" title="Minggu ' + w.week + ': ' + rp(w.paid) + '">' + w.week + '<span class="sr-only"> ' + (w.status === 'paid' ? 'lunas' : w.status === 'partial' ? 'sebagian' : 'belum') + '</span></span>';
        }).join('') + '</span></span>' +
        '<span class="member-side">' + badge(st.cls, st.label) + '<span class="amount">' + rp(x.s.total) + '</span><small class="muted">dari ' + rp(x.s.target) + '</small></span></button>';
    }).join('') + '</div>' : '<div class="card">' + emptyState('Tidak ada anggota ditemukan', 'Ubah kata kunci pencarian atau filter status/periode.', 'search') + '</div>';
    var inactive = db.members.filter(function (m) { return !m.active; });
    if (inactive.length) {
      h += '<section class="card section"><h2 class="card-title" style="margin-bottom:8px">Anggota Nonaktif</h2><div class="list">' + inactive.map(function (m) {
        return '<div class="row-item"><span class="row-main"><span class="row-title">' + esc(m.name) + '</span><span class="row-sub">' + esc(m.memberNumber) + '</span></span>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="toggle-member" data-id="' + m.id + '">Aktifkan</button></div>';
      }).join('') + '</div></section>';
    }
    return h;
  }
  function pagePembayaran() {
    var f = ui.pay;
    return pageHead('Pembayaran Anggota', 'Status iuran mingguan ' + rp(cfg().weeklyFee) + ' per anggota. Anggota hanya melihat, bendahara mencatat.',
      permBtn('pay', 'btn-primary', 'new-payment', 'Catat Pembayaran', 'plus') + permBtn('member', 'btn-secondary', 'new-member', 'Tambah Anggota', 'users')) +
      '<div class="card filters f3">' +
      '<div class="field"><label for="pay-q" class="sr-only">Cari anggota</label><div class="search">' + ic('search') + '<input class="input" id="pay-q" type="search" placeholder="Cari nama atau nomor anggota" data-filter="pay.q" value="' + esc(f.q) + '" autocomplete="off"></div></div>' +
      '<div class="field"><label for="pay-period" class="sr-only">Periode</label>' + sel('pay-period', cfg().periods.map(function (p) { return [p.id, p.label]; }), f.period, '', 'data-filter="pay.period"') + '</div>' +
      '<div class="field"><label for="pay-status" class="sr-only">Status</label>' + sel('pay-status', [['all', 'Semua status'], ['lunas', 'Lunas'], ['sebagian', 'Sebagian'], ['belum', 'Belum lunas']], f.status, '', 'data-filter="pay.status"') + '</div></div>' +
      '<div id="pay-summary">' + paySummaryHtml() + '</div><div id="pay-list">' + payListHtml() + '</div>';
  }

  function openMember(id) {
    var m = memberById(id); if (!m) return;
    var period = ui.pay.period;
    var s = memberPeriod(id, period);
    var st = PAY_STATUS[s.status];
    var hist = db.payments.filter(function (p) { return p.memberId === id; })
      .sort(function (a, b) { return a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : a.id < b.id ? 1 : -1; });
    var body =
      '<div class="profile-head"><span class="avatar">' + esc(initials(m.name)) + '</span><div><strong>' + esc(m.name) + '</strong><div class="row-sub">' + esc(m.memberNumber) + ' · ' + esc(m.id) + (m.active ? '' : ' · Nonaktif') + '</div></div></div>' +
      '<div class="card" style="box-shadow:none"><div class="pct-row"><span>' + badge(st.cls, st.label) + '</span><span class="muted">' + esc(periodLabel(period)) + '</span></div>' +
      '<div class="pct-row"><span class="pct-big num">' + rp(s.total) + '</span><span class="muted num">dari ' + rp(s.target) + '</span></div>' +
      '<div class="progress"><i style="width:' + Math.min(100, Math.round(s.total / s.target * 100)) + '%"></i></div></div>' +
      '<div class="sheet-section"><h3>Pembayaran mingguan</h3><div class="recap">' + s.weeks.map(function (w) {
        var last = w.payments[w.payments.length - 1];
        var label = w.status === 'paid' ? ['b-success', 'Lunas'] : w.status === 'partial' ? ['b-warning', 'Sebagian'] : ['b-neutral', 'Belum'];
        return '<div class="recap-row"><span class="l"><b>Minggu ' + w.week + '</b><small>' + (last ? fmtDate(last.paidAt) + ' · ' + esc(last.method) : 'Belum ada pembayaran') + '</small></span><span class="r"><span class="amount">' + rp(w.paid) + '</span>' + badge(label[0], label[1]) + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="sheet-section"><h3>Riwayat pembayaran (semua periode)</h3>' + (hist.length ? '<div class="recap">' + hist.map(function (p) {
        return '<div class="recap-row"><span class="l"><b>' + esc(periodLabel(p.period)) + ' · Minggu ' + p.week + '</b><small>' + esc(p.id) + ' · ' + fmtDate(p.paidAt) + ' · ' + esc(p.method) + (p.note ? ' · ' + esc(p.note) : '') + '</small></span><span class="r"><span class="amount in">' + rp(p.amount) + '</span></span></div>';
      }).join('') + '</div>' : emptyState('Belum ada riwayat', 'Pembayaran yang dicatat bendahara akan muncul di sini.', 'wallet')) + '</div>' +
      '<div class="form-actions" style="margin-top:20px">' +
      '<button type="button" class="btn btn-ghost danger" data-action="toggle-member" data-id="' + id + '">' + (m.active ? 'Nonaktifkan anggota' : 'Aktifkan anggota') + '</button>' +
      permBtn('pay', 'btn-primary', 'new-payment', 'Catat Pembayaran', 'plus', 'data-member="' + id + '"') + '</div>';
    openSheet('Detail Pembayaran', body);
  }

  function openPaymentForm(memberId) {
    if (!guard('pay')) return;
    var c = cfg();
    var members = db.members.filter(function (m) { return m.active; });
    var body = '<form id="pay-form" data-form="payment" novalidate>' +
      '<div class="form-error" role="alert"></div>' +
      field('pf-member', 'Anggota', sel('pf-member', members.map(function (m) { return [m.id, m.name + ' (' + m.memberNumber + ')']; }), memberId || '', 'Pilih anggota', 'required')) +
      field('pf-period', 'Periode', sel('pf-period', c.periods.map(function (p) { return [p.id, p.label]; }), ui.pay.period, 'Pilih periode', 'required')) +
      field('pf-week', 'Minggu pembayaran', sel('pf-week', [1, 2, 3, 4].slice(0, c.weeksPerPeriod).map(function (w) { return [w, 'Minggu ' + w]; }), '', 'Pilih minggu', 'required')) +
      field('pf-amount', 'Nominal (Rp)', moneyInput('pf-amount', c.weeklyFee), '= ' + rp(c.weeklyFee)) +
      field('pf-date', 'Tanggal pembayaran', '<input class="input" id="pf-date" type="date" value="' + c.demoToday + '" required>') +
      field('pf-method', 'Metode pembayaran', sel('pf-method', [['Tunai', 'Tunai'], ['Transfer', 'Transfer'], ['E-wallet', 'E-wallet']], 'Tunai')) +
      field('pf-note', 'Catatan (opsional)', '<textarea class="input" id="pf-note" rows="2" maxlength="120" placeholder="Misal: dititipkan ke teman"></textarea>') +
      '<div class="note note-info" style="margin-bottom:14px">' + ic('info') + '<span>Setiap pembayaran otomatis menjadi satu transaksi pemasukan di Buku Kas (tanpa pemasukan ganda).</span></div>' +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-sheet">Batal</button><button type="submit" class="btn btn-primary">Simpan Pembayaran</button></div></form>';
    openSheet('Catat Pembayaran', body);
    payFormSync();
  }
  function payFormSync(source) {
    var f = $('#pay-form'); if (!f) return;
    var c = cfg();
    var mid = $('#pf-member').value, per = $('#pf-period').value, wk = parseInt($('#pf-week').value, 10);
    var ph = $('#pf-period-hint'), wh = $('#pf-week-hint'), amt = $('#pf-amount');
    ph.textContent = ''; wh.textContent = ''; wh.classList.remove('warn');
    if (mid && per) {
      var s = memberPeriod(mid, per);
      ph.textContent = 'Total ' + periodLabel(per) + ': ' + rp(s.total) + ' dari ' + rp(s.target) + ' (sisa ' + rp(Math.max(0, s.target - s.total)) + ').';
      if (wk) {
        var w = s.weeks[wk - 1];
        if (w.paid > 0) { wh.classList.add('warn'); wh.textContent = 'Perhatian: Minggu ' + wk + ' sudah tercatat ' + rp(w.paid) + '. Anda akan diminta konfirmasi jika menyimpan lagi.'; }
        if (source !== 'amount' && !amt.dataset.touched) {
          var due = w.paid > 0 && w.paid < c.weeklyFee ? c.weeklyFee - w.paid : c.weeklyFee;
          amt.value = String(due);
          moneyHint(amt);
        }
      }
    }
  }
  function moneyHint(input) {
    var h = $('#' + input.id + '-hint'); if (!h) return;
    var n = parseMoney(input.value);
    h.textContent = !input.value.trim() ? '' : (isNaN(n) ? 'Gunakan angka saja, tanpa huruf atau tanda minus.' : '= ' + rp(n));
  }
  function submitPayment() {
    if (!guard('pay')) return;
    var f = $('#pay-form'); clearErrors(f);
    var c = cfg();
    var v = {
      memberId: $('#pf-member').value, period: $('#pf-period').value, week: parseInt($('#pf-week').value, 10),
      amount: parseMoney($('#pf-amount').value), paidAt: $('#pf-date').value, method: $('#pf-method').value, note: $('#pf-note').value.trim()
    };
    var errs = {}, m = memberById(v.memberId), s = null;
    if (!v.memberId || !m) errs['pf-member'] = 'Pilih anggota terlebih dahulu.';
    if (!v.period) errs['pf-period'] = 'Pilih periode pembayaran.';
    if (!v.week) errs['pf-week'] = 'Pilih minggu pembayaran.';
    if (isNaN(v.amount) || v.amount <= 0) errs['pf-amount'] = 'Nominal harus lebih besar dari nol. Isi dengan angka, misalnya 10000.';
    if (!validDate(v.paidAt)) errs['pf-date'] = 'Isi tanggal pembayaran yang valid.';
    if (m && v.period && !includedIn(m, v.period)) errs['pf-period'] = 'Anggota ini belum terdaftar pada periode tersebut.';
    if (!errs['pf-member'] && !errs['pf-period'] && !errs['pf-amount']) {
      s = memberPeriod(v.memberId, v.period);
      var remain = s.target - s.total;
      if (remain <= 0) errs['pf-period'] = m.name + ' sudah lunas pada ' + periodLabel(v.period) + ' (' + rp(s.total) + '). Pilih periode lain.';
      else if (v.amount > remain) errs['pf-amount'] = 'Nominal melebihi sisa kewajiban periode (' + rp(remain) + '). Kurangi nominal.';
    }
    if (Object.keys(errs).length) { showErrors(errs); return; }

    var existing = db.payments.filter(function (p) { return p.memberId === v.memberId && p.period === v.period && p.week === v.week; });
    function save() {
      var txId = nextId('TRX', db.transactions), payId = nextId('PAY', db.payments);
      db.payments.push({ id: payId, memberId: v.memberId, period: v.period, week: v.week, amount: v.amount, paidAt: v.paidAt, method: v.method, note: v.note, transactionId: txId });
      db.transactions.push({
        id: txId, date: v.paidAt, type: 'income', category: 'Iuran mingguan',
        description: 'Iuran ' + m.name + ' — Minggu ' + v.week + ' ' + periodLabel(v.period),
        amount: v.amount, memberId: v.memberId, paymentId: payId, subsidyRequestId: null
      });
      commit(); closeSheet();
      toast('Pembayaran ' + rp(v.amount) + ' dari ' + m.name + ' tercatat. Dashboard dan laporan sudah diperbarui.');
    }
    if (existing.length) {
      var sum = existing.reduce(function (a, p) { return a + p.amount; }, 0);
      confirmDialog({
        title: 'Minggu ini sudah ada pembayaran', tone: 'danger', confirmText: 'Tetap Catat',
        message: m.name + ' sudah tercatat membayar ' + rp(sum) + ' untuk Minggu ' + v.week + ' ' + periodLabel(v.period) + '. Mencatat lagi bisa menyebabkan pemasukan ganda. Lanjutkan hanya jika ini memang pembayaran tambahan.'
      }).then(function (ok) { if (ok) save(); });
    } else save();
  }

  function openMemberForm() {
    if (!guard('member')) return;
    openSheet('Tambah Anggota', '<form id="member-form" data-form="member" novalidate><div class="form-error" role="alert"></div>' +
      field('mf-name', 'Nama anggota', '<input class="input" id="mf-name" type="text" maxlength="60" autocomplete="off" placeholder="Nama lengkap (data simulasi)">') +
      '<div class="note note-info" style="margin-bottom:14px">' + ic('info') + '<span>Anggota baru mulai ditagih pada periode aktif (' + esc(periodLabel(cfg().activePeriod)) + '). Gunakan nama fiktif untuk demo.</span></div>' +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-sheet">Batal</button><button type="submit" class="btn btn-primary">Tambah Anggota</button></div></form>');
  }
  function submitMember() {
    if (!guard('member')) return;
    var name = $('#mf-name').value.trim(); clearErrors($('#member-form'));
    if (name.length < 3) { showErrors({ 'mf-name': 'Isi nama minimal 3 huruf.' }); return; }
    if (db.members.some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })) { showErrors({ 'mf-name': 'Nama ini sudah terdaftar. Gunakan nama lain.' }); return; }
    var n = db.members.length + 1;
    db.members.push({ id: 'M' + pad3(n), name: name, memberNumber: 'ANG-' + pad3(n), active: true, startPeriod: cfg().activePeriod });
    commit(); closeSheet(); toast(name + ' ditambahkan sebagai anggota.');
  }
  function toggleMember(id) {
    if (!guard('member')) return;
    var m = memberById(id); if (!m) return;
    var activating = !m.active;
    confirmDialog({
      title: activating ? 'Aktifkan anggota?' : 'Nonaktifkan anggota?', tone: activating ? 'primary' : 'danger',
      confirmText: activating ? 'Aktifkan' : 'Nonaktifkan',
      message: activating ? m.name + ' akan kembali ditagih iuran.' : m.name + ' tidak lagi ditagih dan tidak dihitung pada persentase. Riwayat pembayaran tetap tersimpan di Buku Kas.'
    }).then(function (ok) {
      if (!ok) return;
      m.active = activating; commit(); closeSheet();
      toast(m.name + (activating ? ' diaktifkan.' : ' dinonaktifkan.'));
    });
  }

  /* ---------------------------------------------------------
     HALAMAN: Subsidi
     --------------------------------------------------------- */
  function subFiltered() {
    var f = ui.sub, q = f.q.trim().toLowerCase();
    return db.subsidyRequests.filter(function (r) {
      return (f.status === 'all' || r.status === f.status) &&
        (!q || (r.groupName + ' ' + r.assignment + ' ' + r.course + ' ' + r.id).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : b.id < a.id ? -1 : 1; });
  }
  function subListHtml() {
    var rows = subFiltered();
    return rows.length ? '<div class="sub-grid">' + rows.map(subCard).join('') + '</div>' :
      '<div class="card">' + emptyState('Tidak ada pengajuan', 'Ubah filter atau kata kunci pencarian.', 'file') + '</div>';
  }
  function pageSubsidi() {
    var f = ui.sub;
    return pageHead('Subsidi Tugas Kelompok', 'Ajukan, setujui, dan cairkan subsidi dengan alur yang jelas.', permBtn('subsidy', 'btn-primary', 'new-subsidy', 'Ajukan Subsidi', 'plus')) +
      '<section class="card"><h2 class="card-title">Alur Persetujuan</h2>' +
      '<ol class="steps"><li>Pengajuan dibuat</li><li>Ketua menyetujui / menolak</li><li>Bendahara verifikasi → Siap Dicairkan</li><li>Pencairan dicatat di Buku Kas</li></ol>' +
      '<div class="note note-ok" style="margin-top:12px">' + ic('info') + '<span>Persetujuan ketua <b>tidak</b> mengurangi saldo. Saldo baru berkurang saat bendahara mencatat pencairan.</span></div></section>' +
      '<div class="card filters f2"><div class="field"><label for="sub-q" class="sr-only">Cari pengajuan</label><div class="search">' + ic('search') + '<input class="input" id="sub-q" type="search" placeholder="Cari kelompok atau tugas" data-filter="sub.q" value="' + esc(f.q) + '" autocomplete="off"></div></div>' +
      '<div class="field"><label for="sub-status" class="sr-only">Status</label>' + sel('sub-status', [['all', 'Semua status']].concat(Object.keys(SUB_STATUS).map(function (k) { return [k, SUB_STATUS[k].label]; })), f.status, '', 'data-filter="sub.status"') + '</div></div>' +
      '<div id="sub-list">' + subListHtml() + '</div>';
  }

  function openSubsidy(id) {
    var r = requestById(id); if (!r) return;
    var st = SUB_STATUS[r.status];
    var eff = effectiveSubsidy(r);
    var pct = r.totalCost ? Math.round(eff / r.totalCost * 100) : 0;
    var needs = String(r.description || '').split('\n').filter(function (l) { return l.trim(); });
    var trx = r.transactionId ? txnById(r.transactionId) : null;
    var body =
      '<div style="margin-bottom:12px">' + badge(st.cls, st.label) + '</div>' +
      '<dl class="dl">' +
      '<div><dt>ID pengajuan</dt><dd>' + esc(r.id) + '</dd></div>' +
      '<div><dt>Kelompok</dt><dd>' + esc(r.groupName) + '</dd></div>' +
      '<div><dt>Mata kuliah</dt><dd>' + esc(r.course) + '</dd></div>' +
      '<div><dt>Tugas</dt><dd>' + esc(r.assignment) + '</dd></div>' +
      '<div><dt>Pengaju</dt><dd>' + esc(r.submittedBy) + '</dd></div>' +
      '<div><dt>Tanggal pengajuan</dt><dd>' + fmtDate(r.submittedAt) + '</dd></div></dl>' +
      '<div class="sheet-section"><h3>Rincian kebutuhan</h3>' + (needs.length ? '<ul class="need-list">' + needs.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Tidak ada rincian.</p>') + '</div>' +
      '<div class="sheet-section"><h3>Perhitungan biaya</h3><dl class="dl">' +
      '<div><dt>Total biaya tugas</dt><dd class="num">' + rp(r.totalCost) + '</dd></div>' +
      '<div><dt>Subsidi diajukan</dt><dd class="num">' + rp(r.requestedAmount) + '</dd></div>' +
      (r.approvedAmount != null ? '<div><dt>Subsidi disetujui</dt><dd class="num">' + rp(r.approvedAmount) + '</dd></div>' : '') +
      (r.status === 'disbursed' ? '<div><dt>Subsidi dicairkan</dt><dd class="num">' + rp(r.disbursedAmount) + '</dd></div>' : '') +
      '<div><dt>Subsidi terhadap total biaya</dt><dd>' + pct + '%</dd></div>' +
      '<div><dt>Ditanggung kelompok</dt><dd class="num">' + rp(r.totalCost - eff) + '</dd></div></dl>' +
      (r.status === 'rejected' ? '<p class="hint" style="margin-top:8px">Pengajuan ditolak, sehingga seluruh biaya ditanggung kelompok.</p>' : '') + '</div>' +
      (r.approvalNote ? '<div class="sheet-section"><h3>Catatan ketua' + (r.approvedBy ? ' (' + esc(r.approvedBy) + ')' : '') + '</h3><div class="note ' + (r.status === 'rejected' ? 'note-danger' : 'note-info') + '"><span>' + esc(r.approvalNote) + '</span></div></div>' : '') +
      (r.status === 'disbursed' ? '<div class="sheet-section"><h3>Pencairan</h3><dl class="dl"><div><dt>Tanggal pencairan</dt><dd>' + fmtDate(r.disbursedAt) + '</dd></div><div><dt>Referensi Buku Kas</dt><dd>' + (trx ? '<button type="button" class="link-btn" data-action="open-txn" data-id="' + trx.id + '">' + esc(trx.id) + ' ' + ic('chevron') + '</button>' : esc(r.transactionId)) + '</dd></div></dl></div>' : '') +
      subActionPanel(r) +
      '<div class="sheet-section"><h3>Riwayat status</h3><ol class="timeline">' + r.history.slice().reverse().map(function (h) {
        var hs = SUB_STATUS[h.status];
        return '<li><div class="tl-top">' + badge(hs.cls, hs.label) + '<small>' + fmtDate(h.at) + ' · ' + esc(h.by) + '</small></div>' + (h.note ? '<div class="muted" style="margin-top:2px">' + esc(h.note) + '</div>' : '') + '</li>';
      }).join('') + '</ol></div>';
    openSheet('Detail Pengajuan', body);
  }

  function subActionPanel(r) {
    var c = cfg();
    if (r.status === 'pending') {
      return '<div class="action-panel"><h3>Keputusan Ketua Kelas</h3><p>Menyetujui tidak mengurangi saldo kas. Dana baru keluar saat bendahara mencatat pencairan.' + (can('approve') ? '' : ' <b>Anda tidak punya akses (peran ' + ROLES[ui.role].label + ').</b>') + '</p>' +
        '<div class="form-error" id="sub-err" role="alert"></div>' +
        field('ap-amount', 'Nominal subsidi disetujui (Rp)', moneyInput('ap-amount', r.requestedAmount), '= ' + rp(r.requestedAmount) + ' (maksimal ' + rp(r.requestedAmount) + ')') +
        field('ap-note', 'Catatan keputusan', '<textarea class="input" id="ap-note" rows="2" maxlength="160" placeholder="Wajib diisi jika menolak"></textarea>') +
        '<div class="btn-row"><button type="button" class="btn btn-danger" data-action="sub-reject" data-id="' + r.id + '">' + ic(can('approve') ? 'x' : 'lock') + 'Tolak</button>' +
        '<button type="button" class="btn btn-primary" data-action="sub-approve" data-id="' + r.id + '">' + ic(can('approve') ? 'check' : 'lock') + 'Setujui</button></div></div>';
    }
    if (r.status === 'approved') {
      return '<div class="action-panel"><h3>Verifikasi Bendahara</h3><p>Periksa nota atau bukti kebutuhan, lalu tandai siap dicairkan. Saldo kas belum berubah.' + (can('ready') ? '' : ' <b>Hanya Bendahara.</b>') + '</p>' +
        permBtn('ready', 'btn-primary btn-block', 'sub-ready', 'Tandai Siap Dicairkan', 'check', 'data-id="' + r.id + '"') + '</div>';
    }
    if (r.status === 'ready') {
      return '<div class="action-panel"><h3>Catat Pencairan</h3><p>Saldo kas saat ini <b class="num">' + rp(currentBalance()) + '</b>. Pencairan akan dicatat sebagai pengeluaran di Buku Kas.' + (can('disburse') ? '' : ' <b>Hanya Bendahara.</b>') + '</p>' +
        '<div class="form-error" id="sub-err" role="alert"></div>' +
        field('dp-date', 'Tanggal pencairan', '<input class="input" id="dp-date" type="date" value="' + c.demoToday + '">') +
        field('dp-amount', 'Nominal final (Rp)', moneyInput('dp-amount', r.approvedAmount), '= ' + rp(r.approvedAmount) + ' (maksimal ' + rp(r.approvedAmount) + ')') +
        field('dp-note', 'Keterangan', '<input class="input" id="dp-note" type="text" maxlength="100" placeholder="Misal: diserahkan ke perwakilan kelompok">') +
        permBtn('disburse', 'btn-primary btn-block', 'sub-disburse', 'Catat Pencairan', 'check', 'data-id="' + r.id + '"') + '</div>';
    }
    if (r.status === 'rejected') return '<div class="note note-danger" style="margin-top:20px">' + ic('alert') + '<span>Pengajuan ditolak dan tidak dapat dicairkan.</span></div>';
    if (r.status === 'disbursed') return '<div class="note note-ok" style="margin-top:20px">' + ic('check') + '<span>Sudah dicairkan dan dicatat di Buku Kas. Pengajuan ini tidak dapat dicairkan ulang.</span></div>';
    return '';
  }
  function subError(msg) {
    var e = $('#sub-err'); if (e) e.textContent = msg;
    toast(msg, 'error');
  }
  function addHistory(r, status, by, note) {
    r.status = status;
    r.history.push({ status: status, at: cfg().demoToday, by: by, note: note });
  }
  function leaderName() { var m = memberById(cfg().leaderId); return m ? m.name : 'Ketua Kelas'; }
  function treasurerName() { var m = memberById(cfg().treasurerId); return m ? m.name : 'Bendahara'; }

  function doDecision(id, decision) {
    if (!guard('approve')) return;
    var r = requestById(id); if (!r) return;
    var box = $('.action-panel'); clearErrors(box);
    if (r.status !== 'pending') { subError('Pengajuan ini sudah diputuskan. Muat ulang detail pengajuan.'); return; }
    var note = $('#ap-note').value.trim(), amt = parseMoney($('#ap-amount').value);
    if (decision === 'approved') {
      if (isNaN(amt) || amt <= 0) { showErrors({ 'ap-amount': 'Nominal harus lebih besar dari nol.' }); return; }
      if (amt > r.requestedAmount) { showErrors({ 'ap-amount': 'Nominal disetujui tidak boleh melebihi yang diajukan (' + rp(r.requestedAmount) + ').' }); return; }
    } else if (!note) { showErrors({ 'ap-note': 'Isi alasan penolakan agar kelompok tahu cara memperbaiki pengajuan.' }); return; }
    confirmDialog({
      title: decision === 'approved' ? 'Setujui pengajuan?' : 'Tolak pengajuan?', tone: decision === 'approved' ? 'primary' : 'danger',
      confirmText: decision === 'approved' ? 'Ya, Setujui' : 'Ya, Tolak',
      message: decision === 'approved' ? 'Saldo kas belum berkurang. Bendahara akan memverifikasi lalu mencairkan dana.' : 'Pengajuan yang ditolak tidak dapat dicairkan.',
      details: [['Kelompok', r.groupName], ['Tugas', r.assignment], [decision === 'approved' ? 'Nominal disetujui' : 'Nominal diajukan', rp(decision === 'approved' ? amt : r.requestedAmount)]]
    }).then(function (ok) {
      if (!ok || r.status !== 'pending') return;
      r.approvedBy = leaderName(); r.approvalNote = note;
      if (decision === 'approved') r.approvedAmount = amt;
      addHistory(r, decision, r.approvedBy, note || ('Disetujui ' + rp(amt) + '.'));
      commit(); openSubsidy(r.id);
      toast(decision === 'approved' ? 'Pengajuan disetujui. Saldo kas belum berubah — menunggu pencairan bendahara.' : 'Pengajuan ditolak.', decision === 'approved' ? 'success' : 'warn');
    });
  }
  function doReady(id) {
    if (!guard('ready')) return;
    var r = requestById(id); if (!r || r.status !== 'approved') return;
    confirmDialog({ title: 'Tandai siap dicairkan?', message: 'Pastikan nota atau bukti kebutuhan sudah diperiksa. Saldo kas belum berubah.', confirmText: 'Tandai Siap' }).then(function (ok) {
      if (!ok || r.status !== 'approved') return;
      addHistory(r, 'ready', treasurerName(), 'Dokumen diverifikasi bendahara.');
      commit(); openSubsidy(r.id); toast('Pengajuan siap dicairkan.');
    });
  }
  function doDisburse(id) {
    if (!guard('disburse')) return;
    var r = requestById(id); if (!r) return;
    var box = $('.action-panel'); clearErrors(box);
    if (r.status === 'disbursed' || r.transactionId || db.transactions.some(function (t) { return t.subsidyRequestId === r.id; })) { subError('Pengajuan ini sudah dicairkan dan tidak dapat dicairkan ulang.'); return; }
    if (r.status === 'rejected') { subError('Pengajuan yang ditolak tidak dapat dicairkan.'); return; }
    if (r.status !== 'ready') { subError('Pengajuan harus berstatus "Siap Dicairkan" sebelum dicairkan.'); return; }
    var date = $('#dp-date').value, amt = parseMoney($('#dp-amount').value), note = $('#dp-note').value.trim();
    var errs = {};
    if (!validDate(date)) errs['dp-date'] = 'Isi tanggal pencairan yang valid.';
    else if (date < r.submittedAt) errs['dp-date'] = 'Tanggal pencairan tidak boleh sebelum tanggal pengajuan (' + fmtDate(r.submittedAt) + ').';
    if (isNaN(amt) || amt <= 0) errs['dp-amount'] = 'Nominal harus lebih besar dari nol.';
    else if (amt > r.approvedAmount) errs['dp-amount'] = 'Nominal final tidak boleh melebihi yang disetujui ketua (' + rp(r.approvedAmount) + ').';
    if (Object.keys(errs).length) { showErrors(errs); return; }
    var trial = { id: 'TRX-TRIAL', date: date, type: 'expense', category: CAT_SUBSIDY, description: '', amount: amt };
    var neg = firstNegative(trial);
    if (neg) {
      subError('Pencairan ditolak: saldo kas tidak mencukupi. Saldo saat ini ' + rp(currentBalance()) + ', pencairan ' + rp(amt) + ' membuat saldo menjadi ' + rp(neg.balance) + ' per ' + fmtDate(neg.date) + '. Kurangi nominal atau tunggu iuran masuk.');
      return;
    }
    confirmDialog({
      title: 'Konfirmasi pencairan', confirmText: 'Cairkan Dana',
      message: 'Pencairan akan dicatat sebagai pengeluaran dan mengurangi saldo kas. Tindakan ini tidak dapat diulang.',
      details: [['Kelompok', r.groupName], ['Tanggal', fmtDate(date)], ['Nominal', rp(amt)], ['Saldo setelahnya', rp(currentBalance() - amt)]]
    }).then(function (ok) {
      if (!ok) return;
      // Cek ulang agar satu pencairan tidak tercatat dua kali.
      if (r.status !== 'ready' || r.transactionId || db.transactions.some(function (t) { return t.subsidyRequestId === r.id; })) { subError('Pencairan sudah tercatat sebelumnya.'); return; }
      var txId = nextId('TRX', db.transactions);
      db.transactions.push({
        id: txId, date: date, type: 'expense', category: CAT_SUBSIDY,
        description: 'Subsidi ' + r.groupName + ' — ' + r.assignment + (note ? ' (' + note + ')' : ''),
        amount: amt, memberId: null, paymentId: null, subsidyRequestId: r.id
      });
      r.disbursedAmount = amt; r.disbursedAt = date; r.transactionId = txId;
      addHistory(r, 'disbursed', treasurerName(), 'Dana dicairkan ' + rp(amt) + '.' + (note ? ' ' + note : ''));
      commit(); openSubsidy(r.id);
      toast('Pencairan ' + rp(amt) + ' tercatat di Buku Kas (' + txId + '). Saldo kas diperbarui.');
    });
  }

  function openSubsidyForm() {
    if (!guard('subsidy')) return;
    var c = cfg();
    openSheet('Ajukan Subsidi', '<form id="sub-form" data-form="subsidy" novalidate><div class="form-error" role="alert"></div>' +
      '<div class="note note-info" style="margin-bottom:14px">' + ic('info') + '<span>Bendahara menginput pengajuan atas nama kelompok. Status awal: Menunggu Persetujuan Ketua.</span></div>' +
      field('sf-group', 'Nama kelompok', '<input class="input" id="sf-group" type="text" maxlength="40" placeholder="Misal: Kelompok 6">') +
      field('sf-course', 'Mata kuliah', '<input class="input" id="sf-course" type="text" maxlength="50">') +
      field('sf-assignment', 'Nama tugas', '<input class="input" id="sf-assignment" type="text" maxlength="80">') +
      field('sf-desc', 'Rincian kebutuhan', '<textarea class="input" id="sf-desc" rows="4" placeholder="Satu item per baris, misal:&#10;Cetak poster — Rp70.000"></textarea>') +
      field('sf-total', 'Total biaya tugas (Rp)', moneyInput('sf-total', '')) +
      field('sf-req', 'Subsidi yang diajukan (Rp)', moneyInput('sf-req', '')) +
      field('sf-by', 'Nama pengaju', '<input class="input" id="sf-by" type="text" maxlength="60">') +
      field('sf-date', 'Tanggal pengajuan', '<input class="input" id="sf-date" type="date" value="' + c.demoToday + '">') +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-sheet">Batal</button><button type="submit" class="btn btn-primary">Kirim Pengajuan</button></div></form>');
  }
  function submitSubsidy() {
    if (!guard('subsidy')) return;
    var f = $('#sub-form'); clearErrors(f);
    var v = {
      groupName: $('#sf-group').value.trim(), course: $('#sf-course').value.trim(), assignment: $('#sf-assignment').value.trim(),
      description: $('#sf-desc').value.trim(), totalCost: parseMoney($('#sf-total').value), requested: parseMoney($('#sf-req').value),
      by: $('#sf-by').value.trim(), date: $('#sf-date').value
    };
    var e = {};
    if (!v.groupName) e['sf-group'] = 'Isi nama kelompok.';
    if (!v.course) e['sf-course'] = 'Isi mata kuliah.';
    if (!v.assignment) e['sf-assignment'] = 'Isi nama tugas.';
    if (!v.description) e['sf-desc'] = 'Jelaskan kebutuhan agar ketua dapat menilai pengajuan.';
    if (isNaN(v.totalCost) || v.totalCost <= 0) e['sf-total'] = 'Total biaya harus lebih besar dari nol.';
    if (isNaN(v.requested) || v.requested <= 0) e['sf-req'] = 'Nominal subsidi harus lebih besar dari nol.';
    else if (!e['sf-total'] && v.requested > v.totalCost) e['sf-req'] = 'Subsidi tidak boleh melebihi total biaya tugas (' + rp(v.totalCost) + ').';
    if (!v.by) e['sf-by'] = 'Isi nama pengaju.';
    if (!validDate(v.date)) e['sf-date'] = 'Isi tanggal yang valid.';
    if (Object.keys(e).length) { showErrors(e); return; }
    var id = nextId('SUB', db.subsidyRequests);
    db.subsidyRequests.push({
      id: id, groupName: v.groupName, course: v.course, assignment: v.assignment, description: v.description,
      totalCost: v.totalCost, requestedAmount: v.requested, approvedAmount: null, disbursedAmount: null,
      status: 'pending', submittedAt: v.date, submittedBy: v.by, approvedBy: null, approvalNote: '', disbursedAt: null, transactionId: null,
      history: [{ status: 'pending', at: v.date, by: v.by, note: 'Pengajuan dibuat.' }]
    });
    commit(); closeSheet(); toast('Pengajuan ' + id + ' dibuat dan menunggu persetujuan ketua.');
  }

  /* ---------------------------------------------------------
     HALAMAN: Buku Kas
     --------------------------------------------------------- */
  function ledFiltered() {
    var f = ui.led, q = f.q.trim().toLowerCase();
    return ledger().filter(function (t) {
      return (f.type === 'all' || t.type === f.type) && (f.cat === 'all' || t.category === f.cat) &&
        (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
        (!q || (t.id + ' ' + t.description + ' ' + t.category).toLowerCase().indexOf(q) >= 0);
    }).reverse();
  }
  function ledBodyHtml() {
    var rows = ledFiltered();
    var f = flows(rows);
    var h = '<div class="summary-line"><span><b>' + rows.length + '</b> transaksi</span><span>Masuk <b class="num">' + rp(f.inc) + '</b></span><span>Keluar <b class="num">' + rp(f.out) + '</b></span><span>Saldo kas saat ini <b class="num">' + rp(currentBalance()) + '</b></span></div>';
    if (!rows.length) return h + '<div class="card">' + emptyState('Tidak ada transaksi', 'Tidak ada transaksi yang cocok dengan filter. Coba hapus sebagian filter.', 'book') + '</div>';
    return h + '<div class="card table-card"><table class="table"><thead><tr><th>ID</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th></tr></thead><tbody>' +
      rows.map(function (t) {
        var inc = t.type === 'income';
        return '<tr tabindex="0" data-action="open-txn" data-id="' + t.id + '">' +
          '<td class="c-id num">' + esc(t.id) + '</td><td class="c-date">' + fmtDate(t.date) + '</td>' +
          '<td class="c-type">' + badge(inc ? 'b-success' : 'b-danger', inc ? 'Masuk' : 'Keluar') + '</td><td class="c-cat">' + esc(t.category) + '</td>' +
          '<td class="c-desc"><strong>' + esc(t.description) + '</strong><span class="m-only">' + esc(t.id) + ' · ' + esc(t.category) + '</span></td>' +
          '<td class="c-in r' + (inc ? '' : ' is-empty') + '"><span class="amount in num">' + (inc ? '+' + rp(t.amount) : '') + '</span></td>' +
          '<td class="c-out r' + (inc ? ' is-empty' : '') + '"><span class="amount out num">' + (inc ? '' : '-' + rp(t.amount)) + '</span></td>' +
          '<td class="c-bal r num">' + rp(t.balance) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function pageBukuKas() {
    var f = ui.led;
    var cats = CAT_IN.concat(CAT_OUT);
    return pageHead('Buku Kas', 'Semua pemasukan dan pengeluaran tercatat di sini. Saldo dihitung dari transaksi.', permBtn('txn', 'btn-primary', 'new-txn', 'Tambah Transaksi', 'plus')) +
      '<div class="card filters f4">' +
      '<div class="field"><label for="led-q" class="sr-only">Cari transaksi</label><div class="search">' + ic('search') + '<input class="input" id="led-q" type="search" placeholder="Cari transaksi" data-filter="led.q" value="' + esc(f.q) + '" autocomplete="off"></div></div>' +
      '<div class="field"><label for="led-type">Jenis</label>' + sel('led-type', [['all', 'Semua'], ['income', 'Pemasukan'], ['expense', 'Pengeluaran']], f.type, '', 'data-filter="led.type"') + '</div>' +
      '<div class="field"><label for="led-cat">Kategori</label>' + sel('led-cat', [['all', 'Semua kategori']].concat(cats.map(function (c) { return [c, c]; })), f.cat, '', 'data-filter="led.cat"') + '</div>' +
      '<div class="field"><label for="led-from">Dari tanggal</label><input class="input" id="led-from" type="date" data-filter="led.from" value="' + f.from + '"></div>' +
      '<div class="field"><label for="led-to">Sampai tanggal</label><input class="input" id="led-to" type="date" data-filter="led.to" value="' + f.to + '"></div></div>' +
      '<div style="margin:-6px 0 12px"><button type="button" class="link-btn" data-action="clear-led">Hapus semua filter</button></div>' +
      '<div id="led-body">' + ledBodyHtml() + '</div>';
  }

  function openTxn(id) {
    var t = ledger().filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var inc = t.type === 'income';
    var m = t.memberId ? memberById(t.memberId) : null;
    var r = t.subsidyRequestId ? requestById(t.subsidyRequestId) : null;
    openSheet('Detail Transaksi',
      '<div class="pct-row"><span>' + badge(inc ? 'b-success' : 'b-danger', inc ? 'Pemasukan' : 'Pengeluaran') + '</span><span class="pct-big num amount ' + (inc ? 'in' : 'out') + '">' + (inc ? '+' : '-') + rp(t.amount) + '</span></div>' +
      '<dl class="dl"><div><dt>ID transaksi</dt><dd>' + esc(t.id) + '</dd></div><div><dt>Tanggal</dt><dd>' + fmtDate(t.date) + '</dd></div>' +
      '<div><dt>Kategori</dt><dd>' + esc(t.category) + '</dd></div><div><dt>Keterangan</dt><dd>' + esc(t.description) + '</dd></div>' +
      '<div><dt>Saldo setelah transaksi</dt><dd class="num">' + rp(t.balance) + '</dd></div>' +
      (m ? '<div><dt>Anggota</dt><dd>' + esc(m.name) + '</dd></div>' : '') +
      (t.paymentId ? '<div><dt>ID pembayaran</dt><dd>' + esc(t.paymentId) + '</dd></div>' : '') +
      (r ? '<div><dt>Pengajuan subsidi</dt><dd><button type="button" class="link-btn" data-action="open-sub" data-id="' + r.id + '">' + esc(r.id) + ' — ' + esc(r.groupName) + ' ' + ic('chevron') + '</button></dd></div>' : '') + '</dl>');
  }

  function openTxnForm() {
    if (!guard('txn')) return;
    openSheet('Tambah Transaksi', '<form id="txn-form" data-form="txn" novalidate><div class="form-error" role="alert"></div>' +
      '<div class="field"><span class="label">Jenis transaksi</span><div class="radio-seg" role="radiogroup" aria-label="Jenis transaksi">' +
      '<label><input type="radio" name="tf-type" value="income" checked><span>Pemasukan</span></label><label><input type="radio" name="tf-type" value="expense"><span>Pengeluaran</span></label></div></div>' +
      field('tf-cat', 'Kategori', sel('tf-cat', [['Pemasukan lainnya', 'Pemasukan lainnya']], '', '')) +
      field('tf-date', 'Tanggal', '<input class="input" id="tf-date" type="date" value="' + cfg().demoToday + '">') +
      field('tf-amount', 'Nominal (Rp)', moneyInput('tf-amount', '')) +
      field('tf-desc', 'Keterangan', '<input class="input" id="tf-desc" type="text" maxlength="100" placeholder="Misal: Beli spidol">') +
      '<div class="note note-info" style="margin-bottom:14px">' + ic('info') + '<span>Iuran dicatat lewat menu <b>Pembayaran</b>, dan pencairan subsidi lewat menu <b>Subsidi</b> (butuh persetujuan ketua). Karena itu keduanya tidak tersedia di sini.</span></div>' +
      '<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-sheet">Batal</button><button type="submit" class="btn btn-primary">Lanjutkan</button></div></form>');
    txnFormSync();
  }
  function txnFormSync() {
    var type = ($('input[name=tf-type]:checked') || {}).value || 'income';
    var cats = type === 'income' ? ['Pemasukan lainnya'] : ['Operasional kelas', 'Pengeluaran lainnya'];
    var s = $('#tf-cat'); if (!s) return;
    s.innerHTML = cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    $('#tf-amount-hint').textContent = type === 'expense' ? 'Saldo kas saat ini ' + rp(currentBalance()) + '. Pengeluaran tidak boleh melebihi saldo.' : '';
  }
  function submitTxn() {
    if (!guard('txn')) return;
    var f = $('#txn-form'); clearErrors(f);
    var v = {
      type: $('input[name=tf-type]:checked').value, category: $('#tf-cat').value, date: $('#tf-date').value,
      amount: parseMoney($('#tf-amount').value), desc: $('#tf-desc').value.trim()
    };
    var e = {};
    if (!validDate(v.date)) e['tf-date'] = 'Isi tanggal yang valid.';
    if (isNaN(v.amount) || v.amount <= 0) e['tf-amount'] = 'Nominal harus lebih besar dari nol. Isi dengan angka, misalnya 25000.';
    if (v.desc.length < 3) e['tf-desc'] = 'Isi keterangan singkat (minimal 3 karakter).';
    if (v.category === CAT_SUBSIDY || v.category === 'Iuran mingguan') e['tf-cat'] = 'Kategori ini hanya bisa dicatat lewat menu Pembayaran atau Subsidi.';
    if (!Object.keys(e).length && v.type === 'expense') {
      var neg = firstNegative({ id: 'TRX-TRIAL', date: v.date, type: 'expense', amount: v.amount });
      if (neg) e['tf-amount'] = 'Saldo kas tidak mencukupi. Pengeluaran ini membuat saldo menjadi ' + rp(neg.balance) + ' per ' + fmtDate(neg.date) + '. Kurangi nominal atau ubah tanggal.';
    }
    if (Object.keys(e).length) { showErrors(e); return; }
    confirmDialog({
      title: 'Simpan transaksi ini?', confirmText: 'Simpan', message: 'Transaksi akan langsung masuk ke Buku Kas dan memengaruhi saldo.',
      details: [['Jenis', v.type === 'income' ? 'Pemasukan' : 'Pengeluaran'], ['Kategori', v.category], ['Tanggal', fmtDate(v.date)], ['Nominal', rp(v.amount)], ['Keterangan', v.desc]]
    }).then(function (ok) {
      if (!ok) return;
      var id = nextId('TRX', db.transactions);
      db.transactions.push({ id: id, date: v.date, type: v.type, category: v.category, description: v.desc, amount: v.amount, memberId: null, paymentId: null, subsidyRequestId: null });
      commit(); closeSheet(); toast('Transaksi ' + id + ' tersimpan. Saldo kas sekarang ' + rp(currentBalance()) + '.');
    });
  }

  /* ---------------------------------------------------------
     HALAMAN: Laporan
     --------------------------------------------------------- */
  function reportData() {
    var c = cfg();
    var periods = ui.rep.range === 'all' ? c.periods.map(function (p) { return p.id; }) : [ui.rep.range];
    var from = periods[0] + '-01', to = periods[periods.length - 1] + '-31';
    var led = ledger();
    var before = led.filter(function (t) { return t.date < from; });
    var opening = before.length ? before[before.length - 1].balance : (c.openingBalance || 0);
    var rows = led.filter(function (t) { return t.date >= from && t.date <= to; });
    var f = flows(rows);
    var subsidyPaid = rows.filter(function (t) { return t.type === 'expense' && t.category === CAT_SUBSIDY; }).reduce(function (s, t) { return s + t.amount; }, 0);
    // rekap anggota
    var members = db.members.filter(function (m) { return m.active; }).map(function (m) {
      var paid = 0, target = 0;
      periods.forEach(function (p) { if (includedIn(m, p)) { var s = memberPeriod(m.id, p); paid += Math.min(s.total, s.target); target += s.target; } });
      return { m: m, paid: paid, target: target, status: target && paid >= target ? 'lunas' : paid > 0 ? 'sebagian' : 'belum' };
    }).filter(function (x) { return x.target > 0; });
    var paidAll = members.reduce(function (s, x) { return s + x.paid; }, 0), targetAll = members.reduce(function (s, x) { return s + x.target; }, 0);
    // rekap kategori
    var cats = CAT_IN.concat(CAT_OUT).map(function (name) {
      var list = rows.filter(function (t) { return t.category === name; });
      var ff = flows(list);
      return { name: name, inc: ff.inc, out: ff.out, count: list.length };
    });
    // rekap subsidi per kelompok
    var groups = {};
    db.subsidyRequests.forEach(function (r) {
      var inRange = (r.submittedAt >= from && r.submittedAt <= to);
      var disb = rows.filter(function (t) { return t.subsidyRequestId === r.id; }).reduce(function (s, t) { return s + t.amount; }, 0);
      if (!inRange && !disb) return;
      var g = groups[r.groupName] || (groups[r.groupName] = { name: r.groupName, count: 0, requested: 0, disbursed: 0 });
      if (inRange) { g.count++; g.requested += r.requestedAmount; }
      g.disbursed += disb;
    });
    var label = ui.rep.range === 'all' ? 'Semua periode (' + periodLabel(periods[0]) + ' – ' + periodLabel(periods[periods.length - 1]) + ')' : periodLabel(ui.rep.range);
    return {
      label: label, from: from, to: to, opening: opening, inc: f.inc, out: f.out, subsidyPaid: subsidyPaid, closing: opening + f.inc - f.out,
      rows: rows, members: members, pct: targetAll ? Math.round(paidAll / targetAll * 100) : 0, paidAll: paidAll, targetAll: targetAll,
      cats: cats, groups: Object.keys(groups).map(function (k) { return groups[k]; })
    };
  }
  function repHtml() {
    var d = reportData();
    function m(label, val, cls) { return '<div class="card metric ' + (cls || '') + '"><div class="metric-label">' + label + '</div><div class="metric-value num">' + val + '</div></div>'; }
    return '<div class="print-only"><h2>Laporan Kas ' + esc(cfg().appName) + ' — ' + esc(cfg().className) + '</h2><p>Periode: ' + esc(d.label) + ' · Tanggal simulasi: ' + fmtDate(cfg().demoToday) + ' · DATA SIMULASI</p></div>' +
      '<div class="rep-grid">' + m('Saldo awal', rp(d.opening)) + m('Total pemasukan', rp(d.inc)) + m('Total pengeluaran', rp(d.out)) +
      m('Subsidi dicairkan', rp(d.subsidyPaid)) + m('Saldo akhir', rp(d.closing), 'hero') +
      '<div class="card metric wide"><div class="metric-label">Pembayaran iuran</div><div class="metric-value num">' + d.pct + '%</div><div class="progress" role="progressbar" aria-valuenow="' + d.pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Persentase pembayaran iuran"><i style="width:' + d.pct + '%"></i></div></div></div>' +
      '<p class="eq">Saldo awal ' + rp(d.opening) + ' + pemasukan ' + rp(d.inc) + ' − pengeluaran ' + rp(d.out) + ' = saldo akhir ' + rp(d.closing) + '.</p>' +
      '<div class="grid two-col section">' +
      '<section class="card"><h2 class="card-title" style="margin-bottom:6px">Rekap Pembayaran Anggota</h2><div class="recap">' +
      (d.members.length ? d.members.map(function (x) {
        var st = PAY_STATUS[x.status];
        return '<div class="recap-row"><span class="l"><b>' + esc(x.m.name) + '</b><small>' + esc(x.m.memberNumber) + '</small></span><span class="r"><span class="amount num">' + rp(x.paid) + ' <span class="muted" style="font-weight:500">/ ' + rp(x.target) + '</span></span>' + badge(st.cls, st.label) + '</span></div>';
      }).join('') : emptyState('Belum ada data', 'Tidak ada kewajiban pada periode ini.')) + '</div></section>' +
      '<div class="stack"><section class="card"><h2 class="card-title" style="margin-bottom:6px">Rekap Subsidi per Kelompok</h2><div class="recap">' +
      (d.groups.length ? d.groups.map(function (g) {
        return '<div class="recap-row"><span class="l"><b>' + esc(g.name) + '</b><small>' + g.count + ' pengajuan · diajukan ' + rp(g.requested) + '</small></span><span class="r"><span class="amount num">' + rp(g.disbursed) + '</span><small>dicairkan</small></span></div>';
      }).join('') : emptyState('Belum ada subsidi', 'Tidak ada pengajuan atau pencairan pada periode ini.', 'file')) + '</div></section>' +
      '<section class="card"><h2 class="card-title" style="margin-bottom:6px">Rekap Transaksi per Kategori</h2><div class="recap">' + d.cats.map(function (c) {
        return '<div class="recap-row"><span class="l"><b>' + esc(c.name) + '</b><small>' + c.count + ' transaksi</small></span><span class="r">' +
          (c.inc ? '<span class="amount in num">+' + rp(c.inc) + '</span>' : '') + (c.out ? '<span class="amount out num">-' + rp(c.out) + '</span>' : '') + (!c.inc && !c.out ? '<span class="muted">Rp0</span>' : '') + '</span></div>';
      }).join('') + '</div></section></div></div>' +
      '<section class="card section table-card"><div style="padding:16px 16px 4px"><h2 class="card-title">Daftar Transaksi (' + d.rows.length + ')</h2></div>' + (d.rows.length ?
        '<table class="table"><thead><tr><th>ID</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th></tr></thead><tbody>' +
        d.rows.map(function (t) {
          var inc = t.type === 'income';
          return '<tr style="cursor:default"><td class="c-id num">' + esc(t.id) + '</td><td class="c-date">' + fmtDate(t.date) + '</td><td class="c-type">' + badge(inc ? 'b-success' : 'b-danger', inc ? 'Masuk' : 'Keluar') + '</td><td class="c-cat">' + esc(t.category) + '</td>' +
            '<td class="c-desc"><strong>' + esc(t.description) + '</strong><span class="m-only">' + esc(t.id) + ' · ' + esc(t.category) + '</span></td>' +
            '<td class="c-in r' + (inc ? '' : ' is-empty') + '"><span class="amount in num">' + (inc ? '+' + rp(t.amount) : '') + '</span></td><td class="c-out r' + (inc ? ' is-empty' : '') + '"><span class="amount out num">' + (inc ? '' : '-' + rp(t.amount)) + '</span></td><td class="c-bal r num">' + rp(t.balance) + '</td></tr>';
        }).join('') + '</tbody></table>' : emptyState('Tidak ada transaksi', 'Belum ada transaksi pada periode ini.', 'book')) + '</section>';
  }
  function pageLaporan() {
    var periods = cfg().periods;
    return pageHead('Laporan Keuangan', 'Ringkasan kas yang bisa dibaca di layar kecil, diekspor, atau dicetak.',
      '<button type="button" class="btn btn-secondary" data-action="print">' + ic('printer') + 'Cetak / PDF</button>' + permBtn('export', 'btn-primary', 'export-csv', 'Ekspor CSV', 'download')) +
      '<div class="card filters no-print"><div class="field" style="max-width:380px"><label for="rep-range">Periode / bulan</label>' +
      sel('rep-range', [['all', 'Semua periode']].concat(periods.map(function (p) { return [p.id, p.label]; })), ui.rep.range, '', 'data-filter="rep.range"') + '</div></div>' +
      '<div id="rep-body">' + repHtml() + '</div>';
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    if (!guard('export')) return;
    var d = reportData(), L = [];
    function row(a) { L.push(a.map(csvCell).join(',')); }
    row(['Laporan KasKita (DATA SIMULASI)']); row(['Kelas', cfg().className]); row(['Periode', d.label]); row(['Tanggal simulasi', cfg().demoToday]); L.push('');
    row(['RINGKASAN']); row(['Saldo awal', d.opening]); row(['Total pemasukan', d.inc]); row(['Total pengeluaran', d.out]);
    row(['Subsidi dicairkan', d.subsidyPaid]); row(['Saldo akhir', d.closing]); row(['Persentase pembayaran iuran (%)', d.pct]); L.push('');
    row(['REKAP KATEGORI']); row(['Kategori', 'Jumlah transaksi', 'Masuk', 'Keluar']);
    d.cats.forEach(function (c) { row([c.name, c.count, c.inc, c.out]); }); L.push('');
    row(['REKAP SUBSIDI PER KELOMPOK']); row(['Kelompok', 'Jumlah pengajuan', 'Diajukan', 'Dicairkan']);
    d.groups.forEach(function (g) { row([g.name, g.count, g.requested, g.disbursed]); }); L.push('');
    row(['REKAP PEMBAYARAN ANGGOTA (nomor anggota saja)']); row(['No. Anggota', 'Dibayar', 'Kewajiban', 'Status']);
    d.members.forEach(function (x) { row([x.m.memberNumber, x.paid, x.target, PAY_STATUS[x.status].label]); }); L.push('');
    row(['TRANSAKSI']); row(['ID', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Masuk', 'Keluar', 'Saldo']);
    d.rows.forEach(function (t) { row([t.id, t.date, t.type === 'income' ? 'Pemasukan' : 'Pengeluaran', t.category, t.description, t.type === 'income' ? t.amount : '', t.type === 'expense' ? t.amount : '', t.balance]); });
    var blob = new Blob(['\ufeff' + L.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kaskita-laporan-' + ui.rep.range + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('CSV diekspor: ' + d.rows.length + ' transaksi untuk ' + d.label + '.');
  }

  /* ---------------------------------------------------------
     Profil, role demo, reset
     --------------------------------------------------------- */
  function roleUser() {
    if (ui.role === 'treasurer') return { name: treasurerName(), sub: 'Bendahara' };
    if (ui.role === 'chair') return { name: leaderName(), sub: 'Ketua Kelas' };
    return { name: 'Anggota Kelas', sub: 'Hanya lihat' };
  }
  function roleSegHtml() {
    return Object.keys(ROLES).map(function (k) {
      return '<button type="button" role="radio" aria-checked="' + (ui.role === k) + '" data-action="set-role" data-role="' + k + '">' + ROLES[k].label + '</button>';
    }).join('');
  }
  function openProfile() {
    var u = roleUser();
    openSheet('Profil & Mode Demo',
      '<div class="profile-head"><span class="avatar">' + esc(initials(u.name)) + '</span><div><strong>' + esc(u.name) + '</strong><div class="row-sub">' + esc(u.sub) + ' · ' + esc(cfg().className) + '</div></div></div>' +
      '<div class="sheet-section" style="margin-top:0"><h3>Simulasi peran</h3><div class="seg" role="radiogroup" aria-label="Pilih peran demo" id="profile-seg">' + roleSegHtml() + '</div>' +
      '<ul class="need-list" style="margin-top:12px">' + Object.keys(ROLES).map(function (k) { return '<li><b>' + ROLES[k].label + ':</b> ' + ROLES[k].desc + '</li>'; }).join('') + '</ul></div>' +
      '<div class="note note-warn" style="margin-top:16px">' + ic('alert') + '<span>Kontrol peran ini hanya <b>simulasi tampilan</b>, bukan autentikasi atau keamanan sungguhan. Tanpa server, siapa pun dapat mengganti peran dan data tersimpan di browser ini saja.</span></div>' +
      '<div class="sheet-section"><h3>Data demo</h3><p class="muted" style="margin-bottom:10px">Semua angka adalah data simulasi, bukan uang sungguhan.' + (Store.isPersistent() ? '' : ' LocalStorage tidak tersedia, data hilang saat halaman ditutup.') + '</p>' +
      '<button type="button" class="btn btn-secondary btn-block" data-action="reset-demo">' + ic('reset') + 'Reset Data Demo</button></div>');
  }
  function setRole(role) {
    if (!ROLES[role]) return;
    ui.role = role; Store.saveRole(role);
    renderChrome(); render();
    var seg = $('#profile-seg'); if (seg) seg.innerHTML = roleSegHtml();
    toast('Mode ' + ROLES[role].label + ' aktif (simulasi). ' + ROLES[role].desc, 'success');
    if ($('#sheet-root').firstChild && !seg) closeSheet();
  }
  function resetDemo() {
    confirmDialog({ title: 'Reset data demo?', tone: 'danger', confirmText: 'Reset Data', message: 'Semua pembayaran, transaksi, pengajuan, dan anggota yang Anda tambahkan akan dikembalikan ke data awal.' }).then(function (ok) {
      if (!ok) return;
      db = Store.reset();
      ui.pay = { q: '', period: db.config.activePeriod, status: 'all' }; ui.sub = { q: '', status: 'all' };
      ui.led = { q: '', type: 'all', cat: 'all', from: '', to: '' }; ui.rep = { range: 'all' };
      closeSheet(); renderChrome(); render();
      toast('Data demo dikembalikan ke keadaan awal.');
    });
  }

  /* ---------------------------------------------------------
     Shell, routing, render
     --------------------------------------------------------- */
  var logoSvg = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 17v30" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M42 18 26 32l16 14" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function buildShell() {
    var navLinks = function (cls) {
      return PAGES.map(function (p) {
        return '<a href="#/' + p.id + '" data-nav="' + p.id + '">' + ic(p.icon) + '<span>' + p.label + '</span></a>';
      }).join('');
    };
    $('#app').innerHTML =
      '<div class="app"><aside class="sidebar" aria-label="Navigasi utama"><div class="brand"><span class="brand-mark">' + logoSvg + '</span>KasKita</div>' +
      '<nav aria-label="Menu">' + navLinks() + '</nav><p class="sidebar-note">Prototype dengan data simulasi. Bukan sistem keuangan sungguhan.</p></aside>' +
      '<div class="main-col"><header class="topbar"><div class="brand"><span class="brand-mark">' + logoSvg + '</span>KasKita</div>' +
      '<div class="top-info"><div class="top-meta" id="top-meta"></div><button type="button" class="avatar-btn" data-action="open-profile" aria-label="Buka profil dan mode demo" id="avatar-btn"></button></div></header>' +
      '<div class="role-bar no-print"><div class="role-bar-inner"><div class="role-bar-label">' + ic('info') + '<span><b>Simulasi peran</b> — hanya demo, bukan login sungguhan</span></div>' +
      '<div class="seg" role="radiogroup" aria-label="Pilih peran demo" id="role-seg"></div></div></div>' +
      '<main id="view" tabindex="-1"></main></div>' +
      '<nav class="bottom-nav" aria-label="Navigasi utama">' + navLinks() + '</nav></div>';
  }
  function renderChrome() {
    var u = roleUser();
    $('#top-meta').innerHTML = '<strong>' + esc(cfg().className) + '</strong><span>Periode: ' + esc(periodLabel(cfg().activePeriod)) + '</span>';
    $('#avatar-btn').innerHTML = '<span class="avatar">' + esc(initials(u.name)) + '</span>';
    $('#role-seg').innerHTML = roleSegHtml();
  }
  var renderers = { ringkasan: pageRingkasan, pembayaran: pagePembayaran, subsidi: pageSubsidi, bukukas: pageBukuKas, laporan: pageLaporan };
  function render() {
    var page = PAGES.filter(function (p) { return p.id === ui.page; })[0];
    $('#view').innerHTML = '<div class="view">' + renderers[ui.page]() + '</div>';
    $$('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === ui.page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = page.title + ' · KasKita — ' + cfg().className;
    if (ui.page === 'ringkasan') drawChart(); else if (chart) { chart.destroy(); chart = null; }
  }
  function commit() {
    Store.save(db);
    render();
  }
  function route() {
    var id = (location.hash || '').replace(/^#\/?/, '') || 'ringkasan';
    ui.page = renderers[id] ? id : 'ringkasan';
    closeSheet(); render();
    window.scrollTo(0, 0);
  }
  var updaters = {
    pay: function () { $('#pay-summary').innerHTML = paySummaryHtml(); $('#pay-list').innerHTML = payListHtml(); },
    sub: function () { $('#sub-list').innerHTML = subListHtml(); },
    led: function () { $('#led-body').innerHTML = ledBodyHtml(); },
    rep: function () { $('#rep-body').innerHTML = repHtml(); }
  };

  /* ---------------------------------------------------------
     Event delegation
     --------------------------------------------------------- */
  var actions = {
    'open-profile': openProfile,
    'close-sheet': closeSheet,
    'set-role': function (el) { setRole(el.dataset.role); },
    'reset-demo': resetDemo,
    'goto': function (el) { location.hash = '#/' + el.dataset.page; },
    'open-sub': function (el) { openSubsidy(el.dataset.id); },
    'open-txn': function (el) { openTxn(el.dataset.id); },
    'open-member': function (el) { openMember(el.dataset.id); },
    'new-payment': function (el) { openPaymentForm(el.dataset.member || ''); },
    'new-member': openMemberForm,
    'toggle-member': function (el) { toggleMember(el.dataset.id); },
    'new-txn': openTxnForm,
    'new-subsidy': openSubsidyForm,
    'sub-approve': function (el) { doDecision(el.dataset.id, 'approved'); },
    'sub-reject': function (el) { doDecision(el.dataset.id, 'rejected'); },
    'sub-ready': function (el) { doReady(el.dataset.id); },
    'sub-disburse': function (el) { doDisburse(el.dataset.id); },
    'export-csv': exportCsv,
    'print': function () { window.print(); },
    'clear-led': function () {
      ui.led = { q: '', type: 'all', cat: 'all', from: '', to: '' };
      render(); toast('Filter dihapus.', 'success');
    }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var a = el.dataset.action;
    if (a === 'overlay') { if (e.target === el) closeSheet(); return; }
    if (a === 'confirm-overlay') { if (e.target === el && confirmResolve) confirmResolve(false); return; }
    if (actions[a]) actions[a](el, e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (confirmResolve) { confirmResolve(false); return; }
      if ($('#sheet-root').firstChild) { closeSheet(); return; }
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-action]')) {
      e.preventDefault(); actions[e.target.dataset.action](e.target);
    }
    if (e.key === 'Tab') {
      var layer = $('#confirm-root .dialog') || $('#sheet-root .sheet');
      if (!layer) return;
      var f = $$('button, [href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])', layer).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!layer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === layer)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.filter) {
      var p = el.dataset.filter.split('.');
      ui[p[0]][p[1]] = el.value;
      if (updaters[p[0]]) updaters[p[0]]();
      return;
    }
    if (el.classList && el.classList.contains('invalid')) setErr(el.id, '');
    if (el.hasAttribute && el.hasAttribute('data-money')) {
      if (el.id === 'pf-amount') el.dataset.touched = '1';
      moneyHint(el);
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.closest && el.closest('#pay-form')) payFormSync(el.id === 'pf-amount' ? 'amount' : '');
    if (el.name === 'tf-type') txnFormSync();
    if (el.classList && el.classList.contains('invalid')) setErr(el.id, '');
  });
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]'); if (!form) return;
    e.preventDefault();
    var k = form.dataset.form;
    if (k === 'payment') submitPayment();
    else if (k === 'member') submitMember();
    else if (k === 'subsidy') submitSubsidy();
    else if (k === 'txn') submitTxn();
  });
  // Pastikan field tidak tertutup keyboard virtual.
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el.closest && el.closest('.sheet-body') && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      setTimeout(function () { if (el.scrollIntoView && document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
    }
  });
  window.addEventListener('hashchange', route);

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */
  function init() {
    var root = $('#app'); if (!root) return;
    Boot.progress('Menyiapkan tampilan…');
    buildShell();
    if (!$('#sheet-root')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="sheet-root"></div><div id="confirm-root"></div><div id="toast-root" class="toasts" role="region" aria-live="polite" aria-label="Notifikasi"></div>');
    }
    renderChrome();
    render();                       // halaman pertama siap DULU, supaya tidak ada layar kosong
    Boot.progress('Menampilkan ringkasan kas…');
    route();
    // Pesan/toast baru muncul setelah splash tertutup agar tidak terpotong animasi.
    Boot.ready(function () {
      if (!Store.isPersistent()) toast('LocalStorage tidak tersedia. Data hanya bertahan selama halaman terbuka.', 'warn');
    });
    Boot.done();                    // tutup layar muat: transisi mulus ke aplikasi
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
