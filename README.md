# KasKita

Prototype manajemen uang kas kelas & subsidi tugas kelompok (**data simulasi**, bukan uang sungguhan).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (HTML + folder aplikasi statis, siap di-hosting)
npm run preview  # menguji hasil build
```

Folder `kaskita/` juga bisa dibuka langsung sebagai halaman statis
(`kaskita/index.html`), tanpa perlu build.

## Deploy ke GitHub Pages

Aplikasi di root sekarang memakai file HTML, CSS, dan JavaScript biasa, jadi
cocok dengan Pages tanpa proses build. Buka **Settings → Pages**, pilih
**Deploy from a branch**, branch `main`, folder `/(root)`, lalu simpan. Root
`index.html` mengambil aset aplikasi dari `kaskita/`; jangan hanya menerbitkan
`dist/index.html` tanpa folder `dist/kaskita/`.

## Alur masuk aplikasi (bebas layar putih)

Aplikasi ini dirender oleh JavaScript, jadi tanpa penanganan khusus akan muncul
layar putih kosong saat pertama kali dibuka. Alurnya sekarang:

1. **Byte pertama:** markah splash + gaya kritisnya ditulis inline di
   `index.html` sehingga langsung terlihat — belum menunggu CSS/JS mana pun.
2. **Memuat aplikasi:** `index.html` mengambil skrip biasa langsung dari
   `kaskita/js/`, agar dapat berjalan pada GitHub Pages tanpa bundler; `boot.js`
   mengelola layar muat dan status aplikasi.
3. **Chart.js (opsional, non-blocking):** pustaka grafik dimuat *setelah* splash
   tertutup; sebelum siap, halaman ringkasan memakai grafik batang cadangan
   murni CSS, lalu digambar ulang otomatis begitu Chart.js tiba. Kalau CDN
   gagal (offline/blokir), aplikasi tetap jalan dengan grafik cadangan.
4. **Siap:** setelah halaman pertama ter-render, splash ditutup dengan fade
   halus (`KasKitaBoot.done()`).

Jaring pengaman: bila file aplikasi gagal dimuat, terjadi error sebelum siap,
atau pemuatan melewati 7 detik, halaman mempertahankan splash dan menampilkan
pesan "Aplikasi gagal dimuat" beserta tombol **Muat ulang** — bukan layar putih
tanpa penjelasan.

Kontrak `window.KasKitaBoot`: `progress(text)`, `setProgress(0..1)`, `done()`,
`ready(fn)`, `onChartReady(fn)`, `isBooted()`.
