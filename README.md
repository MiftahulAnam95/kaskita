# KasKita

Prototype manajemen uang kas kelas & subsidi tugas kelompok (**data simulasi**, bukan uang sungguhan).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/index.html (satu file, siap di-hosting statis)
npm run preview  # menguji hasil build
```

Folder `kaskita/` juga bisa dibuka langsung sebagai halaman statis
(`kaskita/index.html`), tanpa perlu build.

## Alur masuk aplikasi (bebas layar putih)

Aplikasi ini dirender oleh JavaScript, jadi tanpa penanganan khusus akan muncul
layar putih kosong saat pertama kali dibuka. Alurnya sekarang:

1. **Byte pertama:** markah splash + gaya kritisnya ditulis inline di
   `index.html` sehingga langsung terlihat — belum menunggu CSS/JS mana pun.
2. **Memuat modul:** `kaskita/js/boot.js` menggerakkan layar muat (pesan, bar
   progres) dan menjadi pengelola status boot.
3. **Chart.js (opsional, non-blocking):** pustaka grafik dimuat *setelah* splash
   tertutup; sebelum siap, halaman ringkasan memakai grafik batang cadangan
   murni CSS, lalu digambar ulang otomatis begitu Chart.js tiba. Kalau CDN
   gagal (offline/blokir), aplikasi tetap jalan dengan grafik cadangan.
4. **Siap:** setelah halaman pertama ter-render, splash ditutup dengan fade
   halus (`KasKitaBoot.done()`).

Jaring pengaman: error tak tertangkap, `unhandledrejection`, dan batas waktu
maksimum 12 detik semuanya menutup splash; bila *bundle* gagal dimuat, halaman
menampilkan pesan "Aplikasi gagal dimuat" beserta tombol **Muat ulang** —
bukan layar putih tanpa penjelasan.

Kontrak `window.KasKitaBoot`: `progress(text)`, `setProgress(0..1)`, `done()`,
`ready(fn)`, `onChartReady(fn)`, `isBooted()`.
