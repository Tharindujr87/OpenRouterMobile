/**
 * Browser-only storage adapter used for local UI previews.
 * The phone always uses SQLite through nativeRepository.
 */
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

const KEYS = {
  notes: 'orm.notes',
  tasks: 'orm.tasks',
  messages: 'orm.messages',
  sessions: 'orm.sessions',
  diary: 'orm.diary',
  diarySummaries: 'orm.diarySummaries',
  activity: 'orm.taskActivity',
  meta: 'orm.meta',
  memory: 'orm.memory',
};

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------- notes --------------------------------- */

export function getNotes(): Note[] {
  return read<Note[]>(KEYS.notes, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function searchNotes(query: string): Note[] {
  const needle = query.toLowerCase();
  return getNotes().filter((note) => note.body.toLowerCase().includes(needle));
}

export function insertNote(body: string): Note {
  const now = Date.now();
  const note: Note = { id: uid(), body, createdAt: now, updatedAt: now };
  write(KEYS.notes, [...getNotes(), note]);
  return note;
}

export function updateNote(id: string, body: string): void {
  write(KEYS.notes, getNotes().map((note) => (note.id === id ? { ...note, body, updatedAt: Date.now() } : note)));
}

export function deleteNote(id: string): void {
  write(KEYS.notes, getNotes().filter((note) => note.id !== id));
}

/* ------------------------------- tasks --------------------------------- */

export function getTasks(status?: TaskStatus): Task[] {
  const tasks = read<Task[]>(KEYS.tasks, []);
  const filtered = status ? tasks.filter((task) => task.status === status) : tasks;
  return [...filtered].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return (a.reminderAt ?? a.dueAt ?? a.updatedAt) - (b.reminderAt ?? b.dueAt ?? b.updatedAt);
  });
}

export function getTask(id: string): Task | null {
  return read<Task[]>(KEYS.tasks, []).find((task) => task.id === id) ?? null;
}

export type NewTask = {
  title: string;
  dueAt?: number | null;
  reminderAt?: number | null;
  notificationId?: string | null;
  calendarEventId?: string | null;
};

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
  write(KEYS.tasks, [...read<Task[]>(KEYS.tasks, []), task]);
  return task;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    'title' | 'status' | 'dueAt' | 'reminderAt' | 'notificationId' | 'calendarEventId' | 'completedAt'
  >
>;

export function updateTask(id: string, patch: TaskPatch): void {
  const tasks = read<Task[]>(KEYS.tasks, []).map((task) =>
    task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task,
  );
  write(KEYS.tasks, tasks);
}

export function deleteTask(id: string): void {
  write(KEYS.tasks, read<Task[]>(KEYS.tasks, []).filter((task) => task.id !== id));
}

/* ------------------------------ messages ------------------------------- */

export function getMessages(sessionId?: string | null, limit = 100): ChatMessage[] {
  let messages = read<ChatMessage[]>(KEYS.messages, []).sort((a, b) => a.createdAt - b.createdAt);
  if (sessionId !== undefined) {
    messages = messages.filter((message) => message.sessionId === sessionId);
  }
  return messages.slice(-limit);
}

export function insertMessage(
  role: 'user' | 'assistant',
  body: string,
  linkedId: string | null = null,
  sessionId: string | null = null,
  routeInfo: string | null = null,
): ChatMessage {
  const message: ChatMessage = { id: uid(), role, body, createdAt: Date.now(), linkedId, sessionId, routeInfo };
  write(KEYS.messages, [...read<ChatMessage[]>(KEYS.messages, []), message]);
  if (sessionId) {
    write(
      KEYS.sessions,
      read<ChatSession[]>(KEYS.sessions, []).map((session) =>
        session.id === sessionId ? { ...session, updatedAt: Date.now() } : session,
      ),
    );
  }
  return message;
}

export function updateMessage(id: string, body: string): void {
  write(
    KEYS.messages,
    read<ChatMessage[]>(KEYS.messages, []).map((message) =>
      message.id === id ? { ...message, body } : message,
    ),
  );
}

export function deleteMessage(id: string): void {
  write(
    KEYS.messages,
    read<ChatMessage[]>(KEYS.messages, []).filter((message) => message.id !== id),
  );
}

export function clearMessages(sessionId?: string | null): void {
  if (sessionId === undefined) {
    write(KEYS.messages, []);
    return;
  }
  write(
    KEYS.messages,
    read<ChatMessage[]>(KEYS.messages, []).filter((message) => message.sessionId !== sessionId),
  );
}

/* ------------------------------ sessions -------------------------------- */

export function getSessions(): ChatSession[] {
  return read<ChatSession[]>(KEYS.sessions, []).sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}

export function getSession(id: string): ChatSession | null {
  return read<ChatSession[]>(KEYS.sessions, []).find((session) => session.id === id) ?? null;
}

export function insertSession(title: string): ChatSession {
  const now = Date.now();
  const session: ChatSession = { id: uid(), title, pinned: false, createdAt: now, updatedAt: now };
  write(KEYS.sessions, [...read<ChatSession[]>(KEYS.sessions, []), session]);
  return session;
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, 'title' | 'pinned'>>,
): void {
  write(
    KEYS.sessions,
    read<ChatSession[]>(KEYS.sessions, []).map((session) =>
      session.id === id ? { ...session, ...patch, updatedAt: Date.now() } : session,
    ),
  );
}

export function deleteSession(id: string): void {
  write(KEYS.sessions, read<ChatSession[]>(KEYS.sessions, []).filter((session) => session.id !== id));
  write(KEYS.messages, read<ChatMessage[]>(KEYS.messages, []).filter((message) => message.sessionId !== id));
}

/* ---------------------------- task activity ------------------------------ */

export function getTaskActivity(taskId: string): TaskActivity[] {
  return read<TaskActivity[]>(KEYS.activity, [])
    .filter((item) => item.taskId === taskId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function insertTaskActivity(taskId: string, kind: TaskActivity['kind'], text: string): void {
  const activity: TaskActivity = { id: uid(), taskId, kind, text, createdAt: Date.now() };
  write(KEYS.activity, [...read<TaskActivity[]>(KEYS.activity, []), activity]);
}

export function deleteTaskActivity(taskId: string): void {
  write(KEYS.activity, read<TaskActivity[]>(KEYS.activity, []).filter((item) => item.taskId !== taskId));
}

/* -------------------------------- diary --------------------------------- */

export function getDiaryEntries(day?: string): DiaryEntry[] {
  const entries = read<DiaryEntry[]>(KEYS.diary, []);
  const filtered = day ? entries.filter((entry) => entry.day === day) : entries;
  return [...filtered].sort((a, b) =>
    a.day === b.day ? a.createdAt - b.createdAt : b.day.localeCompare(a.day),
  );
}

export function searchDiaryEntries(query: string): DiaryEntry[] {
  const needle = query.toLowerCase();
  return getDiaryEntries().filter((entry) =>
    [entry.body, entry.original, entry.summary, entry.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}

export function insertDiaryEntry(input: {
  day: string;
  body: string;
  original: string;
  summary: string;
  tags: string[];
}): DiaryEntry {
  const now = Date.now();
  const entry: DiaryEntry = { id: uid(), ...input, createdAt: now, updatedAt: now };
  write(KEYS.diary, [...read<DiaryEntry[]>(KEYS.diary, []), entry]);
  return entry;
}

export function updateDiaryEntry(
  id: string,
  patch: Partial<Pick<DiaryEntry, 'body' | 'summary' | 'tags'>>,
): void {
  write(
    KEYS.diary,
    read<DiaryEntry[]>(KEYS.diary, []).map((entry) =>
      entry.id === id ? { ...entry, ...patch, updatedAt: Date.now() } : entry,
    ),
  );
}

export function deleteDiaryEntry(id: string): void {
  write(KEYS.diary, read<DiaryEntry[]>(KEYS.diary, []).filter((entry) => entry.id !== id));
}

export function getDiarySummary(day: string): DiarySummary | null {
  return read<Record<string, DiarySummary>>(KEYS.diarySummaries, {})[day] ?? null;
}

export function saveDiarySummary(day: string, content: string, model: string): void {
  const all = read<Record<string, DiarySummary>>(KEYS.diarySummaries, {});
  all[day] = { day, content, generatedAt: Date.now(), model };
  write(KEYS.diarySummaries, all);
}

export function deleteDiarySummary(day: string): void {
  const all = read<Record<string, DiarySummary>>(KEYS.diarySummaries, {});
  delete all[day];
  write(KEYS.diarySummaries, all);
}

export function getAllTaskActivity(): TaskActivity[] {
  return read<TaskActivity[]>(KEYS.activity, []);
}

export function getAllDiarySummaries(): DiarySummary[] {
  return Object.values(read<Record<string, DiarySummary>>(KEYS.diarySummaries, {}));
}

export function getAllMeta(): Record<string, string> {
  return read<Record<string, string>>(KEYS.meta, {});
}

export function applySnapshot(snapshot: BackupSnapshot): void {
  write(KEYS.notes, snapshot.notes);
  write(KEYS.tasks, snapshot.tasks);
  write(KEYS.activity, snapshot.taskActivity);
  write(KEYS.sessions, snapshot.sessions);
  write(KEYS.messages, snapshot.messages);
  write(KEYS.diary, snapshot.diary);
  write(KEYS.diarySummaries, Object.fromEntries(snapshot.diarySummaries.map((item) => [item.day, item])));
  write(KEYS.meta, snapshot.meta);
  write(KEYS.memory, snapshot.memory);
}

/* --------------------------- meta and memory ---------------------------- */

export function getMeta(key: string, fallback = ''): string {
  return read<Record<string, string>>(KEYS.meta, {})[key] ?? fallback;
}

export function setMeta(key: string, value: string): void {
  const meta = read<Record<string, string>>(KEYS.meta, {});
  meta[key] = value;
  write(KEYS.meta, meta);
}

export function getMemory(): Record<string, string> {
  return read<Record<string, string>>(KEYS.memory, {});
}

export function setMemory(key: string, value: string): void {
  const memory = getMemory();
  memory[key] = value;
  write(KEYS.memory, memory);
}

export function deleteMemory(key: string): void {
  const memory = getMemory();
  delete memory[key];
  write(KEYS.memory, memory);
}
