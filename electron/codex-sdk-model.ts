import { Codex } from "@openai/codex-sdk";
import type { CodexCliConfig } from "./codex-cli-model.js";
import { failedRecognition, normalizeRecognitionOutput, recognitionInvocationId, recognitionSchema, type ModelRecognitionResult, type RecognitionInput } from "./model-recognition.js";

export async function invokeCodexSdk(input: RecognitionInput, config: CodexCliConfig, workingDirectory: string): Promise<ModelRecognitionResult> {
  const startedAt = Date.now();
  try {
    const options: ConstructorParameters<typeof Codex>[0] = {
      config: config.provider ? { model_provider: config.provider.id } : undefined,
      env: process.env as Record<string, string>,
    };
    if (config.provider) {
      options.baseUrl = config.provider.baseUrl;
      options.apiKey = process.env[config.provider.apiKeyEnv];
    }
    const codex = new Codex(options);
    const thread = codex.startThread({ workingDirectory, skipGitRepoCheck: true, model: config.model, sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false });
    const turn = await thread.run([{ type: "text", text: input.prompt }, { type: "local_image", path: input.imagePath }], { outputSchema: recognitionSchema });
    const usage = turn.usage;
    return normalizeRecognitionOutput("sdk", JSON.parse(turn.finalResponse), Date.now() - startedAt, usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.input_tokens + usage.output_tokens, source: "reported" } : { source: "unavailable" });
  } catch (error) { return failedRecognition("sdk", error, Date.now() - startedAt); }
}
