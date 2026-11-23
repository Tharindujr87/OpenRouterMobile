export type CaptureKind = 'note' | 'task' | 'reminder' | 'unknown';

export interface WhenSpec {
  timestamp: number;
  ambiguousTime: boolean;
  raw: string;
}

export interface ParsedCapture {
  kind: CaptureKind;
  title: string;
  /** Full note body. Same as title for notes. */
  body: string;
  reminderAt: number | null;
  dueAt: number | null;
  ambiguousTime: boolean;
  needsTime: boolean;
  needsTitle: boolean;
  hints: string[];
}

export interface Note {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = 'open' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: number | null;
  reminderAt: number | null;
  notificationId: string | null;
  calendarEventId: string | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  kind: 'created' | 'note' | 'status' | 'updated' | 'deleted';
  text: string;
  createdAt: number;
}

export interface BackupSnapshot {
  app: 'ORMobile';
  version: 2;
  exportedAt: string;
  notes: Note[];
  tasks: Task[];
  taskActivity: TaskActivity[];
  sessions: ChatSession[];
  messages: ChatMessage[];
  diary: DiaryEntry[];
  diarySummaries: DiarySummary[];
  meta: Record<string, string>;
  memory: Record<string, string>;
}

export interface DiaryEntry {
  id: string;
  day: string;
  body: string;
  original: string;
  summary: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface DiarySummary {
  day: string;
  content: string;
  generatedAt: number;
  model: string;
}

export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAt: number;
  linkedId: string | null;
  sessionId: string | null;
  routeInfo: string | null;
}
