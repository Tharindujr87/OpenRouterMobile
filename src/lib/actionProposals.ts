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
const CREATIVE_RE =
  /\b(poem|poetry|story|song|joke|essay|article|letter|draw|image|picture|design|compose|translate|rewrite|summari[sz]e|explain|write about)\b/i;
const IMPERATIVE_RE =
  /^(?:buy|call|message|email|text|send|pay|book|order|finish|prepare|fix|clean|check|collect|meet|talk to|organi[sz]e|arrange|remind|visit|submit|renew|cancel|update|pick up|get|return|replacing|order replacement)\b/i;

function isActionLine(line: string): boolean {
  if (EXPLICIT_ACTION_RE.test(line)) return true;
  if (line.includes('?') || QUESTION_LINE_RE.test(line) || CREATIVE_RE.test(line)) return false;
  return IMPERATIVE_RE.test(line);
}

export function looksLikeMultiAction(text: string): boolean {
  const lines = text
    .split(/\n+|;\s+/)
    .map((line) => line.replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
  if (lines.length < 2) return false;

  // An explicit command is always an action, even beside a question.
  if (lines.some((line) => EXPLICIT_ACTION_RE.test(line))) return true;

  // Only real action lines qualify. A note plus a poem, or questions, are chat.
  const actionLines = lines.filter(isActionLine);
  if (actionLines.length < 2) return false;
  return actionLines.length >= Math.ceil(lines.length * 0.6);
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
