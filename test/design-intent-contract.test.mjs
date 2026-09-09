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
