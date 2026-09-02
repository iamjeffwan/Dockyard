import assert from "node:assert/strict";
import test from "node:test";

import { classifyWindowOpen } from "../dist-electron/electron/external-navigation.js";

test("只允许官方素材库留在 Electron 窗口中", () => {
  assert.equal(
    classifyWindowOpen(
      "https://libraries.excalidraw.com/?target=dockyard-annotator",
      "http://localhost:5173",
    ),
    "excalidraw-library",
  );
  assert.equal(
    classifyWindowOpen("https://github.com/excalidraw", "http://localhost:5173"),
    "external",
  );
  assert.equal(
    classifyWindowOpen("javascript:alert(1)", "http://localhost:5173"),
    "blocked",
  );
});

test("素材返回地址只识别当前 Dockyard 画板", () => {
  assert.equal(
    classifyWindowOpen(
      "https://dockyard.local/library-return?view=annotator#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Fforms.excalidrawlib",
      "http://localhost:5173",
    ),
    "library-return",
  );
  assert.equal(
    classifyWindowOpen(
      "https://dockyard.local/library-return?view=bar#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Fforms.excalidrawlib",
      "http://localhost:5173",
    ),
    "blocked",
  );
});
