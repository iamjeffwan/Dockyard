/// <reference types="vite/client" />

import type {
  StorybookCatalog,
  StorybookSearchResult,
  StorybookSource,
  ProjectStatus,
  StorybookMeasureResult,
  Workspace,
} from "./types";
import type { ModelRecognitionResult } from "../electron/model-recognition.js";

declare global {
  interface Window {
    dockyard?: {
      saveWorkspace: (
        workspace: Workspace,
      ) => Promise<{ ok: boolean; path?: string; error?: string }>;
      loadWorkspace: () => Promise<Workspace | null>;
      runStorybookSearch: (payload: unknown) => Promise<StorybookSearchResult>;
      recognizeSketch: (payload: { imageDataUrl: string; prompt: string }) => Promise<ModelRecognitionResult>;
      openAppLogs: () => Promise<string>;
      writeLog: (level: "debug" | "info" | "warn" | "error", event: string, context?: Record<string, unknown>) => void;
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
        view: "annotator" | "tokens" | "decisions",
      ) => Promise<void>;
      closePanel: (
        view: "annotator" | "tokens" | "decisions",
      ) => Promise<void>;
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
