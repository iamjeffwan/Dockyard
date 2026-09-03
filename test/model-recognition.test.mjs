import test from "node:test";
import assert from "node:assert/strict";
import { extractComponents, normalizeRecognitionOutput, failedRecognition, compareRecognitionResults } from "../dist-electron/electron/model-recognition.js";

test("extracts a JSON component list from raw output", () => {
  assert.deepEqual(extractComponents('结果： ["popover", "dialog"]'), ["popover", "dialog"]);
});
test("preserves raw output and unavailable token usage", () => {
  const result = normalizeRecognitionOutput("cli", { rawText: "button", components: ["button"] }, 12, { source: "unavailable" });
  assert.equal(result.rawText, "button");
  assert.equal(result.tokenUsage.source, "unavailable");
});
test("failed calls remain inspectable", () => {
  const result = failedRecognition("sdk", new Error("timeout"), 20);
  assert.equal(result.status, "failed");
  assert.equal(result.error, "timeout");
});
test("compares first result and top three overlap", () => {
  const comparison = compareRecognitionResults({ id: "r", createdAt: "now", prompt: "p", imagePath: "i", cli: { mode: "cli", rawText: "", components: ["Popover", "Dialog"], durationMs: 1, status: "success", tokenUsage: { source: "unavailable" } }, sdk: { mode: "sdk", rawText: "", components: ["popover", "Button"], durationMs: 1, status: "success", tokenUsage: { source: "unavailable" } } });
  assert.equal(comparison.firstMatch, true);
  assert.equal(comparison.top3Overlap, 1);
});
