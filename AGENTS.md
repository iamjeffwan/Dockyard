# Dockyard 项目约束

## 模块格式

- Node.js、Electron 主进程和项目脚本统一使用 `ESM`（现代模块格式）。
- Electron 沙箱预加载脚本使用 `.cts` → `.cjs`（受 Electron 沙箱加载限制的唯一格式边界）。
- 新增相对导入时使用 `.js` 后缀；TypeScript 源文件也按最终生成的 `.js` 路径书写。
- Electron 的 `electron` 依赖保留默认导入后解构，因为它本身提供 `CommonJS`（通用模块格式）兼容入口。
- 不新增静态 `require`（旧式模块加载）。确需兼容外部 `CommonJS` 包时，使用边界适配并说明原因。

## Electron 运行

- 主进程入口是 `dist-electron/electron/main.js`，预加载脚本由同目录的 `preload.cjs` 提供。
- ESM 中不要使用未定义的 `__dirname`、`__filename`；使用 `import.meta.url`（当前模块地址）配合 Node.js 路径工具推导。
- 修改启动链后至少运行一次 `pnpm run typecheck`（类型检查）和 `pnpm run build`（生产构建）。

## 开发约定

- 先读取相关源码、测试和日志，再修改实现；优先补充能复现问题的自动化检查。
- 不把密码、令牌、API Key 或 `.env` 文件写入代码和提交。
- 删除文件使用 `trash`（可恢复删除）。
- 面向用户的说明默认使用简洁中文；技术术语首次出现时附中文解释。

## Agent skills

### Issue tracker

本项目使用 GitHub Issues 管理需求和工单。具体操作见 `docs/agents/issue-tracker.md`。

### Triage labels

使用默认工单分流标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。具体映射见 `docs/agents/triage-labels.md`。

### Domain docs

本项目采用 single-context（单一上下文）布局，领域说明位于根目录 `CONTEXT.md`，架构决策记录位于 `docs/adr/`。具体规则见 `docs/agents/domain.md`。
