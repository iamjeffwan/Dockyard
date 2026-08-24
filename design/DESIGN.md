# Dockyard UI Design Rules

## Scope

This document defines the UI decisions for Dockyard, the `Electron`（桌面应用框架）+ `React`（前端框架） design-context workbench. It is a decision guide, not a fixed palette. Concrete values live in `project-tokens.json`; the categories and record format live in `token-schema.json`.

The primary product shape is a compact, always-available work bar in the bottom-right corner. The bar selects a project and workspace, then exposes the feature modules that belong to that workspace:

- Artboards: the existing `Excalidraw`（手绘画布） workspace for importing, annotating, and saving reference images.
- Components: the existing component search and candidate collection flow.
- Tokens: the project's current visual and interaction variables, with their usage and recent changes.
- Decisions: confirmed decisions that explain why project tokens changed.

Dockyard is a focused desktop tool, not a marketing page or a large AI administration dashboard. A Codex HTML review remains the place for comparing UI candidates. Dockyard stores the project state and the decision behind an accepted change; it should not duplicate that review surface.

## Visual direction

- Use a dark, neutral work surface with restrained cyan and lime accents. Orange is reserved for caution or destructive context.
- Keep the interface dense enough for repeated work, while preserving clear grouping, readable labels, and a visible primary action.
- Use surfaces, borders, and spacing to establish hierarchy. Do not add decorative cards inside cards, ornamental gradients, or large hero sections.
- Keep the existing Dockyard character recognizable: dark canvas, warm text, lime primary action, cyan secondary signal, and `DM Mono`（等宽字体） metadata.
- New colors, type sizes, spacing, radii, and motion values must be added to a named project token instead of being scattered as unexplained literals.

## Layout and surfaces

- The work bar is fixed to the bottom-right, horizontally expanded by default, and compact enough to leave the user's desktop visible.
- Project-folder selection is workspace context, not a separate feature module. Choose it once in the bar's context popover; artworks, components, tokens, and decisions belong to the selected workspace.
- The bar contains feature modules as its primary content. Icons should carry familiar actions; labels remain available for ambiguous tools.
- The artboard is a focused canvas surface. Do not add Dockyard side rails, inspector columns, or separate artwork-management panels around it. Excalidraw's own canvas controls remain available.
- Component search is a work-bar extension, not a page or an artboard section. Its expanded surface contains a small Excalidraw（手绘画布） canvas on one side and candidate results on the other. Reuse the same canvas interaction model as the formal artboard; do not invent a second drawing tool.
- Token and decision views are compact extensions anchored to the work bar. They may use a popover or short sheet, but should not open as full-window workspaces like the artboard.
- Prefer one clear surface per task. Avoid stacking panels that make the app feel like a management console.

## Typography

- Use the project UI font for navigation, controls, and content. Use the mono font for IDs, token paths, statuses, keyboard hints, and compact metadata.
- Titles should establish hierarchy without taking over a tool surface. Labels and helper text must remain legible at compact sizes.
- Do not scale type directly with viewport width. Long labels wrap or truncate inside a stable container rather than changing layout unexpectedly.
- Maintain visible focus and sufficient contrast for keyboard and pointer users.

## Interaction and motion

- Every interactive control needs clear hover, focus, active, disabled, loading, and error behavior where applicable.
- Use familiar icons from the existing icon library. Icon-only controls need a tooltip or accessible name.
- A confirmed change is separate from a candidate. Candidate UI may be previewed and discussed, but it must not silently overwrite the project's confirmed token state.
- Motion should clarify state changes, not decorate the interface. Prefer short transitions in the 180–240ms range with a standard ease-out curve.
- Respect `prefers-reduced-motion`（减少动态偏好） by removing nonessential movement while retaining state and focus feedback.

## AI design workflow

### Static UI

Use `Jakub Krehel`（静态界面设计技能，官方仓库：https://github.com/jakubkrehel/skills） for layout, typography, color, component detail, accessibility, and static review. The initial pass may establish a complete UI baseline. Later passes should target the area named by the user and report:

```text
token path | old value | new value | affected components | reason | status
```

The model may discover or add project tokens when the current design needs them. It must keep the category and record shape from `token-schema.json`, and it must mark unconfirmed changes as `proposed`（待确认）.

### Motion and feedback

Use `Emil Kowalski`（动效与交互技能，官方仓库：https://github.com/emilkowalski/skills） only when the user asks for motion, transitions, feedback, or animation tradeoffs. Keep confirmed static UI unchanged unless the requested motion requires a small supporting state change. Record duration, easing, delay, property, reduced-motion behavior, and affected interaction tokens.

### Review boundary

The user describes the problem in natural language; they do not need to know token names in advance. The model locates the relevant tokens and components. The system or review artifact shows current versus candidate UI and the structured impact. Only an explicit acceptance changes confirmed project state. Rejected or superseded candidates remain temporary unless the user asks to archive them.
Review content uses the versioned Dockyard schema. The model supplies structured summary, review items, evidence references, and token impacts; Dockyard renders the HTML through its fixed template. Models must not replace the fixed decision controls, local draft behavior, progress summary, or copy-results format with hand-authored alternatives.

## Allowed change scope

Unless the user narrows it further, a UI pass may adjust:

- `color`（颜色）;
- `typography`（字体和文字层级）;
- `spacing`（间距）;
- `sizing`（尺寸）;
- `shape`（圆角和边框）;
- `interaction`（交互状态） when the user asks about behavior or feedback.

`motion`（动效） changes require an explicit motion or interaction request. Layout structure, data flow, Electron IPC（进程间通信）, persistence, and Excalidraw behavior are out of scope for a visual pass unless the user explicitly includes them.

## Acceptance criteria

A Dockyard UI change is ready for review when:

1. The changed UI works in the actual app surface, not only in a screenshot.
2. The implementation uses named project tokens for changed reusable values.
3. The change report names affected components and the untouched boundary.
4. Keyboard focus, disabled state, and reduced-motion behavior remain coherent.
5. No confirmed token or unrelated product flow is overwritten without an explicit user decision.
