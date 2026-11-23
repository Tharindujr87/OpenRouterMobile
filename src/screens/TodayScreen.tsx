import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getNotes, getTasks } from '../db/repository';
import { formatWhen, isOverdue } from '../lib/dates';
import type { Task } from '../lib/types';
import type { PermissionResult } from '../lib/notifications';
import { colors, radius, spacing } from '../theme';
import {
  Body,
  Card,
  EmptyState,
  Muted,
  PrimaryButton,
  ReadButton,
  Screen,
  ScreenHeader,
  SectionTitle,
  SecondaryButton,
  Tag,
} from '../components/ui';

interface Props {
  refreshKey: number;
  permission: PermissionResult | null;
  navigate: (screen: 'capture' | 'settings', prefill?: string) => void;
  bump: () => void;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export default function TodayScreen({ refreshKey, permission, navigate }: Props) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const now = Date.now();
  const tasks = getTasks();
  const open = tasks.filter((task) => task.status === 'open');
  const upcoming = open
    .filter((task) => task.reminderAt !== null && task.reminderAt > now)
    .sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0))
    .slice(0, 6);
  const dueToday = open.filter(
    (task) => task.dueAt !== null && startOfDay(task.dueAt) === startOfDay(now),
  );
  const completedToday = tasks.filter(
    (task) => task.status === 'done' && task.completedAt !== null && startOfDay(task.completedAt) === startOfDay(now),
  );
  const untimed = open.filter((task) => task.reminderAt === null && task.dueAt === null);
  const notes = getNotes().slice(0, 4);

  const tomorrowStart = startOfDay(now) + 86_400_000;
  const tomorrowEnd = tomorrowStart + 86_400_000;
  const tomorrow = open.filter((task) => {
    const time = task.dueAt ?? task.reminderAt;
    return time !== null && time >= tomorrowStart && time < tomorrowEnd;
  });

  const reviewLines = [
    `Daily review · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`,
    '',
    `Completed today: ${completedToday.length}${completedToday.length ? ` — ${completedToday.map((t) => t.title).join(', ')}` : ''}`,
    `Still open: ${open.length}`,
    `Overdue: ${open.filter((task) => isOverdue(task.dueAt, new Date(now))).length}`,
    '',
    'Next up:',
    ...(upcoming.length
      ? upcoming.map((task) => `- ${formatWhen(task.reminderAt, new Date(now))} — ${task.title}`)
      : ['- Nothing scheduled']),
    '',
    'Tomorrow:',
    ...(tomorrow.length ? tomorrow.map((task) => `- ${task.title}`) : ['- Nothing due']),
  ];
  const reviewText = reviewLines.join('\n');

  return (
    <Screen
      header={
        <ScreenHeader
          title="Today"
          subtitle={new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          action={
            <Pressable
              onPress={() => navigate('capture')}
              accessibilityRole="button"
              style={styles.captureButton}
            >
              <Text style={styles.captureText}>+</Text>
            </Pressable>
          }
        />
      }
    >
      {permission && !permission.granted && permission.available ? (
        <Card tone="warn">
          <Body>Notifications are off. Reminders will not appear until you allow them.</Body>
          <View style={styles.row}>
            <SecondaryButton title="Open settings" onPress={() => navigate('settings')} />
          </View>
        </Card>
      ) : null}

      <Card tone="accent">
        <Body style={styles.big}>{open.length} open task{open.length === 1 ? '' : 's'}</Body>
        <Muted>Capture anything with the + button. Review before it is saved.</Muted>
        <View style={styles.row}>
          <PrimaryButton title="Capture" onPress={() => navigate('capture')} />
          <SecondaryButton title="Review day" onPress={() => setReviewOpen(true)} />
        </View>
      </Card>

      <SectionTitle>Next up</SectionTitle>
      {upcoming.length === 0 ? (
        <EmptyState>Nothing scheduled with a reminder.</EmptyState>
      ) : (
        upcoming.map((task) => <TaskLine key={task.id} task={task} now={now} />)
      )}

      <SectionTitle>Due today</SectionTitle>
      {dueToday.length === 0 ? (
        <EmptyState>Nothing due today.</EmptyState>
      ) : (
        dueToday.map((task) => <TaskLine key={task.id} task={task} now={now} />)
      )}

      <SectionTitle>No dates</SectionTitle>
      {untimed.length === 0 ? (
        <EmptyState>Every open task has a date or reminder.</EmptyState>
      ) : (
        untimed.slice(0, 5).map((task) => <TaskLine key={task.id} task={task} now={now} />)
      )}

      <SectionTitle>Recent notes</SectionTitle>
      {notes.length === 0 ? (
        <EmptyState>No notes yet.</EmptyState>
      ) : (
        notes.map((note) => (
          <Card key={note.id}>
            <Body>{note.body}</Body>
            <View style={styles.row}>
              <Muted>{new Date(note.updatedAt).toLocaleString()}</Muted>
              <ReadButton text={note.body} />
            </View>
          </Card>
        ))
      )}

      <Modal transparent animationType="fade" visible={reviewOpen} onRequestClose={() => setReviewOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setReviewOpen(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>Daily review</Text>
            <Body>{reviewText}</Body>
            <View style={styles.row}>
              <ReadButton text={reviewText} />
              <SecondaryButton title="Close" onPress={() => setReviewOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function TaskLine({ task, now }: { task: Task; now: number }) {
  const overdue = isOverdue(task.dueAt, new Date(now));
  return (
    <Card>
      <Body>{task.title}</Body>
      <View style={styles.row}>
        <Muted>
          {task.reminderAt ? `Remind ${formatWhen(task.reminderAt, new Date(now))}` : ''}
          {task.dueAt ? ` · Due ${formatWhen(task.dueAt, new Date(now))}` : ''}
          {!task.reminderAt && !task.dueAt ? 'No dates' : ''}
        </Muted>
        {overdue ? <Tag tone="danger">OVERDUE</Tag> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  captureButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  captureText: { fontSize: 26, fontWeight: '700', color: '#06211F', lineHeight: 30 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.md },
  modal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, maxHeight: '80%' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
});
