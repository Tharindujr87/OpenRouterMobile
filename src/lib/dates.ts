/**
 * Deterministic date/time resolution. No AI involved.
 * A bare hour such as "2" is genuinely ambiguous, so we return both a
 * resolved timestamp and a flag that lets the UI offer an AM/PM toggle.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type DaySpec =
  | { type: 'none' }
  | { type: 'today' }
  | { type: 'tomorrow' }
  | { type: 'weekday'; weekday: number }
  | { type: 'nextweekday'; weekday: number }
  | { type: 'offset'; days: number };

export type TimeSpec = {
  hour: number;
  minute: number;
  meridiem?: 'am' | 'pm';
  period?: 'morning' | 'afternoon' | 'evening' | 'night';
};

export interface ResolvedWhen {
  timestamp: number;
  ambiguousTime: boolean;
}

export function weekdayFromName(name: string): number | null {
  const key = name.toLowerCase().replace(/\./g, '');
  return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, key)
    ? WEEKDAY_INDEX[key]
    : null;
}

export function parseTime(hour: number, minute: number, meridiem?: string): TimeSpec {
  const spec: TimeSpec = { hour, minute };
  if (meridiem) {
    spec.meridiem = meridiem.replace(/\./g, '').toLowerCase() === 'pm' ? 'pm' : 'am';
  }
  return spec;
}

export function defaultTimeForPhrase(phrase: string): TimeSpec {
  const key = phrase.toLowerCase();
  if (key.includes('tonight') || key.includes('night')) return { hour: 20, minute: 0 };
  if (key.includes('evening')) return { hour: 19, minute: 0 };
  if (key.includes('afternoon')) return { hour: 15, minute: 0 };
  if (key.includes('morning')) return { hour: 9, minute: 0 };
  return { hour: 9, minute: 0 };
}

function baseDate(now: Date, day: DaySpec): Date {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (day.type) {
    case 'today':
      return base;
    case 'tomorrow':
      base.setDate(base.getDate() + 1);
      return base;
    case 'weekday': {
      // Same-day is allowed here; resolveWhen pushes it out a week if the
      // requested time has already passed.
      const delta = (day.weekday - base.getDay() + 7) % 7;
      base.setDate(base.getDate() + delta);
      return base;
    }
    case 'nextweekday': {
      let delta = (8 - base.getDay()) % 7;
      if (delta === 0) delta = 7;
      base.setDate(base.getDate() + delta);
      return base;
    }
    case 'offset':
      base.setDate(base.getDate() + (day.days || 0));
      return base;
    default:
      return base;
  }
}

interface TimeCandidate {
  hour: number;
  minute: number;
  ambiguous: boolean;
}

function timeCandidates(time: TimeSpec): TimeCandidate[] {
  if (time.meridiem) {
    let hour = time.hour % 12;
    if (time.meridiem === 'pm') hour += 12;
    return [{ hour, minute: time.minute, ambiguous: false }];
  }
  if (time.period) {
    const hours: Record<string, number> = {
      morning: 9,
      afternoon: 15,
      evening: 19,
      night: 20,
    };
    return [{ hour: hours[time.period] ?? 9, minute: 0, ambiguous: false }];
  }
  if (time.hour >= 12) {
    return [{ hour: time.hour, minute: time.minute, ambiguous: false }];
  }
  // Bare hours are ambiguous. In everyday speech 1-7 means PM ("at 5"),
  // while 8-11 usually means AM ("at 9"). Keep both readings, in that order.
  if (time.hour <= 7) {
    return [
      { hour: time.hour + 12, minute: time.minute, ambiguous: true },
      { hour: time.hour, minute: time.minute, ambiguous: true },
    ];
  }
  return [
    { hour: time.hour, minute: time.minute, ambiguous: true },
    { hour: time.hour + 12, minute: time.minute, ambiguous: true },
  ];
}

export function resolveWhen(now: Date, day: DaySpec, time: TimeSpec): ResolvedWhen {
  const base = baseDate(now, day);
  const candidates = timeCandidates(time);

  for (let attempt = 0; attempt < 2; attempt++) {
    const options = candidates.map((candidate) => {
      const date = new Date(base);
      date.setHours(candidate.hour, candidate.minute, 0, 0);
      return { date, ambiguous: candidate.ambiguous };
    });
    // Candidates are in preference order. Take the first one still ahead of us.
    const chosen = options.find((option) => option.date.getTime() > now.getTime());
    if (chosen) {
      return { timestamp: chosen.date.getTime(), ambiguousTime: chosen.ambiguous };
    }
    base.setDate(base.getDate() + (day.type === 'weekday' || day.type === 'nextweekday' ? 7 : 1));
  }

  const fallback = new Date(base);
  fallback.setHours(candidates[0].hour, candidates[0].minute, 0, 0);
  return { timestamp: fallback.getTime(), ambiguousTime: candidates[0].ambiguous };
}

/** Flip an ambiguous bare-hour time to the other half of the day. */
export function flipMeridiem(timestamp: number): number {
  const date = new Date(timestamp);
  const hour = date.getHours();
  date.setHours(hour < 12 ? hour + 12 : hour - 12);
  return date.getTime();
}

export function shiftTime(timestamp: number, minutes: number): number {
  return timestamp + minutes * 60_000;
}

export function setTimeOnDate(baseTimestamp: number, hour: number, minute: number): number {
  const date = new Date(baseTimestamp);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

export function formatWhen(timestamp: number | null, now = new Date()): string {
  if (timestamp === null) return 'No time set';
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((day - today) / 86_400_000);

  let label: string;
  if (dayDiff === 0) label = 'Today';
  else if (dayDiff === 1) label = 'Tomorrow';
  else if (dayDiff === -1) label = 'Yesterday';
  else label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${label}, ${time}`;
}

export function isOverdue(timestamp: number | null, now = new Date()): boolean {
  return timestamp !== null && timestamp < now.getTime();
}
