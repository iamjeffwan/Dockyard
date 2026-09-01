import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImagePlus } from "lucide-react";
import type {
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { Artwork, SceneData, SourceAsset } from "../types";
import type { ViewportChannel } from "../overlay/viewport-channel";
import { viewportFromAppState } from "../overlay/viewport-channel";
import {
  EXCALIDRAW_ANNOTATOR_WINDOW_NAME,
  excalidrawLibraryReturnUrl,
} from "../excalidraw-library-host";
import { emptyScene, ensureSourceScene, readImage } from "./scene";

const LazyExcalidraw = lazy(async () => {
  const module = await import("@excalidraw/excalidraw");
  return { default: module.Excalidraw };
});

const LazyLibraryHandler = lazy(async () => {
  const module = await import("../excalidraw-ui");
  return { default: module.LibraryHandler };
});

export type ExcalidrawCanvasContext = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export type ExcalidrawCanvasProps = {
  artwork: Artwork | null;
  viewport: ViewportChannel;
  libraryItems: LibraryItems;
  onLibraryChange: (items: LibraryItems) => void;
  onSceneChange: (scene: SceneData) => void;
  onCreateArtwork: (source: SourceAsset, scene: SceneData) => void;
  onExternalDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  renderTopRightUI?: () => React.ReactElement | null;
  renderEditorUI?: (context: ExcalidrawCanvasContext) => ReactNode;
  overlay?: ReactNode;
};

const sceneContentSignature = (value: SceneData) =>
  JSON.stringify({ elements: value.elements, files: value.files || {} });

const acceptedDropTypes = [
  "application/x-dockyard-story",
  "application/x-dockyard-candidate",
];

export function ExcalidrawCanvas({
  artwork,
  viewport,
  libraryItems,
  onLibraryChange,
  onSceneChange,
  onCreateArtwork,
  onExternalDrop,
  renderTopRightUI,
  renderEditorUI,
  overlay,
}: ExcalidrawCanvasProps) {
  const scene = useMemo(
    () => (artwork ? ensureSourceScene(artwork.scene, artwork.source) : emptyScene()),
    [artwork?.id],
  );
  const initialCanvasData = useMemo(
    () => ({ ...scene, libraryItems }),
    [scene, libraryItems],
  );
  const last = useRef(sceneContentSignature(scene));
  const nativeImageSources = useRef(new Map<string, SourceAsset>());
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const libraryReturnUrl = useMemo(() => excalidrawLibraryReturnUrl(), []);

  useEffect(() => {
    last.current = sceneContentSignature(scene);
    const bounds = canvasWrapRef.current?.getBoundingClientRect();
    viewport.publish(
      viewportFromAppState(scene.appState || {}, {
        width: bounds?.width || 0,
        height: bounds?.height || 0,
      }),
    );
  }, [scene, viewport]);

  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const publishSize = () => {
      const current = viewport.getSnapshot();
      const bounds = node.getBoundingClientRect();
      viewport.publish({ ...current, width: bounds.width, height: bounds.height });
    };
    publishSize();
    const observer = new ResizeObserver(publishSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewport]);

  const handleCanvasScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (node.scrollLeft === 0 && node.scrollTop === 0) return;
    const scrollLeft = node.scrollLeft;
    const scrollTop = node.scrollTop;
    node.scrollLeft = 0;
    node.scrollTop = 0;
    window.dockyard?.writeLog("warn", "canvas.scroll_guard", {
      scrollLeft,
      scrollTop,
      reason: "unexpected-container-scroll",
    });
  };

  const generateIdForFile = async (file: File) => {
    const source = await readImage(file);
    nativeImageSources.current.set(source.hash, source);
    return source.hash;
  };

  const acceptsExternalDrop = (event: React.DragEvent<HTMLDivElement>) =>
    acceptedDropTypes.some((type) => event.dataTransfer.types.includes(type));

  return (
    <div
      ref={canvasWrapRef}
      className="excalidraw-wrap"
      data-library-return-url={libraryReturnUrl}
      data-library-target={EXCALIDRAW_ANNOTATOR_WINDOW_NAME}
      data-library-token={excalidrawAPI?.id || ""}
      onScroll={handleCanvasScroll}
      onDragOverCapture={(event) => {
        if (!acceptsExternalDrop(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragOver={(event) => {
        if (!acceptsExternalDrop(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDropCapture={onExternalDrop}
      onDrop={(event) => {
        if (!event.defaultPrevented) onExternalDrop(event);
      }}
    >
      <div className="excalidraw-grid" />
      <Suspense fallback={null}>
        <LazyLibraryHandler excalidrawAPI={excalidrawAPI} />
      </Suspense>
      <Suspense fallback={<div className="excalidraw-loading" role="status">正在加载画布…</div>}>
        <LazyExcalidraw
          key={artwork?.id || "dockyard-empty-canvas"}
          initialData={initialCanvasData as any}
          excalidrawAPI={setExcalidrawAPI}
          renderTopRightUI={renderTopRightUI}
          libraryReturnUrl={libraryReturnUrl}
          onLibraryChange={onLibraryChange}
          generateIdForFile={generateIdForFile}
          onChange={(elements, appState, files) => {
            const bounds = canvasWrapRef.current?.getBoundingClientRect();
            viewport.publish(
              viewportFromAppState(appState, {
                width: bounds?.width || 0,
                height: bounds?.height || 0,
              }),
            );
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
            const signature = sceneContentSignature(next);
            if (signature !== last.current) {
              last.current = signature;
              onSceneChange(next);
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
          {renderEditorUI?.({ excalidrawAPI })}
        </LazyExcalidraw>
      </Suspense>
      {overlay}
      {!artwork && (
        <div className="canvas-empty-callout" aria-hidden="true">
          <ImagePlus size={26} />
          <strong>拖入图片开始标注</strong>
          <span>也可在菜单中选择图稿或导入图片</span>
        </div>
      )}
      {artwork && <div className="canvas-hint">原图已锁定 · 可直接标注和绘图</div>}
    </div>
  );
}
