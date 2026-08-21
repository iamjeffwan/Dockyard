export type Tool = 'select' | 'rectangle' | 'ellipse' | 'arrow' | 'line' | 'freedraw' | 'text' | 'eraser' | 'image' | 'hand' | 'sketch';

export type Annotation = {
  id: string;
  type: 'region' | 'note';
  comment: string;
  status: 'requested';
  elementIds: string[];
};

export type Candidate = {
  id: string;
  name: string;
  library: string;
  version?: string;
  previewUrl?: string;
  previewDataUrl?: string;
  previewKind: 'official' | 'rendered' | 'reference';
  description?: string;
  docsUrl?: string;
  codeUrl?: string;
};

export type ComponentInstance = Candidate & {
  instanceId: string;
  elementId: string;
  status: 'confirmed';
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
  type: 'excalidraw';
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

export type ProjectRef = { path: string; name: string; lastUsedAt: string };

export type Workspace = {
  version: 2;
  id: string;
  name: string;
  updatedAt: string;
  currentArtworkId: string | null;
  artworks: Artwork[];
  globalComponents: GlobalComponent[];
  recentProjects: ProjectRef[];
  preferredLibraries: string[];
  windowState: { bar?: { x: number; y: number }; annotator?: { x: number; y: number }; componentSearch?: { x: number; y: number } };
};

export type Design = Workspace;
