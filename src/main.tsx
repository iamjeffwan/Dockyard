import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ArrowDownToLine, Box, Check, CircleAlert, Copy, FileCode2, ImagePlus, Layers3, PanelTop, Palette, Pencil, Plus, Search, Send, ShieldCheck, WandSparkles, X } from 'lucide-react';
import type { Artwork, Candidate, ComponentInstance, Design, GlobalComponent, SceneData, SourceAsset, Workspace } from './types';
import '@excalidraw/excalidraw/index.css';
import './styles.css';
import projectTokenData from '../design/project-tokens.json';

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();
const emptyScene = (): SceneData => ({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements: [], appState: { viewBackgroundColor: '#101516' }, files: {} });
const emptyWorkspace: Workspace = { version: 2, id: uid('workspace'), name: '未命名设计', updatedAt: now(), currentArtworkId: null, artworks: [], globalComponents: [], recentProjects: [], preferredLibraries: ['shadcn/ui'], windowState: {} };

function placeholderPreview(candidate: Candidate) {
  if (candidate.previewDataUrl) return candidate.previewDataUrl;
  const safe = candidate.name.replace(/[<&>]/g, '').slice(0, 26);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="22" fill="#182322"/><rect x="36" y="38" width="568" height="284" rx="16" fill="#101616" stroke="#63f4e2" stroke-width="2"/><rect x="72" y="82" width="240" height="28" rx="8" fill="#e7ff63"/><rect x="72" y="138" width="496" height="16" rx="8" fill="#405452"/><rect x="72" y="174" width="420" height="16" rx="8" fill="#314441"/><text x="72" y="268" fill="#e7ff63" font-family="monospace" font-size="22">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function readImage(file: File): Promise<SourceAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error('图片无法读取'));
      image.onload = async () => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
        const hash = `sha256-${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
        resolve({ name: file.name || '图稿.png', dataUrl, width: image.width, height: image.height, hash, path: `assets/source/${hash}.png` });
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function ensureSourceScene(scene: SceneData, source: SourceAsset | null): SceneData {
  const files = Object.fromEntries(Object.entries(scene.files || {}).filter(([, file]) => file && typeof file === 'object' && typeof (file as any).id === 'string' && typeof (file as any).dataURL === 'string'));
  const safeScene = { ...scene, files };
  if (!source || safeScene.elements.some(item => item.customData?.dockyardType === 'source')) return safeScene;
  const element = convertToExcalidrawElements([{ type: 'image', x: 0, y: 0, width: source.width, height: source.height, fileId: source.hash, status: 'saved', scale: [1, 1], crop: null, locked: true, customData: { dockyardType: 'source', assetHash: source.hash } } as any])[0];
  return { ...safeScene, elements: [element, ...safeScene.elements], files: { ...safeScene.files, [source.hash]: { id: source.hash, mimeType: 'image/png', dataURL: source.dataUrl, created: Date.now() } } };
}

function artworkName(existing: Artwork[], original: string) {
  const base = original.replace(/\.[^.]+$/, '') || '图稿';
  const ext = original.includes('.') ? original.slice(original.lastIndexOf('.')) : '';
  const names = new Set(existing.map(item => item.name));
  let name = `${base}${ext}`;
  let index = 1;
  while (names.has(name)) name = `${base}（副本 ${index++}）${ext}`;
  return name;
}
function activeArtwork(workspace: Workspace) { return workspace.artworks.find(item => item.id === workspace.currentArtworkId) || workspace.artworks[0] || null; }

function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [history, setHistory] = useState<Workspace[]>([]);
  const [future, setFuture] = useState<Workspace[]>([]);
  useEffect(() => { window.dockyard?.loadWorkspace().then(saved => { if (saved) setWorkspace(saved); }); return window.dockyard?.onDesignState(next => setWorkspace(next)); }, []);
  const update = useCallback((producer: (current: Workspace) => Workspace, record = true) => {
    setWorkspace(current => {
      const next = producer(current);
      if (record) setHistory(stack => [...stack.slice(-39), current]);
      if (record) setFuture([]);
      window.dockyard?.syncDesign(next);
      if (record || next.globalComponents !== current.globalComponents || next.recentProjects !== current.recentProjects || next.artworks.length !== current.artworks.length) void window.dockyard?.saveWorkspace({ ...next, updatedAt: now() });
      return next;
    });
  }, []);
  const save = useCallback((next: Workspace = workspace) => window.dockyard?.saveWorkspace({ ...next, updatedAt: now() }), [workspace]);
  const undo = useCallback(() => { setHistory(stack => { const previous = stack.at(-1); if (!previous) return stack; setWorkspace(current => { setFuture(items => [...items, current]); window.dockyard?.syncDesign(previous); return previous; }); return stack.slice(0, -1); }); }, []);
  const redo = useCallback(() => { setFuture(stack => { const next = stack.at(-1); if (!next) return stack; setWorkspace(current => { setHistory(items => [...items, current]); window.dockyard?.syncDesign(next); return next; }); return stack.slice(0, -1); }); }, []);
  return { workspace, update, save, undo, redo, canUndo: history.length > 0, canRedo: future.length > 0 };
}

function openPanel(view: 'annotator' | 'component-search' | 'tokens' | 'decisions') { window.dockyard?.openPanel(view); }
function WindowHeader({ title, eyebrow, onClose }: { title: string; eyebrow: string; onClose: () => void }) { return <header className="window-header"><div className="window-title"><span className="brand-mark">D</span><div><small>{eyebrow}</small><h1>{title}</h1></div></div><button className="window-close" aria-label="关闭窗口" title="关闭窗口" onClick={onClose}><X size={18} /></button></header>; }

function BarView() {
  const { workspace, update } = useWorkspace();
  const artwork = activeArtwork(workspace);
  const importArtwork = async (file?: File) => {
    if (!file?.type.startsWith('image/')) return;
    const source = await readImage(file);
    const item: Artwork = { id: uid('artwork'), name: artworkName(workspace.artworks, source.name), updatedAt: now(), source, scene: ensureSourceScene(emptyScene(), source), annotations: [], components: [], notes: '' };
    update(current => ({ ...current, currentArtworkId: item.id, artworks: [...current.artworks, item] }));
    openPanel('annotator');
  };
  useEffect(() => { const onPaste = (event: ClipboardEvent) => { const file = Array.from(event.clipboardData?.files || [])[0]; if (file) importArtwork(file); }; window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste); });
  return <div className="bar-shell bar-horizontal"><div className="bar-brand"><span>D</span><div><strong>DOCKYARD</strong><small>DESIGN CONTEXT</small></div></div><div className="bar-divider" /><button className="bar-context active" aria-label="打开图稿" title="打开图稿" onClick={() => artwork && openPanel('annotator')}><PanelTop size={17} /><span>图稿</span></button><button className="bar-context" aria-label="打开组件检索" title="打开组件检索" onClick={() => openPanel('component-search')}><Box size={17} /><span>组件</span></button><button className="bar-context" aria-label="查看项目 Token" title="查看项目 Token" onClick={() => openPanel('tokens')}><Palette size={17} /><span>Token</span></button><button className="bar-context" aria-label="查看设计决策" title="查看设计决策" onClick={() => openPanel('decisions')}><FileCode2 size={17} /><span>决策</span></button><div className="bar-artworks">{workspace.artworks.slice(-4).map(item => <button key={item.id} className={`artwork-chip ${item.id === artwork?.id ? 'selected' : ''}`} onClick={() => { update(current => ({ ...current, currentArtworkId: item.id }), false); openPanel('annotator'); }}>{item.name}</button>)}{!workspace.artworks.length && <label className="drop-chip"><ImagePlus size={16} />拖入或粘贴图稿<input type="file" accept="image/*" onChange={event => importArtwork(event.target.files?.[0])} /></label>}</div><div className="bar-spacer" />{artwork && <button className="bar-send" aria-label="打开当前图稿" title="打开当前图稿" onClick={() => openPanel('annotator')}><Pencil size={16} /></button>}<button className="bar-mini" aria-label="关闭 Dockyard" title="关闭 Dockyard" onClick={() => window.close()}><X size={16} /></button></div>;
}
function SceneCanvas({ artwork, updateArtwork, onDropCandidate }: { artwork: Artwork | null; updateArtwork: (producer: (item: Artwork) => Artwork, record?: boolean) => void; onDropCandidate: (candidate: Candidate, event: React.DragEvent<HTMLDivElement>) => void }) {
  const artworkId = artwork?.id || 'empty';
  const scene = useMemo(() => artwork ? ensureSourceScene(artwork.scene, artwork.source) : emptyScene(), [artworkId]);
  const lastSignature = useRef(JSON.stringify(scene));
  useEffect(() => { lastSignature.current = JSON.stringify(scene); }, [artworkId, scene]);
  if (!artwork) return <div className="canvas-empty-state"><ImagePlus size={30} /><h2>先导入一张图稿</h2><p>从工具条拖入、粘贴或选择图片</p></div>;
  return <div className="excalidraw-wrap" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const raw = event.dataTransfer.getData('application/x-dockyard-candidate'); if (raw) onDropCandidate(JSON.parse(raw), event); }}><div className="excalidraw-grid" /><Excalidraw key={artwork.id} initialData={scene as any} onChange={(elements, appState, files) => { const nextScene = { ...scene, elements: [...elements], appState: { viewBackgroundColor: appState.viewBackgroundColor, zoom: appState.zoom, scrollX: appState.scrollX, scrollY: appState.scrollY }, files }; const signature = JSON.stringify(nextScene); if (signature === lastSignature.current) return; lastSignature.current = signature; updateArtwork(item => ({ ...item, scene: nextScene, updatedAt: now() }), false); }} langCode="zh-CN" theme="dark" UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }} /><div className="canvas-hint">原图已锁定 · Excalidraw 工具可直接标注和绘图</div></div>;
}

function AnnotatorView() {
  const { workspace, update, save, undo, redo, canUndo, canRedo } = useWorkspace();
  const [status, setStatus] = useState('准备就绪');
  const artwork = activeArtwork(workspace);
  const updateArtwork = (producer: (item: Artwork) => Artwork, record = true) => { if (!artwork) return; update(current => ({ ...current, artworks: current.artworks.map(item => item.id === artwork.id ? producer(item) : item), updatedAt: now() }), record); };
  const importArtwork = async (file?: File) => { if (!file?.type.startsWith('image/')) return; const source = await readImage(file); const item: Artwork = { id: uid('artwork'), name: artworkName(workspace.artworks, source.name), updatedAt: now(), source, scene: ensureSourceScene(emptyScene(), source), annotations: [], components: [], notes: '' }; update(current => ({ ...current, currentArtworkId: item.id, artworks: [...current.artworks, item] })); };
  const saveNow = async () => {
    const canvas = document.querySelector('.excalidraw-wrap canvas') as HTMLCanvasElement | null;
    const preview = canvas?.toDataURL('image/png');
    const next = preview && artwork ? { ...workspace, artworks: workspace.artworks.map(item => item.id === artwork.id ? { ...item, annotatedPreviewDataUrl: preview, updatedAt: now() } : item), updatedAt: now() } : workspace;
    if (preview && artwork) update(() => next, false);
    setStatus((await save(next))?.ok ? '设计已保存' : '保存失败');
  };
  const exportScene = () => { const canvas = document.querySelector('.excalidraw-wrap canvas') as HTMLCanvasElement | null; if (!canvas) return; const link = document.createElement('a'); link.href = canvas.toDataURL(); link.download = `${artwork?.name || 'dockyard'}.png`; link.click(); setStatus('预览图已导出'); };
  const sendContext = async () => { if (!artwork) return; const project = await window.dockyard?.pickProject(); if (!project) return; const prompt = window.prompt('编辑发送给开发助手的提示词', `请读取当前目录中的 Dockyard 上下文包，按照图稿实现页面。\n图稿：${artwork.name}\n先查看 original.png、scene.excalidraw.json 和 design.json。`) || ''; if (!prompt) return; const result = await window.dockyard?.generateContext({ projectPath: project.path, artworkId: artwork.id, prompt }); if (result?.ok && result.path) { update(current => ({ ...current, recentProjects: [{ ...project, lastUsedAt: now() }, ...current.recentProjects.filter(item => item.path !== project.path)].slice(0, 8) }), false); await navigator.clipboard?.writeText(prompt); await window.dockyard?.openContext(result.path); setStatus('上下文包已生成，提示词已复制'); } else setStatus(result?.error || '上下文包生成失败'); };
  const dropCandidate = (candidate: Candidate, event: React.DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dropX = Math.max(0, event.clientX - rect.left - 160);
    const dropY = Math.max(0, event.clientY - rect.top - 90);
    const elementId = uid('component-element');
    const item: ComponentInstance = { ...candidate, previewDataUrl: placeholderPreview(candidate), instanceId: uid('component'), elementId, status: 'confirmed' };
    const element = convertToExcalidrawElements([{ type: 'image', x: dropX, y: dropY, width: 320, height: 180, fileId: elementId, status: 'saved', scale: [1, 1], crop: null, customData: { dockyardType: 'component', componentId: item.instanceId, source: candidate.docsUrl, previewKind: candidate.previewKind } } as any])[0];
    updateArtwork(current => ({ ...current, components: [...current.components, item], scene: { ...current.scene, elements: [...current.scene.elements, element], files: { ...(current.scene.files || {}), [elementId]: { id: elementId, mimeType: 'image/svg+xml', dataURL: item.previewDataUrl, created: Date.now() } } } }));
    setStatus(`${candidate.name} 已加入画布`);
  };
  return <div className="panel-shell"><WindowHeader title={artwork?.name || '标注画板'} eyebrow="ANNOTATOR / EXCALIDRAW" onClose={() => window.dockyard?.closePanel('annotator')} /><div className="annotator-body annotator-body-excalidraw"><aside className="artwork-rail"><div className="rail-title">图稿</div><label className="rail-add"><Plus size={15} /><input type="file" accept="image/*" onChange={event => importArtwork(event.target.files?.[0])} /></label>{workspace.artworks.map(item => <button key={item.id} className={item.id === artwork?.id ? 'rail-item active' : 'rail-item'} onClick={() => update(current => ({ ...current, currentArtworkId: item.id }), false)}>{item.name}</button>)}<div className="rail-spacer" /><button className="rail-item" onClick={() => openPanel('component-search')}><Search size={15} />组件</button></aside><section className="annotator-canvas"><div className="canvas-toolbar"><div><span className="eyebrow">EXCALIDRAW / SHARED CANVAS</span><strong>{artwork?.name || '未导入图稿'}</strong></div><div className="canvas-actions"><button onClick={undo} disabled={!canUndo}>撤销</button><button onClick={redo} disabled={!canRedo}>重做</button><button onClick={exportScene}><ArrowDownToLine size={15} />导出</button><button className="save-small" onClick={saveNow}>保存</button><button className="context-button" onClick={sendContext}><Send size={15} />发送给开发助手</button></div></div><SceneCanvas artwork={artwork} updateArtwork={updateArtwork} onDropCandidate={dropCandidate} /><div className="canvas-foot"><span className="status-pulse" />{status}<span>{artwork?.components.length || 0} 个已采用组件</span></div></section><aside className="annotator-inspector"><div className="inspector-heading"><span>DESIGN STATE</span><Layers3 size={15} /></div><div className="inspector-card"><small>原始图稿</small><strong>{artwork?.source?.name || '等待导入'}</strong><span>{artwork?.source ? `${artwork.source.width} × ${artwork.source.height}` : '—'}</span></div><div className="inspector-card"><small>已采用组件</small><strong>{artwork?.components.length || 0} 个</strong><span>候选拖入后进入当前图稿</span><button onClick={() => openPanel('component-search')}><Search size={14} />打开组件检索</button></div><div className="inspector-card"><small>开发项目</small><strong>{workspace.recentProjects[0]?.name || '发送时选择'}</strong><span>上下文包只包含当前图稿</span></div></aside></div></div>;
}

function ComponentSearchView() {
  const { workspace, update } = useWorkspace();
  const artwork = activeArtwork(workspace);
  const [libraries, setLibraries] = useState(workspace.preferredLibraries);
  const [instruction, setInstruction] = useState('根据手绘组件草图，寻找最接近的真实组件');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('等待组件草图');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const runSearch = async () => { if (!artwork) return; const canvas = document.querySelector('.sketch-box canvas') as HTMLCanvasElement | null; if (!canvas) return; setSearching(true); setStatus('正在读取手绘草图并调用 Codex CLI…'); const result = await window.dockyard?.runCodexSearch({ libraries, instruction, sketchDataUrl: canvas.toDataURL('image/png') }); setCandidates((result?.candidates || []) as Candidate[]); setSearching(false); setStatus(result?.source === 'codex-cli' ? '候选已返回，可拖入画布' : result?.error || '检索失败，草图仍保留在当前页面'); update(current => ({ ...current, preferredLibraries: libraries }), false); };
  const addGlobal = (candidate: Candidate) => { const global: GlobalComponent = { ...candidate, previewDataUrl: placeholderPreview(candidate), globalId: uid('global-component'), createdAt: now() }; update(current => ({ ...current, globalComponents: [...current.globalComponents, global] })); setStatus(`${candidate.name} 已加入全局组件`); };
  const addToArtwork = (candidate: Candidate) => { if (!artwork) return; const instanceId = uid('component'); const elementId = uid('component-element'); const item: ComponentInstance = { ...candidate, previewDataUrl: placeholderPreview(candidate), instanceId, elementId, status: 'confirmed' }; const element = convertToExcalidrawElements([{ type: 'image', x: 120, y: 120, width: 320, height: 180, fileId: elementId, status: 'saved', scale: [1, 1], crop: null, customData: { dockyardType: 'component', componentId: instanceId, source: candidate.docsUrl, previewKind: candidate.previewKind } } as any])[0]; update(current => ({ ...current, artworks: current.artworks.map(currentArtwork => currentArtwork.id === artwork.id ? { ...currentArtwork, components: [...currentArtwork.components, item], scene: { ...currentArtwork.scene, elements: [...currentArtwork.scene.elements, element], files: { ...(currentArtwork.scene.files || {}), [elementId]: { id: elementId, mimeType: 'image/svg+xml', dataURL: item.previewDataUrl, created: Date.now() } } } } : currentArtwork) })); setStatus(`${candidate.name} 已加入当前图稿`); openPanel('annotator'); };
  return <div className="panel-shell compact-panel"><WindowHeader title="组件检索" eyebrow="COMPONENT SCOUT / 临时草图" onClose={() => window.dockyard?.closePanel('component-search')} /><main className="search-page"><div className="search-intro"><span className="eyebrow">ONLY HAND-DRAWN SKETCH</span><h2>从草图找到真实组件</h2><p>这里只发送临时组件草图，不发送原图和普通标注。候选拖入画布后才会保存。</p></div>{!artwork && <div className="search-gate" role="status"><CircleAlert size={18} /><div><strong>先选择一张图稿</strong><span>组件候选需要归属到当前图稿，导入后才能开始检索。</span></div><button onClick={() => openPanel('annotator')}><PanelTop size={14} />打开图稿</button></div>}<div className="sketch-box" aria-label="组件手绘草图"><Excalidraw initialData={emptyScene() as any} langCode="zh-CN" theme="light" UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }} /></div><div className="field-label">允许检索的组件库（可多选）</div><div className="library-pills">{['shadcn/ui', 'Ant Design', 'MUI'].map(item => <button key={item} aria-pressed={libraries.includes(item)} className={libraries.includes(item) ? 'library-pill active' : 'library-pill'} onClick={() => setLibraries(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{libraries.includes(item) && <Check size={12} />}{item}</button>)}</div><label className="field-label" htmlFor="component-instruction">检索说明</label><textarea id="component-instruction" value={instruction} onChange={event => setInstruction(event.target.value)} disabled={!artwork} /><button className="search-btn" onClick={runSearch} disabled={searching || !artwork}><WandSparkles size={17} />{searching ? '正在理解草图…' : '调用 Codex CLI 检索'}</button><div className="search-status" role="status" aria-live="polite"><span className="status-pulse" />{status}<span>{artwork?.name || '未选择图稿'}</span></div><div className="candidate-list">{candidates.map(candidate => <article className="candidate-card" key={candidate.id} draggable onDragStart={event => { event.dataTransfer.setData('application/x-dockyard-candidate', JSON.stringify(candidate)); event.dataTransfer.effectAllowed = 'copy'; }}><div className="candidate-thumb"><img src={placeholderPreview(candidate)} alt={`${candidate.name} 候选预览`} /></div><div className="candidate-info"><strong>{candidate.name}</strong><small>{candidate.library} · {candidate.version || 'latest'}</small><p>{candidate.description || '候选组件'}</p><div className="candidate-links"><a href={candidate.docsUrl} target="_blank" rel="noreferrer">文档 ↗</a><a href={candidate.codeUrl} target="_blank" rel="noreferrer">代码 ↗</a><span className={candidate.previewKind === 'reference' ? 'kind reference' : 'kind'}>{candidate.previewKind === 'reference' ? '参考图' : '真实预览'}</span></div></div><div className="candidate-actions"><button title="加入全局组件" aria-label={`将 ${candidate.name} 加入全局组件`} onClick={() => addGlobal(candidate)}><Copy size={16} /></button><button className="candidate-add" onClick={() => addToArtwork(candidate)} disabled={!artwork}><Plus size={15} />加入当前图稿</button><span>可拖入画布</span></div></article>)}{!candidates.length && <div className="panel-hint"><Search size={24} /><span>{artwork ? '候选结果会显示在这里' : '选择图稿后，候选结果会显示在这里'}</span></div>}</div><button className="back-to-canvas" onClick={() => openPanel('annotator')}><ArrowDownToLine size={15} />回到当前图稿</button></main></div>;
}

function TokensView() {
  const groups = useMemo(() => projectTokenData.tokens.reduce<Record<string, typeof projectTokenData.tokens>>((acc, token) => { (acc[token.category] ||= []).push(token); return acc; }, {}), []);
  const labels: Record<string, string> = { color: '颜色', typography: '文字', spacing: '间距', sizing: '尺寸', shape: '形状', motion: '动效', interaction: '交互' };
  return <div className="panel-shell compact-panel token-panel"><WindowHeader title="项目 Token" eyebrow="TOKENS / BASELINE" onClose={() => window.dockyard?.closePanel('tokens')} /><main className="token-page"><div className="state-banner"><ShieldCheck size={17} /><div><strong>当前基线</strong><span>28 个 Token · 仅供查看</span></div><code>baseline</code></div><div className="token-groups">{Object.entries(groups).map(([category, tokens]) => <section className="token-group" key={category}><div className="token-group-heading"><span>{labels[category] || category}</span><small>{tokens.length} 个</small></div>{tokens.map(token => <div className="token-row" key={token.path}><code>{token.path}</code><span className="token-value"><strong>{String(token.value)}</strong>{token.type === 'color' && <i className="token-swatch" style={{ backgroundColor: String(token.value) }} role="img" aria-label={`${token.value} 色块`} />}</span><span>{token.description}</span></div>)}</section>)}</div></main></div>;
}

function DecisionsView() {
  return <div className="panel-shell compact-panel decision-panel"><WindowHeader title="设计决策" eyebrow="DECISIONS / CONFIRMED" onClose={() => window.dockyard?.closePanel('decisions')} /><main className="decision-page"><div className="state-banner"><ShieldCheck size={17} /><div><strong>确认记录为空</strong><span>当前没有已确认或待处理的 Token 决策。</span></div><code>0 decisions</code></div><div className="decision-empty"><FileCode2 size={30} /><strong>先从候选 UI 开始</strong><p>候选变更会在评审后出现在这里。只有明确接受后，才会更新项目基线。</p></div></main></div>;
}
function App() { const view = new URLSearchParams(window.location.search).get('view') || 'bar'; if (view === 'bar') return <BarView />; if (view === 'component-search') return <ComponentSearchView />; if (view === 'tokens') return <TokensView />; if (view === 'decisions') return <DecisionsView />; return <AnnotatorView />; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
