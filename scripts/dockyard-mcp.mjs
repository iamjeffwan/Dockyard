#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { renderReviewHtml } from "./review-html.mjs";


const projectRoot = path.resolve(process.env.DOCKYARD_PROJECT_ROOT || process.cwd());
const designDir = path.resolve(
  process.env.DOCKYARD_DESIGN_DIR ||
    (await exists(path.join(projectRoot, ".dockyard", "design"))
      ? path.join(projectRoot, ".dockyard", "design")
      : path.join(projectRoot, "design")),
);

const resourceFiles = new Map([
  ["dockyard://design/DESIGN.md", "DESIGN.md"],
  ["dockyard://design/token-schema.json", "token-schema.json"],
  ["dockyard://design/project-tokens.json", "project-tokens.json"],
  ["dockyard://design/review-schema.json", "review-schema.json"],
  ["dockyard://design/context-memory-schema.json", "context-memory-schema.json"],
  ["dockyard://design/context-memory.json", "context-memory.json"],
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readJson(fileName, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(designDir, fileName), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function listJsonFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function textResult(value, extra = {}) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], ...extra };
}
async function readJsonRecords(directory) {
  const files = await listJsonFiles(directory);
  const records = [];
  for (const fileName of files) {
    try {
      records.push(JSON.parse(await fs.readFile(path.join(directory, fileName), "utf8")));
    } catch {
      records.push({ file: fileName, error: "Invalid JSON decision record" });
    }
  }
  return records;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function validateReviewShape(review) {
  requireObject(review, "review");
  const required = ["protocol", "version", "id", "mode", "target", "summary", "changes", "reviewItems", "artifacts", "status"];
  for (const key of required) if (!(key in review)) throw new Error(`Missing required field: ${key}`);
  if (review.protocol !== "dockyard-ui" || review.version !== "1.1") throw new Error("Unsupported Dockyard UI review protocol");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(review.id)) throw new Error("Invalid review id");
  if (!["static", "motion", "interaction"].includes(review.mode)) throw new Error("Invalid review mode");
  if (review.status !== "proposed") throw new Error("Only proposed reviews may be submitted");
  requireObject(review.target, "target");
  if (typeof review.target.surface !== "string" || !review.target.surface) throw new Error("target.surface is required");
  if (!Array.isArray(review.target.components)) throw new Error("target.components must be an array");
  requireObject(review.summary, "summary");
  if (typeof review.summary.title !== "string" || !review.summary.title.trim()) throw new Error("summary.title is required");
  if (typeof review.summary.description !== "string" || !review.summary.description.trim()) throw new Error("summary.description is required");
  if (!Array.isArray(review.changes)) throw new Error("changes must be an array");
  for (const change of review.changes) {
    requireObject(change, "change");
    for (const key of ["token", "from", "to", "affectedComponents", "reason", "status"]) {
      if (!(key in change)) throw new Error(`Change missing required field: ${key}`);
    }
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/.test(change.token)) throw new Error(`Invalid token path: ${change.token}`);
    if (change.status !== "proposed") throw new Error(`Change ${change.token} must be proposed`);
    if (!Array.isArray(change.affectedComponents) || !change.reason) throw new Error(`Invalid impact record for ${change.token}`);
  }
  if (!Array.isArray(review.reviewItems) || !review.reviewItems.length) throw new Error("reviewItems must be a non-empty array");
  const availableTokens = new Set(review.changes.map((change) => change.token));
  const itemIds = new Set();
  for (const item of review.reviewItems) {
    requireObject(item, "review item");
    for (const key of ["id", "priority", "category", "title", "currentState", "proposedState", "changeTokens"]) {
      if (!(key in item)) throw new Error(`Review item missing required field: ${key}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.id) || itemIds.has(item.id)) throw new Error(`Invalid or duplicate review item id: ${item.id}`);
    itemIds.add(item.id);
    if (!["P0", "P1", "P2", "P3"].includes(item.priority)) throw new Error(`Invalid priority for ${item.id}`);
    if (![item.category, item.title, item.currentState, item.proposedState].every((value) => typeof value === "string" && value.trim())) {
      throw new Error(`Review item ${item.id} has empty content`);
    }
    if (!Array.isArray(item.changeTokens)) throw new Error(`changeTokens must be an array for ${item.id}`);
    for (const token of item.changeTokens) if (!availableTokens.has(token)) throw new Error(`Review item ${item.id} references unknown change: ${token}`);
    if (item.source !== undefined && !Array.isArray(item.source)) throw new Error(`source must be an array for ${item.id}`);
    if (item.evidence !== undefined) {
      if (!Array.isArray(item.evidence)) throw new Error(`evidence must be an array for ${item.id}`);
      for (const evidence of item.evidence) {
        requireObject(evidence, "evidence");
        if (!["image", "motion", "html"].includes(evidence.kind)) throw new Error(`Invalid evidence kind for ${item.id}`);
        if (typeof evidence.path !== "string" || !evidence.path) throw new Error(`Evidence path is required for ${item.id}`);
      }
    }
  }
  if (!Array.isArray(review.artifacts)) throw new Error("artifacts must be an array");
  for (const artifact of review.artifacts) {
    requireObject(artifact, "artifact");
    if (!["html-preview", "image-preview", "motion-preview"].includes(artifact.kind)) throw new Error(`Invalid artifact kind: ${artifact.kind}`);
    if (typeof artifact.path !== "string" || !artifact.path) throw new Error("Artifact path is required");
  }
  return review;
}

async function validateArtifactPath(filePath, kind, label) {
  const target = path.resolve(projectRoot, filePath);
  if (!isInside(projectRoot, target)) throw new Error(`${label} path escapes project root: ${filePath}`);
  if ((kind === "html-preview" || kind === "html") && path.extname(target).toLowerCase() !== ".html") {
    throw new Error(`${label} must use .html: ${filePath}`);
  }
  if (!(await exists(target))) throw new Error(`${label} does not exist: ${filePath}`);
}
async function validateReview(review, checkArtifacts = true) {
  validateReviewShape(review);
  const projectTokens = await readJson("project-tokens.json");
  const currentByPath = new Map((projectTokens.tokens || []).map((token) => [token.path, token.value]));
  const stale = [];
  for (const change of review.changes) {
    if (currentByPath.has(change.token) && JSON.stringify(currentByPath.get(change.token)) !== JSON.stringify(change.from)) {
      stale.push({ token: change.token, current: currentByPath.get(change.token), submittedFrom: change.from });
    }
  }
  if (stale.length) throw new Error(`Review is stale: ${JSON.stringify(stale)}`);
  if (checkArtifacts) {
    for (const artifact of review.artifacts) {
      await validateArtifactPath(artifact.path, artifact.kind, "Artifact");
    }
    for (const item of review.reviewItems) {
      for (const evidence of item.evidence || []) await validateArtifactPath(evidence.path, evidence.kind, `Evidence for ${item.id}`);
    }
  }
  return { valid: true, reviewId: review.id, changedTokens: review.changes.map((change) => change.token), artifactCount: review.artifacts.length };
}

async function getDesignContext() {
  const reviewsDir = path.join(designDir, "reviews");
  const decisionsDir = path.join(designDir, "decisions");
  return {
    projectRoot,
    designDir,
    files: {
      design: await readJsonText("DESIGN.md"),
      tokenSchema: await readJson("token-schema.json"),
      projectTokens: await readJson("project-tokens.json"),
      reviewSchema: await readJson("review-schema.json"),
      contextMemorySchema: await readJson("context-memory-schema.json"),
      contextMemory: await readJson("context-memory.json"),
    },
    indexes: {
      reviews: await listJsonFiles(reviewsDir),
      decisions: await listJsonFiles(decisionsDir),
      decisionRecords: await readJsonRecords(decisionsDir),
      contextMemory: (await readJson("context-memory.json")).entries,
    },
  };
}

async function readJsonText(fileName) {
  return fs.readFile(path.join(designDir, fileName), "utf8");
}
async function renderReview(review, { overwrite = true } = {}) {
  await validateReview(review, false);
  for (const item of review.reviewItems) {
    for (const evidence of item.evidence || []) await validateArtifactPath(evidence.path, evidence.kind, `Evidence for ${item.id}`);
  }
  for (const artifact of review.artifacts) {
    if (artifact.kind !== "html-preview") await validateArtifactPath(artifact.path, artifact.kind, "Artifact");
  }

  const reviewsDir = path.join(designDir, "reviews");
  await fs.mkdir(reviewsDir, { recursive: true });
  const requestedArtifact = review.artifacts.find((artifact) => artifact.kind === "html-preview");
  const requestedPath = requestedArtifact ? path.resolve(projectRoot, requestedArtifact.path) : null;
  if (requestedPath && (!isInside(reviewsDir, requestedPath) || path.extname(requestedPath).toLowerCase() !== ".html")) {
    throw new Error("HTML review artifact must stay inside the reviews directory");
  }
  const outputPath = requestedPath || path.join(reviewsDir, `${review.id}.html`);
  if (!overwrite && await exists(outputPath)) throw new Error(`Review artifact already exists: ${review.id}`);
  const artifactPath = path.relative(projectRoot, outputPath).replaceAll(path.sep, "/");
  const normalizedReview = {
    ...review,
    artifacts: [
      ...review.artifacts.filter((artifact) => artifact.kind !== "html-preview"),
      { kind: "html-preview", path: artifactPath, label: `${review.summary.title}评审页` },
    ],
  };
  const html = renderReviewHtml(normalizedReview, { projectRoot, outputPath });
  await fs.writeFile(outputPath, html, "utf8");
  return { review: normalizedReview, artifact: artifactPath };
}

async function submitReview(review) {
  const reviewsDir = path.join(designDir, "reviews");
  await fs.mkdir(reviewsDir, { recursive: true });
  const target = path.join(reviewsDir, `${review.id}.json`);
  if (await exists(target)) throw new Error(`Review already exists: ${review.id}`);
  const rendered = await renderReview(review);
  const validation = await validateReview(rendered.review, true);
  const stored = { ...rendered.review, receivedAt: new Date().toISOString() };
  await fs.writeFile(target, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return { ...validation, status: "proposed", artifact: rendered.artifact, file: path.relative(projectRoot, target).replaceAll(path.sep, "/") };
}

async function readReview(reviewId) {
  if (typeof reviewId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reviewId)) throw new Error("Invalid review id");
  const file = path.join(designDir, "reviews", `${reviewId}.json`);
  if (!(await exists(file))) throw new Error(`Review not found: ${reviewId}`);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function getSelectedChanges(review, selectedChanges) {
  if (selectedChanges === undefined) return review.changes;
  if (!Array.isArray(selectedChanges)) throw new Error("selectedChanges must be an array");
  const byToken = new Map(review.changes.map((change) => [change.token, change]));
  const selected = [];
  for (const token of selectedChanges) {
    if (typeof token !== "string" || !byToken.has(token)) throw new Error(`Change is not part of review: ${token}`);
    if (selected.some((change) => change.token === token)) throw new Error(`Duplicate selected change: ${token}`);
    selected.push(byToken.get(token));
  }
  return selected;
}

async function recordItemDecisions(args) {
  requireObject(args, "decision");
  const review = await readReview(args.reviewId);
  if (!Array.isArray(args.itemDecisions) || !args.itemDecisions.length) throw new Error("itemDecisions must be a non-empty array");
  if (typeof args.rationale !== "string" || !args.rationale.trim()) throw new Error("A decision rationale is required");

  const itemsById = new Map(review.reviewItems.map((item) => [item.id, item]));
  const changesByToken = new Map(review.changes.map((change) => [change.token, change]));
  const seen = new Set();
  const normalized = [];
  for (const itemDecision of args.itemDecisions) {
    requireObject(itemDecision, "item decision");
    if (typeof itemDecision.itemId !== "string" || !itemsById.has(itemDecision.itemId) || seen.has(itemDecision.itemId)) {
      throw new Error(`Invalid or duplicate item decision: ${itemDecision.itemId}`);
    }
    if (!["accepted", "rejected", "discuss", "superseded"].includes(itemDecision.decision)) {
      throw new Error(`Invalid item decision: ${itemDecision.itemId}`);
    }
    if ((itemDecision.decision === "discuss" || itemDecision.decision === "superseded") &&
      (typeof itemDecision.comment !== "string" || !itemDecision.comment.trim())) {
      throw new Error(`A comment is required for ${itemDecision.decision}: ${itemDecision.itemId}`);
    }
    seen.add(itemDecision.itemId);
    normalized.push({
      itemId: itemDecision.itemId,
      decision: itemDecision.decision,
      comment: typeof itemDecision.comment === "string" ? itemDecision.comment.trim() : "",
    });
  }
  if (seen.size !== itemsById.size) throw new Error("Every review item must have a decision");

  const acceptedTokens = new Set();
  const nonAcceptedTokens = new Set();
  for (const itemDecision of normalized) {
    const item = itemsById.get(itemDecision.itemId);
    for (const token of item.changeTokens || []) {
      if (!changesByToken.has(token)) throw new Error(`Review item references unknown change: ${token}`);
      (itemDecision.decision === "accepted" ? acceptedTokens : nonAcceptedTokens).add(token);
    }
  }
  const conflicts = [...acceptedTokens].filter((token) => nonAcceptedTokens.has(token));
  if (conflicts.length) throw new Error(`A token has conflicting item decisions: ${conflicts.join(", ")}`);

  const decisionsDir = path.join(designDir, "decisions");
  await fs.mkdir(decisionsDir, { recursive: true });
  const target = path.join(decisionsDir, `${review.id}.json`);
  if (await exists(target)) throw new Error(`Decision already exists: ${review.id}`);
  const decidedAt = typeof args.decidedAt === "string" ? args.decidedAt : new Date().toISOString();
  const selected = [...acceptedTokens].map((token) => changesByToken.get(token));
  const tokenUpdates = [];
  if (selected.length) {
    const projectTokens = await readJson("project-tokens.json");
    const tokensByPath = new Map((projectTokens.tokens || []).map((token) => [token.path, token]));
    for (const change of selected) {
      const token = tokensByPath.get(change.token);
      if (!token) throw new Error(`Cannot accept unknown token: ${change.token}`);
      if (JSON.stringify(token.value) !== JSON.stringify(change.from)) throw new Error(`Token changed since review: ${change.token}`);
      token.value = change.to;
      token.status = "confirmed";
      token.source = "user";
      token.updatedAt = decidedAt;
      tokenUpdates.push({ path: token.path, from: change.from, to: change.to });
    }
    projectTokens.status = "confirmed";
    projectTokens.updatedAt = decidedAt;
    projectTokens.changes = [...(projectTokens.changes || []), ...selected.map((change) => ({
      id: `${review.id}:${change.token}`,
      token: change.token,
      from: change.from,
      to: change.to,
      affectedComponents: change.affectedComponents,
      reason: change.reason,
      sourcePrompt: change.sourcePrompt,
      status: "accepted",
      reviewId: review.id,
      decidedAt,
    }))];
    await fs.writeFile(path.join(designDir, "project-tokens.json"), `${JSON.stringify(projectTokens, null, 2)}\n`, "utf8");
  }

  const uniqueDecisions = [...new Set(normalized.map((item) => item.decision))];
  const record = {
    protocol: "dockyard-ui",
    version: "1.1",
    reviewId: review.id,
    decision: uniqueDecisions.length === 1 ? uniqueDecisions[0] : "mixed",
    itemDecisions: normalized,
    selectedChanges: selected.map((change) => change.token),
    rationale: args.rationale.trim(),
    decidedAt,
    tokenUpdates,
  };
  await fs.writeFile(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ...record, file: path.relative(projectRoot, target).replaceAll(path.sep, "/") };
}
async function recordDecision(args) {
  requireObject(args, "decision");
  const review = await readReview(args.reviewId);
  const decision = args.decision;
  if (!["accepted", "rejected", "superseded"].includes(decision)) throw new Error("Invalid decision");
  if (typeof args.rationale !== "string" || !args.rationale.trim()) throw new Error("A decision rationale is required");
  const selected = getSelectedChanges(review, args.selectedChanges);
  const decisionsDir = path.join(designDir, "decisions");
  await fs.mkdir(decisionsDir, { recursive: true });
  const target = path.join(decisionsDir, `${review.id}.json`);
  if (await exists(target)) throw new Error(`Decision already exists: ${review.id}`);
  const decidedAt = typeof args.decidedAt === "string" ? args.decidedAt : new Date().toISOString();
  const tokenUpdates = [];

  if (decision === "accepted") {
    const projectTokens = await readJson("project-tokens.json");
    const tokensByPath = new Map((projectTokens.tokens || []).map((token) => [token.path, token]));
    for (const change of selected) {
      const token = tokensByPath.get(change.token);
      if (!token) throw new Error(`Cannot accept unknown token: ${change.token}`);
      if (JSON.stringify(token.value) !== JSON.stringify(change.from)) throw new Error(`Token changed since review: ${change.token}`);
      token.value = change.to;
      token.status = "confirmed";
      token.source = "user";
      token.updatedAt = decidedAt;
      tokenUpdates.push({ path: token.path, from: change.from, to: change.to });
    }
    projectTokens.status = "confirmed";
    projectTokens.updatedAt = decidedAt;
    projectTokens.changes = [...(projectTokens.changes || []), ...selected.map((change) => ({
      id: `${review.id}:${change.token}`,
      token: change.token,
      from: change.from,
      to: change.to,
      affectedComponents: change.affectedComponents,
      reason: change.reason,
      sourcePrompt: change.sourcePrompt,
      status: "accepted",
      reviewId: review.id,
      decidedAt,
    }))];
    await fs.writeFile(path.join(designDir, "project-tokens.json"), `${JSON.stringify(projectTokens, null, 2)}\n`, "utf8");
  }

  const record = {
    protocol: "dockyard-ui",
    version: "1.0",
    reviewId: review.id,
    decision,
    selectedChanges: selected.map((change) => change.token),
    rationale: args.rationale.trim(),
    decidedAt,
    tokenUpdates,
  };
  await fs.writeFile(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ...record, file: path.relative(projectRoot, target).replaceAll(path.sep, "/") };
}

async function callTool(name, args = {}) {
  if (name === "dockyard_get_design_context") return textResult(await getDesignContext());
  if (name === "dockyard_validate_ui_review") return textResult(await validateReview(args.review, args.checkArtifacts !== false));
  if (name === "dockyard_render_ui_review") {
    const rendered = await renderReview(args.review, { overwrite: args.overwrite !== false });
    return textResult({ valid: true, reviewId: rendered.review.id, artifact: rendered.artifact });
  }
  if (name === "dockyard_submit_ui_review") return textResult(await submitReview(args.review));
  if (name === "dockyard_record_review_decision" && args.itemDecisions) return textResult(await recordItemDecisions(args));
  if (name === "dockyard_record_review_decision") return textResult(await recordDecision(args));
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  const { id = null, method, params = {} } = message;
  if (method === "initialize") return response(id, { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "dockyard-mcp", version: "1.1.0" } });
  if (method === "ping") return response(id, {});
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") {
    return response(id, { tools: [
      { name: "dockyard_get_design_context", description: "Read Dockyard design rules, token schema, project token state, and review indexes.", inputSchema: { type: "object", additionalProperties: false } },
      { name: "dockyard_validate_ui_review", description: "Validate a proposed UI review without writing project state.", inputSchema: { type: "object", required: ["review"], properties: { review: { type: "object" }, checkArtifacts: { type: "boolean" } }, additionalProperties: false } },
      { name: "dockyard_render_ui_review", description: "Render a validated review through Dockyard's fixed HTML review template.", inputSchema: { type: "object", required: ["review"], properties: { review: { type: "object" }, overwrite: { type: "boolean" } }, additionalProperties: false } },
      { name: "dockyard_submit_ui_review", description: "Validate and store a proposed UI review. It never confirms or overwrites tokens.", inputSchema: { type: "object", required: ["review"], properties: { review: { type: "object" } }, additionalProperties: false } },
      { name: "dockyard_record_review_decision", description: "Record legacy whole-review or versioned per-item decisions. Accepted items update only their linked confirmed project tokens.", inputSchema: { type: "object", required: ["reviewId", "rationale"], properties: { reviewId: { type: "string" }, decision: { enum: ["accepted", "rejected", "superseded"] }, itemDecisions: { type: "array", items: { type: "object", required: ["itemId", "decision"], properties: { itemId: { type: "string" }, decision: { enum: ["accepted", "rejected", "discuss", "superseded"] }, comment: { type: "string" } }, additionalProperties: false } }, rationale: { type: "string" }, selectedChanges: { type: "array", items: { type: "string" } }, decidedAt: { type: "string" } }, additionalProperties: false } },
    ] });
  }
  if (method === "resources/list") return response(id, { resources: [...resourceFiles].map(([uri, fileName]) => ({ uri, name: fileName, mimeType: fileName.endsWith(".json") ? "application/json" : "text/markdown" })) });
  if (method === "resources/read") {
    const fileName = resourceFiles.get(params.uri);
    if (!fileName) throw new Error(`Unknown resource: ${params.uri}`);
    const text = await fs.readFile(path.join(designDir, fileName), "utf8");
    return response(id, { contents: [{ uri: params.uri, mimeType: fileName.endsWith(".json") ? "application/json" : "text/markdown", text }] });
  }
  if (method === "tools/call") return response(id, await callTool(params.name, params.arguments || {}));
  throw new Error(`Unknown method: ${method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
    const result = await handle(message);
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorResponse(message?.id ?? null, -32603, error.message))}\n`);
  }
});
