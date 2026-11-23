import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'ormobile.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  due_at INTEGER,
  reminder_at INTEGER,
  notification_id TEXT,
  calendar_event_id TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  linked_id TEXT,
  session_id TEXT,
  route_info TEXT
);

CREATE TABLE IF NOT EXISTS memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  body TEXT NOT NULL,
  original TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_summaries (
  day TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  model TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, reminder_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_day ON diary_entries(day, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_activity ON task_activity(task_id, created_at DESC);
`;

let db: SQLite.SQLiteDatabase | null = null;

/**
 * On web the SQLite worker loads asynchronously. Awaiting openDatabaseAsync
 * once lets every later synchronous call use the same loaded worker.
 */
export async function initializeDatabase(): Promise<void> {
  if (Platform.OS === 'web' || db) return;
  db = SQLite.openDatabaseSync(DATABASE_NAME);
  db.execSync(SCHEMA);
  migrate(db);
}

function migrate(db: SQLite.SQLiteDatabase): void {
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(messages)');
  if (!columns.some((column) => column.name === 'session_id')) {
    db.execSync('ALTER TABLE messages ADD COLUMN session_id TEXT');
    const now = Date.now();
    db.runSync(
      `INSERT OR IGNORE INTO chat_sessions (id, title, pinned, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      'legacy',
      'Previous chat',
      now,
      now,
    );
    db.execSync("UPDATE messages SET session_id = 'legacy' WHERE session_id IS NULL");
  }
  const messageColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(messages)');
  if (!messageColumns.some((column) => column.name === 'route_info')) {
    db.execSync('ALTER TABLE messages ADD COLUMN route_info TEXT');
  }
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DATABASE_NAME);
    db.execSync(SCHEMA);
    migrate(db);
  }
  return db;
}

export function closeDb(): void {
  db?.closeSync();
  db = null;
}
