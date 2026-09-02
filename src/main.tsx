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
import { MainMenu } from "@excalidraw/excalidraw";
import {
  Box,
  FlaskConical,
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
  ShieldCheck,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
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
  StorybookStory,
} from "./types";
import {
  ExcalidrawCanvas,
  createImageElement,
  emptyScene,
  ensureSourceScene,
  readImage,
} from "./canvas";
import {
  ComponentInventory,
  PrototypeOverlay,
  StorybookSidebar,
  createViewportChannel,
} from "./overlay";
import { createDeliveryModule } from "./delivery/module";
import { ExportImageDialog, type ExportImageOptions } from "./delivery/ExportImageDialog";
import { ModelAbTestView } from "./model-ab-test/ModelAbTestView";
import { useWorkspace } from "./workspace/useWorkspace";
import {
  EXCALIDRAW_ANNOTATOR_WINDOW_NAME,
} from "./excalidraw-library-host";
import "@excalidraw/excalidraw/index.css";
import "./carbon.scss";
import "./styles.css";
import projectTokenData from "../design/project-tokens.json";

const LazyExcalidraw = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");
  return { default: module.Excalidraw };
});
const LazySidebarTrigger = lazy(async () => {
  const module = await import("./excalidraw-ui");
  return { default: module.StorybookSidebarTrigger };
});

function CanvasMainMenu({
  hasArtwork,
  onChooseArtwork,
  onSave,
  onExportImage,
  onComplete,
}: {
  hasArtwork: boolean;
  onChooseArtwork: () => void;
  onSave: () => void;
  onExportImage: () => void;
  onComplete: () => void;
}) {
  return (
    <MainMenu>
      <MainMenu.Item icon={<FolderOpen size={16} />} onSelect={onChooseArtwork}>选择图稿</MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Item icon={<Save size={16} />} onSelect={onSave} disabled={!hasArtwork}>保存到 Dockyard</MainMenu.Item>
      <MainMenu.Item icon={<ImagePlus size={16} />} onSelect={onExportImage} disabled={!hasArtwork}>导出图片</MainMenu.Item>
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
const nextComponentSequence = (components: ComponentInstance[]) => {
  const used = new Set(
    components
      .map((item) => item.sequence)
      .filter((value): value is string => Boolean(value)),
  );
  let index = 1;
  while (used.has(String(index))) index += 1;
  return String(index);
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
  view: "annotator" | "component-search" | "tokens" | "decisions" | "model-ab-test",
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
      <button className="bar-context" disabled={!projectStatus.current} onClick={() => openPanel("model-ab-test")}>
        <FlaskConical size={17} />
        <span>模型测试</span>
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

function AnnotatorView() {
  const { workspace, update, save, dispatch } = useWorkspace();
  const viewportChannel = useMemo(() => createViewportChannel({ zoom: 1, scrollX: 0, scrollY: 0, width: 0, height: 0 }), []);
  const [status, setStatus] = useState("");
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [recordArtworkId, setRecordArtworkId] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{
    path: string;
    artworkName: string;
    componentCount: number;
  } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const artwork = activeArtwork(workspace);
  const delivery = useMemo(
    () =>
      createDeliveryModule({
        captureImage: async () => {
          document.body.classList.add("dockyard-exporting");
          try {
            return await window.dockyard?.captureViewport() || null;
          } finally {
            document.body.classList.remove("dockyard-exporting");
          }
        },
        writeClipboard: (value) => navigator.clipboard.writeText(value),
        copyImage: async (dataUrl) => {
          const blob = await fetch(dataUrl).then((response) => response.blob());
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type || "image/png"]: blob }),
          ]);
        },
        download: (value, fileName) => {
          const link = document.createElement("a");
          link.href = value;
          link.download = fileName;
          link.click();
        },
        completeArtwork: (payload) =>
          window.dockyard?.completeArtwork({ ...payload, persistOnly: true }) ||
          Promise.resolve({ ok: false, error: "完成记录接口不可用" }),
      }),
    [],
  );
  useEffect(() => () => viewportChannel.dispose(), [viewportChannel]);
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
    if (preview) await update(() => next, false);
    const result = await save();
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
    const result = await delivery.execute({
      type: "component-list",
      target: "clipboard",
      artworkId: artwork.id,
      artworkName: artwork.name,
      componentsText: componentManifest(artwork.components),
    });
    setStatus(result.ok ? "组件信息已复制" : result.error);
  };
  const copyImage = async () => {
    if (!artwork) return;
    const result = await delivery.execute({
      type: "image",
      target: "clipboard",
      artworkId: artwork.id,
      artworkName: artwork.name,
      componentsText: componentManifest(artwork.components),
    });
    if (!result.ok) throw new Error(result.error);
    setStatus("图片已复制");
  };
  const removeComponent = (instanceId: string) => {
    if (!artwork || !window.confirm("确定移除这个组件吗？")) return;
    updateArtwork((current) => ({
      ...current,
      components: current.components.filter((item) => item.instanceId !== instanceId),
      scene: {
        ...current.scene,
        elements: current.scene.elements.filter((element) => element.customData?.componentId !== instanceId),
        files: Object.fromEntries(Object.entries(current.scene.files || {}).filter(([fileId]) => !current.components.some((item) => item.instanceId === instanceId && item.elementId === fileId))),
      },
      updatedAt: now(),
    }));
  };
  const openExportImage = async () => {
    if (!artwork) return;
    setExportDialogOpen(true);
    document.body.classList.add("dockyard-exporting");
    try {
      const preview = await window.dockyard?.captureViewport();
      if (!preview) throw new Error("无法生成导出预览，请重试");
      setExportPreview(preview);
    } catch (error) {
      setExportPreview(null);
      setExportDialogOpen(false);
      setStatus(error instanceof Error && error.message ? error.message : "无法生成导出预览，请重试");
    } finally {
      document.body.classList.remove("dockyard-exporting");
    }
  };
  const exportImage = async (options: ExportImageOptions) => {
    if (!artwork) return;
    document.body.classList.add("dockyard-exporting");
    let image: string | null = null;
    try { image = await window.dockyard?.captureViewport() || null; }
    finally { document.body.classList.remove("dockyard-exporting"); }
    if (!image) throw new Error("无法导出当前画布");
    const scaledImage = options.scale === 1 ? image : await new Promise<string>((resolve, reject) => {
      const source = new Image();
      source.onload = () => { const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth * options.scale; canvas.height = source.naturalHeight * options.scale; const context = canvas.getContext("2d"); if (!context) return reject(new Error("无法调整导出倍率")); context.drawImage(source, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/png")); };
      source.onerror = () => reject(new Error("无法处理导出图片")); source.src = image;
    });
    const result = await delivery.execute({ type: "image", target: "download", artworkId: artwork.id, artworkName: artwork.name, componentsText: componentManifest(artwork.components), imageDataUrl: scaledImage });
    if (!result.ok) throw new Error(result.error);
    if (options.includeComponents) {
      const listResult = await delivery.execute({ type: "component-list", target: "download", artworkId: artwork.id, artworkName: artwork.name, componentsText: componentManifest(artwork.components) });
      if (!listResult.ok) throw new Error(listResult.error);
    }
    setStatus(options.includeComponents ? "图片和组件清单已导出" : "图片已导出");
    setExportDialogOpen(false);
  };
  const completeCurrentArtwork = async () => {
    if (!artwork) return;
    setStatus("正在生成完成记录…");
    try {
      const result = await delivery.execute({
        type: "complete",
        artworkId: artwork.id,
        artworkName: artwork.name,
        componentsText: componentManifest(artwork.components),
      });
      if (!result.ok) throw new Error(result.error);
      const stored = await dispatch({
        type: "complete-artwork",
        artworkId: artwork.id,
        completedAt: new Date().toISOString(),
        previewDataUrl: result.previewDataUrl || "",
        componentsText: componentManifest(artwork.components),
        record: result.record as Artwork["record"],
      });
      if (!stored.ok) throw new Error(stored.error);
      setStatus("已生成完成记录");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "完成记录生成失败");
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
      width: 230,
      height: 120,
      rotation: 0,
    };
    updateArtwork((current) => ({ ...current, components: [...current.components, instance], updatedAt: now() }));
    setStatus(`${story.title} / ${story.name} 已加入画稿`);
  };
  const dropStory = (story: StorybookStory, event: React.DragEvent<HTMLDivElement>) => {
    if (!artwork) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const current = viewportChannel.getSnapshot();
    insertStory(story, (event.clientX - rect.left) / current.zoom - current.scrollX - 115, (event.clientY - rect.top) / current.zoom - current.scrollY - 60);
  };
  const addStory = (story: StorybookStory) => {
    if (!artwork) return;
    const current = viewportChannel.getSnapshot();
    const centerX = current.width / 2 / current.zoom - current.scrollX;
    const centerY = current.height / 2 / current.zoom - current.scrollY;
    insertStory(story, centerX - 115, centerY - 60);
  };
  const handleCanvasExternalDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const storyRaw = event.dataTransfer.getData("application/x-dockyard-story");
    if (storyRaw) {
      event.preventDefault();
      event.stopPropagation();
      dropStory(JSON.parse(storyRaw), event);
      return;
    }
    const candidateRaw = event.dataTransfer.getData(
      "application/x-dockyard-candidate",
    );
    if (!candidateRaw) return;
    event.preventDefault();
    event.stopPropagation();
    dropCandidate(JSON.parse(candidateRaw), event);
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
        <ExcalidrawCanvas
          artwork={artwork}
          viewport={viewportChannel}
          libraryItems={workspace.libraryItems || []}
          onSceneChange={(scene) =>
            updateArtwork(
              (item) => ({ ...item, scene, updatedAt: now() }),
              false,
            )
          }
          onLibraryChange={(items) =>
            update(
              (current) => ({ ...current, libraryItems: items }),
              false,
            )
          }
          onCreateArtwork={createArtworkFromNativeImage}
          onExternalDrop={handleCanvasExternalDrop}
          renderTopRightUI={() => (
            <Suspense fallback={null}>
              <LazySidebarTrigger />
            </Suspense>
          )}
          renderEditorUI={({ excalidrawAPI }) => (
            <>
              <StorybookSidebar
                selection={workspace.storybookSelection}
                onSelectionChange={(story) =>
                  update((current) => ({
                    ...current,
                    storybookSelection: {
                      sourceId: story.sourceId,
                      storyId: story.id,
                      storyName: story.name,
                      storyUrl: story.storyUrl,
                    },
                  }))
                }
                onStoryAdd={addStory}
                excalidrawAPI={excalidrawAPI}
              />
              <CanvasMainMenu
                hasArtwork={Boolean(artwork)}
                onChooseArtwork={() => setArtworkPickerOpen(true)}
                onSave={() => void saveNow()}
                onExportImage={() => void openExportImage()}
                onComplete={() => void completeCurrentArtwork()}
              />
            </>
          )}
          overlay={(
            <PrototypeOverlay
              components={artwork?.components || []}
              viewport={viewportChannel}
              interactionEnabled={true}
              onCommit={(instanceId, patch) =>
                updateArtwork((current) => ({
                  ...current,
                  components: current.components.map((item) =>
                    item.instanceId === instanceId ? { ...item, ...patch } : item,
                  ),
                  updatedAt: now(),
                }))
              }
            />
          )}
        />
        {artwork && (
          <ComponentInventory
            components={artwork.components}
            onRemove={removeComponent}
            onCopyImage={() => void copyImage().catch((error) => setStatus(error instanceof Error ? error.message : "图片复制失败"))}
            onCopy={() => void copyComponents()}
          />
        )}
        {status && (
          <div className="canvas-feedback" role="status" aria-live="polite">
            {status}
          </div>
        )}
      </main>
      <ExportImageDialog
        open={exportDialogOpen}
        artworkName={artwork?.name || "图稿"}
        previewDataUrl={exportPreview}
        onClose={() => setExportDialogOpen(false)}
        onExport={exportImage}
        onCopyImage={async () => { await copyImage(); setExportDialogOpen(false); }}
      />
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
              <button
                className="cache-clear"
                onClick={() => void window.dockyard?.openAppLogs()}
              >
                查看应用日志
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
  if (view === "model-ab-test") return <ModelAbTestView />;
  if (view === "tokens") return <TokensView />;
  if (view === "decisions") return <DecisionsView />;
  return view === "bar" ? <BarView /> : <AnnotatorView />;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

