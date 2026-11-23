import type { AiSettings } from './ai';
import { sendChatMessage } from './ai';
import { parseCapture, resolveWhenText } from './parse';
import { DEFAULT_ROUTING } from './routing';

export interface ProposedAction {
  kind: 'task' | 'reminder' | 'note';
  title: string;
  whenText: string;
  deadlineText: string;
  reminderAt: number | null;
  dueAt: number | null;
}

const EXTRACTION_PROMPT = `You turn a user's message into a list of concrete actions.

Return ONLY a JSON array. No markdown, no prose, no code fence.
Each item must be:
{"type":"task"|"reminder"|"note","title":"their words","when":"relative time phrase or empty","deadline":"relative time phrase or empty"}

Rules:
- Preserve the user's own words in the title.
- Keep relative time words exactly as written (for example "tomorrow"). Never convert them to calendar dates.
- Put a nudge time in "when" and a true due date in "deadline". Leave either empty when absent.
- Do not invent times, dates, people or actions.
- A plain item with no explicit time is a task, not a reminder.`;

const QUESTION_LINE_RE =
  /^(?:what|which|how|when|where|why|who|can|could|do|does|did|is|are|will|would|should|tell me|explain|calculate)\b/i;
const EXPLICIT_ACTION_RE = /^(?:note|add task|add to[- ]?do|to[- ]?do|todo|task|remind me|remind|please)\b/i;

export function looksLikeMultiAction(text: string): boolean {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line));
  const manyLines = lines.length >= 2 || bullets.length >= 2;
  const chained =
    text.length > 60 &&
    /\b(?:before that|after that|also|and then|first|then|additionally)\b/i.test(text);
  if (!manyLines && !chained) return false;

  // Questions are chat, not actions. An explicit command prefix always wins.
  const explicit = lines.some((line) => EXPLICIT_ACTION_RE.test(line));
  const questions = lines.filter(
    (line) => line.includes('?') || QUESTION_LINE_RE.test(line),
  );
  if (!explicit && questions.length >= Math.ceil(lines.length / 2)) return false;

  return true;
}

function resolveAction(action: ProposedAction, now: Date): ProposedAction {
  const when = action.whenText.trim();
  const deadlineText = action.deadlineText.trim();
  const deadlineAt = deadlineText ? resolveWhenText(deadlineText, now) : null;

  if (action.kind === 'note') {
    return { ...action, reminderAt: null, dueAt: null };
  }
  if (action.kind === 'reminder') {
    return {
      ...action,
      reminderAt: when ? resolveWhenText(when, now) : null,
      dueAt: deadlineAt,
    };
  }
  return {
    ...action,
    reminderAt: null,
    dueAt: deadlineText ? deadlineAt : when ? resolveWhenText(when, now) : null,
  };
}

/** Offline breakdown used when no model is available or model output is unusable. */
export function splitLocally(input: string, now = new Date()): ProposedAction[] {
  const lines = input
    .split(/\n+|;\s+|\s*[-•]\s+/)
    .map((line) => line.replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const parsed = parseCapture(line, now);
      if (parsed.kind === 'note') {
        return resolveAction(
          { kind: 'note', title: parsed.body, whenText: '', deadlineText: '', reminderAt: null, dueAt: null },
          now,
        );
      }
      if (parsed.kind === 'reminder' || parsed.kind === 'task') {
        return resolveAction(
          {
            kind: parsed.kind,
            title: parsed.title,
            whenText: parsed.kind === 'reminder' && parsed.reminderAt ? line : '',
            deadlineText: parsed.dueAt ? line : '',
            reminderAt: parsed.reminderAt,
            dueAt: parsed.dueAt,
          },
          now,
        );
      }
      return resolveAction(
        {
          kind: 'task',
          title: line,
          whenText: line,
          deadlineText: '',
          reminderAt: null,
          dueAt: null,
        },
        now,
      );
    })
    .filter((action) => action.title.length > 0);
}

function parseModelOutput(raw: string, now: Date): ProposedAction[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;
    const actions = parsed
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const type = record.type === 'reminder' || record.type === 'note' ? record.type : 'task';
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        if (!title) return null;
        return resolveAction(
          {
            kind: type,
            title,
            whenText: typeof record.when === 'string' ? record.when : '',
            deadlineText: typeof record.deadline === 'string' ? record.deadline : '',
            reminderAt: null,
            dueAt: null,
          },
          now,
        );
      })
      .filter((action): action is ProposedAction => action !== null);
    return actions.length ? actions : null;
  } catch {
    return null;
  }
}

export async function extractActions(
  input: string,
  settings: AiSettings,
  model: string = DEFAULT_ROUTING.autoModel,
): Promise<ProposedAction[]> {
  const now = new Date();
  if (!settings.apiKey) return splitLocally(input, now);

  try {
    const raw = await sendChatMessage({
      settings,
      model,
      messages: [
        { role: 'system', content: `${EXTRACTION_PROMPT}\nCurrent local time: ${now.toString()}` },
        { role: 'user', content: input },
      ],
    });
    return parseModelOutput(raw, now) ?? splitLocally(input, now);
  } catch {
    return splitLocally(input, now);
  }
}
