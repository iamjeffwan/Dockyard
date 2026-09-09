import assert from "node:assert/strict";
import test from "node:test";

import {
  DockyardRole,
  createComponentBindingData,
  createComponentCardData,
  createComponentPreviewData,
  createDesignNodeData,
  createInteractionData,
  createSceneMetadata,
  readDockyardRole,
} from "../.tmp/design-intent-contract/contract.js";
import { createEnhancedScene, createNativeScene, serializeScene } from "../.tmp/design-intent-contract/design-intent/export.js";
import { importScene } from "../.tmp/design-intent-contract/design-intent/import.js";

test("设计关系使用专用标记，普通元素不被误认", () => {
  const node = createDesignNodeData({
    nodeId: "patient-date",
    nodeRole: "component-slot",
    label: "就诊日期",
  });
  const interaction = createInteractionData({
    relationId: "I1",
    sourceElementId: "tab-detail",
    targetElementId: "tab-followup",
    event: "click",
    action: "switch",
  });

  assert.equal(readDockyardRole(node), DockyardRole.designNode);
  assert.equal(readDockyardRole(interaction), DockyardRole.interaction);
  assert.equal(readDockyardRole({ strokeStyle: "dashed", endArrowhead: "arrow" }), null);
});

test("组件关联通过稳定元素编号连接卡片和预览", () => {
  const binding = createComponentBindingData({
    bindingId: "C1",
    targetElementId: "slot-date",
    cardElementId: "card-a1b2",
    previewElementId: "preview-c3d4",
    sourceId: "carbon-react",
    componentKey: "carbon-date-picker",
    variantKey: "single",
  });
  const card = createComponentCardData({
    bindingId: "C1",
    previewElementId: "preview-c3d4",
  });
  const preview = createComponentPreviewData({
    bindingId: "C1",
    cardElementId: "card-a1b2",
  });

  assert.deepEqual(binding, {
    dockyardRole: DockyardRole.componentBinding,
    bindingId: "C1",
    targetElementId: "slot-date",
    cardElementId: "card-a1b2",
    previewElementId: "preview-c3d4",
    sourceId: "carbon-react",
    componentKey: "carbon-date-picker",
    variantKey: "single",
  });
  assert.equal(card.previewElementId, binding.previewElementId);
  assert.equal(preview.cardElementId, binding.cardElementId);
});

test("新建 Dockyard 场景使用第一版数据结构", () => {
  assert.deepEqual(createSceneMetadata(), { schemaVersion: 1 });
});

test("增强版保留关系数据，普通版移除 Dockyard 字段", () => {
  const scene = { type: "excalidraw", version: 2, source: "test", elements: [{ id: "a", customData: { dockyardRole: "interaction", relationId: "I1", userTag: "keep" } }], files: {} };
  const enhanced = createEnhancedScene(scene);
  const native = createNativeScene(scene);
  assert.equal(enhanced.dockyard.schemaVersion, 1);
  assert.equal(enhanced.elements[0].customData.relationId, "I1");
  assert.equal(native.dockyard, undefined);
  assert.equal(native.elements[0].customData.relationId, undefined);
  assert.equal(native.elements[0].customData.userTag, "keep");
  assert.match(serializeScene(enhanced, "enhanced"), /"schemaVersion": 1/);
});

test("导入增强画稿校验组件关联引用并保留版本", () => {
  const result = importScene({ type: "excalidraw", version: 2, source: "test", dockyard: { schemaVersion: 1 }, elements: [{ id: "link", customData: { dockyardRole: "component-binding", targetElementId: "missing", cardElementId: "card", previewElementId: "preview" } }, { id: "card" }, { id: "preview" }] });
  assert.equal(result.isEnhanced, true);
  assert.deepEqual(result.invalidReferences, ["missing"]);
  assert.deepEqual(result.scene.dockyard, { schemaVersion: 1 });
});
