/**
 * Deterministic task routing. Cheap model first; stronger models only when the
 * request appears to need them. The user can always override with a manual pick.
 */

export const AUTO = 'auto';

export type AiMode = 'free' | 'pro';

export const FREE_MODEL_PRESETS: ModelPreset[] = [
  { id: 'openrouter/free', label: 'Free router', category: 'cheap', note: 'Picks among free models' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', category: 'strong', note: 'Strong free model' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', category: 'strong', note: 'Free multimodal' },
  { id: 'inclusionai/ling-3.2-flash:free', label: 'Ling 3.2 Flash', category: 'document', note: '1M context' },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', category: 'general', note: '1M context' },
];

export interface ModelPreset {
  id: string;
  label: string;
  category: 'cheap' | 'general' | 'strong' | 'image' | 'document';
  note: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: 'tencent/hy4-flash', label: 'HY4 Flash', category: 'cheap', note: 'Low cost default' },
  { id: 'deepseek/deepseek-v4.1-flash-1017', label: 'DeepSeek V4.1 Flash', category: 'cheap', note: 'Low cost' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra (free)', category: 'cheap', note: 'Free, capable' },
  { id: 'openai/gpt-6-luna', label: 'GPT 6 Luna', category: 'general', note: 'Balanced' },
  { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5', category: 'strong', note: 'Most capable' },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'Gemini 3.1 Flash Lite Image', category: 'image', note: 'Low cost image' },
  { id: 'google/gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', category: 'image', note: 'Image generation' },
  { id: 'google/gemini-3-pro-image', label: 'Gemini 3 Pro Image', category: 'image', note: 'Strongest image' },
  { id: 'openai/gpt-5-image-mini', label: 'GPT 5 Image Mini', category: 'image', note: 'Image generation' },
];

export interface RoutingSettings {
  autoModel: string;
  strongModel: string;
  imageModel: string;
  documentModel: string;
  videoModel: string;
}

export const DEFAULT_ROUTING: RoutingSettings = {
  autoModel: 'tencent/hy4-flash',
  strongModel: 'anthropic/claude-opus-5.5',
  imageModel: 'google/gemini-3.1-flash-lite-image',
  documentModel: 'anthropic/claude-opus-5.5',
  videoModel: '',
};

/** No free image or video models exist on OpenRouter's public list. */
export const FREE_ROUTING: RoutingSettings = {
  autoModel: 'openrouter/free',
  strongModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  imageModel: '',
  documentModel: 'inclusionai/ling-3.2-flash:free',
  videoModel: '',
};

export function routingDefaults(mode: AiMode): RoutingSettings {
  return mode === 'free' ? FREE_ROUTING : DEFAULT_ROUTING;
}

export function settingsPrefix(mode: AiMode): string {
  return mode === 'free' ? 'free' : 'pro';
}

export function modelMetaKey(mode: AiMode, field: keyof RoutingSettings): string {
  return `${settingsPrefix(mode)}.${field}`;
}

export interface RouteDecision {
  modelId: string;
  category: 'auto' | 'manual' | 'capture' | 'diary' | 'image' | 'document' | 'video' | 'reasoning';
  reason: string;
  useLocalParser: boolean;
  unavailable?: boolean;
}

const CAPTURE_RE = /^\s*(?:hey\s+|please\s+)?(?:note(?:\s+to\s+self)?|remember(?:\s+that)?|add\s+task|add\s+to[- ]?do|to[- ]?do|todo|task|remind(?:\s+me)?)\b/i;
export const DIARY_RE = /^\s*(?:diary|log)\b[\s:,-]*/i;
const IMAGE_RE = /\b(image|images|picture|draw|drawing|illustration|graphic|photo|logo|generate\s+an?\s+image)\b/i;
const DOCUMENT_RE = /\b(pdf|document|contract|report|spreadsheet|summari[sz]e\s+(?:this|the)\s+file)\b/i;
const VIDEO_RE = /\b(video|clip|animation|reel|movie|film|generate\s+an?\s+video|animate)\b/i;
const REASONING_RE = /\b(analy[sz]e|reason|compare|deduce|prove|debug|architect|trade[- ]?off|deep\s+research)\b/i;

export function routeTask(
  input: string,
  selection: string,
  settings: RoutingSettings,
): RouteDecision {
  const text = input.trim();

  if (selection && selection !== AUTO) {
    return {
      modelId: selection,
      category: 'manual',
      reason: 'You selected this model.',
      useLocalParser: false,
    };
  }

  if (DIARY_RE.test(text)) {
    return {
      modelId: settings.autoModel,
      category: 'diary',
      reason: 'Diary entry — cleaned and saved only after you review it.',
      useLocalParser: false,
    };
  }

  if (CAPTURE_RE.test(text)) {
    return {
      modelId: settings.autoModel,
      category: 'capture',
      reason: 'Handled on your phone by the local parser — no model call, no cost.',
      useLocalParser: true,
    };
  }

  if (IMAGE_RE.test(text)) {
    return {
      modelId: settings.imageModel || '',
      category: 'image',
      reason: settings.imageModel
        ? 'Looks like image work — routed to the image model.'
        : 'No free image model is available on OpenRouter. Switch to Pro for image work.',
      useLocalParser: false,
      unavailable: !settings.imageModel,
    };
  }

  if (DOCUMENT_RE.test(text)) {
    return {
      modelId: settings.documentModel || settings.strongModel || settings.autoModel,
      category: 'document',
      reason: 'Document work — routed to the document model.',
      useLocalParser: false,
    };
  }

  if (VIDEO_RE.test(text)) {
    return {
      modelId: settings.videoModel || '',
      category: 'video',
      reason: settings.videoModel
        ? 'Video request — routed to your configured video model.'
        : 'Video models are not available through OpenRouter public API. Add a video model ID in Settings if you have one.',
      useLocalParser: false,
      unavailable: !settings.videoModel,
    };
  }

  if (REASONING_RE.test(text) || text.length > 600) {
    return {
      modelId: settings.strongModel || settings.autoModel,
      category: 'reasoning',
      reason: 'Needs heavier reasoning — routed to the stronger model.',
      useLocalParser: false,
    };
  }

  return {
    modelId: settings.autoModel,
    category: 'auto',
    reason: 'Routed to the low-cost default model.',
    useLocalParser: false,
  };
}

export function presetsForMode(mode: AiMode): ModelPreset[] {
  return mode === 'free' ? FREE_MODEL_PRESETS : MODEL_PRESETS;
}

export function presetLabel(id: string): string {
  return [...MODEL_PRESETS, ...FREE_MODEL_PRESETS].find((preset) => preset.id === id)?.label ?? id;
}

export function presetCategory(id: string): ModelPreset['category'] {
  return MODEL_PRESETS.find((preset) => preset.id === id)?.category ?? 'general';
}
