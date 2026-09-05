import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWindowOpen,
  isAllowedAppNavigation,
  isAllowedLibraryNavigation,
  isTrustedIpcSender,
} from "../dist-electron/electron/external-navigation.js";

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

test("应用顶层导航只能留在同一个入口文档", () => {
  const appUrl = "http://localhost:5173/app/index.html";
  assert.equal(
    isAllowedAppNavigation(`${appUrl}?view=annotator#selection`, appUrl),
    true,
  );
  assert.equal(
    isAllowedAppNavigation("http://localhost:5173/other.html", appUrl),
    false,
  );
  assert.equal(
    isAllowedAppNavigation("https://localhost:5173/app/index.html", appUrl),
    false,
  );
  assert.equal(
    isAllowedAppNavigation("https://example.com/app/index.html", appUrl),
    false,
  );
  assert.equal(
    isAllowedAppNavigation(
      "file:///C:/Dockyard/dist/index.html?view=bar",
      "file:///C:/Dockyard/dist/index.html",
    ),
    true,
  );
  assert.equal(
    isAllowedAppNavigation(
      "file:///C:/Dockyard/other.html",
      "file:///C:/Dockyard/dist/index.html",
    ),
    false,
  );
});

test("官方素材库窗口不能导航到其他远程来源", () => {
  assert.equal(
    isAllowedLibraryNavigation("https://libraries.excalidraw.com/library"),
    true,
  );
  assert.equal(
    isAllowedLibraryNavigation("https://evil.libraries.excalidraw.com/"),
    false,
  );
  assert.equal(
    isAllowedLibraryNavigation("https://example.com/"),
    false,
  );
});

test("高权限消息只接受受信窗口的应用主帧", () => {
  const appUrl = "http://localhost:5173";
  const trusted = {
    senderUrl: "http://localhost:5173?view=annotator",
    rendererBaseUrl: appUrl,
    isMainFrame: true,
    belongsToPrivilegedWindow: true,
  };
  assert.equal(isTrustedIpcSender(trusted), true);
  assert.equal(isTrustedIpcSender({ ...trusted, isMainFrame: false }), false);
  assert.equal(
    isTrustedIpcSender({ ...trusted, senderUrl: "https://example.com/" }),
    false,
  );
  assert.equal(
    isTrustedIpcSender({ ...trusted, belongsToPrivilegedWindow: false }),
    false,
  );
});
