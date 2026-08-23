import path from "node:path";

const priorityOrder = ["P0", "P1", "P2", "P3"];
const decisionLabels = { accepted: "接受", rejected: "拒绝", discuss: "讨论", superseded: "已过时" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function toArtifactUrl(projectRoot, outputPath, artifactPath) {
  const absolute = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(projectRoot, artifactPath);
  return path.relative(path.dirname(outputPath), absolute).split(path.sep).join("/");
}

function renderEvidence(review, item, options) {
  if (!item.evidence?.length) return "";
  const figures = item.evidence.map((evidence) => {
    const url = escapeHtml(toArtifactUrl(options.projectRoot, options.outputPath, evidence.path));
    const label = escapeHtml(evidence.label || "评审证据");
    if (evidence.kind === "image") {
      return `<figure><img src="${url}" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`;
    }
    if (evidence.kind === "motion") {
      return `<figure><video src="${url}" controls preload="metadata" aria-label="${label}"></video><figcaption>${label}</figcaption></figure>`;
    }
    return `<a class="artifact-link" href="${url}" target="_blank" rel="noreferrer">打开 ${label}</a>`;
  }).join("");
  return `<div class="evidence-grid">${figures}</div>`;
}

function renderTokenChanges(review, item) {
  const tokens = new Set(item.changeTokens || []);
  const changes = review.changes.filter((change) => tokens.has(change.token));
  if (!changes.length) return "";
  return `<div class="token-impact"><div class="section-label">变量影响</div><div class="token-table">${changes.map((change) => `
    <div class="token-row">
      <code>${escapeHtml(change.token)}</code>
      <span>${escapeHtml(displayValue(change.from))}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="token-to">${escapeHtml(displayValue(change.to))}</span>
    </div>`).join("")}</div></div>`;
}

function renderItem(review, item, options) {
  return `<article class="finding" id="item-${escapeHtml(item.id)}" data-item-id="${escapeHtml(item.id)}" data-priority="${escapeHtml(item.priority)}">
    <header class="finding-header">
      <div class="finding-meta"><span>${escapeHtml(item.id)}</span><span class="priority">${escapeHtml(item.priority)}</span><span>${escapeHtml(item.category)}</span></div>
      <span class="finding-status" data-status>未决定</span>
    </header>
    <h3>${escapeHtml(item.title)}</h3>
    <div class="section-label">当前问题</div>
    <p class="current-state">${escapeHtml(item.currentState)}</p>
    ${item.source?.length ? `<div class="source-list">${item.source.map((source) => `<code>${escapeHtml(source)}</code>`).join("")}</div>` : ""}
    ${renderEvidence(review, item, options)}
    <div class="proposal"><div class="section-label">建议方案</div><p>${escapeHtml(item.proposedState)}</p></div>
    ${renderTokenChanges(review, item)}
    <div class="item-review" role="group" aria-label="${escapeHtml(item.title)}的评审决定">
      <div class="decision-options">
        <button type="button" data-decision="accepted">接受</button>
        <button type="button" data-decision="rejected">拒绝</button>
        <button type="button" data-decision="discuss">讨论</button>
        <button type="button" data-decision="superseded">已过时</button>
      </div>
      <label><span class="sr-only">${escapeHtml(item.title)}的评论</span><textarea data-comment rows="2" placeholder="讨论或标记已过时时填写原因"></textarea></label>
    </div>
  </article>`;
}

function renderGroups(review, options) {
  const groups = priorityOrder.map((priority) => ({
    priority,
    items: review.reviewItems.filter((item) => item.priority === priority),
  })).filter((group) => group.items.length);
  return groups.map((group) => `<section class="priority-group" aria-labelledby="group-${group.priority}">
    <div class="group-heading"><h2 id="group-${group.priority}">${group.priority} · ${priorityLabel(group.priority)}</h2><span>${group.items.length} 项</span></div>
    <p>${priorityDescription(group.priority)}</p>
    <div class="finding-list">${group.items.map((item) => renderItem(review, item, options)).join("")}</div>
  </section>`).join("");
}

function priorityLabel(priority) {
  return { P0: "立即处理", P1: "优先修复", P2: "体验完善", P3: "后续观察" }[priority];
}

function priorityDescription(priority) {
  return {
    P0: "阻断使用或造成高风险误判的问题。",
    P1: "下一轮实现前应明确处理的高影响问题。",
    P2: "不会阻断流程，但会明显影响理解和操作质量。",
    P3: "影响较小，可在核心方向稳定后继续评估。",
  }[priority];
}

export function renderReviewHtml(review, options) {
  const total = review.reviewItems.length;
  const orderedItems = priorityOrder.flatMap((priority) => review.reviewItems.filter((item) => item.priority === priority));
  const counts = Object.fromEntries(priorityOrder.map((priority) => [priority, review.reviewItems.filter((item) => item.priority === priority).length]));
  const safeData = JSON.stringify({
    reviewId: review.id,
    items: orderedItems.map(({ id, priority, title, changeTokens = [] }) => ({ id, priority, title, changeTokens })),
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(review.summary.title)}</title>
<style>
:root{color-scheme:dark;font-family:Manrope,"Segoe UI",sans-serif;color:#f4f2eb;background:#0b0e0f;--canvas:#0b0e0f;--panel:#111617;--raised:#172021;--line:#2a3838;--muted:#82908b;--text:#f4f2eb;--lime:#e7ff63;--cyan:#63f4e2;--orange:#ff8a65;--danger:#d87983;--mono:"DM Mono",Consolas,monospace}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--canvas);color:var(--text)}button,textarea{font:inherit}.wrap{width:min(920px,calc(100% - 40px));margin:0 auto;padding:42px 0 118px}.eyebrow,.section-label,.finding-meta,.finding-status,.metric dt,.progress-copy,.source-list code,.token-row code{font-family:var(--mono);letter-spacing:0}.eyebrow{margin:0 0 16px;color:var(--muted);font-size:10px;text-transform:uppercase}.hero h1{margin:0;font-size:28px;line-height:1.18}.hero>p{max-width:760px;margin:12px 0 0;color:#abb4b0;font-size:13px;line-height:1.7}.metrics{display:flex;flex-wrap:wrap;gap:18px;margin:25px 0 0;padding:0}.metric{display:flex;gap:7px;align-items:baseline}.metric dt{color:var(--muted);font-size:10px}.metric dd{margin:0;font:600 13px var(--mono)}.instructions{margin:28px 0 46px;padding:15px 17px;border:1px solid #4a4631;border-radius:7px;background:#201f18;color:#c7c6ba;font-size:12px;line-height:1.65}.instructions strong{color:#d8c98b}.priority-group{margin-top:48px}.group-heading{display:flex;align-items:baseline;gap:9px}.group-heading h2{margin:0;font-size:18px}.group-heading span{color:var(--muted);font:10px var(--mono)}.priority-group>p{margin:8px 0 18px;color:var(--muted);font-size:12px}.finding-list{display:grid;gap:16px}.finding{padding:22px;border:1px solid var(--line);border-radius:7px;background:var(--panel)}.finding[data-decision="accepted"]{border-color:#465237}.finding[data-decision="rejected"]{border-color:#5a363b}.finding[data-decision="discuss"]{border-color:#36555a}.finding-header{display:flex;justify-content:space-between;gap:14px}.finding-meta{display:flex;gap:8px;color:var(--muted);font-size:10px}.finding-meta .priority{padding:1px 5px;border-radius:3px;color:#d8c98b;background:#29261a}.finding-status{color:var(--muted);font-size:9px}.finding[data-decision="accepted"] .finding-status{color:var(--lime)}.finding[data-decision="rejected"] .finding-status{color:var(--danger)}.finding[data-decision="discuss"] .finding-status{color:var(--cyan)}.finding h3{margin:13px 0 12px;font-size:16px;line-height:1.4}.section-label{margin-top:15px;color:#b9aa6d;font-size:9px;text-transform:uppercase}.current-state,.proposal p{margin:7px 0 0;color:#c3cac6;font-size:12px;line-height:1.65}.source-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.source-list code{color:var(--muted);font-size:9px}.evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:15px}.evidence-grid figure{margin:0}.evidence-grid img,.evidence-grid video{display:block;width:100%;border:1px solid var(--line);border-radius:4px;background:#080a0b}.evidence-grid figcaption{margin-top:6px;color:var(--muted);font:9px var(--mono)}.artifact-link{display:inline-flex;margin-top:15px;color:var(--cyan);font-size:11px}.proposal{margin-top:17px;padding:13px 14px;border:1px solid #242d2d;background:var(--raised)}.proposal .section-label{margin-top:0}.token-impact{margin-top:15px}.token-table{margin-top:7px;border-top:1px solid var(--line)}.token-row{display:grid;grid-template-columns:minmax(190px,1.4fr) minmax(80px,.8fr) 18px minmax(80px,.8fr);gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:10px}.token-row code{overflow:hidden;color:var(--cyan);text-overflow:ellipsis}.token-row span{color:var(--muted)}.token-row .arrow{color:#596460;text-align:center}.token-row .token-to{color:var(--text)}.item-review{display:grid;grid-template-columns:auto minmax(240px,1fr);gap:10px;margin-top:16px}.decision-options{display:flex;gap:6px}.decision-options button,.result-actions button{min-height:36px;padding:0 14px;border:1px solid var(--line);border-radius:5px;background:#0e1213;color:var(--muted);font-size:10px;cursor:pointer}.decision-options button:hover{color:var(--text);border-color:#53605d}.decision-options button[aria-pressed="true"][data-decision="accepted"]{color:#172014;border-color:var(--lime);background:var(--lime)}.decision-options button[aria-pressed="true"][data-decision="rejected"]{color:#fff;border-color:var(--danger);background:#5a2c32}.decision-options button[aria-pressed="true"][data-decision="discuss"]{color:#10201e;border-color:var(--cyan);background:var(--cyan)}textarea{width:100%;min-height:36px;padding:9px 10px;resize:vertical;border:1px solid var(--line);border-radius:5px;background:#0d1112;color:var(--text);font-size:11px;line-height:1.45}button:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}.field-error{border-color:var(--orange)!important}.results{margin-top:58px;padding-top:28px;border-top:1px solid var(--line)}.results h2{margin:0;font-size:18px}.results>p{color:var(--muted);font-size:12px}.result-actions{display:flex;gap:8px;margin:16px 0 10px}.result-actions .primary{border-color:#b7c94f;background:#232814;color:var(--lime);font-weight:700}.result-output{min-height:260px;font-family:var(--mono);font-size:10px}.progress-dock{position:fixed;right:0;bottom:0;left:0;z-index:10;border-top:1px solid var(--line);background:rgba(11,14,15,.96);backdrop-filter:blur(12px)}.progress-inner{width:min(920px,calc(100% - 40px));min-height:56px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:14px}.progress-copy{color:var(--muted);font-size:10px}.progress-copy strong{color:var(--text)}.progress-actions{display:flex;align-items:center;gap:12px}.progress-actions a{color:#d8c98b;font:10px var(--mono)}.progress-track{width:160px;height:3px;overflow:hidden;background:var(--line)}.progress-track span{display:block;width:0;height:100%;background:var(--lime);transition:width 180ms ease}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:680px){.wrap,.progress-inner{width:min(100% - 24px,920px)}.wrap{padding-top:26px}.item-review{grid-template-columns:1fr}.decision-options{display:grid;grid-template-columns:repeat(3,1fr)}.token-row{grid-template-columns:1fr 1fr}.token-row .arrow{display:none}.progress-track{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.progress-track span{transition:none}}
.decision-options{flex-wrap:wrap}.decision-options button[aria-pressed="true"][data-decision="superseded"]{color:#211e13;border-color:#d8c98b;background:#d8c98b}.finding[data-decision="superseded"]{border-color:#5a4d2d}.finding[data-decision="superseded"] .finding-status{color:#d8c98b}.submit-note{display:block;margin-top:10px;color:var(--muted);font:10px var(--mono)}.submit-note textarea{margin-top:6px}
@media(max-width:680px){.decision-options{display:grid;grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<main class="wrap">
  <header class="hero">
    <p class="eyebrow">${escapeHtml(review.mode)} · ${escapeHtml(review.target.surface)} · ${escapeHtml(review.id)}</p>
    <h1>${escapeHtml(review.summary.title)}</h1>
    <p>${escapeHtml(review.summary.description)}</p>
    <dl class="metrics">
      <div class="metric"><dt>全部</dt><dd>${total}</dd></div>
      ${priorityOrder.filter((priority) => counts[priority]).map((priority) => `<div class="metric"><dt>${priority}</dt><dd>${counts[priority]}</dd></div>`).join("")}
      <div class="metric"><dt>变量变化</dt><dd>${review.changes.length}</dd></div>
    </dl>
  </header>
  <aside class="instructions"><strong>评审方式：</strong>逐项选择接受、拒绝、讨论或已过时。P0–P3 是按影响范围和处理时效划分的评审优先级：P1 表示下一轮实现前应处理，P2 表示不阻断流程但值得完善。讨论与已过时需要填写原因；完成后可直接提交到 Dockyard。</aside>
  ${renderGroups(review, options)}
  <section class="results" id="results">
    <p class="eyebrow">第二步</p>
    <h2>你的决定</h2>
    <p>逐项决定会保存到本地。全部完成后可以直接提交给 Dockyard，也可以复制结果作为备用。</p>
    <div class="result-actions"><button class="primary" type="button" id="submit-results">提交到 Dockyard</button><button type="button" id="copy-results">复制结果</button><button type="button" id="reset-results">重置全部决定</button><span id="copy-status" role="status" aria-live="polite"></span></div>
    <label class="submit-note"><span>提交说明（可选）</span><textarea id="submit-note" rows="2" placeholder="补充这轮评审的整体说明"></textarea></label>
    <textarea class="result-output" id="result-output" readonly aria-label="评审结果"></textarea>
  </section>
</main>
<footer class="progress-dock"><div class="progress-inner"><div class="progress-copy"><strong id="decided-count">0 / ${total}</strong> 已决定 · <span id="accepted-count">0</span> 接受 · <span id="rejected-count">0</span> 拒绝 · <span id="discuss-count">0</span> 讨论 · <span id="superseded-count">0</span> 已过时</div><div class="progress-actions"><div class="progress-track" aria-hidden="true"><span id="progress-bar"></span></div><a href="#results">查看结果</a></div></div></footer>
<script>
const review=${safeData};
const storageKey='dockyard-review:'+review.reviewId;
const labels={accepted:'接受',rejected:'拒绝',discuss:'讨论',superseded:'已过时'};
let decisions={};
try{decisions=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{localStorage.removeItem(storageKey)}
function save(){localStorage.setItem(storageKey,JSON.stringify(decisions))}
function validDecision(item){const value=decisions[item.id];return Boolean(value?.decision&&(value.decision!=='discuss'&&value.decision!=='superseded'||value.comment?.trim()))}
function render(){
  const counts={accepted:0,rejected:0,discuss:0,superseded:0};
  for(const item of review.items){
    const card=document.querySelector('[data-item-id="'+CSS.escape(item.id)+'"]');
    const value=decisions[item.id]||{};
    card.dataset.decision=value.decision||'';
    card.querySelector('[data-status]').textContent=value.decision?labels[value.decision]:'未决定';
    for(const button of card.querySelectorAll('[data-decision]'))button.setAttribute('aria-pressed',String(button.dataset.decision===value.decision));
    const comment=card.querySelector('[data-comment]');
    if(comment.value!==String(value.comment||''))comment.value=value.comment||'';
    comment.classList.toggle('field-error',(value.decision==='discuss'||value.decision==='superseded')&&!value.comment?.trim());
    if(validDecision(item))counts[value.decision]++;
  }
  const decided=Object.values(counts).reduce((sum,value)=>sum+value,0);
  document.querySelector('#decided-count').textContent=decided+' / '+review.items.length;
  document.querySelector('#accepted-count').textContent=counts.accepted;
  document.querySelector('#rejected-count').textContent=counts.rejected;
  document.querySelector('#discuss-count').textContent=counts.discuss;
  document.querySelector('#superseded-count').textContent=counts.superseded;
  document.querySelector('#progress-bar').style.width=(decided/review.items.length*100)+'%';
  document.querySelector('#result-output').value=buildResult();
}
function buildResult(){
  const lines=['评审：'+review.reviewId,'进度：'+review.items.filter(validDecision).length+'/'+review.items.length,''];
  for(const item of review.items){
    const value=decisions[item.id];
    if(!validDecision(item)){lines.push(item.id+' ['+item.priority+'] '+item.title+': '+(value?.decision==='discuss'?'讨论（请补充评论）':value?.decision==='superseded'?'已过时（请补充原因）':'未决定'));continue}
    lines.push(item.id+' ['+item.priority+'] '+item.title+': '+labels[value.decision].toUpperCase()+(value.comment?.trim()?' — '+value.comment.trim():''));
  }
  const acceptedTokens=[...new Set(review.items.filter((item)=>decisions[item.id]?.decision==='accepted').flatMap((item)=>item.changeTokens))];
  if(acceptedTokens.length)lines.push('','接受的变量变化：'+acceptedTokens.join(', '));
  return lines.join('\\n');
}
for(const card of document.querySelectorAll('[data-item-id]')){
  const id=card.dataset.itemId;
  for(const button of card.querySelectorAll('[data-decision]'))button.addEventListener('click',()=>{
    decisions[id]={...(decisions[id]||{}),decision:button.dataset.decision};save();render();
    if(button.dataset.decision==='discuss'||button.dataset.decision==='superseded')card.querySelector('[data-comment]').focus();
  });
  card.querySelector('[data-comment]').addEventListener('input',(event)=>{decisions[id]={...(decisions[id]||{}),comment:event.target.value};save();render()});
}
document.querySelector('#copy-results').addEventListener('click',async()=>{
  const output=document.querySelector('#result-output');const status=document.querySelector('#copy-status');
  try{await navigator.clipboard.writeText(output.value)}catch{output.select();document.execCommand('copy')}
  status.textContent='已复制';
});
document.querySelector('#reset-results').addEventListener('click',()=>{decisions={};save();render();document.querySelector('#copy-status').textContent='已重置'});
document.querySelector('#submit-results').addEventListener('click',async()=>{
  const status=document.querySelector('#copy-status');
  const submit=document.querySelector('#submit-results');
  const incomplete=review.items.filter((item)=>!validDecision(item));
  if(incomplete.length){status.textContent='还有 '+incomplete.length+' 项未完成';return}
  status.textContent='正在提交…';
  submit.disabled=true;
  const itemDecisions=review.items.map((item)=>({itemId:item.id,decision:decisions[item.id].decision,comment:String(decisions[item.id].comment||'').trim()}));
  try{
    const response=await fetch('http://127.0.0.1:5174/review/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId:review.reviewId,itemDecisions,rationale:document.querySelector('#submit-note').value.trim()||'逐项评审已完成，按各项决定处理。'})});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'提交失败');
    status.textContent='已提交到 Dockyard';
  }catch(error){status.textContent='提交失败：'+(error instanceof Error?error.message:'本机服务不可用')}
  finally{submit.disabled=false}
});
render();
</script>
</body>
</html>`;
}
