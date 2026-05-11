import type { ConflictWarning, LayerLabel } from "./types.js";

const CONFLICT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label:   "APPROVAL_BYPASS",
    pattern: /bypass\s{0,15}approval|skip\s{0,15}approval|ignore\s{0,15}approval|without\s{0,15}(?:explicit\s+)?(?:confirmation|approval)/i,
  },
  {
    label:   "IDENTITY_BYPASS",
    pattern: /skip\s{0,15}(?:identity|auth(?:entication)?)|ignore\s{0,15}(?:role|permission|identity)/i,
  },
  {
    label:   "PROMPT_DISCLOSURE",
    pattern: /reveal\s{0,15}(?:your\s+)?(?:prompt|instruction|layer|system)|show\s{0,15}(?:your\s+)?(?:system\s+)?(?:prompt|instructions|rules)/i,
  },
  {
    label:   "INJECTION",
    pattern: /ignore\s{0,15}previous\s{0,15}(?:instruction|rule|prompt|constraint)|you\s+are\s+now\s+a\b|forget\s{0,15}(?:your\s+)?(?:instruction|rule|constraint)|act\s+as\s+if\s+you\s+(?:are|have\s+no)/i,
  },
  {
    label:   "CONSTRAINT_OVERRIDE",
    pattern: /override\s{0,15}(?:constraint|layer\s*1|system\s*core|immutable)/i,
  },
];

export function detectConflicts(content: string, layer: LayerLabel): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];

  for (const { label, pattern } of CONFLICT_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push({ layer, pattern: label, rejected: true });
    }
  }

  return warnings;
}
