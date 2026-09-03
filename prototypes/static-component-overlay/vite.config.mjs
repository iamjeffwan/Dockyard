import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'process.env': '{}' },
  build: {
    lib: { entry: 'prototypes/static-component-overlay/module-entry.tsx', formats: ['es'], fileName: () => 'carbon-static-module.js' },
    outDir: 'prototypes/static-component-overlay/dist',
    emptyOutDir: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
