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

// ── Ollama pattern classification ──────────────────────────────────────────
// Patterns checked in order — first match wins.
// Cost is always "Local" for Ollama. Size tags like :1b/:3b = Fast, :70b+ = slower.

const OLLAMA_CODING_PATTERNS = [
  'coder', 'code', 'codellama', 'starcoder', 'deepseek-coder',
  'qwen2.5-coder', 'qwen-coder', 'wizard-coder', 'phind',
]
const OLLAMA_REASONING_PATTERNS = [
  'deepseek-r', 'deepseek-v3', 'qwq', 'r1', 'thinker', 'reflect',
]
const OLLAMA_RESEARCH_PATTERNS = [
  'mixtral', 'command-r', 'solar', 'yi-', 'falcon',
]
// Models known to be small/fast: phi, gemma 2b/mini, tiny variants
const OLLAMA_FAST_PATTERNS = [
  'phi', 'tinyllama', 'smollm', 'gemma2:2b', 'gemma3:1b', 'gemma3:4b',
  'llama3.2:1b', 'llama3.2:3b', ':1b', ':3b',
]

function classifyOllama(modelId: string): ModelMeta {
  const id = modelId.toLowerCase()

  const isPattern = (patterns: string[]) => patterns.some(p => id.includes(p))

  let category = 'General'
  if (isPattern(OLLAMA_FAST_PATTERNS))     category = 'Fast'
  else if (isPattern(OLLAMA_CODING_PATTERNS))   category = 'Coding'
  else if (isPattern(OLLAMA_REASONING_PATTERNS)) category = 'Reasoning'
  else if (isPattern(OLLAMA_RESEARCH_PATTERNS))  category = 'Research'

  return { label: modelId, category, cost: 'Local' }
}

/**
 * Returns a display label for a model option.
 * Example: "Claude Sonnet 4.6 · Coding · Moderate"
 * Ollama models are classified by name pattern with cost always "Local".
 */
export function modelOptionLabel(modelId: string, backend?: string): string {
  const meta = backend === 'ollama' ? classifyOllama(modelId) : META[modelId]
  if (!meta) return modelId
  return `${meta.label}  ·  ${meta.category}  ·  ${meta.cost}`
}
