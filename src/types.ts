import type { LibraryItems } from "@excalidraw/excalidraw/types";

export type Tool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "eraser"
  | "image"
  | "hand"
  | "sketch";

export type Annotation = {
  id: string;
  type: "region" | "note";
  comment: string;
  status: "requested";
  elementIds: string[];
};

export type Candidate = {
  id: string;
  name: string;
  library: string;
  registryItem?: string;
  version?: string;
  previewUrl?: string;
  previewDataUrl?: string;
  previewKind: "official" | "rendered" | "reference";
  description?: string;
  docsUrl?: string;
  codeUrl?: string;
  previewStatus?: "ready" | "failed";
  cacheHit?: boolean;
  previewPath?: string;
  sourceCachePath?: string;
  sourceSandboxPath?: string;
  sourceId?: string;
  storyId?: string;
  storyName?: string;
  storyTitle?: string;
  storyUrl?: string;
};

export type StorybookSource = {
  id: string;
  name: string;
  baseUrl: string;
  indexUrl: string;
  allowedOrigin: string;
  status?: "ready" | "unavailable" | "loading";
  storyCount?: number;
  checkedAt?: string;
  error?: string;
};

export type StorybookStory = {
  id: string;
  title: string;
  name: string;
  type: "story" | "docs";
  sourceId: string;
  storyUrl: string;
};

export type StorybookCatalog = {
  source: StorybookSource;
  stories: StorybookStory[];
};

export type MeasuredBounds = {
  width: number;
  height: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  selectionMethod?: "protocol" | "explicit-root" | "direct-child" | "union";
};

export type StorybookMeasureFailureReason =
  | "origin-denied"
  | "frame-not-found"
  | "navigation-failed"
  | "script-failed"
  | "target-not-found"
  | "unstable-layout"
  | "timeout";

export type StorybookMeasureResult =
  | { ok: true; bounds: MeasuredBounds; requestId?: string }
  | { ok: false; reason: StorybookMeasureFailureReason; detail?: string; requestId?: string };

export type StorybookSearchMatch = {
  sourceId: string;
  path: string;
  stories: StorybookStory[];
  status: "matched" | "path-not-found" | "source-not-found";
};

export type StorybookSearchResult = {
  matches: StorybookSearchMatch[];
  source: "codex" | "cache" | "error";
  error?: string;
  diagnostics?: string[];
};

export type ComponentSearchResult = {
  candidates: Candidate[];
  source: "shadcn-cli" | "cache" | "error";
  error?: string;
  diagnostics?: string[];
};

export type CodexTraceEvent = {
  invocationId: string;
  at: string;
  stage: "starting" | "event" | "completed" | "failed";
  message: string;
  eventType?: string;
};

export type CacheStatus = {
  candidateCount: number;
  bytes: number;
  expiresInDays: number;
};

export type ComponentInstance = Candidate & {
  instanceId: string;
  elementId: string;
  sequence?: string;
  status: "confirmed";
  sourceType?: "image" | "storybook";
  boundsSource?: "image" | "story-dom" | "electron-web-frame-main" | "fallback";
  boundsCacheKey?: string;
  loadStatus?: "loading" | "ready" | "unavailable";
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  frameViewportWidth?: number;
  frameViewportHeight?: number;
  contentOffsetX?: number;
  contentOffsetY?: number;
  rotation?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type GlobalComponent = Candidate & {
  globalId: string;
  createdAt: string;
};

export type SourceAsset = {
  name: string;
  path: string;
  dataUrl?: string;
  width: number;
  height: number;
  hash: string;
};

export type BaseArtwork = {
  id: string;
  name: string;
  source: SourceAsset;
  createdAt: string;
};

export type SceneData = {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: any[];
  appState?: Record<string, unknown>;
  files?: Record<string, any>;
};

export type Artwork = {
  id: string;
  baseId?: string;
  name: string;
  status?: "draft" | "completed";
  createdAt?: string;
  updatedAt: string;
  source: SourceAsset | null;
  scene: SceneData;
  annotations: Annotation[];
  components: ComponentInstance[];
  notes: string;
  annotatedPreviewDataUrl?: string;
  lastProjectPath?: string;
  completedAt?: string;
  record?: {
    previewPath: string;
    componentsTextPath: string;
    completedAt: string;
  };
  completedPreviewDataUrl?: string;
  completedComponentsText?: string;
};

export type ProjectRef = {
  path: string;
  name: string;
  lastUsedAt: string;
  workspaceId?: string;
  available?: boolean;
};

export type ProjectStatus = {
  current: ProjectRef | null;
  missingCurrent: ProjectRef | null;
  recent: ProjectRef[];
  hasWorkspace: boolean;
  error?: string;
};

export type Workspace = {
  version: 3;
  id: string;
  name: string;
  updatedAt: string;
  currentArtworkId: string | null;
  bases: BaseArtwork[];
  artworks: Artwork[];
  libraryItems: LibraryItems;
  globalComponents: GlobalComponent[];
  recentProjects: ProjectRef[];
  preferredLibraries: string[];
  storybookSources?: StorybookSource[];
  storybookSelection?: { sourceId: string; storyId: string; storyName?: string; storyUrl?: string };
  windowState: {
    bar?: { x: number; y: number };
    annotator?: { x: number; y: number };
    componentSearch?: { x: number; y: number };
  };
};

export type Design = Workspace;
