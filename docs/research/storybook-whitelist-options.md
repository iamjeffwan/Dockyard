# Storybook 远程组件库白名单候选

调研目标：为 Dockyard 选择可嵌入远程 `iframe`（嵌入页面）、可按故事加载、来源稳定且许可清晰的组件库。以下结论只采用组件库官方站点或官方源码仓库；“可访问性”应在接入时用 `index.json`、`iframe.html?id=...` 做自动探测，不能只凭官网页面判断。

## 推荐顺序

| 优先度 | 库 | 官方文档/演示 | 许可与覆盖 | 远程接入判断 | 主要风险 |
|---|---|---|---|---|---|
| A | Storybook Design System | [官方 Storybook](https://master--5ccbc373887ca40020446347.chromatic.com/)；[源码](https://github.com/storybookjs/design-system) | 官方仓库为 MIT；按钮、表单、提示、模态框等基础组件齐全 | 已验证公开 `index.json` 和单故事 `iframe.html`，适合作为第一来源 | 版本更新节奏和 Chromatic 部署地址可能变化；部分故事较旧 |
| A | Carbon React | [官方 Storybook](https://react.carbondesignsystem.com/)；[源码](https://github.com/carbon-design-system/carbon) | IBM 官方开源，源码仓库采用 Apache-2.0；企业级组件覆盖广 | 官方站点确认为 Storybook；接入前需探测其当前 `index.json` 和跨域策略 | 组件和样式体量大，主题、字体和弹层依赖较多 |
| A- | Material UI | [组件文档](https://mui.com/material-ui/all-components/)；[源码](https://github.com/mui/material-ui) | MUI Core 为 MIT；覆盖输入、按钮、菜单、表格、反馈等大量组件 | 官方公开站点主要是文档运行时，不应假定存在公共 Storybook；需将文档演示或自建 Storybook 作为适配目标 | 公开演示 URL 和内部实现可能变化；MUI X 部分功能是商业许可 |
| A- | Ant Design | [组件文档](https://ant.design/components/overview)；[源码](https://github.com/ant-design/ant-design) | 官方仓库采用 MIT；企业级 React 组件覆盖非常广 | 官方文档有交互示例，但不是稳定的公共 Storybook 协议；需验证是否提供可固定的单组件预览地址 | 文档站点技术栈和路由可能变化；部分弹层使用 portal（传送到文档外层） |
| B+ | Mantine | [官方文档](https://mantine.dev/)；[源码](https://github.com/mantinedev/mantine) | 官方仓库采用 MIT；覆盖表单、导航、叠层、数据展示和 hooks | 官方文档可交互，但公共 Storybook 地址和 `index.json` 应在运行时探测，不建议预置为硬编码协议 | 版本较快；主题上下文和 CSS 变量对独立 iframe 有要求 |
| B+ | Radix Primitives | [官方文档](https://www.radix-ui.com/primitives)；[源码](https://github.com/radix-ui/primitives) | 官方仓库 MIT；无样式、可访问性优先的原语组件 | 官方重点是文档示例而非稳定公共 Storybook；通常需要库方或 Dockyard 自建展示壳 | 原语没有统一视觉样式，单独嵌入后不能直接作为“视觉组件”展示 |
| B | React Spectrum | [Adobe 官方文档](https://react-spectrum.adobe.com/react-spectrum/)；[源码](https://github.com/adobe/react-spectrum) | Adobe 官方仓库采用 Apache-2.0；覆盖可访问表单、选择器、菜单、日期等 | 官方文档提供交互示例，但不应假定公共 Storybook；需要适配页面或自建镜像 | 组件依赖 Provider、国际化和状态管理，跨 iframe 测量与主题恢复更复杂 |

## 建议的白名单策略

白名单条目不只保存域名，还应保存：`origin`（来源）、`indexUrl`（索引地址）、`iframeTemplate`（故事地址模板）、许可、版本、最后探测时间和能力标记。启动时执行健康检查：请求 `index.json`，确认返回 `story`/`docs` 条目，再用一个已知 Story ID 请求 `iframe.html`；失败时禁用该来源并显示原因。

建议首批只接入 Storybook Design System 与 Carbon React。这两者有明确的公开 Storybook，能直接验证“索引→故事→iframe→按需加载”链路。Material UI、Ant Design、Mantine、Radix、React Spectrum 作为第二批：它们本身质量高且许可友好，但官方公开演示不一定承诺 Storybook 索引协议，应该先做适配性探测或由我们维护版本化的展示壳。

## 与故事选择的关系

白名单只限制“来源”，不限制“故事”。用户可以从某个来源的任意 `story` 条目拖入画板；画稿 JSON 保存来源、`storyId`（故事标识）、故事名称、位置和尺寸。`docs` 条目用于目录和说明，真正渲染仍优先使用对应故事的 `iframe.html`。弹出菜单、提示框等临时状态不应改变画板实例的基础边界。

## 官方依据

- [Storybook Design System 源码与许可](https://github.com/storybookjs/design-system)
- [Carbon Design System React 源码](https://github.com/carbon-design-system/carbon)
- [Material UI 概览与组件清单](https://mui.com/material-ui/all-components/)
- [Ant Design 组件总览](https://ant.design/components/overview)
- [Mantine 官方文档](https://mantine.dev/)
- [Radix Primitives 官方文档](https://www.radix-ui.com/primitives)
- [React Spectrum 官方文档](https://react-spectrum.adobe.com/react-spectrum/)
