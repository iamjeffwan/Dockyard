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
  status: "confirmed";
  sourceType?: "image" | "storybook";
  boundsSource?: "image" | "electron-web-frame-main" | "fallback";
  loadStatus?: "loading" | "ready" | "unavailable";
  intrinsicWidth?: number;
  intrinsicHeight?: number;
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
  name: string;
  updatedAt: string;
  source: SourceAsset | null;
  scene: SceneData;
  annotations: Annotation[];
  components: ComponentInstance[];
  notes: string;
  annotatedPreviewDataUrl?: string;
  lastProjectPath?: string;
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
  version: 2;
  id: string;
  name: string;
  updatedAt: string;
  currentArtworkId: string | null;
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
