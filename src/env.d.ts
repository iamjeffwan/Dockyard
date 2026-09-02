/// <reference types="vite/client" />

import type {
  CacheStatus,
  CodexTraceEvent,
  ComponentSearchResult,
  StorybookCatalog,
  StorybookSearchResult,
  StorybookSource,
  ProjectStatus,
  StorybookMeasureResult,
  Workspace,
} from "./types";
import type { ModelAbRunRecord, ModelRecognitionResult } from "../electron/model-recognition";

declare global {
  interface Window {
    dockyard?: {
      saveWorkspace: (
        workspace: Workspace,
      ) => Promise<{ ok: boolean; path?: string; error?: string }>;
      loadWorkspace: () => Promise<Workspace | null>;
      runCodexSearch: (payload: unknown) => Promise<ComponentSearchResult>;
      runStorybookSearch: (payload: unknown) => Promise<StorybookSearchResult>;
      recognizeModel: (payload: { imageDataUrl: string; prompt: string; mode: "cli" | "sdk" }) => Promise<ModelRecognitionResult>;
      saveModelAbRun: (record: ModelAbRunRecord) => Promise<{ ok: boolean; path: string }>;
      onCodexTrace: (listener: (trace: CodexTraceEvent) => void) => () => void;
      openCodexLogs: () => Promise<string>;
      openAppLogs: () => Promise<string>;
      writeLog: (level: "debug" | "info" | "warn" | "error", event: string, context?: Record<string, unknown>) => void;
      componentCacheStatus: () => Promise<CacheStatus>;
      clearComponentCache: () => Promise<CacheStatus>;
      completeArtwork: (payload: unknown) => Promise<{
        ok: boolean;
        recordId?: string;
        error?: string;
      }>;
      pickProject: () => Promise<{ path: string; name: string } | null>;
      projectStatus: () => Promise<ProjectStatus>;
      openProject: (path: string) => Promise<{
        ok: boolean;
        needsCreation?: boolean;
        error?: string;
      }>;
      relinkProject: (previousPath: string, path: string) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      createProjectWorkspace: (path: string) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      syncDesign: (workspace: Workspace) => void;
      openPanel: (
        view: "annotator" | "component-search" | "tokens" | "decisions" | "model-ab-test",
      ) => Promise<void>;
      closePanel: (
        view: "annotator" | "component-search" | "tokens" | "decisions" | "model-ab-test",
      ) => Promise<void>;
      showBar: () => Promise<void>;
      hideBar: () => Promise<void>;
      onDesignState: (listener: (workspace: Workspace) => void) => () => void;
      storybookSources: () => Promise<StorybookSource[]>;
      storybookCatalog: (sourceId: string) => Promise<StorybookCatalog>;
      storybookCheck: (sourceId: string) => Promise<StorybookSource>;
      storybookMeasureFrame: (storyUrl: string) => Promise<StorybookMeasureResult>;
      captureViewport: () => Promise<string | null>;
    };
  }
}

export {};

declare module "*.svg" {
  const src: string;
  export default src;
}
