# 增强版 `.excalidraw` 保存与恢复规格

本规格用于 `codex/design-intent-package` 分支。目标是让一个增强版 `.excalidraw`（原生画稿）同时承担两件事：用户重新打开时恢复原型设计场景，开发模型读取时获得稳定的设计意图。

## 第一版范围

增强版文件只保存设计场景：

- Excalidraw 原生元素、文字、位置、尺寸、层级和绑定箭头。
- 交互关系和组件关联的 Dockyard 专用标记。
- 组件来源、组件定义编号、变体和目标元素编号。
- Dockyard 自己的数据结构版本。

第一版暂不保存项目级视觉约束、组件运行时版本、当前预览交互状态、下拉面板展开状态或鼠标选中状态。

## 数据归属

```text
原生元素的坐标和尺寸      → 画稿元素本身
箭头的起点和终点          → Excalidraw 原生绑定
关系类型和组件信息        → 元素 customData
Dockyard 数据结构版本     → 顶层 dockyard.schemaVersion
组件运行时显示            → 重新加载 overlay
```

组件元素使用 Excalidraw 自动生成的唯一 `id`。界面上如果需要短编号，另存 `displayNumber`，不把显示序号当作身份。

组件关联的身份关系使用稳定的组件定义编号：

```json
{
  "dockyardRole": "component-binding",
  "bindingId": "C1",
  "targetElementId": "excalidraw-element-id",
  "sourceId": "carbon",
  "componentKey": "carbon/date-picker/single"
}
```

`componentKey`（组件定义编号）表示使用哪个组件；它不等同于画板元素编号，也不等同于静态资源编号或 CDN 地址。

## 关系标记

Dockyard 只识别带有专用标记的关系：

- `dockyardRole: "interaction"`：交互箭头。
- `dockyardRole: "component-binding"`：组件关联箭头。
- `dockyardRole: "component-card"`：组件参考卡元素。
- `dockyardRole: "component-preview"`：组件预览区域元素。

虚线、颜色、箭头样式和锁定状态只负责视觉表达或编辑保护，不作为关系识别依据。Dockyard 不扫描普通箭头来猜测关系。

## 保存流程

1. 画板修改先自动更新当前工作区中的场景。
2. 用户选择增强版导出时，保留原生元素和 Dockyard 数据。
3. 用户选择普通版导出时，只输出原生 Excalidraw 数据。
4. 模型交付可以同时生成增强画稿和 `design-intent.json`（设计意图摘要）；摘要由同一次导出生成，避免两份数据不一致。

## 打开流程

```text
读取 .excalidraw
  → 校验 Excalidraw 原生字段
  → 恢复原生画板
  → 读取 dockyard.schemaVersion
  → 扫描 Dockyard 专用 customData
  → 校验关系引用的元素是否存在
  → 根据 componentKey 重新加载运行时预览
  → 用卡片元素的当前坐标和尺寸定位预览
```

如果 Dockyard 数据不完整，仍然打开原型图，并显示关系数据缺失提示；不把普通箭头自动转换成关系，也不阻止用户编辑原型。

## 恢复规则

- 组件卡片位置和尺寸以卡片原生元素为准。
- 组件关联箭头的端点以原生绑定为准。
- 组件运行时预览重新加载，默认回到初始交互状态。
- 资源不可用时保留画板和关系，预览区域显示可识别的失败占位。
- 复制组件卡片会生成新的画板元素编号，但继续引用相同的 `componentKey`。

## 验收标准

- 增强版文件重新打开后，原型元素、文字、箭头、卡片位置和卡片尺寸保持一致。
- 交互箭头和组件关联箭头按专用标记恢复，不误认普通箭头。
- 组件预览能根据来源和 `componentKey` 重新出现，并定位到对应卡片。
- 普通版导出仍能被 Excalidraw 打开，但不携带 Dockyard 关系数据。
- 文件缺少或使用未知 `schemaVersion` 时，原型仍可打开并给出明确提示。
