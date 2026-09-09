import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL("../../", import.meta.url)),
  server: { host: "127.0.0.1", port: 4319, strictPort: true },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./excalidraw.html", import.meta.url)),
    },
  },
});
