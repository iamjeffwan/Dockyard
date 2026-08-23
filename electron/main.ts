import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const execFileAsync = promisify(execFile);
type View = 'annotator' | 'component-search' | 'tokens' | 'decisions';
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const defaultDataRoot = app.isPackaged ? (process.env.LOCALAPPDATA || app.getPath('appData')) : process.cwd();
app.setName('Dockyard');
app.setPath('userData', process.env.DOCKYARD_DATA_DIR || join(defaultDataRoot, '.dockyard-data'));
if (process.platform === 'win32' && process.env.DOCKYARD_DISABLE_GPU !== '0') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

let workspace: any = null;
let mcpHttpPort = 0;
let barWindow: BrowserWindow | null = null;
const panelWindows = new Map<View, BrowserWindow>();

function dataRoot() { return app.getPath('userData'); }
function indexPath() { return join(dataRoot(), 'index.json'); }
function workspaceRoot(id: string) { return join(dataRoot(), 'workspaces', id); }
function ensureWorkspaceDirs(id: string) {
  const root = workspaceRoot(id);
  for (const dir of ['artworks', 'assets/source', 'assets/previews', 'assets/components', 'cache/candidates']) mkdirSync(join(root, dir), { recursive: true });
  mkdirSync(join(dataRoot(), 'global-components'), { recursive: true });
  return root;
}
function atomicJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, path);
}
function dataUrlToFile(dataUrl: string | undefined, filePath: string) {
  if (!dataUrl) return;
  const match = dataUrl.match(/^data:(.+?),(.*)$/);
  if (!match) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, match[1].includes(';base64') ? Buffer.from(match[2], 'base64') : Buffer.from(decodeURIComponent(match[2]), 'utf8'));
}
function fileToDataUrl(path: string) {
  if (!existsSync(path)) return undefined;
  const extension = extname(path).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; }
}
function defaultScene() { return { type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements: [], appState: { viewBackgroundColor: '#101516' }, files: {} }; }
function defaultWorkspace() {
  return { version: 2, id: uid('workspace'), name: '未命名设计', updatedAt: now(), currentArtworkId: null, artworks: [], globalComponents: [], recentProjects: [], preferredLibraries: ['shadcn/ui'], windowState: {} };
}
function loadGlobalComponents() {
  const items = readJson<any[]>(join(dataRoot(), 'global-components', 'index.json')) || [];
  for (const item of items) if (item.previewPath) item.previewDataUrl = fileToDataUrl(join(dataRoot(), 'global-components', item.previewPath));
  return items;
}
function legacyWorkspace() {
  const old = readJson<any>(join(dataRoot(), 'sessions', 'default', 'design.json'));
  if (!old) return null;
  const artworkId = old.id || uid('artwork');
  const source = old.source ? { ...old.source, path: old.source.path || `assets/source/${old.source.hash}.png` } : null;
  if (source?.path) source.dataUrl = fileToDataUrl(join(dataRoot(), 'sessions', 'default', source.path));
  return { ...defaultWorkspace(), id: uid('workspace'), name: '迁移的设计', currentArtworkId: artworkId, artworks: [{ id: artworkId, name: source?.name || '图稿1', updatedAt: old.updatedAt || now(), source, scene: defaultScene(), annotations: old.annotations || [], components: old.components || [], notes: old.notes || '' }], globalComponents: loadGlobalComponents() };
}
function loadWorkspace() {
  const index = readJson<any>(indexPath());
  const id = index?.currentWorkspaceId;
  const saved = id ? readJson<any>(join(workspaceRoot(id), 'design.json')) : null;
  const loaded = saved || legacyWorkspace() || defaultWorkspace();
  ensureWorkspaceDirs(loaded.id);
  loaded.globalComponents = loadGlobalComponents();
  for (const artwork of loaded.artworks || []) {
    const root = join(workspaceRoot(loaded.id), 'artworks', artwork.id);
    artwork.scene = readJson<any>(join(root, 'scene.excalidraw.json')) || artwork.scene || defaultScene();
    for (const file of Object.values<any>(artwork.scene.files || {})) if (file.path) file.dataURL = fileToDataUrl(join(workspaceRoot(loaded.id), file.path));
    if (artwork.source?.path) artwork.source.dataUrl = fileToDataUrl(join(workspaceRoot(loaded.id), artwork.source.path));
    if (artwork.previewPath) artwork.annotatedPreviewDataUrl = fileToDataUrl(join(workspaceRoot(loaded.id), artwork.previewPath));
  }
  workspace = loaded;
  atomicJson(indexPath(), { version: 1, currentWorkspaceId: loaded.id, lastOpenedAt: now() });
  return loaded;
}
function saveWorkspace(next: any) {
  workspace = next;
  const root = ensureWorkspaceDirs(next.id);
  const persisted = JSON.parse(JSON.stringify(next));
  delete persisted.globalComponents;
  for (const artwork of persisted.artworks || []) {
    const actual = next.artworks.find((item: any) => item.id === artwork.id);
    const artworkRoot = join(root, 'artworks', artwork.id);
    mkdirSync(artworkRoot, { recursive: true });
    const scene = JSON.parse(JSON.stringify(actual.scene || defaultScene()));
    for (const [fileId, file] of Object.entries<any>(scene.files || {})) {
      if (!file.dataURL) continue;
      const isSource = actual.source?.hash === fileId;
      const relative = isSource ? `assets/source/${fileId}.png` : `assets/components/${fileId}.svg`;
      dataUrlToFile(file.dataURL, join(root, relative));
      delete file.dataURL;
      file.path = relative;
    }
    atomicJson(join(artworkRoot, 'scene.excalidraw.json'), scene);
    delete artwork.scene;
    artwork.scenePath = `artworks/${artwork.id}/scene.excalidraw.json`;
    if (actual.source?.dataUrl && actual.source.hash) {
      const sourcePath = `assets/source/${actual.source.hash}.png`;
      dataUrlToFile(actual.source.dataUrl, join(root, sourcePath));
      artwork.source = { ...artwork.source, dataUrl: undefined, path: sourcePath };
      delete artwork.source.dataUrl;
    }
    if (actual.annotatedPreviewDataUrl) {
      const previewPath = `assets/previews/${actual.id}.png`;
      dataUrlToFile(actual.annotatedPreviewDataUrl, join(root, previewPath));
      artwork.previewPath = previewPath;
      delete artwork.annotatedPreviewDataUrl;
    }
    for (const component of artwork.components || []) delete component.previewDataUrl;
  }
  atomicJson(join(root, 'design.json'), persisted);
  const globalComponents = (next.globalComponents || []).map((item: any) => {
    const copy = { ...item };
    if (copy.previewDataUrl) {
      const extension = copy.previewDataUrl.startsWith('data:image/svg') ? 'svg' : 'png';
      const relative = `${copy.globalId}.${extension}`;
      dataUrlToFile(copy.previewDataUrl, join(dataRoot(), 'global-components', relative));
      delete copy.previewDataUrl;
      copy.previewPath = relative;
    }
    return copy;
  });
  atomicJson(join(dataRoot(), 'global-components', 'index.json'), globalComponents);
  atomicJson(indexPath(), { version: 1, currentWorkspaceId: next.id, lastOpenedAt: now() });
  return { ok: true, path: join(root, 'design.json') };
}
function currentArtwork() { return workspace?.artworks?.find((item: any) => item.id === workspace.currentArtworkId) || workspace?.artworks?.[0] || null; }
function json(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); }
function startMcpServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const target = currentArtwork();
    if (req.method === 'GET' && req.url === '/mcp/design-state') return json(res, 200, { workspaceId: workspace?.id, artwork: target });
    if (req.method === 'GET' && req.url === '/mcp/annotated-preview') return json(res, 200, { previewDataUrl: target?.annotatedPreviewDataUrl || null });
    if (req.method === 'GET' && req.url === '/mcp/confirmed-components') return json(res, 200, target?.components || []);
    if (req.method === 'GET' && req.url === '/mcp/component-matches') return json(res, 200, []);
    if (req.method === 'POST' && req.url === '/mcp/design-notes') { let data = ''; req.on('data', chunk => { data += chunk; }); req.on('end', () => { const body = JSON.parse(data || '{}'); if (target) target.notes = body.notes || ''; if (workspace) saveWorkspace({ ...workspace, updatedAt: now() }); json(res, 200, { ok: true, notes: target?.notes || '' }); }); return; }
    json(res, 404, { error: 'MCP tool not found' });
  });
  server.listen(0, '127.0.0.1', () => { const address = server.address(); if (address && typeof address === 'object') mcpHttpPort = address.port; });
}
function rendererUrl(view: 'bar' | View) { const dev = Boolean(process.env.VITE_DEV_SERVER_URL) || (!app.isPackaged && !process.argv.includes('--dockyard-prod')); return process.env.VITE_DEV_SERVER_URL || (dev ? 'http://localhost:5173' : null) || `file://${join(__dirname, '../dist/index.html')}`; }
function loadView(window: BrowserWindow, view: 'bar' | View) { const url = rendererUrl(view); if (url.startsWith('http')) window.loadURL(`${url}?view=${view}`); else window.loadFile(join(__dirname, '../dist/index.html'), { search: `view=${view}` }); }
function broadcast() { for (const win of [barWindow, ...panelWindows.values()]) if (win && !win.isDestroyed()) win.webContents.send('design:state', workspace); }
function createBarWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const saved = workspace?.windowState?.bar;
  const barX = Math.min(saved?.x ?? workArea.x + workArea.width - 685, workArea.x + workArea.width - 685);
  barWindow = new BrowserWindow({ width: 660, height: 86, x: barX, y: saved?.y ?? workArea.y + workArea.height - 115, frame: false, transparent: true, resizable: false, movable: true, alwaysOnTop: true, skipTaskbar: true, show: false, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  barWindow.setAlwaysOnTop(true, 'floating'); loadView(barWindow, 'bar'); barWindow.once('ready-to-show', () => barWindow?.show()); barWindow.on('moved', () => { if (workspace && barWindow) { const [x, y] = barWindow.getPosition(); workspace.windowState = { ...workspace.windowState, bar: { x, y } }; } }); barWindow.on('closed', () => { barWindow = null; });
}
function openPanel(view: View) {
  const existing = panelWindows.get(view); if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const panel = new BrowserWindow({ width: view === 'annotator' ? 1180 : view === 'component-search' ? 620 : 600, height: view === 'annotator' ? 780 : view === 'component-search' ? 780 : 680, minWidth: view === 'annotator' ? 900 : view === 'component-search' ? 520 : 560, minHeight: 620, frame: false, backgroundColor: '#0b0e0f', resizable: true, alwaysOnTop: true, webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  panel.setAlwaysOnTop(true, 'floating'); panelWindows.set(view, panel); loadView(panel, view); panel.once('ready-to-show', () => { panel.show(); broadcast(); }); panel.on('closed', () => panelWindows.delete(view));
}
function validateCandidates(raw: any) { const list = Array.isArray(raw) ? raw : raw?.candidates; if (!Array.isArray(list)) throw new Error('返回格式不是候选列表'); return list.filter(item => item && item.name && item.library && item.docsUrl && item.codeUrl && item.previewKind && ['official', 'rendered', 'reference'].includes(item.previewKind)).slice(0, 5); }
async function runCodex(payload: { sketchPath?: string; sketchDataUrl?: string; libraries: string[]; instruction: string }) {
  const root = ensureWorkspaceDirs(workspace?.id || 'search'); const sketchPath = payload.sketchPath || join(root, 'cache', 'candidates', `sketch-${Date.now()}.png`); dataUrlToFile(payload.sketchDataUrl, sketchPath);
  const prompt = ['Return JSON only. Find 3 to 5 real UI component candidates using configured tools.', `Only inspect this hand-drawn component sketch: ${sketchPath}. Do not inspect any original artwork or annotations.`, `Allowed libraries: ${payload.libraries.join(', ') || 'configured libraries'}.`, `User request: ${payload.instruction || 'identify the closest component'}.`, 'Each candidate must include id,name,library,previewUrl or previewDataUrl,previewKind,description,docsUrl,codeUrl,version.'].join('\n');
  try { const command = process.env.DOCKYARD_CODEX_COMMAND || 'codex'; const { stdout } = await execFileAsync(command, ['exec', '--json', prompt], { timeout: 90_000, windowsHide: true, maxBuffer: 2_000_000 }); const candidates = validateCandidates(JSON.parse(stdout)); if (!candidates.length) throw new Error('没有返回完整候选'); return { candidates, source: 'codex-cli' }; } catch (error) { return { candidates: [], source: 'error', error: error instanceof Error ? error.message : 'Codex CLI 不可用' }; }
}
async function generateContext(payload: { projectPath: string; artworkId: string; prompt: string }) {
  const artwork = workspace?.artworks?.find((item: any) => item.id === payload.artworkId); if (!artwork) throw new Error('当前图稿不存在');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const base = join(payload.projectPath, '.dockyard', 'context', artwork.id); const dir = join(base, stamp); mkdirSync(dir, { recursive: true }); const latest = join(base, 'latest'); mkdirSync(latest, { recursive: true });
  const copyData = (dataUrl: string | undefined, name: string, target = dir) => dataUrlToFile(dataUrl, join(target, name));
  const makeContextScene = (target: string) => {
    const scene = JSON.parse(JSON.stringify(artwork.scene || defaultScene()));
    for (const [fileId, file] of Object.entries<any>(scene.files || {})) {
      if (!file.dataURL) continue;
      const extension = file.mimeType?.includes('svg') ? 'svg' : 'png';
      const relative = `assets/${fileId}.${extension}`;
      dataUrlToFile(file.dataURL, join(target, relative));
      delete file.dataURL;
      file.path = relative;
    }
    return scene;
  };
  const contextArtwork = { ...artwork, scene: undefined, source: artwork.source ? { ...artwork.source, dataUrl: undefined } : null, annotatedPreviewDataUrl: undefined };
  copyData(artwork.source?.dataUrl, 'original.png'); copyData(artwork.annotatedPreviewDataUrl, 'annotated-preview.png'); atomicJson(join(dir, 'scene.excalidraw.json'), makeContextScene(dir)); atomicJson(join(dir, 'design.json'), { workspaceId: workspace.id, artwork: contextArtwork }); writeFileSync(join(dir, 'DEVELOPMENT_PROMPT.md'), payload.prompt, 'utf8');
  const latestScene = join(latest, 'scene.excalidraw.json'); atomicJson(latestScene, makeContextScene(latest)); copyData(artwork.source?.dataUrl, 'original.png', latest); copyData(artwork.annotatedPreviewDataUrl, 'annotated-preview.png', latest); atomicJson(join(latest, 'design.json'), { workspaceId: workspace.id, artwork: contextArtwork }); writeFileSync(join(latest, 'DEVELOPMENT_PROMPT.md'), payload.prompt, 'utf8');
  return { ok: true, path: dir, prompt: payload.prompt };
}

app.whenReady().then(() => {
  workspace = loadWorkspace(); startMcpServer();
  ipcMain.handle('workspace:save', (_event, next: any) => { const result = saveWorkspace({ ...next, updatedAt: now() }); broadcast(); return result; });
  ipcMain.handle('workspace:load', () => workspace);
  ipcMain.on('design:sync', (_event, next: any) => { workspace = next; broadcast(); });
  ipcMain.handle('codex:search', (_event, payload) => runCodex(payload));
  ipcMain.handle('context:generate', (_event, payload) => generateContext(payload));
  ipcMain.handle('project:pick', async () => { const result = await dialog.showOpenDialog({ properties: ['openDirectory'] }); if (result.canceled || !result.filePaths[0]) return null; const path = result.filePaths[0]; return { path, name: basename(path) }; });
  ipcMain.handle('context:open', (_event, path: string) => shell.openPath(path));
  ipcMain.handle('mcp:port', () => mcpHttpPort);
  ipcMain.handle('panel:open', (_event, view: View) => openPanel(view));
  ipcMain.handle('panel:close', (_event, view: View) => { const panel = panelWindows.get(view); if (panel && !panel.isDestroyed()) panel.close(); });
  ipcMain.handle('bar:show', () => barWindow?.show()); ipcMain.handle('bar:hide', () => barWindow?.hide());
  createBarWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createBarWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
