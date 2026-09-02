# Domain Docs

本项目采用 single-context（单一上下文）布局。

## 读取规则

- 探索项目或开始开发前，先读取根目录 `CONTEXT.md`（如果存在）。
- 读取与当前工作相关的 `docs/adr/` 架构决策记录（如果存在）。
- 领域术语优先使用 `CONTEXT.md` 中的词汇；如果发现术语缺口，再通过领域建模补充。
- 如果实现与已有 ADR 冲突，需要明确指出，不要静默覆盖。

## 文件结构

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```
