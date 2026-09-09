export const DockyardRole = {
  designNode: "design-node",
  interaction: "interaction",
  componentBinding: "component-binding",
  componentCard: "component-card",
  componentPreview: "component-preview",
} as const;

export type DockyardRole = (typeof DockyardRole)[keyof typeof DockyardRole];

export type DesignNodeRole = "screen" | "trigger" | "component-slot" | "content-region";

export function createDesignNodeData(input: {
  nodeId: string;
  nodeRole: DesignNodeRole;
  label: string;
}) {
  return {
    dockyardRole: DockyardRole.designNode,
    nodeId: input.nodeId,
    nodeRole: input.nodeRole,
    label: input.label,
  } as const;
}

export function createInteractionData(input: {
  relationId: string;
  sourceElementId: string;
  targetElementId: string;
  event: string;
  action: string;
}) {
  return {
    dockyardRole: DockyardRole.interaction,
    relationId: input.relationId,
    sourceElementId: input.sourceElementId,
    targetElementId: input.targetElementId,
    event: input.event,
    action: input.action,
  } as const;
}

export function createComponentBindingData(input: {
  bindingId: string;
  targetElementId: string;
  cardElementId: string;
  previewElementId: string;
  sourceId: string;
  componentKey: string;
  variantKey?: string;
}) {
  return {
    dockyardRole: DockyardRole.componentBinding,
    bindingId: input.bindingId,
    targetElementId: input.targetElementId,
    cardElementId: input.cardElementId,
    previewElementId: input.previewElementId,
    sourceId: input.sourceId,
    componentKey: input.componentKey,
    ...(input.variantKey ? { variantKey: input.variantKey } : {}),
  } as const;
}

export function createComponentCardData(input: {
  bindingId: string;
  previewElementId: string;
}) {
  return {
    dockyardRole: DockyardRole.componentCard,
    bindingId: input.bindingId,
    previewElementId: input.previewElementId,
  } as const;
}

export function createComponentPreviewData(input: {
  bindingId: string;
  cardElementId: string;
}) {
  return {
    dockyardRole: DockyardRole.componentPreview,
    bindingId: input.bindingId,
    cardElementId: input.cardElementId,
  } as const;
}

export function createSceneMetadata() {
  return { schemaVersion: 1 } as const;
}

export function readDockyardRole(value: unknown): DockyardRole | null {
  if (!value || typeof value !== "object") return null;
  const role = (value as { dockyardRole?: unknown }).dockyardRole;
  return Object.values(DockyardRole).includes(role as DockyardRole)
    ? (role as DockyardRole)
    : null;
}
