import { Platform } from 'react-native';
import * as native from './nativeRepository';
import * as web from './webRepository';

/**
 * The phone uses SQLite. The browser preview uses a localStorage adapter
 * because expo-sqlite's synchronous API needs cross-origin isolation on web.
 */
const impl = Platform.OS === 'web' ? web : native;

export const uid = impl.uid;
export const getNotes = impl.getNotes;
export const searchNotes = impl.searchNotes;
export const insertNote = impl.insertNote;
export const updateNote = impl.updateNote;
export const deleteNote = impl.deleteNote;
export const getTasks = impl.getTasks;
export const getTask = impl.getTask;
export const insertTask = impl.insertTask;
export const updateTask = impl.updateTask;
export const deleteTask = impl.deleteTask;
export const getMessages = impl.getMessages;
export const insertMessage = impl.insertMessage;
export const clearMessages = impl.clearMessages;
export const updateMessage = impl.updateMessage;
export const deleteMessage = impl.deleteMessage;
export const getMeta = impl.getMeta;
export const setMeta = impl.setMeta;
export const getMemory = impl.getMemory;
export const setMemory = impl.setMemory;
export const deleteMemory = impl.deleteMemory;
export const getSessions = impl.getSessions;
export const getSession = impl.getSession;
export const insertSession = impl.insertSession;
export const updateSession = impl.updateSession;
export const deleteSession = impl.deleteSession;
export const getDiaryEntries = impl.getDiaryEntries;
export const searchDiaryEntries = impl.searchDiaryEntries;
export const insertDiaryEntry = impl.insertDiaryEntry;
export const updateDiaryEntry = impl.updateDiaryEntry;
export const deleteDiaryEntry = impl.deleteDiaryEntry;
export const getDiarySummary = impl.getDiarySummary;
export const saveDiarySummary = impl.saveDiarySummary;
export const deleteDiarySummary = impl.deleteDiarySummary;
export const getTaskActivity = impl.getTaskActivity;
export const insertTaskActivity = impl.insertTaskActivity;
export const deleteTaskActivity = impl.deleteTaskActivity;
export const getAllTaskActivity = impl.getAllTaskActivity;
export const getAllDiarySummaries = impl.getAllDiarySummaries;
export const getAllMeta = impl.getAllMeta;
export const applySnapshot = impl.applySnapshot;

export type { NewTask, TaskPatch } from './nativeRepository';
