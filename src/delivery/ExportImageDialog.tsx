import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";

export type ExportImageOptions = {
  includeComponents: boolean;
  background: boolean;
  scale: 1 | 2 | 3;
};

export type ExportImageDialogProps = {
  open: boolean;
  artworkName: string;
  previewDataUrl: string | null;
  onClose: () => void;
  onExport: (options: ExportImageOptions) => Promise<void>;
  onCopyImage: (options: ExportImageOptions) => Promise<void>;
};

const defaults: ExportImageOptions = { includeComponents: true, background: true, scale: 1 };

export function ExportImageDialog({ open, artworkName, previewDataUrl, onClose, onExport, onCopyImage }: ExportImageDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<ExportImageOptions>(defaults);
  const [busy, setBusy] = useState<"export" | "copy" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) {
      setOptions(defaults);
      setError("");
    }
  }, [open]);

  const run = async (kind: "export" | "copy") => {
    setBusy(kind); setError("");
    try {
      if (kind === "export") await onExport(options);
      else await onCopyImage(options);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败，请重试");
    } finally { setBusy(null); }
  };

  return <dialog ref={dialogRef} className="canvas-dialog export-image-dialog" aria-label="导出图片" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClose={onClose}>
    <section className="canvas-dialog-content">
      <header className="canvas-dialog-header"><h2>导出图片</h2><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="关闭导出图片"><X size={18} aria-hidden="true" /></button></header>
      <div className="export-image-layout">
        <div className="export-image-preview">{previewDataUrl ? <img src={previewDataUrl} alt={`${artworkName}预览`} /> : <span>正在生成预览…</span>}</div>
        <div className="export-image-settings">
          <label><span>包含组件信息</span><input type="checkbox" checked={options.includeComponents} onChange={(event) => setOptions({ ...options, includeComponents: event.target.checked })} /></label>
          <label title="当前合成导出固定使用画布背景"><span>背景</span><input type="checkbox" checked={options.background} disabled aria-label="背景（固定）" /></label>
          <fieldset><legend>缩放比例</legend><div className="export-scale-options">{([1, 2, 3] as const).map((scale) => <button type="button" key={scale} className={options.scale === scale ? "selected" : ""} onClick={() => setOptions({ ...options, scale })}>{scale}×</button>)}</div></fieldset>
          {options.includeComponents && <p className="export-image-hint"><Check size={14} aria-hidden="true" />将同时保存同名组件清单</p>}
          {error && <p className="export-image-error" role="alert">{error}</p>}
          <div className="export-image-actions"><button type="button" onClick={() => void run("copy")} disabled={Boolean(busy) || !previewDataUrl}><Copy size={15} aria-hidden="true" />复制图片</button><button type="button" className="primary" onClick={() => void run("export")} disabled={Boolean(busy) || !previewDataUrl}><Download size={15} aria-hidden="true" />{busy === "export" ? "导出中…" : "导出 PNG"}</button></div>
        </div>
      </div>
    </section>
  </dialog>;
}
