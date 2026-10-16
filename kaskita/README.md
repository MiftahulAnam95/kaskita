# KasKita — Kas Kelas & Subsidi Tugas Kelompok

Prototype mobile-first untuk mengelola uang kas satu kelas (16 mahasiswa) dan alur subsidi tugas kelompok.
Dibuat dengan HTML, CSS, dan JavaScript vanilla. **Tanpa build, tanpa backend, tanpa Node.js.**

> ⚠️ Semua angka adalah **data simulasi** untuk prototype, bukan transaksi atau uang sungguhan.

## Struktur folder

```text
kaskita/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js        # tampilan, perhitungan, alur subsidi, role demo
│   ├── data.js       # data simulasi + konfigurasi kelas/periode
│   └── storage.js    # LocalStorage + versi skema + reset
├── assets/
│   └── favicon.svg
└── README.md
```

Semua path bersifat relatif sehingga aman untuk GitHub Pages (project site).

> Catatan: di repo ini ada juga `index.html` dan `src/kaskita-entry.js` di root. Itu hanya shell Vite yang
> mengemas file yang sama untuk lingkungan build. Proyek KasKita yang berdiri sendiri adalah folder `kaskita/`.

## Menjalankan secara lokal

1. Unduh atau clone folder `kaskita/`.
2. Buka `index.html` langsung di browser (klik dua kali). Tidak perlu server.
3. Opsional: `python3 -m http.server 8080` di dalam folder `kaskita/`, lalu buka `http://localhost:8080`.

Chart.js dimuat lewat CDN. Jika offline atau gagal dimuat, grafik arus kas otomatis diganti grafik batang cadangan.
Ikon memakai path Lucide yang disematkan langsung (inline SVG), jadi tidak bergantung pada CDN.

## Deploy ke GitHub Pages

1. Buat akun GitHub, lalu klik **New repository** (misal `kaskita`, Public).
2. Upload isi folder `kaskita/` (`index.html`, `css/`, `js/`, `assets/`, `README.md`) ke root repository.
   - Dengan git:
     ```bash
     cd kaskita
     git init
     git add .
     git commit -m "KasKita prototype"
     git branch -M main
     git remote add origin https://github.com/<username>/kaskita.git
     git push -u origin main
     ```
3. Di repository buka **Settings → Pages**.
4. Pada **Build and deployment**, pilih **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit. Website tersedia di `https://<username>.github.io/kaskita/`.

## Aturan keuangan di prototype

- Iuran Rp10.000 per minggu per anggota.
- Target Rp40.000 per bulan = **4 pembayaran mingguan** (bukan biaya tambahan). Bulan dengan 5 minggu tetap 4 kewajiban
  (ubah `weeksPerPeriod` di `data.js` hanya bila disengaja).
- Potensi pemasukan: Rp640.000/bulan (16 anggota) dan Rp7.680.000/12 bulan, dengan asumsi semua selalu membayar.
- **Satu sumber saldo:** saldo = saldo awal + pemasukan − pengeluaran dari daftar `transactions`. Tidak ada angka saldo terpisah.
- Pembayaran anggota otomatis membuat satu transaksi pemasukan yang tertaut (tanpa pemasukan ganda).
- Status **Lunas** hanya jika jumlah yang benar-benar dibayar ≥ kewajiban periode.
- Alur subsidi: `Menunggu Persetujuan Ketua → Disetujui Ketua → Siap Dicairkan → Sudah Dicairkan` (atau `Ditolak`).
  Persetujuan tidak mengurangi saldo; saldo berkurang hanya saat pencairan dicatat. Pencairan ditolak jika saldo tidak cukup,
  jika pengajuan ditolak, atau jika sudah pernah dicairkan.
- Transaksi pencairan subsidi tidak bisa ditambah manual dari Buku Kas.
- CSV hanya memuat nomor anggota (ANG-xxx), bukan data pribadi lain.

## Keterbatasan

**LocalStorage**
- Data hanya tersimpan di browser dan perangkat yang dipakai; tidak tersinkron antar perangkat.
- Membersihkan data situs atau memakai mode privat akan menghapus data (tombol **Reset Data Demo** mengembalikan data awal).
- Siapa pun yang memegang perangkat dapat mengubah data lewat DevTools.
- Ada versi skema (`schemaVersion`). Jika versi berubah, data lama otomatis diganti data awal.

**Role demo**
- Pemilih peran (Bendahara, Ketua Kelas, Anggota) hanya **simulasi tampilan**. Bukan autentikasi dan bukan keamanan.
- Untuk penggunaan nyata dibutuhkan backend dengan login terverifikasi dan pencatatan audit di server.

## Checklist pengujian

**Smartphone (lebar 360px)**
- [ ] Tidak ada scroll horizontal di semua halaman; nominal tidak terpotong.
- [ ] Bottom navigation 5 item, tiap target sentuh minimal 44×44px, tidak tertutup gesture bar.
- [ ] Form muncul sebagai bottom sheet; field tidak tertutup keyboard virtual.
- [ ] Buku Kas tampil sebagai daftar kartu, bukan tabel lebar.
- [ ] Grafik tidak meluber; saat offline muncul grafik cadangan.

**Desktop**
- [ ] Sidebar kiri ±240px; konten memiliki lebar maksimum nyaman.
- [ ] Buku Kas tampil sebagai tabel lengkap dengan saldo berjalan.
- [ ] Navigasi keyboard (Tab, Enter, Esc) bekerja; fokus terlihat; dialog bisa ditutup dengan Esc.

**Alur demo (uji dari awal sampai akhir)**
- [ ] Bendahara mencatat pembayaran → saldo, ringkasan, dan laporan langsung berubah.
- [ ] Mencatat minggu yang sama lagi memunculkan peringatan duplikasi.
- [ ] Nominal 0 atau kosong ditolak dengan pesan yang jelas.
- [ ] Bendahara menambah pengeluaran melebihi saldo → ditolak dengan alasan.
- [ ] Ketua menyetujui SUB-001 → saldo **belum** berubah.
- [ ] Bendahara menandai Siap Dicairkan lalu mencatat pencairan → muncul transaksi di Buku Kas, status Sudah Dicairkan, saldo turun.
- [ ] Pengajuan Ditolak dan Sudah Dicairkan tidak bisa dicairkan.
- [ ] Peran Anggota/Ketua mencoba tindakan terlarang → muncul pesan, tidak ada data berubah.
- [ ] Laporan: ganti periode, ekspor CSV sesuai filter, Cetak/PDF rapi.
- [ ] Reset Data Demo mengembalikan data awal.
