# 桌面工具条与标注画板开源项目调研

调研时间：2026-08-21。以下结论优先依据项目官方仓库、官方文档和仓库内许可证文件；“改造难度”按把项目接入 Dockyard 的工作量估计。

## 结论先行

没有找到一个既轻量、又直接针对“导入图片后在图片上标注”的完整桌面基座。**MarkerOn**（Tauri 桌面覆盖标注）和 **DrawPen**（Electron 覆盖工具条）主要是在屏幕覆盖层上绘制，适合借鉴透明窗口、点击穿透、快捷键和工具条交互，不适合直接作为图片标注基座。**KoBar** 功能和代码范围较大，更适合参考窗口停靠和插件机制，不建议整体拿来改造。

画板部分建议优先考虑 **Fabric.js** 或 **react-konva** 作为可控的底层画布；要直接得到完整白板编辑器可看 **Excalidraw**，但它不解决桌面透明窗口和全局快捷键。**tldraw** 功能强，但生产使用需要许可证密钥，不应默认按宽松开源项目处理。

## 一、贴边或悬浮桌面工具条、桌面 Dock

| 项目 | 技术栈与许可证 | 已有能力 | 改造判断 |
|---|---|---|---|
| [MarkerOn](https://github.com/ifer47/markeron) | Tauri 2、Vue 3、Vite、TypeScript、Canvas API；MIT（仓库 README 与 LICENSE） | 全局快捷键、透明桌面覆盖层、点击穿透、可切换白板、浮动工具栏、撤销/重做、文本/图形/激光笔/橡皮/印章、选择拖拽、截图/复制 | **中等**。与“桌面工具条 + 标注层”最接近，主要工作是把画布数据和 Dockyard 的组件候选、会话状态接起来。 |
| [DrawPen](https://github.com/DmytroVasin/DrawPen)（[官网](https://drawpen.app/)） | Electron；MIT；Windows、macOS、Linux | 全局快捷键、紧凑控制条、画笔/图形/文本/高亮/激光/橡皮、颜色和粗细、白板开关、清屏、快捷键配置 | **中低**。功能聚焦，适合直接抽出覆盖层和工具条；需要自行补 Dockyard 的画板数据模型和组件面板。 |
| [KoBar](https://github.com/Kobar-Project/KoBar) | Electron 40、React 19、TypeScript、Vite、Tailwind、Zustand、Konva/react-konva、electron-store；MIT | always-on-top（始终置顶）透明侧边栏、边缘停靠、插件架构、截图工具和内置标注编辑器、剪贴板、AI Hub；Windows 透明 Ghost Window（透明幽灵窗口）与鼠标事件穿透 | **中高**。最适合做 Electron 桌面壳和工具条，但代码体量较大，标注画板需要抽取或重做。 |
| [MIRA](https://github.com/pc-gs/MIRA) | Tauri 2 + Rust、React 19/TypeScript、Vite/Bun；README 描述 toolbar（工具条）和每显示器 overlay（覆盖层）窗口、多屏和全局快捷键 | 笔/高亮/橡皮/线/矩形/椭圆/箭头/文字、撤销重做、聚光指针、多屏 | **架构很贴近目标，但先核实许可证**。仓库 README 未明确显示许可证，不应直接用于商业产品；同时主要测试环境偏 macOS，Windows 需验证。 |
| [jBrush](https://github.com/jgravelle/jBrush) | Windows WPF、.NET 8；MIT | 全屏透明覆盖层、浮动 ControlTray（控制条）、点击穿透、全局快捷键、自由笔/矩形/椭圆/文本、撤销、托盘、自动淡出 | **低到中**（仅 Windows）。适合做最小原生基座，不适合跨平台或复杂白板。 |
| [annotation-overlay](https://github.com/AndreaGriffiths11/annotation-overlay) | Electron；MIT | 覆盖层、顶部胶囊工具条、绘制/点击穿透、笔/矩形/箭头/高亮/橡皮、快捷键、截图保存 | **低**，但仓库规模和维护度较小，更适合阅读实现或快速原型，不建议作为长期基座。 |
| [ksnip](https://github.com/ksnip/ksnip) | Qt，跨平台；开源许可证见仓库 LICENSE | 多屏/区域/窗口截图、图像编辑、模糊/水印、图钉置顶、OCR 插件、全局快捷键 | **中高**。更偏“截图后编辑”，不属于常驻覆盖工具条；适合借鉴截图和标注编辑器。 |
| [Cutting Board](https://github.com/utensils/cutting-board) | Tauri 2、React、TypeScript、tldraw；MIT；macOS 菜单栏白板 | 全局热键唤出覆盖画板、截图粘贴、便签、连接线、复制 PNG、自动保存、MCP server（模型上下文协议服务器） | **中高**。AI 操作画板的架构值得参考，但仅 macOS；依赖 tldraw 的生产许可证规则。 |

## 二、图片标注与画板组件

| 项目 | 技术栈与许可证 | 可复用能力 | 改造判断 |
|---|---|---|---|
| [Fabric.js](https://github.com/fabricjs/fabric.js) | TypeScript/JavaScript Canvas；MIT（官方 LICENSE） | 对象模型、拖拽/缩放/旋转/倾斜、分组、图形、文本、画笔、滤镜、JPG/PNG/JSON/SVG 导入导出、Node 渲染 | **中低**。不是现成产品 UI，但自由度高，适合实现 Dockyard 自己的标注数据模型和截图导出。 |
| [react-konva](https://github.com/konvajs/react-konva) / [Konva](https://github.com/konvajs/konva) | React 声明式绑定 + Canvas；MIT | React 组件化图形、事件、拖拽、Transformer（变换器）、图层，适合把标注元素接入 React 状态 | **中低**。需要自行实现选择框、文本编辑、序列化和工具栏；与 Electron/React 项目较容易整合。 |
| [Annotorious](https://github.com/annotorious/annotorious)（[官方文档](https://annotorious.dev/)） | TypeScript/JavaScript，提供 React/Svelte 绑定；BSD 3-Clause | 图片和高分辨率图片标注、矩形/多边形、事件、注释数据加载保存、可定制样式/编辑器，支持 OpenSeadragon | **中等**。如果核心是“在图片上做语义标注”很合适；若要自由画线、箭头、贴纸和任意设计图层，官方讨论建议改用 Konva/Fabric.js。 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | React/TypeScript；MIT（官方仓库 LICENSE） | 成熟的手绘风格白板、元素模型、选择/编辑、导出、协作和嵌入能力 | **中等**。可嵌入 Dockyard 作为画板，但需要自己处理桌面透明窗口、工具条、组件候选面板和 Dockyard 数据同步。 |
| [tldraw](https://github.com/tldraw/tldraw) | React/TypeScript 无限画布 SDK；**tldraw license** | 自定义 shape/tool/UI（图形、工具、界面）、绑定、导出、协作和 AI primitives（AI 原语） | **功能强但有许可证风险**。官方说明默认仅允许开发使用，生产需要 trial/commercial/hobby license key（试用/商业/业余许可证密钥）；不应当作 MIT 项目直接用于商业核心。 |

## 推荐组合

1. **图片标注优先：自建 Electron + React 外壳，画板采用 Fabric.js 或 react-konva**。这样可以直接把原始图片作为底图，把框、箭头、文字和草图保存成 Dockyard 自己的数据结构。
2. **需要现成图片标注数据模型：评估 Annotorious**。它适合图片区域、矩形和多边形语义标注；自由画线、箭头、组件图层仍需自行扩展。
3. **只借鉴桌面交互：参考 MarkerOn 或 DrawPen 的透明窗口、快捷键和工具条实现**，不直接复用其“屏幕覆盖绘图”模式。
4. **不建议整体采用 KoBar**。它可以提供一些窗口停靠和插件机制参考，但功能过多，会把 Dockyard 带入不必要的复杂度。

## 需要在采用前确认的事项

- 不要只看项目名称或演示图，必须在目标平台实际验证透明窗口、点击穿透、多屏坐标和全局快捷键。
- MIT/BSD 项目通常可直接改造，但仍需保留版权和许可证文本；依赖项的许可证也要单独核对。
- tldraw 的源码可见不等于宽松开源许可证，生产部署前需要明确许可证密钥和费用。
- MIRA 的仓库许可证未明确显示，未完成核实前不建议合并到产品代码。
