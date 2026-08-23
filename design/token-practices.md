# Dockyard Token 实践总结

## 1. 文档目的

这份文档总结 CSS 自定义属性和 Design Tokens（设计 Token）的成熟实践，并说明 Dockyard 当前采用哪些部分。

核心结论是：

> `project-tokens.json`（项目 Token 数据）负责记录设计值和语义；`tokens.css`（CSS Token 输出）负责让实际界面使用这些值；组件不再散落硬编码颜色、间距和动效参数。

这不是要求 Dockyard 立即建立完整的企业级设计系统。当前仍然由项目产生具体值，系统只负责分类、命名、引用、变更和影响范围。

## 2. 资料来源

- [MDN: Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)：说明 CSS 自定义属性的级联、继承、`var()`（变量引用）、回退值和 `@property`（类型约束）。
- [Design Tokens Community Group: Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/)：定义平台无关的 Token 文件格式、`$value`（值）、`$type`（类型）、`$description`（描述）、分组和别名。
- [Style Dictionary: Design Tokens](https://styledictionary.com/info/tokens/)：说明如何把 Token 数据转换成 CSS、JavaScript、移动端和其他平台的输出。
- [Carbon Design System themes](https://github.com/carbon-design-system/carbon/tree/main/packages/themes)：展示大型设计系统如何用语义变量和主题覆盖组织组件样式。

## 3. 成熟实践

### 3.1 Token 数据和 CSS 使用分开

成熟做法通常不是让组件直接读取任意 JSON，而是经过一层输出：

```text
Token JSON
  -> 校验和转换
  -> CSS custom properties
  -> 组件通过 var() 使用
```

例如，项目 Token 可以记录：

```json
{
  "path": "color.accent.primary",
  "type": "color",
  "value": "#e7ff63"
}
```

CSS 输出为：

```css
:root {
  --color-accent-primary: #e7ff63;
}

.bar-action.primary {
  background: var(--color-accent-primary);
}
```

这样 Token 面板看到的值可以对应到真实代码，模型提出修改时也能明确知道影响哪些组件。

### 3.2 使用语义名称，不使用视觉名称

Token 名称应描述用途，而不是描述当前视觉值：

```text
color.accent.primary
color.surface.panel
color.text.muted
spacing.panel.gutter
motion.transition.standard
```

不建议：

```text
color.lime
color.dark-green
spacing.16
button-color-1
```

语义名称的好处是：当颜色从亮绿色改成黄色时，名称不需要一起修改；组件也不会依赖某个具体色值的历史叫法。

### 3.3 先区分项目语义，不急着建立庞大基础色板

很多设计系统会分成三层：

1. `primitive`（基础值）：色阶、字号、间距刻度等；
2. `semantic`（语义值）：页面背景、主操作、弱化文字等；
3. `component`（组件值）：某个组件的局部覆盖和状态。

Dockyard 当前采用简化版：

- Schema（结构定义）规定 `color`、`typography`、`spacing`、`sizing`、`shape`、`motion`、`interaction` 这些管理范围；
- 项目直接产生语义 Token 和具体值；
- 只有在重复使用或需要影响追踪时，才增加组件 Token；
- 不预先建立一套所有项目都必须使用的颜色和间距刻度。

这保留了设计自由度，也避免为了“完整”而提前维护大量没有实际用途的变量。

### 3.4 使用别名表达关系

如果多个语义 Token 确实共享同一个值，可以使用别名，而不是复制值：

```css
:root {
  --color-accent-primary: #e7ff63;
  --color-focus-default: var(--color-accent-primary);
}
```

别名应当有明确语义。不要为了减少重复就把所有颜色都指向同一个 Token，否则会让影响范围变得不可预测。

### 3.5 利用 CSS 的级联做主题和局部作用域

全局值可以放在 `:root`，主题或局部容器可以覆盖同名变量：

```css
:root {
  --color-surface-panel: #111617;
}

[data-theme="light"] {
  --color-surface-panel: #f7f8f5;
}

.component-search {
  --color-surface-panel: #172021;
}
```

Dockyard 第一阶段只需要项目级覆盖。主题和组件局部覆盖保留为后续能力，不提前增加复杂的主题编辑器。

### 3.6 `@property` 只用于确实需要类型或动画的变量

MDN 的实践表明，`@property` 可以声明变量是否继承、初始值和允许的类型。它适合需要动画或严格类型的变量，例如位移、透明度或数字进度。

普通颜色、间距和字体 Token 不需要全部改成 `@property`。过早使用会增加浏览器兼容和调试成本。

### 3.7 不要把 CSS 变量当成所有 CSS 位置的替代品

`var()` 适合 CSS 属性值，例如 `color`、`padding`、`transition-duration`。它不能替代选择器、属性名称，也不能直接用于媒体查询条件。

因此，Token 应管理视觉和交互参数，而不是试图把页面结构、断点逻辑或所有布局规则都抽象成变量。

## 4. Dockyard 的命名约定

### 4.1 JSON 路径

使用小写、点分隔的语义路径：

```text
<category>.<role>.<variant>.<state>
```

示例：

```text
color.accent.primary
color.button.primary.background
color.button.primary.background.hover
typography.title.size
spacing.panel.gutter
motion.transition.standard
interaction.disabled.opacity
```

不需要每个路径都填满四层。只有语义真的存在时才增加层级。

### 4.2 CSS 名称

JSON 路径转换为带 `--` 前缀的 kebab-case（短横线命名）：

```text
color.accent.primary
-> --color-accent-primary
```

CSS 变量不再使用 `--lime`、`--cyan` 这类颜色昵称作为正式名称。迁移期间可以保留旧昵称作为兼容别名：

```css
:root {
  --color-accent-primary: #e7ff63;
  --lime: var(--color-accent-primary);
}
```

## 5. Dockyard 的文件关系

当前项目约定如下：

```text
design/
  token-schema.json       Token 分类、字段和变更格式
  project-tokens.json     项目实际值和使用范围
  tokens.css              供源码使用的 CSS 输出（后续新增）
  decisions/              已确认的 Token 设计决策
  reviews/                候选变更和审查结果
```

`project-tokens.json` 是设计记录依据。`tokens.css` 是实现层输出，不能反过来成为没有语义说明的唯一来源。

第一阶段可以手动保持 JSON 和 CSS 输出一致；当 Token 数量和变更频率增加后，再引入 Style Dictionary 或同类转换脚本自动生成 `tokens.css`。

## 6. 从当前项目迁移的顺序

当前 `src/styles.css` 已经有一小组 CSS 变量：

```css
--bg
--panel
--panel2
--line
--muted
--lime
--cyan
--orange
```

建议按以下顺序迁移：

1. 把现有变量映射成语义 Token，例如 `--lime` 映射到 `color.accent.primary`。
2. 新增正式的 `--color-*`、`--spacing-*`、`--shape-*` 等变量，并让旧变量暂时引用新变量。
3. 优先迁移工作条、按钮、面板和画布容器等高复用区域。
4. 新 UI 改动不得再增加无语义的裸色值或重复间距值。
5. 运行 Token 校验，确认路径唯一、类型正确、别名存在且没有循环引用。
6. 用户确认设计变更后，再更新 `project-tokens.json` 的正式状态和对应决策记录。

不建议为了迁移而一次性重写整个 `styles.css`。迁移应跟随实际 UI 改造逐步完成。

## 7. Dockyard 当前不采用的做法

- 不预先提供所有项目必须使用的色板、字号或间距选项。
- 不让 Token 面板直接修改正式值；修改先经过模型候选和用户确认。
- 不把每一个局部 CSS 值都提升成 Token。
- 不把页面布局、业务流程和 Electron IPC（进程间通信）强行抽成全局 Token。
- 不为了使用工具而立即引入完整的多平台 Token 编译链。

## 8. 最终约定

Dockyard 使用成熟的 CSS 自定义属性机制，但把它放在更清晰的设计管理流程中：

```text
项目产生具体值
-> Token 文件记录语义和影响范围
-> CSS 自定义属性提供运行时使用
-> 组件引用语义变量
-> 模型提出变更
-> 用户确认后更新正式 Token 和决策
```

这样既保留传统 CSS 的直接性，也让 UI 修改可以被查看、比较、批准和回滚。
