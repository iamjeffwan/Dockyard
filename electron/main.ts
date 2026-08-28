import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { get as httpsGet } from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import {
  CodexCliTraceEvent,
  invokeCodexCliStructured,
  validateCodexCliConfig,
} from "./codex-cli-model.js";
import { classifyWindowOpen } from "./external-navigation.js";
import type { StorybookCatalog, StorybookSource, StorybookStory } from "../src/types";

const execFileAsync = promisify(execFile);
type View = "annotator" | "component-search" | "tokens" | "decisions";
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
  join(nativeAppDataRoot, "Dockyard", app.isPackaged ? "runtime" : "runtime-dev"),
);
if (process.platform === "win32" && process.env.DOCKYARD_DISABLE_GPU !== "0") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}

let workspace: any = null;
let currentProjectPath: string | null = null;
let mcpHttpPort = 0;
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
function workspaceRoot(id: string) {
  return join(dataRoot(), "workspaces", id);
}
function projectRoot(projectPath: string) {
  return join(resolve(projectPath), ".dockyard");
}
function projectWorkspacePath(projectPath: string) {
  return join(projectRoot(projectPath), "design.json");
}
function validProjectPath(projectPath: unknown): projectPath is string {
  if (typeof projectPath !== "string" || !isAbsolute(projectPath)) return false;
  try {
    return statSync(projectPath).isDirectory();
  } catch {
    return false;
  }
}
function projectRef(projectPath: string, recent: any[] = []) {
  const existing = recent.find((item) => item.path === projectPath);
  return {
    path: projectPath,
    name: basename(projectPath),
    lastUsedAt: existing?.lastUsedAt || now(),
  };
}
function updateProjectIndex(projectPath: string, recent: any[] = []) {
  const next = projectRef(projectPath, recent);
  const projects = [
    next,
    ...recent.filter((item) => item.path !== projectPath),
  ].slice(0, 12);
  const index = readJson<any>(indexPath()) || {};
  atomicJson(indexPath(), {
    ...index,
    version: 2,
    currentProjectPath: projectPath,
    recentProjects: projects,
    lastOpenedAt: now(),
  });
  return projects;
}
function ensureProjectDirs(projectPath: string) {
  const root = projectRoot(projectPath);
  for (const dir of [
    "artworks",
    "assets/source",
    "assets/previews",
    "assets/components",
    "context",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  return root;
}
function ensureWorkspaceDirs(id: string) {
  const root = workspaceRoot(id);
  for (const dir of [
    "artworks",
    "assets/source",
    "assets/previews",
    "assets/components",
    "cache/candidates",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  mkdirSync(join(dataRoot(), "global-components"), { recursive: true });
  return root;
}
function atomicJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, path);
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
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
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
    version: 2,
    id: uid("workspace"),
    name: "未命名设计",
    updatedAt: now(),
    currentArtworkId: null,
    artworks: [],
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
        join(dataRoot(), "global-components", item.previewPath),
      );
  return items;
}
function legacyWorkspace() {
  const old = readJson<any>(
    join(dataRoot(), "sessions", "default", "design.json"),
  );
  if (!old) return null;
  const artworkId = old.id || uid("artwork");
  const source = old.source
    ? {
        ...old.source,
        path: old.source.path || `assets/source/${old.source.hash}.png`,
      }
    : null;
  if (source?.path)
    source.dataUrl = fileToDataUrl(
      join(dataRoot(), "sessions", "default", source.path),
    );
  return {
    ...defaultWorkspace(),
    id: uid("workspace"),
    name: "迁移的设计",
    currentArtworkId: artworkId,
    artworks: [
      {
        id: artworkId,
        name: source?.name || "图稿1",
        updatedAt: old.updatedAt || now(),
        source,
        scene: defaultScene(),
        annotations: old.annotations || [],
        components: old.components || [],
        notes: old.notes || "",
      },
    ],
    globalComponents: loadGlobalComponents(),
  };
}
function hydrateWorkspace(loaded: any, root: string) {
  loaded.libraryItems ||= [];
  loaded.globalComponents = loadGlobalComponents();
  for (const artwork of loaded.artworks || []) {
    const artworkRoot = join(root, "artworks", artwork.id);
    artwork.scene =
      readJson<any>(join(artworkRoot, "scene.excalidraw.json")) ||
        artwork.scene ||
        defaultScene();
    for (const file of Object.values<any>(artwork.scene.files || {}))
      if (file.path)
        file.dataURL = fileToDataUrl(join(root, file.path));
    if (artwork.source?.path)
      artwork.source.dataUrl = fileToDataUrl(join(root, artwork.source.path));
    if (artwork.previewPath)
      artwork.annotatedPreviewDataUrl = fileToDataUrl(
        join(root, artwork.previewPath),
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
    const projectSaved = readJson<any>(projectWorkspacePath(currentProjectPath));
    if (projectSaved) {
      workspace = hydrateWorkspace(projectSaved, ensureProjectDirs(currentProjectPath));
      workspace.recentProjects = recentProjects;
      updateProjectIndex(currentProjectPath, recentProjects);
      return workspace;
    }
    currentProjectPath = null;
  }
  const id = index?.currentWorkspaceId;
  const saved = id
    ? readJson<any>(join(workspaceRoot(id), "design.json"))
    : null;
  const raw = saved || legacyWorkspace() || defaultWorkspace();
  const loaded = hydrateWorkspace(raw, ensureWorkspaceDirs(raw.id));
  loaded.recentProjects = recentProjects;
  workspace = loaded;
  atomicJson(indexPath(), {
    ...index,
    version: 1,
    currentWorkspaceId: loaded.id,
    lastOpenedAt: now(),
  });
  return loaded;
}
function saveWorkspace(next: any) {
  workspace = next;
  const root = currentProjectPath
    ? ensureProjectDirs(currentProjectPath)
    : ensureWorkspaceDirs(next.id);
  const persisted = JSON.parse(JSON.stringify(next));
  delete persisted.globalComponents;
  for (const artwork of persisted.artworks || []) {
    const actual = next.artworks.find((item: any) => item.id === artwork.id);
    const artworkRoot = join(root, "artworks", artwork.id);
    mkdirSync(artworkRoot, { recursive: true });
    const scene = JSON.parse(JSON.stringify(actual.scene || defaultScene()));
    for (const [fileId, file] of Object.entries<any>(scene.files || {})) {
      if (!file.dataURL) continue;
      const isSource = actual.source?.hash === fileId;
      const extension = file.mimeType?.includes("svg") ? "svg" : "png";
      const relative = isSource
        ? `assets/source/${fileId}.png`
        : `assets/components/${fileId}.${extension}`;
      dataUrlToFile(file.dataURL, join(root, relative));
      delete file.dataURL;
      file.path = relative;
    }
    atomicJson(join(artworkRoot, "scene.excalidraw.json"), scene);
    delete artwork.scene;
    artwork.scenePath = `artworks/${artwork.id}/scene.excalidraw.json`;
    if (actual.source?.dataUrl && actual.source.hash) {
      const sourcePath = `assets/source/${actual.source.hash}.png`;
      dataUrlToFile(actual.source.dataUrl, join(root, sourcePath));
      artwork.source = {
        ...artwork.source,
        dataUrl: undefined,
        path: sourcePath,
      };
      delete artwork.source.dataUrl;
    }
    if (actual.annotatedPreviewDataUrl) {
      const previewPath = `assets/previews/${actual.id}.png`;
      dataUrlToFile(actual.annotatedPreviewDataUrl, join(root, previewPath));
      artwork.previewPath = previewPath;
      delete artwork.annotatedPreviewDataUrl;
    }
    for (const component of artwork.components || [])
      delete component.previewDataUrl;
  }
  atomicJson(join(root, "design.json"), persisted);
  const globalComponents = (next.globalComponents || []).map((item: any) => {
    const copy = { ...item };
    if (copy.previewDataUrl) {
      const extension = copy.previewDataUrl.startsWith("data:image/svg")
        ? "svg"
        : "png";
      const relative = `${copy.globalId}.${extension}`;
      dataUrlToFile(
        copy.previewDataUrl,
        join(dataRoot(), "global-components", relative),
      );
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
    lastOpenedAt: now(),
  });
  return { ok: true, path: join(root, "design.json") };
}
function projectStatus() {
  const index = readJson<any>(indexPath()) || {};
  const recent = Array.isArray(index.recentProjects) ? index.recentProjects : [];
  const current = validProjectPath(currentProjectPath)
    ? projectRef(currentProjectPath, recent)
    : null;
  return {
    current,
    recent,
    hasWorkspace: Boolean(current && existsSync(projectWorkspacePath(current.path))),
  };
}
function openProject(projectPath: string) {
  if (!validProjectPath(projectPath))
    return { ok: false, error: "项目目录不存在或不可访问" };
  const saved = readJson<any>(projectWorkspacePath(projectPath));
  if (!saved) return { ok: true, needsCreation: true };
  currentProjectPath = resolve(projectPath);
  workspace = hydrateWorkspace(saved, ensureProjectDirs(currentProjectPath));
  const index = readJson<any>(indexPath()) || {};
  workspace.recentProjects = updateProjectIndex(currentProjectPath, index.recentProjects || []);
  broadcast();
  return { ok: true, needsCreation: false };
}
function createProjectWorkspace(projectPath: string) {
  if (!validProjectPath(projectPath))
    return { ok: false, error: "项目目录不存在或不可访问" };
  currentProjectPath = resolve(projectPath);
  const index = readJson<any>(indexPath()) || {};
  const next: any = defaultWorkspace();
  next.recentProjects = updateProjectIndex(currentProjectPath, index.recentProjects || []);
  saveWorkspace(next);
  broadcast();
  return { ok: true };
}
function currentArtwork() {
  return (
    workspace?.artworks?.find(
      (item: any) => item.id === workspace.currentArtworkId,
    ) ||
    workspace?.artworks?.[0] ||
    null
  );
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}
function startMcpServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const target = currentArtwork();
    if (req.method === "GET" && req.url === "/mcp/design-state")
      return json(res, 200, { workspaceId: workspace?.id, artwork: target });
    if (req.method === "GET" && req.url === "/mcp/annotated-preview")
      return json(res, 200, {
        previewDataUrl: target?.annotatedPreviewDataUrl || null,
      });
    if (req.method === "GET" && req.url === "/mcp/confirmed-components")
      return json(res, 200, target?.components || []);
    if (req.method === "GET" && req.url === "/mcp/component-matches")
      return json(res, 200, []);
    if (req.method === "POST" && req.url === "/mcp/design-notes") {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        const body = JSON.parse(data || "{}");
        if (target) target.notes = body.notes || "";
        if (workspace) saveWorkspace({ ...workspace, updatedAt: now() });
        json(res, 200, { ok: true, notes: target?.notes || "" });
      });
      return;
    }
    json(res, 404, { error: "MCP tool not found" });
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address === "object") mcpHttpPort = address.port;
  });
}
function rendererUrl(view: "bar" | View) {
  const dev =
    Boolean(process.env.VITE_DEV_SERVER_URL) ||
    (!app.isPackaged && !process.argv.includes("--dockyard-prod"));
  return (
    process.env.VITE_DEV_SERVER_URL ||
    (dev ? "http://localhost:5173" : null) ||
    `file://${join(__dirname, "../dist/index.html")}`
  );
}
function loadView(window: BrowserWindow, view: "bar" | View) {
  const url = rendererUrl(view);
  if (url.startsWith("http")) window.loadURL(`${url}?view=${view}`);
  else
    window.loadFile(join(__dirname, "../dist/index.html"), {
      search: `view=${view}`,
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
function configureWindowNavigation(window: BrowserWindow) {
  window.webContents.on("will-navigate", (event, url) => {
    if (classifyWindowOpen(url, rendererUrl("annotator")) !== "library-return")
      return;
    event.preventDefault();
    setImmediate(() => forwardLibraryReturn(url));
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
            sandbox: true,
          },
        },
      };
    if (kind === "library-return") setImmediate(() => forwardLibraryReturn(url));
    else if (kind === "external") void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("did-create-window", (child) => {
    configureWindowNavigation(child);
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
  const barWidth = 452;
  const barHeight = 64;
  const barX = Math.min(
    saved?.x ?? workArea.x + workArea.width - barWidth - 24,
    workArea.x + workArea.width - barWidth,
  );
  barWindow = new BrowserWindow({
    width: barWidth,
    height: barHeight,
    x: barX,
    y: saved?.y ?? workArea.y + workArea.height - 96,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  configureWindowNavigation(barWindow);
  barWindow.setAlwaysOnTop(true, "floating");
  loadView(barWindow, "bar");
  barWindow.once("ready-to-show", () => barWindow?.show());
  barWindow.on("moved", () => {
    if (workspace && barWindow) {
      const [x, y] = barWindow.getPosition();
      workspace.windowState = { ...workspace.windowState, bar: { x, y } };
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
    width:
      view === "annotator" ? 1180 : view === "component-search" ? 980 : 600,
    height: 780,
    minWidth:
      view === "annotator" ? 900 : view === "component-search" ? 760 : 560,
    minHeight: 620,
    frame: true,
    autoHideMenuBar: process.platform === "win32",
    backgroundColor: "#f5f5f7",
    resizable: true,
    alwaysOnTop: false,
    title:
      view === "annotator"
        ? "画板"
        : view === "component-search"
          ? "组件检索"
          : view === "tokens"
            ? "设计令牌"
            : "设计决策",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
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
  return join(
    ensureWorkspaceDirs(workspace?.id || "search"),
    "cache",
    "candidates",
  );
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
function findStoryFrame(webContents: Electron.WebContents, requestedUrl: string) {
  const requested = new URL(requestedUrl);
  const source = storybookSources.find((item) => item.allowedOrigin === requested.origin);
  if (!source) throw new Error("远程 Storybook 地址不在允许列表中");
  return webContents.mainFrame.framesInSubtree.find((frame) => {
    try {
      const current = new URL(frame.url);
      return current.origin === requested.origin && current.pathname === requested.pathname && current.searchParams.get("id") === requested.searchParams.get("id");
    } catch { return false; }
  });
}
async function measureStoryFrame(webContents: Electron.WebContents, requestedUrl: string) {
  const frame = findStoryFrame(webContents, requestedUrl);
  if (!frame) throw new Error("没有找到远程 Storybook 页面帧");
  const result: any = await frame.executeJavaScript(`(async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
    const root = document.querySelector('#storybook-root') || document.body;
    const elements = [...root.querySelectorAll('*')].filter((element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const area = innerWidth * innerHeight;
    const candidates = elements.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width * rect.height < area * .9; });
    const target = candidates.find((element) => ['button','input','select','textarea','a'].includes(element.tagName.toLowerCase())) || candidates[0];
    if (!target) return null;
    const rect = target.getBoundingClientRect(); const style = getComputedStyle(target);
    return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, viewportWidth: innerWidth, viewportHeight: innerHeight, tag: target.tagName.toLowerCase(), className: typeof target.className === 'string' ? target.className : '', boxShadow: style.boxShadow, frameUrl: location.href };
  })()`);
  if (!result || result.width <= 0 || result.height <= 0) throw new Error("远程页面没有返回有效组件边界");
  return result;
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
async function generateContext(payload: {
  projectPath: string;
  artworkId: string;
  prompt: string;
}) {
  const artwork = workspace?.artworks?.find(
    (item: any) => item.id === payload.artworkId,
  );
  if (!artwork) throw new Error("当前图稿不存在");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(payload.projectPath, ".dockyard", "context", artwork.id);
  const dir = join(base, stamp);
  mkdirSync(dir, { recursive: true });
  const latest = join(base, "latest");
  mkdirSync(latest, { recursive: true });
  const copyData = (dataUrl: string | undefined, name: string, target = dir) =>
    dataUrlToFile(dataUrl, join(target, name));
  const makeContextScene = (target: string) => {
    const scene = JSON.parse(JSON.stringify(artwork.scene || defaultScene()));
    for (const [fileId, file] of Object.entries<any>(scene.files || {})) {
      if (!file.dataURL) continue;
      const extension = file.mimeType?.includes("svg") ? "svg" : "png";
      const relative = `assets/${fileId}.${extension}`;
      dataUrlToFile(file.dataURL, join(target, relative));
      delete file.dataURL;
      file.path = relative;
    }
    return scene;
  };
  const contextArtwork = {
    ...artwork,
    scene: undefined,
    source: artwork.source ? { ...artwork.source, dataUrl: undefined } : null,
    annotatedPreviewDataUrl: undefined,
  };
  copyData(artwork.source?.dataUrl, "original.png");
  copyData(artwork.annotatedPreviewDataUrl, "annotated-preview.png");
  atomicJson(join(dir, "scene.excalidraw.json"), makeContextScene(dir));
  atomicJson(join(dir, "design.json"), {
    workspaceId: workspace.id,
    artwork: contextArtwork,
  });
  writeFileSync(join(dir, "DEVELOPMENT_PROMPT.md"), payload.prompt, "utf8");
  const latestScene = join(latest, "scene.excalidraw.json");
  atomicJson(latestScene, makeContextScene(latest));
  copyData(artwork.source?.dataUrl, "original.png", latest);
  copyData(artwork.annotatedPreviewDataUrl, "annotated-preview.png", latest);
  atomicJson(join(latest, "design.json"), {
    workspaceId: workspace.id,
    artwork: contextArtwork,
  });
  writeFileSync(join(latest, "DEVELOPMENT_PROMPT.md"), payload.prompt, "utf8");
  return { ok: true, path: dir, prompt: payload.prompt };
}

app.whenReady().then(() => {
  workspace = loadWorkspace();
  startMcpServer();
  ipcMain.handle("workspace:save", (_event, next: any) => {
    const result = saveWorkspace({ ...next, updatedAt: now() });
    broadcast();
    return result;
  });
  ipcMain.handle("workspace:load", () => workspace);
  ipcMain.handle("storybook:sources", () => storybookSources);
  ipcMain.handle("storybook:catalog", (_event, sourceId: string) =>
    loadStorybookCatalog(sourceId),
  );
  ipcMain.handle("storybook:check", (_event, sourceId: string) =>
    checkStorybookSource(sourceId),
  );
  ipcMain.handle("storybook:measure-frame", (event, storyUrl: string) =>
    measureStoryFrame(event.sender, storyUrl),
  );
  ipcMain.handle("artwork:capture-viewport", async (event) => {
    const image = await event.sender.capturePage();
    return image.toDataURL();
  });
  ipcMain.on("design:sync", (_event, next: any) => {
    workspace = next;
    broadcast();
  });
  ipcMain.handle("codex:search", (event, payload) =>
    runCodex(payload, (trace) => event.sender.send("codex:trace", trace)),
  );
  ipcMain.handle("codex:logs-open", () => shell.openPath(candidateCacheRoot()));
  ipcMain.handle("component-cache:status", () => clearExpiredCandidateCache());
  ipcMain.handle("component-cache:clear", () =>
    clearExpiredCandidateCache(true),
  );
  ipcMain.handle("context:generate", (_event, payload) =>
    generateContext(payload),
  );
  ipcMain.handle("project:pick", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    return { path, name: basename(path) };
  });
  ipcMain.handle("project:status", () => projectStatus());
  ipcMain.handle("project:open", (_event, path: string) => openProject(path));
  ipcMain.handle("project:create-workspace", (_event, path: string) =>
    createProjectWorkspace(path),
  );
  ipcMain.handle("context:open", (_event, path: string) =>
    shell.openPath(path),
  );
  ipcMain.handle("mcp:port", () => mcpHttpPort);
  ipcMain.handle("panel:open", (_event, view: View) => openPanel(view));
  ipcMain.handle("panel:close", (_event, view: View) => {
    const panel = panelWindows.get(view);
    if (panel && !panel.isDestroyed()) panel.close();
  });
  ipcMain.handle("bar:show", () => barWindow?.show());
  ipcMain.handle("bar:hide", () => barWindow?.hide());
  createBarWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createBarWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
