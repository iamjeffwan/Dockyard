import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, Sidebar } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";

const STORY_ORIGIN = "https://master--5ccbc373887ca40020446347.chromatic.com";
const storyUrl = (storyId, args = "") => `${STORY_ORIGIN}/iframe.html?id=${storyId}${args ? `&args=${args}` : ""}&viewMode=story&shortcuts=false&singleStory=true`;
const BASE_WIDTH = 320;
const BASE_HEIGHT = 160;

const initialDocument = {
  version: 1,
  scene: { elements: [], appState: { viewBackgroundColor: "#f8fafc" } },
  components: [
    { id: "instance-button", componentId: "chromatic.sds.button.basic", storyUrl: storyUrl("button--basic", "size:medium;containsIcon:false;appearance:primary"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 330, y: 130, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-input", componentId: "chromatic.sds.input.playground", storyUrl: storyUrl("forms-input--template", "value:!undefined"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 170, y: 330, width: 420, height: 180, intrinsicWidth: 420, intrinsicHeight: 180, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-select", componentId: "chromatic.sds.select.playground", storyUrl: storyUrl("forms-select--template", "value:!undefined"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 540, y: 330, width: 420, height: 180, intrinsicWidth: 420, intrinsicHeight: 180, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-checkbox", componentId: "chromatic.sds.checkbox.playground", storyUrl: storyUrl("forms-checkbox--template"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 140, y: 540, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-radio", componentId: "chromatic.sds.radio.playground", storyUrl: storyUrl("forms-radio--template"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 420, y: 540, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-toggle", componentId: "chromatic.sds.button-toggle.tab", storyUrl: storyUrl("buttontoggle--tab"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 700, y: 540, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-tooltip", componentId: "chromatic.sds.tooltip.click", storyUrl: storyUrl("tooltip-withtooltip--simple-click"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 180, y: 520, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
    { id: "instance-modal", componentId: "chromatic.sds.modal.closed", storyUrl: storyUrl("modal-withmodal--starts-closed"), source: "Chromatic / Storybook Design System", loadStatus: "loading", postMessageState: "not-tested", x: 560, y: 520, width: 320, height: 160, intrinsicWidth: 320, intrinsicHeight: 160, visualPadding: 0, boundsSource: "fixed-experiment", rotation: 0 },
  ],
  selectedPreviewId: "instance-button",
  selectedRemoteStory: null,
  previewSelections: {
    "instance-button": "base",
    "instance-input": "base",
    "instance-select": "base",
    "instance-checkbox": "playground",
    "instance-radio": "playground",
    "instance-toggle": "base",
    "instance-tooltip": "closed",
    "instance-modal": "closed",
  },
};

const PREVIEW_STATES = {
  "chromatic.sds.button.basic": [
    ["base", "基础", "button--basic", "size:medium;containsIcon:false;appearance:primary"],
    ["disabled", "禁用", "button--disabled"],
    ["loading", "加载中", "button--loading"],
  ],
  "chromatic.sds.input.playground": [
    ["base", "基础", "forms-input--template", "value:!undefined"],
    ["pill", "圆角", "forms-input--pill"],
    ["code", "代码输入", "forms-input--code"],
  ],
  "chromatic.sds.select.playground": [["base", "基础", "forms-select--template", "value:!undefined"]],
  "chromatic.sds.checkbox.playground": [
    ["unchecked", "未选中", "forms-checkbox--unchecked"],
    ["checked", "已选中", "forms-checkbox--checked"],
    ["playground", "可交互", "forms-checkbox--template"],
  ],
  "chromatic.sds.radio.playground": [
    ["unchecked", "未选中", "forms-radio--unchecked"],
    ["checked", "已选中", "forms-radio--checked"],
    ["playground", "可交互", "forms-radio--template"],
  ],
  "chromatic.sds.button-toggle.tab": [["base", "标签页", "buttontoggle--tab"]],
  "chromatic.sds.tooltip.click": [
    ["closed", "关闭", "tooltip-withtooltip--simple-click"],
    ["open", "打开", "tooltip-withtooltip--simple-click-start-open"],
  ],
  "chromatic.sds.modal.closed": [
    ["closed", "关闭", "modal-withmodal--starts-closed"],
    ["open", "打开", "modal-withmodal--starts-open"],
  ],
};

function PreviewPanel({ components, selectedId, selections, onSelectComponent, onSelectState, selectedRemoteStory, onSelectRemoteStory, onAddStory }) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [catalogStatus, setCatalogStatus] = useState("loading");
  const [catalogGroup, setCatalogGroup] = useState("");
  useEffect(() => {
    const indexRequest = window.prototypeElectron?.loadStoryIndex?.() || fetch(`${STORY_ORIGIN}/index.json`).then((response) => response.json());
    indexRequest.then((payload) => {
      const entries = Object.values(payload.entries || payload.stories || {});
      const stories = entries.filter((entry) => entry.type !== "docs" && entry.id && entry.title).map((entry) => ({ id: entry.id, title: entry.title, name: entry.name }));
      const groups = [...new Set(stories.map((story) => story.title))].sort();
      setCatalog(groups.map((title) => ({ title, stories: stories.filter((story) => story.title === title) })));
      setCatalogGroup(groups[0] || "");
      setCatalogStatus("ready");
    }).catch(() => setCatalogStatus("unavailable"));
  }, []);
  const selected = components.find((item) => item.id === selectedId) || components[0];
  if (!selected) return null;
  const states = PREVIEW_STATES[selected.componentId] || [];
  const selectedStateId = selections[selected.id] || states[0]?.[0];
  const selectedState = states.find(([id]) => id === selectedStateId) || states[0];
  const activeGroup = catalog.find((group) => group.title === catalogGroup) || catalog[0];
  const filteredGroups = catalog.filter((group) => group.title.toLowerCase().includes(query.toLowerCase()));
  const previewUrl = selectedRemoteStory ? storyUrl(selectedRemoteStory.id) : selectedState ? storyUrl(selectedState[2], selectedState[3]) : selected.storyUrl;
  return <Sidebar name="dockyard-preview" docked={false}>
    <Sidebar.Tabs>
      <Sidebar.Tab tab="preview">
        <Sidebar.Header>
          <div className="storybook-brand"><span className="storybook-mark">S</span><strong>Storybook</strong><span className="preview-badge">远程</span></div>
        </Sidebar.Header>
        <div className="preview-content">
          <label className="storybook-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="查找组件" /></label>
          <div className="preview-library">
            <div className="preview-section-title">远程组件目录 {catalogStatus === "ready" ? `（${catalog.length} 组）` : ""}</div>
            {catalogStatus === "loading" && <div className="preview-empty">正在读取 index.json…</div>}
            {catalogStatus === "unavailable" && <div className="preview-empty">远程目录暂不可用，使用实验清单</div>}
            {(catalogStatus === "ready" ? filteredGroups : components.map((item) => ({ title: item.componentId, stories: [] }))).slice(0, 80).map((group) => <button key={group.title} className={group.title === catalogGroup ? "is-active" : ""} onClick={() => { setCatalogGroup(group.title); if (group.stories[0]) onSelectRemoteStory(group.stories[0]); }}><span className="story-icon">▦</span>{group.title}</button>)}
          </div>
          <div className="preview-state-tabs">
            <div className="preview-section-title">故事状态 {activeGroup ? `（${activeGroup.stories.length} 个）` : ""}</div>
            {(activeGroup?.stories || []).slice(0, 40).map((story) => <button key={story.id} draggable className={selectedRemoteStory?.id === story.id ? "is-active" : ""} onClick={() => onSelectRemoteStory(story)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dockyard-story", JSON.stringify(story)); }}><span className="story-icon">▱</span>{story.name}</button>)}
            {(!activeGroup || activeGroup.stories.length === 0) && states.map(([id, label]) => <button key={id} className={id === selectedStateId ? "is-active" : ""} onClick={() => { onSelectRemoteStory(null); onSelectState(selected.id, id); }}><span className="story-icon">▱</span>{label}</button>)}
          </div>
          <div className="preview-frame-wrap">
            <iframe key={previewUrl} title={`预览 ${selected.componentId}`} src={previewUrl} />
          </div>
          <button className="add-story-button" disabled={!selectedRemoteStory} onClick={() => selectedRemoteStory && onAddStory(selectedRemoteStory)}>添加到画板</button>
          <div className="preview-selection"><strong>{selectedRemoteStory?.title || selected.componentId}</strong><span>当前故事：{selectedRemoteStory?.name || selectedState?.[1] || "基础"}</span><span>画板状态：基础形态</span></div>
        </div>
      </Sidebar.Tab>
    </Sidebar.Tabs>
  </Sidebar>;
}

function ComponentOverlay({ component, viewport, interactive, componentInteraction, onChange, onBoundsMeasured, onLoadState, onElectronMeasured, onPostMessageState }) {
  const interaction = useRef(null);
  const iframeRef = useRef(null);
  const messageProbe = useRef(null);
  const [selected, setSelected] = useState(false);
  const intrinsicWidth = component.intrinsicWidth ?? BASE_WIDTH;
  const intrinsicHeight = component.intrinsicHeight ?? BASE_HEIGHT;
  const frameViewportWidth = component.frameViewportWidth ?? intrinsicWidth;
  const frameViewportHeight = component.frameViewportHeight ?? intrinsicHeight;
  const contentOffsetX = component.contentOffsetX ?? 0;
  const contentOffsetY = component.contentOffsetY ?? 0;
  const scaleX = component.width * viewport.zoom / intrinsicWidth;
  const scaleY = component.height * viewport.zoom / intrinsicHeight;

  useEffect(() => {
    const receiveBounds = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "dockyard:component-bounds") return;
      const width = Number(event.data.width);
      const height = Number(event.data.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      messageProbe.current = null;
      onPostMessageState("responded");
      onBoundsMeasured({ width, height, visualPadding: Number(event.data.visualPadding) || 0 });
    };
    window.addEventListener("message", receiveBounds);
    return () => window.removeEventListener("message", receiveBounds);
  }, [onBoundsMeasured]);

  const startInteraction = (kind, event) => {
    if (!interactive) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const overlayRect = event.currentTarget.closest(".component-overlay")?.getBoundingClientRect();
    const rotationCenter = overlayRect ? { x: overlayRect.left + overlayRect.width / 2, y: overlayRect.top + overlayRect.height / 2 } : null;
    const startAngle = rotationCenter ? Math.atan2(event.clientY - rotationCenter.y, event.clientX - rotationCenter.x) : 0;
    interaction.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initial: { ...component }, rotationCenter, startAngle };
    setSelected(true);
  };
  const moveInteraction = (event) => {
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = (event.clientX - current.startX) / viewport.zoom;
    const dy = (event.clientY - current.startY) / viewport.zoom;
    const next = { ...current.initial };
    if (current.kind === "move") { next.x += dx; next.y += dy; }
    if (current.kind === "rotate" && current.rotationCenter) {
      const angle = Math.atan2(event.clientY - current.rotationCenter.y, event.clientX - current.rotationCenter.x);
      let rotation = current.initial.rotation + angle - current.startAngle;
      if (event.shiftKey) rotation = Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12);
      next.rotation = rotation;
    }
    if (current.kind !== "move" && current.kind !== "rotate" && current.kind.includes("e")) next.width = Math.max(48, current.initial.width + dx);
    if (current.kind !== "move" && current.kind !== "rotate" && current.kind.includes("s")) next.height = Math.max(36, current.initial.height + dy);
    if (current.kind !== "move" && current.kind !== "rotate" && current.kind.includes("w")) { next.width = Math.max(48, current.initial.width - dx); next.x = current.initial.x + dx; }
    if (current.kind !== "move" && current.kind !== "rotate" && current.kind.includes("n")) { next.height = Math.max(36, current.initial.height - dy); next.y = current.initial.y + dy; }
    if (event.shiftKey && current.kind !== "move" && current.kind !== "rotate") {
      const ratio = current.initial.width / current.initial.height;
      const targetHeight = next.width / ratio;
      const targetWidth = next.height * ratio;
      if (Math.abs(dx) >= Math.abs(dy)) next.height = Math.max(36, targetHeight);
      else next.width = Math.max(48, targetWidth);
      if (current.kind.includes("n")) next.y = current.initial.y + current.initial.height - next.height;
      if (current.kind.includes("w")) next.x = current.initial.x + current.initial.width - next.width;
    }
    onChange(next);
  };
  const endInteraction = (event) => {
    if (interaction.current?.pointerId === event.pointerId) interaction.current = null;
    setSelected(true);
  };

  return <div
    className={`component-overlay ${interactive ? "is-interactive" : ""} ${componentInteraction ? "is-component-interactive" : ""} ${selected ? "is-selected" : ""}`}
    style={{ left: `${(component.x + viewport.scrollX) * viewport.zoom}px`, top: `${(component.y + viewport.scrollY) * viewport.zoom}px`, width: `${component.width * viewport.zoom}px`, height: `${component.height * viewport.zoom}px`, transform: `rotate(${component.rotation}rad)` }}
    onPointerDown={(event) => startInteraction("move", event)}
    onPointerMove={moveInteraction}
    onPointerUp={endInteraction}
  >
    <div className="component-scaler" style={{ width: `${intrinsicWidth}px`, height: `${intrinsicHeight}px`, transform: `scale(${scaleX}, ${scaleY})` }}>
      <iframe
        ref={iframeRef}
        title={component.componentId}
        src={component.storyUrl}
        style={{ width: `${frameViewportWidth}px`, height: `${frameViewportHeight}px`, transform: `translate(${-contentOffsetX}px, ${-contentOffsetY}px)` }}
        onLoad={(event) => {
          onLoadState("iframe-loaded");
          const probeId = `${component.id}-${Date.now()}`;
          messageProbe.current = probeId;
          onPostMessageState("sent");
          event.currentTarget.contentWindow?.postMessage({ type: "dockyard:measure-component" }, "*");
          window.setTimeout(() => {
            if (messageProbe.current === probeId) {
              messageProbe.current = null;
              onPostMessageState("no-response");
            }
          }, 1200);
          if (window.prototypeElectron?.measureRemoteStory) {
            window.prototypeElectron.measureRemoteStory(component.storyUrl)
              .then(onElectronMeasured)
              .catch((error) => onLoadState(`electron-measure-error: ${error.message}`));
          }
        }}
        onError={() => onLoadState("iframe-error")}
      />
    </div>
    <div className="component-label">{component.componentId}</div>
    {interactive && selected && <span className="rotate-handle" onPointerDown={(event) => { event.stopPropagation(); startInteraction("rotate", event); }} />}
    {interactive && selected && ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((kind) => <span key={kind} className={`resize-handle handle-${kind}`} onPointerDown={(event) => { event.stopPropagation(); startInteraction(kind, event); }} />)}
  </div>;
}

function App() {
  const [api, setApi] = useState(null);
  const [doc, setDoc] = useState(initialDocument);
  const [viewport, setViewport] = useState({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [altPressed, setAltPressed] = useState(false);
  const [componentInteraction, setComponentInteraction] = useState(false);
  const fileInput = useRef(null);
  const initialData = useMemo(() => ({ elements: doc.scene.elements, appState: doc.scene.appState }), []);
  const previewSelections = doc.previewSelections || {};
  const selectedPreviewId = doc.selectedPreviewId || doc.components[0]?.id;
  const selectedRemoteStory = doc.selectedRemoteStory || null;

  useEffect(() => {
    const down = (event) => { if (event.key === "Alt") { event.preventDefault(); setAltPressed(true); } };
    const up = (event) => { if (event.key === "Alt") setAltPressed(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const updateComponent = useCallback((next) => setDoc((current) => ({ ...current, components: current.components.map((item) => item.id === next.id ? next : item) })), []);
  const updateLoadState = useCallback((componentId, loadStatus) => setDoc((current) => ({
    ...current,
    components: current.components.map((item) => item.id === componentId ? { ...item, loadStatus } : item),
  })), []);
  const updatePostMessageState = useCallback((componentId, postMessageState) => setDoc((current) => ({
    ...current,
    components: current.components.map((item) => item.id === componentId ? { ...item, postMessageState } : item),
  })), []);
  const selectPreviewComponent = useCallback((id) => setDoc((current) => ({ ...current, selectedPreviewId: id })), []);
  const selectPreviewState = useCallback((componentId, stateId) => setDoc((current) => ({
    ...current,
    selectedPreviewId: componentId,
    previewSelections: { ...(current.previewSelections || {}), [componentId]: stateId },
  })), []);
  const selectRemoteStory = useCallback((story) => setDoc((current) => ({ ...current, selectedRemoteStory: story ? { id: story.id, title: story.title, name: story.name } : null })), []);
  const addRemoteStory = useCallback((story, scenePoint) => setDoc((current) => {
    const width = 320;
    const height = 160;
    const x = scenePoint ? scenePoint.x - width / 2 : (window.innerWidth / 2) / viewport.zoom - viewport.scrollX - width / 2;
    const y = scenePoint ? scenePoint.y - height / 2 : (window.innerHeight / 2) / viewport.zoom - viewport.scrollY - height / 2;
    const instance = {
      id: `instance-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      componentId: `remote.${story.title.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`,
      storyId: story.id,
      storyName: story.name,
      storyTitle: story.title,
      storyUrl: storyUrl(story.id),
      source: "Chromatic / Storybook Design System",
      loadStatus: "loading",
      postMessageState: "not-tested",
      x, y, width, height,
      intrinsicWidth: width,
      intrinsicHeight: height,
      visualPadding: 0,
      boundsSource: "fixed-experiment",
      rotation: 0,
    };
    return { ...current, components: [...current.components, instance], selectedPreviewId: instance.id, selectedRemoteStory: { id: story.id, title: story.title, name: story.name } };
  }), [viewport]);
  const updateMeasuredBounds = useCallback((componentId, { width, height, visualPadding }) => setDoc((current) => {
    const existing = current.components.find((item) => item.id === componentId);
    if (!existing) return current;
    const oldIntrinsicWidth = existing.intrinsicWidth ?? BASE_WIDTH;
    const oldIntrinsicHeight = existing.intrinsicHeight ?? BASE_HEIGHT;
    if (Math.abs(oldIntrinsicWidth - width) < 0.5 && Math.abs(oldIntrinsicHeight - height) < 0.5 && existing.boundsSource === "story-dom") return current;

    const scaleX = existing.width / oldIntrinsicWidth;
    const scaleY = existing.height / oldIntrinsicHeight;
    const nextWidth = width * scaleX;
    const nextHeight = height * scaleY;
    const measured = {
      ...existing,
      x: existing.x + (existing.width - nextWidth) / 2,
      y: existing.y + (existing.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
      intrinsicWidth: width,
      intrinsicHeight: height,
      visualPadding,
      boundsSource: "story-dom",
    };
    return { ...current, components: current.components.map((item) => item.id === componentId ? measured : item) };
  }), []);
  const updateElectronBounds = useCallback((componentId, measurement) => setDoc((current) => {
    const existing = current.components.find((item) => item.id === componentId);
    if (!existing) return current;
    const measured = {
      ...existing,
      x: existing.x + (existing.width - measurement.width) / 2,
      y: existing.y + (existing.height - measurement.height) / 2,
      width: measurement.width,
      height: measurement.height,
      intrinsicWidth: measurement.width,
      intrinsicHeight: measurement.height,
      frameViewportWidth: measurement.viewportWidth,
      frameViewportHeight: measurement.viewportHeight,
      contentOffsetX: measurement.x,
      contentOffsetY: measurement.y,
      boundsSource: "electron-web-frame-main",
      measuredElement: `${measurement.tag}${measurement.className ? `.${measurement.className.split(" ").join(".")}` : ""}`,
      measuredViewport: `${measurement.viewportWidth} × ${measurement.viewportHeight}`,
      loadStatus: "electron-measured",
    };
    return { ...current, components: current.components.map((item) => item.id === componentId ? measured : item) };
  }), []);
  const saveJson = () => {
    const blob = new Blob([JSON.stringify({ ...doc, scene: { ...doc.scene, appState: { ...doc.scene.appState, ...viewport } } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "dockyard-component-overlay.json"; link.click(); URL.revokeObjectURL(url);
  };
  const loadJson = (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { try { const next = JSON.parse(reader.result); setDoc(next); setViewport({ scrollX: next.scene?.appState?.scrollX ?? 0, scrollY: next.scene?.appState?.scrollY ?? 0, zoom: next.scene?.appState?.zoom ?? 1 }); api?.updateScene({ elements: next.scene?.elements ?? [] }); } catch { alert("JSON 文件无法读取"); } }; reader.readAsText(file);
  };

  return <div className="prototype-shell">
    <div className="excalidraw-host" onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-dockyard-story")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={(event) => {
      const payload = event.dataTransfer.getData("application/x-dockyard-story");
      if (!payload) return;
      event.preventDefault();
      try {
        const story = JSON.parse(payload);
        addRemoteStory(story, { x: event.clientX / viewport.zoom - viewport.scrollX, y: event.clientY / viewport.zoom - viewport.scrollY });
      } catch { /* 忽略无效的拖放数据 */ }
    }}>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        renderTopRightUI={() => <Sidebar.Trigger name="dockyard-preview" tab="preview" title="打开组件预览">组件预览</Sidebar.Trigger>}
        onChange={(elements) => setDoc((current) => {
          if (elements.length === current.scene.elements.length && elements.every((element, index) => element === current.scene.elements[index])) return current;
          return { ...current, scene: { ...current.scene, elements } };
        })}
        onScrollChange={(scrollX, scrollY, zoom) => setViewport((current) => current.scrollX === scrollX && current.scrollY === scrollY && current.zoom === zoom.value ? current : { scrollX, scrollY, zoom: zoom.value })}
      >
        <PreviewPanel components={doc.components} selectedId={selectedPreviewId} selections={previewSelections} selectedRemoteStory={selectedRemoteStory} onSelectComponent={selectPreviewComponent} onSelectState={selectPreviewState} onSelectRemoteStory={selectRemoteStory} onAddStory={(story) => addRemoteStory(story)} />
      </Excalidraw>
      <div className={`overlay-layer ${altPressed ? "alt-active" : ""} ${componentInteraction && !altPressed ? "component-interaction-active" : ""}`}>
        {doc.components.map((item) => <ComponentOverlay key={item.id} component={item} viewport={viewport} interactive={altPressed} componentInteraction={componentInteraction && !altPressed} onChange={updateComponent} onBoundsMeasured={(bounds) => updateMeasuredBounds(item.id, bounds)} onElectronMeasured={(measurement) => updateElectronBounds(item.id, measurement)} onLoadState={(status) => updateLoadState(item.id, status)} onPostMessageState={(status) => updatePostMessageState(item.id, status)} />)}
      </div>
    </div>
    <div className="state">
      <div className="component-status-list">
        {doc.components.map((item) => <span key={item.id}><strong>{item.componentId.split(".").at(-2)}</strong> {Math.round(item.width)} × {Math.round(item.height)} · {item.loadStatus} · `postMessage`（跨窗口消息）{item.postMessageState}</span>)}
      </div>
      <span>画布缩放：{Math.round(viewport.zoom * 100)}%</span>
      <span className={altPressed ? "alt-on" : ""}>{altPressed ? "Alt 操作层已启用" : "按住 Alt 操作组件"}</span>
      <button className={componentInteraction ? "mode-on" : ""} onClick={() => setComponentInteraction((current) => !current)}>{componentInteraction ? "返回画板" : "操作组件"}</button>
      <button onClick={saveJson}>保存 JSON</button>
      <button onClick={() => fileInput.current?.click()}>打开 JSON</button>
      <input ref={fileInput} type="file" accept="application/json" onChange={loadJson} hidden />
    </div>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
