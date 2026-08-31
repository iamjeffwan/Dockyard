import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import scribbleLoopIcon from "./assets/scribble-loop.svg";
import { Button, DismissibleTag, IconButton, MultiSelect, Search as CarbonSearch, Select, SelectItem } from "@carbon/react";
import { MainMenu } from "@excalidraw/excalidraw";
import {
  Box,
  Check,
  CircleAlert,
  FileCode2,
  FolderOpen,
  ImagePlus,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type {
  Artwork,
  BaseArtwork,
  CacheStatus,
  Candidate,
  ComponentInstance,
  GlobalComponent,
  SceneData,
  SourceAsset,
  Workspace,
  StorybookCatalog,
  StorybookSource,
  StorybookStory,
  StorybookSearchResult,
} from "./types";
import { PrototypeOverlay } from "./overlay/PrototypeOverlay";
import {
  EXCALIDRAW_ANNOTATOR_WINDOW_NAME,
  excalidrawLibraryReturnUrl,
} from "./excalidraw-library-host";
import "@excalidraw/excalidraw/index.css";
import "./carbon.scss";
import "./styles.css";
import projectTokenData from "../design/project-tokens.json";

const LazyExcalidraw = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");
  return { default: module.Excalidraw };
});
const LazySidebarShell = lazy(async () => {
  const module = await import("./excalidraw-ui");
  return { default: module.StorybookSidebarShell };
});
const LazySidebarTrigger = lazy(async () => {
  const module = await import("./excalidraw-ui");
  return { default: module.StorybookSidebarTrigger };
});
const LazyLibraryHandler = lazy(async () => {
  const module = await import("./excalidraw-ui");
  return { default: module.LibraryHandler };
});

function CanvasMainMenu({
  hasArtwork,
  onChooseArtwork,
  onSave,
  onExportDelivery,
  onCopyComponents,
  onComplete,
}: {
  hasArtwork: boolean;
  onChooseArtwork: () => void;
  onSave: () => void;
  onExportDelivery: () => void;
  onCopyComponents: () => void;
  onComplete: () => void;
}) {
  return (
    <MainMenu>
      <MainMenu.Item icon={<FolderOpen size={16} />} onSelect={onChooseArtwork}>选择图稿</MainMenu.Item>
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.Item icon={<Save size={16} />} onSelect={onSave} disabled={!hasArtwork}>保存到 Dockyard</MainMenu.Item>
      <MainMenu.Item icon={<Send size={16} />} onSelect={onExportDelivery} disabled={!hasArtwork}>导出开发素材</MainMenu.Item>
      <MainMenu.Item icon={<FileCode2 size={16} />} onSelect={onCopyComponents} disabled={!hasArtwork}>复制组件信息</MainMenu.Item>
      <MainMenu.Item icon={<Check size={16} />} onSelect={onComplete} disabled={!hasArtwork}>完成并记录</MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Group title="Excalidraw links"><MainMenu.DefaultItems.Socials /></MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
}

const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();
function createImageElement(data: {
  x: number;
  y: number;
  width: number;
  height: number;
  fileId: string;
  customData?: Record<string, unknown>;
  locked?: boolean;
}) {
  const timestamp = Date.now();
  return {
    id: uid("image"),
    type: "image",
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: null,
    updated: timestamp,
    link: null,
    locked: Boolean(data.locked),
    fileId: data.fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    customData: data.customData,
  };
}
const nextComponentSequence = (components: ComponentInstance[]) => {
  const used = new Set(
    components
      .map((item) => item.sequence)
      .filter((value): value is string => Boolean(value)),
  );
  let index = 1;
  while (used.has(`C${index}`)) index += 1;
  return `C${index}`;
};
const componentManifest = (components: ComponentInstance[]) =>
  [
    "当前稿件中的已确认组件：",
    ...components.map((item) => [
      `[${item.sequence || "未编号"}]`,
      `组件：${item.name}`,
      `变体：${item.storyName || "默认"}`,
      `组件库：${item.library}`,
      `Story ID：${item.storyId || "未提供"}`,
      `Story 名称：${item.storyTitle || item.storyName || item.name}`,
      `Storybook 地址：${item.storyUrl || item.docsUrl || "未提供"}`,
      `位置：${item.x ?? 0}, ${item.y ?? 0}`,
      "",
    ].join("\n")),
  ].join("\n");
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
const emptyScene = (): SceneData => ({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});
const emptyWorkspace: Workspace = {
  version: 3,
  id: uid("workspace"),
  name: "未命名设计",
  updatedAt: now(),
  currentArtworkId: null,
  artworks: [],
  bases: [],
  libraryItems: [],
  globalComponents: [],
  recentProjects: [],
  preferredLibraries: ["shadcn/ui"],
  windowState: {},
};

function readImage(file: File): Promise<SourceAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error("图片无法读取"));
      image.onload = async () => {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(dataUrl),
        );
        const hash = `sha256-${Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        resolve({
          name: file.name || "图稿.png",
          dataUrl,
          width: image.width,
          height: image.height,
          hash,
          path: `assets/source/${hash}.png`,
        });
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
function ensureSourceScene(
  scene: SceneData,
  source: SourceAsset | null,
): SceneData {
  const files = Object.fromEntries(
    Object.entries(scene.files || {}).filter(
      ([, file]) => file && typeof (file as any).dataURL === "string",
    ),
  );
  if (
    !source ||
    scene.elements.some((item) => item.customData?.dockyardType === "source")
  )
    return { ...scene, files };
  const element = createImageElement({
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
    fileId: source.hash,
    locked: true,
    customData: { dockyardType: "source", assetHash: source.hash },
  });
  return {
    ...scene,
    elements: [element, ...scene.elements],
    files: {
      ...files,
      [source.hash]: {
        id: source.hash,
        mimeType: "image/png",
        dataURL: source.dataUrl,
        created: Date.now(),
      },
    },
  };
}
function artworkName(items: Artwork[], name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "图稿";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  let result = name;
  let index = 1;
  const names = new Set(items.map((item) => item.name));
  while (names.has(result)) result = `${base}（副本 ${index++}）${ext}`;
  return result;
}
function activeArtwork(workspace: Workspace) {
  return (
    workspace.artworks.find((item) => item.id === workspace.currentArtworkId && item.status !== "completed") ||
    workspace.artworks.find((item) => item.status !== "completed") ||
    null
  );
}

function createArtwork(
  source: SourceAsset,
  name: string,
  baseId: string,
  scene?: SceneData,
): Artwork {
  return {
    id: uid("artwork"),
    baseId,
    name,
    status: "draft",
    createdAt: now(),
    updatedAt: now(),
    source,
    scene: scene || ensureSourceScene(emptyScene(), source),
    annotations: [],
    components: [],
    notes: "",
  };
}
function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const workspaceRef = useRef(workspace);
  const readyRef = useRef(false);
  const [history, setHistory] = useState<Workspace[]>([]);
  const [future, setFuture] = useState<Workspace[]>([]);
  useEffect(() => {
    const request = window.dockyard?.loadWorkspace();
    if (!request) { readyRef.current = true; return; }
    void request.then((saved) => {
      if (saved) { workspaceRef.current = saved; setWorkspace(saved); }
      readyRef.current = true;
    });
    return window.dockyard?.onDesignState((next) => { workspaceRef.current = next; setWorkspace(next); });
  }, []);
  const update = useCallback(
    (producer: (current: Workspace) => Workspace, record = true) =>
      setWorkspace((current) => {
        if (!readyRef.current) return current;
        const next = producer(workspaceRef.current);
        workspaceRef.current = next;
        if (record) {
          setHistory((stack) => [...stack.slice(-39), current]);
          setFuture([]);
        }
        window.dockyard?.syncDesign(next);
        if (
          record ||
          next.artworks.length !== current.artworks.length ||
          next.libraryItems !== current.libraryItems ||
          next.recentProjects !== current.recentProjects
        )
          void window.dockyard?.saveWorkspace({ ...next, updatedAt: now() });
        return next;
      }),
    [],
  );
  const undo = () =>
    setHistory((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setWorkspace((current) => {
        setFuture((items) => [...items, current]);
        workspaceRef.current = previous;
        window.dockyard?.syncDesign(previous);
        return previous;
      });
      return stack.slice(0, -1);
    });
  const redo = () =>
    setFuture((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setWorkspace((current) => {
        setHistory((items) => [...items, current]);
        workspaceRef.current = next;
        window.dockyard?.syncDesign(next);
        return next;
      });
      return stack.slice(0, -1);
    });
  return {
    workspace,
    update,
    save: () =>
      readyRef.current
        ? window.dockyard?.saveWorkspace({ ...workspaceRef.current, updatedAt: now() })
        : Promise.resolve({ ok: false, error: "工作区尚未加载完成" }),
    undo,
    redo,
    canUndo: Boolean(history.length),
    canRedo: Boolean(future.length),
  };
}
function useProjectStatus() {
  const [status, setStatus] = useState<import("./types").ProjectStatus>({
    current: null,
    missingCurrent: null,
    recent: [],
    hasWorkspace: false,
  });
  const refresh = useCallback(async () => {
    const next = await window.dockyard?.projectStatus?.();
    if (next) setStatus(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, refresh };
}
function openPanel(
  view: "annotator" | "component-search" | "tokens" | "decisions",
) {
  void window.dockyard?.openPanel(view);
}
function WindowHeader({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow: string;
  onClose?: () => void;
}) {
  return (
    <header className="window-header">
      <div className="window-title">
        <span className="brand-mark">D</span>
        <div>
          <small>{eyebrow}</small>
          <h1>{title}</h1>
        </div>
      </div>
    </header>
  );
}

function StorybookSidebar({
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("正在读取来源…");
  const [sketchOpen, setSketchOpen] = useState(false);
  const [sketchDataUrl, setSketchDataUrl] = useState<string | null>(null);
  const [searchingSketch, setSearchingSketch] = useState(false);
  const [storybookResult, setStorybookResult] = useState<StorybookSearchResult | null>(null);
  const [resizeHandleRect, setResizeHandleRect] = useState<{ left: number; top: number; height: number } | null>(null);
  const [sketchAnchorRect, setSketchAnchorRect] = useState<{ left: number; top: number; bottom: number; height: number } | null>(null);
  const sketchCardRef = useRef<HTMLDivElement | null>(null);
  const sketchPositionRaf = useRef<number | null>(null);
  const pendingSketchPosition = useRef<{ left: number; top: number } | null>(null);
  const [searchSourceIds, setSearchSourceIds] = useState<string[]>([]);
  useEffect(() => {
    const request = window.dockyard?.storybookSources();
    if (!request) { setStatus("请在 Electron 中打开远程目录"); return; }
    void request.then((items) => {
      setSources(items || []);
      const next = selection?.sourceId || items?.[0]?.id || "";
      setSourceId(next);
      setSearchSourceIds((current) => current.length ? current : (items || []).map((item) => item.id));
    }).catch(() => setStatus("来源读取失败"));
  }, [selection?.sourceId]);
  useEffect(() => {
    if (!sourceId) { setCatalog(null); setStatus("请选择组件来源"); return; }
    setStatus("正在读取组件目录…");
    const request = window.dockyard?.storybookCatalog(sourceId);
    if (!request) { setStatus("请在 Electron 中打开远程目录"); return; }
    void request.then((next) => { setCatalog(next); setStatus(`${next.stories.length} 个故事`); }).catch(() => setStatus("目录读取失败"));
  }, [sourceId]);
  const groups = useMemo(() => {
    const map = new Map<string, StorybookStory[]>();
    for (const story of catalog?.stories || []) {
      if (!story.title.toLowerCase().includes(query.toLowerCase()) && !story.name.toLowerCase().includes(query.toLowerCase())) continue;
      const stories = map.get(story.title) || [];
      stories.push(story);
      map.set(story.title, stories);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, query]);
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
  const selectedStory = useMemo(() => (catalog?.stories || []).find((story) => story.id === selection?.storyId), [catalog, selection?.storyId]);
  const selectedSource = sources.find((source) => source.id === selection?.sourceId);
  const firstWord = (value: string) => value.trim().split(/\s+/)[0] || value;
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
    setStorybookResult(null);
    const result = await window.dockyard?.runStorybookSearch({ sketchDataUrl, sourceIds: searchSourceIds });
    setStorybookResult(result || null);
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
      <div className="storybook-multiselect-shell">
        <MultiSelect
          id="storybook-search-sources"
          className="storybook-search-sources"
          titleText="检索来源"
          label={selectedSearchSources.length > 0 ? "" : "（可多选）"}
          items={sources}
          itemToString={(item) => firstWord(item?.name || "")}
          selectedItems={selectedSearchSources}
          onChange={({ selectedItems }) => setSearchSourceIds((selectedItems || []).map((source) => source.id))}
        />
        <div className="storybook-selected-source-tags">
          {selectedSearchSources.map((source) => (
            <DismissibleTag key={source.id} size="sm" type="high-contrast" text={firstWord(source.name)} title="移除来源" dismissTooltipLabel="移除来源" onClose={() => setSearchSourceIds((ids) => ids.filter((id) => id !== source.id))} />
          ))}
        </div>
      </div>
      <Button size="sm" disabled={!sketchDataUrl || searchingSketch} onClick={() => void runSketchSearch()}>{searchingSketch ? "正在检索…" : "开始检索"}</Button>
      {storybookResult?.diagnostics?.map((item) => <small key={item} className="storybook-diagnostic">{item}</small>)}
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
              <div className="storybook-source-control">
                <Select id="storybook-source-filter" labelText="组件来源" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                  {sources.map((source) => <SelectItem key={source.id} value={source.id} text={source.name} />)}
                </Select>
              </div>
              {storybookResult && <div className="storybook-search-mode">涂鸦匹配 <Button kind="ghost" size="sm" onClick={() => setStorybookResult(null)}>返回完整组件库</Button></div>}
            </div>
            <div className="storybook-list-section">
              <small className="storybook-status">{status}</small>
              <div className="storybook-groups">
                {visibleGroups.map(([title, stories]) => <section key={title} className="storybook-group">
                  <h3>{title}</h3>
                  {stories.map((story) => <div key={story.id} className={`storybook-story${selection?.storyId === story.id ? " selected" : ""}`}>
                    <button type="button" className="storybook-story-main" draggable onClick={() => onSelectionChange(story)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dockyard-story", JSON.stringify(story)); onStoryDragStart?.(event, story); }}>{story.name}</button>
                    <IconButton label="添加到画板" size="sm" kind="ghost" onClick={() => onStoryAdd(story)}><Plus size={16} /></IconButton>
                  </div>)}
                </section>)}
                {!visibleGroups.length && <p className="storybook-empty">没有匹配的故事</p>}
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

function LegacyRemoteStoryOverlayLayer({
  components,
  appState,
  onChange,
}: {
  components: ComponentInstance[];
  appState?: any;
  onChange: (instanceId: string, patch: Partial<ComponentInstance>) => void;
}) {
  const [altPressed, setAltPressed] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; width: number; height: number; rotation: number; startX: number; startY: number; mode: "move" | "resize" | "rotate"; corner?: string } | null>(null);
  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === "Alt" && setAltPressed(true);
    const up = (event: KeyboardEvent) => event.key === "Alt" && setAltPressed(false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const scrollX = Number(appState?.scrollX || 0);
  const scrollY = Number(appState?.scrollY || 0);
  const zoom = Number((appState?.zoom as any)?.value || appState?.zoom || 1);
  const stories = components.filter((item) => item.sourceType === "storybook" && item.storyUrl);
  if (!stories.length) return null;
  return <div className={`storybook-overlay-layer${altPressed ? " alt-active" : ""}`}>
    {stories.map((item) => <div key={item.instanceId} className="storybook-overlay-item" style={{ left: `${((item.x || 0) + scrollX) * zoom}px`, top: `${((item.y || 0) + scrollY) * zoom}px`, width: `${(item.width || 320) * zoom}px`, height: `${(item.height || 160) * zoom}px`, transform: `rotate(${item.rotation || 0}rad)` }} onPointerDown={(event) => { if (!altPressed) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "move" }; }} onPointerMove={(event) => { const active = drag.current; if (!active || active.id !== item.instanceId) return; const dx = (event.clientX - active.startX) / zoom; const dy = (event.clientY - active.startY) / zoom; if (active.mode === "move") onChange(item.instanceId, { x: active.x + dx, y: active.y + dy }); else if (active.mode === "resize") { const signX = active.corner?.includes("w") ? -1 : 1; const signY = active.corner?.includes("n") ? -1 : 1; onChange(item.instanceId, { width: Math.max(40, active.width + signX * dx), height: Math.max(32, active.height + signY * dy) }); } else { const centerX = ((active.x + active.width / 2 + scrollX) * zoom); const centerY = ((active.y + active.height / 2 + scrollY) * zoom); const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) + Math.PI / 2; onChange(item.instanceId, { rotation: event.shiftKey ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) : angle }); } }} onPointerUp={() => { drag.current = null; }}>
      <iframe title={item.storyName || item.storyId || item.name} src={item.storyUrl} onLoad={() => { onChange(item.instanceId, { loadStatus: "loading" }); const request = window.dockyard?.storybookMeasureFrame(item.storyUrl!); if (!request) { onChange(item.instanceId, { loadStatus: "ready" }); return; } void request.then((measurement) => { onChange(item.instanceId, { width: measurement.width, height: measurement.height, intrinsicWidth: measurement.width, intrinsicHeight: measurement.height, boundsSource: "electron-web-frame-main", loadStatus: "ready" }); }).catch(() => { onChange(item.instanceId, { boundsSource: "fallback", loadStatus: "ready" }); }); }} onError={() => onChange(item.instanceId, { loadStatus: "unavailable" })} />
      {item.sequence && <span className="storybook-overlay-sequence">{item.sequence}</span>}
      {item.loadStatus === "unavailable" && <div className="storybook-overlay-unavailable">远程 Storybook 暂不可用</div>}
      {altPressed && <><span className="storybook-overlay-rotate" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "rotate" }; }} /><span className="storybook-overlay-handle nw" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "resize", corner: "nw" }; }} /><span className="storybook-overlay-handle ne" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "resize", corner: "ne" }; }} /><span className="storybook-overlay-handle sw" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "resize", corner: "sw" }; }} /><span className="storybook-overlay-handle se" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); drag.current = { id: item.instanceId, x: item.x || 0, y: item.y || 0, width: item.width || 320, height: item.height || 160, rotation: item.rotation || 0, startX: event.clientX, startY: event.clientY, mode: "resize", corner: "se" }; }} /></>}
    </div>)}
  </div>;
}
function importArtwork(
  file: File | undefined,
  workspace: Workspace,
  update: (
    producer: (current: Workspace) => Workspace,
    record?: boolean,
  ) => void,
  openAfterImport = false,
) {
  if (!file?.type.startsWith("image/")) return;
  void readImage(file).then((source) => {
    const baseId = uid("base");
    const item = createArtwork(
      source,
      artworkName(workspace.artworks, source.name),
      baseId,
    );
    update((current) => ({
      ...current,
      currentArtworkId: item.id,
      bases: [...(current.bases || []), { id: baseId, name: source.name, source, createdAt: now() }],
      artworks: [...current.artworks, item],
    }));
    if (openAfterImport) openPanel("annotator");
  });
}
function BarView() {
  const { workspace, update } = useWorkspace();
  const { status: projectStatus, refresh: refreshProjectStatus } = useProjectStatus();
  const artwork = activeArtwork(workspace);
  const activateProject = async (selected: { path: string; name: string }) => {
    const opened = await window.dockyard?.openProject?.(selected.path);
    if (!opened?.ok) {
      window.alert(opened?.error || "项目打开失败");
      return;
    }
    if (opened.needsCreation) {
      if (!window.confirm(`项目“${selected.name}”还没有 Dockyard 工作区，是否创建？`)) return;
      const created = await window.dockyard?.createProjectWorkspace?.(selected.path);
      if (!created?.ok) {
        window.alert(created?.error || "工作区创建失败");
        return;
      }
    }
    await refreshProjectStatus();
  };
  const chooseProject = async () => {
    if (!window.dockyard?.pickProject) {
      window.alert("请在 Dockyard 桌面窗口中选择项目");
      return;
    }
    const selected = await window.dockyard?.pickProject?.();
    if (!selected) return;
    if (projectStatus.missingCurrent) {
      const relinked = await window.dockyard?.relinkProject?.(
        projectStatus.missingCurrent.path,
        selected.path,
      );
      if (!relinked?.ok) {
        window.alert(relinked?.error || "项目重新定位失败");
        return;
      }
      await refreshProjectStatus();
      return;
    }
    await activateProject(selected);
  };
  const chooseRecentProject = async (path: string) => {
    if (path === "__browse__") return chooseProject();
    const selected = projectStatus.recent.find((item) => item.path === path);
    if (!selected) return;
    await activateProject(selected);
  };
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!projectStatus.current) return;
      importArtwork(
        Array.from(event.clipboardData?.files || [])[0],
        workspace,
        update,
        true,
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [projectStatus.current, workspace, update]);
  return (
    <div className="bar-shell">
      <div className="bar-drag-handle" aria-hidden="true" />
      {projectStatus.current || projectStatus.missingCurrent ? (
        <select
          className="bar-project"
          aria-label="当前代码项目"
          title={
            projectStatus.error ||
            projectStatus.current?.path ||
            projectStatus.missingCurrent?.path ||
            "选择代码项目"
          }
          value={projectStatus.current?.path || ""}
          onChange={(event) => void chooseRecentProject(event.target.value)}
        >
          <option value="">
            {projectStatus.error
              ? "工作区读取失败"
              : projectStatus.missingCurrent
                ? "项目位置失效"
                : "选择项目"}
          </option>
          {projectStatus.recent
            .filter((item) => item.available)
            .map((item) => (
              <option key={item.path} value={item.path}>
                {item.name}
              </option>
            ))}
          <option value="__browse__">
            {projectStatus.missingCurrent ? "重新定位项目…" : "选择其他项目…"}
          </option>
        </select>
      ) : (
        <button
          type="button"
          className="bar-project"
          aria-label="选择当前代码项目"
          title={projectStatus.error || "选择代码项目"}
          onClick={() => void chooseProject()}
        >
          {projectStatus.error ? "工作区读取失败" : "选择项目"}
        </button>
      )}
      <button
        className="bar-context active"
        disabled={!projectStatus.current}
        onClick={() => openPanel("annotator")}
      >
        <Pencil size={17} />
        <span>图稿</span>
      </button>
      <button
        className="bar-context"
        disabled={!projectStatus.current}
        onClick={() => openPanel("component-search")}
      >
        <Box size={17} />
        <span>组件</span>
      </button>
      <button className="bar-context" disabled={!projectStatus.current} onClick={() => openPanel("tokens")}>
        <Palette size={17} />
        <span>Token</span>
      </button>
      <button className="bar-context" disabled={!projectStatus.current} onClick={() => openPanel("decisions")}>
        <FileCode2 size={17} />
        <span>决策</span>
      </button>
      <button
        className="bar-mini"
        aria-label="关闭 Dockyard"
        onClick={() => window.close()}
      >
        <X size={16} />
      </button>
    </div>
  );
}
function CanvasDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className="canvas-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="canvas-dialog-content">
        <header className="canvas-dialog-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={`关闭${title}`}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </dialog>
  );
}

function SceneCanvas({
  artwork,
  libraryItems,
  storybookSelection,
  onStorySelection,
  onStoryAdd,
  onStoryDragStart,
  updateArtwork,
  onLibraryChange,
  onCreateArtwork,
  onDropCandidate,
  onDropStory,
  onChooseArtwork,
  onSave,
  onExportDelivery,
  onCopyComponents,
  onComplete,
}: {
  artwork: Artwork | null;
  libraryItems: LibraryItems;
  storybookSelection?: Workspace["storybookSelection"];
  onStorySelection: (story: StorybookStory) => void;
  onStoryAdd: (story: StorybookStory) => void;
  onStoryDragStart?: (event: React.DragEvent<HTMLButtonElement>, story: StorybookStory) => void;
  updateArtwork: (
    producer: (item: Artwork) => Artwork,
    record?: boolean,
  ) => void;
  onLibraryChange: (items: LibraryItems) => void;
  onCreateArtwork: (source: SourceAsset, scene: SceneData) => void;
  onDropCandidate: (
    candidate: Candidate,
    event: React.DragEvent<HTMLDivElement>,
  ) => void;
  onDropStory: (story: StorybookStory, event: React.DragEvent<HTMLDivElement>) => void;
  onChooseArtwork: () => void;
  onSave: () => void;
  onExportDelivery: () => void;
  onCopyComponents: () => void;
  onComplete: () => void;
}) {
  const scene = useMemo(
    () =>
      artwork ? ensureSourceScene(artwork.scene, artwork.source) : emptyScene(),
    [artwork?.id],
  );
  const sceneContentSignature = (value: SceneData) => JSON.stringify({ elements: value.elements, files: value.files || {} });
  const last = useRef(sceneContentSignature(scene));
  const nativeImageSources = useRef(new Map<string, SourceAsset>());
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [canvasAppState, setCanvasAppState] = useState<any>(scene.appState);
  const libraryReturnUrl = useMemo(() => excalidrawLibraryReturnUrl(), []);
  useEffect(() => {
    last.current = sceneContentSignature(scene);
    setCanvasAppState(scene.appState);
  }, [scene]);
  const generateIdForFile = async (file: File) => {
    const source = await readImage(file);
    nativeImageSources.current.set(source.hash, source);
    return source.hash;
  };
  return (
    <div
      className="excalidraw-wrap"
      data-library-return-url={libraryReturnUrl}
      data-library-target={EXCALIDRAW_ANNOTATOR_WINDOW_NAME}
      data-library-token={excalidrawAPI?.id || ""}
      onDragOverCapture={(event) => {
        if (event.dataTransfer.types.includes("application/x-dockyard-story") || event.dataTransfer.types.includes("application/x-dockyard-candidate")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-dockyard-story") || event.dataTransfer.types.includes("application/x-dockyard-candidate")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDropCapture={(event) => {
        const storyRaw = event.dataTransfer.getData("application/x-dockyard-story");
        if (storyRaw) {
          event.preventDefault();
          event.stopPropagation();
          onDropStory(JSON.parse(storyRaw), event);
          return;
        }
        const raw = event.dataTransfer.getData(
          "application/x-dockyard-candidate",
        );
        if (!raw) return;
        event.preventDefault();
        event.stopPropagation();
        onDropCandidate(JSON.parse(raw), event);
      }}
      onDrop={(event) => {
        if (event.defaultPrevented) return;
        const storyRaw = event.dataTransfer.getData("application/x-dockyard-story");
        if (storyRaw) {
          event.preventDefault();
          onDropStory(JSON.parse(storyRaw), event);
          return;
        }
        const raw = event.dataTransfer.getData("application/x-dockyard-candidate");
        if (raw) {
          event.preventDefault();
          onDropCandidate(JSON.parse(raw), event);
        }
      }}
    >
      <div className="excalidraw-grid" />
      <Suspense fallback={null}><LazyLibraryHandler excalidrawAPI={excalidrawAPI} /></Suspense>
      <Suspense fallback={<div className="excalidraw-loading" role="status">正在加载画布…</div>}>
      <LazyExcalidraw
        key={artwork?.id || "dockyard-empty-canvas"}
        initialData={{ ...scene, libraryItems } as any}
        excalidrawAPI={setExcalidrawAPI}
        renderTopRightUI={() => <Suspense fallback={null}><LazySidebarTrigger /></Suspense>}
        libraryReturnUrl={libraryReturnUrl}
        onLibraryChange={onLibraryChange}
        generateIdForFile={generateIdForFile}
        onChange={(elements, appState, files) => {
          setCanvasAppState(appState);
          const next: SceneData = {
            ...scene,
            elements: [...elements],
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
            files,
          };
          if (!artwork) {
            const sourceElement = elements.find(
              (item: any) =>
                item.type === "image" &&
                nativeImageSources.current.has(item.fileId),
            ) as any;
            const source = sourceElement
              ? nativeImageSources.current.get(sourceElement.fileId)
              : undefined;
            if (!source || !sourceElement) return;
            nativeImageSources.current.delete(source.hash);
            onCreateArtwork(source, {
              ...next,
              elements: elements.map((item: any) =>
                item.id === sourceElement.id
                  ? {
                      ...item,
                      locked: true,
                      customData: {
                        ...item.customData,
                        dockyardType: "source",
                        assetHash: source.hash,
                      },
                    }
                  : item,
              ),
            });
            return;
          }
          // 平移和缩放只更新画布本地视口，不写回工作区，避免空格拖动画布时高频重渲染。
          const signature = sceneContentSignature(next);
          if (signature !== last.current) {
            last.current = signature;
            updateArtwork(
              (item) => ({ ...item, scene: next, updatedAt: now() }),
              false,
            );
          }
        }}
        langCode="zh-CN"
        theme="light"
        UIOptions={{
          dockedSidebarBreakpoint: 0,
          canvasActions: {
            changeViewBackgroundColor: true,
            loadScene: false,
            saveToActiveFile: false,
            export: {},
          },
        }}
      >
        <StorybookSidebar selection={storybookSelection} onSelectionChange={onStorySelection} onStoryAdd={onStoryAdd} onStoryDragStart={onStoryDragStart} excalidrawAPI={excalidrawAPI} />
        <CanvasMainMenu
          hasArtwork={Boolean(artwork)}
          onChooseArtwork={onChooseArtwork}
          onSave={onSave}
          onExportDelivery={onExportDelivery}
          onCopyComponents={onCopyComponents}
          onComplete={onComplete}
        />
      </LazyExcalidraw>
      </Suspense>
      <PrototypeOverlay components={artwork?.components || []} viewport={{ zoom: Number((canvasAppState?.zoom as any)?.value || canvasAppState?.zoom || 1), scrollX: Number(canvasAppState?.scrollX || 0), scrollY: Number(canvasAppState?.scrollY || 0) }} interactionEnabled={true} onCommit={(instanceId, patch) => updateArtwork((current) => ({ ...current, components: current.components.map((item) => item.instanceId === instanceId ? { ...item, ...patch } : item), updatedAt: now() }))} />
      {!artwork && (
        <div className="canvas-empty-callout" aria-hidden="true">
          <ImagePlus size={26} />
          <strong>拖入图片开始标注</strong>
          <span>也可在菜单中选择图稿或导入图片</span>
        </div>
      )}
      {artwork && (
        <div className="canvas-hint">原图已锁定 · 可直接标注和绘图</div>
      )}
    </div>
  );
}

function AnnotatorView() {
  const { workspace, update } = useWorkspace();
  const [status, setStatus] = useState("");
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [recordArtworkId, setRecordArtworkId] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{
    path: string;
    artworkName: string;
    componentCount: number;
  } | null>(null);
  const artwork = activeArtwork(workspace);
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4200);
    return () => window.clearTimeout(timer);
  }, [status]);
  const updateArtwork = (producer: (item: Artwork) => Artwork, record = true) =>
    artwork &&
    update(
      (current) => ({
        ...current,
        artworks: current.artworks.map((item) =>
          item.id === artwork.id ? producer(item) : item,
        ),
      }),
      record,
    );
  const saveNow = async (silent = false) => {
    if (!artwork) return null;
    const canvas = document.querySelector(
      ".excalidraw-wrap canvas",
    ) as HTMLCanvasElement | null;
    const preview = (await window.dockyard?.captureViewport()) || canvas?.toDataURL("image/png");
    const next =
      preview
        ? {
            ...workspace,
            artworks: workspace.artworks.map((item) =>
              item.id === artwork.id
                ? { ...item, annotatedPreviewDataUrl: preview }
                : item,
            ),
          }
        : workspace;
    if (preview) update(() => next, false);
    const result = await window.dockyard?.saveWorkspace(next);
    if (!silent) {
      if (result?.ok) {
        setStatus("已保存到 Dockyard");
        setSaveSummary({
          path: result.path || "",
          artworkName: artwork.name,
          componentCount: artwork.components.length,
        });
      } else {
        setStatus(result?.error || "保存失败");
      }
    }
    return result;
  };
  const createArtworkFromNativeImage = (source: SourceAsset, scene: SceneData) => {
    update((current) => {
      const baseId = uid("base");
      const base: BaseArtwork = { id: baseId, name: source.name, source, createdAt: now() };
      const item = createArtwork(
        source,
        artworkName(current.artworks, source.name),
        baseId,
        scene,
      );
      return {
        ...current,
        currentArtworkId: item.id,
        bases: [...(current.bases || []), base],
        artworks: [...current.artworks, item],
      };
    });
    setStatus("已将图片登记为新图稿");
  };
  const selectArtwork = (id: string) => {
    const item = workspace.artworks.find((candidate) => candidate.id === id);
    if (item?.status === "completed") {
      setArtworkPickerOpen(false);
      setRecordArtworkId(item.id);
      return;
    }
    update((current) => ({ ...current, currentArtworkId: id }));
    setArtworkPickerOpen(false);
  };
  const createDraftFromBase = (baseId: string) => {
    const base = workspace.bases?.find((item) => item.id === baseId);
    if (!base) return;
    update((current) => {
      const item = createArtwork(
        base.source,
        artworkName(current.artworks, `${base.name} · 新方案`),
        base.id,
      );
      return { ...current, currentArtworkId: item.id, artworks: [...current.artworks, item] };
    });
    setArtworkPickerOpen(false);
  };
  const copyComponents = async () => {
    if (!artwork) return;
    const text = componentManifest(artwork.components);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("组件信息已复制");
    } catch {
      setStatus("组件信息复制失败");
    }
  };
  const completeCurrentArtwork = async () => {
    if (!artwork) return;
    setStatus("正在生成完成记录…");
    try {
      const saved = await saveNow(true);
      if (!saved?.ok) throw new Error(saved?.error || "保存当前稿件失败");
      document.body.classList.add("dockyard-exporting");
      const previewDataUrl = await window.dockyard?.captureViewport();
      if (!previewDataUrl) throw new Error("无法导出当前画布");
      const result = await window.dockyard?.completeArtwork({
        artworkId: artwork.id,
        previewDataUrl,
        componentsText: componentManifest(artwork.components),
      });
      if (!result?.ok) throw new Error(result?.error || "完成记录生成失败");
      setStatus("已生成完成记录");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "完成记录生成失败");
    } finally {
      document.body.classList.remove("dockyard-exporting");
    }
  };
  const exportDelivery = async () => {
    if (!artwork) return;
    try {
      document.body.classList.add("dockyard-exporting");
      const dataUrl = await window.dockyard?.captureViewport();
      if (!dataUrl) throw new Error("无法导出当前画布");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${artwork.name}-开发素材.png`;
      link.click();
      await copyComponents();
      setStatus("开发图片已导出，组件信息已复制");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "开发素材导出失败");
    } finally {
      document.body.classList.remove("dockyard-exporting");
    }
  };
  const dropCandidate = (
    candidate: Candidate,
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    if (!candidate.previewDataUrl) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const elementId = uid("component-element");
    const item: ComponentInstance = {
      ...candidate,
      instanceId: uid("component"),
      elementId,
      sequence: nextComponentSequence(artwork?.components || []),
      status: "confirmed",
    };
    const element = createImageElement({
      x: Math.max(0, event.clientX - rect.left - 160),
      y: Math.max(0, event.clientY - rect.top - 90),
      width: 320,
      height: 180,
      fileId: elementId,
      customData: {
        dockyardType: "component",
        componentId: item.instanceId,
        componentSequence: item.sequence,
        source: candidate.docsUrl,
        previewKind: candidate.previewKind,
      },
    });
    updateArtwork((current) => ({
      ...current,
      components: [...current.components, item],
      scene: {
        ...current.scene,
        elements: [...current.scene.elements, element],
        files: {
          ...(current.scene.files || {}),
          [elementId]: {
            id: elementId,
            mimeType: "image/png",
            dataURL: candidate.previewDataUrl,
            created: Date.now(),
          },
        },
      },
    }));
    setStatus(`${candidate.name} 已加入画稿`);
  };
  const insertStory = (story: StorybookStory, x: number, y: number) => {
    if (!artwork) return;
    const instance: ComponentInstance = {
      id: story.id,
      name: story.name,
      library: story.sourceId,
      previewKind: "reference",
      description: story.title,
      docsUrl: story.storyUrl,
      instanceId: uid("component"),
      elementId: "",
      sequence: nextComponentSequence(artwork.components),
      status: "confirmed",
      sourceType: "storybook",
      sourceId: story.sourceId,
      storyId: story.id,
      storyName: story.name,
      storyTitle: story.title,
      storyUrl: story.storyUrl,
      boundsSource: "fallback",
      x,
      y,
      width: 320,
      height: 160,
      rotation: 0,
    };
    updateArtwork((current) => ({ ...current, components: [...current.components, instance], updatedAt: now() }));
    setStatus(`${story.title} / ${story.name} 已加入画稿`);
  };
  const dropStory = (story: StorybookStory, event: React.DragEvent<HTMLDivElement>) => {
    if (!artwork) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const appState = artwork.scene.appState || {};
    const zoom = Number((appState.zoom as any)?.value || appState.zoom || 1);
    const scrollX = Number(appState.scrollX || 0);
    const scrollY = Number(appState.scrollY || 0);
    insertStory(story, (event.clientX - rect.left) / zoom - scrollX - 160, (event.clientY - rect.top) / zoom - scrollY - 80);
  };
  const addStory = (story: StorybookStory) => {
    if (!artwork) return;
    const appState = artwork.scene.appState || {};
    const zoom = Number((appState.zoom as any)?.value || appState.zoom || 1);
    const scrollX = Number(appState.scrollX || 0);
    const scrollY = Number(appState.scrollY || 0);
    insertStory(story, 320 / zoom - scrollX - 160, 240 / zoom - scrollY - 80);
  };
  const importInputRef = useRef<HTMLInputElement>(null);
  const requestArtworkImport = () => importInputRef.current?.click();
  return (
    <div className="panel-shell annotator-panel">
      <main className="annotator-body-excalidraw">
        <input
          ref={importInputRef}
          className="canvas-import-input"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(event) => {
            importArtwork(event.target.files?.[0], workspace, update);
            event.currentTarget.value = "";
          }}
        />
        <SceneCanvas
          artwork={artwork}
          libraryItems={workspace.libraryItems || []}
          storybookSelection={workspace.storybookSelection}
          onStorySelection={(story) => update((current) => ({
            ...current,
            storybookSelection: { sourceId: story.sourceId, storyId: story.id, storyName: story.name, storyUrl: story.storyUrl },
          }))}
          onStoryAdd={addStory}
          updateArtwork={updateArtwork}
          onLibraryChange={(items) =>
            update(
              (current) => ({ ...current, libraryItems: items }),
              false,
            )
          }
          onCreateArtwork={createArtworkFromNativeImage}
          onDropCandidate={dropCandidate}
          onDropStory={dropStory}
          onChooseArtwork={() => setArtworkPickerOpen(true)}
          onSave={() => void saveNow()}
          onExportDelivery={() => void exportDelivery()}
          onCopyComponents={() => void copyComponents()}
          onComplete={() => void completeCurrentArtwork()}
        />
        {artwork && artwork.components.length > 0 && (
          <aside className="component-inventory" aria-label="当前稿件所用组件">
            <div className="component-inventory-header"><strong>当前稿件所用组件</strong><button type="button" onClick={() => void copyComponents()}>复制组件信息</button></div>
            {artwork.components.map((item) => <div className="component-inventory-item" key={item.instanceId}><span className="component-sequence">{item.sequence || "未编号"}</span><span><strong>{item.name}</strong><small>{item.storyName || item.storyId || item.library}</small></span></div>)}
          </aside>
        )}
        {status && (
          <div className="canvas-feedback" role="status" aria-live="polite">
            {status}
          </div>
        )}
      </main>
      <CanvasDialog
        open={artworkPickerOpen}
        title="选择图稿"
        onClose={() => setArtworkPickerOpen(false)}
      >
        <div className="artwork-picker-body">
          <div className="artwork-picker-heading">
            <span>{workspace.artworks.length} 张图稿</span>
            <button type="button" onClick={requestArtworkImport}>
              <ImagePlus size={16} />
              导入新图稿
            </button>
          </div>
          {workspace.bases?.length ? (
            <div className="artwork-picker-grid">
              {workspace.bases.map((base) => {
                const drafts = workspace.artworks.filter((item) => item.baseId === base.id);
                return <section className="artwork-base-group" key={base.id}>
                  <div className="artwork-base-heading"><strong>{base.name}</strong><button type="button" onClick={() => createDraftFromBase(base.id)}><Plus size={14} />新建稿件</button></div>
                  {drafts.map((item) => {
                    const preview = item.status === "completed" ? item.completedPreviewDataUrl : (item.annotatedPreviewDataUrl || item.source?.dataUrl || base.source.dataUrl);
                    const selected = item.id === artwork?.id;
                    return <button key={item.id} type="button" className={`artwork-picker-item${selected ? " selected" : ""}${item.status === "completed" ? " completed" : ""}`} onClick={() => selectArtwork(item.id)} aria-pressed={selected}>
                      <span className="artwork-picker-preview">{preview ? <img src={preview} alt="" /> : <ImagePlus size={20} />}</span>
                      <span className="artwork-picker-copy"><strong>{item.name}</strong><small>{item.status === "completed" ? "已完成记录" : "未完成稿件"} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</small></span>
                      {selected && <Check className="artwork-picker-check" size={16} />}
                    </button>;
                  })}
                </section>;
              })}
            </div>
          ) : (
            <div className="artwork-picker-empty">
              <ImagePlus size={24} />
              <strong>还没有图稿</strong>
              <span>导入一张图片后即可开始标注</span>
            </div>
          )}
        </div>
      </CanvasDialog>
      <CanvasDialog
        open={Boolean(saveSummary)}
        title="已保存到 Dockyard"
        onClose={() => setSaveSummary(null)}
      >
        {saveSummary && (
          <div className="save-summary-body">
            <p>“{saveSummary.artworkName}”已保存到本地工作区。</p>
            <dl className="save-summary-location">
              <div>
                <dt>工作区文件</dt>
                <dd title={saveSummary.path}>{saveSummary.path}</dd>
              </div>
            </dl>
            <section className="save-summary-contents" aria-label="已保存内容">
              <strong>本次保存包含</strong>
              <ul>
                <li>原图</li>
                <li>画板场景、标注与绘图</li>
                <li>标注预览图</li>
                <li>
                  已采用组件{saveSummary.componentCount
                    ? `（${saveSummary.componentCount} 个）`
                    : "（当前无）"}
                  与工作区组件资料
                </li>
              </ul>
            </section>
            <div className="save-summary-actions">
              <button type="button" onClick={() => setSaveSummary(null)} autoFocus>
                完成
              </button>
            </div>
          </div>
        )}
      </CanvasDialog>
      <CanvasDialog
        open={Boolean(recordArtworkId)}
        title="完成记录"
        onClose={() => setRecordArtworkId(null)}
      >
        {recordArtworkId && (() => {
          const record = workspace.artworks.find((item) => item.id === recordArtworkId);
          if (!record) return null;
          return <div className="record-viewer">
            {record.completedPreviewDataUrl && <img src={record.completedPreviewDataUrl} alt={`${record.name} 完成稿`} />}
            <pre>{record.completedComponentsText || "暂无组件信息"}</pre>
          </div>;
        })()}
      </CanvasDialog>
    </div>
  );
}
function ComponentSearchView() {
  const { workspace, update } = useWorkspace();
  const artwork = activeArtwork(workspace);
  const [instruction, setInstruction] = useState(
    "根据手绘组件草图，寻找最接近的真实组件",
  );
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("等待组件草图");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [cache, setCache] = useState<CacheStatus | null>(null);
  useEffect(() => {
    void window.dockyard
      ?.componentCacheStatus()
      .then((value) => setCache(value || null));
  }, []);
  useEffect(
    () =>
      window.dockyard?.onCodexTrace((trace) => {
        setDiagnostics((current) => [...current, trace.message]);
        if (trace.stage === "starting" || trace.stage === "failed")
          setStatus(trace.message);
      }),
    [],
  );
  const runSearch = async () => {
    if (!artwork) return;
    const canvas = document.querySelector(
      ".sketch-box canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    setSearching(true);
    setDiagnostics([]);
    setStatus("正在理解草图、查找官方组件并生成预览…");
    const result = await window.dockyard?.runCodexSearch({
      instruction,
      sketchDataUrl: canvas.toDataURL("image/png"),
    });
    setCandidates(result?.candidates || []);
    setDiagnostics((current) => [
      ...current,
      ...(result?.diagnostics || []).filter((item) => !current.includes(item)),
    ]);
    setStatus(
      result?.source === "cache"
        ? "已使用 14 天候选缓存"
        : result?.error || `${result?.candidates.length || 0} 个真实预览已就绪`,
    );
    setSearching(false);
    void window.dockyard
      ?.componentCacheStatus()
      .then((value) => setCache(value || null));
  };
  const addGlobal = (candidate: Candidate) => {
    if (!candidate.previewDataUrl) return;
    const global: GlobalComponent = {
      ...candidate,
      globalId: uid("global-component"),
      createdAt: now(),
    };
    update((current) => ({
      ...current,
      globalComponents: [...current.globalComponents, global],
    }));
  };
  const addToArtwork = (candidate: Candidate) => {
    if (!artwork || !candidate.previewDataUrl) return;
    const elementId = uid("component-element");
    const instance: ComponentInstance = {
      ...candidate,
      instanceId: uid("component"),
      elementId,
      status: "confirmed",
    };
    const element = createImageElement({
      x: 120,
      y: 120,
      width: 320,
      height: 180,
      fileId: elementId,
      customData: {
        dockyardType: "component",
        componentId: instance.instanceId,
        source: candidate.docsUrl,
        previewKind: candidate.previewKind,
      },
    });
    update((current) => ({
      ...current,
      artworks: current.artworks.map((item) =>
        item.id === artwork.id
          ? {
              ...item,
              components: [...item.components, instance],
              scene: {
                ...item.scene,
                elements: [...item.scene.elements, element],
                files: {
                  ...(item.scene.files || {}),
                  [elementId]: {
                    id: elementId,
                    mimeType: "image/png",
                    dataURL: candidate.previewDataUrl,
                    created: Date.now(),
                  },
                },
              },
            }
          : item,
      ),
    }));
    openPanel("annotator");
  };
  return (
    <div className="panel-shell compact-panel">
      <WindowHeader
        title="组件检索"
        eyebrow="COMPONENT SCOUT / REAL PREVIEW"
        onClose={() => void window.dockyard?.closePanel("component-search")}
      />
      <main className="search-page">
        <div className="search-grid">
          <section>
            <div className="search-intro">
              <span className="eyebrow">ONLY HAND-DRAWN SKETCH</span>
              <h2>从草图找到真实组件</h2>
              <p>候选由官方来源安装并实际渲染；没有可用预览的条目不会显示。</p>
            </div>
            {!artwork && (
              <div className="search-status" role="status">
                <CircleAlert size={16} />
                先选择一张图稿
              </div>
            )}
            <div className="sketch-box">
              <Suspense fallback={<div className="excalidraw-loading" role="status">正在加载画布…</div>}>
              <LazyExcalidraw
                initialData={emptyScene() as any}
                langCode="zh-CN"
                theme="light"
                UIOptions={{
                  canvasActions: {
                    changeViewBackgroundColor: true,
                    loadScene: false,
                    saveToActiveFile: false,
                    export: false,
                  },
                }}
              />
              </Suspense>
            </div>
            <label className="field-label" htmlFor="component-instruction">
              检索说明
            </label>
            <textarea
              id="component-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              disabled={!artwork}
            />
            <button
              className="search-btn"
              onClick={runSearch}
              disabled={searching || !artwork}
              aria-busy={searching}
            >
              <WandSparkles size={17} />
              {searching ? "正在生成真实预览…" : "检索 shadcn/ui"}
            </button>
            <div className="cache-status">
              <span>
                缓存：{cache?.candidateCount || 0} 项 ·{" "}
                {Math.round((cache?.bytes || 0) / 1024 / 1024)} MB · 14 天
              </span>
              <button
                className="cache-clear"
                onClick={async () =>
                  setCache(
                    (await window.dockyard?.clearComponentCache()) || null,
                  )
                }
              >
                <Trash2 size={14} />
                清理
              </button>
              <button
                className="cache-clear"
                onClick={() => void window.dockyard?.openCodexLogs()}
              >
                查看调用记录
              </button>
            </div>
          </section>
          <section aria-live="polite">
            <div className="search-status">{status}</div>
            {!!diagnostics.length && (
              <ol className="search-trace" aria-label="组件检索调用记录">
                {diagnostics.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ol>
            )}
            <div className="candidate-list">
              {candidates.map((candidate) => (
                <article
                  className="candidate-card"
                  key={candidate.id}
                  draggable={Boolean(candidate.previewDataUrl)}
                  onDragStart={(event) =>
                    event.dataTransfer.setData(
                      "application/x-dockyard-candidate",
                      JSON.stringify(candidate),
                    )
                  }
                >
                  <div className="candidate-thumb">
                    <img
                      src={candidate.previewDataUrl}
                      alt={`${candidate.name} 的实际渲染预览`}
                    />
                  </div>
                  <div className="candidate-body">
                    <div className="candidate-info">
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.registryItem || candidate.library} ·{" "}
                        {candidate.cacheHit ? "缓存" : "刚刚渲染"}
                      </small>
                      <p>{candidate.description || "官方组件候选"}</p>
                      <div className="candidate-links">
                        <a
                          href={candidate.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          官方文档
                        </a>
                        <a
                          href={candidate.codeUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          源码
                        </a>
                      </div>
                    </div>
                    <div className="candidate-actions">
                      <button onClick={() => addGlobal(candidate)}>
                        加入全局组件
                      </button>
                      <button
                        className="candidate-add"
                        onClick={() => addToArtwork(candidate)}
                        disabled={!artwork || !candidate.previewDataUrl}
                      >
                        <Plus size={15} />
                        加入画稿
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {!candidates.length && (
                <div className="canvas-empty-state">
                  <Search size={25} />
                  <p>真实候选会显示在这里</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
function TokensView() {
  const groups = useMemo(
    () =>
      projectTokenData.tokens.reduce<
        Record<string, typeof projectTokenData.tokens>
      >((acc, token) => {
        (acc[token.category] ||= []).push(token);
        return acc;
      }, {}),
    [],
  );
  return (
    <div className="panel-shell compact-panel">
      <WindowHeader
        title="项目 Token"
        eyebrow="TOKENS / BASELINE"
        onClose={() => void window.dockyard?.closePanel("tokens")}
      />
      <main className="token-page">
        <div className="state-banner">
          <ShieldCheck size={17} />
          <div>
            <strong>当前基线</strong>
            <span>
              {projectTokenData.tokens.length} 个 Token · 已生成语义 CSS 变量
            </span>
          </div>
        </div>
        <div className="token-groups">
          {Object.entries(groups).map(([category, tokens]) => (
            <section key={category}>
              <div className="token-group-heading">
                <span>{category}</span>
                <small>{tokens.length} 个</small>
              </div>
              {tokens.map((token) => (
                <div className="token-row" key={token.path}>
                  <code>{token.path}</code>
                  <strong>{String(token.value)}</strong>
                  <span>{token.description}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
function DecisionsView() {
  return (
    <div className="panel-shell compact-panel">
      <WindowHeader
        title="设计决策"
        eyebrow="DECISIONS / CONFIRMED"
        onClose={() => void window.dockyard?.closePanel("decisions")}
      />
      <main className="decision-page">
        <div className="state-banner">
          <ShieldCheck size={17} />
          <div>
            <strong>设计决策</strong>
            <span>候选变更经确认后会记录在这里。</span>
          </div>
        </div>
      </main>
    </div>
  );
}
function App() {
  const view = new URLSearchParams(window.location.search).get("view") || "bar";
  if (view === "annotator") window.name = EXCALIDRAW_ANNOTATOR_WINDOW_NAME;
  document.body.dataset.view = view;
  document.title =
    view === "annotator"
      ? "画板"
      : view === "component-search"
        ? "组件检索"
        : view === "tokens"
          ? "设计令牌"
          : view === "decisions"
            ? "设计决策"
            : "Dockyard";
  if (view === "component-search") return <ComponentSearchView />;
  if (view === "tokens") return <TokensView />;
  if (view === "decisions") return <DecisionsView />;
  return view === "bar" ? <BarView /> : <AnnotatorView />;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
