import type { CompileInput, CompileResult, IPromptLayerRepository, LayerEntry } from "./types.js";
import { LAYER1_SYSTEM_CORE } from "./layer1.js";
import { detectConflicts } from "./conflict-detector.js";
import { enforceBudget, TOKEN_BUDGET_LIMIT } from "./token-budget.js";

export class PromptCompiler {
  constructor(
    private readonly repo:      IPromptLayerRepository,
    private readonly maxTokens: number = TOKEN_BUDGET_LIMIT,
  ) {}

  async compile(input: CompileInput): Promise<CompileResult> {
    const layers: LayerEntry[] = [
      { label: "LAYER_1_SYSTEM_CORE", content: LAYER1_SYSTEM_CORE },
    ];

    const generalLayer = await this.repo.getActiveGeneralLayer(input.tenantId);

    if (generalLayer) {
      const conflicts = detectConflicts(generalLayer.content, "LAYER_2_GENERAL_RULES");
      const rejected  = conflicts.some((c) => c.rejected);

      if (rejected) {
        const budget = enforceBudget(layers, this.maxTokens);
        return { ...budget, conflicts };
      }

      layers.push({ label: "LAYER_2_GENERAL_RULES", content: generalLayer.content });
    }

    const budget = enforceBudget(layers, this.maxTokens);
    return { ...budget, conflicts: [] };
  }
}
