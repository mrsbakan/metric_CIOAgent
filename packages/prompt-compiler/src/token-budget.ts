import type { LayerEntry, LayerLabel } from "./types.js";

// Approximation: 1 token ≈ 4 characters (GPT/Claude empirical average).
// The exact Claude tokenizer is not available as a Node.js package; this
// approximation is conservative enough for a hard-budget enforcement gate.
export const TOKEN_BUDGET_LIMIT = 8_000;

export interface BudgetResult {
  compiledPrompt: string;
  layersIncluded: LayerLabel[];
  tokenCount:     number;
  trimmed:        boolean;
}

export class TokenBudgetExceededError extends Error {
  constructor(tokenCount: number, limit: number) {
    super(
      `Token budget exceeded: Layer 1 alone is ${tokenCount} tokens (limit: ${limit}). ` +
      `Reduce LAYER_1_SYSTEM_CORE length.`,
    );
    this.name = "TokenBudgetExceededError";
  }
}

export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatLayer(label: LayerLabel, content: string): string {
  return `[${label}]\n${content}`;
}

function assemblePrompt(layers: readonly LayerEntry[]): string {
  return layers.map((l) => formatLayer(l.label, l.content)).join("\n\n");
}

export function enforceBudget(
  layers:    readonly LayerEntry[],
  maxTokens: number = TOKEN_BUDGET_LIMIT,
): BudgetResult {
  const fullPrompt  = assemblePrompt(layers);
  const totalTokens = countTokens(fullPrompt);

  if (totalTokens <= maxTokens) {
    return {
      compiledPrompt: fullPrompt,
      layersIncluded: layers.map((l) => l.label),
      tokenCount:     totalTokens,
      trimmed:        false,
    };
  }

  // Over budget — retain Layer 1 only (highest priority, non-negotiable)
  const layer1Entries = layers.filter((l) => l.label === "LAYER_1_SYSTEM_CORE");
  const layer1Prompt  = assemblePrompt(layer1Entries);
  const layer1Tokens  = countTokens(layer1Prompt);

  if (layer1Tokens > maxTokens) {
    throw new TokenBudgetExceededError(layer1Tokens, maxTokens);
  }

  return {
    compiledPrompt: layer1Prompt,
    layersIncluded: ["LAYER_1_SYSTEM_CORE"],
    tokenCount:     layer1Tokens,
    trimmed:        true,
  };
}
