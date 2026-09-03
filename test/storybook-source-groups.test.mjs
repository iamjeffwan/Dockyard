import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

async function loadModule() {
  const source = await readFile(
    new URL("../src/excalidraw/storybook-source-groups.ts", import.meta.url),
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

const sources = [
  { id: "carbon", name: "Carbon React" },
  { id: "radix", name: "Radix UI" },
];

const story = (sourceId, id, name) => ({ sourceId, id, name, title: "" });

test("来源目录保持配置顺序，并保留类别层级", async () => {
  const { groupStoriesBySource } = await loadModule();
  const groups = groupStoriesBySource(sources, ["carbon", "radix"], [
    ["Forms/Button", [story("radix", "radix-button", "Default")]],
    ["Inputs/TextInput", [story("carbon", "carbon-input", "Default")]],
    ["Actions/Button", [story("carbon", "carbon-button", "Primary")]],
  ]);

  assert.deepEqual(groups.map((group) => group.sourceId), ["carbon", "radix"]);
  assert.deepEqual(groups[0].categories.map(([title]) => title), ["Actions/Button", "Inputs/TextInput"]);
  assert.equal(groups[0].categories[0][1][0].name, "Primary");
});

test("来源筛选和空搜索结果同时生效", async () => {
  const { groupStoriesBySource } = await loadModule();
  const groups = groupStoriesBySource(sources, ["radix"], [
    ["Actions/Button", [story("carbon", "carbon-button", "Primary")]],
  ]);

  assert.deepEqual(groups, []);
});

test("同名类别在不同来源中不会串库", async () => {
  const { groupStoriesBySource } = await loadModule();
  const groups = groupStoriesBySource(sources, ["carbon", "radix"], [
    ["Actions/Button", [story("carbon", "carbon-button", "Primary"), story("radix", "radix-button", "Default")]],
  ]);

  assert.equal(groups[0].categories[0][1][0].sourceId, "carbon");
  assert.equal(groups[1].categories[0][1][0].sourceId, "radix");
});
