---
name: page-prototype-generation
description: Generate several editable low-fidelity page layout prototypes from a user's natural-language product description. Use when the user wants to explore page structure or information architecture in Excalidraw before selecting components or specifying interactions.
---

# 页面原型生成

把用户的自然描述直接作为输入。先区分明确关系和必要假设；只有会产生完全不同业务结构的歧义才提问。

## 流程

1. 提取页面目的、区域、层级、共享上下文和同级关系。完成标准：用户明确说出的关系全部得到保留，模型补充内容全部列为假设。
2. 默认设计三个结构明显不同的布局。差异应体现在信息层级、区域比例或主要操作路径，不用颜色和文案变化充数。
3. 生成低保真原型。此阶段表达布局和内容层级；将组件选择、视觉设计和未被用户明确描述的交互留给后续编辑。
4. 输出一个包含全部方案的原生图稿，并为每个方案输出独立图稿。需要生成 `.excalidraw` 文件时，读取 [原生图稿规则](references/excalidraw-output.md)。
5. 在真实画板中分别渲染每个方案并查看截图。修正文字裁切、位置错误、重叠、拥挤、画板控件遮挡和不必要的装饰，直到每个方案均可直接评审。

## 完成标准

- 每个方案能单独复制、修改和删除。
- 所有文字完整显示并处于所属区域。
- 方案保留相同业务关系，但给出有意义的不同布局。
- 原生文件可导入、保存和重新打开。
- 交付材料包含原始自然描述、方案名称、取舍和真实渲染截图。
