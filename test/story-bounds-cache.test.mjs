import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../src/overlay/story-bounds-cache.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const cached = {
  id: "button", sourceId: "carbon", storyId: "button--primary", storyUrl: "https://storybook.test/iframe.html?id=button--primary", version: "1",
  boundsSource: "story-dom", boundsCacheKey: "carbon::button--primary::https://storybook.test/iframe.html?id=button--primary::1",
  intrinsicWidth: 96, intrinsicHeight: 40, frameViewportWidth: 800, frameViewportHeight: 600,
};

test("匹配身份的真实边界可复用", async () => {
  const { hasReusableStoryBounds } = await loadModule();
  assert.equal(hasReusableStoryBounds(cached), true);
});

test("身份变化或回退边界不可复用", async () => {
  const { hasReusableStoryBounds } = await loadModule();
  assert.equal(hasReusableStoryBounds({ ...cached, storyId: "button--secondary" }), false);
  assert.equal(hasReusableStoryBounds({ ...cached, boundsSource: "fallback" }), false);
});
