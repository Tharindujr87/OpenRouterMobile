import { getDb } from './database';
import { parsePhotos } from '../lib/photos';
import type {
  ChatMessage,
  ChatSession,
  DiaryEntry,
  DiarySummary,
  Note,
  Task,
  TaskActivity,
  TaskStatus,
  BackupSnapshot,
} from '../lib/types';

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface NoteRow {
  id: string;
  body: string;
  photos: string | null;
  created_at: number;
  updated_at: number;
}

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  due_at: number | null;
  reminder_at: number | null;
  notification_id: string | null;
  calendar_event_id: string | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  created_at: number;
  linked_id: string | null;
  session_id: string | null;
  route_info: string | null;
}

interface SessionRow {
  id: string;
  title: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    body: row.body,
    photos: parsePhotos(row.photos),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    notificationId: row.notification_id,
    calendarEventId: row.calendar_event_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
    linkedId: row.linked_id,
    sessionId: row.session_id,
    routeInfo: row.route_info,
  };
}

function toSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------- notes --------------------------------- */

export function getNotes(): Note[] {
  const rows = getDb().getAllSync<NoteRow>(
    'SELECT * FROM notes ORDER BY updated_at DESC',
  );
  return rows.map(toNote);
}

export function searchNotes(query: string): Note[] {
  const like = `%${query.replace(/[%"_]/g, '')}%`;
  const rows = getDb().getAllSync<NoteRow>(
    'SELECT * FROM notes WHERE body LIKE ? ORDER BY updated_at DESC',
    like,
  );
  return rows.map(toNote);
}

export function insertNote(body: string, photos: string[] = []): Note {
  const now = Date.now();
  const note: Note = { id: uid(), body, photos, createdAt: now, updatedAt: now };
  getDb().runSync(
    'INSERT INTO notes (id, body, photos, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    note.id,
    note.body,
    JSON.stringify(note.photos),
    note.createdAt,
    note.updatedAt,
  );
  return note;
}

export function updateNote(id: string, body: string, photos?: string[]): void {
  const db = getDb();
  if (photos === undefined) {
    db.runSync('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?', body, Date.now(), id);
    return;
  }
  db.runSync(
    'UPDATE notes SET body = ?, photos = ?, updated_at = ? WHERE id = ?',
    body,
    JSON.stringify(photos),
    Date.now(),
    id,
  );
}

export function deleteNote(id: string): void {
  getDb().runSync('DELETE FROM notes WHERE id = ?', id);
}

/* ------------------------------- tasks --------------------------------- */

export function getTasks(status?: TaskStatus): Task[] {
  const db = getDb();
  const rows = status
    ? db.getAllSync<TaskRow>(
        'SELECT * FROM tasks WHERE status = ? ORDER BY COALESCE(reminder_at, due_at, updated_at) ASC',
        status,
      )
    : db.getAllSync<TaskRow>(
        'SELECT * FROM tasks ORDER BY status ASC, COALESCE(reminder_at, due_at, updated_at) ASC',
      );
  return rows.map(toTask);
}

export function getTask(id: string): Task | null {
  const row = getDb().getFirstSync<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
  return row ? toTask(row) : null;
}

export interface NewTask {
  title: string;
  dueAt?: number | null;
  reminderAt?: number | null;
  notificationId?: string | null;
  calendarEventId?: string | null;
}

export function insertTask(input: NewTask): Task {
  const now = Date.now();
  const task: Task = {
    id: uid(),
    title: input.title,
    status: 'open',
    dueAt: input.dueAt ?? null,
    reminderAt: input.reminderAt ?? null,
    notificationId: input.notificationId ?? null,
    calendarEventId: input.calendarEventId ?? null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  getDb().runSync(
    `INSERT INTO tasks
       (id, title, status, due_at, reminder_at, notification_id, calendar_event_id,
        completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    task.id,
    task.title,
    task.status,
    task.dueAt,
    task.reminderAt,
    task.notificationId,
    task.calendarEventId,
    task.completedAt,
    task.createdAt,
    task.updatedAt,
  );
  return task;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'status'
    | 'dueAt'
    | 'reminderAt'
    | 'notificationId'
    | 'calendarEventId'
    | 'completedAt'
  >
>;

const TASK_COLUMNS: Record<keyof TaskPatch, string> = {
  title: 'title',
  status: 'status',
  dueAt: 'due_at',
  reminderAt: 'reminder_at',
  notificationId: 'notification_id',
  calendarEventId: 'calendar_event_id',
  completedAt: 'completed_at',
};

export function updateTask(id: string, patch: TaskPatch): void {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<
    [keyof TaskPatch, unknown]
  >;
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${TASK_COLUMNS[key]} = ?`).join(', ');
  const values = entries.map(([, value]) => (value ?? null) as string | number | null);
  getDb().runSync(
    `UPDATE tasks SET ${assignments}, updated_at = ? WHERE id = ?`,
    ...values,
    Date.now(),
    id,
  );
}

export function deleteTask(id: string): void {
  getDb().runSync('DELETE FROM tasks WHERE id = ?', id);
}

/* ------------------------------ messages ------------------------------- */

export function getMessages(sessionId?: string | null, limit = 100): ChatMessage[] {
  const db = getDb();
  const rows =
    sessionId === undefined
      ? db.getAllSync<MessageRow>('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', limit)
      : sessionId === null
        ? db.getAllSync<MessageRow>(
            'SELECT * FROM messages WHERE session_id IS NULL ORDER BY created_at DESC LIMIT ?',
            limit,
          )
        : db.getAllSync<MessageRow>(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
            sessionId,
            limit,
          );
  return rows.map(toMessage).reverse();
}

export function insertMessage(
  role: 'user' | 'assistant',
  body: string,
  linkedId: string | null = null,
  sessionId: string | null = null,
  routeInfo: string | null = null,
): ChatMessage {
  const message: ChatMessage = {
    id: uid(),
    role,
    body,
    createdAt: Date.now(),
    linkedId,
    sessionId,
    routeInfo,
  };
  getDb().runSync(
    `INSERT INTO messages (id, role, body, created_at, linked_id, session_id, route_info)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    message.id,
    message.role,
    message.body,
    message.createdAt,
    message.linkedId,
    message.sessionId,
    message.routeInfo,
  );
  if (sessionId) {
    getDb().runSync('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', Date.now(), sessionId);
  }
  return message;
}

export function updateMessage(id: string, body: string): void {
  getDb().runSync('UPDATE messages SET body = ?, created_at = created_at WHERE id = ?', body, id);
}

export function deleteMessage(id: string): void {
  getDb().runSync('DELETE FROM messages WHERE id = ?', id);
}

export function clearMessages(sessionId?: string | null): void {
  const db = getDb();
  if (sessionId === undefined) {
    db.runSync('DELETE FROM messages');
  } else if (sessionId === null) {
    db.runSync('DELETE FROM messages WHERE session_id IS NULL');
  } else {
    db.runSync('DELETE FROM messages WHERE session_id = ?', sessionId);
  }
}

/* ------------------------------ sessions -------------------------------- */

export function getSessions(): ChatSession[] {
  const rows = getDb().getAllSync<SessionRow>(
    'SELECT * FROM chat_sessions ORDER BY pinned DESC, updated_at DESC',
  );
  return rows.map(toSession);
}

export function getSession(id: string): ChatSession | null {
  const row = getDb().getFirstSync<SessionRow>('SELECT * FROM chat_sessions WHERE id = ?', id);
  return row ? toSession(row) : null;
}

export function insertSession(title: string): ChatSession {
  const now = Date.now();
  const session: ChatSession = { id: uid(), title, pinned: false, createdAt: now, updatedAt: now };
  getDb().runSync(
    'INSERT INTO chat_sessions (id, title, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
    session.id,
    session.title,
    session.createdAt,
    session.updatedAt,
  );
  return session;
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, 'title' | 'pinned'>>,
): void {
  const db = getDb();
  if (patch.title !== undefined) {
    db.runSync('UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?', patch.title, Date.now(), id);
  }
  if (patch.pinned !== undefined) {
    db.runSync('UPDATE chat_sessions SET pinned = ? WHERE id = ?', patch.pinned ? 1 : 0, id);
  }
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.runSync('DELETE FROM messages WHERE session_id = ?', id);
  db.runSync('DELETE FROM chat_sessions WHERE id = ?', id);
}

/* ---------------------------- task activity ------------------------------ */

interface ActivityRow {
  id: string;
  task_id: string;
  kind: TaskActivity['kind'];
  text: string;
  created_at: number;
}

export function getTaskActivity(taskId: string): TaskActivity[] {
  const rows = getDb().getAllSync<ActivityRow>(
    'SELECT * FROM task_activity WHERE task_id = ? ORDER BY created_at ASC',
    taskId,
  );
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    text: row.text,
    createdAt: row.created_at,
  }));
}

export function insertTaskActivity(taskId: string, kind: TaskActivity['kind'], text: string): void {
  getDb().runSync(
    'INSERT INTO task_activity (id, task_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)',
    uid(),
    taskId,
    kind,
    text,
    Date.now(),
  );
}

export function deleteTaskActivity(taskId: string): void {
  getDb().runSync('DELETE FROM task_activity WHERE task_id = ?', taskId);
}

/* -------------------------------- diary --------------------------------- */

interface DiaryRow {
  id: string;
  day: string;
  body: string;
  original: string;
  summary: string;
  tags: string;
  photos: string | null;
  created_at: number;
  updated_at: number;
}

interface DiarySummaryRow {
  day: string;
  content: string;
  generated_at: number;
  model: string;
}

function toDiary(row: DiaryRow): DiaryEntry {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    day: row.day,
    body: row.body,
    original: row.original,
    summary: row.summary,
    tags,
    photos: parsePhotos(row.photos),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDiaryEntries(day?: string): DiaryEntry[] {
  const db = getDb();
  const rows = day
    ? db.getAllSync<DiaryRow>('SELECT * FROM diary_entries WHERE day = ? ORDER BY created_at ASC', day)
    : db.getAllSync<DiaryRow>('SELECT * FROM diary_entries ORDER BY day DESC, created_at DESC');
  return rows.map(toDiary);
}

export function searchDiaryEntries(query: string): DiaryEntry[] {
  const like = `%${query.replace(/[%"_]/g, '')}%`;
  const rows = getDb().getAllSync<DiaryRow>(
    `SELECT * FROM diary_entries
     WHERE body LIKE ? OR original LIKE ? OR summary LIKE ? OR tags LIKE ?
     ORDER BY day DESC, created_at DESC`,
    like,
    like,
    like,
    like,
  );
  return rows.map(toDiary);
}

export function insertDiaryEntry(input: {
  day: string;
  body: string;
  original: string;
  summary: string;
  tags: string[];
  photos?: string[];
}): DiaryEntry {
  const now = Date.now();
  const entry: DiaryEntry = {
    id: uid(),
    day: input.day,
    body: input.body,
    original: input.original,
    summary: input.summary,
    tags: input.tags,
    photos: input.photos ?? [],
    createdAt: now,
    updatedAt: now,
  };
  getDb().runSync(
    `INSERT INTO diary_entries (id, day, body, original, summary, tags, photos, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.day,
    entry.body,
    entry.original,
    entry.summary,
    JSON.stringify(entry.tags),
    JSON.stringify(entry.photos),
    entry.createdAt,
    entry.updatedAt,
  );
  return entry;
}

export function updateDiaryEntry(
  id: string,
  patch: Partial<Pick<DiaryEntry, 'body' | 'summary' | 'tags' | 'photos'>>,
): void {
  const db = getDb();
  if (patch.body !== undefined) db.runSync('UPDATE diary_entries SET body = ?, updated_at = ? WHERE id = ?', patch.body, Date.now(), id);
  if (patch.summary !== undefined) db.runSync('UPDATE diary_entries SET summary = ?, updated_at = ? WHERE id = ?', patch.summary, Date.now(), id);
  if (patch.tags !== undefined) db.runSync('UPDATE diary_entries SET tags = ?, updated_at = ? WHERE id = ?', JSON.stringify(patch.tags), Date.now(), id);
  if (patch.photos !== undefined) db.runSync('UPDATE diary_entries SET photos = ?, updated_at = ? WHERE id = ?', JSON.stringify(patch.photos), Date.now(), id);
}

export function deleteDiaryEntry(id: string): void {
  getDb().runSync('DELETE FROM diary_entries WHERE id = ?', id);
}

export function getDiarySummary(day: string): DiarySummary | null {
  const row = getDb().getFirstSync<DiarySummaryRow>(
    'SELECT * FROM diary_summaries WHERE day = ?',
    day,
  );
  return row
    ? { day: row.day, content: row.content, generatedAt: row.generated_at, model: row.model }
    : null;
}

export function saveDiarySummary(day: string, content: string, model: string): void {
  getDb().runSync(
    `INSERT INTO diary_summaries (day, content, generated_at, model) VALUES (?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET content = excluded.content, generated_at = excluded.generated_at, model = excluded.model`,
    day,
    content,
    Date.now(),
    model,
  );
}

export function deleteDiarySummary(day: string): void {
  getDb().runSync('DELETE FROM diary_summaries WHERE day = ?', day);
}

export function getAllTaskActivity(): TaskActivity[] {
  const rows = getDb().getAllSync<ActivityRow>('SELECT * FROM task_activity ORDER BY created_at ASC');
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    text: row.text,
    createdAt: row.created_at,
  }));
}

export function getAllDiarySummaries(): DiarySummary[] {
  const rows = getDb().getAllSync<DiarySummaryRow>('SELECT * FROM diary_summaries ORDER BY day ASC');
  return rows.map((row) => ({
    day: row.day,
    content: row.content,
    generatedAt: row.generated_at,
    model: row.model,
  }));
}

export function getAllMeta(): Record<string, string> {
  const rows = getDb().getAllSync<{ key: string; value: string }>('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function applySnapshot(snapshot: BackupSnapshot): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.execSync(`
      DELETE FROM messages;
      DELETE FROM chat_sessions;
      DELETE FROM task_activity;
      DELETE FROM tasks;
      DELETE FROM notes;
      DELETE FROM diary_summaries;
      DELETE FROM diary_entries;
      DELETE FROM meta;
      DELETE FROM memory;
    `);
    for (const note of snapshot.notes) {
      db.runSync('INSERT INTO notes (id, body, photos, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', note.id, note.body, JSON.stringify(note.photos ?? []), note.createdAt, note.updatedAt);
    }
    for (const task of snapshot.tasks) {
      db.runSync(
        `INSERT INTO tasks (id, title, status, due_at, reminder_at, notification_id, calendar_event_id, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        task.id, task.title, task.status, task.dueAt, task.reminderAt, task.notificationId,
        task.calendarEventId, task.completedAt, task.createdAt, task.updatedAt,
      );
    }
    for (const item of snapshot.taskActivity) {
      db.runSync('INSERT INTO task_activity (id, task_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)', item.id, item.taskId, item.kind, item.text, item.createdAt);
    }
    for (const session of snapshot.sessions) {
      db.runSync('INSERT INTO chat_sessions (id, title, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', session.id, session.title, session.pinned ? 1 : 0, session.createdAt, session.updatedAt);
    }
    for (const message of snapshot.messages) {
      db.runSync('INSERT INTO messages (id, role, body, created_at, linked_id, session_id, route_info) VALUES (?, ?, ?, ?, ?, ?, ?)', message.id, message.role, message.body, message.createdAt, message.linkedId, message.sessionId, message.routeInfo);
    }
    for (const entry of snapshot.diary) {
      db.runSync('INSERT INTO diary_entries (id, day, body, original, summary, tags, photos, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.id, entry.day, entry.body, entry.original, entry.summary, JSON.stringify(entry.tags), JSON.stringify(entry.photos ?? []), entry.createdAt, entry.updatedAt);
    }
    for (const item of snapshot.diarySummaries) {
      db.runSync('INSERT INTO diary_summaries (day, content, generated_at, model) VALUES (?, ?, ?, ?)', item.day, item.content, item.generatedAt, item.model);
    }
    for (const [key, value] of Object.entries(snapshot.meta)) {
      db.runSync('INSERT INTO meta (key, value) VALUES (?, ?)', key, value);
    }
    for (const [key, value] of Object.entries(snapshot.memory)) {
      db.runSync('INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?)', key, value, Date.now());
    }
  });
}

/* --------------------------- meta and memory ---------------------------- */

export function getMeta(key: string, fallback = ''): string {
  const row = getDb().getFirstSync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key,
  );
  return row?.value ?? fallback;
}

export function setMeta(key: string, value: string): void {
  getDb().runSync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function getMemory(): Record<string, string> {
  const rows = getDb().getAllSync<{ key: string; value: string }>(
    'SELECT key, value FROM memory ORDER BY key',
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function setMemory(key: string, value: string): void {
  getDb().runSync(
    `INSERT INTO memory (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
}

export function deleteMemory(key: string): void {
  getDb().runSync('DELETE FROM memory WHERE key = ?', key);
}
