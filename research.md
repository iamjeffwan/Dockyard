# Dockyard（插件停靠坞）研究记录

## 1. 项目定位

`Dockyard`（插件停靠坞）是一个独立运行的轻量桌面工具条。它固定在屏幕边缘或用户记住的位置，不嵌入也不跟随 `Codex`（编码助手）窗口移动。`Codex`（编码助手）只是它的一个使用方；其他支持 `MCP`（模型上下文协议）的 Agent（智能代理）也可以读取同一份设计上下文。

它的核心价值不是重新做一个完整设计软件，而是把“生图导入、标注、组件检索、修改说明”整理成模型可以准确读取的工作上下文。

## 2. 第一阶段目标

第一阶段只验证两个相互独立、共享画板的模块：

1. 图片标注：导入模型生成的页面图，对局部区域进行框选、箭头、画笔和文字说明。
2. 组件草图检索：在独立的组件草图区域绘制组件，不与普通标注对象混为一类；系统在用户指定的组件库范围内寻找相似组件，展示候选预览图和来源。

两个模块共享一张设计画布，但可以单独使用。组件确认后，可以作为透明图层叠加到原始生图上，并继续用标注工具说明需要调整的地方。图片可通过剪贴板粘贴、拖放或指定目录导入。

## 3. 设计数据模型

原始生图不需要被强行转换为完整的页面结构。它保留为像素图片；可编辑信息单独保存为设计记录：

```text
设计记录
├─ 原始图片
├─ 标注层：坐标、类型、文字、颜色、指向区域
├─ 草图层：组件草图、画布坐标、识别状态
├─ 组件层：候选组件、确认组件、位置、尺寸、状态
├─ 候选层：检索条件、候选预览图、匹配说明
└─ 来源层：组件库、组件名、版本、文档地址、代码地址
```

标注至少需要记录图片坐标和语义说明。例如：

```json
{
  "type": "region",
  "rect": { "x": 420, "y": 120, "width": 260, "height": 96 },
  "comment": "改成日期范围筛选器",
  "status": "requested"
}
```

模型读取时同时得到原图、带标注预览图和这份 `JSON`（结构化数据），比只发送一张涂鸦截图更可靠。草图识别产生的内部查询信息可以保存，但不要求作为用户界面中的独立结果展示。

## 4. 组件检索的真实流程

组件检索不是要求用户手工维护一份组件清单。用户先选择允许搜索的组件库，例如 `shadcn`（组件库）、`Ant Design`（企业级组件库）或其他库，然后输入手绘图。

检索流程：

1. 用户在组件草图区域绘制草图，并选择允许检索的组件库。
2. 视觉模型理解草图的布局、形状和交互语义，形成检索条件。
3. 组件库适配器在选定范围内查找相应组件；模型可以通过检索工具参与候选排序和说明。
4. 系统返回 3～5 个候选卡片：真实预览图、组件名、库名、文档入口和实现方式。
5. 用户选择候选项，并将预览图拖到共享画板。
6. 系统把候选保存为组件图层，用户继续用标注工具说明组件上的修改要求。

组件库的“注册表”只是可选的数据来源：它可以提供组件名称、描述、代码和文档地址。没有注册表时，也可以通过官网文档、示例页面或本地索引检索。候选图优先使用官方示例截图或本地运行组件代码生成的预览；模型临时生成的近似图必须明确标记为“参考图”。

组件检索不是图像生成。视觉模型负责理解草图和检索意图，候选图应优先来自组件库官方示例或实际运行组件后的截图。只有组件库没有可用预览时，才把图像生成作为可选兜底。

## 5. 推荐技术方案

### `Bar`（工具条）

- 第一版采用 `Electron`（桌面应用框架）+ `React`（前端框架）+ `TypeScript`（编程语言）。
- 负责贴边、置顶、收起把手、窗口位置、插件切换、剪贴板和本地文件访问。
- 选择它是为了快速完成透明窗口、拖放、截图和本地服务联动；后续若长期资源占用确实成为问题，再评估迁移到 `Tauri`（桌面应用框架）。

工具条不依赖 `Codex`（编码助手）启动。它可以独立工作，并通过本地服务接入一个或多个模型提供商。

### 标注模块

- 图片作为底图显示。
- 标注层第一版采用 `SVG`（矢量图），框、箭头、文字和手绘线条都可以单独选择和修改。
- 导出三份内容：原图、带标注预览图、设计记录 `JSON`（结构化数据）。

### 组件检索模块

- 本地前端负责绘制组件草图、选择组件库、展示候选卡片和拖放图层；草图识别与普通标注使用不同的交互入口。
- 本地 `Node.js`（运行环境）服务负责请求编排、缓存、候选结果整理和图片保存。
- 视觉模型负责理解草图和检索意图；组件库适配器负责访问具体库的文档、注册表、本地索引或可运行组件。
- 预览图优先由官方示例或隔离渲染环境生成，保存预览图与来源信息，避免把模型近似图误认为真实组件。
- 组件候选与原图解耦：候选确认后才生成组件覆盖层，不修改原始生图。

组件检索不直接采用现成的桌面覆盖标注项目作为产品基座。`MarkerOn`（桌面覆盖标注）和 `DrawPen`（桌面绘图工具）主要用于在屏幕上绘制，可以借鉴透明窗口、点击穿透、全局快捷键和工具条交互；`KoBar`（桌面工具条项目）功能范围较大，不整体引入。Dockyard 自己实现轻量的 `Electron`（桌面应用框架）+ `React`（前端框架）外壳，图片画布优先评估 `Fabric.js`（画布编辑库）或 `react-konva`（React 画布库），图片语义标注再评估 `Annotorious`（图片标注库）。

### 模型提供商

模型调用抽象成统一的提供商接口，第一版保留两条路径：

- `API`（接口）提供商：本地 `Node.js`（运行环境）服务直接发送图片和检索条件，接收模型结果；适合自动化和稳定保存结果。
- `Codex CLI`（命令行编码助手）提供商：独立启动 `Codex CLI`（命令行编码助手）进程，附加草图和提示；适合复用 `Codex`（编码助手）内置能力和额度。

两条路径都只负责视觉理解、检索编排和候选排序，不负责伪造组件示例。组件库适配器仍由 Dockyard（插件停靠坞）本地控制。第三方反向代理只有在兼容 `OpenAI API`（接口协议）且支持图片输入时才纳入支持范围。

### `MCP`（模型上下文协议）服务

提供小而稳定的工具，而不是把全部界面逻辑放进 `MCP`（模型上下文协议）：

- `get_design_state`（读取当前设计记录）
- `get_annotated_preview`（读取带标注预览）
- `list_component_matches`（读取组件候选）
- `get_confirmed_components`（读取已确认组件及来源）
- `search_component_library`（按草图意图和库范围检索组件）
- `update_design_notes`（更新模型生成的修改记录）

标注、拖拽、绘图和候选卡片交互都在本地完成，避免每次鼠标操作都经过 `MCP`（模型上下文协议）。

## 6. 代码仓库规划

当前先使用一个仓库，等两个模块的共同接口稳定后再拆分：

```text
Dockyard/
├─ apps/bar/                  工具条桌面程序
├─ modules/annotator/         图片标注模块
├─ modules/component-search/  组件检索模块
├─ packages/design-schema/    共享设计记录格式
├─ packages/core/             状态管理与模块接口
├─ packages/mcp-server/       MCP 服务
├─ registry/plugins.json       模块清单
├─ research.md                研究与决策记录
└─ README.md                  使用和开发说明
```

每个模块都实现统一的模块接口，例如：

```ts
activate(context)
getPanel()
getMcpTools()
deactivate()
```

后续新增插件只需要提供自己的界面入口、状态读写能力和 `MCP`（模型上下文协议）工具声明。开发阶段保持单仓库，使用统一版本和统一构建；生态稳定后，再允许模块独立仓库，通过插件清单声明版本和兼容的 `Dockyard`（插件停靠坞）版本。

## 7. 已确认的边界

- `Dockyard`（插件停靠坞）是独立贴边窗口，不是 `Codex`（编码助手）主窗口内部的原生侧栏。
- 不依赖电脑控制读取 `Codex`（编码助手）屏幕。
- 不要求 `Codex`（编码助手）或 `Codex CLI`（命令行编码助手）保持启动；二者只是可选的模型接入方式。
- 不要求把整张生图转换成可编辑页面结构。
- 不把组件检索误作图像生成；候选图优先来自真实组件示例或实际渲染。
- 不把所有交互都放到 `MCP`（模型上下文协议）中。
- 不承诺自动把文件塞入当前对话附件栏；可靠方式是让当前对话通过 `MCP`（模型上下文协议）读取设计状态。

## 8. 下一步验证顺序

1. 建立最小 `Electron`（桌面应用框架）窗口：贴边、置顶、收起和恢复。
2. 完成图片粘贴、导入、框选、文字标注和 `JSON`（结构化数据）保存。
3. 加入独立的组件草图画板和一个组件库适配器。
4. 验证视觉模型理解草图、调用检索工具并返回真实候选预览图。
5. 实现候选组件拖回共享画板、透明图层叠加和继续标注。
6. 加入 `MCP`（模型上下文协议）读取工具，让 `Codex`（编码助手）能读取设计记录。
7. 对比 `API`（接口）和 `Codex CLI`（命令行编码助手）两种模型提供商，再抽象通用插件装载接口。

## 9. 图片与组件的本地存储

设计会话由一份设计记录和一组本地素材组成。画布记录保存结构和引用，不把所有图片二进制直接塞进 `JSON`（结构化数据）。第一版可以使用应用数据目录中的文件夹和 `JSON`（结构化数据），不必一开始引入数据库：

```text
设计会话/
├─ design.json              画布状态、标注、组件实例和来源
├─ assets/
│  ├─ source/               用户粘贴或导入的原始图片
│  ├─ previews/             带标注预览和候选预览
│  └─ components/           已确认组件的本地预览图
└─ cache/
   └─ candidates/           尚未确认的候选组件缓存
```

- 剪贴板或拖放得到的原始图片保存到 `source/`（原始素材），设计记录只保存图片引用和尺寸信息。
- 候选组件保存到 `cache/`（临时缓存），包括预览图、组件名称、组件库、匹配说明和来源地址；未确认的候选可以清理。
- 用户确认的组件预览复制到 `components/`（已确认素材），并在设计记录中保存画布位置、尺寸、状态和来源。这样候选缓存清理后，已有设计仍能正常打开。
- 第一版不复制整个组件源码，只保存组件库、组件名、版本、文档地址和代码地址。需要离线渲染时，再按需缓存代码或运行产物。
- 素材文件名使用内容哈希（内容指纹），例如 `SHA-256`（一种内容指纹算法），避免同一图片重复保存，也便于发现素材是否被替换。
- 后续设计数量增加后，再将素材索引和设计记录迁移到 `SQLite`（本地数据库）；文件仍作为图片和预览的实际存储。

## 10. 自研边界

Dockyard 自己实现桌面窗口、共享画布、设计记录和组件图层。开源项目只作为局部实现参考，不作为整体产品基座：

- 桌面覆盖类项目主要参考窗口透明、穿透和快捷键，不直接复用其屏幕坐标模型。
- 画布库主要提供图形对象、选择、拖拽、缩放和导出能力；标注数据格式、组件图层和 `MCP`（模型上下文协议）工具由 Dockyard 自己定义。
- 候选组件的检索可以由模型访问指定的官方文档和示例网站完成；是否使用脚本强制域名限制属于后续可靠性增强，不是第一版的前置条件。

## 11. 本轮官方资料核查（2026-08-21）

本节只记录官方文档或项目源代码中可以直接验证的能力，作为新版产品形态和开发计划的依据。

### 11.1 `Excalidraw`（手绘画布）嵌入与场景文件

- `@excalidraw/excalidraw`（Excalidraw 的 React 组件包）可以直接作为 React 组件嵌入；官方示例要求引入组件样式，并给父容器明确高度，否则画布不可见。[官方集成文档](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/integration)
- `initialData`（初始场景）可用于打开已有场景；`onChange`（变更回调）会返回元素数组、应用状态和图片文件数据，适合在 Dockyard 主进程保存场景快照；`onPaste`（粘贴回调）和 `onLibraryChange`（图形库变更回调）可接入图片导入和全局组件库。[官方属性文档](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/props/)
- Excalidraw 元素允许使用可选的 `customData`（自定义数据）对象。Dockyard 可以在不修改 Excalidraw 元素基础结构的情况下记录 `layer`（图层类型）、`artworkId`（图稿编号）、`componentId`（组件编号）和来源信息。[官方属性文档的自定义数据章节](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/props/#storing-custom-data-on-excalidraw-elements)
- 官方 JSON 格式包含 `type`、`version`、`source`、`elements`、`appState` 和 `files`；其中 `elements` 是场景对象，`appState` 是画布状态，`files` 保存图片元素数据。[官方 JSON Schema](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/json-schema.mdx)
- 官方项目 README 列出矩形、圆形、菱形、箭头、直线、自由画笔、橡皮、撤销/重做、缩放/平移、图片、PNG/SVG/剪贴板导出等能力，并说明编辑器以 MIT（开源许可证）发布。[官方仓库 README](https://github.com/excalidraw/excalidraw)

由此确定：每张图稿保存一份 `scene.excalidraw.json`（Excalidraw 场景文件），其内容负责可编辑画布；`design.json`（Dockyard 设计记录）负责图稿、原图、标注、组件实例、组件来源、目标项目和导出文件的索引。原图锁定、候选预览不可拆解、组件草图确认后删除，属于 Dockyard 的产品策略，不能依赖 Excalidraw JSON 自动提供。

### 11.2 `Codex`（编码助手）、`Codex CLI`（命令行编码助手）与桌面交接

- 官方帮助中心将 Codex CLI 定义为本地运行的编码代理，可以读取、修改和运行本机代码；同时支持文字、截图和图表等多模态输入。[Codex CLI 入门](https://help.openai.com/en/articles/11096431)
- 官方 Codex SDK（软件开发工具包）类型定义包含 `LocalImageInput`（本地图片路径输入）、`ImageInput`（图片数据地址输入）、`workingDirectory`（工作目录）和附加目录参数，证明“把当前图稿图片和上下文包放在代码项目目录，再让 Codex 读取”是可行的集成方向。[官方 Python SDK 输入类型](https://github.com/openai/codex/blob/main/sdk/python/docs/api-reference.md)、[官方 TypeScript 执行参数](https://github.com/openai/codex/blob/main/sdk/typescript/src/exec.ts)
- 新版 ChatGPT 桌面端把 Chat、Work 和 Codex 作为不同入口；官方说明 Codex 可以使用本地文件、代码仓库、终端和开发工具，Work 则在用户授权后读取本地文件夹或项目。[桌面端说明](https://help.openai.com/en/articles/20001276/)、[ChatGPT Work 与 Codex](https://help.openai.com/en/articles/20001275/)
- 官方文档没有提供“Dockyard 把附件和提示词注入任意已有 ChatGPT/Codex 对话输入框”的公共桌面接口。因此第一版采用显式交接：用户为当前图稿选择目标代码项目，Dockyard 写入上下文包、复制可编辑提示词并打开项目目录；用户在 Codex 中自行读取该目录。这个交接方式也不要求控制或读取 ChatGPT 窗口。[ChatGPT Windows 文件上传与 Companion Window](https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app)

### 11.3 `Electron`（桌面框架）窗口、进程通信和本地存储

- `BrowserWindow`（浏览器窗口）支持无边框 `frame: false`、透明 `transparent: true`、置顶 `setAlwaysOnTop`、位置读取/设置 `getPosition`/`setPosition`；官方说明 Windows 上透明窗口需要同时使用无边框模式。[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)
- 无边框窗口的可拖动区域由 CSS 的 `-webkit-app-region: drag` 定义，按钮等交互区域应标记为 `no-drag`。[窗口自定义教程](https://www.electronjs.org/docs/latest/tutorial/window-customization)
- 渲染进程之间没有直接 IPC（进程间通信）通道，应让主进程作为消息中介；启用 `contextIsolation`（上下文隔离）并通过 `contextBridge`（上下文桥）暴露最小化的安全 API，不应把完整 `ipcRenderer` 对象暴露给页面。[IPC 教程](https://www.electronjs.org/docs/latest/tutorial/ipc)、[contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)
- 应用数据应放在 `app.getPath('userData')`（应用数据目录）的专用子目录；官方不建议直接把大文件写到 `userData` 根目录。目录选择可以使用原生 `dialog.showOpenDialog`（打开对话框）的 `openDirectory` 属性。[app API](https://www.electronjs.org/docs/latest/api/app)、[dialog API](https://www.electronjs.org/docs/latest/api/dialog)

由此确定：工具条窗口和中央工作页窗口由主进程分别管理，位置和置顶状态单独保存；窗口间设计状态通过主进程转发，不在渲染进程之间直接共享 Node/Electron 能力。

### 11.4 `MCP`（模型上下文协议）的定位

- MCP 采用 Host（宿主）—Client（客户端）—Server（服务器）架构；服务器可以提供 Resources（资源）、Prompts（提示模板）和 Tools（工具）。[官方架构规范](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
- Resources 由应用控制如何附加到模型上下文，支持文本和二进制内容；规范明确允许界面让用户显式选择资源，不要求模型自动读取全部数据。[官方 Resources 规范](https://modelcontextprotocol.io/specification/2025-03-26/server/resources)
- 因此 MCP 不替代“生成上下文包并交给 Codex CLI”的第一版主流程。Dockyard 后续可以提供按图稿编号读取 `design.json`、场景文件、原图和预览图的 Resources，以及需要用户确认的更新 Tools；是否被当前模型使用由宿主应用决定。

## 12. 对第一版开发计划的直接约束

1. 画布引擎改为嵌入 `Excalidraw`，保留其原生工具栏；Dockyard 只增加图稿切换、组件草图检索、候选拖入、发送开发上下文等外层操作。
2. “组件草图”是临时查询输入：检索失败时仅在当前页面保留，关闭检索面板即丢弃；候选被拖入画布后删除对应草图。临时草图不能污染长期保存的 `scene.excalidraw.json`。
3. 候选组件以独立图片元素叠加到当前场景中央，允许移动、缩放和删除；`customData` 记录候选编号、来源、版本和“真实预览/参考图”标记，不拆解成可编辑组件结构。
4. “发送给开发助手”只针对当前图稿：原图、带标注预览、当前场景、`design.json` 图稿片段、已确认组件来源和可编辑提示词写入用户选择的目标代码项目隐藏目录，并保留历史版本与最新版本。
5. 第一版不自动注入 ChatGPT/Codex 对话、不依赖 MCP；MCP 服务作为后续显式读取/更新入口实现。
