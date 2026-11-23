import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { getMeta, setMeta } from '../db/repository';

export const CALENDAR_ID_KEY = 'defaultCalendarId';

export interface CalendarChoice {
  id: string;
  title: string;
  allowsModifications: boolean;
}

export async function requestCalendarAccess(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const result = await Calendar.requestCalendarPermissions(true);
  return result.granted;
}

export async function hasCalendarAccess(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const result = await Calendar.getCalendarPermissions(true);
  return result.granted;
}

export async function listCalendars(): Promise<CalendarChoice[]> {
  if (Platform.OS === 'web') return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.allowsModifications)
    .map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      allowsModifications: calendar.allowsModifications,
    }));
}

export function getSavedCalendarId(): string | null {
  return getMeta(CALENDAR_ID_KEY, '') || null;
}

export function saveCalendarId(id: string): void {
  setMeta(CALENDAR_ID_KEY, id);
}

export async function addCalendarEvent(input: {
  title: string;
  startDate: number;
  endDate?: number;
  notes?: string;
  reminderMinutesBefore?: number;
}): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!(await hasCalendarAccess())) return null;

  const calendars = await listCalendars();
  if (calendars.length === 0) return null;

  const savedId = getSavedCalendarId();
  const chosen =
    calendars.find((calendar) => calendar.id === savedId) ??
    calendars.find((calendar) => calendar.allowsModifications);
  if (!chosen) return null;

  const calendar = await Calendar.ExpoCalendar.get(chosen.id);
  const start = new Date(input.startDate);
  const end = new Date(input.endDate ?? input.startDate + 30 * 60_000);
  const event = await calendar.createEvent({
    title: input.title,
    startDate: start,
    endDate: end,
    notes: input.notes ?? 'Added by ORM.',
    alarms: input.reminderMinutesBefore
      ? [{ relativeOffset: -input.reminderMinutesBefore }]
      : [],
  });
  return event.id;
}

export async function removeCalendarEvent(eventId: string | null): Promise<void> {
  if (!eventId || Platform.OS === 'web') return;
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.delete();
  } catch {
    // Event may already have been deleted outside the app.
  }
}
