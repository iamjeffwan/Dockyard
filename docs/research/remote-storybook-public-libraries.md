# 远程 Storybook 公共组件库调研

## 结论

Carbon v7 这次显示的蓝色横条不是组件，而是远程 Storybook 自己注入的维护提示：`carbon-components-react@7.x reached end of support...`。它进入了 180×76 的嵌入窗口，因此文字换行、溢出并产生滚动条。

Carbon 的 `Danger` Story 本身应渲染三个按钮：`Button`、`Tertiary Danger Button` 和 `Ghost Danger Button`。公开源码可以确认这一点，因此截图内容不是预期的组件画布。[Carbon Button Story](https://v7-react.carbondesignsystem.com/?path=/docs/components-button--danger)

## 远程 Storybook 实际提供的页面层级

Storybook 通常同时提供两类页面：

1. `manager`（管理界面）：侧边栏、工具栏、Controls、Docs 和预览区域。常见入口是 `/?path=/story/<story-id>`。
2. `preview iframe`（组件预览文档）：只负责渲染当前 Story，常见入口是 `/iframe.html?id=<story-id>&viewMode=story`。

官方文档明确说明，Storybook 的 Preview 区域本身就是一个独立 iframe；Manager 与 Preview 通过通信通道同步当前 Story。[Storybook Addon Architecture](https://storybook.js.org/docs/addons)

因此 Dockyard 应优先使用第二类地址，并且先检查远程 Storybook 的 `index.json`（Story 索引）确认 `story-id` 是否存在。不能把 Manager 页面地址直接当成组件页面。

## 远程地址可能返回的内容

这里的“返回”不只指 HTTP 响应，也包括 iframe 加载后的页面状态：

### 正常情况

- 单个 Story 的 HTML、CSS、JavaScript 和组件 DOM。
- Story 内部的 SVG、Canvas、图片、字体和异步资源。
- 一个 Story 里包含多个组件或多个状态；组件边界可能不是一个元素。
- Story 自己的背景、布局包装层、margin、padding、阴影和响应式 viewport。

Storybook 官方支持把已发布 Story 直接嵌入其他页面，并允许跨技术栈组合多个 Storybook。[Storybook Sharing](https://storybook.js.org/docs/sharing)

### 仍然是有效页面，但不是组件本身

- `docs`（文档页）：包含标题、说明、代码示例、Controls 和多个预览区。
- `manager`（管理页）：包含侧边栏、工具栏和插件面板。
- `loading`（加载中）：Story 或异步依赖尚未完成。
- `empty story`（空 Story）：Story 成功加载，但没有可见内容。
- 组件 Story 的自定义占位图、空状态或错误状态。

### Story 定位或构建错误

- `No Preview`（没有预览）：Story ID 不存在、没有选择 Story，或服务器路由错误。
- `Missing Environment Variables`（缺少环境变量）：远程 Story 依赖构建时或运行时环境变量。
- `Failed to render`（渲染失败）：组件代码、装饰器或依赖抛出异常。
- `Module not found`（模块不存在）、版本冲突或资源加载失败。

Storybook FAQ 特别指出，静态部署的 `/iframe.html` 如果被错误的服务器重写规则处理，会出现 `No Preview`；官方建议用正确的静态服务器提供 Storybook 构建目录。[Storybook FAQ](https://storybook.js.org/docs/9/faq)

### 访问和浏览器层面的失败

- 登录页、权限页或组织内网提示。
- `X-Frame-Options` 或 `Content-Security-Policy` 禁止被 iframe 嵌入。
- HTTPS 页面嵌入 HTTP 资源导致 Mixed Content（混合内容）阻断。
- DNS、网络超时、CDN 故障或重定向到其他页面。
- 远程页面加载成功，但 iframe 内部背景不透明，导致空白区域遮挡画布。

这些情况可能没有可读取的组件 DOM；父页面只能知道 iframe 加载失败、显示异常或得到一个错误文档。

## 较新的公开库选择

### 实测/公开页面对比

| 库 | 公开页面状态 | 结论 |
| --- | --- | --- |
| Carbon v7 | 远程页面显示停更横幅；部分 iframe 返回 `No Preview` | 不适合作为稳定来源 |
| Adobe React Spectrum | 公开 Storybook 存在，但多个固定构建的 iframe 出现 `No Preview` 或动态模块加载失败 | 需要版本探测和失败兜底 |
| GitHub Primer React | Manager 页面可访问；部分 iframe 出现动态模块加载失败，说明公开构建可能存在资源版本问题 | 可继续找稳定构建，但不能盲信 URL |
| Storybook/Chromatic 发布构建 | 官方支持纯 Story iframe，并提供固定构建地址规范 | 最适合作为接入协议参考，但仍需逐个验证构建 |

### React Spectrum / Adobe

Adobe 提供了公开 Storybook 构建页面，公开地址中可以直接看到 Alert 等组件 Story。[React Spectrum Storybook](https://reactspectrum.blob.core.windows.net/reactspectrum/7baabd10bdf71b0c30b22f89c88af84ce6461cea/storybook/index.html?path=%2Fstory%2Falert--header)

它比 Carbon v7 更适合作为下一次候选，但仍需逐个验证：Story ID、iframe 入口、嵌入策略和页面背景。

实际公开索引中也能看到 `No Preview` 和动态模块加载失败的构建，这说明“库比较新”并不能自动保证某个历史 Storybook 构建可用。

### Radix UI

Radix 官方公开的是组件文档和交互示例，不是一个可直接复用的官方 Storybook 目录。因此它适合作为“组件来源研究”，不适合作为当前远程 iframe 测试的第一候选。[Radix UI](https://www.radix-ui.com/)

### MUI、Chakra、shadcn/ui

这些项目主要公开文档站、示例页或源码仓库；“有公开文档”不等于“有稳定公开 Storybook iframe”。在没有确认具体 Storybook 部署和 Story ID 前，不应把它们当作远程组件源。

## 对 Dockyard 的实际影响

远程 Storybook 可以作为视觉预览源，但我们不能假设所有远程 Story 都具备：

- 可访问的稳定 Story ID；
- 纯组件 iframe，而不是 Docs 或 Manager 页面；
- 透明背景；
- 可被父页面读取的 DOM；
- 组件尺寸上报协议。

因此远程接入至少需要先做四步检查：读取 `index.json`、构造 `iframe.html` 地址、检查加载后的错误/权限状态、确认页面是否允许嵌入。真实边界同步需要远程页面主动通过 `postMessage`（跨页面消息）配合，否则只能使用固定边界或人工配置。

## 是否需要可控制的适配页面

目前的判断是：适配页面不是每个库都必需，但“远程来源验证 + 适配层”是必需的。

- 如果远程库提供稳定的纯 Story iframe、透明背景、固定版本和尺寸消息，Dockyard 可以直接加载，不需要额外适配页面。
- 如果只有 Manager/Docs 页面，适配页面需要把它转换成单一 Story 入口；但跨域时不能直接剥离内部 DOM。
- 如果远程 Story 返回维护横幅、错误页或动态模块加载失败，适配页面无法修复远程构建本身，只能识别失败并切换备用来源。
- 如果需要统一背景、留白、主题、状态参数和尺寸上报，适配页面最有价值，它相当于 Dockyard 的来源协议层。

因此适配层的第一版不应负责“重新渲染组件”，而应负责：验证 Story、选择纯预览地址、注入统一参数、监听加载错误、接收尺寸消息和提供失败兜底。
