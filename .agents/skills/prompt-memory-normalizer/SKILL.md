---
name: prompt-memory-normalizer
description: Audit long-lived prompts, skills, review feedback, and context records into scoped preferences, facts, temporary feedback, and hard constraints. Use when repeated guidance risks becoming an over-broad rule.
---

# Prompt Memory Normalizer

Audit candidate memory; do not silently rewrite it.

## Workflow

1. Read the relevant long-lived context and its source records. Preserve the original wording.
2. Classify each candidate as a preference, fact, temporary feedback, review resolution, or hard constraint. Read [classification.md](references/classification.md) for the boundary and output shape.
3. Give every non-global entry an explicit scope: affected surface, component, and condition. Do not infer that a finding for one component applies to another.
4. Rewrite only a preference that can keep its meaning and strength. Keep safety, authorization, deletion, credential, and explicit user-approval rules as constraints.
5. Produce an audit table with original text, classification, scoped proposal, equivalence, and risk. Mark a record `proposed` until the user confirms it.

## Boundaries

- Do not automatically write to Memory, Skill files, or project context records.
- Do not turn every negative statement into a positive statement.
- A resolved review item prevents repetition only when its surface, component, and condition match the current task.
- Treat missing scope as a reason to ask for clarification or retain the item as temporary feedback, not as permission to create a global rule.
