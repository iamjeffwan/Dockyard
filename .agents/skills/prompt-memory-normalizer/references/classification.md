# Context-memory classification

Use one category per record.

| Category | Long-lived? | Treatment |
| --- | --- | --- |
| Preference | Yes, when reusable | Express the desired outcome positively and add a scope. |
| Fact | Yes, while true | Preserve the factual statement and its evidence. |
| Temporary feedback | No by default | Keep with the review or task that produced it. |
| Review resolution | Yes, when it explains a recurring decision | Record the resolved behavior, but only in the affected scope. |
| Hard constraint | Yes | Preserve explicit strength for security, authority, destructive actions, credentials, or required approval. |

## Scope fields

Every reusable record should state:

- `surfaces`: the relevant UI or workflow surface;
- `components`: the affected components;
- `conditions`: when it applies.

An entry applies only when the current work overlaps its component and condition. A Token-panel fact is not a rule for component search; a current-review exception is not a permanent product preference.

## Audit output

| Original | Category | Scoped proposal | Equivalent | Recommend change | Reason |
| --- | --- | --- | --- | --- |

Use `high`, `medium`, or `low` for equivalence. Do not recommend a rewrite when scope or semantic strength is uncertain.
