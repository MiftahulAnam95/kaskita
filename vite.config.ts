import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs also work when the built site is hosted under /<repo>/ on Pages.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Aplikasi dibuka lewat proxy preview (host seperti 5173-xxxx.e2b.app), bukan
  // localhost. Tanpa ini Vite 7 menolak permintaan dengan HTTP 403 dan halaman
  // tampil kosong.
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
