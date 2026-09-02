import { randomUUID } from "node:crypto";

export type TokenUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number; source: "reported" | "unavailable" };
export type ModelRecognitionResult = { mode: "cli" | "sdk"; rawText: string; components: string[]; durationMs: number; status: "success" | "failed"; error?: string; tokenUsage: TokenUsage };
export type RecognitionInput = { imagePath: string; prompt: string };
export const recognitionSchema = { type: "object", additionalProperties: false, required: ["rawText", "components"], properties: { rawText: { type: "string" }, components: { type: "array", items: { type: "string" }, maxItems: 10 } } } as const;
export const recognitionPrompt = "请识别这张草图可能表示的界面组件。请按可能性从高到低列出多个组件类型。只描述组件识别，不要搜索组件库，不要生成代码。";
export function recognitionInvocationId(mode: "cli" | "sdk") { return `model-recognition-${mode}-${randomUUID()}`; }
export function extractComponents(rawText: string): string[] {
  const match = rawText.match(/\[[\s\S]*\]/); if (!match) return [];
  try { const value = JSON.parse(match[0]); return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 10) : []; } catch { return []; }
}
export function normalizeRecognitionOutput(mode: "cli" | "sdk", value: unknown, durationMs: number, tokenUsage: TokenUsage): ModelRecognitionResult {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawText = typeof record.rawText === "string" ? record.rawText : typeof value === "string" ? value : JSON.stringify(value ?? "");
  const components = Array.isArray(record.components) ? record.components.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 10) : extractComponents(rawText);
  return { mode, rawText, components, durationMs, status: "success", tokenUsage };
}
export function failedRecognition(mode: "cli" | "sdk", error: unknown, durationMs: number): ModelRecognitionResult { return { mode, rawText: "", components: [], durationMs, status: "failed", error: error instanceof Error ? error.message : String(error), tokenUsage: { source: "unavailable" } }; }
export type ModelAbRunRecord = { id: string; createdAt: string; prompt: string; imagePath: string; cli?: ModelRecognitionResult; sdk?: ModelRecognitionResult };
export function compareRecognitionResults(record: ModelAbRunRecord) { const cli = record.cli?.components ?? []; const sdk = record.sdk?.components ?? []; const norm = (v: string) => v.trim().toLocaleLowerCase(); return { firstMatch: Boolean(cli[0] && sdk[0] && norm(cli[0]) === norm(sdk[0])), top3Overlap: cli.slice(0, 3).filter((v) => sdk.slice(0, 3).some((w) => norm(v) === norm(w))).length }; }
