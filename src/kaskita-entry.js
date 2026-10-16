// Shell untuk build Vite. Folder `kaskita/` adalah proyek vanilla yang berdiri sendiri
// (buka kaskita/index.html langsung). File ini hanya mengemas file yang sama
// menjadi satu halaman saat `npm run build`.
//
// Modul dimuat secara dinamis supaya:
//   1. splash dari index.html langsung tampil dan tidak ikut menunggu kegagalan satu file;
//   2. error apa pun bisa ditangkap dan ditampilkan sebagai pesan, bukan layar putih kosong.
import "../kaskita/css/style.css";

// Cadangan bila boot.js gagal dimuat: aplikasi tetap dibersihkan dari splash.
if (!window.KasKitaBoot) {
  window.KasKitaBoot = {
    progress: function () {},
    setProgress: function () {},
    ready: function (fn) { fn(); },
    onChartReady: function (fn) { fn(); },
    done: function () {
      var node = document.getElementById("boot");
      if (node) {
        node.classList.add("is-done");
        window.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 360);
      }
      document.body.classList.add("is-ready");
      document.body.classList.remove("is-booting");
      try { document.dispatchEvent(new Event("kaskita:ready")); } catch (e) { /* diabaikan */ }
    }
  };
}

function reportFailure(err) {
  if (window.console && console.error) console.error("[KasKita] modul aplikasi gagal dimuat", err);
  window.__kaskitaEntryFailed = true;
  var text = document.getElementById("boot-text");
  if (text) text.textContent = "Aplikasi gagal dimuat. Periksa koneksi lalu muat ulang.";
}

Promise.all([
  import("../kaskita/js/boot.js"),
  import("../kaskita/js/data.js"),
  import("../kaskita/js/storage.js")
])
  .then(function () { return import("../kaskita/js/app.js"); })
  .catch(reportFailure);
