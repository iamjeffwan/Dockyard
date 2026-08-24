# Dockyard（插件停靠坞）

Dockyard 是一个独立的 `Electron`（桌面应用框架）+ `React`（前端框架）设计上下文工具。第一版使用 `Excalidraw`（手绘画布）完成图稿标注，使用临时组件草图调用 `Codex CLI`（命令行编码助手）检索候选，并把当前单张图稿整理成开发上下文包。

## 启动

```bash
pnpm install
pnpm run dev
```

生产构建：

```bash
pnpm run typecheck
pnpm run build
pnpm start
```

当前 Windows（微软桌面系统）开发脚本默认关闭 GPU（图形处理器）和 Chromium 沙箱（浏览器安全隔离），用于兼容受限环境。

## 使用流程

1. 启动后显示右下角可移动横向工具条。
2. 拖入、粘贴或选择图片，自动创建图稿。
3. 打开图稿后使用 Excalidraw 原生工具栏标注和绘图。
4. 打开组件检索，绘制临时组件草图并选择允许检索的组件库。
5. 调用 Codex CLI，候选卡片返回后拖入画布中央。
6. 保存图稿，或选择代码项目生成当前图稿的开发上下文包。

## 本地数据

默认保存在 Electron `userData`（应用数据目录）下：

```text
index.json
workspaces/<workspace-id>/design.json
workspaces/<workspace-id>/artworks/<artwork-id>/scene.excalidraw.json
workspaces/<workspace-id>/assets/source/
workspaces/<workspace-id>/assets/previews/
workspaces/<workspace-id>/assets/components/
global-components/index.json
global-components/<component-id>/
```

场景文件只保存结构和文件引用，图片及预览图单独保存。文件由 Electron 主进程通过 `IPC`（进程间通信）写入，并使用临时文件替换方式保存。

## Codex CLI 与上下文包

如果本机可用 `Codex CLI`，Dockyard 会调用 `codex exec --json`。组件检索只发送临时手绘草图，不发送原图和普通标注。检索过程会显示命令启动、模型事件和完成状态；请求、草图副本、结构约束、事件流、结果与错误日志会随候选缓存保存 14 天。检索失败时不会生成伪造候选，当前图稿仍可保存。

组件检索不会自动回退到本机 `OpenAI` 登录状态。必须先在应用数据目录的 `config/codex.json` 配置并启用供应商；密钥只能通过环境变量提供，不能写入该文件。检索窗口会实时显示过程，点击“查看调用记录”可打开原始产物目录。

```json
{
  "version": 1,
  "enabled": true,
  "model": "provider-model-name",
  "provider": {
    "id": "company_gateway",
    "name": "Company gateway",
    "baseUrl": "https://gateway.example.com/v1",
    "apiKeyEnv": "COMPANY_GATEWAY_API_KEY"
  }
}
```

第三方供应商必须兼容 `Responses API`。远程地址必须使用 `HTTPS`，只有本机地址允许使用 `HTTP`。

“发送给开发助手”会让用户选择目标代码项目，并在项目下生成：

```text
.dockyard/context/<artwork-id>/<timestamp>/
.dockyard/context/<artwork-id>/latest/
```

包内包含当前图稿原图、场景文件、设计记录片段、已采用组件来源和可编辑开发提示词。Dockyard 不自动操作 ChatGPT 或 Codex 桌面窗口。

## MCP（模型上下文协议）

应用启动后提供本地读取桥接，可按当前图稿读取设计状态、带标注预览和已确认组件，并更新修改说明。它是后续模型读取的补充能力，不阻塞上下文包主流程。
