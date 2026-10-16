/* ==========================================================
   KasKita — data.js
   Data SIMULASI (bukan transaksi nyata) + pembuat data awal.
   Satu-satunya sumber saldo adalah daftar `transactions`.
   ========================================================== */
(function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  var MEMBER_NAMES = [
    'Andi Pratama', 'Budi Santoso', 'Citra Maharani', 'Dinda Putri',
    'Fajar Ramadhan', 'Gita Lestari', 'Hendra Wijaya', 'Intan Permata',
    'Joko Susilo', 'Kirana Dewi', 'Lukman Hakim', 'Maya Anggraini',
    'Naufal Rizky', 'Olivia Handayani', 'Putra Mahendra', 'Qori Salsabila'
  ];

  var PERIODS = [
    { id: '2026-08', label: 'Agustus 2026', weeks: ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'] },
    { id: '2026-09', label: 'September 2026', weeks: ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'] },
    { id: '2026-10', label: 'Oktober 2026', weeks: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'] }
  ];

  // Jumlah minggu yang sudah dibayar tiap anggota (urutan sama dengan MEMBER_NAMES).
  var WEEKS_PAID = {
    '2026-08': [4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4],
    '2026-09': [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 2, 4],
    '2026-10': [4, 4, 4, 4, 4, 3, 2, 4, 4, 4, 0, 4, 1, 4, 3, 4]
  };

  // Pembayaran sebagian (nominal < Rp10.000 pada satu minggu).
  var PARTIAL_AMOUNTS = { '2026-10|M013|1': 5000 };

  var METHODS = ['Tunai', 'Transfer', 'E-wallet'];

  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }

  function addDays(iso, days) {
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1, 2) + '-' + pad(d.getUTCDate(), 2);
  }

  function createInitialData() {
    var config = {
      appName: 'KasKita',
      className: 'Sistem Informasi',
      weeklyFee: 10000,
      weeksPerPeriod: 4,       // 4 kewajiban mingguan per periode bulanan (bukan 5)
      monthsPerYear: 12,
      openingBalance: 0,
      activePeriod: '2026-10',
      demoToday: '2026-10-28',  // tanggal simulasi agar demo konsisten
      leaderId: 'M002',
      treasurerId: 'M004',
      periods: PERIODS.map(function (p) { return { id: p.id, label: p.label }; })
    };

    var members = MEMBER_NAMES.map(function (name, i) {
      return {
        id: 'M' + pad(i + 1, 3),
        name: name,
        memberNumber: 'ANG-' + pad(i + 1, 3),
        active: true,
        startPeriod: '2026-08'
      };
    });

    // ---- Pembayaran anggota (dibangkitkan dari spesifikasi di atas) ----
    var payments = [];
    var groups = {}; // period|week -> { date, amount, count, paymentIds }
    var payCounter = 1;
    PERIODS.forEach(function (period) {
      members.forEach(function (m, idx) {
        var count = WEEKS_PAID[period.id][idx];
        for (var w = 1; w <= count; w++) {
          var key = period.id + '|' + m.id + '|' + w;
          var amount = PARTIAL_AMOUNTS[key] || config.weeklyFee;
          var paidAt = addDays(period.weeks[w - 1], idx % 3);
          var pay = {
            id: 'PAY-' + pad(payCounter++, 3),
            memberId: m.id,
            period: period.id,
            week: w,
            amount: amount,
            paidAt: paidAt,
            method: METHODS[idx % 3],
            note: '',
            transactionId: null
          };
          payments.push(pay);
          var gk = period.id + '|' + w;
          var g = groups[gk] || (groups[gk] = { period: period, week: w, date: paidAt, amount: 0, count: 0, payments: [] });
          if (paidAt > g.date) g.date = paidAt;
          g.amount += amount;
          g.count += 1;
          g.payments.push(pay);
        }
      });
    });

    // ---- Transaksi: iuran per minggu digabung (1 transaksi per minggu per periode) ----
    var txns = [];
    Object.keys(groups).forEach(function (gk) {
      var g = groups[gk];
      txns.push({
        _group: gk,
        date: g.date,
        type: 'income',
        category: 'Iuran mingguan',
        description: 'Iuran minggu ' + g.week + ' ' + g.period.label + ' (' + g.count + ' anggota)',
        amount: g.amount,
        memberId: null,
        paymentId: null,
        subsidyRequestId: null
      });
    });
    txns.push(
      { date: '2026-08-28', type: 'expense', category: 'Operasional kelas', description: 'Spidol, kertas, dan perlengkapan kelas', amount: 45000, memberId: null, paymentId: null, subsidyRequestId: null },
      { date: '2026-09-15', type: 'expense', category: 'Subsidi tugas kelompok', description: 'Subsidi Kelompok 2 — Proyek Dasar Pemrograman', amount: 250000, memberId: null, paymentId: null, subsidyRequestId: 'SUB-002' },
      { date: '2026-09-30', type: 'expense', category: 'Operasional kelas', description: 'Fotokopi materi dosen tamu', amount: 35000, memberId: null, paymentId: null, subsidyRequestId: null },
      { date: '2026-10-03', type: 'income', category: 'Pemasukan lainnya', description: 'Sisa dana kegiatan orientasi', amount: 25000, memberId: null, paymentId: null, subsidyRequestId: null },
      { date: '2026-10-14', type: 'expense', category: 'Pengeluaran lainnya', description: 'Konsumsi rapat kelas', amount: 20000, memberId: null, paymentId: null, subsidyRequestId: null }
    );
    txns.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); // sort stabil

    var groupToTxn = {};
    var subsidyTxn = {};
    txns.forEach(function (t, i) {
      t.id = 'TRX-' + pad(i + 1, 3);
      if (t._group) { groupToTxn[t._group] = t.id; delete t._group; }
      if (t.subsidyRequestId) subsidyTxn[t.subsidyRequestId] = t.id;
    });
    Object.keys(groups).forEach(function (gk) {
      groups[gk].payments.forEach(function (p) { p.transactionId = groupToTxn[gk]; });
    });

    // ---- Pengajuan subsidi ----
    var subsidyRequests = [
      {
        id: 'SUB-001', groupName: 'Kelompok 1', course: 'PTIK', assignment: 'Presentasi PTIK',
        description: 'Cetak handout 16 eksemplar — Rp80.000\nCetak poster A2 — Rp70.000\nKonsumsi presentasi — Rp50.000',
        totalCost: 200000, requestedAmount: 100000, approvedAmount: null, disbursedAmount: null,
        status: 'pending', submittedAt: '2026-10-24', submittedBy: 'Andi Pratama',
        approvedBy: null, approvalNote: '', disbursedAt: null, transactionId: null,
        history: [{ status: 'pending', at: '2026-10-24', by: 'Andi Pratama', note: 'Pengajuan dibuat.' }]
      },
      {
        id: 'SUB-002', groupName: 'Kelompok 2', course: 'Dasar Pemrograman', assignment: 'Proyek Dasar Pemrograman',
        description: 'Sewa hosting & domain — Rp200.000\nPerangkat uji (kabel, adaptor) — Rp150.000\nCetak laporan proyek — Rp100.000',
        totalCost: 450000, requestedAmount: 250000, approvedAmount: 250000, disbursedAmount: 250000,
        status: 'disbursed', submittedAt: '2026-09-08', submittedBy: 'Citra Maharani',
        approvedBy: 'Budi Santoso', approvalNote: 'Disetujui. Simpan nota pembelian.',
        disbursedAt: '2026-09-15', transactionId: subsidyTxn['SUB-002'],
        history: [
          { status: 'pending', at: '2026-09-08', by: 'Citra Maharani', note: 'Pengajuan dibuat.' },
          { status: 'approved', at: '2026-09-10', by: 'Budi Santoso', note: 'Disetujui. Simpan nota pembelian.' },
          { status: 'ready', at: '2026-09-12', by: 'Dinda Putri', note: 'Dokumen diverifikasi bendahara.' },
          { status: 'disbursed', at: '2026-09-15', by: 'Dinda Putri', note: 'Dana dicairkan Rp250.000.' }
        ]
      },
      {
        id: 'SUB-003', groupName: 'Kelompok 3', course: 'Desain Antarmuka', assignment: 'Tugas Desain Presentasi',
        description: 'Template presentasi premium — Rp90.000\nCetak mockup — Rp60.000',
        totalCost: 150000, requestedAmount: 120000, approvedAmount: null, disbursedAmount: null,
        status: 'rejected', submittedAt: '2026-10-08', submittedBy: 'Fajar Ramadhan',
        approvedBy: 'Budi Santoso', approvalNote: 'Template gratis tersedia. Ajukan ulang hanya untuk biaya cetak.',
        disbursedAt: null, transactionId: null,
        history: [
          { status: 'pending', at: '2026-10-08', by: 'Fajar Ramadhan', note: 'Pengajuan dibuat.' },
          { status: 'rejected', at: '2026-10-09', by: 'Budi Santoso', note: 'Template gratis tersedia. Ajukan ulang hanya untuk biaya cetak.' }
        ]
      },
      {
        id: 'SUB-004', groupName: 'Kelompok 4', course: 'Basis Data', assignment: 'Laporan Praktikum Basis Data',
        description: 'Cetak & jilid laporan — Rp140.000\nTinta printer — Rp100.000',
        totalCost: 240000, requestedAmount: 120000, approvedAmount: 100000, disbursedAmount: null,
        status: 'approved', submittedAt: '2026-10-20', submittedBy: 'Gita Lestari',
        approvedBy: 'Budi Santoso', approvalNote: 'Disetujui Rp100.000, sisanya ditanggung kelompok.',
        disbursedAt: null, transactionId: null,
        history: [
          { status: 'pending', at: '2026-10-20', by: 'Gita Lestari', note: 'Pengajuan dibuat.' },
          { status: 'approved', at: '2026-10-22', by: 'Budi Santoso', note: 'Disetujui Rp100.000, sisanya ditanggung kelompok.' }
        ]
      },
      {
        id: 'SUB-005', groupName: 'Kelompok 5', course: 'Jaringan Komputer', assignment: 'Poster Seminar Jaringan',
        description: 'Cetak poster A1 — Rp110.000\nBingkai & penyangga — Rp50.000',
        totalCost: 160000, requestedAmount: 80000, approvedAmount: 80000, disbursedAmount: null,
        status: 'ready', submittedAt: '2026-10-15', submittedBy: 'Hendra Wijaya',
        approvedBy: 'Budi Santoso', approvalNote: 'Disetujui sesuai pengajuan.',
        disbursedAt: null, transactionId: null,
        history: [
          { status: 'pending', at: '2026-10-15', by: 'Hendra Wijaya', note: 'Pengajuan dibuat.' },
          { status: 'approved', at: '2026-10-16', by: 'Budi Santoso', note: 'Disetujui sesuai pengajuan.' },
          { status: 'ready', at: '2026-10-18', by: 'Dinda Putri', note: 'Dokumen diverifikasi bendahara.' }
        ]
      }
    ];

    return {
      schemaVersion: SCHEMA_VERSION,
      config: config,
      members: members,
      payments: payments,
      subsidyRequests: subsidyRequests,
      transactions: txns
    };
  }

  window.KasKitaData = { SCHEMA_VERSION: SCHEMA_VERSION, createInitialData: createInitialData };
})();
