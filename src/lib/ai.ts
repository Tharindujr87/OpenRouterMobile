/** Thin OpenRouter transport. Swap baseUrl for your own proxy later. */

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  accessToken?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export function buildSystemPrompt(memory: Record<string, string>, now = new Date()): string {
  const lines = [
    'You are ORM, a concise personal assistant the user carries on their phone.',
    'Be brief and practical. The user is often on the move.',
    `The user's local date and time right now is ${now.toString()}. The ISO local date is ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.`,
    'Use only that local date as your reference for words like today and tomorrow. You MAY calculate and state dates, weekdays, week numbers and week counts when the user asks — just base every calculation on the provided local date, never on your own assumed current date.',
    'When proposing saved actions, keep the user\'s original relative wording so the app can resolve it on the device. This rule does not apply to answering questions.',
    'Never claim you saved a note, task, event or reminder. Only the app can do that.',
  ];
  const entries = Object.entries(memory);
  if (entries.length) {
    lines.push('', 'What the user has asked you to remember:');
    entries.forEach(([key, value]) => lines.push(`- ${key}: ${value}`));
  }
  return lines.join('\n');
}

export function normalizeBaseUrl(raw: string): string {
  const base = (raw.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('Invalid API URL. Use Reset API URL in Settings to restore the OpenRouter address.');
  }
  if (url.username || url.password || url.search || url.hash || !/^https?:$/.test(url.protocol)) {
    throw new Error('Enter an HTTP or HTTPS API base URL without credentials, query parameters, or a fragment.');
  }
  // Any openrouter.ai host resolves to the one valid API base. This also
  // repairs typos such as /api/v14 that would otherwise give a generic 404.
  if (url.hostname === 'openrouter.ai') {
    return 'https://openrouter.ai/api/v1';
  }
  return base;
}

function bearerToken(raw: string, baseUrl: string): string {
  const token = raw.trim().replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Add your OpenRouter API key in Settings first.');
  if (baseUrl === DEFAULT_BASE_URL && !/^sk-or-v1-[a-f\d]{64}$/i.test(token)) {
    throw new Error('The saved OpenRouter key is incomplete or has the wrong format. Paste the full new sk-or-v1- key in Settings → AI & routing.');
  }
  if (/\s/.test(token)) throw new Error('The saved API key contains spaces or line breaks. Paste it again in Settings.');
  return token;
}

export async function verifyOpenRouterKey(settings: AiSettings): Promise<void> {
  const token = bearerToken(settings.apiKey, DEFAULT_BASE_URL);
  const response = await fetch(`${DEFAULT_BASE_URL}/key`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw openRouterAuthError();
  if (!response.ok) throw new Error(`OpenRouter key check failed (HTTP ${response.status}).`);
}

function openRouterAuthError(): Error {
  return new Error('OpenRouter did not accept the saved key (HTTP 401). In Settings → AI & routing, replace it with an active OpenRouter key and tap Test connection.');
}

export async function sendChatMessage(input: {
  settings: AiSettings;
  model: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
}): Promise<string> {
  const { settings, model, messages, signal, onToken } = input;
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '');
  const usesProxy = baseUrl.includes('/functions/v1/');
  const token = usesProxy
    ? settings.accessToken ?? (() => { throw new Error('Sign in to use the cloud AI proxy.'); })()
    : bearerToken(settings.apiKey, normalizeBaseUrl(baseUrl));
  if (!model) {
    throw new Error('No model selected.');
  }

  const url = usesProxy ? baseUrl : `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'HTTP-Referer': 'https://ormobile.local',
      'X-Title': 'ORMobile',
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 401 && !usesProxy && normalizeBaseUrl(baseUrl) === DEFAULT_BASE_URL) {
      throw openRouterAuthError();
    }
    const detail = (await response.text().catch(() => '')).split(token).join('[redacted]');
    throw new Error(
      `Model request failed (${response.status}) at ${url}. ${detail.slice(0, 300)}`,
    );
  }

  // Streaming path (native and modern browsers).
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          if (payload === '[DONE]') finished = true;
          continue;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content as string | undefined;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          // Ignore partial or non-JSON keepalive lines.
        }
      }
    }
    return full.trim();
  }

  // Non-streaming fallback.
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content as string | undefined;
  const text = content?.trim() ?? '';
  if (text) onToken?.(text);
  return text;
}
