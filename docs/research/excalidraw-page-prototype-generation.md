# Excalidraw 页面原型生成调研

## 结论

`yctimlin/mcp_excalidraw` 值得作为生成基础设施参考，但不应直接决定 Dockyard 的产品流程。它解决的是模型如何可靠地创建、读取、修改、渲染和导出 Excalidraw 元素；Dockyard 仍需自行解决自然语言中的页面信息架构、多方案差异和低保真页面规则。

建议把“页面原型生成”拆成三层：

1. 原型规划层：把用户自然描述整理成页面区域、层级、重复内容及少量明确约束，并生成 3 个结构真正不同的方案。
2. 中间元素层：使用比原生 Excalidraw JSON 更简洁的元素描述，例如稳定标识、类型、位置、尺寸、文字和父区域。
3. 原生渲染层：统一补齐 Excalidraw 字段、文字尺寸、绑定关系并渲染截图，发现裁切或重叠后继续修正。

第一阶段只生成布局原型，不自动推断交互箭头和组件。交互与组件选择由用户在确认布局后补充。

## 仓库提供的关键能力

项目同时提供 MCP、CLI 和 REST 三种接口，最终驱动同一个实时画布。CLI 支持批量创建、组合修改、查询、场景描述、截图、对齐分布、导入导出和快照。来源：[README](https://github.com/yctimlin/mcp_excalidraw)、[SKILL.md](https://github.com/yctimlin/mcp_excalidraw/blob/main/skills/excalidraw-skill/SKILL.md)。

它没有让模型直接拼完整原生 JSON，而是接受简化元素格式：

- 图形上的 `text` 会被转换为绑定文字；
- `startElementId` 和 `endElementId` 会被转换为原生箭头绑定并自动路由；
- 批量创建和组合修改减少中间状态；
- `describe` 给模型返回元素标识、位置、标签和连接；
- `screenshot` 返回真实渲染结果。

来源：[元素格式说明](https://github.com/yctimlin/mcp_excalidraw/blob/main/skills/excalidraw-skill/SKILL.md#element-format-cli-and-mcp)、[工具速查](https://github.com/yctimlin/mcp_excalidraw/blob/main/skills/excalidraw-skill/references/cheatsheet.md)。

它的质量闭环是本次最值得复用的部分：批量创建后必须截图，检查文字截断、元素重叠、箭头穿越、间距和字号，发现问题后先修改再继续。来源：[质量检查](https://github.com/yctimlin/mcp_excalidraw/blob/main/skills/excalidraw-skill/SKILL.md#quality-why-it-matters-and-how-to-check)。

## 适合直接借鉴的规则

- 先规划坐标网格和页面区域，再生成元素。
- 元素使用稳定、可读的标识，不依赖坐标寻找。
- 中文文字宽度至少按字符数估算，并在实际截图中复核。
- 大区域的标题使用独立文字，不绑定到整个背景框的中心。
- 批量生成后进行真实渲染检查。
- 修改已有图稿前先读取场景结构，修改后再次截图。
- 用原生绑定表达用户已经确认的交互关系。
- 保留快照，使生成失败时能恢复。

## 不应直接照搬的部分

- 仓库的主要示例是架构图和流程图，页面原型不是树状节点图，不能使用通用自动布局替代页面构图。
- 彩色角色区分、服务节点尺寸和箭头密集连接不适合低保真 UI 原型。
- Mermaid 适合流程或架构，不适合精确页面布局。
- 第一版页面原型不应自动添加交互连接；自然语言没有明确说明时，自动连接会制造虚假的设计意图。
- 不需要在 Dockyard 内复制一套独立画布服务器。Dockyard 已嵌入 Excalidraw，应复用现有画布、场景持久化和截图能力。

## Dockyard 的建议实现

### 1. 页面原型技能

用户只提供自然描述。技能负责：

- 提取明确的页面区域和层级；
- 标记确定信息与模型假设；
- 默认生成 3 种结构差异明显的布局；
- 不选择组件，不自动生成交互关系；
- 使用黑白低保真样式；
- 为每种方案保留可复制、可编辑的独立区域；
- 生成后必须读取截图并迭代。

### 2. 原型中间格式

建议内部使用简化结构，而不是让模型直接输出完整原生 JSON：

```json
{
  "canvas": { "width": 1600, "height": 1100 },
  "variants": [
    {
      "id": "patient-detail-first",
      "title": "患者详情优先",
      "regions": [
        { "id": "top-nav", "type": "region", "x": 80, "y": 100, "width": 1200, "height": 64 },
        { "id": "patient-list", "type": "region", "x": 80, "y": 164, "width": 280, "height": 600 },
        { "id": "patient-detail", "type": "region", "x": 360, "y": 164, "width": 920, "height": 600 }
      ]
    }
  ]
}
```

程序负责生成 Excalidraw 必需字段、稳定标识、文字元素和图层顺序。这能减少字段错误，同时保留最终原生图稿的可编辑性。

### 3. 质量检查

应同时做结构检查和视觉检查：

- 文件可恢复，元素标识唯一；
- 文字未被裁切；
- 文字位于所属区域；
- 区域不重叠；
- 页面主体周围有编辑空间；
- 三个方案存在结构差异；
- 保存和重新打开后元素保持可编辑。

文字、重叠和空间关系必须通过实际渲染截图检查，单靠 JSON 校验不够。

## 最小实验顺序

1. 用用户的自然描述生成三个简化方案。
2. 转换为一份原生 `.excalidraw` 文件并导入 Dockyard。
3. 自动截图并完成至少一轮修正。
4. 用户选择一个方案并手动调整。
5. 比较生成稿和用户修改稿，补充页面原型技能规则。

先验证“自然描述能否得到可选、可编辑的高质量布局”。交互关联、组件映射和开发交付在这一结果稳定后再加入。
