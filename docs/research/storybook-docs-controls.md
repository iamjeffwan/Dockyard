# Storybook Docs、Controls 与远程嵌入调研

## 结论

用户截图对应的是 Storybook 的自动文档页（`Docs`，文档页面），不是单纯的组件预览。一个组件的文档页可以同时包含：组件说明、一个或多个实时 Story 展示、参数表，以及可选的源码面板。是否出现这些区块由 `Docs` 模板或组件自己的 `MDX` 文档决定，并不是远程 Storybook 对所有组件都保证完全相同。

对 Dockyard 来说，侧边栏可以借鉴这种布局：上部显示一个独立的 Story 预览，下部显示参数控件和说明；但跨域嵌入时，最可靠的做法是直接嵌入远程 `iframe.html`（纯预览入口），而不是嵌入完整的 `Docs` 页面后尝试拆除标题、工具栏等内容。

## Docs 页面实际包含什么

Storybook 的自动文档由 `@storybook/addon-docs` 生成。官方文档说明，文档可以通过 `MDX` 自定义，并使用多个 Doc Block：

- `Canvas`（画布区）渲染一个指定 Story，并可显示工具栏和源码按钮。
- `Story`（故事预览）渲染 Story 本身；它可以内联到 Docs 页面。
- `Controls`（参数控制表）显示 Story 的 `args`（故事参数），并允许修改参数来更新另一个 `Story` 或 `Canvas` 的渲染结果。
- `Source`（源码区）显示 Story 的代码片段；通常由 `Canvas` 自动提供，也可以单独使用。
- `Description`、`ArgTypes` 等区块显示组件描述和静态属性信息。

因此截图中“展示 + 参数设置”的组合是标准能力，但参数表不是组件 DOM 的一部分，源码也不是组件渲染结果的一部分。Dockyard 需要把它们作为侧边栏的元数据和交互面板处理，而不要把 Docs 页面截图或整体边界当成组件本体。

官方依据：

- [Storybook 自动文档](https://storybook.js.org/docs/writing-docs/autodocs)
- [Doc Blocks 总览](https://storybook.js.org/docs/writing-docs/doc-blocks)
- [`Canvas` Doc Block](https://storybook.js.org/docs/api/doc-blocks/doc-block-canvas)
- [`Controls` Doc Block](https://storybook.js.org/docs/api/doc-blocks/doc-block-controls)
- [`Source` Doc Block](https://storybook.js.org/docs/api/doc-blocks/doc-block-source)

## Controls 参数从哪里来

`Controls` 不是凭空读取任意 DOM 属性，而是读取 Story 的 `args` 和 `argTypes`（参数类型与说明）。Storybook 可以从 React、Vue、Angular 或 Web Components 的组件类型推断部分 `argTypes`，也可以由库作者手动配置：参数名称、描述、默认值、可选项及控件类型。

官方 Controls 文档列出了常见控件：布尔开关、文本框、数字输入、滑块、单选、多选、下拉、颜色选择器、日期选择器和对象编辑器。参数变化后，Storybook 会把新的参数传给 Story，并重新渲染组件。复杂值（例如函数、JSX 或不可序列化对象）不能完整放进 URL，也不一定能在管理界面与预览之间同步；这正是 Dockyard 只保存可序列化状态描述的原因。

官方依据：[Controls 功能文档](https://storybook.js.org/docs/essentials/controls) 和 [`Args` 机制](https://storybook.js.org/docs/writing-stories/args)。

## 远程 URL 与页面层级

官方“嵌入 Story”文档给出了三种相关入口：

1. Manager（管理界面）入口：`/?path=/story/<story-id>`。它包含 Storybook 自己的侧边栏、工具栏和预览区域，不适合当作组件本体。
2. 纯 Story 入口：`/iframe.html?id=<story-id>&viewMode=story`。这是“Open canvas in new tab”（在新标签页打开画布）得到的地址，页面只承担预览 iframe 的渲染职责，适合作为 Dockyard 的远程预览源。
3. Docs 入口：`/iframe.html?id=<story-id>--docs&viewMode=docs`。它会渲染完整文档内容，可能包含标题、说明、Controls、多个 Story 和源码，不是单一组件边界。

官方说明 Storybook 的 Canvas 本身就是独立的预览 iframe；组件的 HTML、CSS、JavaScript 以及依赖资源在该 iframe 中执行。父页面只得到 iframe 这个窗口，不会因为嵌入就自动获得跨域 DOM 访问权。

官方依据：

- [嵌入 Stories](https://storybook.js.org/docs/sharing/embed)
- [Story 渲染与 Preview iframe](https://storybook.js.org/docs/configure/story-rendering)
- [浏览 Stories](https://storybook.js.org/docs/get-started/browse-stories)

## `index.json` 与可发现元数据

Storybook 官方提供 `/index.json` 路由作为 Stories 索引。索引条目至少用于列出 Story 的 `id`、标题、名称、类型、标签等元数据；构建命令 `storybook index` 也能生成该索引。它适合 Dockyard 做组件检索和构造远程 URL，但它不等于组件源码，也不保证包含完整的 Controls 定义或运行时 DOM。

因此建议的读取顺序是：先请求 `/index.json` 找到 Story ID，再拼接 `iframe.html`；侧边栏显示哪些参数，取决于该 Story 是否公开了 `args`/`argTypes`，必要时由来源适配器补充静态元数据。

官方依据：[Indexers 与 `/index.json`](https://storybook.js.org/docs/api/main-config/main-config-indexers)、[`storybook index` 命令](https://storybook.js.org/docs/api/cli-options)。

## 对 Dockyard 侧边栏方案的判断

可行，而且与 Excalidraw 原生 `Sidebar`（侧边栏）布局相符：

- 侧边栏上半部分嵌入纯 Story `iframe.html`，允许用户点击、输入和触发组件状态。
- 侧边栏下半部分显示从 `args`/`argTypes` 整理出的控件；控件变化通过重新加载带 `args` 的 Story URL，或在来源明确支持时使用 `postMessage`（跨页面消息）更新参数。
- 拖入画板时只保存基础 Story 的组件对象和来源信息；侧边栏选择的状态另存为可序列化 JSON，不把打开的下拉菜单、弹窗或 Docs 页面外框计入组件边界。
- 只有来源明确提供协议时，才依赖 `postMessage` 做实时参数同步。官方 Storybook 的通用嵌入协议并不承诺父页面可以读取组件 DOM 或真实边界。

最终需要把“Docs 页面可展示什么”和“Dockyard 要保存什么”分开：Docs 是给人浏览的完整文档，Dockyard 保存的是 `storyId`、基础预览地址、可用参数定义、用户选择的状态和组件在画板中的几何数据。
