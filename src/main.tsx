import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  MainMenu,
  Sidebar,
  convertToExcalidrawElements,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
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
  CacheStatus,
  Candidate,
  ComponentInstance,
  GlobalComponent,
  ProjectRef,
  SceneData,
  SourceAsset,
  Workspace,
  StorybookCatalog,
  StorybookSource,
  StorybookStory,
} from "./types";
import {
  EXCALIDRAW_ANNOTATOR_WINDOW_NAME,
  excalidrawLibraryReturnUrl,
} from "./excalidraw-library-host";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import projectTokenData from "../design/project-tokens.json";

const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();
const emptyScene = (): SceneData => ({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});
const emptyWorkspace: Workspace = {
  version: 2,
  id: uid("workspace"),
  name: "未命名设计",
  updatedAt: now(),
  currentArtworkId: null,
  artworks: [],
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
  const element = convertToExcalidrawElements([
    {
      type: "image",
      x: 0,
      y: 0,
      width: source.width,
      height: source.height,
      fileId: source.hash,
      status: "saved",
      scale: [1, 1],
      crop: null,
      locked: true,
      customData: { dockyardType: "source", assetHash: source.hash },
    } as any,
  ])[0];
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
    workspace.artworks.find((item) => item.id === workspace.currentArtworkId) ||
    workspace.artworks[0] ||
    null
  );
}

function createArtwork(
  source: SourceAsset,
  name: string,
  scene?: SceneData,
): Artwork {
  return {
    id: uid("artwork"),
    name,
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
  const [history, setHistory] = useState<Workspace[]>([]);
  const [future, setFuture] = useState<Workspace[]>([]);
  useEffect(() => {
    window.dockyard?.loadWorkspace().then((saved) => {
      if (saved) setWorkspace(saved);
    });
    return window.dockyard?.onDesignState((next) => setWorkspace(next));
  }, []);
  const update = useCallback(
    (producer: (current: Workspace) => Workspace, record = true) =>
      setWorkspace((current) => {
        const next = producer(current);
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
        window.dockyard?.syncDesign(next);
        return next;
      });
      return stack.slice(0, -1);
    });
  return {
    workspace,
    update,
    save: () =>
      window.dockyard?.saveWorkspace({ ...workspace, updatedAt: now() }),
    undo,
    redo,
    canUndo: Boolean(history.length),
    canRedo: Boolean(future.length),
  };
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
  onStoryDragStart,
}: {
  selection?: Workspace["storybookSelection"];
  onSelectionChange: (story: StorybookStory) => void;
  onStoryDragStart?: (event: React.DragEvent<HTMLButtonElement>, story: StorybookStory) => void;
}) {
  const [sources, setSources] = useState<StorybookSource[]>([]);
  const [sourceId, setSourceId] = useState(selection?.sourceId || "");
  const [catalog, setCatalog] = useState<StorybookCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("正在读取来源…");
  useEffect(() => {
    const request = window.dockyard?.storybookSources();
    if (!request) { setStatus("请在 Electron 中打开远程目录"); return; }
    void request.then((items) => {
      setSources(items || []);
      const next = selection?.sourceId || items?.[0]?.id || "";
      setSourceId(next);
    }).catch(() => setStatus("来源读取失败"));
  }, [selection?.sourceId]);
  useEffect(() => {
    if (!sourceId) return;
    setStatus("正在读取组件目录…");
    setCatalog(null);
    const request = window.dockyard?.storybookCatalog(sourceId);
    if (!request) { setStatus("请在 Electron 中打开远程目录"); return; }
    void request.then((next) => {
      setCatalog(next);
      setStatus(`${next.stories.length} 个故事`);
    }).catch(() => setStatus("目录读取失败"));
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
  return (
    <Sidebar name="dockyard-storybook" docked={false}>
      <Sidebar.Tabs>
        <Sidebar.Tab tab="stories">
          <Sidebar.Header>
            <div className="storybook-panel-heading"><span className="storybook-mark">S</span><strong>组件 Stories</strong></div>
            <select aria-label="组件来源" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </Sidebar.Header>
          <div className="storybook-panel-body">
            <label className="storybook-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="查找组件或故事" /></label>
            <small className="storybook-status">{status}</small>
            <div className="storybook-groups">
              {groups.map(([title, stories]) => <section key={title} className="storybook-group">
                <h3>{title}</h3>
                {stories.map((story) => <button key={story.id} type="button" draggable onClick={() => onSelectionChange(story)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dockyard-story", JSON.stringify(story)); onStoryDragStart?.(event, story); }} className={selection?.storyId === story.id ? "selected" : ""}><span className="story-icon">▱</span>{story.name}</button>)}
              </section>)}
              {!groups.length && <p className="storybook-empty">没有匹配的故事</p>}
            </div>
            {selection?.storyUrl && <div className="storybook-preview"><span>当前故事预览</span><iframe title={selection.storyName || selection.storyId} src={selection.storyUrl} /></div>}
          </div>
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
}

function RemoteStoryOverlayLayer({
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
      <iframe title={item.storyName || item.storyId || item.name} src={item.storyUrl} onLoad={() => { const request = window.dockyard?.storybookMeasureFrame(item.storyUrl!); if (!request) return; void request.then((measurement) => { onChange(item.instanceId, { width: measurement.width, height: measurement.height, intrinsicWidth: measurement.width, intrinsicHeight: measurement.height, boundsSource: "electron-web-frame-main" }); }).catch(() => { /* 固定安全边界作为回退 */ }); }} />
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
    const item = createArtwork(
      source,
      artworkName(workspace.artworks, source.name),
    );
    update((current) => ({
      ...current,
      currentArtworkId: item.id,
      artworks: [...current.artworks, item],
    }));
    if (openAfterImport) openPanel("annotator");
  });
}
function BarView() {
  const { workspace, update } = useWorkspace();
  const artwork = activeArtwork(workspace);
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) =>
      importArtwork(
        Array.from(event.clipboardData?.files || [])[0],
        workspace,
        update,
        true,
      );
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [workspace, update]);
  return (
    <div className="bar-shell">
      <div className="bar-drag-handle" aria-hidden="true" />
      <button
        className="bar-context active"
        onClick={() => openPanel("annotator")}
      >
        <Pencil size={17} />
        <span>图稿</span>
      </button>
      <button
        className="bar-context"
        onClick={() => openPanel("component-search")}
      >
        <Box size={17} />
        <span>组件</span>
      </button>
      <button className="bar-context" onClick={() => openPanel("tokens")}>
        <Palette size={17} />
        <span>Token</span>
      </button>
      <button className="bar-context" onClick={() => openPanel("decisions")}>
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

function CanvasMainMenu({
  hasArtwork,
  onChooseArtwork,
  onSave,
  onSendContext,
}: {
  hasArtwork: boolean;
  onChooseArtwork: () => void;
  onSave: () => void;
  onSendContext: () => void;
}) {
  return (
    <MainMenu>
      <MainMenu.Item icon={<FolderOpen size={16} />} onSelect={onChooseArtwork}>
        选择图稿
      </MainMenu.Item>
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.Item icon={<Save size={16} />} onSelect={onSave} disabled={!hasArtwork}>
        保存到 Dockyard
      </MainMenu.Item>
      <MainMenu.Item icon={<Send size={16} />} onSelect={onSendContext} disabled={!hasArtwork}>
        发送开发上下文
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Group title="Excalidraw links">
        <MainMenu.DefaultItems.Socials />
      </MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
}

function SceneCanvas({
  artwork,
  libraryItems,
  storybookSelection,
  onStorySelection,
  onStoryDragStart,
  updateArtwork,
  onLibraryChange,
  onCreateArtwork,
  onDropCandidate,
  onDropStory,
  onChooseArtwork,
  onSave,
  onSendContext,
}: {
  artwork: Artwork | null;
  libraryItems: LibraryItems;
  storybookSelection?: Workspace["storybookSelection"];
  onStorySelection: (story: StorybookStory) => void;
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
  onSendContext: () => void;
}) {
  const scene = useMemo(
    () =>
      artwork ? ensureSourceScene(artwork.scene, artwork.source) : emptyScene(),
    [artwork?.id],
  );
  const last = useRef(JSON.stringify(scene));
  const nativeImageSources = useRef(new Map<string, SourceAsset>());
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [canvasAppState, setCanvasAppState] = useState<any>(scene.appState);
  useHandleLibrary({ excalidrawAPI });
  const libraryReturnUrl = useMemo(() => excalidrawLibraryReturnUrl(), []);
  useEffect(() => {
    last.current = JSON.stringify(scene);
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
    >
      <div className="excalidraw-grid" />
      <Excalidraw
        key={artwork?.id || "dockyard-empty-canvas"}
        initialData={{ ...scene, libraryItems } as any}
        excalidrawAPI={setExcalidrawAPI}
        renderTopRightUI={() => <Sidebar.Trigger name="dockyard-storybook" tab="stories" title="打开组件 Stories">组件 Stories</Sidebar.Trigger>}
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
          const signature = JSON.stringify(next);
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
          canvasActions: {
            changeViewBackgroundColor: true,
            loadScene: false,
            saveToActiveFile: false,
            export: {},
          },
        }}
      >
        <StorybookSidebar selection={storybookSelection} onSelectionChange={onStorySelection} onStoryDragStart={onStoryDragStart} />
        <CanvasMainMenu
          hasArtwork={Boolean(artwork)}
          onChooseArtwork={onChooseArtwork}
          onSave={onSave}
          onSendContext={onSendContext}
        />
      </Excalidraw>
      <RemoteStoryOverlayLayer components={artwork?.components || []} appState={canvasAppState} onChange={(instanceId, patch) => updateArtwork((current) => ({ ...current, components: current.components.map((item) => item.instanceId === instanceId ? { ...item, ...patch } : item), updatedAt: now() }))} />
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
  const [saveSummary, setSaveSummary] = useState<{
    path: string;
    artworkName: string;
    componentCount: number;
  } | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextProject, setContextProject] = useState<ProjectRef | null>(null);
  const [contextPrompt, setContextPrompt] = useState("");
  const [contextResult, setContextResult] = useState<{
    ok: boolean;
    path?: string;
    error?: string;
  } | null>(null);
  const [generatingContext, setGeneratingContext] = useState(false);
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
    const preview = canvas?.toDataURL("image/png");
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
          path: result.path,
          artworkName: artwork.name,
          componentCount: artwork.components.length,
        });
      } else {
        setStatus("保存失败");
      }
    }
    return result;
  };
  const createArtworkFromNativeImage = (source: SourceAsset, scene: SceneData) => {
    update((current) => {
      const item = createArtwork(
        source,
        artworkName(current.artworks, source.name),
        scene,
      );
      return {
        ...current,
        currentArtworkId: item.id,
        artworks: [...current.artworks, item],
      };
    });
    setStatus("已将图片登记为新图稿");
  };
  const selectArtwork = (id: string) => {
    update((current) => ({ ...current, currentArtworkId: id }));
    setArtworkPickerOpen(false);
  };
  const openContextDialog = () => {
    const project =
      workspace.recentProjects.find(
        (item) => item.path === artwork?.lastProjectPath,
      ) || workspace.recentProjects.at(-1) || null;
    setContextProject(project);
    setContextPrompt(
      artwork
        ? `请根据 .dockyard/context/${artwork.id}/latest 中的图稿、标注和已采用组件实现本次界面。`
        : "",
    );
    setContextResult(null);
    setContextOpen(true);
  };
  const chooseContextProject = async () => {
    if (!artwork) return;
    const selected = await window.dockyard?.pickProject();
    if (!selected) return;
    const project: ProjectRef = { ...selected, lastUsedAt: now() };
    setContextProject(project);
    update((current) => ({
      ...current,
      recentProjects: [
        ...current.recentProjects.filter((item) => item.path !== project.path),
        project,
      ],
      artworks: current.artworks.map((item) =>
        item.id === artwork.id
          ? { ...item, lastProjectPath: project.path }
          : item,
      ),
    }));
  };
  const generateContext = async () => {
    if (!artwork || !contextProject) return;
    setGeneratingContext(true);
    const saved = await saveNow(true);
    if (!saved?.ok) {
      setContextResult({ ok: false, error: "保存失败，未生成开发上下文" });
      setGeneratingContext(false);
      return;
    }
    const result = await window.dockyard?.generateContext({
      projectPath: contextProject.path,
      artworkId: artwork.id,
      prompt: contextPrompt,
    });
    setContextResult(result || { ok: false, error: "生成失败" });
    setGeneratingContext(false);
    if (result?.ok) setStatus("开发上下文已生成");
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
      status: "confirmed",
    };
    const element = convertToExcalidrawElements([
      {
        type: "image",
        x: Math.max(0, event.clientX - rect.left - 160),
        y: Math.max(0, event.clientY - rect.top - 90),
        width: 320,
        height: 180,
        fileId: elementId,
        status: "saved",
        scale: [1, 1],
        crop: null,
        customData: {
          dockyardType: "component",
          componentId: item.instanceId,
          source: candidate.docsUrl,
          previewKind: candidate.previewKind,
        },
      } as any,
    ])[0];
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
  const dropStory = (story: StorybookStory, event: React.DragEvent<HTMLDivElement>) => {
    if (!artwork) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const appState = artwork.scene.appState || {};
    const zoom = Number((appState.zoom as any)?.value || appState.zoom || 1);
    const scrollX = Number(appState.scrollX || 0);
    const scrollY = Number(appState.scrollY || 0);
    const instance: ComponentInstance = {
      id: story.id,
      name: story.name,
      library: story.sourceId,
      previewKind: "reference",
      description: story.title,
      docsUrl: story.storyUrl,
      instanceId: uid("component"),
      elementId: "",
      status: "confirmed",
      sourceType: "storybook",
      sourceId: story.sourceId,
      storyId: story.id,
      storyName: story.name,
      storyTitle: story.title,
      storyUrl: story.storyUrl,
      boundsSource: "fallback",
      x: (event.clientX - rect.left) / zoom - scrollX - 160,
      y: (event.clientY - rect.top) / zoom - scrollY - 80,
      width: 320,
      height: 160,
      rotation: 0,
    };
    updateArtwork((current) => ({ ...current, components: [...current.components, instance], updatedAt: now() }));
    setStatus(`${story.title} / ${story.name} 已加入画稿`);
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
          onSendContext={openContextDialog}
        />
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
          {workspace.artworks.length ? (
            <div className="artwork-picker-grid">
              {workspace.artworks.map((item) => {
                const preview = item.annotatedPreviewDataUrl || item.source?.dataUrl;
                const selected = item.id === artwork?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`artwork-picker-item${selected ? " selected" : ""}`}
                    onClick={() => selectArtwork(item.id)}
                    aria-pressed={selected}
                  >
                    <span className="artwork-picker-preview">
                      {preview ? <img src={preview} alt="" /> : <ImagePlus size={20} />}
                    </span>
                    <span className="artwork-picker-copy">
                      <strong>{item.name}</strong>
                      <small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small>
                    </span>
                    {selected && <Check className="artwork-picker-check" size={16} />}
                  </button>
                );
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
        open={contextOpen}
        title="发送开发上下文"
        onClose={() => setContextOpen(false)}
      >
        <div className="context-dialog-body">
          <p>将当前图稿、标注、组件与提示词写入所选代码项目。</p>
          <div className="context-project-row">
            <div>
              <small>目标代码项目</small>
              <strong>{contextProject?.name || "尚未选择"}</strong>
            </div>
            <button type="button" onClick={() => void chooseContextProject()} autoFocus>
              选择项目
            </button>
          </div>
          <label className="field-label" htmlFor="development-context-prompt">
            开发提示词
          </label>
          <textarea
            id="development-context-prompt"
            value={contextPrompt}
            onChange={(event) => setContextPrompt(event.target.value)}
          />
          {contextResult && (
            <div className={`context-result${contextResult.ok ? " success" : " error"}`}>
              <span>{contextResult.ok ? "开发上下文已生成" : contextResult.error}</span>
              {contextResult.ok && contextResult.path && (
                <button
                  type="button"
                  onClick={() => void window.dockyard?.openContext(contextResult.path!)}
                >
                  打开目录
                </button>
              )}
            </div>
          )}
          <div className="context-dialog-actions">
            <button type="button" onClick={() => setContextOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="context-primary"
              onClick={() => void generateContext()}
              disabled={!contextProject || generatingContext}
            >
              <Send size={16} />
              {generatingContext ? "正在生成" : "生成开发上下文"}
            </button>
          </div>
        </div>
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
    const element = convertToExcalidrawElements([
      {
        type: "image",
        x: 120,
        y: 120,
        width: 320,
        height: 180,
        fileId: elementId,
        status: "saved",
        scale: [1, 1],
        crop: null,
        customData: {
          dockyardType: "component",
          componentId: instance.instanceId,
          source: candidate.docsUrl,
          previewKind: candidate.previewKind,
        },
      } as any,
    ])[0];
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
              <Excalidraw
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
