import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePickerModal from '../components/DateTimePickerModal';
import { getMessages } from '../db/repository';
import { saveDraft } from '../lib/actions';
import { flipMeridiem, formatWhen, shiftTime } from '../lib/dates';
import { parseCapture } from '../lib/parse';
import type { CaptureKind, ParsedCapture } from '../lib/types';
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
  SecondaryButton,
  SmallButton,
  Tag,
  inputStyle,
} from '../components/ui';

interface Props {
  prefill: string;
  refreshKey: number;
  bump: () => void;
}

type TimeTarget = 'reminder' | 'due' | null;

function kindLabel(kind: CaptureKind): string {
  if (kind === 'note') return 'NOTE';
  if (kind === 'task') return 'TASK';
  if (kind === 'reminder') return 'REMINDER';
  return 'NOT RECOGNISED';
}

function kindTone(kind: CaptureKind): 'accent' | 'normal' | 'warn' | 'danger' {
  if (kind === 'note') return 'accent';
  if (kind === 'task') return 'normal';
  if (kind === 'reminder') return 'warn';
  return 'danger';
}

export default function CaptureScreen({ prefill, refreshKey, bump }: Props) {
  const [text, setText] = useState(prefill);
  const [draft, setDraft] = useState<ParsedCapture | null>(null);
  const [title, setTitle] = useState('');
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<TimeTarget>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (prefill) setText(prefill);
  }, [prefill]);

  const messages = getMessages(undefined, 60);

  function handleParse() {
    const value = text.trim();
    if (!value) return;
    const parsed = parseCapture(value);
    setDraft(parsed);
    setTitle(parsed.title || value);
    setReminderAt(parsed.reminderAt);
    setDueAt(parsed.dueAt);
    setAddToCalendar(false);
    setStatus('');
  }

  function chooseKind(kind: 'note' | 'task' | 'reminder') {
    if (!draft) return;
    const updated: ParsedCapture = { ...draft, kind };
    setDraft(updated);
    setTitle(title || text.trim());
  }

  async function handleSave() {
    if (!draft || !title.trim() || saving) return;
    setSaving(true);
    try {
      const result = await saveDraft({
        kind: draft.kind as 'note' | 'task' | 'reminder',
        title: title.trim(),
        body: draft.kind === 'note' ? title.trim() : text.trim(),
        originalText: text.trim(),
        reminderAt: draft.kind === 'reminder' ? reminderAt : null,
        dueAt: draft.kind === 'note' ? null : dueAt,
        addToCalendar,
      });
      const notes = [
        result.notificationScheduled ? 'reminder scheduled' : null,
        result.calendarAdded ? 'calendar entry added' : null,
        ...result.warnings,
      ].filter(Boolean);
      setStatus(notes.length ? notes.join(' · ') : 'Saved.');
      setText('');
      setDraft(null);
      setReminderAt(null);
      setDueAt(null);
      bump();
    } catch (error) {
      setStatus(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Capture"
          subtitle="Type naturally. Review before anything is saved."
        />
      }
    >
      <Card>
        <TextInput
          style={[inputStyle, styles.input]}
          value={text}
          onChangeText={setText}
          placeholder="Note: ask about pricing  ·  add task order filters  ·  remind me tomorrow at 9 to call"
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={4}
          onSubmitEditing={handleParse}
        />
        <View style={styles.row}>
          <Muted>Tip: use your phone keyboard mic to dictate.</Muted>
          <PrimaryButton title="Review" onPress={handleParse} disabled={!text.trim()} />
        </View>
      </Card>

      {status ? <Muted>{status}</Muted> : null}

      {draft ? (
        <Card tone={draft.kind === 'unknown' ? 'warn' : 'normal'}>
          <View style={styles.row}>
            <Tag tone={kindTone(draft.kind)}>{kindLabel(draft.kind)}</Tag>
            {draft.ambiguousTime ? <Tag tone="warn">CHECK TIME</Tag> : null}
          </View>

          {draft.kind === 'unknown' ? (
            <>
              <Body style={styles.spaced}>{draft.hints.join(' ')}</Body>
              <View style={styles.rowWrap}>
                <SmallButton title="Save as note" onPress={() => chooseKind('note')} />
                <SmallButton title="Save as task" onPress={() => chooseKind('task')} />
                <SmallButton title="Set reminder" onPress={() => chooseKind('reminder')} />
              </View>
            </>
          ) : null}

          <Text style={styles.label}>{draft.kind === 'note' ? 'Note' : 'Title'}</Text>
          <TextInput
            style={inputStyle}
            value={title}
            onChangeText={setTitle}
            placeholder="What should this be called?"
            placeholderTextColor={colors.muted}
          />

          {draft.kind !== 'note' && draft.kind !== 'unknown' ? (
            <>
              <TimeRow
                label="Reminder"
                timestamp={reminderAt}
                canEdit={draft.kind === 'reminder'}
                onEdit={() => setPickerTarget('reminder')}
                onFlip={
                  reminderAt && draft.ambiguousTime
                    ? () => setReminderAt(flipMeridiem(reminderAt))
                    : undefined
                }
                onShift={(minutes) =>
                  setReminderAt(reminderAt ? shiftTime(reminderAt, minutes) : null)
                }
                onClear={() => setReminderAt(null)}
              />
              <TimeRow
                label="Due"
                timestamp={dueAt}
                canEdit
                onEdit={() => setPickerTarget('due')}
                onShift={(minutes) => setDueAt(dueAt ? shiftTime(dueAt, minutes) : null)}
                onClear={() => setDueAt(null)}
              />

              {reminderAt ? (
                <Pressable
                  onPress={() => setAddToCalendar(!addToCalendar)}
                  style={styles.checkRow}
                >
                  <View style={[styles.checkbox, addToCalendar && styles.checkboxOn]}>
                    {addToCalendar ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Body>Also add to my calendar</Body>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {draft.hints.length ? <Muted>{draft.hints.join(' ')}</Muted> : null}

          <View style={styles.row}>
            <SecondaryButton title="Discard" onPress={() => setDraft(null)} />
            <PrimaryButton
              title={saving ? 'Saving…' : 'Save'}
              onPress={handleSave}
              disabled={saving || !title.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : null}

      {pickerTarget ? (
        <DateTimePickerModal
          visible
          value={(pickerTarget === 'reminder' ? reminderAt : dueAt) ?? Date.now()}
          mode="datetime"
          onSelect={(next) => {
            if (pickerTarget === 'reminder') setReminderAt(next);
            else setDueAt(next);
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      ) : null}

      <Tag>RECENT</Tag>
      {messages.length === 0 ? (
        <EmptyState>Captured notes and tasks will appear here.</EmptyState>
      ) : (
        messages.map((message) => (
          <Card key={message.id}>
            <Muted>
              {message.role === 'user' ? 'YOU' : 'ORM'} ·{' '}
              {new Date(message.createdAt).toLocaleString()}
            </Muted>
            <Body>{message.body}</Body>
            <View style={styles.row}>
              <ReadButton text={message.body} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

function TimeRow({
  label,
  timestamp,
  canEdit,
  onEdit,
  onFlip,
  onShift,
  onClear,
}: {
  label: string;
  timestamp: number | null;
  canEdit: boolean;
  onEdit: () => void;
  onFlip?: () => void;
  onShift: (minutes: number) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.timeBlock}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Body>{formatWhen(timestamp)}</Body>
      </View>
      {canEdit ? (
        <View style={styles.rowWrap}>
          <SmallButton title="Change" tone="accent" onPress={onEdit} />
          {onFlip ? <SmallButton title="AM / PM" tone="accent" onPress={onFlip} /> : null}
          <SmallButton title="+15m" onPress={() => onShift(15)} />
          <SmallButton title="+1h" onPress={() => onShift(60)} />
          <SmallButton title="Clear" onPress={onClear} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  spaced: { marginTop: spacing.sm },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.md },
  timeBlock: { marginBottom: spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#06211F', fontWeight: '800', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.md },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
