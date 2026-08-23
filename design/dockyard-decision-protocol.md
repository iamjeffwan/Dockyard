# Dockyard review decisions

HTML previews are opened by the system browser. Dockyard does not duplicate the preview surface.

Each review item has its own `accepted`（接受）, `rejected`（拒绝）, `discuss`（讨论）, or `superseded`（已过时） choice. Discuss and superseded require a note before the item counts as decided. The page stores an unfinished draft locally and can submit a completed review directly to the local Dockyard review bridge.

`P0`–`P3`（评审优先级） describe impact and handling time, not implementation status: `P0` blocks use, `P1` should be handled before the next implementation round, `P2` improves a non-blocking experience issue, and `P3` can be observed later. The model assigns the priority from the review evidence and explains it in the review item.

After reviewing the page, the local bridge calls `dockyard_record_review_decision`（写入评审决定） with one decision per item:

```json
{
  "reviewId": "review-001",
  "itemDecisions": [
    { "itemId": "R1-1", "decision": "accepted", "comment": "" },
    { "itemId": "R1-2", "decision": "discuss", "comment": "独立检索是否需要图稿？" }
  ],
  "rationale": "保留逐项结论和已经核对的讨论背景。"
}
```

Only token changes linked to accepted items are updated and marked `confirmed`（已确认）. The current value must still equal the proposal's `from`（原值） value; otherwise the decision is rejected as stale.

Rejected, discuss, and superseded items only write history. They do not modify `project-tokens.json`（项目 Token 状态）. Reusable resolutions live in `context-memory.json`（范围化上下文记忆） with a surface, component, and condition. A later model reads that context before proposing changes and uses a resolution only when all relevant scope matches; it must not turn one component's conclusion into a global prohibition.

Every review has one immutable decision record whose overall result may be `mixed`（混合）. The original review JSON and HTML remain available as review history.
