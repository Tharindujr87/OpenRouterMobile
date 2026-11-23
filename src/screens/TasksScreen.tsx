import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePickerModal from '../components/DateTimePickerModal';
import { getTaskActivity, getTasks } from '../db/repository';
import {
  addTaskNote,
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskWithNote,
} from '../lib/actions';
import { formatWhen, isOverdue } from '../lib/dates';
import { STATUS_LABEL, viewStatus, type TaskViewStatus } from '../lib/taskStatus';
import type { Task, TaskActivity } from '../lib/types';
import { colors, radius, spacing } from '../theme';
import {
  Body,
  Card,
  EmptyState,
  Muted,
  ReadButton,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SmallButton,
  Tag,
  inputStyle,
} from '../components/ui';

interface Props {
  refreshKey: number;
  bump: () => void;
  navigate: (screen: 'capture', prefill?: string) => void;
}

type Dialog = 'detail' | 'note' | 'edit' | 'complete' | 'delete' | null;
const FILTERS: TaskViewStatus[] = ['open', 'due', 'completed'];

function taskMeta(task: Task): string[] {
  const parts: string[] = [];
  if (task.dueAt !== null) parts.push(`Due ${formatWhen(task.dueAt)}`);
  if (task.reminderAt !== null) parts.push(`Remind ${formatWhen(task.reminderAt)}`);
  return parts;
}

function latestNote(taskId: string): string | null {
  const items = getTaskActivity(taskId).filter((item) => item.kind !== 'created');
  return items.length ? items[items.length - 1].text : null;
}

function DateField({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.dateField}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.dateButton}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Body>{value !== null ? formatWhen(value) : 'Not set'}</Body>
      </Pressable>
      <View style={styles.rowWrap}>
        {value !== null ? <SmallButton title="Clear" onPress={onClear} /> : null}
      </View>
      <DateTimePickerModal
        visible={open}
        value={value}
        mode="datetime"
        onSelect={(next) => {
          onChange(next);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

export default function TasksScreen({ refreshKey, bump, navigate }: Props) {
  const [filter, setFilter] = useState<TaskViewStatus>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState<number | null>(null);
  const [editReminder, setEditReminder] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const all = getTasks();
  const now = Date.now();
  const tasks = all.filter((task) => viewStatus(task, new Date(now)) === filter);
  const selected = all.find((task) => task.id === selectedId) ?? null;
  const activity: TaskActivity[] = selected ? getTaskActivity(selected.id) : [];

  function openDialog(next: Dialog, task?: Task) {
    if (task) {
      setSelectedId(task.id);
      setEditTitle(task.title);
      setEditDue(task.dueAt);
      setEditReminder(task.reminderAt);
    }
    setNote('');
    setDialog(next);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setDialog(null);
      bump();
    } finally {
      setBusy(false);
    }
  }

  function toneFor(status: TaskViewStatus): 'accent' | 'warn' | 'normal' {
    return status === 'completed' ? 'accent' : status === 'due' ? 'warn' : 'normal';
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Tasks"
          subtitle={`${all.filter((task) => viewStatus(task, new Date(now)) === 'open').length} open · ${
            all.filter((task) => viewStatus(task, new Date(now)) === 'due').length
          } due`}
          action={<SmallButton title="New" tone="accent" onPress={() => navigate('capture', 'add task ')} />}
        />
      }
    >
      <View style={styles.segment}>
        {FILTERS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === value }}
            style={[styles.segmentButton, filter === value && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, filter === value && styles.segmentTextActive]}>
              {STATUS_LABEL[value]}
            </Text>
          </Pressable>
        ))}
      </View>

      {tasks.length === 0 ? (
        <EmptyState>No {STATUS_LABEL[filter].toLowerCase()} tasks.</EmptyState>
      ) : (
        tasks.map((task) => {
          const status = viewStatus(task, new Date(now));
          return (
            <Card key={task.id}>
              <View style={styles.itemRow}>
                {status === 'completed' ? (
                  <Pressable
                    onPress={() => run(() => reopenTaskAction(task))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: true }}
                    style={[styles.checkbox, styles.checkboxOn]}
                  >
                    <Text style={styles.checkMark}>✓</Text>
                  </Pressable>
                ) : (
                  <SmallButton title="✓" onPress={() => openDialog('complete', task)} />
                )}
                <Pressable
                  style={{ flex: 1 }}
                  accessibilityRole="button"
                  onPress={() => openDialog('detail', task)}
                >
                  <Body>{task.title}</Body>
                  <Muted>{taskMeta(task).join(' · ') || 'No dates'}</Muted>
                </Pressable>
                <Tag tone={toneFor(status)}>{STATUS_LABEL[status].toUpperCase()}</Tag>
              </View>
              {status === 'completed' ? null : (() => {
                const preview = latestNote(task.id);
                return preview ? (
                  <Text style={styles.notePreview} numberOfLines={2}>
                    Note: {preview}
                  </Text>
                ) : null;
              })()}
              {task.dueAt !== null && isOverdue(task.dueAt, new Date(now)) && status !== 'completed' ? (
                <Tag tone="danger">OVERDUE</Tag>
              ) : null}
            </Card>
          );
        })
      )}

      {selected && dialog === 'detail' ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setDialog(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDialog(null)}>
            <Pressable style={styles.modal} onPress={() => {}}>
              <View style={styles.rowBetween}>
                <Tag tone={toneFor(viewStatus(selected, new Date(now)))}>
                  {STATUS_LABEL[viewStatus(selected, new Date(now))].toUpperCase()}
                </Tag>
                {selected.notificationId ? <Tag tone="accent">REMINDER ON</Tag> : null}
              </View>
              <Text style={styles.modalTitle}>{selected.title}</Text>
              <Muted>{taskMeta(selected).join(' · ') || 'No dates'}</Muted>

              <Text style={styles.sectionLabel}>ACTIVITY</Text>
              {activity.length === 0 ? <Muted>No activity yet.</Muted> : null}
              {activity.map((item) => (
                <View key={item.id} style={styles.activityRow}>
                  <Muted>{new Date(item.createdAt).toLocaleString()}</Muted>
                  <Body>{item.text}</Body>
                </View>
              ))}

              <View style={styles.rowWrap}>
                <ReadButton text={selected.title} />
                <SmallButton title="Add note" tone="accent" onPress={() => openDialog('note')} />
                <SmallButton title="Edit" onPress={() => openDialog('edit')} />
                <SmallButton
                  title={selected.status === 'done' ? 'Reopen' : 'Complete'}
                  tone="accent"
                  onPress={() => openDialog('complete')}
                />
                <SmallButton title="Delete" tone="danger" onPress={() => openDialog('delete')} />
                <SecondaryButton title="Close" onPress={() => setDialog(null)} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {selected && dialog !== null && dialog !== 'detail' ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setDialog(null)}>
          <Pressable style={styles.backdrop} onPress={() => setDialog(null)}>
            <Pressable style={styles.modal} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {dialog === 'note'
                  ? 'Add a note'
                  : dialog === 'edit'
                    ? 'Update task'
                    : dialog === 'complete'
                      ? selected.status === 'done' ? 'Reopen task' : 'Complete task'
                      : 'Delete task'}
              </Text>

              {dialog === 'edit' ? (
                <>
                  <TextInput style={inputStyle} value={editTitle} onChangeText={setEditTitle} />
                  <DateField label="Due" value={editDue} onChange={setEditDue} onClear={() => setEditDue(null)} />
                  <DateField
                    label="Reminder"
                    value={editReminder}
                    onChange={setEditReminder}
                    onClear={() => setEditReminder(null)}
                  />
                </>
              ) : null}

              {dialog !== 'delete' ? (
                <>
                  <Text style={styles.fieldLabel}>
                    {dialog === 'complete' ? 'Completion note (optional)' : 'Note (optional)'}
                  </Text>
                  <TextInput
                    style={[inputStyle, styles.noteInput]}
                    value={note}
                    onChangeText={setNote}
                    placeholder="What happened, or what still needs doing"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </>
              ) : (
                <Muted>This removes the task. You can leave a short reason below.</Muted>
              )}
              {dialog === 'delete' ? (
                <TextInput
                  style={inputStyle}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Reason (optional)"
                  placeholderTextColor={colors.muted}
                />
              ) : null}

              <View style={styles.rowWrap}>
                {busy ? <ActivityIndicator color={colors.accent} /> : null}
                <PrimaryAction
                  label={
                    dialog === 'note'
                      ? 'Save note'
                      : dialog === 'edit'
                        ? 'Save changes'
                        : dialog === 'complete'
                          ? selected.status === 'done' ? 'Reopen' : 'Complete'
                          : 'Delete'
                  }
                  danger={dialog === 'delete'}
                  disabled={busy}
                  onPress={() => {
                    if (dialog === 'note') {
                      addTaskNote(selected.id, note);
                      setDialog(null);
                      bump();
                    } else if (dialog === 'edit') {
                      updateTaskWithNote(
                        selected.id,
                        { title: editTitle.trim() || selected.title, dueAt: editDue, reminderAt: editReminder },
                        note,
                      );
                      setDialog(null);
                      bump();
                    } else if (dialog === 'complete') {
                      const task = selected;
                      void run(() =>
                        task.status === 'done'
                          ? reopenTaskAction(task, note)
                          : completeTaskAction(task, note),
                      );
                    } else if (dialog === 'delete') {
                      void run(() => deleteTaskAction(selected, note));
                    }
                  }}
                />
                <SecondaryButton title="Cancel" onPress={() => setDialog(null)} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  );
}

function PrimaryAction({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primary,
        danger && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, marginBottom: spacing.md },
  segmentButton: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surfaceAlt },
  segmentText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: colors.text },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  notePreview: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.accent },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#06211F', fontWeight: '800', fontSize: 15 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: spacing.md, marginBottom: spacing.sm },
  activityRow: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.md },
  modal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, maxHeight: '85%' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: spacing.sm, marginBottom: 4 },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  dateField: { marginTop: spacing.sm },
  dateButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm },
  primary: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  danger: { borderWidth: 1, borderColor: colors.danger, backgroundColor: 'transparent' },
  primaryText: { color: '#06211F', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
