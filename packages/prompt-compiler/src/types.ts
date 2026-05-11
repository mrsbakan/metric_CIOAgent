export interface CompileInput {
  tenantId:  string;
  sessionId: string;
  userId:    string;
  roleId:    string;
}

export interface CompileResult {
  compiledPrompt: string;
  layersIncluded: LayerLabel[];
  conflicts:      ConflictWarning[];
  tokenCount:     number;
  trimmed:        boolean;
}

export type LayerLabel = "LAYER_1_SYSTEM_CORE" | "LAYER_2_GENERAL_RULES";

export interface ConflictWarning {
  layer:    LayerLabel;
  pattern:  string;
  rejected: boolean;
}

export interface PromptLayerRow {
  id:        string;
  content:   string;
  version:   number;
  is_active: boolean;
}

export interface LayerEntry {
  label:   LayerLabel;
  content: string;
}

export interface IPromptLayerRepository {
  getActiveGeneralLayer(tenantId: string): Promise<PromptLayerRow | undefined>;
}

export interface IPromptCompiler {
  compile(input: CompileInput): Promise<CompileResult>;
}
