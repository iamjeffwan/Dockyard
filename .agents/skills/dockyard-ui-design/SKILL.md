---
name: dockyard-ui-design
description: Improve Dockyard's UI from its project design rules and token state, with structured impact records for static UI, interaction, and motion changes.
metadata:
  short-description: Apply Dockyard UI rules and record token changes
---

# Dockyard UI Design

Use this skill when changing Dockyard's user interface, visual hierarchy, component details, interaction feedback, or motion. Read these files before editing:

- `design/DESIGN.md` for product-specific decisions and boundaries.
- `design/token-schema.json` for the allowed token categories and record shape.
- `design/project-tokens.json` for the current project baseline.
- `design/context-memory-schema.json` for allowed scoped-memory fields.`n- `design/context-memory.json` for scoped review resolutions and facts.
- The relevant React, CSS, Electron, or asset files for the requested surface.

## Select the design mode

- Static UI work uses `Jakub Krehel`（布局、字体、颜色、组件细节和静态审查；官方仓库：https://github.com/jakubkrehel/skills）.
- Motion or feedback work uses `Emil Kowalski`（动效、交互反馈、时长、缓动和动效取舍；官方仓库：https://github.com/emilkowalski/skills）.
- Do not treat either external skill as a required runtime dependency. Apply the relevant guidance when it is available, while keeping Dockyard's local design rules authoritative.

## Work sequence

1. Identify the requested surface and the user's allowed change scope. Preserve product flow, Electron IPC, persistence, Excalidraw behavior, and unrelated surfaces unless explicitly included.
2. Decide whether this is an initial full UI baseline or a local revision. An initial baseline can establish project token values. A local revision should change only the affected region and named token categories.
3. Locate existing tokens before adding one. The schema defines what is managed, not a fixed palette or spacing scale. Add a token only when a value is reusable or its impact needs to be tracked.
4. Implement the UI in the actual app code. Keep reusable values named and avoid introducing unexplained repeated literals.
5. Produce a structured change report. For every changed token, record its path, old value, new value, affected components, reason, source prompt, and `proposed`（待确认） status. A report can be stored under `design/reviews/` when the user asks for an artifact or when the change needs later approval.
6. Do not mark a change `confirmed` or overwrite a confirmed project token merely because the code renders. Confirmation is a user decision. Update `design/project-tokens.json` only when the user explicitly accepts the change or asks for the new baseline.
7. Validate the relevant app state and report what was checked. Check keyboard focus, disabled/loading/error states where relevant, and reduced-motion behavior for motion work.

## Output contract

End each UI task with:

- the changed surface and implementation result;
- the token changes, using `path | old | new`;
- affected components and the explicitly untouched boundary;
- the review status: `proposed`, `accepted`, `rejected`, or `superseded`;
- validation results and any environment limitation.

For a candidate review, show current versus proposed behavior in the real UI or an HTML review artifact. Do not replace a confirmed design with a candidate silently. Do not preserve screenshots or videos as permanent records unless the user asks for visual archiving; the structured decision is the durable record.
## Dockyard MCP review handoff

When the project is connected to Dockyard MCP, call `dockyard_get_design_context` before a UI task and use `dockyard_submit_ui_review` for the proposed changes. Read `indexes.contextMemory` and `indexes.decisionRecords` before making a proposal. Apply a saved resolution only when its surface, component, and condition overlap the current task; otherwise treat it as unrelated context. Resolve a discuss item from current source evidence, and do not repeat a matching resolved or superseded finding unless new evidence is present. Open the referenced HTML artifact in the system browser for visual review.
For review protocol `1.1`, provide `summary`, `reviewItems`, `changes`, and optional evidence references as structured data. Do not hand-author the review HTML: `dockyard_render_ui_review` and `dockyard_submit_ui_review` use Dockyard's fixed renderer so decision controls, per-item comments, progress, local drafts, and copied results stay consistent.

After the user chooses results, record every review item's `accepted`（接受）, `rejected`（拒绝）, `discuss`（讨论）, or `superseded`（已过时） decision with its comment and a short overall rationale. Discuss and superseded require comments. Never write confirmed Token state directly from the model. Only accepted items may update their linked project Token values, and the server rejects stale proposals.
