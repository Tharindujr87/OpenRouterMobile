/** Deterministic answers to common date questions, using the device clock. */

function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
}

function isoWeeksInYear(year: number): number {
  return isoWeek(new Date(year, 11, 28));
}

function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function answerDateQuestion(input: string, now = new Date()): string | null {
  const text = input.toLowerCase();
  const mentionsTomorrow = /\btomorrow\b/.test(text);
  const target = new Date(now);
  if (mentionsTomorrow) target.setDate(target.getDate() + 1);

  const asksDate =
    /\b(what|which)\b.*\b(day|date|month|year)\b/.test(text) ||
    /\b(day|date)\b.*\b(tomorrow|today)\b/.test(text);
  const asksWeekNumber = /\bweek number\b|\bwhich week\b/.test(text);
  const asksWeekCount =
    /\bhow many weeks\b|\bweeks (?:in|for|of) (?:the |this )?year\b/.test(text);

  if (!asksDate && !asksWeekNumber && !asksWeekCount) return null;

  const lines: string[] = [];
  if (asksDate) {
    lines.push(`${mentionsTomorrow ? 'Tomorrow' : 'Today'} is ${longDate(target)}.`);
  }
  if (asksWeekNumber) {
    lines.push(
      `ISO week number: ${isoWeek(target)} (${longDate(target)}). Today (${longDate(now)}) is week ${isoWeek(now)}.`,
    );
  }
  if (asksWeekCount) {
    const year = target.getFullYear();
    const weeks = isoWeeksInYear(year);
    const days = Math.round(
      (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000,
    );
    lines.push(`${year} has ${weeks} ISO weeks (${Math.floor(days / 7)} weeks + ${days % 7} day${days % 7 === 1 ? '' : 's'} in the year).`);
  }
  return lines.join('\n');
}
