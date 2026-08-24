# Dockyard MCP integration

This file is for a project that uses Dockyard as its UI review workbench. It describes the exchange format; it is not a visual style guide for the project.

## Start the connection

Configure the `dockyard-mcp` server for the project and call `dockyard_get_design_context` at the start of a UI task. Read the returned `DESIGN.md`, `token-schema.json`, and `project-tokens.json` before generating or changing UI.

The server can also be called explicitly by the user. A project-local Codex Skill may remind the model to call it automatically when the task concerns layout, typography, color, components, interaction, or motion.

## UI review output

For a visual change, emit one `dockyard-ui` review object using protocol version `1.1`. Put the page title and overview in `summary`. Put every independently reviewable proposal in `reviewItems` with a stable ID, priority, category, current state, proposed state, and the related token paths. Referenced token paths must exist in `changes`.

Do not hand-author the review HTML. `dockyard_submit_ui_review` validates the structured data, renders the fixed review template, and stores both records. Use `dockyard_render_ui_review` when a preview is needed without storing the proposal. The fixed template owns per-item accept, reject, discuss, and superseded controls, required notes, local draft persistence, progress, direct local submission, and the copyable result summary.

Screenshots, motion clips, or companion HTML may be attached to an item through `evidence`. Their paths must remain inside the project. Structured review data and decisions are durable; visual evidence is optional.

## Confirmation boundary

Use `dockyard_validate_ui_review` to check a proposal without writing anything. Use `dockyard_submit_ui_review` to save it under `.dockyard/design/reviews/`. Submission only records a proposal. It must not change `project-tokens.json`, mark a token as confirmed, or overwrite an existing review.

The user's explicit per-item choice is the event that may later update project tokens and decisions. Only accepted items update linked tokens. Rejected, discuss, or superseded items remain as history without changing confirmed state. Read `indexes.contextMemory` before a new review. Use an entry only when its surface, component, and condition match the new work; historical discussion for one component must not suppress a relevant finding on another.

## Project-specific rules

Project-specific visual direction, accessibility requirements, and product constraints may be added beside this file. Dockyard supplies the protocol and record shape; it does not impose a palette, font, layout, or product style on another project.
