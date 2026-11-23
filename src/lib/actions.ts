import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  deleteTask,
  getDiaryEntries,
  getMessages,
  getNotes,
  getTask,
  getTasks,
  insertMessage,
  insertNote,
  insertTask,
  insertTaskActivity,
  updateTask,
} from '../db/repository';
import { addCalendarEvent, removeCalendarEvent } from './calendar';
import {
  cancelReminder,
  scheduleReminder,
} from './notifications';
import { formatWhen } from './dates';
import type { Task } from './types';

export interface SaveDraftInput {
  kind: 'note' | 'task' | 'reminder';
  title: string;
  body: string;
  originalText: string;
  reminderAt: number | null;
  dueAt: number | null;
  addToCalendar: boolean;
  sessionId?: string | null;
  assistantRouteInfo?: string | null;
}

export interface SaveResult {
  id: string;
  kind: SaveDraftInput['kind'];
  notificationScheduled: boolean;
  calendarAdded: boolean;
  warnings: string[];
}

export async function saveDraft(input: SaveDraftInput): Promise<SaveResult> {
  const warnings: string[] = [];
  let notificationScheduled = false;
  let calendarAdded = false;

  if (input.kind === 'note') {
    const note = insertNote(input.body || input.title);
    if (!input.sessionId) {
      insertMessage('user', input.originalText, note.id);
    }
    insertMessage(
      'assistant',
      `Saved note: ${note.body}`,
      note.id,
      input.sessionId ?? null,
      input.assistantRouteInfo ?? null,
    );
    return {
      id: note.id,
      kind: 'note',
      notificationScheduled: false,
      calendarAdded: false,
      warnings,
    };
  }

  let notificationId: string | null = null;
  if (input.reminderAt !== null) {
    notificationId = await scheduleReminder({
      title: input.title,
      body: formatWhen(input.reminderAt),
      timestamp: input.reminderAt,
      taskId: 'pending',
    });
    if (!notificationId) {
      warnings.push('Reminder was not scheduled. Check notification permission in Settings.');
    } else {
      notificationScheduled = true;
    }
  }

  let calendarEventId: string | null = null;
  if (input.addToCalendar && input.reminderAt !== null) {
    calendarEventId = await addCalendarEvent({
      title: input.title,
      startDate: input.reminderAt,
      endDate: input.reminderAt + 30 * 60_000,
      notes: `ORM task${input.dueAt ? ` · due ${formatWhen(input.dueAt)}` : ''}`,
    });
    calendarAdded = Boolean(calendarEventId);
    if (!calendarAdded) {
      warnings.push('Calendar entry was not created. Choose a calendar in Settings.');
    }
  }

  const task = insertTask({
    title: input.title,
    dueAt: input.dueAt,
    reminderAt: input.reminderAt,
    notificationId,
    calendarEventId,
  });

  // Re-schedule with the real task id so notification actions can find it.
  if (notificationId && input.reminderAt !== null) {
    await cancelReminder(notificationId);
    const realId = await scheduleReminder({
      title: input.title,
      body: formatWhen(input.reminderAt),
      timestamp: input.reminderAt,
      taskId: task.id,
    });
    notificationScheduled = Boolean(realId);
    updateTask(task.id, { notificationId: realId });
  }

  const parts = [`Saved ${input.kind}: ${task.title}`];
  if (input.dueAt !== null) parts.push(`due ${formatWhen(input.dueAt)}`);
  if (input.reminderAt !== null) {
    parts.push(
      notificationScheduled
        ? `reminder set for ${formatWhen(input.reminderAt)}`
        : `reminder time ${formatWhen(input.reminderAt)} (not scheduled)`,
    );
  }
  if (calendarAdded) parts.push('added to calendar');
  warnings.forEach((warning) => parts.push(warning));

  if (!input.sessionId) {
    insertMessage('user', input.originalText, task.id);
  }
  insertMessage(
    'assistant',
    parts.join(' · '),
    task.id,
    input.sessionId ?? null,
    input.assistantRouteInfo ?? null,
  );
  insertTaskActivity(task.id, 'created', `Created ${input.kind}.`);

  return {
    id: task.id,
    kind: input.kind,
    notificationScheduled,
    calendarAdded,
    warnings,
  };
}

export async function completeTaskAction(task: Task, note = ''): Promise<void> {
  if (task.status === 'done') return;
  await cancelReminder(task.notificationId);
  updateTask(task.id, {
    status: 'done',
    completedAt: Date.now(),
    notificationId: null,
  });
  insertTaskActivity(task.id, 'status', note ? `Completed. ${note}` : 'Completed.');
}

export async function reopenTaskAction(task: Task, note = ''): Promise<void> {
  let notificationId: string | null = null;
  if (task.reminderAt !== null && task.reminderAt > Date.now()) {
    notificationId = await scheduleReminder({
      title: task.title,
      body: formatWhen(task.reminderAt),
      timestamp: task.reminderAt,
      taskId: task.id,
    });
  }
  updateTask(task.id, { status: 'open', completedAt: null, notificationId });
  insertTaskActivity(task.id, 'status', note ? `Reopened. ${note}` : 'Reopened.');
}

export async function deleteTaskAction(task: Task, note = ''): Promise<void> {
  await cancelReminder(task.notificationId);
  await removeCalendarEvent(task.calendarEventId);
  insertTaskActivity(task.id, 'deleted', note || 'Deleted.');
  deleteTask(task.id);
}

export function addTaskNote(taskId: string, note: string): void {
  if (note.trim()) insertTaskActivity(taskId, 'note', note.trim());
}

export function updateTaskWithNote(
  id: string,
  patch: Parameters<typeof updateTask>[1],
  note = '',
): void {
  updateTask(id, patch);
  if (note.trim()) insertTaskActivity(id, 'updated', note.trim());
}

export async function rescheduleTaskAction(task: Task, timestamp: number): Promise<void> {
  await cancelReminder(task.notificationId);
  const notificationId = await scheduleReminder({
    title: task.title,
    body: formatWhen(timestamp),
    timestamp,
    taskId: task.id,
  });
  updateTask(task.id, { reminderAt: timestamp, notificationId });
}

export async function handleNotificationAction(
  action: string,
  taskId: string | null,
): Promise<void> {
  if (!taskId) return;
  const task = getTask(taskId);
  if (!task || task.status === 'done') return;

  if (action === 'done') {
    await completeTaskAction(task);
    return;
  }
  if (action === 'snooze') {
    await rescheduleTaskAction(task, Date.now() + 10 * 60_000);
  }
}

/* ------------------------------- export -------------------------------- */

function buildMarkdown(): string {
  const lines: string[] = ['# ORM export', '', `Generated: ${new Date().toISOString()}`, ''];

  lines.push('## Notes', '');
  const notes = getNotes();
  if (notes.length === 0) lines.push('_No notes._');
  for (const note of notes) {
    lines.push(`### ${new Date(note.updatedAt).toLocaleString()}`, '', note.body, '');
  }

  lines.push('## Tasks', '');
  const tasks = getTasks();
  if (tasks.length === 0) lines.push('_No tasks._');
  for (const task of tasks) {
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    const details = [
      task.dueAt ? `due ${formatWhen(task.dueAt)}` : null,
      task.reminderAt ? `reminder ${formatWhen(task.reminderAt)}` : null,
    ].filter(Boolean);
    lines.push(`- ${checkbox} ${task.title}${details.length ? ` — ${details.join(' · ')}` : ''}`);
  }

  lines.push('', '## Diary', '');
  const diary = getDiaryEntries();
  if (diary.length === 0) lines.push('_No diary entries._');
  for (const entry of diary) {
    lines.push(`### ${entry.day} — ${entry.summary}`, '', entry.body, '');
  }

  lines.push('## Recent chat', '');
  const messages = getMessages(undefined, 200);
  if (messages.length === 0) lines.push('_No messages._');
  for (const message of messages) {
    lines.push(`**${message.role === 'user' ? 'You' : 'ORM'}:** ${message.body}`, '');
  }
  return lines.join('\n');
}

function buildBackupJson(): string {
  return JSON.stringify(
    {
      app: 'ORMobile',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: getNotes(),
      tasks: getTasks(),
      messages: getMessages(undefined, 1000),
      diary: getDiaryEntries(),
    },
    null,
    2,
  );
}

async function writeAndShare(filename: string, content: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('No writable cache directory');
  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename });
}

export async function exportMarkdown(): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  await writeAndShare(`orm-export-${stamp}.md`, buildMarkdown(), 'text/markdown');
}

export async function exportBackup(): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  await writeAndShare(`orm-backup-${stamp}.json`, buildBackupJson(), 'application/json');
}
