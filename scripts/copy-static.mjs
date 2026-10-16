import { cp, mkdir } from "node:fs/promises";

// Root index.html loads the original static app from ./kaskita/ so it works
// both directly on GitHub Pages and in Vite. Include that folder in dist too.
await mkdir("dist/kaskita", { recursive: true });
await cp("kaskita", "dist/kaskita", { recursive: true });
console.log("Copied the static KasKita app to dist/kaskita.");
