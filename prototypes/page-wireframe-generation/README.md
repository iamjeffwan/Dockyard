# 页面原型生成实验

> 实验问题：模型能否根据一段自然描述，生成三种结构明显不同、可直接编辑的 Excalidraw 原生页面原型？

这是一次性实验，不是正式功能。输入保存在 `request.json`，模型理解后的结构保存在 `prototype-spec.json`。

运行：

```powershell
pnpm prototype:page-wireframe
```

输出：

- `output/patient-management.excalidraw`：三个可编辑原生方案。
- `output/preview.html`：通过 `?variant=A`、`B`、`C` 切换方案的快速预览。

