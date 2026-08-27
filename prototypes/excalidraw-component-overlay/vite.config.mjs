import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve("prototypes/excalidraw-component-overlay"),
  plugins: [react()],
  server: { port: 6011, strictPort: true },
});
