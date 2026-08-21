import type { Workspace } from './types';

declare global {
  interface Window {
    dockyard?: {
      saveWorkspace: (workspace: Workspace) => Promise<{ ok: boolean; path: string }>;
      loadWorkspace: () => Promise<Workspace | null>;
      runCodexSearch: (payload: unknown) => Promise<{ candidates: any[]; source: string; error?: string }>;
      generateContext: (payload: unknown) => Promise<{ ok: boolean; path?: string; prompt?: string; error?: string }>;
      pickProject: () => Promise<{ path: string; name: string } | null>;
      openContext: (path: string) => Promise<void>;
      syncDesign: (workspace: Workspace) => void;
      openPanel: (view: 'annotator' | 'component-search') => Promise<void>;
      closePanel: (view: 'annotator' | 'component-search') => Promise<void>;
      showBar: () => Promise<void>;
      hideBar: () => Promise<void>;
      onDesignState: (listener: (workspace: Workspace) => void) => () => void;
      mcpPort: () => Promise<number>;
    };
  }
}

export {};
