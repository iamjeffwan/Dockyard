# Excalidraw 画板内组件检索可行性调研

> 状态：探索中。本文只依据 Excalidraw 官方开发文档和官方源码，不改变 Dockyard 业务代码。
>
> 调研时间：2026-08-26

## 结论先说

Excalidraw 的集成自由度足以承载“画板内组件检索”，但更适合采用“宿主应用自定义检索面板 + Excalidraw 官方库 API”的方式，而不是修改 Excalidraw 内部的素材库源码。

推荐的第一版形态是：在画板旁边或侧边栏增加 Dockyard 的组件检索面板；检索结果以 Excalidraw `LibraryItem`（素材项）写入素材库，用户随后像使用普通素材一样拖入画板。这样可以复用官方素材库的插入、预览、分组和持久化语义，同时保留组件来源、版本和代码标识等 Dockyard 元数据。

## 官方提供的扩展点

### 1. 素材库数据和导入 API

官方 `ExcalidrawAPI`（画板程序接口）提供 `updateLibrary`（更新素材库）、`getLibraryItems`（读取素材库）、`resetLibrary`（清空素材库）等能力。`updateLibrary` 可以接收 `LibraryItems`（素材项数组）或 `Blob`（素材文件），并支持合并已有素材、确认提示、导入后打开素材库等选项。官方工具文档还提供 `loadLibraryFromBlob`、`loadSceneOrLibraryFromBlob`、`mergeLibraryItems` 和 `parseLibraryTokensFromUrl` 等函数。

依据：[官方工具 API 文档](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/%40excalidraw/excalidraw/api/utils/utils-intro.md)、[官方 `library.ts` 源码](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/library.ts)

### 2. `useHandleLibrary`（素材导入和持久化钩子）

官方 `useHandleLibrary`（素材处理钩子）会监听地址中的 `#addLibrary`（素材导入参数），下载并解析素材，再调用 `excalidrawAPI.updateLibrary`（更新素材库）。它也支持 `adapter`（持久化适配器）：宿主实现 `load`（读取）和 `save`（保存），钩子负责初始化、增量合并、并发队列和保存失败提示。

官方源码已经把旧的 `getInitialLibraryItems`（初始素材读取函数）标记为不推荐，建议使用 `adapter`。这说明 Dockyard 应把工作区存储接在适配器上，而不是只依赖 `initialData.libraryItems`（初始素材数据）。

依据：[官方 `useHandleLibrary` 文档](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/%40excalidraw/excalidraw/api/utils/utils-intro.md)、[官方 `library.ts` 源码](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/excalidraw/data/library.ts)、[官方变更记录](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/CHANGELOG.md)

### 3. `onLibraryChange`（素材变化回调）

`onLibraryChange`（素材变化回调）在素材新增、编辑或清空后收到完整素材数组，官方文档明确建议宿主用它进行本地存储或其他持久化。素材项本身由 Excalidraw 元素组成，因此可以把组件的视觉快照转成可编辑的矢量元素，而不是只放一张不可编辑的图片。

依据：[官方属性文档](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props#onlibrarychange)、[官方类型定义](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/types.ts)

### 4. UI（界面）自定义和侧边栏

官方支持把 `MainMenu`（主菜单）、`Sidebar`（侧边栏）、`Footer`（底部区域）、`WelcomeScreen`（欢迎页）和协作触发器作为 `<Excalidraw />`（画板组件）的子组件。侧边栏可以承载 Dockyard 的检索视图，并通过 Excalidraw API 把选中的组件写入素材库或直接写入场景。

不过官方文档也明确说明，UI 组件 API 仍在迁移中，工具栏和元素属性面板等部分暂不支持完整自定义。因此不建议把组件检索硬塞进官方素材库内部的现有 DOM（文档对象模型）结构，也不建议依赖内部 CSS 类名。

依据：[官方 `<Excalidraw />` 子组件文档](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components)、[官方 Sidebar 文档](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components/sidebar)、[官方属性文档](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)

### 5. 自定义宿主界面

`renderTopRightUI`（右上角自定义界面）等渲染属性可以放置一个“组件检索”入口；检索面板本身由 Dockyard 管理。官方的 `ui`（默认界面开关）和 `UIOptions`（界面选项）可以隐藏或保留部分默认控件，但不能把官方素材库的内部搜索改造成完整的组件目录系统。

依据：[官方属性文档](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)、[官方类型定义](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/types.ts)

## 组件检索应怎样接入

建议把功能拆成两层：

```text
Dockyard 组件目录/检索
        │ 选中候选
        ├── 写入 LibraryItem（素材项）→ 官方素材库 → 拖入画板
        └── 直接生成 Excalidraw 元素 → 当前场景
```

### 推荐默认路径：检索结果进入素材库

1. Dockyard 在自定义 `Sidebar`（侧边栏）中显示组件搜索、过滤、来源和版本。
2. 用户点击“加入素材库”时，把候选组件转换为一个或多个 `LibraryItem`（素材项）。
3. 调用 `excalidrawAPI.updateLibrary({ libraryItems, merge: true, openLibraryMenu: true })`（合并素材并打开素材库）。
4. 用户从官方素材库拖入或点击素材，保持 Excalidraw 原有交互。
5. 通过 `onLibraryChange`（素材变化回调）或 `useHandleLibrary` 的 `adapter`（持久化适配器）保存。

这种方式最适合“组件检索结果可以反复复用”的场景，且不需要复制 Excalidraw 的拖放、缩略图和素材状态逻辑。

### 直接放入画板的路径

对于“一次性插入”或需要在插入时带位置、绑定关系、项目标识的组件，可以使用 `excalidrawAPI.updateScene`（更新场景）或官方创建元素工具直接写入当前场景。此路径不应替代素材库：它适合一次性实例，不适合组件收藏和重复使用。

## 组件元数据怎样保存

官方允许在 Excalidraw 元素的 `customData`（自定义数据）中保存宿主数据。Dockyard 可以在素材项的元素上保存轻量标识，例如：

```ts
customData: {
  source: "shadcn",
  componentId: "button",
  version: "...",
  assetId: "...",
}
```

但不要把完整源码、依赖树或大型目录写进每个画板元素。画板只保存稳定的组件标识和资源版本；完整目录、视觉资源和源码详情仍应由 Dockyard 的应用级资源库管理。

依据：[官方属性文档中的 `customData` 说明](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props#storing-custom-data-on-excalidraw-elements)

## 限制和风险

1. **官方素材库不是组件检索系统。** 它主要负责素材的展示、选择、插入和发布；名称、分类、代码版本、依赖和跨组件库搜索需要由 Dockyard 维护。
2. **内部 UI 不是稳定扩展面。** 官方文档明确说部分 UI 仍未开放自定义，因此不应修改或依赖内部 `LibraryMenu`（素材库菜单）实现。
3. **素材项必须是可渲染的 Excalidraw 元素。** 代码组件不能直接作为素材项；需要预先生成可编辑元素、矢量快照，或明确使用图片作为不可编辑预览。
4. **版本差异需要锁定。** `useHandleLibrary` 的 `adapter` 是近期推荐接口，项目应锁定实际使用的 `@excalidraw/excalidraw`（绘图库）版本，并用适配层隔离升级差异。
5. **导入 URL（地址）有安全校验。** 官方 `useHandleLibrary` 默认只允许 Excalidraw 官方域名和官方素材仓库路径；如果 Dockyard 支持自己的组件资源服务器，应显式提供 `validateLibraryUrl`（地址校验函数），并限制域名和协议。

## 对 Dockyard 的阶段建议

### 第一阶段：验证集成，不改官方素材库

- 在现有画板中增加 Dockyard 自定义侧边栏入口。
- 先用 3–5 个本地 `LibraryItem`（素材项）验证“检索 → 加入素材库 → 拖入画板 → 保存 → 重启恢复”。
- 使用 `useHandleLibrary` 的 `adapter` 对接设计工作区的素材字段。
- 为素材项增加 `customData`（自定义数据）中的组件身份和资源版本。

### 第二阶段：接入组件目录

- 组件检索仍使用 Dockyard 的本地目录和视觉资源缓存。
- 只在用户确认后把候选转换为素材项；普通搜索不修改画板或项目代码。
- 对代码组件提供“视觉素材”和“代码详情”两个动作，避免把图片误认为可运行代码。

### 第三阶段：评估是否需要自有素材库界面

当组件库来源超过一个、需要复杂过滤/版本比较/许可显示时，Dockyard 应保留自己的检索侧边栏；官方素材库只作为导入后的通用收纳和画板插入层。只有出现明显的交互重复或性能问题时，才考虑实现 Dockyard 自有素材面板。

## 最终判断

Excalidraw 的开放 API 足够让组件检索“融洽地存在于画板内”，但最稳定的边界是：Dockyard 负责检索、目录、来源、版本和许可；Excalidraw 负责素材项的视觉编辑、复用和插入。把检索结果接入官方素材库是可行的第一步；把官方素材库内部改造成跨库组件搜索，则不属于当前稳定支持的扩展范围。

## 视觉预览格式与已有产品

如果画板只用于观察、比较和决策，不要求编辑组件，资源不必保存为 `excalidraw.json`（画板素材文件）。`PNG`（无损位图）文字清晰、兼容性最好；无损 `WebP`（网页图片格式）通常体积更小，也支持透明背景；`SVG`（矢量图）可无限缩放，适合图标和简单图形，但网页 UI 组件通常来自 HTML/CSS，不能稳定地直接转换成 SVG。建议使用“无损 WebP/PNG 预览 + manifest 元数据”，SVG 作为可选格式。

相近产品已经存在，但侧重点不同：Figma UI Kits/Community（界面套件和社区资源）提供可复用设计组件和更新机制；Storybook（组件展示工具）提供组件示例和视觉测试；Excalidraw Libraries（官方素材库）提供可复用绘图素材；shadcn Registry（代码注册表）提供代码分发。当前没有明显的通用产品把多个 UI 库的视觉预览、画板比较和面向 Codex 的结构化交接统一在一起，这仍是 Dockyard 可以形成差异的地方。

## 远程 Storybook 与 Excalidraw 素材库的关系

公开 Storybook 并不覆盖所有 UI 库。Storybook Showcase 可以查到 Carbon、Chakra UI、Fluent UI Web Components、Spectrum、Primer、Grafana 等公开项目；Carbon 还维护了按框架区分的公开 Storybook。MUI 和 Ant Design 更主要依赖自己的官方组件文档和示例页，不能假设存在稳定的官方 Storybook 地址。

远程 Storybook 本质上是某个静态 Storybook 构建站点，Dockyard 连接的是具体的 Story URL 或 `iframe.html` URL。它可以由 UI 库维护者托管，也可以由 Dockyard 自己建立一个聚合目录并托管。后者更容易锁定版本、统一示例和控制失效风险；Dockyard 运行时仍不需要安装组件依赖，但目录构建端需要安装并打包这些依赖。

Excalidraw 素材库使用 `.excalidrawlib`（JSON 素材库文件），内容是 Excalidraw 元素组成的 `LibraryItem`（素材项），官方目录负责索引和下载。这个机制可以借鉴“索引、来源、下载、版本”的组织方式，但不能直接承载远程 HTML/iframe 组件，因为原生素材库只认识 Excalidraw 元素。Dockyard 可以保留自己的组件目录界面：目录中保存组件 ID、Story URL、来源和版本，选中后由上层渲染层显示远程组件；原生 Excalidraw 素材库只继续负责真正的绘图素材。
