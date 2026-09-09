import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(root, "prototype-spec.json"), "utf8"));
const output = join(root, "output");
mkdirSync(output, { recursive: true });

let seed = 100;
const elements = [];
const textWidth = (value, size) => Math.ceil([...value].reduce((sum, char) => sum + (/^[\x00-\x7F]$/.test(char) ? .62 : 1), 0) * size + 24);
const common = (id, type, x, y, width, height, groupIds = []) => ({
  id, type, x, y, width, height, angle: 0, strokeColor: "#343a40",
  backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1,
  strokeStyle: "solid", roughness: 1, opacity: 100, groupIds, frameId: null,
  roundness: type === "rectangle" ? { type: 3 } : null, seed: seed++,
  version: 1, versionNonce: seed++, isDeleted: false, boundElements: null,
  updated: 1, link: null, locked: false
});
const rect = (id, x, y, width, height, group, fill = "transparent") =>
  elements.push({ ...common(id, "rectangle", x, y, width, height, [group]), backgroundColor: fill });
const line = (id, x, y, dx, dy, group) =>
  elements.push({ ...common(id, "line", x, y, Math.abs(dx), Math.abs(dy), [group]), points: [[0, 0], [dx, dy]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null });
const text = (id, x, y, value, size, group, width = textWidth(value, size)) =>
  elements.push({ ...common(id, "text", x, y, width, Math.ceil(size * 1.5), [group]), strokeColor: "#212529", fontSize: size, fontFamily: 1, text: value, textAlign: "left", verticalAlign: "top", containerId: null, originalText: value, autoResize: true, lineHeight: 1.25 });
const rows = (prefix, x, y, width, group, selected = 1) => {
  for (let index = 0; index < 5; index++) {
    rect(`${prefix}-row-${index}`, x, y + index * 54, width, 42, group, index === selected ? "#e9ecef" : "transparent");
    rect(`${prefix}-avatar-${index}`, x + 12, y + 9 + index * 54, 24, 24, group);
    text(`${prefix}-name-${index}`, x + 50, y + 10 + index * 54, `患者 ${index + 1}`, 14, group, 100);
  }
};
const shell = (v, x, name, tradeoff) => {
  const group = `variant-${v}`;
  text(`${v}-title`, x, 35, `方案 ${v} · ${name}`, 24, group, 330);
  text(`${v}-tradeoff`, x, 72, tradeoff, 14, group, 500);
  rect(`${v}-page`, x, 110, 980, 650, group);
  rect(`${v}-topbar`, x, 110, 980, 64, group, "#f8f9fa");
  text(`${v}-brand`, x + 24, 130, "患者信息管理", 18, group, 180);
  text(`${v}-nav-1`, x + 600, 132, "患者", 15, group, 70);
  text(`${v}-nav-2`, x + 700, 132, "回访", 15, group, 70);
  text(`${v}-nav-3`, x + 800, 132, "系统管理", 15, group, 110);
  return group;
};

{
  const x = 40, g = shell("A", x, spec.variants[0].name, spec.variants[0].tradeoff);
  rect("A-list", x, 174, 270, 586, g, "#f8f9fa"); text("A-list-title", x + 24, 198, "患者列表", 17, g, 130);
  rect("A-search", x + 22, 236, 226, 42, g); text("A-search-label", x + 40, 248, "搜索患者", 14, g, 120);
  rows("A", x + 20, 300, 230, g, 1);
  text("A-current", x + 302, 202, "当前患者：患者 2", 16, g, 220);
  text("A-tab-detail", x + 302, 248, "患者详情", 16, g, 120); text("A-tab-task", x + 442, 248, "回访任务", 16, g, 120);
  line("A-tab-line", x + 300, 282, 620, 0, g); line("A-active-line", x + 302, 280, 88, 0, g);
  rect("A-content", x + 300, 308, 630, 390, g);
  text("A-content-title", x + 336, 346, "基本信息", 20, g, 130);
  for (let i = 0; i < 4; i++) line(`A-field-${i}`, x + 338, 400 + i * 58, 480, 0, g);
}
{
  const x = 1090, g = shell("B", x, spec.variants[1].name, spec.variants[1].tradeoff);
  rect("B-patient-context", x + 26, 198, 928, 112, g, "#f8f9fa");
  rect("B-avatar", x + 50, 222, 58, 58, g); text("B-name", x + 132, 218, "患者 2", 22, g, 130);
  text("B-meta", x + 132, 258, "编号 0002 · 最近更新：今天", 14, g, 290);
  rect("B-change", x + 770, 228, 150, 42, g); text("B-change-label", x + 790, 240, "切换患者", 14, g, 110);
  text("B-tab-detail", x + 46, 344, "患者详情", 17, g, 120); text("B-tab-task", x + 196, 344, "回访任务", 17, g, 120);
  line("B-tab-line", x + 36, 382, 880, 0, g); line("B-active-line", x + 46, 380, 96, 0, g);
  rect("B-content", x + 36, 410, 880, 300, g);
  text("B-content-title", x + 72, 446, "患者概览", 20, g, 150);
  rect("B-info-left", x + 70, 492, 360, 170, g); rect("B-info-right", x + 470, 492, 400, 170, g);
  text("B-info-label-1", x + 94, 516, "身份与联系方式", 15, g, 180); text("B-info-label-2", x + 494, 516, "近期记录", 15, g, 130);
}
{
  const x = 2140, g = shell("C", x, spec.variants[2].name, spec.variants[2].tradeoff);
  rect("C-sidebar", x, 174, 190, 586, g, "#f8f9fa");
  text("C-section-1", x + 24, 208, "患者中心", 16, g, 120); text("C-section-2", x + 24, 258, "回访管理", 16, g, 120);
  line("C-nav-divider", x + 18, 294, 150, 0, g);
  text("C-section-3", x + 24, 318, "最近访问", 14, g, 110);
  rect("C-list", x + 190, 174, 270, 586, g); text("C-list-title", x + 216, 202, "患者列表", 17, g, 130);
  rect("C-search", x + 214, 238, 220, 42, g); text("C-search-label", x + 232, 250, "搜索患者", 14, g, 120);
  rows("C", x + 210, 302, 230, g, 1);
  text("C-current", x + 494, 204, "患者 2", 20, g, 130);
  rect("C-tabs", x + 490, 242, 118, 116, g, "#f8f9fa");
  text("C-tab-detail", x + 512, 263, "患者详情", 15, g, 100); text("C-tab-task", x + 512, 313, "回访任务", 15, g, 100);
  rect("C-content", x + 628, 242, 322, 456, g);
  text("C-content-title", x + 660, 278, "患者详情", 20, g, 140);
  for (let i = 0; i < 5; i++) line(`C-field-${i}`, x + 660, 340 + i * 58, 240, 0, g);
}

const scene = { type: "excalidraw", version: 2, source: "dockyard-page-wireframe-prototype", elements, appState: { viewBackgroundColor: "#ffffff", zoom: { value: 0.4 } }, files: {} };
writeFileSync(join(output, "patient-management.excalidraw"), JSON.stringify(scene, null, 2));
for (const [index, variant] of spec.variants.entries()) {
  const shiftX = index * 1050;
  const variantElements = elements
    .filter((element) => element.groupIds.includes(`variant-${variant.id}`))
    .map((element) => ({ ...element, x: element.x - shiftX + 100, y: element.y + 100 }));
  writeFileSync(
    join(output, `patient-management-${variant.id}.excalidraw`),
    JSON.stringify({ ...scene, elements: variantElements, appState: { ...scene.appState, zoom: { value: 0.7 } } }, null, 2),
  );
}

const cards = spec.variants.map((variant) => `<section data-variant="${variant.id}"><h1>方案 ${variant.id} · ${variant.name}</h1><p>${variant.tradeoff}</p><div class="page ${variant.layout}"><div class="top">患者信息管理 <span>患者　回访　系统管理</span></div><div class="sketch"><b>患者列表</b><i>患者详情　/　回访任务</i></div></div></section>`).join("");
writeFileSync(join(output, "preview.html"), `<!doctype html><meta charset="utf-8"><title>页面原型生成实验</title><style>body{font:16px sans-serif;background:#f5f5f5;margin:0;padding:40px;color:#222}section{display:none;max-width:980px;margin:auto}section.active{display:block}.page{height:620px;border:2px solid;background:#fff}.top{height:64px;border-bottom:1px solid;padding:20px;box-sizing:border-box}.top span{float:right}.sketch{margin:32px;border:1px solid;height:470px;padding:24px}.sketch i{float:right;font-style:normal}.switch{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:12px 18px;border-radius:24px}button{margin:0 12px}</style>${cards}<div class="switch"><button id="prev">←</button><span id="label"></span><button id="next">→</button></div><script>const ids=["A","B","C"];let i=Math.max(0,ids.indexOf(new URLSearchParams(location.search).get("variant")));function show(n){i=(n+ids.length)%ids.length;document.querySelectorAll("section").forEach(x=>x.classList.toggle("active",x.dataset.variant===ids[i]));label.textContent="方案 "+ids[i];history.replaceState(null,"","?variant="+ids[i])}prev.onclick=()=>show(i-1);next.onclick=()=>show(i+1);addEventListener("keydown",e=>{if(["INPUT","TEXTAREA"].includes(e.target.tagName))return;if(e.key==="ArrowLeft")show(i-1);if(e.key==="ArrowRight")show(i+1)});show(i)</script>`);
console.log(`生成完成：${elements.length} 个原生元素，3 个布局方案。`);
