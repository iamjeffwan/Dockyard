import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Accordion,
  AccordionItem,
  Button,
  IconButton,
  Search as CarbonSearch,
  Select,
  SelectItem,
} from "@carbon/react";
import { Plus } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import scribbleLoopIcon from "../assets/scribble-loop.svg";
import type {
  StorybookCatalog,
  StorybookSearchResult,
  StorybookSource,
  StorybookStory,
  Workspace,
} from "../types.js";
import { StorybookSourceMultiSelect } from "./StorybookSourceMultiSelect.js";
import { groupStoriesBySource } from "./storybook-source-groups.js";
import { STATIC_COMPONENTS, STATIC_SOURCES } from "../static-components/registry.js";
const recognitionPrompt = "这是一张不完整的 UI 开发草图。请根据轮廓、位置关系、文字区域和交互暗示推测组件类型。优先使用 shadcn/ui 或 Radix UI 等组件库中的标准组件名称。不要生成代码。";

const staticSource = STATIC_SOURCES[0];
const staticCatalog: StorybookCatalog = {
  source: {
    id: staticSource.id,
    name: staticSource.name,
    baseUrl: "",
    indexUrl: staticSource.manifestUrl,
    allowedOrigin: "",
    status: "ready",
    storyCount: STATIC_COMPONENTS.length,
  },
  stories: STATIC_COMPONENTS.map((component) => ({
    id: component.key,
    title: component.categoryPath.join(" / "),
    name: component.name,
    type: "story",
    sourceId: staticSource.id,
    storyUrl: "",
  })),
};

const LazySidebarShell = lazy(async () => {
  const module = await import("./ui.js");
  return { default: module.StorybookSidebarShell };
});

async function exportSelectedSketch(api: ExcalidrawImperativeAPI) {
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds || {};
  const elements = api.getSceneElements().filter((element) => selectedIds[element.id]);
  if (!elements.length) return null;
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const blob = await exportToBlob({
    elements,
    appState: { ...appState, selectedElementIds: {} },
    files: api.getFiles(),
    exportPadding: 16,
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("草图导出失败"));
    reader.readAsDataURL(blob);
  });
}
export function StorybookSidebar({
  selection,
  onSelectionChange,
  onStoryAdd,
  onStoryDragStart,
  excalidrawAPI,
}: {
  selection?: Workspace["storybookSelection"];
  onSelectionChange: (story: StorybookStory) => void;
  onStoryAdd: (story: StorybookStory) => void;
  onStoryDragStart?: (event: React.DragEvent<HTMLButtonElement>, story: StorybookStory) => void;
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
}) {
  const [sources, setSources] = useState<StorybookSource[]>([]);
  const [sourceId, setSourceId] = useState(selection?.sourceId || "");
  const [catalog, setCatalog] = useState<StorybookCatalog | null>(null);
  const [catalogs, setCatalogs] = useState<StorybookCatalog[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("正在读取来源…");
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sketchDataUrl, setSketchDataUrl] = useState<string | null>(null);
  const [searchingSketch, setSearchingSketch] = useState(false);
  const [recognition, setRecognition] = useState<{ components: string[]; rawText: string } | null>(null);
  const [storybookResult, setStorybookResult] = useState<StorybookSearchResult | null>(null);
  const [resizeHandleRect, setResizeHandleRect] = useState<{ left: number; top: number; height: number } | null>(null);
  const [sketchAnchorRect, setSketchAnchorRect] = useState<{ left: number; top: number; bottom: number; height: number } | null>(null);
  const sketchCardRef = useRef<HTMLDivElement | null>(null);
  const catalogRequestId = useRef(0);
  const sketchPositionRaf = useRef<number | null>(null);
  const pendingSketchPosition = useRef<{ left: number; top: number } | null>(null);
  const [searchSourceIds, setSearchSourceIds] = useState<string[]>([]);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  useEffect(() => {
    const request = window.dockyard?.storybookSources();
    if (!request) {
      setSources([staticCatalog.source]);
      setSourceId(staticSource.id);
      setSearchSourceIds([staticSource.id]);
      setStatus(`${STATIC_COMPONENTS.length} 个静态组件`);
      return;
    }
    void request.then((items) => {
      const nextSources = [staticCatalog.source, ...(items || []).filter((item) => item.id !== staticSource.id)];
      setSources(nextSources);
      const next = selection?.sourceId || nextSources[0]?.id || "";
      setSourceId(next);
      setSearchSourceIds((current) => current.length ? current : nextSources.map((item) => item.id));
    }).catch(() => setStatus("来源读取失败"));
  }, [selection?.sourceId]);
  useEffect(() => {
    if (!sourceId) { setCatalog(null); return; }
    if (sourceId === staticSource.id) { setCatalog(staticCatalog); return; }
    const request = window.dockyard?.storybookCatalog(sourceId);
    if (!request) return;
    void request.then(setCatalog).catch(() => setCatalog(null));
  }, [sourceId]);
  useEffect(() => {
    const requestId = ++catalogRequestId.current;
    if (!searchSourceIds.length) {
      setCatalogs([]);
      setStatus("请选择组件来源");
      return;
    }
    const requests = searchSourceIds.map((id) => id === staticSource.id ? Promise.resolve(staticCatalog) : window.dockyard?.storybookCatalog(id));
    if (requests.some((request) => !request)) {
      setCatalogs([]);
      setStatus("请在 Electron 中打开远程目录");
      return;
    }
    setStatus("正在读取组件目录…");
    void Promise.all(requests as Promise<StorybookCatalog>[])
      .then((next) => {
        if (requestId !== catalogRequestId.current) return;
        setCatalogs(next);
        setStatus(`${next.reduce((count, item) => count + item.stories.length, 0)} 个故事`);
      })
      .catch(() => {
        if (requestId !== catalogRequestId.current) return;
        setCatalogs([]);
        setStatus("目录读取失败");
      });
  }, [searchSourceIds]);
  const groups = useMemo(() => {
    const map = new Map<string, StorybookStory[]>();
    for (const story of catalogs.flatMap((item) => item.stories)) {
      if (!story.title.toLowerCase().includes(query.toLowerCase()) && !story.name.toLowerCase().includes(query.toLowerCase())) continue;
      const stories = map.get(story.title) || [];
      stories.push(story);
      map.set(story.title, stories);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogs, query]);
  const visibleGroups = useMemo(() => {
    if (!storybookResult) return groups;
    const selected = new Set(searchSourceIds.length ? searchSourceIds : sources.map((item) => item.id));
    const map = new Map<string, StorybookStory[]>();
    for (const match of storybookResult.matches) {
      if (match.status !== "matched" || !selected.has(match.sourceId)) continue;
      map.set(`${match.sourceId}::${match.path}`, match.stories);
    }
    return [...map.entries()].map(([key, stories]) => [key.split("::").slice(1).join("::"), stories] as [string, StorybookStory[]]);
  }, [groups, searchSourceIds, sources, storybookResult]);
  const sourceGroups = useMemo(() => {
    return groupStoriesBySource(sources, searchSourceIds, visibleGroups);
  }, [sources, searchSourceIds, visibleGroups]);
  const toggleSource = (sourceId: string) => {
    setExpandedSourceId((current) => current === sourceId ? null : sourceId);
  };
  const selectedStory = useMemo(() => (catalog?.stories || []).find((story) => story.id === selection?.storyId), [catalog, selection?.storyId]);
  const selectedSource = sources.find((source) => source.id === selection?.sourceId);
  const selectedSearchSources = sources.filter((source) => searchSourceIds.includes(source.id));
  const captureSketch = async () => {
    if (!excalidrawAPI) return;
    try {
      const dataUrl = await exportSelectedSketch(excalidrawAPI);
      setSketchDataUrl(dataUrl);
      setStatus(dataUrl ? "已获取当前选区" : "请先在画板中框选区域");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "草图导出失败");
    }
  };
  const runSketchSearch = async () => {
    if (!sketchDataUrl || searchingSketch) return;
    setSearchingSketch(true);
    const result = await window.dockyard?.recognizeSketch({ imageDataUrl: sketchDataUrl, prompt: recognitionPrompt });
    setRecognition(result?.status === "success" ? { components: result.components, rawText: result.rawText } : null);
    setSearchingSketch(false);
  };
  useEffect(() => {
    let observedSidebar: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => updateResizeHandle());
    const updateResizeHandle = () => {
      const sidebarNode = document.querySelector(".excalidraw .sidebar:has(.storybook-panel-body)");
      const sidebar = sidebarNode instanceof HTMLElement ? sidebarNode : null;
      if (sidebar !== observedSidebar) {
        if (observedSidebar) resizeObserver.unobserve(observedSidebar);
        observedSidebar = sidebar;
        if (observedSidebar) resizeObserver.observe(observedSidebar);
      }
      if (!sidebar) {
        setResizeHandleRect(null);
        setSketchAnchorRect(null);
        document.body.classList.remove("storybook-sidebar-open");
        return;
      }
      const rect = sidebar.getBoundingClientRect();
      const sidebarVisible = rect.width > 0 && rect.height > 0 && getComputedStyle(sidebar).visibility !== "hidden";
      document.body.classList.toggle("storybook-sidebar-open", sidebarVisible);
      setResizeHandleRect({ left: rect.left, top: rect.top, height: rect.height });
      const sourceControl = sidebar.querySelector(".storybook-source-control");
      const searchControl = sidebar.querySelector(".storybook-search-row .cds--search");
      if (sourceControl instanceof HTMLElement && searchControl instanceof HTMLElement) {
        const sourceRect = sourceControl.getBoundingClientRect();
        const searchRect = searchControl.getBoundingClientRect();
        setSketchAnchorRect({ left: rect.left, top: searchRect.top, bottom: sourceRect.bottom, height: searchRect.height });
      } else {
        setSketchAnchorRect(null);
      }
    };
    const mutationObserver = new MutationObserver(updateResizeHandle);
    updateResizeHandle();
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", updateResizeHandle);
    window.addEventListener("scroll", updateResizeHandle, true);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (sketchPositionRaf.current !== null) {
        window.cancelAnimationFrame(sketchPositionRaf.current);
        sketchPositionRaf.current = null;
      }
      pendingSketchPosition.current = null;
      document.body.classList.remove("storybook-sidebar-open");
      window.removeEventListener("resize", updateResizeHandle);
      window.removeEventListener("scroll", updateResizeHandle, true);
    };
    }, []);
  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".sidebar__dock")) return;
      window.setTimeout(() => {
        document.querySelector(".excalidraw-tooltip")?.classList.remove("excalidraw-tooltip--visible");
      }, 0);
    };
    document.addEventListener("pointerover", onPointerOver);
    return () => document.removeEventListener("pointerover", onPointerOver);
  }, []);
  const sketchCard = sketchAnchorRect && createPortal(
    <div
      ref={sketchCardRef}
      className="storybook-sketch-card storybook-sketch-card--floating is-open"
      data-prevent-outside-click
      style={{ left: `${sketchAnchorRect.left - 320}px`, top: `${sketchAnchorRect.top - 10}px` }}
    >
      <strong>涂鸦搜索</strong>
      <div className="storybook-sketch-preview">{sketchDataUrl ? <img src={sketchDataUrl} alt="当前草图选区" /> : "待从画稿获取选区"}</div>
      <div className="storybook-sketch-actions"><Button kind="secondary" size="sm" onClick={() => void captureSketch()}><span className="storybook-sketch-action-label">使用当前选区</span></Button><Button kind="tertiary" size="sm" onClick={() => setSketchDataUrl(null)}><span className="storybook-sketch-action-label">清除草图</span></Button></div>
      <Button size="sm" disabled={!sketchDataUrl || searchingSketch} onClick={() => void runSketchSearch()}>{searchingSketch ? "正在识别…" : "识别草图"}</Button>
      {recognition && <div className="storybook-recognition-result"><strong>候选组件</strong>{recognition.components.map((component) => <button key={component} type="button" onClick={() => setQuery(component)}>{component}</button>)}<strong>识别说明</strong><p>{recognition.rawText}</p></div>}
    </div>,
    document.body,
  );
  const resizeHandle = resizeHandleRect && createPortal(
    <div
      className="storybook-resize-handle"
      data-prevent-outside-click
                style={{ left: `${resizeHandleRect.left - 12}px`, top: `${resizeHandleRect.top}px`, height: `${resizeHandleRect.height}px` }}
      role="separator"
      aria-label="拖动调整侧栏宽度"
      onPointerDown={(event) => {
        const handle = event.currentTarget;
        const sidebar = document.querySelector(".excalidraw .sidebar:has(.storybook-panel-body)");
        if (!(sidebar instanceof HTMLElement)) return;
        const pointerId = event.pointerId;
        handle.setPointerCapture(pointerId);
        const startX = event.clientX;
        const startWidth = sidebar.getBoundingClientRect().width;
        const move = (moveEvent: PointerEvent) => {
          const nextWidth = Math.max(300, Math.min(window.innerWidth * 0.7, startWidth + startX - moveEvent.clientX));
          sidebar.style.width = `${nextWidth}px`;
          const nextRect = sidebar.getBoundingClientRect();
          handle.style.left = `${nextRect.left - 12}px`;
          const sourceControl = sidebar.querySelector(".storybook-source-control");
          const searchControl = sidebar.querySelector(".storybook-search-row .cds--search");
          if (sourceControl instanceof HTMLElement && searchControl instanceof HTMLElement) {
            const sourceRect = sourceControl.getBoundingClientRect();
            const searchRect = searchControl.getBoundingClientRect();
            pendingSketchPosition.current = { left: nextRect.left - 320, top: searchRect.top - 10 };
            if (sketchPositionRaf.current === null) {
              sketchPositionRaf.current = window.requestAnimationFrame(() => {
                const position = pendingSketchPosition.current;
                if (position && sketchCardRef.current) {
                  sketchCardRef.current.style.left = `${position.left}px`;
                  sketchCardRef.current.style.top = `${position.top}px`;
                }
                sketchPositionRaf.current = null;
              });
            }
          }
        };
        const stop = () => {
          if (sketchPositionRaf.current !== null) {
            window.cancelAnimationFrame(sketchPositionRaf.current);
            sketchPositionRaf.current = null;
          }
          pendingSketchPosition.current = null;
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
          handle.removeEventListener("lostpointercapture", stop);
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
        handle.addEventListener("lostpointercapture", stop);
      }}
    />,
    document.body,
  );
  return (
    <>
      <Suspense fallback={null}>
      <LazySidebarShell>
          <div className="storybook-panel-body">
            <div className="storybook-controls">
              <div className="storybook-search-row">
                <IconButton className="storybook-doodle-search-button" label="涂鸦搜索" align="bottom" kind="ghost" size="sm" onClick={() => setSketchOpen((value) => !value)}>
                  <img className="storybook-doodle-search-icon" src={scribbleLoopIcon} alt="" aria-hidden="true" />
                </IconButton>
                <CarbonSearch id="storybook-search" labelText="查找组件或故事" placeholder="查找组件或故事" value={query} onChange={(event) => setQuery(event.target.value)} size="sm" />
              </div>
              <StorybookSourceMultiSelect sources={sources} selectedSources={selectedSearchSources} onChange={setSearchSourceIds} />
              {storybookResult && <div className="storybook-search-mode">涂鸦匹配 <Button kind="ghost" size="sm" onClick={() => setStorybookResult(null)}>返回完整组件库</Button></div>}
            </div>
            <div className="storybook-list-section">
              <small className="storybook-status">{status}</small>
              <div className="storybook-groups">
                <Accordion align="start" size="sm" className="storybook-source-accordion">
                {sourceGroups.map(({ sourceId, sourceName, categories }) => <AccordionItem key={sourceId} className="storybook-group" open={expandedSourceId === sourceId} onHeadingClick={() => toggleSource(sourceId)} title={<span className="storybook-source-directory-title">{sourceName}<small>{categories.reduce((count, [, stories]) => count + stories.length, 0)}</small></span>}>
                  <div className="storybook-source-content" aria-label={`${sourceName} 故事列表`}>{categories.map(([category, stories]) => <div key={category} className="storybook-category"><h3>{category}</h3>{stories.map((story) => <div key={story.id} className={`storybook-story${selection?.storyId === story.id ? " selected" : ""}`}>
                    <button type="button" className="storybook-story-main" draggable onClick={() => onSelectionChange(story)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dockyard-story", JSON.stringify(story)); onStoryDragStart?.(event, story); }}>{story.name}</button>
                    <IconButton label="添加到画板" size="sm" kind="ghost" onClick={() => onStoryAdd(story)}><Plus size={16} /></IconButton>
                  </div>)}</div>)}</div>
                </AccordionItem>)}</Accordion>
                {!sourceGroups.length && <p className="storybook-empty">没有匹配的故事</p>}
              </div>
            </div>
            <div className="storybook-preview">
              <h3>{selection?.storyName || "Story 预览"}</h3>
              <div className="storybook-preview-frame">{selection?.storyUrl ? <iframe title={selection.storyName || selection.storyId} src={selection.storyUrl} /> : <span>选择一个 Story 查看预览</span>}</div>
              <div className="storybook-preview-meta"><span>{selectedSource?.name || "未选择来源"}</span><span>{selectedStory?.title || ""}</span></div>
            </div>
          </div>
      </LazySidebarShell>
      </Suspense>
      {sketchOpen && sketchCard}
      {resizeHandle}
    </>
  );
}
