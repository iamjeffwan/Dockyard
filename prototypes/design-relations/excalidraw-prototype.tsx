import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { Brush, Cable, Eye, Link2, Search, Workflow, X } from "lucide-react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
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
  "shadcn-input": { library: "shadcn/ui", component: "Input", variant: "default", summary: "简洁文本输入", category: "表单 / 输入", keywords: "input 输入 搜索" },
  "carbon-search": { library: "Carbon", component: "Search", variant: "small", summary: "带搜索图标的输入框", category: "表单 / 搜索", keywords: "search 搜索 input" },
  "shadcn-combobox": { library: "shadcn/ui", component: "Combobox", variant: "default", summary: "输入与选项组合", category: "表单 / 选择", keywords: "combobox 下拉 选择 搜索" },
  "carbon-dropdown": { library: "Carbon", component: "Dropdown", variant: "default", summary: "结构明确的下拉选择", category: "表单 / 选择", keywords: "dropdown 下拉 选择" },
  "shadcn-button": { library: "shadcn/ui", component: "Button", variant: "default", summary: "主要操作按钮", category: "操作 / 按钮", keywords: "button 按钮 操作" },
  "carbon-toggle": { library: "Carbon", component: "Toggle", variant: "small", summary: "布尔状态切换", category: "表单 / 开关", keywords: "toggle switch 开关" },
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

function ComponentVisual({ componentRefId, compact = false }: { componentRefId: string; compact?: boolean }) {
  if (componentRefId === "shadcn-button") return <span className="demo-button">保存患者</span>;
  if (componentRefId === "carbon-toggle") return <span className="demo-toggle"><i />启用提醒</span>;
  if (componentRefId === "carbon-dropdown" || componentRefId === "shadcn-combobox") {
    return <span className="demo-select">{componentRefId === "carbon-dropdown" ? "请选择状态" : "搜索并选择患者"}<b>⌄</b></span>;
  }
  return <span className={`demo-input${componentRefId === "carbon-search" ? " with-search" : ""}`}>
    {componentRefId === "carbon-search" && <Search size={compact ? 13 : 16} />}
    <span>{componentRefId === "carbon-search" ? "搜索患者" : "输入患者姓名或编号"}</span>
  </span>;
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
  const [componentQuery, setComponentQuery] = useState("");
  const [componentSource, setComponentSource] = useState("全部");
  const [selectedComponentRefId, setSelectedComponentRefId] = useState("shadcn-input");
  const [sketchSearchOpen, setSketchSearchOpen] = useState(false);
  const [sketchMatched, setSketchMatched] = useState(false);
  const [overlayPreviewRefId, setOverlayPreviewRefId] = useState<string | null>(null);
  const [canvasViewport, setCanvasViewport] = useState({ zoom: 1, scrollX: 0, scrollY: 0 });
  const lastSelection = useRef("");

  const syncMode = (next: Mode) => {
    modeRef.current = next; setMode(next); pendingRef.current = null; setPendingNodeId(null); lastSelection.current = "";
    setOverlayPreviewRefId(null); setSketchSearchOpen(false);
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
    const zoom = Number(appState.zoom?.value) || 1;
    setCanvasViewport((current) => current.zoom === zoom && current.scrollX === appState.scrollX && current.scrollY === appState.scrollY ? current : { zoom, scrollX: appState.scrollX || 0, scrollY: appState.scrollY || 0 });
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
    } else { pendingRef.current = nodeId; setPendingNodeId(nodeId); phaseRef.current = "component"; setPhase("component"); setMessage(`位置：${nodeInfo[nodeId].label}。侧栏已显示可选组件`); }
    setTimeout(() => { lastSelection.current = ""; api?.updateScene({ appState: { selectedElementIds: {} } as any }); }, 0);
  }, [api]);

  const exportData = useMemo(() => ({ version: 1, designNodes: Object.entries(nodeInfo).map(([id, info]) => ({ id, ...info })), interactions, componentBindings: bindings, componentRefs: Object.fromEntries(bindings.map((item) => [item.componentRefId, componentCatalog[item.componentRefId as keyof typeof componentCatalog]])) }), [interactions, bindings]);
  const count = interactions.length + bindings.length;
  const visibleComponents = Object.entries(componentCatalog).filter(([id, item]) => {
    const matchesSource = componentSource === "全部" || item.library === componentSource;
    const query = componentQuery.trim().toLowerCase();
    const matchesQuery = !query || `${item.component} ${item.summary} ${item.category} ${item.keywords}`.toLowerCase().includes(query);
    const matchesSketch = !sketchMatched || ["shadcn-input", "carbon-search", "shadcn-combobox"].includes(id);
    return matchesSource && matchesQuery && matchesSketch;
  });
  const selectedComponent = componentCatalog[selectedComponentRefId as keyof typeof componentCatalog];
  const previewTarget = pendingNodeId ? baseGeometry[pendingNodeId] : null;

  useEffect(() => {
    if (visibleComponents.length && !visibleComponents.some(([id]) => id === selectedComponentRefId)) {
      setSelectedComponentRefId(visibleComponents[0][0]);
    }
  }, [componentQuery, componentSource, selectedComponentRefId, sketchMatched, visibleComponents]);

  useEffect(() => {
    (window as any).__dockyardRelationPrototype = {
      exportData,
      getSceneElements: () => api?.getSceneElements() ?? [],
    };
  }, [api, exportData]);

  return <div className="prototype-shell">
    <Excalidraw initialData={{ elements: buildElements([], []), appState: { viewBackgroundColor: "#ffffff", zoom: { value: 0.72 as any }, scrollX: 35, scrollY: 35 } }} excalidrawAPI={(value) => { setApi(value); requestAnimationFrame(() => value.scrollToContent(value.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.82, animate: false })); }} onChange={onChange} langCode="zh-CN" theme="light" UIOptions={{ dockedSidebarBreakpoint: 0, canvasActions: { loadScene: false, saveToActiveFile: false } }}>
      <ToolbarTools mode={mode} onMode={syncMode} />
    </Excalidraw>
    {(mode === "interaction" || (mode === "component" && phase !== "component")) && <div className="relation-popover">
      <div className="popover-head"><strong>{mode === "interaction" ? "添加交互" : "关联组件"}</strong><button onClick={() => syncMode("select")} aria-label="关闭关系工具"><X size={16} /></button></div>
      {mode === "interaction" ? <><div className="selectors"><label>触发<select value={eventType} onChange={(e) => { eventRef.current = e.target.value; setEventType(e.target.value); }}><option value="click">点击</option><option value="change">选择</option></select></label><label>行为<select value={actionType} onChange={(e) => { actionRef.current = e.target.value; setActionType(e.target.value); }}><option value="navigate">跳转</option><option value="switch">切换</option></select></label></div><p>{phase === "target" ? `起点：${nodeInfo[pendingNodeId!]?.label}` : "第一步选择触发元素，第二步选择目标页面"}</p></> : <p>先选择图稿中需要使用组件的位置，随后打开组件侧栏。</p>}
    </div>}
    {mode === "component" && phase === "component" && pendingNodeId && <aside className="component-drawer" aria-label="组件选择侧栏">
      <header className="drawer-head"><div><small>正在为图稿位置选择组件</small><strong>{nodeInfo[pendingNodeId].label}</strong></div><button onClick={() => syncMode("select")} aria-label="关闭组件侧栏"><X size={18} /></button></header>
      <div className="drawer-search"><Search size={16} /><input aria-label="查找组件" placeholder="查找组件或故事" value={componentQuery} onChange={(event) => { setComponentQuery(event.target.value); setSketchMatched(false); }} /><button className={sketchSearchOpen ? "active" : ""} onClick={() => setSketchSearchOpen(!sketchSearchOpen)} title="草图检索"><Brush size={16} /></button></div>
      <div className="source-filter" aria-label="组件来源">{["全部", "shadcn/ui", "Carbon"].map((source) => <button className={componentSource === source ? "active" : ""} key={source} onClick={() => setComponentSource(source)}>{source}</button>)}</div>
      {sketchSearchOpen && <section className="sketch-search-card"><div className="sketch-selection"><span>当前画板选区</span><div><Search size={14} />搜索患者</div></div><p>沿用项目已有的草图识别能力，根据轮廓和文字寻找组件。</p><button onClick={() => { setSketchMatched(true); setComponentQuery(""); setSketchSearchOpen(false); setSelectedComponentRefId("carbon-search"); }}>使用当前选区检索</button></section>}
      {sketchMatched && <div className="match-banner"><Brush size={14} /><span>草图匹配结果 · 3 个候选</span><button onClick={() => setSketchMatched(false)}>查看全部</button></div>}
      <div className="component-results">{visibleComponents.map(([id, item]) => <button className={`component-result${selectedComponentRefId === id ? " selected" : ""}`} key={id} onClick={() => setSelectedComponentRefId(id)}><span className="result-preview"><ComponentVisual componentRefId={id} compact /></span><span className="result-copy"><b>{item.component}</b><small>{item.library} · {item.category}</small></span></button>)}{!visibleComponents.length && <p className="empty">没有匹配的组件</p>}</div>
      <section className="component-preview"><div className="preview-heading"><div><small>真实效果预览</small><strong>{selectedComponent.component} · {selectedComponent.variant}</strong></div><span>{selectedComponent.library}</span></div><div className="preview-stage"><ComponentVisual componentRefId={selectedComponentRefId} /></div><p>{selectedComponent.summary}。开发时允许按布局调整属性和样式。</p></section>
      <footer className="drawer-actions"><button className="preview-action" onClick={() => { setOverlayPreviewRefId(selectedComponentRefId); setMessage(`正在画板上预览 ${selectedComponent.component} 的真实尺寸`); }}><Eye size={16} />放到画板预览</button><button className="link-action" onClick={() => chooseComponent(selectedComponentRefId)}><Link2 size={16} />建立组件关联</button></footer>
    </aside>}
    {overlayPreviewRefId && previewTarget && <div className="canvas-component-preview" style={{ left: (previewTarget.x + canvasViewport.scrollX) * canvasViewport.zoom, top: (previewTarget.y + canvasViewport.scrollY) * canvasViewport.zoom, transform: `scale(${canvasViewport.zoom})` }}><button onClick={() => setOverlayPreviewRefId(null)} aria-label="关闭画板组件预览"><X size={13} /></button><ComponentVisual componentRefId={overlayPreviewRefId} /></div>}
    <div className="relation-status"><span>{message}</span><button onClick={() => setSummaryOpen(!summaryOpen)}>关系 {count}</button></div>
    {summaryOpen && <div className="relation-summary"><div className="popover-head"><strong>图稿关系</strong><button onClick={() => setSummaryOpen(false)} aria-label="关闭关系清单"><X size={16} /></button></div>{!count && <p className="empty">尚未建立关系</p>}{interactions.map((item) => <div className="summary-item" key={item.id}><b>{item.id}　{nodeInfo[item.sourceNodeId].label} → {nodeInfo[item.targetNodeId].label}</b><span>{item.label} · 原生绑定箭头</span></div>)}{bindings.map((item) => { const component = componentCatalog[item.componentRefId as keyof typeof componentCatalog]; return <div className="summary-item component" key={item.id}><b>{item.id}　{nodeInfo[item.targetNodeId].label}</b><span>{component.library} · {component.component} · {component.variant}</span></div>; })}<button className="copy" onClick={() => navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))}>复制模型可读数据</button></div>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
