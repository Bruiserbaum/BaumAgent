export interface ModelMeta {
  label: string
  category: string // e.g. "Coding", "Fast", "Reasoning", "Research", "General"
  cost: string     // e.g. "Cheap", "Local", "Moderate", "Expensive"
}

// category color map — used for badge styling
export const CATEGORY_COLOR: Record<string, string> = {
  Coding:    '#1d4ed8',   // blue
  Fast:      '#15803d',   // green
  Reasoning: '#7c3aed',   // purple
  Research:  '#0e7490',   // cyan
  General:   '#475569',   // slate
}

export const COST_COLOR: Record<string, string> = {
  Local:    '#166534',   // dark green
  Cheap:    '#15803d',   // green
  Moderate: '#b45309',   // amber
  Expensive:'#b91c1c',   // red
}

const META: Record<string, ModelMeta> = {
  // ── Anthropic Claude 4 ──────────────────────────────────────────────────────
  'claude-opus-4-6':             { label: 'Claude Opus 4.6',          category: 'Reasoning', cost: 'Expensive' },
  'claude-sonnet-4-6':           { label: 'Claude Sonnet 4.6',        category: 'Coding',    cost: 'Moderate'  },
  'claude-haiku-4-5-20251001':   { label: 'Claude Haiku 4.5',         category: 'Fast',      cost: 'Cheap'     },
  // ── Anthropic Claude 3.7 ────────────────────────────────────────────────────
  'claude-3-7-sonnet-20250219':  { label: 'Claude Sonnet 3.7',        category: 'Reasoning', cost: 'Moderate'  },
  // ── Anthropic Claude 3.5 ────────────────────────────────────────────────────
  'claude-3-5-sonnet-20241022':  { label: 'Claude Sonnet 3.5',        category: 'Coding',    cost: 'Moderate'  },
  'claude-3-5-haiku-20241022':   { label: 'Claude Haiku 3.5',         category: 'Fast',      cost: 'Cheap'     },
  // ── Anthropic Claude 3 ──────────────────────────────────────────────────────
  'claude-3-opus-20240229':      { label: 'Claude Opus 3',            category: 'Research',  cost: 'Expensive' },
  'claude-3-sonnet-20240229':    { label: 'Claude Sonnet 3',          category: 'General',   cost: 'Moderate'  },
  'claude-3-haiku-20240307':     { label: 'Claude Haiku 3',           category: 'Fast',      cost: 'Cheap'     },

  // ── OpenAI GPT-4.1 ──────────────────────────────────────────────────────────
  'gpt-4.1':                     { label: 'GPT-4.1',                  category: 'Coding',    cost: 'Moderate'  },
  'gpt-4.1-mini':                { label: 'GPT-4.1 Mini',             category: 'Fast',      cost: 'Cheap'     },
  'gpt-4.1-nano':                { label: 'GPT-4.1 Nano',             category: 'Fast',      cost: 'Cheap'     },
  // ── OpenAI GPT-4o ───────────────────────────────────────────────────────────
  'gpt-4o':                      { label: 'GPT-4o',                   category: 'General',   cost: 'Moderate'  },
  'gpt-4o-mini':                 { label: 'GPT-4o Mini',              category: 'Fast',      cost: 'Cheap'     },
  // ── OpenAI o-series ─────────────────────────────────────────────────────────
  'o3':                          { label: 'o3',                        category: 'Reasoning', cost: 'Expensive' },
  'o3-mini':                     { label: 'o3 Mini',                  category: 'Reasoning', cost: 'Moderate'  },
  'o4-mini':                     { label: 'o4 Mini',                  category: 'Reasoning', cost: 'Moderate'  },
  'o1':                          { label: 'o1',                        category: 'Reasoning', cost: 'Expensive' },
  'o1-mini':                     { label: 'o1 Mini',                  category: 'Reasoning', cost: 'Moderate'  },
}

/**
 * Returns a display label for a model option.
 * For Ollama models (backend === 'ollama'), just returns the model ID.
 * Example: "Claude Sonnet 4.6 · Coding · Moderate"
 */
export function modelOptionLabel(modelId: string, backend?: string): string {
  if (backend === 'ollama') return modelId
  const meta = META[modelId]
  if (!meta) return modelId
  return `${meta.label}  ·  ${meta.category}  ·  ${meta.cost}`
}
