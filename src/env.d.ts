import type {
  CacheStatus,
  CodexTraceEvent,
  ComponentSearchResult,
  StorybookCatalog,
  StorybookSource,
  ProjectStatus,
  Workspace,
} from "./types";

declare global {
  interface Window {
    dockyard?: {
      saveWorkspace: (
        workspace: Workspace,
      ) => Promise<{ ok: boolean; path: string }>;
      loadWorkspace: () => Promise<Workspace | null>;
      runCodexSearch: (payload: unknown) => Promise<ComponentSearchResult>;
      onCodexTrace: (listener: (trace: CodexTraceEvent) => void) => () => void;
      openCodexLogs: () => Promise<string>;
      componentCacheStatus: () => Promise<CacheStatus>;
      clearComponentCache: () => Promise<CacheStatus>;
      generateContext: (
        payload: unknown,
      ) => Promise<{
        ok: boolean;
        path?: string;
        prompt?: string;
        error?: string;
      }>;
      pickProject: () => Promise<{ path: string; name: string } | null>;
      projectStatus: () => Promise<ProjectStatus>;
      openProject: (path: string) => Promise<{
        ok: boolean;
        needsCreation?: boolean;
        error?: string;
      }>;
      createProjectWorkspace: (path: string) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      openContext: (path: string) => Promise<void>;
      syncDesign: (workspace: Workspace) => void;
      openPanel: (
        view: "annotator" | "component-search" | "tokens" | "decisions",
      ) => Promise<void>;
      closePanel: (
        view: "annotator" | "component-search" | "tokens" | "decisions",
      ) => Promise<void>;
      showBar: () => Promise<void>;
      hideBar: () => Promise<void>;
      onDesignState: (listener: (workspace: Workspace) => void) => () => void;
      mcpPort: () => Promise<number>;
      storybookSources: () => Promise<StorybookSource[]>;
      storybookCatalog: (sourceId: string) => Promise<StorybookCatalog>;
      storybookCheck: (sourceId: string) => Promise<StorybookSource>;
      storybookMeasureFrame: (storyUrl: string) => Promise<{
        width: number; height: number; x: number; y: number;
        viewportWidth: number; viewportHeight: number;
        tag?: string; className?: string; boxShadow?: string; frameUrl?: string;
      }>;
      captureViewport: () => Promise<string | null>;
    };
  }
}

export {};
