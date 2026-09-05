import electron from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { get as httpsGet } from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import {
  CodexCliTraceEvent,
  invokeCodexCliStructured,
  validateCodexCliConfig,
} from "./codex-cli-model.js";
import { failedRecognition, normalizeRecognitionOutput, recognitionInvocationId, recognitionSchema, type ModelRecognitionResult } from "./model-recognition.js";
import {
  classifyWindowOpen,
  isAllowedAppNavigation,
  isAllowedLibraryNavigation,
  isTrustedIpcSender,
} from "./external-navigation.js";
import {
  atomicWriteJson as atomicJson,
  readJsonFile as readJson,
  resolveInsideWorkspace,
  validateWorkspaceDocuments,
} from "./workspace-files.js";
import {
  initLogger,
  installProcessErrorHandlers,
  loggerDirectory,
  writeLog,
} from "./logger.js";
import { BAR_SIZE, resolveBarPosition } from "./window-position.js";
import type { StorybookCatalog, StorybookSource, StorybookStory } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { app, BrowserWindow, dialog, ipcMain, protocol, screen, session, shell, webFrameMain } = electron;
type BrowserWindow = Electron.BrowserWindow;

const execFileAsync = promisify(execFile);
type View = "annotator" | "tokens" | "decisions";
const now = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const nativeAppDataRoot =
  process.env.LOCALAPPDATA || app.getPath("appData");
const workspaceDataRoot =
  process.env.DOCKYARD_DATA_DIR ||
  (app.isPackaged
    ? join(nativeAppDataRoot, "Dockyard", "data")
    : join(process.cwd(), ".dockyard-data"));
app.setName("Dockyard");
app.setPath(
  "userData",
  process.env.DOCKYARD_USER_DATA_DIR ||
    join(nativeAppDataRoot, "Dockyard", app.isPackaged ? "runtime" : "runtime-dev"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "dockyard-static",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
if (process.platform === "win32" && process.env.DOCKYARD_DISABLE_GPU !== "0") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}
const chromiumLogDirectory = loggerDirectory();
app.commandLine.appendSwitch("enable-logging", "file");
app.commandLine.appendSwitch("log-file", join(chromiumLogDirectory, "chromium.log"));

let workspace: any = null;
let currentProjectPath: string | null = null;
let workspaceLoadError: string | null = null;
let barWindow: BrowserWindow | null = null;
const panelWindows = new Map<View, BrowserWindow>();
const candidateCacheDays = 14;
const shadcnNodeVersion = "22.13.1";
const shadcnRegistry = "@shadcn";
const storybookSources: StorybookSource[] = [
  {
    id: "storybook-design-system",
    name: "Storybook Design System",
    baseUrl: "https://master--5ccbc373887ca40020446347.chromatic.com",
    indexUrl: "https://master--5ccbc373887ca40020446347.chromatic.com/index.json",
    allowedOrigin: "https://master--5ccbc373887ca40020446347.chromatic.com",
  },
  {
    id: "carbon-react",
    name: "Carbon React",
    baseUrl: "https://react.carbondesignsystem.com",
    indexUrl: "https://react.carbondesignsystem.com/index.json",
    allowedOrigin: "https://react.carbondesignsystem.com",
  },
  {
    id: "jetbrains-ring-ui",
    name: "JetBrains Ring UI",
    baseUrl: "https://jetbrains.github.io/ring-ui/master",
    indexUrl: "https://jetbrains.github.io/ring-ui/master/index.json",
    allowedOrigin: "https://jetbrains.github.io",
  },
];
const storybookCatalogCache = new Map<string, { expiresAt: number; catalog: StorybookCatalog }>();
const storybookCacheMs = 10 * 60 * 1000;

function dataRoot() {
  return workspaceDataRoot;
}
function indexPath() {
  return join(dataRoot(), "index.json");
}
function projectRoot(projectPath: string) {
  return join(resolve(projectPath), ".dockyard");
}
function projectWorkspacePath(projectPath: string) {
  return join(projectRoot(projectPath), "design.json");
}
function projectMetadataPath(projectPath: string) {
  return join(projectRoot(projectPath), "workspace.json");
}
function validProjectPath(projectPath: unknown): projectPath is string {
  if (typeof projectPath !== "string" || !isAbsolute(projectPath)) return false;
  try {
    return statSync(projectPath).isDirectory();
  } catch {
    return false;
  }
}
function projectRef(projectPath: string, recent: any[] = [], workspaceId?: string) {
  const existing = recent.find((item) => item.path === projectPath);
  return {
    path: projectPath,
    name: basename(projectPath),
    lastUsedAt: existing?.lastUsedAt || now(),
    workspaceId: workspaceId || existing?.workspaceId,
  };
}
function updateProjectIndex(
  projectPath: string,
  recent: any[] = [],
  workspaceId?: string,
) {
  const next = projectRef(projectPath, recent, workspaceId);
  const projects = [
    next,
    ...recent.filter((item) => item.path !== projectPath),
  ].slice(0, 12);
  const index = readJson<any>(indexPath()) || {};
  atomicJson(indexPath(), {
    ...index,
    version: 2,
    currentProjectPath: projectPath,
    currentWorkspaceId: workspaceId || index.currentWorkspaceId,
    recentProjects: projects,
    lastOpenedAt: now(),
  });
  return projects;
}
function ensureProjectDirs(projectPath: string) {
  const root = projectRoot(projectPath);
  for (const dir of [
    "artworks",
    "drafts",
    "records",
    "assets/source",
    "assets/previews",
    "assets/components",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  const ignorePath = join(root, ".gitignore");
  if (!existsSync(ignorePath))
    writeFileSync(ignorePath, "# Dockyard 临时文件\n*.tmp\n", "utf8");
  return root;
}
function dataUrlToFile(dataUrl: string | undefined, filePath: string) {
  if (!dataUrl) return;
  const match = dataUrl.match(/^data:(.+?),(.*)$/);
  if (!match) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    match[1].includes(";base64")
      ? Buffer.from(match[2], "base64")
      : Buffer.from(decodeURIComponent(match[2]), "utf8"),
  );
}
function fileToDataUrl(path: string) {
  if (!existsSync(path)) return undefined;
  const extension = extname(path).toLowerCase();
  const mime =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}
function defaultScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
}
function defaultWorkspace() {
  return {
    version: 3,
    id: uid("workspace"),
    name: "未命名设计",
    updatedAt: now(),
    currentArtworkId: null,
    artworks: [],
    bases: [],
    libraryItems: [],
    globalComponents: [],
    recentProjects: [],
    preferredLibraries: ["shadcn/ui"],
    windowState: {},
  };
}
function loadGlobalComponents() {
  const items =
    readJson<any[]>(join(dataRoot(), "global-components", "index.json")) || [];
  for (const item of items)
    if (item.previewPath)
      item.previewDataUrl = fileToDataUrl(
        resolveInsideWorkspace(
          join(dataRoot(), "global-components"),
          item.previewPath,
        ),
      );
  return items;
}
function hydrateWorkspace(loaded: any, root: string) {
  loaded.libraryItems ||= [];
  loaded.bases ||= [];
  // Migrate the previous single-artwork model into a base plus draft artwork.
  for (const artwork of loaded.artworks || []) {
    artwork.status ||= "draft";
    artwork.createdAt ||= artwork.updatedAt || now();
    if (!artwork.baseId) {
      const baseId = `base-${artwork.id}`;
      artwork.baseId = baseId;
      if (artwork.source && !loaded.bases.some((base: any) => base.id === baseId))
        loaded.bases.push({ id: baseId, name: artwork.source.name || artwork.name, source: artwork.source, createdAt: artwork.createdAt });
    }
    const used = new Set<string>();
    for (const component of artwork.components || []) {
      if (!component.sequence || used.has(component.sequence)) {
        let index = used.size + 1;
        while (used.has(`C${index}`)) index += 1;
        component.sequence = `C${index}`;
      }
      used.add(component.sequence);
    }
  }
  for (const base of loaded.bases) {
    if (base.source?.path)
      base.source.dataUrl = fileToDataUrl(resolveInsideWorkspace(root, base.source.path));
  }
  loaded.globalComponents = loadGlobalComponents();
  for (const artwork of loaded.artworks || []) {
    if (artwork.status === "completed") {
      if (artwork.record?.previewPath)
        artwork.completedPreviewDataUrl = fileToDataUrl(resolveInsideWorkspace(root, artwork.record.previewPath));
      if (artwork.record?.componentsTextPath) {
        try { artwork.completedComponentsText = readFileSync(resolveInsideWorkspace(root, artwork.record.componentsTextPath), "utf8"); } catch { /* keep record metadata */ }
      }
      delete artwork.scene;
      delete artwork.source;
      continue;
    }
    const sceneCandidates = artwork.scenePath
      ? [artwork.scenePath]
      : [`drafts/${artwork.id}/scene.excalidraw.json`, `artworks/${artwork.id}/scene.excalidraw.json`];
    const scene = sceneCandidates
      .map((path: string) => readJson<any>(resolveInsideWorkspace(root, path)))
      .find(Boolean);
    artwork.scene =
      scene ||
        artwork.scene ||
        defaultScene();
    for (const file of Object.values<any>(artwork.scene.files || {}))
      if (file.path)
        file.dataURL = fileToDataUrl(resolveInsideWorkspace(root, file.path));
    if (artwork.source?.path)
      artwork.source.dataUrl = fileToDataUrl(
        resolveInsideWorkspace(root, artwork.source.path),
      );
    if (artwork.previewPath)
      artwork.annotatedPreviewDataUrl = fileToDataUrl(
        resolveInsideWorkspace(root, artwork.previewPath),
      );
  }
  return loaded;
}
function loadWorkspace() {
  const index = readJson<any>(indexPath());
  const recentProjects = Array.isArray(index?.recentProjects)
    ? index.recentProjects
    : [];
  currentProjectPath = validProjectPath(index?.currentProjectPath)
    ? index.currentProjectPath
    : null;
  if (currentProjectPath) {
    const designPath = projectWorkspacePath(currentProjectPath);
    const projectSaved = readJson<any>(designPath);
    if (projectSaved) {
      try {
        const metadata = readJson<any>(projectMetadataPath(currentProjectPath));
        validateWorkspaceDocuments(
          projectSaved,
          metadata || undefined,
          index?.currentWorkspaceId,
        );
        workspace = hydrateWorkspace(
          projectSaved,
          ensureProjectDirs(currentProjectPath),
        );
        workspace.recentProjects = recentProjects;
        workspace.windowState = index?.windowState || {};
        updateProjectIndex(currentProjectPath, recentProjects, workspace.id);
        workspaceLoadError = null;
        return workspace;
      } catch (error) {
        workspaceLoadError =
          error instanceof Error ? error.message : "工作区读取失败";
      }
    } else if (existsSync(designPath)) {
      workspaceLoadError = `工作区文件无法读取：${designPath}`;
    }
    currentProjectPath = null;
  }
  const loaded = defaultWorkspace();
  loaded.recentProjects = recentProjects;
  loaded.windowState = index?.windowState || {};
  workspace = loaded;
  atomicJson(indexPath(), {
    ...index,
    version: 2,
    lastOpenedAt: now(),
  });
  return loaded;
}
function saveWorkspace(next: any) {
  if (!currentProjectPath)
    return { ok: false, error: "请先选择代码项目，再保存工作区" };
  workspace = next;
  const root = ensureProjectDirs(currentProjectPath);
  const persisted = JSON.parse(JSON.stringify(next));
  delete persisted.globalComponents;
  delete persisted.recentProjects;
  delete persisted.windowState;
  persisted.version = 3;
  persisted.bases = (persisted.bases || []).map((base: any) => {
    const actual = (next.bases || []).find((item: any) => item.id === base.id) || base;
    if (actual.source?.dataUrl && actual.source.hash) {
      const sourcePath = `assets/source/${actual.source.hash}.png`;
      dataUrlToFile(actual.source.dataUrl, resolveInsideWorkspace(root, sourcePath));
      base.source = { ...actual.source, dataUrl: undefined, path: sourcePath };
      delete base.source.dataUrl;
    }
    return base;
  });
  for (const artwork of persisted.artworks || []) {
    const actual = next.artworks.find((item: any) => item.id === artwork.id);
    if (artwork.status === "completed") {
      delete artwork.completedPreviewDataUrl;
      delete artwork.completedComponentsText;
      delete artwork.scene;
      delete artwork.source;
      delete artwork.components;
      delete artwork.annotations;
      delete artwork.notes;
      continue;
    }
    const artworkRoot = resolveInsideWorkspace(root, `drafts/${artwork.id}`);
    mkdirSync(artworkRoot, { recursive: true });
    const scene = JSON.parse(JSON.stringify(actual.scene || defaultScene()));
    for (const [fileId, file] of Object.entries<any>(scene.files || {})) {
      if (!file.dataURL) continue;
      const isSource = actual.source?.hash === fileId;
      const extension = file.mimeType?.includes("svg") ? "svg" : "png";
      const relative = isSource
        ? `assets/source/${fileId}.png`
        : `assets/components/${fileId}.${extension}`;
      dataUrlToFile(file.dataURL, resolveInsideWorkspace(root, relative));
      delete file.dataURL;
      file.path = relative;
    }
    atomicJson(join(artworkRoot, "scene.excalidraw.json"), scene);
    delete artwork.scene;
    artwork.scenePath = `drafts/${artwork.id}/scene.excalidraw.json`;
    atomicJson(join(artworkRoot, "draft.json"), {
      id: artwork.id,
      baseId: artwork.baseId,
      name: artwork.name,
      status: artwork.status || "draft",
      createdAt: artwork.createdAt,
      updatedAt: artwork.updatedAt,
      components: actual.components || [],
      scenePath: artwork.scenePath,
    });
    if (actual.source?.dataUrl && actual.source.hash) {
      const sourcePath = `assets/source/${actual.source.hash}.png`;
      dataUrlToFile(
        actual.source.dataUrl,
        resolveInsideWorkspace(root, sourcePath),
      );
      artwork.source = {
        ...artwork.source,
        dataUrl: undefined,
        path: sourcePath,
      };
      delete artwork.source.dataUrl;
    }
    if (actual.annotatedPreviewDataUrl) {
      const previewPath = `assets/previews/${actual.id}.png`;
      dataUrlToFile(
        actual.annotatedPreviewDataUrl,
        resolveInsideWorkspace(root, previewPath),
      );
      artwork.previewPath = previewPath;
      delete artwork.annotatedPreviewDataUrl;
    }
    for (const component of artwork.components || [])
      delete component.previewDataUrl;
  }
  atomicJson(join(root, "design.json"), persisted);
  atomicJson(projectMetadataPath(currentProjectPath), {
    version: 1,
    id: next.id,
    name: next.name,
    updatedAt: next.updatedAt || now(),
  });
  const globalComponents = (next.globalComponents || []).map((item: any) => {
    const copy = { ...item };
    if (copy.previewDataUrl) {
      const extension = copy.previewDataUrl.startsWith("data:image/svg")
        ? "svg"
        : "png";
      const relative = `${copy.globalId}.${extension}`;
      dataUrlToFile(copy.previewDataUrl, resolveInsideWorkspace(
        join(dataRoot(), "global-components"),
        relative,
      ));
      delete copy.previewDataUrl;
      copy.previewPath = relative;
    }
    return copy;
  });
  atomicJson(
    join(dataRoot(), "global-components", "index.json"),
    globalComponents,
  );
  const index = readJson<any>(indexPath()) || {};
  atomicJson(indexPath(), {
    ...index,
    version: currentProjectPath ? 2 : 1,
    currentWorkspaceId: next.id,
    currentProjectPath: currentProjectPath || undefined,
    windowState: next.windowState || index.windowState || {},
    lastOpenedAt: now(),
  });
  return { ok: true, path: join(root, "design.json") };
}
function projectStatus() {
  const index = readJson<any>(indexPath()) || {};
  const recent = (Array.isArray(index.recentProjects) ? index.recentProjects : []).map(
    (item: any) => ({ ...item, available: validProjectPath(item.path) }),
  );
  const current = validProjectPath(currentProjectPath)
    ? projectRef(currentProjectPath, recent)
    : null;
  const missingCurrent =
    !current && typeof index.currentProjectPath === "string"
      ? {
          ...projectRef(index.currentProjectPath, recent, index.currentWorkspaceId),
          available: false,
        }
      : null;
  return {
    current,
    missingCurrent,
    recent,
    hasWorkspace: Boolean(current && existsSync(projectWorkspacePath(current.path))),
    error: workspaceLoadError || undefined,
  };
}
function openProject(projectPath: string) {
  if (!validProjectPath(projectPath))
    return { ok: false, error: "项目目录不存在或不可访问" };
  const targetPath = resolve(projectPath);
  const designPath = projectWorkspacePath(targetPath);
  if (!existsSync(designPath)) return { ok: true, needsCreation: true };
  const saved = readJson<any>(designPath);
  if (!saved)
    return { ok: false, error: `工作区文件无法读取：${designPath}` };
  try {
    const metadata = readJson<any>(projectMetadataPath(targetPath));
    validateWorkspaceDocuments(saved, metadata || undefined);
    if (currentProjectPath && currentProjectPath !== targetPath && workspace) {
      const currentSaved = saveWorkspace({ ...workspace, updatedAt: now() });
      if (!currentSaved.ok) return currentSaved;
    }
    currentProjectPath = targetPath;
    workspace = hydrateWorkspace(saved, ensureProjectDirs(currentProjectPath));
    workspaceLoadError = null;
    const index = readJson<any>(indexPath()) || {};
    workspace.windowState = index.windowState || {};
    workspace.recentProjects = updateProjectIndex(
      currentProjectPath,
      index.recentProjects || [],
      workspace.id,
    );
    if (!existsSync(projectMetadataPath(currentProjectPath)))
      atomicJson(projectMetadataPath(currentProjectPath), {
        version: 1,
        id: workspace.id,
        name: workspace.name,
        updatedAt: workspace.updatedAt || now(),
      });
    broadcast();
    return { ok: true, needsCreation: false };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "项目切换失败",
    };
  }
}
function createProjectWorkspace(projectPath: string) {
  if (!validProjectPath(projectPath))
    return { ok: false, error: "项目目录不存在或不可访问" };
  const targetPath = resolve(projectPath);
  const designPath = projectWorkspacePath(targetPath);
  if (existsSync(designPath))
    return { ok: false, error: `目标项目已有工作区：${designPath}` };
  try {
    if (currentProjectPath && currentProjectPath !== targetPath && workspace) {
      const currentSaved = saveWorkspace({ ...workspace, updatedAt: now() });
      if (!currentSaved.ok) return currentSaved;
    }
    currentProjectPath = targetPath;
    const index = readJson<any>(indexPath()) || {};
    const next: any = defaultWorkspace();
    next.name = basename(currentProjectPath);
    next.windowState = index.windowState || {};
    next.recentProjects = updateProjectIndex(
      currentProjectPath,
      index.recentProjects || [],
      next.id,
    );
    const saved = saveWorkspace(next);
    if (!saved.ok) return saved;
    broadcast();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "工作区创建失败",
    };
  }
}
function relinkProject(previousPath: string, projectPath: string) {
  if (!validProjectPath(projectPath))
    return { ok: false, error: "新项目目录不存在或不可访问" };
  const targetPath = resolve(projectPath);
  const saved = readJson<any>(projectWorkspacePath(targetPath));
  const metadata = readJson<any>(projectMetadataPath(targetPath));
  if (!saved || !metadata)
    return { ok: false, error: "所选目录没有完整的 Dockyard 工作区" };
  const index = readJson<any>(indexPath()) || {};
  const previous = (index.recentProjects || []).find(
    (item: any) => item.path === previousPath,
  );
  const expectedId = previous?.workspaceId ||
    (index.currentProjectPath === previousPath ? index.currentWorkspaceId : undefined);
  if (!expectedId)
    return { ok: false, error: "缺少原工作区标识，不能安全地重新定位" };
  try {
    validateWorkspaceDocuments(saved, metadata, expectedId);
    hydrateWorkspace(
      JSON.parse(JSON.stringify(saved)),
      ensureProjectDirs(targetPath),
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "工作区标识校验失败",
    };
  }
  atomicJson(indexPath(), {
    ...index,
    currentProjectPath: targetPath,
    currentWorkspaceId: expectedId,
    recentProjects: (index.recentProjects || []).filter(
      (item: any) => item.path !== previousPath && item.path !== targetPath,
    ),
  });
  return openProject(targetPath);
}
function completeArtwork(payload: any) {
  const target = workspace?.artworks?.find((item: any) => item.id === payload?.artworkId);
  if (!target) return { ok: false, error: "当前稿件不存在" };
  if (target.status === "completed") return { ok: false, error: "该稿件已经完成" };
  if (typeof payload.previewDataUrl !== "string" || typeof payload.componentsText !== "string")
    return { ok: false, error: "完成记录缺少导出图片或组件信息" };
  if (!currentProjectPath) return { ok: false, error: "请先选择代码项目" };
  const root = ensureProjectDirs(currentProjectPath);
  const recordId = uid("record");
  const recordRoot = resolveInsideWorkspace(root, `records/${recordId}`);
  mkdirSync(recordRoot, { recursive: true });
  dataUrlToFile(payload.previewDataUrl, join(recordRoot, "preview.png"));
  writeFileSync(join(recordRoot, "components.txt"), payload.componentsText, "utf8");
  const completedAt = now();
  atomicJson(join(recordRoot, "record.json"), {
    id: recordId,
    artworkId: target.id,
    baseId: target.baseId,
    completedAt,
    previewPath: `records/${recordId}/preview.png`,
    componentsTextPath: `records/${recordId}/components.txt`,
  });
  const record = {
    previewPath: `records/${recordId}/preview.png`,
    componentsTextPath: `records/${recordId}/components.txt`,
    completedAt,
  };
  if (payload.persistOnly) return { ok: true, recordId, record };
  workspace = {
    ...workspace,
    currentArtworkId: null,
    updatedAt: completedAt,
    artworks: workspace.artworks.map((item: any) => item.id === target.id
      ? { ...item, status: "completed", completedAt, completedPreviewDataUrl: payload.previewDataUrl, completedComponentsText: payload.componentsText, record: {
        previewPath: `records/${recordId}/preview.png`,
        componentsTextPath: `records/${recordId}/components.txt`,
        completedAt,
      } }
      : item),
  };
  const saved = saveWorkspace(workspace);
  if (!saved.ok) return saved;
  broadcast();
  return { ok: true, recordId };
}
function rendererUrl(view: "bar" | View) {
  const dev =
    Boolean(process.env.VITE_DEV_SERVER_URL) ||
    (!app.isPackaged && !process.argv.includes("--dockyard-prod"));
  return (
    process.env.VITE_DEV_SERVER_URL ||
    (dev ? "http://localhost:5173" : null) ||
    pathToFileURL(join(__dirname, "../../dist/index.html")).toString()
  );
}
function loadView(window: BrowserWindow, view: "bar" | View) {
  const url = rendererUrl(view);
  const search = new URLSearchParams({ view });
  if (process.env.DOCKYARD_STATIC_FIXTURES === "1") search.set("staticFixtures", "1");
  if (url.startsWith("http")) window.loadURL(`${url}?${search}`);
  else
    window.loadFile(join(__dirname, "../../dist/index.html"), {
      search: search.toString(),
    });
}
function forwardLibraryReturn(url: string) {
  const annotator = panelWindows.get("annotator");
  if (!annotator || annotator.isDestroyed()) return;
  const hash = new URL(url).hash;
  void annotator.webContents.executeJavaScript(
    `window.location.hash = ${JSON.stringify(hash)}`,
  );
  annotator.show();
  annotator.focus();
}
function configureWindowNavigation(
  window: BrowserWindow,
  scope: "app" | "library" = "app",
) {
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = scope === "app"
      ? isAllowedAppNavigation(url, rendererUrl("annotator"))
      : isAllowedLibraryNavigation(url);
    if (allowed) return;
    event.preventDefault();
    const kind = classifyWindowOpen(url, rendererUrl("annotator"));
    if (kind === "library-return") setImmediate(() => forwardLibraryReturn(url));
    else if (kind === "external") void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const kind = classifyWindowOpen(url, rendererUrl("annotator"));
    if (kind === "excalidraw-library")
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 780,
          minWidth: 760,
          minHeight: 560,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          webPreferences: {
            preload: undefined,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            sandbox: true,
            webSecurity: true,
          },
        },
      };
    if (kind === "library-return") setImmediate(() => forwardLibraryReturn(url));
    else if (kind === "external") void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("did-create-window", (child) => {
    configureWindowNavigation(child, "library");
    if (process.platform === "win32") child.setMenuBarVisibility(false);
  });
}
function broadcast() {
  for (const win of [barWindow, ...panelWindows.values()])
    if (win && !win.isDestroyed())
      win.webContents.send("design:state", workspace);
}
function createBarWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const saved = workspace?.windowState?.bar;
  const position = resolveBarPosition({
    saved,
    primaryWorkArea: workArea,
    workAreas: screen.getAllDisplays().map((display) => display.workArea),
  });
  barWindow = new BrowserWindow({
    width: BAR_SIZE.width,
    height: BAR_SIZE.height,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  configureWindowNavigation(barWindow);
  barWindow.setAlwaysOnTop(true, "floating");
  loadView(barWindow, "bar");
  barWindow.once("ready-to-show", () => barWindow?.show());
  barWindow.on("move", () => {
    if (workspace && barWindow) {
      const [x, y] = barWindow.getPosition();
      workspace.windowState = { ...workspace.windowState, bar: { x, y } };
      const index = readJson<any>(indexPath()) || {};
      atomicJson(indexPath(), {
        ...index,
        version: 2,
        windowState: workspace.windowState,
      });
    }
  });
  barWindow.on("closed", () => {
    barWindow = null;
  });
}
function openPanel(view: View) {
  const existing = panelWindows.get(view);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const panel = new BrowserWindow({
    width: view === "annotator" ? 1180 : 600,
    height: 780,
    minWidth:
      view === "annotator" ? 900 : 560,
    minHeight: 620,
    frame: true,
    autoHideMenuBar: process.platform === "win32",
    backgroundColor: "#f5f5f7",
    resizable: true,
    alwaysOnTop: false,
    title:
      view === "annotator" ? "画板" : view === "tokens" ? "设计令牌" : "设计决策",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  configureWindowNavigation(panel);
  if (process.platform === "win32") panel.setMenuBarVisibility(false);
  panelWindows.set(view, panel);
  loadView(panel, view);
  panel.once("ready-to-show", () => {
    panel.show();
    broadcast();
  });
  panel.on("closed", () => panelWindows.delete(view));
}
function candidateCacheRoot() {
  const root = join(dataRoot(), "cache", "candidates");
  mkdirSync(root, { recursive: true });
  return root;
}
function candidateAssetPath(name: string) {
  return join(candidateCacheRoot(), name);
}
function cacheKey(payload: { sketchDataUrl?: string; instruction: string }) {
  return Buffer.from(`${payload.instruction}\n${payload.sketchDataUrl || ""}`)
    .toString("base64url")
    .slice(0, 96);
}
function cacheBytes(path: string): number {
  const stat = statSync(path);
  return stat.isDirectory()
    ? readdirSync(path).reduce(
        (total, name) => total + cacheBytes(join(path, name)),
        0,
      )
    : stat.size;
}
function cacheStatus() {
  const root = candidateCacheRoot();
  let bytes = 0;
  let candidateCount = 0;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    bytes += cacheBytes(path);
    if (
      statSync(path).isFile() &&
      name.endsWith(".json") &&
      !name.endsWith(".view.json")
    )
      candidateCount += 1;
  }
  return { candidateCount, bytes, expiresInDays: candidateCacheDays };
}
async function clearExpiredCandidateCache(force = false) {
  const root = candidateCacheRoot();
  const threshold = Date.now() - candidateCacheDays * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (force || statSync(path).mtimeMs < threshold)
      await shell.trashItem(path);
  }
  return cacheStatus();
}
function download(url: string) {
  return new Promise<Buffer>((resolve, reject) =>
    httpsGet(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      )
        return download(response.headers.location).then(resolve, reject);
      if (response.statusCode !== 200)
        return reject(
          new Error(`下载运行时失败（HTTP ${response.statusCode}）`),
        );
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject),
  );
}
function storybookSource(sourceId: string) {
  return storybookSources.find((source) => source.id === sourceId);
}
function downloadStorybook(url: string, allowedOrigin: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.origin !== allowedOrigin) return Promise.reject(new Error("远程 Storybook 地址不在允许列表中"));
  return new Promise((resolve, reject) => httpsGet(parsed, (response) => {
    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      const next = new URL(response.headers.location, parsed).toString();
      return downloadStorybook(next, allowedOrigin).then(resolve, reject);
    }
    if (response.statusCode !== 200) return reject(new Error(`远程 Storybook 请求失败（HTTP ${response.statusCode}）`));
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => resolve(Buffer.concat(chunks)));
  }).on("error", reject));
}
async function loadStorybookCatalog(sourceId: string, force = false): Promise<StorybookCatalog> {
  const source = storybookSource(sourceId);
  if (!source) throw new Error("不允许的 Storybook 来源");
  const cached = storybookCatalogCache.get(sourceId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.catalog;
  const payload = JSON.parse((await downloadStorybook(source.indexUrl, source.allowedOrigin)).toString("utf8"));
  const entries = Object.values<any>(payload.entries || payload.stories || {});
  const stories: StorybookStory[] = entries
    .filter((entry) => (entry.type === "story" || !entry.type) && entry.id && entry.title)
    .map((entry) => ({
      id: String(entry.id),
      title: String(entry.title),
      name: String(entry.name || entry.id),
      type: "story",
      sourceId,
      storyUrl: `${source.baseUrl}/iframe.html?id=${encodeURIComponent(String(entry.id))}&viewMode=story`,
    }));
  const catalog: StorybookCatalog = {
    source: { ...source, status: "ready", storyCount: stories.length, checkedAt: now(), error: undefined },
    stories,
  };
  storybookCatalogCache.set(sourceId, { expiresAt: Date.now() + storybookCacheMs, catalog });
  return catalog;
}
async function checkStorybookSource(sourceId: string): Promise<StorybookSource> {
  const source = storybookSource(sourceId);
  if (!source) throw new Error("不允许的 Storybook 来源");
  try {
    const catalog = await loadStorybookCatalog(sourceId, true);
    const first = catalog.stories[0];
    if (first) await downloadStorybook(first.storyUrl, source.allowedOrigin);
    return catalog.source;
  } catch (error) {
    return { ...source, status: "unavailable", checkedAt: now(), error: error instanceof Error ? error.message : String(error) };
  }
}
type FrameFailure = { url: string; errorCode: number; errorDescription: string; at: number };
const frameRegistry = new WeakMap<Electron.WebContents, Map<string, Electron.WebFrameMain>>();
const frameFailures = new WeakMap<Electron.WebContents, FrameFailure[]>();

function frameKey(processId: number, routingId: number) {
  return `${processId}:${routingId}`;
}

function rememberFrame(webContents: Electron.WebContents, processId?: number, routingId?: number) {
  if (typeof processId !== "number" || typeof routingId !== "number") return;
  const frame = webFrameMain.fromId(processId, routingId);
  if (!frame) return;
  const frames = frameRegistry.get(webContents) || new Map<string, Electron.WebFrameMain>();
  frames.set(frameKey(processId, routingId), frame);
  frameRegistry.set(webContents, frames);
}

function findStoryFrame(webContents: Electron.WebContents, requestedUrl: string) {
  const requested = new URL(requestedUrl);
  const source = storybookSources.find((item) => item.allowedOrigin === requested.origin);
  if (!source) throw new Error("远程 Storybook 地址不在允许列表中");
  const matches = (frame: Electron.WebFrameMain) => {
    try {
      const current = new URL(frame.url);
      return current.origin === requested.origin && current.pathname === requested.pathname && current.searchParams.get("id") === requested.searchParams.get("id");
    } catch { return false; }
  };
  const registered = frameRegistry.get(webContents);
  const fromRegistry = registered && [...registered.values()].find(matches);
  return fromRegistry || webContents.mainFrame.framesInSubtree.find(matches);
}
async function measureStoryFrame(webContents: Electron.WebContents, requestedUrl: string) {
  const requestId = uid("measure");
  writeLog("debug", "storybook.measure.start", { requestId, requestedUrl });
  let requested: URL;
  try { requested = new URL(requestedUrl); }
  catch (error) {
    writeLog("warn", "storybook.measure.origin_denied", { requestId, requestedUrl, message: String(error) });
    return { ok: false, reason: "origin-denied", detail: String(error), requestId } as const;
  }
  const source = storybookSources.find((item) => item.allowedOrigin === requested.origin);
  if (!source) {
    writeLog("warn", "storybook.measure.origin_denied", { requestId, requestedUrl });
    return { ok: false, reason: "origin-denied", requestId } as const;
  }
  let frame: Electron.WebFrameMain | undefined;
  try { frame = findStoryFrame(webContents, requestedUrl); }
  catch (error) {
    writeLog("warn", "storybook.measure.frame_not_found", { requestId, requestedUrl, message: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "frame-not-found", detail: error instanceof Error ? error.message : String(error), requestId } as const;
  }
  if (!frame) {
    const failure = frameFailures.get(webContents)?.find((item) => item.url === requestedUrl && Date.now() - item.at < 5000);
    const reason = failure ? "navigation-failed" : "frame-not-found";
    writeLog("debug", `storybook.measure.${reason.replaceAll("-", "_")}`, { requestId, requestedUrl, detail: failure?.errorDescription });
    return { ok: false, reason, detail: failure?.errorDescription, requestId } as const;
  }
  try {
    const result = await frame.executeJavaScript(`(async () => {
      const startedAt = performance.now();
      let root = null;
      let observer = null;
      let timer = null;
      let lastKey = "";
      let stableFrames = 0;
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const targets = () => {
        root = document.querySelector("#storybook-root");
        if (!root) return null;
        const explicit = root.querySelector("[data-dockyard-component-root]");
        if (explicit && visible(explicit)) return { elements: [explicit], method: "explicit-root" };
        const children = [...root.children].filter(visible);
        if (children.length === 1) return { elements: children, method: "direct-child" };
        if (children.length > 1) return { elements: children, method: "union" };
        return null;
      };
      const measure = (selection) => {
        const rects = selection.elements.map((element) => element.getBoundingClientRect());
        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right));
        const bottom = Math.max(...rects.map((rect) => rect.bottom));
        return { width: right - left, height: bottom - top, x: left, y: top, viewportWidth: innerWidth, viewportHeight: innerHeight, selectionMethod: selection.method };
      };
      return await new Promise((resolve) => {
        const finish = (value) => { if (timer) clearTimeout(timer); observer?.disconnect(); resolve(value); };
        const inspect = () => {
          const selection = targets();
          if (!selection) {
            if (root && performance.now() - startedAt > 1500) finish({ ok: false, reason: "target-not-found" });
            else if (performance.now() - startedAt > 3000) finish({ ok: false, reason: "timeout" });
            else requestAnimationFrame(inspect);
            return;
          }
          if (!observer && typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(() => { stableFrames = 0; });
            observer.observe(root);
            selection.elements.forEach((element) => observer.observe(element));
          }
          const bounds = measure(selection);
          const key = [bounds.x, bounds.y, bounds.width, bounds.height, bounds.viewportWidth, bounds.viewportHeight].map((value) => Math.round(value * 100) / 100).join(",");
          stableFrames = key === lastKey ? stableFrames + 1 : 0;
          lastKey = key;
          if (bounds.width > 0 && bounds.height > 0 && stableFrames >= 2) finish({ ok: true, bounds });
          else requestAnimationFrame(inspect);
        };
        if (document.fonts?.ready) document.fonts.ready.catch(() => {}).finally(inspect);
        else inspect();
        timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), 3000);
      });
    })()`) as any;
    if (result?.ok) {
      writeLog("info", "storybook.measure.success", { requestId, requestedUrl, selectionMethod: result.bounds.selectionMethod, width: result.bounds.width, height: result.bounds.height });
    } else {
      writeLog("debug", `storybook.measure.${String(result?.reason || "script-failed").replaceAll("-", "_")}`, { requestId, requestedUrl, detail: result?.detail });
    }
    return { ...result, requestId };
  } catch (error) {
    writeLog("warn", "storybook.measure.script_failed", { requestId, requestedUrl, message: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "script-failed", detail: error instanceof Error ? error.message : String(error), requestId } as const;
  }
}
async function shadcnNode() {
  const override = process.env.DOCKYARD_SHADCN_NODE;
  if (override && existsSync(override)) return override;
  if (process.platform !== "win32") return process.execPath;
  const folder = join(
    dataRoot(),
    "tools",
    `node-v${shadcnNodeVersion}-win-x64`,
  );
  const executable = join(folder, "node.exe");
  if (existsSync(executable)) return executable;
  const archive = join(
    dataRoot(),
    "tools",
    `node-v${shadcnNodeVersion}-win-x64.zip`,
  );
  const base = `https://nodejs.org/dist/v${shadcnNodeVersion}`;
  mkdirSync(dirname(archive), { recursive: true });
  const [archiveBody, checksums] = await Promise.all([
    download(`${base}/node-v${shadcnNodeVersion}-win-x64.zip`),
    download(`${base}/SHASUMS256.txt`),
  ]);
  const expected = checksums
    .toString("utf8")
    .match(
      new RegExp(
        `^([a-f0-9]{64})\\s+node-v${shadcnNodeVersion.replaceAll(".", "\\.")}\\-win-x64\\.zip$`,
        "m",
      ),
    )?.[1];
  const actual = createHash("sha256").update(archiveBody).digest("hex");
  if (!expected || actual !== expected)
    throw new Error("Node.js 运行时校验失败，已取消安装");
  writeFileSync(archive, archiveBody);
  await execFileAsync("tar.exe", ["-xf", archive, "-C", dirname(archive)], {
    windowsHide: true,
  });
  if (!existsSync(executable)) throw new Error("Node.js 运行时解压失败");
  await shell.trashItem(archive);
  return executable;
}
function shadcnScript() {
  return join(process.cwd(), "node_modules", "shadcn", "dist", "index.js");
}
async function runShadcn(args: string[], cwd?: string) {
  const node = await shadcnNode();
  return execFileAsync(node, [shadcnScript(), ...args], {
    cwd: cwd || process.cwd(),
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
    timeout: 180_000,
  });
}
function searchItems(output: string) {
  return [...output.matchAll(/^\s*-\s+(@shadcn\/[\w-]+)\s+\(([^)]+)\)\s*$/gm)]
    .map((match) => ({ id: match[1], kind: match[2] }))
    .filter((item) => item.kind === "ui" || item.kind === "example");
}
function codexConfigPath() {
  return join(dataRoot(), "config", "codex.json");
}
function loadCodexConfig() {
  const path = codexConfigPath();
  if (!existsSync(path))
    throw new Error(`尚未配置组件检索模型，请先编辑：${path}`);
  const raw = readJson<unknown>(path);
  if (raw === null) throw new Error(`组件检索模型配置不是有效 JSON：${path}`);
  const config = validateCodexCliConfig(raw);
  if (config.enabled !== true)
    throw new Error(`组件检索模型尚未启用，请将 enabled 改为 true：${path}`);
  return config;
}

async function runModelRecognition(input: { imageDataUrl: string; prompt: string }): Promise<ModelRecognitionResult> {
  const startedAt = Date.now();
  const imagePath = join(candidateCacheRoot(), `recognition-${randomUUID()}.png`);
  dataUrlToFile(input.imageDataUrl, imagePath);
  try {
    const config = loadCodexConfig();
    const result = await invokeCodexCliStructured(
      { artifactDirectory: candidateCacheRoot(), workingDirectory: process.cwd(), config },
      { invocationId: recognitionInvocationId("cli"), prompt: input.prompt, outputSchema: recognitionSchema, imagePaths: [imagePath] },
    );
    return normalizeRecognitionOutput("cli", result.output, Date.now() - startedAt, { source: "unavailable" });
  } catch (error) {
    return failedRecognition("cli", error, Date.now() - startedAt);
  }
}

async function runCodexJson<T>(
  name: string,
  prompt: string,
  schema: unknown,
  sketchPath?: string,
  onTrace?: (event: CodexCliTraceEvent) => void,
) {
  const result = await invokeCodexCliStructured(
    {
      artifactDirectory: candidateCacheRoot(),
      workingDirectory: process.cwd(),
      config: loadCodexConfig(),
      onTrace,
    },
    {
      invocationId: uid(name),
      prompt,
      outputSchema: schema as Record<string, unknown>,
      ...(sketchPath ? { imagePaths: [sketchPath] } : {}),
    },
  );
  return result.output as T;
}
const querySchema = {
  type: "object",
  additionalProperties: false,
  required: ["queries"],
  properties: {
    queries: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string", minLength: 2, maxLength: 36 },
    },
  },
};
const selectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["selected"],
  properties: {
    selected: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
  },
};
const storybookMatchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "path"],
        properties: {
          sourceId: { type: "string", minLength: 1 },
          path: { type: "string", minLength: 1 },
        },
      },
    },
  },
};
const storybookQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["terms"],
  properties: {
    terms: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 2, maxLength: 40 },
    },
  },
};
async function runStorybookSearch(
  payload: { sketchDataUrl?: string; sourceIds?: string[] },
  onTrace?: (event: CodexCliTraceEvent) => void,
) {
  const diagnostics: string[] = [];
  const trace = (message: string) => {
    diagnostics.push(message);
    onTrace?.({ invocationId: "storybook-search", at: now(), stage: "event", message });
  };
  try {
    if (!payload.sketchDataUrl) throw new Error("没有收到草图图片");
    const sourceIds = [...new Set(payload.sourceIds || [])].filter((id) => storybookSource(id));
    if (!sourceIds.length) throw new Error("没有选择 Storybook 来源");
    const catalogs = await Promise.all(sourceIds.map((id) => loadStorybookCatalog(id)));
    const candidatesBySource = catalogs.map((catalog) => {
      const groups = new Map<string, string[]>();
      for (const story of catalog.stories) {
        const names = groups.get(story.title) || [];
        names.push(story.name);
        groups.set(story.title, names);
      }
      return {
        catalog,
        candidates: [...groups].map(([path, stories]) => ({
          sourceId: catalog.source.id,
          sourceName: catalog.source.name,
          path,
          stories,
        })),
      };
    }).filter((item) => item.candidates.length > 0);
    if (!candidatesBySource.length) throw new Error("所选 Storybook 没有可用目录");
    const key = createHash("sha256")
      .update(JSON.stringify({ sourceIds, sketchDataUrl: payload.sketchDataUrl }))
      .digest("hex")
      .slice(0, 24);
    const sketchPath = join(candidateCacheRoot(), `${key}.storybook.sketch.png`);
    dataUrlToFile(payload.sketchDataUrl, sketchPath);
    const allCandidates = candidatesBySource.flatMap((item) => item.candidates);
    trace(`已读取 ${allCandidates.length} 个原始目录候选`);
    const queryPlan = await runCodexJson<{ terms: string[] }>(
      "storybook-query-terms",
      "查看附图草图。先判断草图中的形状、视觉结构、语义和交互状态（例如关闭、取消、提示、消息、确认、导航等），再根据判断结果生成用于检索 Storybook 原始目录的英文组件词。检索词必须来自草图实际表达的组件，不要因为输入框、表单或其他示例而默认生成 input 相关词；只有草图确实表示输入控件时才使用 input。生成 3 到 8 个高相关词，覆盖同一组件的必要常见叫法。只返回 terms 数组，不要返回目录、解释或代码。",
      storybookQuerySchema,
      sketchPath,
      onTrace,
    );
    const terms = [...new Set((queryPlan.terms || []).map((term) => term.trim().toLowerCase()).filter(Boolean))];
    trace(`模型生成检索词：${terms.join("、")}`);
    const expandedCandidates = allCandidates.filter((candidate) => {
      const haystack = `${candidate.path} ${candidate.stories.join(" ")}`.toLowerCase();
      return terms.some((term) => term.split(/\s+/).every((token) => haystack.includes(token)));
    });
    const shortlist = expandedCandidates.length ? expandedCandidates : allCandidates;
    trace(`本地候选扩展后保留 ${shortlist.length} 个目录`);
    const selection = await runCodexJson<{ matches: Array<{ sourceId: string; path: string }> }>(
      "storybook-selection",
      `查看附图草图，并结合前一步根据草图形状、语义和交互状态生成的检索词。从下列不同 Storybook 的原始目录中，以高召回率选择所有可能相关的目录；优先选择与草图表达的组件语义相符的目录，不要把结果默认扩大到 input 或 form。不要改写、翻译或合并 path；只能原样返回 sourceId 和 path。若没有匹配项，返回空数组。检索词：${JSON.stringify(terms)}。候选目录：${JSON.stringify(shortlist)}`,
      storybookMatchSchema,
      sketchPath,
      onTrace,
    );
    const matches = (selection.matches || []).map((item) => {
      const source = storybookSource(item.sourceId);
      if (!source) {
        diagnostics.push(`未找到来源：${item.sourceId} / ${item.path}`);
        return { sourceId: item.sourceId, path: item.path, stories: [], status: "source-not-found" as const };
      }
      const catalog = catalogs.find((value) => value.source.id === item.sourceId);
      const stories = catalog?.stories.filter((story) => story.title === item.path) || [];
      if (!stories.length) {
        diagnostics.push(`未找到目录：${item.sourceId} / ${item.path}`);
        return { sourceId: item.sourceId, path: item.path, stories: [], status: "path-not-found" as const };
      }
      return { sourceId: item.sourceId, path: item.path, stories, status: "matched" as const };
    })
      .filter((item, index, all) => all.findIndex((candidate) => candidate.sourceId === item.sourceId && candidate.path === item.path) === index);
    trace(`模型返回 ${matches.length} 条目录判断`);
    return { matches, source: "codex" as const, diagnostics };
  } catch (error) {
    return {
      matches: [],
      source: "error" as const,
      error: error instanceof Error ? error.message : "Storybook 检索失败",
      diagnostics,
    };
  }
}
function writePreviewHarness(root: string, slug: string) {
  const source = join(root, "src");
  mkdirSync(join(source, "lib"), { recursive: true });
  atomicJson(join(root, "package.json"), {
    name: `dockyard-preview-${slug}`,
    private: true,
    type: "module",
    dependencies: {
      "class-variance-authority": "^0.7.1",
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      tailwindcss: "^4.0.0",
      typescript: "^5.7.2",
      vite: "^6.0.5",
    },
  });
  atomicJson(join(root, "components.json"), {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/index.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: "",
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
    iconLibrary: "lucide",
  });
  atomicJson(join(root, "tsconfig.json"), {
    compilerOptions: {
      baseUrl: ".",
      paths: { "@/*": ["./src/*"] },
      jsx: "react-jsx",
      esModuleInterop: true,
      skipLibCheck: true,
    },
  });
  writeFileSync(
    join(root, "vite.config.mjs"),
    "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport { fileURLToPath, URL } from 'node:url';\nexport default defineConfig({ plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } });\n",
    "utf8",
  );
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    "utf8",
  );
  writeFileSync(
    join(source, "lib", "utils.ts"),
    "export const cn = (...values: unknown[]) => values.flat(Infinity).filter(Boolean).join(' ')\n",
    "utf8",
  );
  writeFileSync(
    join(source, "index.css"),
    '@import "tailwindcss";\n@theme inline { --color-background: #ffffff; --color-foreground: #1d1d1f; --color-primary: #007aff; --color-primary-foreground: #ffffff; --color-secondary: #f2f2f7; --color-secondary-foreground: #1d1d1f; --color-muted: #f2f2f7; --color-muted-foreground: #6e6e73; --color-border: #d2d2d7; --color-input: #d2d2d7; --color-ring: #007aff; --color-destructive: #ff3b30; } body { margin: 0; min-height: 100vh; background: #f5f5f7; color: #1d1d1f; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
    "utf8",
  );
  writeFileSync(
    join(source, "main.tsx"),
    `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport * as ComponentModule from './components/ui/${slug}';\nimport './index.css';\nconst Candidate = Object.entries(ComponentModule).find(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')?.[1] as React.ComponentType<any> | undefined;\nconst voidLike = /^(Input|Checkbox|Switch|Slider|Progress|Separator|Skeleton)$/;\nfunction Preview() { const name = Candidate?.displayName || Candidate?.name || '${slug}'; return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48 }}><section style={{ minWidth: 240, maxWidth: 640, padding: 32, border: '1px solid #d2d2d7', borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}><p style={{ margin: '0 0 18px', color: '#6e6e73', fontSize: 13 }}>shadcn/ui · ${slug}</p>{Candidate ? <Candidate aria-label={name} placeholder={name}>{voidLike.test(name) ? undefined : '预览内容'}</Candidate> : <p>组件没有可直接预览的导出。</p>}</section></main> }\ncreateRoot(document.getElementById('root')!).render(<Preview />);\n`,
    "utf8",
  );
}
async function renderShadcnCandidate(
  id: string,
  slug: string,
  previewFile: string,
) {
  const sandbox = join(
    candidateCacheRoot(),
    `${basename(previewFile, ".png")}.sandbox`,
  );
  writePreviewHarness(sandbox, slug);
  await runShadcn(["add", id, "--cwd", sandbox, "--yes"]);
  const node = await shadcnNode();
  await execFileAsync(
    node,
    [join(sandbox, "node_modules", "vite", "bin", "vite.js"), "build"],
    {
      cwd: sandbox,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const preview = new BrowserWindow({
    width: 720,
    height: 420,
    show: false,
    backgroundColor: "#f5f5f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await preview.loadFile(join(sandbox, "dist", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 250));
    writeFileSync(
      previewFile,
      (await preview.webContents.capturePage()).toPNG(),
    );
    return fileToDataUrl(previewFile);
  } finally {
    preview.destroy();
  }
}
async function runCodex(payload: {
  sketchDataUrl?: string;
  instruction: string;
}, onTrace?: (event: CodexCliTraceEvent) => void) {
  const root = candidateCacheRoot();
  await clearExpiredCandidateCache();
  const key = cacheKey(payload);
  const manifestPath = join(root, `${key}.json`);
  const cached = readJson<any>(manifestPath);
  if (cached?.candidates?.length)
    return {
      ...cached,
      candidates: cached.candidates.map((candidate: any) => ({
        ...candidate,
        previewDataUrl: candidate.previewPath
          ? fileToDataUrl(candidateAssetPath(candidate.previewPath))
          : undefined,
        cacheHit: true,
      })),
      source: "cache",
    };
  try {
    const sketchPath = join(root, `${key}.sketch.png`);
    dataUrlToFile(payload.sketchDataUrl, sketchPath);
    const diagnostics: string[] = [];
    const trace = (message: string) => {
      diagnostics.push(message);
      onTrace?.({
        invocationId: "component-search",
        at: now(),
        stage: "event",
        message,
      });
    };
    trace("1. Codex CLI：结合组件草图与检索说明生成英文检索词。");
    const queryPlan = await runCodexJson<{ queries: string[] }>(
      "component-queries",
      `查看附图草图，并结合用户说明“${payload.instruction}”。只输出适合 shadcn/ui 官方注册表 search 的 1 到 3 个英文简短组件检索词；不要输出组件名称、解释或代码。`,
      querySchema,
      existsSync(sketchPath) ? sketchPath : undefined,
      onTrace,
    );
    trace(`2. shadcn search：${queryPlan.queries.join("、")}`);
    const unique = new Map<string, { id: string; kind: string }>();
    for (const query of queryPlan.queries)
      for (const item of searchItems(
        (await runShadcn(["search", shadcnRegistry, "-q", query, "-l", "8"]))
          .stdout,
      ))
        unique.set(item.id, item);
    const shortlist = [...unique.values()].slice(0, 16);
    if (!shortlist.length) throw new Error("官方组件检索没有返回候选");
    trace(
      `3. 官方短名单：${shortlist.map((item) => item.id).join("、")}`,
    );
    const selection = await runCodexJson<{ selected: string[] }>(
      "component-selection",
      `查看附图草图与用户说明“${payload.instruction}”。只能从下列 shadcn/ui 官方候选中选出最匹配的 1 到 5 项，输出它们的完整 id 数组：${JSON.stringify(shortlist)}`,
      selectSchema,
      existsSync(sketchPath) ? sketchPath : undefined,
      onTrace,
    );
    const selected = selection.selected
      .filter((id) => shortlist.some((item) => item.id === id))
      .slice(0, 5);
    if (!selected.length) throw new Error("Codex 没有从官方短名单选择候选");
    trace(`4. Codex CLI 选择：${selected.join("、")}`);
    const candidates: any[] = [];
    for (const id of selected) {
      const view = JSON.parse((await runShadcn(["view", id])).stdout);
      const slug = id.split("/").pop() || uid("component");
      const viewPath = `${key}.${slug}.view.json`;
      atomicJson(candidateAssetPath(viewPath), view);
      const previewPath = `${key}.${slug}.png`;
      const previewDataUrl = await renderShadcnCandidate(
        id,
        slug,
        candidateAssetPath(previewPath),
      );
      candidates.push({
        id,
        name: slug,
        registryItem: id,
        library: "shadcn/ui",
        previewDataUrl,
        previewPath,
        sourceCachePath: viewPath,
        sourceSandboxPath: `${basename(previewPath, ".png")}.sandbox`,
        previewKind: "rendered",
        previewStatus: "ready",
        description: `来自 ${id} 的本地实际渲染`,
        docsUrl: `https://ui.shadcn.com/docs/components/${slug}`,
        codeUrl: `https://ui.shadcn.com/r/${slug}.json`,
      });
    }
    trace(
      "5. shadcn view、add 与本地构建：已保存源码、JSON 和实际渲染截图。",
    );
    const result = {
      candidates: candidates.map(
        ({ previewDataUrl, ...candidate }) => candidate,
      ),
      source: "shadcn-cli",
      diagnostics,
    };
    atomicJson(manifestPath, result);
    return { ...result, candidates };
  } catch (error) {
    return {
      candidates: [],
      source: "error",
      error: error instanceof Error ? error.message : "组件检索失败",
    };
  }
}
function staticComponentsRoot() {
  return rendererUrl("annotator").startsWith("file:")
    ? join(__dirname, "../../dist/static-component-overlay")
    : join(process.cwd(), "public/static-component-overlay");
}
function staticComponentResponse(requestUrl: string) {
  const request = new URL(requestUrl);
  if (request.host !== "components")
    return new Response("Not found", { status: 404 });
  const root = resolve(staticComponentsRoot());
  const relativePath = decodeURIComponent(request.pathname).replace(/^\/+/, "");
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`))
    return new Response("Forbidden", { status: 403 });
  if (!existsSync(target) || !statSync(target).isFile())
    return new Response("Not found", { status: 404 });
  const extension = extname(target).toLowerCase();
  const contentType = extension === ".html"
    ? "text/html; charset=utf-8"
    : extension === ".js"
      ? "text/javascript; charset=utf-8"
      : extension === ".json"
        ? "application/json; charset=utf-8"
        : extension === ".css"
          ? "text/css; charset=utf-8"
          : "application/octet-stream";
  return new Response(readFileSync(target), {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

function isPrivilegedWindow(window: BrowserWindow | null) {
  return Boolean(
    window &&
    (window === barWindow || [...panelWindows.values()].includes(window)),
  );
}

function assertTrustedIpcEvent(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
) {
  const senderFrame = event.senderFrame;
  const trusted = Boolean(senderFrame) && isTrustedIpcSender({
    senderUrl: senderFrame?.url || "",
    rendererBaseUrl: rendererUrl("annotator"),
    isMainFrame: senderFrame === event.sender.mainFrame,
    belongsToPrivilegedWindow: isPrivilegedWindow(
      BrowserWindow.fromWebContents(event.sender),
    ),
  });
  if (!trusted) throw new Error("拒绝来自非受信页面的高权限消息");
}

function trustedHandle(
  channel: string,
  listener: (
    event: Electron.IpcMainInvokeEvent,
    ...args: any[]
  ) => any,
) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcEvent(event);
    return listener(event, ...args);
  });
}

function trustedOn(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedIpcEvent(event);
      listener(event, ...args);
    } catch (error) {
      writeLog("warn", "ipc.untrusted_sender", {
        channel,
        senderUrl: event.senderFrame?.url || "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

app.whenReady().then(() => {
  initLogger();
  installProcessErrorHandlers();
  void protocol.handle("dockyard-static", (request) =>
    staticComponentResponse(request.url),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.on("will-download", (event) => event.preventDefault());
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("did-frame-finish-load", (_frameEvent, isMainFrame, frameProcessId, frameRoutingId) => {
      rememberFrame(contents, frameProcessId, frameRoutingId);
      writeLog("debug", "storybook.frame.finish_load", {
        webContentsId: contents.id,
        isMainFrame,
        frameProcessId,
        frameRoutingId,
      });
    });
    contents.on("did-fail-load", (_frameEvent, errorCode, errorDescription, validatedURL, isMainFrame, frameProcessId, frameRoutingId) => {
      const failures = frameFailures.get(contents) || [];
      failures.push({ url: validatedURL, errorCode, errorDescription, at: Date.now() });
      frameFailures.set(contents, failures.slice(-20));
      writeLog("warn", "storybook.frame.navigation_failed", {
        webContentsId: contents.id,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
        frameProcessId,
        frameRoutingId,
      });
    });
    contents.on("render-process-gone", (_goneEvent, details) => {
      writeLog("error", "renderer.process_gone", {
        webContentsId: contents.id,
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });
    contents.on("unresponsive", () => {
      writeLog("error", "renderer.unresponsive", { webContentsId: contents.id });
    });
  });
  workspace = loadWorkspace();
  trustedHandle("workspace:save", (_event, next: any) => {
    try {
      const result = saveWorkspace({ ...next, updatedAt: now() });
      if (result.ok) broadcast();
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "工作区保存失败",
      };
    }
  });
  trustedHandle("workspace:load", () => workspace);
  trustedOn("diagnostics:log", (_event, payload: { level?: string; event?: string; context?: Record<string, unknown> }) => {
    if (!payload || !/^(debug|info|warn|error)$/.test(String(payload.level)) || !/^[a-z0-9_.]+$/.test(String(payload.event))) return;
    writeLog(payload.level as "debug" | "info" | "warn" | "error", String(payload.event), { ...payload.context, process: "renderer" });
  });
  trustedHandle("storybook:sources", () => storybookSources);
  trustedHandle("storybook:catalog", (_event, sourceId: string) =>
    loadStorybookCatalog(sourceId),
  );
  trustedHandle("storybook:check", (_event, sourceId: string) =>
    checkStorybookSource(sourceId),
  );
  trustedHandle("storybook:measure-frame", (event, storyUrl: string) =>
    measureStoryFrame(event.sender, storyUrl),
  );
  trustedHandle("artwork:capture-viewport", async (event) => {
    const image = await event.sender.capturePage();
    return image.toDataURL();
  });
  trustedOn("design:sync", (_event, next: any) => {
    workspace = next;
    broadcast();
  });
  trustedHandle("codex:storybook-search", (event, payload) =>
    runStorybookSearch(payload, (trace) => event.sender.send("codex:trace", trace)),
  );
  trustedHandle("model:recognize", (_event, payload: { imageDataUrl: string; prompt: string }) =>
    runModelRecognition(payload),
  );
  trustedHandle("diagnostics:logs-open", () => shell.openPath(loggerDirectory()));
  trustedHandle("artwork:complete", (_event, payload) => completeArtwork(payload));
  trustedHandle("project:pick", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    return { path, name: basename(path) };
  });
  trustedHandle("project:status", () => projectStatus());
  trustedHandle("project:open", (_event, path: string) => openProject(path));
  trustedHandle(
    "project:relink",
    (_event, previousPath: string, path: string) =>
      relinkProject(previousPath, path),
  );
  trustedHandle("project:create-workspace", (_event, path: string) =>
    createProjectWorkspace(path),
  );
  trustedHandle("panel:open", (_event, view: View) => openPanel(view));
  trustedHandle("panel:close", (_event, view: View) => {
    const panel = panelWindows.get(view);
    if (panel && !panel.isDestroyed()) panel.close();
  });
  trustedHandle("bar:show", () => barWindow?.show());
  trustedHandle("bar:hide", () => barWindow?.hide());
  createBarWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createBarWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
