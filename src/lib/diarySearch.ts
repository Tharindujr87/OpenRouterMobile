import { getDiaryEntries, searchDiaryEntries } from '../db/repository';
import type { DiaryEntry } from './types';

export function searchDiary(terms: string[]): DiaryEntry[] {
  const found = new Map<string, DiaryEntry>();
  for (const term of terms) {
    for (const entry of searchDiaryEntries(term)) found.set(entry.id, entry);
  }
  return [...found.values()].sort(
    (a, b) => b.day.localeCompare(a.day) || a.createdAt - b.createdAt,
  );
}

export function diaryEntriesFor(day: string): DiaryEntry[] {
  return getDiaryEntries(day);
}
