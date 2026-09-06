import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { Cable, Link2, Workflow, X } from "lucide-react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { StorybookSidebar } from "../../src/excalidraw/index.js";
import { StorybookSidebarTrigger } from "../../src/excalidraw/ui.js";
import type { StorybookStory } from "../../src/types.js";
import "@excalidraw/excalidraw/index.css";
import "../../src/carbon.scss";
import "../../src/styles.css";
import "./excalidraw-prototype.css";

type Mode = "select" | "interaction" | "component";
type Interaction = { id: string; sourceNodeId: string; targetNodeId: string; event: string; action: string; arrowElementId: string; label: string };
type ComponentBinding = { id: string; targetNodeId: string; componentRefId: string; connectorElementId: string; cardNodeId: string; usageIntent: string; customization: string };

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
  { id: "node-main-screen", type: "rectangle", x: 160, y: 280, width: 760, height: 470, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, customData: { dockyardNodeId: "node-main-screen", role: "screen" } },
  { id: "main-title", type: "text", x: 185, y: 302, text: "患者信息管理", fontSize: 22, strokeColor: "#20242a" },
  { id: "main-top-line", type: "line", x: 160, y: 340, width: 760, height: 0, points: [[0, 0], [760, 0]], roughness: 0 },
  { id: "main-side-line", type: "line", x: 370, y: 340, width: 0, height: 410, points: [[0, 0], [0, 410]], roughness: 0 },
  { id: "node-nav-followup", type: "rectangle", x: 610, y: 294, width: 96, height: 36, strokeColor: "transparent", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-nav-followup"], customData: { dockyardNodeId: "node-nav-followup", role: "trigger" } },
  { id: "nav-followup-text", type: "text", x: 624, y: 302, text: "回访⌄", fontSize: 17, groupIds: ["group-nav-followup"] },
  { id: "node-nav-system", type: "rectangle", x: 726, y: 294, width: 122, height: 36, strokeColor: "transparent", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-nav-system"], customData: { dockyardNodeId: "node-nav-system", role: "trigger" } },
  { id: "nav-system-text", type: "text", x: 739, y: 302, text: "系统管理", fontSize: 17, groupIds: ["group-nav-system"] },
  { id: "patient-list-title", type: "text", x: 188, y: 370, text: "患者列表", fontSize: 18 },
  { id: "node-search-slot", type: "rectangle", x: 188, y: 414, width: 154, height: 46, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-search-slot"], customData: { dockyardNodeId: "node-search-slot", role: "component-slot" } },
  { id: "search-text", type: "text", x: 204, y: 427, text: "搜索患者", fontSize: 15, strokeColor: "#69707c", groupIds: ["group-search-slot"] },
  ...[0, 1, 2, 3].flatMap((index) => [
    { id: `patient-box-${index}`, type: "rectangle", x: 190, y: 495 + index * 54, width: 22, height: 22, roughness: 0 },
    { id: `patient-text-${index}`, type: "text", x: 232, y: 496 + index * 54, text: `患者 ${index + 1}`, fontSize: 15 },
  ]),
  { id: "detail-tabs", type: "text", x: 405, y: 372, text: "档案详情　　病历记录　　回访任务", fontSize: 17 },
  { id: "detail-body", type: "rectangle", x: 405, y: 414, width: 480, height: 280, roughness: 0 },
  { id: "detail-title", type: "text", x: 548, y: 525, text: "当前回访工作区", fontSize: 25 },
  { id: "detail-note", type: "text", x: 568, y: 568, text: "页面主体保持不变", fontSize: 15, strokeColor: "#69707c" },
  { id: "node-system-screen", type: "rectangle", x: 965, y: 90, width: 300, height: 160, strokeColor: "#343a40", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: ["group-system-screen"], customData: { dockyardNodeId: "node-system-screen", role: "screen" } },
  { id: "system-title", type: "text", x: 1054, y: 142, text: "系统管理", fontSize: 23, groupIds: ["group-system-screen"] },
  { id: "system-note", type: "text", x: 1025, y: 188, text: "权限 / 配置 / 日志", fontSize: 16, strokeColor: "#69707c", groupIds: ["group-system-screen"] },
];

type Geometry = { x: number; y: number; width: number; height: number };

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

function relationSkeleton(interactions: Interaction[], bindings: ComponentBinding[]) {
  const interactionElements = interactions.map((item) => {
    const geometry = boundArrowGeometry(baseGeometry[item.sourceNodeId], baseGeometry[item.targetNodeId]);
    return {
      id: item.arrowElementId, type: "arrow", ...geometry,
      start: { id: item.sourceNodeId, type: "rectangle" }, end: { id: item.targetNodeId, type: "rectangle" },
      label: { text: `${item.id}　${item.label}`, fontSize: 14 }, strokeColor: "#343a40", roughness: 0, endArrowhead: "arrow",
      customData: { dockyardRelationId: item.id, relationType: "interaction" },
    };
  });
  const componentElements = bindings.flatMap((item, index) => {
    const component = componentCatalog[item.componentRefId as keyof typeof componentCatalog];
    const y = 355 + index * 190;
    const cardGeometry = { x: 990, y, width: 275, height: 142 };
    const connectorGeometry = boundArrowGeometry(baseGeometry[item.targetNodeId], cardGeometry);
    return [
      { id: item.cardNodeId, type: "rectangle", ...cardGeometry, strokeColor: "#635bff", backgroundColor: "#ffffff", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`], customData: { dockyardNodeId: item.cardNodeId, role: "component-reference", componentRefId: item.componentRefId } },
      { id: `${item.id}-badge`, type: "rectangle", x: 1008, y: y + 18, width: 45, height: 26, strokeColor: "#635bff", backgroundColor: "#e9e7ff", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`] },
      { id: `${item.id}-badge-text`, type: "text", x: 1020, y: y + 23, text: item.id, fontSize: 14, strokeColor: "#4b43dc", groupIds: [`group-${item.id}`] },
      { id: `${item.id}-library`, type: "text", x: 1067, y: y + 22, text: component.library, fontSize: 15, groupIds: [`group-${item.id}`] },
      { id: `${item.id}-preview`, type: "rectangle", x: 1008, y: y + 58, width: 238, height: 42, strokeColor: "#9aa1ad", backgroundColor: "#f8f9fa", fillStyle: "solid", roughness: 0, groupIds: [`group-${item.id}`] },
      { id: `${item.id}-preview-text`, type: "text", x: 1022, y: y + 69, text: component.summary, fontSize: 14, strokeColor: "#69707c", groupIds: [`group-${item.id}`] },
      { id: `${item.id}-name`, type: "text", x: 1008, y: y + 112, text: `${component.component} · ${component.variant}`, fontSize: 14, groupIds: [`group-${item.id}`] },
      { id: item.connectorElementId, type: "arrow", ...connectorGeometry, start: { id: item.targetNodeId, type: "rectangle" }, end: { id: item.cardNodeId, type: "rectangle" }, label: { text: `${item.id}　使用组件`, fontSize: 14 }, strokeColor: "#635bff", strokeStyle: "dashed", roughness: 0, startArrowhead: null, endArrowhead: null, customData: { dockyardRelationId: item.id, relationType: "component" } },
    ];
  });
  return [...interactionElements, ...componentElements];
}

function buildElements(interactions: Interaction[], bindings: ComponentBinding[]) {
  return convertToExcalidrawElements([...baseSkeleton, ...relationSkeleton(interactions, bindings)] as any, { regenerateIds: false });
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
  if (!host) return null;
  return createPortal(<>
    <label className="ToolIcon Shape" title="添加交互关系"><input type="radio" name="editor-current-shape" className="ToolIcon_type_radio ToolIcon_size_medium" aria-label="添加交互关系" checked={mode === "interaction"} onChange={() => onMode("interaction")} /><span className="ToolIcon__icon"><Workflow size={20} /></span></label>
    <label className="ToolIcon Shape" title="关联组件"><input type="radio" name="editor-current-shape" className="ToolIcon_type_radio ToolIcon_size_medium" aria-label="关联组件" checked={mode === "component"} onChange={() => onMode("component")} /><span className="ToolIcon__icon"><Cable size={20} /></span></label>
  </>, host);
}

function SidebarRelationAction({ targetNodeId, story, onLink }: { targetNodeId: string | null; story: StorybookStory | null; onLink: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    let mounted: HTMLElement | null = null;
    const install = () => {
      const preview = document.querySelector<HTMLElement>(".storybook-panel-body .storybook-preview");
      if (!preview) { setHost(null); return; }
      const existing = preview.parentElement?.querySelector<HTMLElement>("[data-prototype-relation-action]");
      if (existing) { mounted = existing; setHost(existing); return; }
      const node = document.createElement("div");
      node.dataset.prototypeRelationAction = "";
      preview.before(node);
      mounted = node;
      setHost(node);
    };
    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mounted?.remove(); };
  }, []);
  if (!host) return null;
  return createPortal(<div className="existing-sidebar-relation">
    <div><small>组件关联</small><strong>{targetNodeId ? nodeInfo[targetNodeId].label : "先在画板选择关联位置"}</strong><span>{story ? `${story.name} · 已选中` : "再从上方目录选择组件"}</span></div>
    <button disabled={!targetNodeId || !story} onClick={onLink}><Link2 size={15} />建立关联</button>
  </div>, host);
}

function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [mode, setMode] = useState<Mode>("select"); const modeRef = useRef(mode);
  const [phase, setPhase] = useState("idle"); const phaseRef = useRef(phase);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null); const pendingRef = useRef<string | null>(null);
  const [eventType, setEventType] = useState("click"); const eventRef = useRef(eventType);
  const [actionType, setActionType] = useState("navigate"); const actionRef = useRef(actionType);
  const [interactions, setInteractions] = useState<Interaction[]>([]); const interactionsRef = useRef(interactions);
  const [bindings, setBindings] = useState<ComponentBinding[]>([]); const bindingsRef = useRef(bindings);
  const [message, setMessage] = useState("选择画板工具开始体验");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<StorybookStory | null>(null);
  const lastSelection = useRef("");

  const syncMode = (next: Mode) => {
    modeRef.current = next; setMode(next); pendingRef.current = null; setPendingNodeId(null); lastSelection.current = "";
    const nextPhase = next === "interaction" ? "source" : next === "component" ? "slot" : "idle"; phaseRef.current = nextPhase; setPhase(nextPhase);
    setMessage(next === "interaction" ? "先选择交互触发元素" : next === "component" ? "先选择图稿中的组件使用位置" : "选择模式");
    api?.updateScene({ appState: { selectedElementIds: {}, activeTool: { ...api.getAppState().activeTool, type: "selection", customType: null } } as any });
  };

  const refreshScene = (nextInteractions: Interaction[], nextBindings: ComponentBinding[]) => {
    const elements = buildElements(nextInteractions, nextBindings); api?.updateScene({ elements });
  };

  const chooseComponent = (componentRefId: string) => {
    const targetNodeId = pendingRef.current; if (!targetNodeId) return;
    const existing = bindingsRef.current.find((item) => item.targetNodeId === targetNodeId);
    const id = existing?.id || `C${bindingsRef.current.length + 1}`;
    const binding = { id, targetNodeId, componentRefId, connectorElementId: `component-link-${id}`, cardNodeId: `component-card-${id}`, usageIntent: "在该位置使用所选组件", customization: "开发时根据布局适配，不进行非等比缩放" };
    const next = existing ? bindingsRef.current.map((item) => item.id === id ? binding : item) : [...bindingsRef.current, binding];
    bindingsRef.current = next; setBindings(next); refreshScene(interactionsRef.current, next); syncMode("select"); setMessage(`${id} 已建立：虚线连接图稿位置与组件参考卡`);
  };

  const onChange = useCallback((elements: readonly any[], appState: any) => {
    if (modeRef.current === "select") return;
    const selected = Object.keys(appState.selectedElementIds || {}).filter((id) => appState.selectedElementIds[id]);
    const nodeId = selected.find((id) => nodeInfo[id]); if (!nodeId || nodeId === lastSelection.current) return; lastSelection.current = nodeId;
    if (modeRef.current === "interaction") {
      if (phaseRef.current === "source") { pendingRef.current = nodeId; setPendingNodeId(nodeId); phaseRef.current = "target"; setPhase("target"); setMessage(`起点：${nodeInfo[nodeId].label}。请选择目标页面`); }
      else if (nodeId !== pendingRef.current) {
        const id = `I${interactionsRef.current.length + 1}`; const eventLabel = eventRef.current === "click" ? "点击" : "选择"; const actionLabel = actionRef.current === "navigate" ? "跳转" : "切换";
        const next = [...interactionsRef.current, { id, sourceNodeId: pendingRef.current!, targetNodeId: nodeId, event: eventRef.current, action: actionRef.current, arrowElementId: `interaction-arrow-${id}`, label: `${eventLabel} · ${actionLabel}` }];
        interactionsRef.current = next; setInteractions(next); pendingRef.current = null; setPendingNodeId(null); phaseRef.current = "source"; setPhase("source"); setMessage(`${id} 已建立：箭头两端已绑定真实元素`); refreshScene(next, bindingsRef.current);
      }
    } else {
      pendingRef.current = nodeId; setPendingNodeId(nodeId); phaseRef.current = "component"; setPhase("component"); setMessage(`位置：${nodeInfo[nodeId].label}。请在原组件侧栏选择组件`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[title="打开组件 Stories"]')?.click());
    }
    setTimeout(() => { lastSelection.current = ""; api?.updateScene({ appState: { selectedElementIds: {} } as any }); }, 0);
  }, [api]);

  const exportData = useMemo(() => ({ version: 1, designNodes: Object.entries(nodeInfo).map(([id, info]) => ({ id, ...info })), interactions, componentBindings: bindings, componentRefs: Object.fromEntries(bindings.map((item) => [item.componentRefId, componentCatalog[item.componentRefId as keyof typeof componentCatalog]])) }), [interactions, bindings]);
  const count = interactions.length + bindings.length;

  useEffect(() => {
    (window as any).__dockyardRelationPrototype = {
      exportData,
      getSceneElements: () => api?.getSceneElements() ?? [],
    };
  }, [api, exportData]);

  return <div className="prototype-shell">
    <Excalidraw initialData={{ elements: buildElements([], []), appState: { viewBackgroundColor: "#ffffff", zoom: { value: 0.72 as any }, scrollX: 35, scrollY: 35 } }} excalidrawAPI={(value) => { setApi(value); requestAnimationFrame(() => value.scrollToContent(value.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.82, animate: false })); }} onChange={onChange} langCode="zh-CN" theme="light" renderTopRightUI={() => <StorybookSidebarTrigger />} UIOptions={{ dockedSidebarBreakpoint: 0, canvasActions: { loadScene: false, saveToActiveFile: false } }}>
      <ToolbarTools mode={mode} onMode={syncMode} />
      <StorybookSidebar
        selection={selectedStory ? { sourceId: selectedStory.sourceId, storyId: selectedStory.id, storyName: selectedStory.name, storyUrl: selectedStory.storyUrl } : undefined}
        onSelectionChange={setSelectedStory}
        onStoryAdd={(story) => setMessage(`${story.name} 已通过原加号流程加入画板`)}
        excalidrawAPI={api}
      />
      <SidebarRelationAction targetNodeId={pendingNodeId} story={selectedStory} onLink={() => selectedStory && chooseComponent(selectedStory.id)} />
    </Excalidraw>
    {(mode === "interaction" || (mode === "component" && phase !== "component")) && <div className="relation-popover">
      <div className="popover-head"><strong>{mode === "interaction" ? "添加交互" : "关联组件"}</strong><button onClick={() => syncMode("select")} aria-label="关闭关系工具"><X size={16} /></button></div>
      {mode === "interaction" ? <><div className="selectors"><label>触发<select value={eventType} onChange={(e) => { eventRef.current = e.target.value; setEventType(e.target.value); }}><option value="click">点击</option><option value="change">选择</option></select></label><label>行为<select value={actionType} onChange={(e) => { actionRef.current = e.target.value; setActionType(e.target.value); }}><option value="navigate">跳转</option><option value="switch">切换</option></select></label></div><p>{phase === "target" ? `起点：${nodeInfo[pendingNodeId!]?.label}` : "第一步选择触发元素，第二步选择目标页面"}</p></> : <p>先选择图稿中需要使用组件的位置，随后打开组件侧栏。</p>}
    </div>}
    <div className="relation-status"><span>{message}</span><button onClick={() => setSummaryOpen(!summaryOpen)}>关系 {count}</button></div>
    {summaryOpen && <div className="relation-summary"><div className="popover-head"><strong>图稿关系</strong><button onClick={() => setSummaryOpen(false)} aria-label="关闭关系清单"><X size={16} /></button></div>{!count && <p className="empty">尚未建立关系</p>}{interactions.map((item) => <div className="summary-item" key={item.id}><b>{item.id}　{nodeInfo[item.sourceNodeId].label} → {nodeInfo[item.targetNodeId].label}</b><span>{item.label} · 原生绑定箭头</span></div>)}{bindings.map((item) => { const component = componentCatalog[item.componentRefId as keyof typeof componentCatalog]; return <div className="summary-item component" key={item.id}><b>{item.id}　{nodeInfo[item.targetNodeId].label}</b><span>{component.library} · {component.component} · {component.variant}</span></div>; })}<button className="copy" onClick={() => navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))}>复制模型可读数据</button></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
