import {
  DaySpec,
  TimeSpec,
  defaultTimeForPhrase,
  formatWhen,
  parseTime,
  resolveWhen,
  weekdayFromName,
} from './dates';
import type { CaptureKind, ParsedCapture } from './types';

interface Span {
  start: number;
  end: number;
}

interface DayMatch extends Span {
  day: DaySpec;
  raw: string;
}

interface TimeMatch extends Span {
  time: TimeSpec;
  raw: string;
}

interface WhenMatch extends Span {
  timestamp: number;
  ambiguousTime: boolean;
  raw: string;
}

const WEEKDAY_PATTERN =
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function collectDayMatches(text: string): DayMatch[] {
  const patterns: Array<{
    re: RegExp;
    make: (m: RegExpExecArray) => { day: DaySpec } | null;
  }> = [
    { re: /\btonight\b/gi, make: () => ({ day: { type: 'today' as const } }) },
    { re: /\btomorrow\b/gi, make: () => ({ day: { type: 'tomorrow' as const } }) },
    { re: /\btoday\b/gi, make: () => ({ day: { type: 'today' as const } }) },
    {
      re: new RegExp(`\\bnext\\s+(${WEEKDAY_PATTERN})\\b`, 'gi'),
      make: (m) => {
        const weekday = weekdayFromName(m[1]);
        return weekday === null ? null : { day: { type: 'nextweekday' as const, weekday } };
      },
    },
    {
      re: /\bnext\s+week\b/gi,
      make: () => ({ day: { type: 'offset' as const, days: 7 } }),
    },
    {
      re: new RegExp(`\\b(${WEEKDAY_PATTERN})\\b`, 'gi'),
      make: (m) => {
        const weekday = weekdayFromName(m[1]);
        return weekday === null ? null : { day: { type: 'weekday' as const, weekday } };
      },
    },
    {
      re: /\bin\s+(\d{1,3})\s+days?\b/gi,
      make: (m) => ({ day: { type: 'offset' as const, days: parseInt(m[1], 10) } }),
    },
  ];

  const result: DayMatch[] = [];
  for (const { re, make } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const span = { start: match.index, end: match.index + match[0].length };
      if (result.some((existing) => overlaps(existing, span))) continue;
      const parsed = make(match);
      if (parsed) {
        result.push({ ...span, ...parsed, raw: match[0] });
      }
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

function collectTimeMatches(text: string): TimeMatch[] {
  const result: TimeMatch[] = [];
  const patterns: Array<{
    re: RegExp;
    make: (m: RegExpExecArray) => TimeSpec | null;
  }> = [
    {
      re: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi,
      make: (m) => {
        const hour = parseInt(m[1], 10);
        const minute = m[2] ? parseInt(m[2], 10) : 0;
        if (hour > 23 || minute > 59) return null;
        return parseTime(hour, minute, m[3]);
      },
    },
    {
      re: /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
      make: (m) => {
        const hour = parseInt(m[1], 10);
        const minute = m[2] ? parseInt(m[2], 10) : 0;
        if (hour > 23 || minute > 59) return null;
        return parseTime(hour, minute, m[3]);
      },
    },
    {
      re: /\b(noon|midnight|morning|afternoon|evening|night)\b/gi,
      make: (m) => {
        const key = m[1].toLowerCase();
        if (key === 'noon') return { hour: 12, minute: 0 };
        if (key === 'midnight') return { hour: 0, minute: 0 };
        return defaultTimeForPhrase(key);
      },
    },
  ];

  for (const { re, make } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const span = { start: match.index, end: match.index + match[0].length };
      if (result.some((existing) => overlaps(existing, span))) continue;
      const time = make(match);
      if (time) result.push({ ...span, time, raw: match[0] });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

export function collectWhens(text: string, now: Date): WhenMatch[] {
  const days = collectDayMatches(text);
  const times = collectTimeMatches(text);
  const usedDays = new Set<number>();
  const whens: WhenMatch[] = [];

  for (const timeMatch of times) {
    // Prefer the nearest day phrase BEFORE the time ("Friday at 5").
    // Only look after the time when there is no preceding day phrase
    // ("at 9 tomorrow"), and keep that window short.
    let best: DayMatch | null = null;
    for (const dayMatch of days) {
      if (usedDays.has(dayMatch.start)) continue;
      if (dayMatch.end <= timeMatch.start && timeMatch.start - dayMatch.end <= 40) {
        if (!best || dayMatch.start > best.start) best = dayMatch;
      }
    }
    if (!best) {
      for (const dayMatch of days) {
        if (usedDays.has(dayMatch.start)) continue;
        if (dayMatch.start >= timeMatch.end && dayMatch.start - timeMatch.end <= 12) {
          if (!best || dayMatch.start < best.start) best = dayMatch;
        }
      }
    }

    let day: DaySpec = { type: 'none' };
    const start = best ? Math.min(best.start, timeMatch.start) : timeMatch.start;
    const end = best ? Math.max(best.end, timeMatch.end) : timeMatch.end;
    if (best) {
      usedDays.add(best.start);
      day = best.day;
    }

    const resolved = resolveWhen(now, day, timeMatch.time);
    whens.push({
      start,
      end,
      timestamp: resolved.timestamp,
      ambiguousTime: resolved.ambiguousTime,
      raw: text.slice(start, end),
    });
  }

  for (const dayMatch of days) {
    if (usedDays.has(dayMatch.start)) continue;
    const resolved = resolveWhen(now, dayMatch.day, defaultTimeForPhrase(dayMatch.raw));
    whens.push({
      start: dayMatch.start,
      end: dayMatch.end,
      timestamp: resolved.timestamp,
      ambiguousTime: false,
      raw: dayMatch.raw,
    });
  }

  return whens.sort((a, b) => a.start - b.start);
}

interface PrefixMatch {
  kind: Exclude<CaptureKind, 'unknown'>;
  start: number;
  end: number;
}

function detectPrefix(text: string): PrefixMatch | null {
  const patterns: Array<{
    kind: Exclude<CaptureKind, 'unknown'>;
    re: RegExp;
  }> = [
    {
      kind: 'reminder',
      re: /^\s*(?:hey\s+|please\s+)?(?:remind me|reminder(?:\s+to)?|remind)\b[\s,:-]*/i,
    },
    {
      kind: 'note',
      re: /^\s*(?:please\s+)?(?:note to self|remember that|remember|note)\b[\s,:-]*/i,
    },
    {
      kind: 'task',
      re: /^\s*(?:please\s+)?(?:add task|add to[- ]?do|to[- ]?do|todo|task)\b[\s,:-]*/i,
    },
  ];

  for (const { kind, re } of patterns) {
    const match = re.exec(text);
    if (match) {
      return { kind, start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

function removeSpans(text: string, spans: Span[]): string {
  let result = text;
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  for (const span of sorted) {
    result = result.slice(0, span.start) + ' ' + result.slice(span.end);
  }
  return result;
}

function cleanTitle(text: string, kind: Exclude<CaptureKind, 'unknown'>): string {
  let title = text.replace(/\s+/g, ' ').trim();
  if (kind !== 'note') {
    title = title.replace(/^(?:to|about)\s+/i, '');
  }
  title = title
    .replace(/\b(?:please|thanks|thank you)\s*$/i, '')
    .replace(/[.,!;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title;
}

/** Resolve the first date/time phrase in arbitrary text, without a command prefix. */
export function resolveWhenText(text: string, now = new Date()): number | null {
  return collectWhens(text, now)[0]?.timestamp ?? null;
}

export function parseCapture(input: string, now = new Date()): ParsedCapture {
  const original = input.trim();
  const prefix = detectPrefix(original);

  if (!prefix) {
    return {
      kind: 'unknown',
      title: original,
      body: original,
      reminderAt: null,
      dueAt: null,
      ambiguousTime: false,
      needsTime: false,
      needsTitle: false,
      hints: ["Start with 'Note:', 'Task:', or 'Remind me...' so I know what to save."],
    };
  }

  const kind = prefix.kind;
  const rest = original.slice(prefix.end);
  const whens = collectWhens(rest, now);

  const deadlineSpans: Span[] = [];
  const deadlineStarts = new Set<number>();
  const markerRe = /\b(?:due|by|deadline(?:\s+is)?)\b/gi;
  let marker: RegExpExecArray | null;
  while ((marker = markerRe.exec(rest)) !== null) {
    deadlineSpans.push({ start: marker.index, end: marker.index + marker[0].length });
    const after = marker.index + marker[0].length;
    const found = whens.find((w) => w.start >= after - 1 && w.start <= after + 12);
    if (found) deadlineStarts.add(found.start);
  }

  const deadlineWhen = whens.find((w) => deadlineStarts.has(w.start)) ?? null;
  const freeWhen = whens.find((w) => !deadlineStarts.has(w.start)) ?? null;

  let reminderAt: number | null = null;
  let dueAt: number | null = null;
  let needsTime = false;
  let ambiguousTime = false;

  if (kind === 'reminder') {
    const chosen = freeWhen ?? deadlineWhen;
    reminderAt = chosen ? chosen.timestamp : null;
    dueAt = deadlineWhen ? deadlineWhen.timestamp : null;
    ambiguousTime = Boolean(chosen?.ambiguousTime);
    needsTime = reminderAt === null;
  } else if (kind === 'task') {
    dueAt = deadlineWhen?.timestamp ?? freeWhen?.timestamp ?? null;
    ambiguousTime = Boolean((deadlineWhen ?? freeWhen)?.ambiguousTime);
  }

  const removableSpans: Span[] =
    kind === 'note' ? [] : [...whens, ...deadlineSpans];
  const title = cleanTitle(removeSpans(rest, removableSpans), kind);
  const needsTitle = title.length === 0;

  const hints: string[] = [];
  if (needsTitle) hints.push('Add a short title so you can find this later.');
  if (needsTime) hints.push("No time found. Add 'at 9am' or pick a time below.");
  if (ambiguousTime && reminderAt !== null) {
    hints.push(`Read as ${formatWhen(reminderAt, now)}. Use the AM/PM toggle if that is wrong.`);
  }

  return {
    kind,
    title,
    body: kind === 'note' ? rest.replace(/\s+/g, ' ').trim() : title,
    reminderAt,
    dueAt,
    ambiguousTime,
    needsTime,
    needsTitle,
    hints,
  };
}
