import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

async function loadHostModule() {
  const source = await readFile(
    new URL("../src/excalidraw-library-host.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("素材库返回地址使用官方网页可跳转的安全地址", async () => {
  const { excalidrawLibraryReturnUrl } = await loadHostModule();

  assert.equal(
    excalidrawLibraryReturnUrl(
      "http://localhost:5173/?view=bar#addLibrary=https%3A%2F%2Fexample.test%2Fforms.excalidrawlib",
    ),
    "https://dockyard.local/library-return?view=annotator",
  );
  assert.equal(
    excalidrawLibraryReturnUrl(
      "file:///F:/Dockyard/dist/index.html?view=bar#addLibrary=old",
    ),
    "https://dockyard.local/library-return?view=annotator",
  );
});

test("画板使用稳定窗口名供官方素材库返回", async () => {
  const { EXCALIDRAW_ANNOTATOR_WINDOW_NAME } = await loadHostModule();

  assert.equal(EXCALIDRAW_ANNOTATOR_WINDOW_NAME, "dockyard-annotator");
});
