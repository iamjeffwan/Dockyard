import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { Plus, Workflow, X } from "lucide-react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { StorybookSidebar } from "../../src/excalidraw/index.js";
import { StorybookSidebarTrigger } from "../../src/excalidraw/ui.js";
import { ExcalidrawOverlayPortal } from "../../src/excalidraw/ExcalidrawOverlayPortal.js";
import { PrototypeOverlay } from "../../src/overlay/index.js";
import { createViewportChannel, viewportFromAppState } from "../../src/overlay/viewport-channel.js";
import { staticComponentByKey, STATIC_SOURCES } from "../../src/static-components/registry.js";
import type { ComponentInstance, StorybookStory } from "../../src/types.js";
import {
  DockyardRole,
  createComponentBindingData,
  createComponentCardData,
  createComponentPreviewData,
  createDesignNodeData,
  createInteractionData,
  createSceneMetadata,
} from "../../src/design-intent/contract.js";
import "@excalidraw/excalidraw/index.css";
import "../../src/carbon.scss";
import "../../src/styles.css";
import "./excalidraw-prototype.css";

type Mode = "select" | "interaction" | "component";
type Interaction = { id: string; sourceNodeId: string; targetNodeId: string; event: string; action: string; arrowElementId: string; label: string; status: "draft" | "confirmed" };
type GeneratedSlot = { id: string; label: string; x: number; y: number; width: number; height: number; fontSize: number };
type ComponentBinding = {
  id: string;
  targetNodeId: string;
  componentRefId: string;
  sourceId: string;
  componentName: string;
  targetLabel: string;
  connectorElementId: string;
  cardNodeId: string;
  previewNodeId: string;
  cardX: number;
  cardY: number;
  cardWidth?: number;
  cardHeight?: number;
  status: "draft" | "confirmed";
  usageIntent: string;
  customization: string;
};

const CARD_LAYOUT = { width: 275, height: 184, contentInset: 18, previewTop: 56, previewWidth: 238, previewHeight: 112 } as const;

const nodeInfo: Record<string, { label: string; role: string }> = {
  "node-main-screen": { label: "患者信息管理主页面", role: "screen" },
  "node-nav-followup": { label: "回访菜单", role: "trigger" },
  "node-nav-system": { label: "系统管理菜单", role: "trigger" },
  "node-search-slot": { label: "患者搜索区域", role: "component-slot" },
  "node-system-screen": { label: "系统管理页面", role: "screen" },
};

const componentCatalog = {
  "carbon-button": { library: "Carbon", component: "Button", variant: "primary", summary: "主要操作按钮" },
  "carbon-date-picker": { library: "Carbon", component: "DatePicker", variant: "single", summary: "单日期选择" },
  "carbon-checkbox": { library: "Carbon", component: "Checkbox", variant: "default", summary: "复选状态" },
  "carbon-dropdown": { library: "Carbon", component: "Dropdown", variant: "default", summary: "下拉选择" },
  "carbon-toggle": { library: "Carbon", component: "Toggle", variant: "small", summary: "布尔状态切换" },
};

const baseSkeleton: any[] = [
  { id: "prototype-title", type: "text", x: 90, y: 65, text: "患者信息管理 · 原型方案", fontSize: 26, strokeColor: "#20242a" },
  { id: "prototype-note", type: "text", x: 90, y: 104, text: "使用顶部新增工具，直接在原生画板元素之间建立关系", fontSize: 15, strokeColor: "#69707c" },
  { id: "node-main-screen", type: "rectangle", x: 160, y: 280, width: 760, height: 470, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, customData: { dockyardNodeId: "node-main-screen", role: "screen", ...createDesignNodeData({ nodeId: "node-main-screen", nodeRole: "screen", label: "患者信息管理主页面" }) } },
  { id: "main-title", type: "text", x: 185, y: 302, text: "患者信息管理", fontSize: 22, strokeColor: "#20242a" },
  { id: "main-top-line", type: "line", x: 160, y: 340, width: 760, height: 0, points: [[0, 0], [760, 0]], roughness: 0 },
  { id: "main-side-line", type: "line", x: 370, y: 340, width: 0, height: 410, points: [[0, 0], [0, 410]], roughness: 0 },
  { id: "node-nav-followup", type: "rectangle", x: 610, y: 294, width: 96, height: 36, strokeColor: "transparent", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-nav-followup"], customData: { dockyardNodeId: "node-nav-followup", role: "trigger", ...createDesignNodeData({ nodeId: "node-nav-followup", nodeRole: "trigger", label: "回访菜单" }) } },
  { id: "nav-followup-text", type: "text", x: 624, y: 302, text: "回访⌄", fontSize: 17, groupIds: ["group-nav-followup"] },
  { id: "node-nav-system", type: "rectangle", x: 726, y: 294, width: 122, height: 36, strokeColor: "transparent", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-nav-system"], customData: { dockyardNodeId: "node-nav-system", role: "trigger", ...createDesignNodeData({ nodeId: "node-nav-system", nodeRole: "trigger", label: "系统管理菜单" }) } },
  { id: "nav-system-text", type: "text", x: 739, y: 302, text: "系统管理", fontSize: 17, groupIds: ["group-nav-system"] },
  { id: "patient-list-title", type: "text", x: 188, y: 370, text: "患者列表", fontSize: 18 },
  { id: "node-search-slot", type: "rectangle", x: 188, y: 414, width: 154, height: 46, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-search-slot"], customData: { dockyardNodeId: "node-search-slot", role: "component-slot", ...createDesignNodeData({ nodeId: "node-search-slot", nodeRole: "component-slot", label: "患者搜索区域" }) } },
  { id: "search-text", type: "text", x: 204, y: 427, text: "搜索患者", fontSize: 15, strokeColor: "#69707c", groupIds: ["group-search-slot"] },
  ...[0, 1, 2, 3].flatMap((index) => [
    { id: `patient-box-${index}`, type: "rectangle", x: 190, y: 495 + index * 54, width: 22, height: 22, roughness: 0 },
    { id: `patient-text-${index}`, type: "text", x: 232, y: 496 + index * 54, text: `患者 ${index + 1}`, fontSize: 15 },
  ]),
  { id: "detail-tabs", type: "text", x: 405, y: 372, text: "档案详情　　病历记录　　回访任务", fontSize: 17 },
  { id: "detail-body", type: "rectangle", x: 405, y: 414, width: 480, height: 280, roughness: 0 },
  { id: "detail-title", type: "text", x: 548, y: 525, text: "当前回访工作区", fontSize: 25 },
  { id: "detail-note", type: "text", x: 568, y: 568, text: "页面主体保持不变", fontSize: 15, strokeColor: "#69707c" },
  { id: "node-system-screen", type: "rectangle", x: 965, y: 90, width: 300, height: 160, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-system-screen"], customData: { dockyardNodeId: "node-system-screen", role: "screen", ...createDesignNodeData({ nodeId: "node-system-screen", nodeRole: "screen", label: "系统管理页面" }) } },
  { id: "system-title", type: "text", x: 1054, y: 142, text: "系统管理", fontSize: 23, groupIds: ["group-system-screen"] },
  { id: "system-note", type: "text", x: 1025, y: 188, text: "权限 / 配置 / 日志", fontSize: 16, strokeColor: "#69707c", groupIds: ["group-system-screen"] },
];

type Geometry = { x: number; y: number; width: number; height: number; dx?: number; dy?: number };

const baseGeometry = Object.fromEntries(
  baseSkeleton
    .filter((element) => nodeInfo[element.id] && element.type === "rectangle")
    .map((element) => [element.id, { x: element.x, y: element.y, width: element.width, height: element.height }]),
) as Record<string, Geometry>;

function connectionPoints(source: Geometry, target: Geometry) {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const sourceScale = 1 / Math.max(Math.abs(dx) / (source.width / 2), Math.abs(dy) / (source.height / 2));
  const targetScale = 1 / Math.max(Math.abs(dx) / (target.width / 2), Math.abs(dy) / (target.height / 2));
  const start = { x: sourceCenter.x + dx * sourceScale, y: sourceCenter.y + dy * sourceScale };
  const end = { x: targetCenter.x - dx * targetScale, y: targetCenter.y - dy * targetScale };
  return { start, end, dx: end.x - start.x, dy: end.y - start.y };
}

function boundArrowGeometry(source: Geometry, target: Geometry) {
  const { start, dx, dy } = connectionPoints(source, target);
  return {
    x: start.x,
    y: start.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [[0, 0], [dx, dy]],
  };
}

function rectanglesOverlap(first: Geometry, second: Geometry) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function synchronizeCardContents(elements: readonly any[], bindings: ComponentBinding[]) {
  let changed = false;
  const next = elements.map((element) => {
    const binding = bindings.find((item) => element.groupIds?.includes(`group-${item.id}`));
    if (!binding || element.id === binding.cardNodeId) return element;
    const card = elements.find((candidate) => candidate.id === binding.cardNodeId && !candidate.isDeleted);
    if (!card) return element;
    const scaleX = card.width / CARD_LAYOUT.width;
    const scaleY = card.height / CARD_LAYOUT.height;
    const contentX = card.x + CARD_LAYOUT.contentInset * scaleX;
    const definitions: Record<string, Record<string, number | string>> = {
      [`${binding.id}-badge`]: { x: contentX, y: card.y + 18 * scaleY, width: 45 * scaleX, height: 26 * scaleY },
      [`${binding.id}-badge-text`]: { x: contentX + 12 * scaleX, y: card.y + 23 * scaleY, fontSize: 14 * Math.min(scaleX, scaleY) },
      [`${binding.id}-library`]: { x: contentX + 59 * scaleX, y: card.y + 22 * scaleY, fontSize: 14 * Math.min(scaleX, scaleY) },
      [binding.previewNodeId]: { x: contentX, y: card.y + CARD_LAYOUT.previewTop * scaleY, width: CARD_LAYOUT.previewWidth * scaleX, height: CARD_LAYOUT.previewHeight * scaleY },
    };
    const expected = definitions[element.id];
    if (!expected) return element;
    const differs = Object.entries(expected).some(([key, value]) => Math.abs(Number(element[key]) - Number(value)) > 0.1);
    if (!differs) return element;
    changed = true;
    return { ...element, ...expected, version: element.version + 1 };
  });
  return changed ? next : null;
}

function generatedSlotSkeleton(slots: GeneratedSlot[]) {
  return slots.map((slot) => ({
    id: slot.id,
    type: "text",
    x: slot.x,
    y: slot.y,
    text: slot.label,
    fontSize: slot.fontSize,
    strokeColor: "#4b43dc",
    customData: { dockyardNodeId: slot.id, role: "component-slot", ...createDesignNodeData({ nodeId: slot.id, nodeRole: "component-slot", label: slot.label }) },
  }));
}

function relationSkeleton(interactions: Interaction[], bindings: ComponentBinding[], slots: GeneratedSlot[]) {
  const geometryById = { ...baseGeometry, ...Object.fromEntries(slots.map((slot) => [slot.id, slot])) };
  const elementTypeFor = (id: string) => slots.some((slot) => slot.id === id) ? "text" : "rectangle";
  const interactionElements = interactions.map((item) => {
    const geometry = boundArrowGeometry(geometryById[item.sourceNodeId], geometryById[item.targetNodeId]);
    return {
      id: item.arrowElementId, type: "arrow", ...geometry,
      start: { id: item.sourceNodeId, type: "rectangle" }, end: { id: item.targetNodeId, type: "rectangle" },
      ...(item.status === "confirmed" ? { label: { text: item.label, fontSize: 14 } } : {}),
      strokeColor: "#343a40", roughness: 0, endArrowhead: "arrow", locked: true,
      customData: { dockyardRelationId: item.id, relationType: "interaction", status: item.status, ...createInteractionData({ relationId: item.id, sourceElementId: item.sourceNodeId, targetElementId: item.targetNodeId, event: item.event, action: item.action }) },
    };
  });
  const componentElements = bindings.flatMap((item) => {
    const component = componentCatalog[item.componentRefId as keyof typeof componentCatalog];
    const y = item.cardY;
    const cardGeometry = {
      x: item.cardX,
      y,
      width: item.cardWidth ?? CARD_LAYOUT.width,
      height: item.cardHeight ?? CARD_LAYOUT.height,
    };
    const scaleX = cardGeometry.width / CARD_LAYOUT.width;
    const scaleY = cardGeometry.height / CARD_LAYOUT.height;
    const textScale = Math.min(scaleX, scaleY);
    const contentX = cardGeometry.x + CARD_LAYOUT.contentInset * scaleX;
    const connectorGeometry = boundArrowGeometry(geometryById[item.targetNodeId], cardGeometry);
    return [
      { id: item.cardNodeId, type: "rectangle", ...cardGeometry, strokeColor: item.status === "confirmed" ? "#198038" : "#635bff", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`], customData: { dockyardNodeId: item.cardNodeId, role: "component-reference", componentRefId: item.componentRefId, status: item.status, ...createComponentCardData({ bindingId: item.id, previewElementId: item.previewNodeId }) } },
      { id: `${item.id}-badge`, type: "rectangle", x: contentX, y: y + 18 * scaleY, width: 45 * scaleX, height: 26 * scaleY, strokeColor: "#635bff", backgroundColor: "#e9e7ff", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`] },
      { id: `${item.id}-badge-text`, type: "text", x: contentX + 12 * scaleX, y: y + 23 * scaleY, text: item.id, fontSize: 14 * textScale, strokeColor: "#4b43dc", groupIds: [`group-${item.id}`] },
      { id: `${item.id}-library`, type: "text", x: contentX + 59 * scaleX, y: y + 22 * scaleY, text: `${component.library} · ${component.component} · ${component.variant}`, fontSize: 14 * textScale, groupIds: [`group-${item.id}`] },
      { id: item.previewNodeId, type: "rectangle", x: contentX, y: y + CARD_LAYOUT.previewTop * scaleY, width: CARD_LAYOUT.previewWidth * scaleX, height: CARD_LAYOUT.previewHeight * scaleY, strokeColor: "#9aa1ad", backgroundColor: "#f8f9fa", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`], customData: { role: "component-preview", bindingId: item.id, ...createComponentPreviewData({ bindingId: item.id, cardElementId: item.cardNodeId }) } },
      { id: item.connectorElementId, type: "arrow", ...connectorGeometry, start: { id: item.targetNodeId, type: elementTypeFor(item.targetNodeId) }, end: { id: item.cardNodeId, type: "rectangle" }, strokeColor: "#635bff", strokeStyle: "dashed", roughness: 0, startArrowhead: null, endArrowhead: "arrow", locked: true, customData: { dockyardRelationId: item.id, relationType: "component", ...createComponentBindingData({ bindingId: item.id, targetElementId: item.targetNodeId, cardElementId: item.cardNodeId, previewElementId: item.previewNodeId, sourceId: item.sourceId, componentKey: item.componentRefId }) } },
    ];
  });
  return [...interactionElements, ...componentElements];
}

function buildElements(interactions: Interaction[], bindings: ComponentBinding[], slots: GeneratedSlot[]) {
  const elements = convertToExcalidrawElements([...baseSkeleton, ...generatedSlotSkeleton(slots), ...relationSkeleton(interactions, bindings, slots)] as any, { regenerateIds: false });
  // Excalidraw 会在转换文本元素时按字体度量修正文本坐标。关联目标的位置
  // 是用户在画板上调整后的状态，重建场景时必须把它恢复到保存的坐标。
  return elements.map((element) => {
    const slot = slots.find((candidate) => candidate.id === element.id);
    return slot ? { ...element, x: slot.x, y: slot.y } : element;
  });
}

function ToolbarTools({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    let mounted: HTMLElement | null = null;
    const install = () => {
      const toolbar = document.querySelector<HTMLElement>(".excalidraw .App-toolbar > .Stack");
      if (!toolbar) return;
      const existing = toolbar.querySelector<HTMLElement>("[data-relation-tools]");
      if (existing) { mounted = existing; setHost(existing); return; }
      const node = document.createElement("span"); node.dataset.relationTools = ""; node.className = "relation-toolbar-tools";
      const extra = toolbar.querySelector<HTMLElement>(":scope > .App-toolbar__extra-tools-trigger"); toolbar.insertBefore(node, extra || null); mounted = node; setHost(node);
    };
    install(); const observer = new MutationObserver(install); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mounted?.remove(); };
  }, []);
  useEffect(() => {
    const leaveRelationMode = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const tool = target?.closest("label")?.querySelector<HTMLInputElement>('input[name="editor-current-shape"]');
      if (!tool || target?.closest("[data-relation-tools]")) return;
      onMode("select");
    };
    document.addEventListener("pointerdown", leaveRelationMode, true);
    return () => document.removeEventListener("pointerdown", leaveRelationMode, true);
  }, [onMode]);
  if (!host) return null;
  return createPortal(
    <label className="ToolIcon Shape" title="添加交互关系"><input type="radio" name="editor-current-shape" className="ToolIcon_type_radio ToolIcon_size_medium" aria-label="添加交互关系" checked={mode === "interaction"} onChange={() => onMode("interaction")} /><span className="ToolIcon__icon"><Workflow size={20} /></span></label>
  , host);
}

function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const viewport = useMemo(() => createViewportChannel({ zoom: 1, scrollX: 0, scrollY: 0, width: window.innerWidth, height: window.innerHeight }), []);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [viewportState, setViewportState] = useState(() => viewport.getSnapshot());
  const [mode, setMode] = useState<Mode>("select"); const modeRef = useRef(mode);
  const [phase, setPhase] = useState("idle"); const phaseRef = useRef(phase);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null); const pendingRef = useRef<string | null>(null);
  const [, setSelectedCanvasNodeId] = useState<string | null>(null); const selectedCanvasNodeRef = useRef<string | null>(null);
  const [interactionMenuId, setInteractionMenuId] = useState<string | null>(null);
  const interactionMenuIdRef = useRef<string | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]); const interactionsRef = useRef(interactions);
  const [bindings, setBindings] = useState<ComponentBinding[]>([]); const bindingsRef = useRef(bindings);
  const [generatedSlots, setGeneratedSlots] = useState<GeneratedSlot[]>([]); const generatedSlotsRef = useRef(generatedSlots);
  const [message, setMessage] = useState("选择画板工具开始体验");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<StorybookStory | null>(null);
  const [previewInteractionActive, setPreviewInteractionActive] = useState(false);
  const [sceneGeometry, setSceneGeometry] = useState<Record<string, Geometry>>({});
  const geometrySignature = useRef("");
  const lastSelection = useRef("");
  useEffect(() => { interactionMenuIdRef.current = interactionMenuId; }, [interactionMenuId]);

  const syncMode = (next: Mode) => {
    modeRef.current = next; setMode(next); pendingRef.current = null; setPendingNodeId(null); lastSelection.current = "";
    const nextPhase = next === "interaction" ? "source" : "idle"; phaseRef.current = nextPhase; setPhase(nextPhase);
    setMessage(next === "interaction" ? "先选择交互触发元素" : "选择模式");
    api?.updateScene({ appState: { selectedElementIds: {}, activeTool: { ...api.getAppState().activeTool, type: "selection", customType: null } } as any });
  };

  const refreshScene = (nextInteractions: Interaction[], nextBindings: ComponentBinding[], nextSlots = generatedSlotsRef.current) => {
    const elements = buildElements(nextInteractions, nextBindings, nextSlots); api?.updateScene({ elements });
  };

  const revealCardWithoutZoom = (binding: ComponentBinding) => {
    requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!api || !shell) return;
      const state = api.getAppState();
      const zoom = state.zoom.value;
      const margin = 36;
      const cardWidth = binding.cardWidth ?? CARD_LAYOUT.width;
      const cardHeight = binding.cardHeight ?? CARD_LAYOUT.height;
      const cardBottom = binding.cardY + cardHeight + 44;
      const screenLeft = (binding.cardX + state.scrollX) * zoom;
      const screenRight = (binding.cardX + cardWidth + state.scrollX) * zoom;
      const screenTop = (binding.cardY + state.scrollY) * zoom;
      const screenBottom = (cardBottom + state.scrollY) * zoom;
      let scrollX = state.scrollX;
      let scrollY = state.scrollY;
      if (screenLeft < margin) scrollX += (margin - screenLeft) / zoom;
      else if (screenRight > shell.clientWidth - margin) scrollX += (shell.clientWidth - margin - screenRight) / zoom;
      if (screenTop < margin) scrollY += (margin - screenTop) / zoom;
      else if (screenBottom > shell.clientHeight - margin) scrollY += (shell.clientHeight - margin - screenBottom) / zoom;
      if (scrollX !== state.scrollX || scrollY !== state.scrollY) {
        api.updateScene({ appState: { scrollX, scrollY } as any });
      }
    });
  };

  useEffect(() => {
    if (!api) return;
    let settleFrame = 0;
    let draggedBindingId: string | null = null;
    const trackCardPointerDown = (event: PointerEvent) => {
      const snapshot = viewport.getSnapshot();
      const x = event.clientX / snapshot.zoom - snapshot.scrollX;
      const y = event.clientY / snapshot.zoom - snapshot.scrollY;
      const scene = api.getSceneElements();
      draggedBindingId = [...bindingsRef.current].reverse().find((binding) => {
        const card = scene.find((element) => element.id === binding.cardNodeId && !element.isDeleted);
        return card && x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height;
      })?.id || null;
    };
    const settleCards = () => {
      cancelAnimationFrame(settleFrame);
      settleFrame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(() => {
          const scene = [...api.getSceneElements()] as any[];
          let nextElements = scene;
          let nextBindings = [...bindingsRef.current];
          let corrected = false;
          let reordered = false;
          let changed = false;
          const selectedIds = api.getAppState().selectedElementIds || {};
          const selectedBindingIndex = nextBindings.findIndex((binding) => binding.id === draggedBindingId || (() => {
            const groupId = `group-${binding.id}`;
            return nextElements.some((element) => selectedIds[element.id] && element.groupIds?.includes(groupId));
          })());
          draggedBindingId = null;
          const moveCard = (bindingIndex: number, nextX: number, nextY: number) => {
            const binding = nextBindings[bindingIndex];
            const card = nextElements.find((element) => element.id === binding.cardNodeId && !element.isDeleted);
            const target = nextElements.find((element) => element.id === binding.targetNodeId && !element.isDeleted);
            if (!card || (nextX === card.x && nextY === card.y)) return;
            const dx = nextX - card.x;
            const dy = nextY - card.y;
            const groupId = `group-${binding.id}`;
            const nextCard = { ...card, x: nextX, y: nextY };
            const connectorGeometry = target ? boundArrowGeometry(target, nextCard) : null;
            nextElements = nextElements.map((element) => {
              if (connectorGeometry && element.id === binding.connectorElementId) {
                return { ...element, ...connectorGeometry, version: element.version + 1 };
              }
              if (element.groupIds?.includes(groupId)) {
                return { ...element, x: element.x + dx, y: element.y + dy, version: element.version + 1 };
              }
              return element;
            });
            nextBindings[bindingIndex] = { ...binding, cardX: nextX, cardY: nextY };
            changed = true;
          };

          nextBindings.forEach((binding, bindingIndex) => {
            const card = nextElements.find((element) => element.id === binding.cardNodeId && !element.isDeleted);
            const target = nextElements.find((element) => element.id === binding.targetNodeId && !element.isDeleted);
            if (!card || !target) return;
            if (rectanglesOverlap(card, target)) {
              const gap = 28;
              const leftX = target.x - card.width - gap;
              const rightX = target.x + target.width + gap;
              const nextX = Math.abs(card.x - leftX) <= Math.abs(card.x - rightX) ? leftX : rightX;
              moveCard(bindingIndex, nextX, card.y);
              corrected = true;
            }
          });

          if (selectedBindingIndex >= 0) {
            const binding = nextBindings[selectedBindingIndex];
            const card = nextElements.find((element) => element.id === binding.cardNodeId && !element.isDeleted);
            const otherCards = nextBindings
              .filter((_, index) => index !== selectedBindingIndex)
              .map((item) => nextElements.find((element) => element.id === item.cardNodeId && !element.isDeleted))
              .filter(Boolean);
            if (card && otherCards.some((other) => rectanglesOverlap(card, other))) {
              const gap = 16;
              const candidates = otherCards.flatMap((other) => [other.y - card.height - gap, other.y + other.height + gap]);
              const available = candidates.filter((candidateY) => {
                const candidate = { ...card, y: candidateY };
                return otherCards.every((other) => !rectanglesOverlap(candidate, other));
              });
              if (available.length) {
                const nextY = available.reduce((best, candidate) => Math.abs(candidate - card.y) < Math.abs(best - card.y) ? candidate : best);
                moveCard(selectedBindingIndex, card.x, nextY);
                reordered = true;
              }
            }
          }

          nextBindings = nextBindings.map((binding) => {
            const card = nextElements.find((element) => element.id === binding.cardNodeId && !element.isDeleted);
            if (!card) return binding;
            const cardWidth = card.width === CARD_LAYOUT.width ? undefined : card.width;
            const cardHeight = card.height === CARD_LAYOUT.height ? undefined : card.height;
            if (
              card.x === binding.cardX
              && card.y === binding.cardY
              && cardWidth === binding.cardWidth
              && cardHeight === binding.cardHeight
            ) return binding;
            changed = true;
            return { ...binding, cardX: card.x, cardY: card.y, cardWidth, cardHeight };
          });
          if (changed) {
            bindingsRef.current = nextBindings;
            setBindings(nextBindings);
          }
          if (corrected || reordered) {
            api.updateScene({ elements: nextElements });
            setMessage(reordered ? "组件卡片已插入最近空位" : "组件卡片已移到关联区域外，避免覆盖关系箭头");
          }
        });
      });
    };
    document.addEventListener("pointerdown", trackCardPointerDown, true);
    document.addEventListener("pointerup", settleCards, true);
    return () => {
      document.removeEventListener("pointerdown", trackCardPointerDown, true);
      document.removeEventListener("pointerup", settleCards, true);
      cancelAnimationFrame(settleFrame);
    };
  }, [api, viewport]);

  const chooseComponent = (story: StorybookStory) => {
    const definition = staticComponentByKey(story.id, story.sourceId);
    if (!definition) { setMessage(`${story.name} 当前没有可用的共享运行时来源`); return; }
    let targetNodeId = selectedCanvasNodeRef.current;
    let targetLabel = targetNodeId ? nodeInfo[targetNodeId]?.label || "已选原型区域" : "";
    let nextSlots = generatedSlotsRef.current;
    // 组件栏常驻右侧，关系卡片统一排在画稿左侧的空白参考区，
    // 避免创建后被侧栏遮挡，也便于用户连续比较和替换组件。
    let cardX = -500;
    let cardY = 330 + bindingsRef.current.length * (CARD_LAYOUT.height + 16);
    if (!targetNodeId) {
      const slotId = `generated-slot-${generatedSlotsRef.current.length + 1}`;
      const label = `${story.name} 区域`;
      const fontSize = 18;
      const slot: GeneratedSlot = {
        id: slotId,
        label,
        x: -80,
        y: cardY + 64,
        // 仅用于新建时计算箭头起点；画板中的实际目标是下面这个原生文本元素。
        width: Math.max(80, Array.from(label).reduce((total, character) => total + (/[\u4e00-\u9fff]/.test(character) ? fontSize : fontSize * 0.62), 0)),
        height: fontSize * 1.35,
        fontSize,
      };
      nextSlots = [...generatedSlotsRef.current, slot];
      generatedSlotsRef.current = nextSlots;
      setGeneratedSlots(nextSlots);
      targetNodeId = slotId;
      targetLabel = slot.label;
      selectedCanvasNodeRef.current = slotId;
      setSelectedCanvasNodeId(slotId);
    }
    const existing = bindingsRef.current.find((item) => item.targetNodeId === targetNodeId);
    const id = existing?.id || `C${bindingsRef.current.length + 1}`;
    const binding: ComponentBinding = {
      id,
      targetNodeId,
      componentRefId: story.id,
      sourceId: story.sourceId,
      componentName: story.name,
      targetLabel,
      connectorElementId: `component-link-${id}`,
      cardNodeId: `component-card-${id}`,
      previewNodeId: `component-preview-${id}`,
      cardX: existing?.cardX ?? cardX,
      cardY: existing?.cardY ?? cardY,
      cardWidth: existing?.cardWidth,
      cardHeight: existing?.cardHeight,
      status: "confirmed",
      usageIntent: "在该位置使用所选组件",
      customization: "开发时根据布局适配，不进行非等比缩放",
    };
    const next = existing ? bindingsRef.current.map((item) => item.id === id ? binding : item) : [...bindingsRef.current, binding];
    bindingsRef.current = next; setBindings(next); refreshScene(interactionsRef.current, next, nextSlots); syncMode("select");
    if (!existing) revealCardWithoutZoom(binding);
    setMessage(`${id} 已添加；可继续替换组件，或在图稿关系中删除`);
  };

  const removeComponentBinding = (id: string) => {
    const removed = bindingsRef.current.find((item) => item.id === id);
    if (!removed) return;
    const nextBindings = bindingsRef.current.filter((item) => item.id !== id);
    const nextSlots = generatedSlotsRef.current.filter((slot) => slot.id !== removed.targetNodeId || nextBindings.some((item) => item.targetNodeId === slot.id));
    bindingsRef.current = nextBindings;
    generatedSlotsRef.current = nextSlots;
    setBindings(nextBindings);
    setGeneratedSlots(nextSlots);
    refreshScene(interactionsRef.current, nextBindings, nextSlots);
    setMessage(`${id} 已从图稿关系中删除`);
  };

  const removeInteraction = (id: string) => {
    const next = interactionsRef.current.filter((item) => item.id !== id);
    interactionsRef.current = next;
    setInteractions(next);
    if (interactionMenuIdRef.current === id) setInteractionMenuId(null);
    refreshScene(next, bindingsRef.current);
    setMessage(`${id} 已从图稿关系中删除`);
  };

  const configureInteraction = (id: string, event: string, action: string, label: string) => {
    const next = interactionsRef.current.map((item) => item.id === id ? { ...item, event, action, label, status: "confirmed" as const } : item);
    interactionsRef.current = next; setInteractions(next); setInteractionMenuId(null); refreshScene(next, bindingsRef.current); syncMode("select"); setMessage(`${id} 已设置为“${label}”`);
  };

  const onChange = useCallback((elements: readonly any[], appState: any) => {
    const selectedElementIds = appState.selectedElementIds || {};
    const nextGeneratedSlots = generatedSlotsRef.current.map((slot) => {
      const element = elements.find((candidate) => candidate.id === slot.id && !candidate.isDeleted);
      // 只在文本目标本身被选中/拖动时写回位置，避免移动关联卡片或箭头时
      // Excalidraw 的绑定重算短暂改变文本边界，覆盖用户已经保存的位置。
      if (!element || (!selectedElementIds[slot.id] && !appState.selectedElementsAreBeingDragged)) return slot;
      return {
        ...slot,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        label: typeof element.text === "string" ? element.text : slot.label,
      };
    });
    const slotsChanged = nextGeneratedSlots.some((slot, index) => {
      const previous = generatedSlotsRef.current[index];
      return !previous || slot.x !== previous.x || slot.y !== previous.y || slot.width !== previous.width || slot.height !== previous.height || slot.label !== previous.label;
    });
    if (slotsChanged) {
      generatedSlotsRef.current = nextGeneratedSlots;
      setGeneratedSlots(nextGeneratedSlots);
    }
    const synchronized = synchronizeCardContents(elements, bindingsRef.current);
    if (synchronized) {
      api?.updateScene({ elements: synchronized });
      return;
    }
    const bounds = shellRef.current?.getBoundingClientRect();
    const nextViewport = viewportFromAppState(appState, { width: bounds?.width || window.innerWidth, height: bounds?.height || window.innerHeight });
    viewport.publish(nextViewport);
    setViewportState((current) => JSON.stringify(current) === JSON.stringify(nextViewport) ? current : nextViewport);
    const elementIds = new Set(elements.map((element) => element.id));
    const removedInteractions = interactionsRef.current.filter((item) => !elementIds.has(item.arrowElementId));
    if (removedInteractions.length) {
      const next = interactionsRef.current.filter((item) => elementIds.has(item.arrowElementId));
      interactionsRef.current = next;
      setInteractions(next);
      if (interactionMenuIdRef.current && !next.some((item) => item.id === interactionMenuIdRef.current)) setInteractionMenuId(null);
    }
    // 关系箭头在确认后仍需要保留几何信息，才能显示并定位“修改交互方式”入口。
    const interactionArrowIds = new Set(interactionsRef.current.map((item) => item.arrowElementId));
    const tracked = Object.fromEntries(elements
      .filter((element) => (element.type === "rectangle" && (element.id.startsWith("component-card-") || element.id.startsWith("component-preview-"))) || interactionArrowIds.has(element.id))
      .map((element) => {
        const lastPoint = element.type === "arrow" ? element.points?.[element.points.length - 1] : null;
        return [element.id, { x: element.x, y: element.y, width: element.width, height: element.height, dx: lastPoint?.[0], dy: lastPoint?.[1] }];
      }));
    const signature = JSON.stringify(tracked);
    if (signature !== geometrySignature.current) { geometrySignature.current = signature; setSceneGeometry(tracked); }
    const selected = Object.keys(appState.selectedElementIds || {}).filter((id) => appState.selectedElementIds[id]);
    const nodeId = selected.find((id) => nodeInfo[id] || generatedSlotsRef.current.some((slot) => slot.id === id));
    if (modeRef.current === "select") {
      if (nodeId && nodeId !== selectedCanvasNodeRef.current) {
        selectedCanvasNodeRef.current = nodeId;
        setSelectedCanvasNodeId(nodeId);
        const slot = generatedSlotsRef.current.find((item) => item.id === nodeId);
        setMessage(`已选择：${nodeInfo[nodeId]?.label || slot?.label || "原型区域"}。可从组件侧栏点击加号`);
      } else if (!selected.length) {
        selectedCanvasNodeRef.current = null;
        setSelectedCanvasNodeId(null);
      }
      return;
    }
    if (modeRef.current === "component" || !nodeId || nodeId === lastSelection.current) return;
    lastSelection.current = nodeId;
    if (modeRef.current === "interaction") {
      if (phaseRef.current === "source") { pendingRef.current = nodeId; setPendingNodeId(nodeId); phaseRef.current = "target"; setPhase("target"); setMessage(`起点：${nodeInfo[nodeId]?.label || "组件使用位置"}。请选择目标页面`); }
      else if (nodeId !== pendingRef.current) {
        const id = `I${interactionsRef.current.length + 1}`;
        const next = [...interactionsRef.current, { id, sourceNodeId: pendingRef.current!, targetNodeId: nodeId, event: "", action: "", arrowElementId: `interaction-arrow-${id}`, label: "", status: "draft" as const }];
        interactionsRef.current = next; setInteractions(next); pendingRef.current = null; setPendingNodeId(null); phaseRef.current = "idle"; setPhase("idle"); modeRef.current = "select"; setMode("select"); setMessage(`${id} 已绑定；点击箭头中点的加号设置交互方式`); refreshScene(next, bindingsRef.current);
      }
    }
    setTimeout(() => { lastSelection.current = ""; api?.updateScene({ appState: { selectedElementIds: {} } as any }); }, 0);
  }, [api, viewport]);

  const togglePreviewInteraction = () => {
    if (previewInteractionActive) {
      setPreviewInteractionActive(false);
      setMessage("已退出预览交互状态");
      api?.updateScene({ appState: { selectedElementIds: {} } as any });
      return;
    }
    if (!bindingsRef.current.some((item) => item.status === "confirmed")) { setMessage("请先添加组件，再开启预览交互"); return; }
    setPreviewInteractionActive(true);
    setMessage("预览交互中 · 点击组件体验，按 Shift+P 或 Esc 退出");
    api?.updateScene({ appState: { selectedElementIds: {} } as any });
  };

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")) return;
      if (!event.shiftKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      togglePreviewInteraction();
    };
    document.addEventListener("keydown", onShortcut, true);
    return () => document.removeEventListener("keydown", onShortcut, true);
  }, [previewInteractionActive, api]);

  useEffect(() => {
    if (!previewInteractionActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewInteractionActive(false);
        setMessage("已退出预览交互状态");
        api?.updateScene({ appState: { selectedElementIds: {} } as any });
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".prototype-overlay-layer")
        || target?.closest(".interaction-options")
        || target?.closest(".relation-status")
        || target?.closest(".relation-summary")
        || target?.closest(".relation-popover")) return;
      const snapshot = viewport.getSnapshot();
      const x = event.clientX / snapshot.zoom - snapshot.scrollX;
      const y = event.clientY / snapshot.zoom - snapshot.scrollY;
      const insidePreview = bindingsRef.current.some((binding) => {
        const preview = sceneGeometry[binding.previewNodeId];
        return preview && x >= preview.x && x <= preview.x + preview.width && y >= preview.y && y <= preview.y + preview.height;
      });
      if (!insidePreview) {
        setPreviewInteractionActive(false);
        setMessage("已退出预览交互状态");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown, true); };
  }, [api, previewInteractionActive, sceneGeometry, viewport]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    const publish = () => {
      const bounds = node.getBoundingClientRect();
      const nextViewport = viewportFromAppState(api?.getAppState() || {}, { width: bounds.width, height: bounds.height });
      viewport.publish(nextViewport);
      setViewportState((current) => JSON.stringify(current) === JSON.stringify(nextViewport) ? current : nextViewport);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, [api, viewport]);

  useEffect(() => () => viewport.dispose(), [viewport]);

  const runtimeComponents = useMemo(() => bindings.flatMap((item): ComponentInstance[] => {
    const preview = sceneGeometry[item.previewNodeId];
    const source = STATIC_SOURCES.find((candidate) => candidate.id === item.sourceId);
    const definition = staticComponentByKey(item.componentRefId, item.sourceId);
    if (!preview || !source || !definition) return [];
    const variant = definition.variants?.[0];
    return [{
      id: definition.key,
      name: definition.name,
      library: source.name,
      previewKind: "reference",
      instanceId: `reference-runtime-${item.id}`,
      elementId: item.previewNodeId,
      status: "confirmed",
      sourceLibraryId: source.id,
      componentKey: definition.key,
      staticModule: { sourceId: source.id, componentKey: definition.key, protocolVersion: source.protocolVersion, version: source.module.version },
      variantKey: variant?.key,
      props: variant?.props,
      x: preview.x,
      y: preview.y,
      width: definition.defaultWidth,
      height: definition.defaultHeight,
      naturalWidth: definition.defaultWidth,
      naturalHeight: definition.defaultHeight,
      sizeMode: "auto",
      rotation: 0,
      presentation: { kind: "reference-card", viewportX: preview.x, viewportY: preview.y, viewportWidth: preview.width, viewportHeight: preview.height, contentInset: 12, fit: "contain" },
    }];
  }), [bindings, sceneGeometry]);

  const confirmedInteractions = interactions.filter((item) => item.status === "confirmed");
  const confirmedBindings = bindings.filter((item) => item.status === "confirmed");
  const exportData = useMemo(() => ({ dockyard: createSceneMetadata(), version: 1, designNodes: [...Object.entries(nodeInfo).map(([id, info]) => ({ id, ...info })), ...generatedSlots.map((slot) => ({ id: slot.id, label: slot.label, role: "component-slot", x: slot.x, y: slot.y, width: slot.width, height: slot.height }))], interactions: confirmedInteractions, componentBindings: confirmedBindings, componentRefs: Object.fromEntries(confirmedBindings.map((item) => [item.componentRefId, componentCatalog[item.componentRefId as keyof typeof componentCatalog]])) }), [confirmedBindings, confirmedInteractions, generatedSlots]);
  const count = confirmedInteractions.length + confirmedBindings.length;

  useEffect(() => {
    (window as any).__dockyardRelationPrototype = {
      exportData,
      getSceneElements: () => api?.getSceneElements() ?? [],
      replaceSceneElements: (elements: readonly any[]) => api?.updateScene({ elements }),
      getAppState: () => api?.getAppState() ?? {},
      clearSelection: () => api?.updateScene({ appState: { selectedElementIds: {}, selectedGroupIds: {} } as any }),
      selectElement: (id: string) => api?.updateScene({ appState: { selectedElementIds: { [id]: true }, selectedGroupIds: {} } as any }),
      removeElement: (id: string) => api?.updateScene({ elements: (api?.getSceneElements() ?? []).filter((element) => element.id !== id) }),
      focusElements: (ids: string[]) => {
        const wanted = new Set(ids);
        const elements = (api?.getSceneElements() ?? []).filter((element) => wanted.has(element.id));
        if (elements.length) api?.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.72, animate: false });
      },
      panViewport: (deltaX: number, deltaY: number, steps = 12) => new Promise<void>((resolve) => {
        if (!api) { resolve(); return; }
        const initial = api.getAppState();
        let step = 0;
        const move = () => {
          step += 1;
          api.updateScene({ appState: {
            scrollX: initial.scrollX + deltaX * step / steps,
            scrollY: initial.scrollY + deltaY * step / steps,
          } as any });
          if (step < steps) requestAnimationFrame(move); else resolve();
        };
        requestAnimationFrame(move);
      }),
    };
  }, [api, exportData]);

  const draftInteraction = interactions.find((item) => item.status === "draft");
  const interactionAnchorFor = (item: Interaction) => {
    const arrow = sceneGeometry[item.arrowElementId];
    return arrow ? {
      left: (arrow.x + (arrow.dx ?? arrow.width) / 2 + viewportState.scrollX) * viewportState.zoom,
      top: (arrow.y + (arrow.dy ?? arrow.height) / 2 + viewportState.scrollY) * viewportState.zoom,
    } : null;
  };
  const interactionAnchor = draftInteraction ? interactionAnchorFor(draftInteraction) : null;
  return <div ref={shellRef} className="prototype-shell excalidraw-wrap">
    <Excalidraw initialData={{ elements: buildElements([], [], []), appState: { viewBackgroundColor: "#ffffff", zoom: { value: 0.72 as any }, scrollX: 35, scrollY: 35 } }} excalidrawAPI={(value) => { setApi(value); requestAnimationFrame(() => value.scrollToContent(value.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.82, animate: false })); }} onChange={onChange} langCode="zh-CN" theme="light" renderTopRightUI={() => <StorybookSidebarTrigger />} UIOptions={{ dockedSidebarBreakpoint: 0, canvasActions: { loadScene: false, saveToActiveFile: false } }}>
      <ToolbarTools mode={mode} onMode={syncMode} />
      <StorybookSidebar
        selection={selectedStory ? { sourceId: selectedStory.sourceId, storyId: selectedStory.id, storyName: selectedStory.name, storyUrl: selectedStory.storyUrl } : undefined}
        onSelectionChange={setSelectedStory}
        onStoryAdd={chooseComponent}
        excalidrawAPI={api}
      />
    </Excalidraw>
    <ExcalidrawOverlayPortal>
      <PrototypeOverlay
        components={runtimeComponents}
        viewport={viewport}
        mode={previewInteractionActive ? "component" : "canvas"}
        interactiveInstanceIds={previewInteractionActive ? bindings.map((item) => `reference-runtime-${item.id}`) : []}
        onCommit={() => {}}
        onNativeToolShortcut={(key) => {
          if (key !== "Escape" || !previewInteractionActive) return;
          setPreviewInteractionActive(false);
          setMessage("已退出预览交互状态");
          api?.updateScene({ appState: { selectedElementIds: {} } as any });
        }}
      />
    </ExcalidrawOverlayPortal>
    {previewInteractionActive && bindings.map((binding) => { const preview = sceneGeometry[binding.previewNodeId]; return preview ? <div key={`preview-ring-${binding.id}`} className="preview-interaction-ring" style={{ left: (preview.x + viewportState.scrollX) * viewportState.zoom, top: (preview.y + viewportState.scrollY) * viewportState.zoom, width: preview.width * viewportState.zoom, height: preview.height * viewportState.zoom }} /> : null; })}
    {interactions.filter((item) => item.status === "confirmed").map((item) => { const anchor = interactionAnchorFor(item); return anchor ? <button key={`edit-${item.id}`} type="button" className="interaction-edit" aria-label={`修改${item.id}交互方式`} style={anchor} onClick={() => setInteractionMenuId((current) => current === item.id ? null : item.id)}>{item.label}</button> : null; })}
    {draftInteraction && interactionAnchor && <>
      <button type="button" className="interaction-add" aria-label="设置交互方式" style={interactionAnchor} onClick={() => setInteractionMenuId((current) => current === draftInteraction.id ? null : draftInteraction.id)}><Plus size={15} /></button>
      {interactionMenuId === draftInteraction.id && <div className="interaction-options" style={{ left: interactionAnchor.left + 18, top: interactionAnchor.top + 16 }}>
        <strong>选择交互方式</strong>
        <button onClick={() => configureInteraction(draftInteraction.id, "click", "navigate", "点击 · 跳转")}>点击 · 跳转</button>
        <button onClick={() => configureInteraction(draftInteraction.id, "click", "switch", "点击 · 切换")}>点击 · 切换</button>
        <button onClick={() => configureInteraction(draftInteraction.id, "hover", "show", "悬停 · 显示")}>悬停 · 显示</button>
        <button onClick={() => configureInteraction(draftInteraction.id, "submit", "submit", "提交 · 执行")}>提交 · 执行</button>
      </div>}
    </>}
    {interactionMenuId && !draftInteraction && (() => { const item = interactions.find((candidate) => candidate.id === interactionMenuId); const anchor = item && interactionAnchorFor(item); return item && anchor ? <div className="interaction-options" style={{ left: anchor.left + 18, top: anchor.top + 16 }}>
      <strong>修改交互方式</strong>
      <button onClick={() => configureInteraction(item.id, "click", "navigate", "点击 · 跳转")}>点击 · 跳转</button>
      <button onClick={() => configureInteraction(item.id, "click", "switch", "点击 · 切换")}>点击 · 切换</button>
      <button onClick={() => configureInteraction(item.id, "hover", "show", "悬停 · 显示")}>悬停 · 显示</button>
      <button onClick={() => configureInteraction(item.id, "submit", "submit", "提交 · 执行")}>提交 · 执行</button>
    </div> : null; })()}
    {mode === "interaction" && <div className="relation-popover">
      <div className="popover-head"><strong>添加交互</strong><button onClick={() => syncMode("select")} aria-label="关闭关系工具"><X size={16} /></button></div>
      <p>{phase === "target" ? `起点：${nodeInfo[pendingNodeId!]?.label}` : "第一步选择触发元素，第二步选择目标页面"}</p>
    </div>}
    <div className={`relation-status${previewInteractionActive ? " is-preview-active" : ""}`}>
      {previewInteractionActive ? <span>{message}</span> : <button type="button" className="preview-toggle" aria-label="预览交互" onClick={togglePreviewInteraction}>预览交互 <kbd>Shift+P</kbd></button>}
      {previewInteractionActive && <button type="button" className="preview-exit" onClick={togglePreviewInteraction}>退出</button>}
      <button type="button" onClick={() => setSummaryOpen(!summaryOpen)}>关系 {count}</button>
    </div>
    {summaryOpen && <div className="relation-summary"><div className="popover-head"><strong>图稿关系</strong><button onClick={() => setSummaryOpen(false)} aria-label="关闭关系清单"><X size={16} /></button></div>{!count && <p className="empty">尚未建立关系</p>}{confirmedInteractions.map((item) => <div className="summary-item" key={item.id}><b>{item.id}　{nodeInfo[item.sourceNodeId]?.label || "触发元素"} → {nodeInfo[item.targetNodeId]?.label || "目标元素"}</b><span>{item.label} · 原生绑定箭头</span><button type="button" className="summary-remove" aria-label={`删除${item.id}交互关系`} onClick={() => removeInteraction(item.id)}>删除</button></div>)}{confirmedBindings.map((item) => { const component = componentCatalog[item.componentRefId as keyof typeof componentCatalog]; return <div className="summary-item component" key={item.id}><b>{item.id}　{item.targetLabel}</b><span>{component.library} · {component.component} · {component.variant}</span><button type="button" className="summary-remove" aria-label={`删除${item.id}组件关联`} onClick={() => removeComponentBinding(item.id)}>删除</button></div>; })}<button className="copy" onClick={() => navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))}>复制模型可读数据</button></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
