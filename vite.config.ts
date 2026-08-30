import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const defaultCanvasBackgroundPicks =
  /(\[(?:[A-Za-z_$][\w$]*\.)?white)\s*,\s*"#f8f9fa"\s*,\s*"#f5faff"\s*,\s*"#fffce8"\s*,\s*"#fdf8f6"\s*\]/;
const sourceCanvasBackgroundPicks =
  /(DEFAULT_CANVAS_BACKGROUND_PICKS\s*=\s*\[\s*COLOR_PALETTE\.white\s*,)[\s\S]*?(\s*\];)/;

function replaceCanvasBackgroundPicks(code: string) {
  const compact = code.replace(
    defaultCanvasBackgroundPicks,
    '$1,"#f2f2f7","#d1d1d6","#3a3a3c","#1c1c1e"]',
  );
  if (compact !== code) return compact;

  return code.replace(
    sourceCanvasBackgroundPicks,
    '$1\n  "#f2f2f7",\n  "#d1d1d6",\n  "#3a3a3c",\n  "#1c1c1e"$2',
  );
}

function excalidrawCanvasBackgroundPicks() {
  return {
    name: 'dockyard-excalidraw-canvas-background-picks',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.includes('@excalidraw') || !code.includes('#f5faff')) return null;

      const updated = replaceCanvasBackgroundPicks(code);

      return updated === code ? null : { code: updated, map: null };
    },
  };
}

function excalidrawCanvasBackgroundPicksForDev() {
  return {
    name: 'dockyard-excalidraw-canvas-background-picks-dev-v2',
    setup(build: {
      onLoad(
        options: { filter: RegExp },
        callback: (args: { path: string }) => Promise<
          | {
              contents: string;
              loader: 'js';
              resolveDir: string;
            }
          | undefined
        >,
      ): void;
    }) {
      build.onLoad(
        {
          filter:
            /[\\/]node_modules[\\/]@excalidraw[\\/]excalidraw[\\/]dist[\\/]dev[\\/].*\.js$/,
        },
        async ({ path }) => {
          const code = await readFile(path, 'utf8');
          const updated = replaceCanvasBackgroundPicks(code);
          if (updated === code) return undefined;
          return { contents: updated, loader: 'js', resolveDir: dirname(path) };
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [excalidrawCanvasBackgroundPicks(), react()],
  base: './',
  build: {
    // Excalidraw's published lazy chunks are pre-bundled at ~1.8 MB;
    // keep the warning focused on entry/regular chunks instead of these
    // intentionally deferred editor resources.
    chunkSizeWarningLimit: 2000,
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [excalidrawCanvasBackgroundPicksForDev()],
    },
  },
  server: { port: 5173, strictPort: true },
});
