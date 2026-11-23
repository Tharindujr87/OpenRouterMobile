import type { AiSettings } from './ai';
import { sendChatMessage } from './ai';
import type { DiaryEntry } from './types';

export interface DiaryDraft {
  day: string;
  body: string;
  original: string;
  summary: string;
  tags: string[];
  questions: string[];
  photos: string[];
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'was', 'were', 'have', 'has', 'had',
  'what', 'which', 'when', 'where', 'who', 'how', 'did', 'do', 'does', 'about',
  'from', 'into', 'they', 'them', 'their', 'then', 'than', 'will', 'would', 'should',
  'please', 'tell', 'remind', 'diary', 'happened', 'remember', 'anything', 'someone',
]);

export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function displayDay(day: string): string {
  const [year, month, dayNumber] = day.split('-').map(Number);
  return new Date(year, month - 1, dayNumber).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Basic offline cleanup. It never invents facts or rewrites meaning. */
export function basicCleanup(raw: string): DiaryDraft {
  const body = raw.trim();
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const outcomes = sentences.filter((line) => /\b(?:agreed|decided|next step|waiting|pending|has to|will follow up)\b/i.test(line));
  const summary = (outcomes.length ? outcomes : sentences.slice(0, 1))
    .slice(0, 3).join(' ').replace(/\s+/g, ' ');
  return {
    day: localDay(),
    body,
    original: raw,
    summary,
    tags: [],
    questions: meetingQuestions(body),
    photos: [],
  };
}

function meetingQuestions(body: string): string[] {
  if (!/\b(?:had a conversa[\w]*|spoke with|talked (?:to|with)|met with|had a meeting|had a call)\b/i.test(body)) return [];
  const questions: string[] = [];
  if (!/\b(?:\d{1,2}:\d{2}|\d{1,2}\s*[ap]\.?m\b|noon|midnight|this morning|this afternoon|this evening)\b/i.test(body)) {
    questions.push('What time did the conversation take place? An approximate time is fine.');
  }
  if (!/\b(?:by phone|over the phone|phone call|at the office|at home|in person at|on zoom|on teams)\b/i.test(body)) {
    questions.unshift('Where did the conversation take place (or was it by phone)?');
  }
  return questions;
}

const CLEAN_PROMPT = `Clean a personal diary note. Return ONLY a JSON object:
{"body":"corrected text","summary":"one or two short sentences","tags":["people or topics"],"questions":["missing factual details"]}

Rules:
- Fix spelling and grammar only.
- Keep the user's exact facts, names and meaning. Do not add details, dates, motives or conclusions.
- Use simple words. No jargon.
- Ask neutral questions about missing or unclear facts. For a documented conversation, ask where and what time if not stated. Do not ask for facts already provided. Ask at most three questions. Never guess an answer.
- Lead the summary with decisions, agreements, next steps, and anything still pending. Include brief context if needed. Preserve who said or agreed to what and distinguish possibilities from decisions. Do not judge people or label an incident urgent unless explicitly stated.
- "tags" are short people or topic names mentioned in the note. Empty array if none.`;

export async function cleanDiaryEntry(
  raw: string,
  settings: AiSettings,
  model: string,
): Promise<DiaryDraft> {
  const fallback = basicCleanup(raw);
  if (!settings.apiKey) return fallback;

  try {
    const response = await sendChatMessage({
      settings,
      model,
      messages: [
        { role: 'system', content: CLEAN_PROMPT },
        { role: 'user', content: raw },
      ],
    });
    const json = parseJsonObject(response);
    if (!json) return fallback;
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    const body = text(json.body) || fallback.body;
    const summary = text(json.summary) || fallback.summary;
    const tags = Array.isArray(json.tags)
      ? json.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];
    const questions = Array.isArray(json.questions)
      ? json.questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      : [];
    return {
      day: fallback.day,
      body,
      original: raw,
      summary,
      tags,
      questions: questions.length ? questions.slice(0, 3) : fallback.questions,
      photos: [],
    };
  } catch {
    return fallback;
  }
}

/** Deterministic, offline summary with one line per entry. */
export function deterministicDaySummary(day: string, entries: DiaryEntry[]): string {
  const lines = [`Diary · ${displayDay(day)}`, ''];
  if (!entries.length) return `${lines.join('\n')}Nothing recorded.`;
  entries.forEach((entry, index) => {
    const time = new Date(entry.createdAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    lines.push(`${index + 1}. ${entry.summary || entry.body.slice(0, 80)} (${time})`);
  });
  return lines.join('\n');
}

const SUMMARIZE_PROMPT = `Organize a person's diary notes for one day into short, easy-to-read lines.
Return plain text only. No markdown headings.
Rules:
- One line per point, starting with "- ".
- Put recorded decisions, commitments, and pending follow-ups before background details. Preserve uncertainty and attribution; do not judge people or infer urgency.
- Use only facts present in the notes. Never invent or complete anything.
- Keep names and places exactly as written. Use simple words.`;

export async function generateDaySummary(
  day: string,
  entries: DiaryEntry[],
  settings: AiSettings,
  model: string,
): Promise<string> {
  const fallback = deterministicDaySummary(day, entries);
  if (!settings.apiKey || !entries.length) return fallback;
  try {
    const text = await sendChatMessage({
      settings,
      model,
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        {
          role: 'user',
          content: `${displayDay(day)}\n\n${entries
            .map((entry, index) => `${index + 1}. ${entry.body}`)
            .join('\n')}`,
        },
      ],
    });
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Local diary lookup for chat questions. Returns null when it is not a diary question. */
export function diaryQuery(text: string): string[] | null {
  const lower = text.toLowerCase();
  const isDiaryQuestion =
    /\bdiary\b/.test(lower) ||
    /\b(what happened|did i|tell me about|do i remember|remind me what)\b/.test(lower);
  if (!isDiaryQuestion) return null;

  const cleaned = lower
    .replace(/\b(what happened|did i|tell me about|do i remember|remind me what|diary|about)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  const terms = cleaned
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return terms.length ? [...new Set(terms)] : null;
}

export function formatDiaryAnswer(terms: string[], entries: DiaryEntry[]): string {
  if (!entries.length) {
    return `I could not find a diary entry for ${terms.join(', ')}. Try a name or a date in YYYY-MM-DD form.`;
  }
  const lines = [`Found ${entries.length} diary entr${entries.length === 1 ? 'y' : 'ies'}:`, ''];
  entries.slice(0, 8).forEach((entry) => {
    lines.push(`${displayDay(entry.day)} — ${entry.summary || entry.body.slice(0, 100)}`);
  });
  if (entries.length > 8) lines.push('', `...and ${entries.length - 8} more. Open Diary to see all.`);
  return lines.join('\n');
}
