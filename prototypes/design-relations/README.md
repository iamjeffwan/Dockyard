# 交互与组件关系表达原型

本原型验证两个问题：用户是否能通过两次选择建立清晰的交互关系；用户是否能把图稿位置关联到组件参考卡，同时让模型获得稳定的结构化数据。

运行 `pnpm prototype:design-relations` 后打开 `http://127.0.0.1:4319`，或者直接双击 `interaction-component-relations.prototype.html`。

原型状态仅保存在内存中，不会修改 Dockyard 项目数据。点击“载入完成示例”可以直接查看两类关系的最终显示效果。

当前只验证操作方式、视觉表达和数据结构，不代表已经接入原生 Excalidraw 绑定。`example-intent.json` 是完成示例对应的模型可读数据，`result.png` 是实际浏览器操作后的截图。
