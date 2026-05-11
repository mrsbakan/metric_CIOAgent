/**
 * Langfuse SDK wrapper — LLM call tracing + eval tracking.
 *
 * Every LLM call in the orchestrator must be traced via this module.
 * Provides: trace per agent session, generation per LLM call, eval scores.
 *
 * Self-hosted Langfuse runs at LANGFUSE_BASE_URL (default: http://localhost:3000).
 */
import Langfuse from "langfuse";

let _client: Langfuse | null = null;

function getClient(): Langfuse {
  if (!_client) {
    const publicKey = process.env["LANGFUSE_PUBLIC_KEY"];
    const secretKey = process.env["LANGFUSE_SECRET_KEY"];
    const baseUrl   = process.env["LANGFUSE_BASE_URL"] ?? "http://localhost:3000";

    if (!publicKey || !secretKey) {
      throw new Error("[langfuse] LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set");
    }

    _client = new Langfuse({ publicKey, secretKey, baseUrl, flushAt: 20, flushInterval: 10_000 });
  }
  return _client;
}

export interface LlmTraceContext {
  sessionId:  string;
  tenantId:   string;
  userId:     string;
  promptName: string;
}

export interface LlmGenerationInput {
  traceId:      string;
  model:        string;
  provider:     string;
  prompt:       string;
  completion:   string;
  inputTokens:  number;
  outputTokens: number;
  latencyMs:    number;
  promptVersion?: number;
}

/**
 * Open a Langfuse trace for an agent session.
 * Returns a traceId to pass into trackGeneration().
 */
export function startTrace(ctx: LlmTraceContext): string {
  const client = getClient();
  const trace = client.trace({
    id:       ctx.sessionId,
    name:     ctx.promptName,
    userId:   ctx.userId,
    metadata: { tenant_id: ctx.tenantId },
    tags:     ["cio-agent", ctx.tenantId],
  });
  return trace.id;
}

/**
 * Track a single LLM generation within an existing trace.
 */
export function trackGeneration(input: LlmGenerationInput): void {
  const client = getClient();
  const trace = client.trace({ id: input.traceId });

  trace.generation({
    name:            `${input.provider}/${input.model}`,
    model:           input.model,
    input:           input.prompt,
    output:          input.completion,
    usage: {
      input:  input.inputTokens,
      output: input.outputTokens,
    },
    metadata: {
      provider:      input.provider,
      latency_ms:    input.latencyMs,
      prompt_version: input.promptVersion,
    },
  });
}

/**
 * Record an eval score (e.g. from RAGAS offline suite or shadow eval).
 */
export function recordEvalScore(
  traceId: string,
  name: string,
  value: number,
  comment?: string,
): void {
  getClient().score({ traceId, name, value, comment });
}

export async function flushLangfuse(): Promise<void> {
  await _client?.flushAsync();
}
