import { describe, it, expect } from "@jest/globals";
import {
  countTokens,
  enforceBudget,
  TokenBudgetExceededError,
  TOKEN_BUDGET_LIMIT,
} from "../token-budget.js";
import type { LayerEntry } from "../types.js";

const LAYER1: LayerEntry = { label: "LAYER_1_SYSTEM_CORE", content: "A".repeat(100) };
const LAYER2: LayerEntry = { label: "LAYER_2_GENERAL_RULES", content: "B".repeat(100) };

// ─── countTokens ─────────────────────────────────────────────────────────────

describe("countTokens", () => {
  it("returns ceil(length / 4)", () => {
    expect(countTokens("A".repeat(400))).toBe(100);
  });

  it("rounds up for non-multiples of 4", () => {
    expect(countTokens("A".repeat(401))).toBe(101);
  });

  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });
});

// ─── TOKEN_BUDGET_LIMIT ───────────────────────────────────────────────────────

describe("TOKEN_BUDGET_LIMIT", () => {
  it("is 8000", () => {
    expect(TOKEN_BUDGET_LIMIT).toBe(8_000);
  });
});

// ─── enforceBudget — within budget ───────────────────────────────────────────

describe("enforceBudget — within budget", () => {
  it("returns all layers when total tokens fit", () => {
    const result = enforceBudget([LAYER1, LAYER2], 100_000);

    expect(result.layersIncluded).toEqual(["LAYER_1_SYSTEM_CORE", "LAYER_2_GENERAL_RULES"]);
    expect(result.trimmed).toBe(false);
    expect(result.compiledPrompt).toContain("[LAYER_1_SYSTEM_CORE]");
    expect(result.compiledPrompt).toContain("[LAYER_2_GENERAL_RULES]");
  });

  it("tokenCount matches countTokens of compiled output", () => {
    const result = enforceBudget([LAYER1, LAYER2], 100_000);

    expect(result.tokenCount).toBe(countTokens(result.compiledPrompt));
  });

  it("separates layers with double newline", () => {
    const result = enforceBudget([LAYER1, LAYER2], 100_000);

    expect(result.compiledPrompt).toContain("\n\n");
  });
});

// ─── enforceBudget — over budget, Layer 2 trimmed ────────────────────────────

describe("enforceBudget — over budget, Layer 2 trimmed", () => {
  function makeOverBudgetLayers(): [LayerEntry, LayerEntry] {
    // Layer 1: 100 chars → ~25 tokens. Layer 2: 10 000 chars → ~2500 tokens.
    // maxTokens: 50 → Layer 1 alone is 25 → fits; full combo doesn't.
    const l1: LayerEntry = { label: "LAYER_1_SYSTEM_CORE",  content: "A".repeat(100) };
    const l2: LayerEntry = { label: "LAYER_2_GENERAL_RULES", content: "B".repeat(10_000) };
    return [l1, l2];
  }

  it("sets trimmed: true when Layer 2 is dropped", () => {
    const [l1, l2] = makeOverBudgetLayers();
    const result = enforceBudget([l1, l2], 50);

    expect(result.trimmed).toBe(true);
  });

  it("retains only Layer 1 after trimming", () => {
    const [l1, l2] = makeOverBudgetLayers();
    const result = enforceBudget([l1, l2], 50);

    expect(result.layersIncluded).toEqual(["LAYER_1_SYSTEM_CORE"]);
    expect(result.compiledPrompt).toContain("[LAYER_1_SYSTEM_CORE]");
    expect(result.compiledPrompt).not.toContain("[LAYER_2_GENERAL_RULES]");
  });

  it("tokenCount reflects trimmed prompt only", () => {
    const [l1, l2] = makeOverBudgetLayers();
    const result = enforceBudget([l1, l2], 50);

    expect(result.tokenCount).toBe(countTokens(result.compiledPrompt));
    expect(result.tokenCount).toBeLessThanOrEqual(50);
  });
});

// ─── enforceBudget — Layer 1 alone exceeds budget ────────────────────────────

describe("enforceBudget — Layer 1 alone exceeds budget", () => {
  it("throws TokenBudgetExceededError", () => {
    const huge: LayerEntry = { label: "LAYER_1_SYSTEM_CORE", content: "X".repeat(100_000) };

    expect(() => enforceBudget([huge], 10)).toThrow(TokenBudgetExceededError);
  });

  it("error message includes token count and limit", () => {
    const huge: LayerEntry = { label: "LAYER_1_SYSTEM_CORE", content: "X".repeat(100_000) };

    expect(() => enforceBudget([huge], 10)).toThrow(/Layer 1 alone is \d+ tokens \(limit: 10\)/);
  });

  it("error name is TokenBudgetExceededError", () => {
    const huge: LayerEntry = { label: "LAYER_1_SYSTEM_CORE", content: "X".repeat(100_000) };

    let caught: unknown;
    try { enforceBudget([huge], 10); } catch (e) { caught = e; }

    expect((caught as Error).name).toBe("TokenBudgetExceededError");
  });
});

// ─── enforceBudget — single layer (no Layer 2) ───────────────────────────────

describe("enforceBudget — Layer 1 only input", () => {
  it("returns trimmed: false when only Layer 1 is within budget", () => {
    const result = enforceBudget([LAYER1], 100_000);

    expect(result.trimmed).toBe(false);
    expect(result.layersIncluded).toEqual(["LAYER_1_SYSTEM_CORE"]);
  });
});
