import { Platform } from 'react-native';
import {
  applySnapshot,
  getAllDiarySummaries,
  getAllMeta,
  getAllTaskActivity,
  getDiaryEntries,
  getMemory,
  getMessages,
  getNotes,
  getSessions,
  getTasks,
} from '../db/repository';
import { currentUserId, supabase } from './supabase';
import type { BackupSnapshot } from './types';

export function buildSnapshot(): BackupSnapshot {
  return {
    app: 'ORMobile',
    version: 2,
    exportedAt: new Date().toISOString(),
    notes: getNotes(),
    tasks: getTasks(),
    taskActivity: getAllTaskActivity(),
    sessions: getSessions(),
    messages: getMessages(undefined, 5000),
    diary: getDiaryEntries(),
    diarySummaries: getAllDiarySummaries(),
    meta: getAllMeta(),
    memory: getMemory(),
  };
}

export async function uploadBackup(): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.';
  const userId = await currentUserId();
  if (!userId) return 'Sign in before uploading a backup.';
  const { error } = await supabase.from('backups').upsert({
    user_id: userId,
    data: buildSnapshot(),
    device: Platform.OS,
    updated_at: new Date().toISOString(),
  });
  return error ? error.message : null;
}

export async function fetchBackup(): Promise<BackupSnapshot | null> {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('backups')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.data) return null;
  return data.data as BackupSnapshot;
}

export async function downloadAndRestore(): Promise<string | null> {
  const snapshot = await fetchBackup();
  if (!snapshot) return 'No cloud backup found.';
  if (snapshot.app !== 'ORMobile' || snapshot.version !== 2) return 'Backup format is not supported.';
  applySnapshot(snapshot);
  return null;
}
