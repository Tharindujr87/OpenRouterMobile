import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DiaryCalendar from '../components/DiaryCalendar';
import {
  deleteDiaryEntry,
  deleteDiarySummary,
  getDiaryEntries,
  getDiarySummary,
  getMeta,
  insertDiaryEntry,
  saveDiarySummary,
  updateDiaryEntry,
} from '../db/repository';
import { DEFAULT_BASE_URL } from '../lib/ai';
import {
  basicCleanup,
  cleanDiaryEntry,
  deterministicDaySummary,
  diaryQuery,
  displayDay,
  formatDiaryAnswer,
  generateDaySummary,
  localDay,
} from '../lib/diary';
import { searchDiary } from '../lib/diarySearch';
import { colors, radius, spacing } from '../theme';
import {
  Card,
  Muted,
  ReadButton,
  Screen,
  ScreenHeader,
  SmallButton,
  Tag,
} from '../components/ui';

interface Props {
  refreshKey: number;
  bump: () => void;
}

interface DiaryTurn {
  id: string;
  role: 'user' | 'assistant';
  body: string;
}

export default function DiaryScreen({ refreshKey, bump }: Props) {
  const [day, setDay] = useState(localDay());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<DiaryTurn[]>([]);
  const [saving, setSaving] = useState(false);
  const [followUp, setFollowUp] = useState<{ entryId: string; questions: string[] } | null>(null);

  const entries = getDiaryEntries(day);

  useEffect(() => {
    const saved = getDiarySummary(day);
    setSummary(saved?.content ?? deterministicDaySummary(day, getDiaryEntries(day)));
    setExpanded(null);
  }, [day, refreshKey]);

  function addTurn(role: DiaryTurn['role'], body: string) {
    setChatLog((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, role, body },
    ]);
  }

  function modelKey(): string {
    return getMeta('aiMode') === 'free' ? 'free.autoModel' : 'pro.autoModel';
  }

  async function refreshSummary() {
    setGenerating(true);
    const text = await generateDaySummary(
      day,
      entries,
      {
        apiKey: getMeta('openRouterApiKey', ''),
        baseUrl: getMeta('openRouterBaseUrl', DEFAULT_BASE_URL),
      },
      getMeta(modelKey(), 'tencent/hy4-flash'),
    );
    setSummary(text);
    saveDiarySummary(day, text, 'auto');
    setGenerating(false);
    bump();
  }

  function answerFollowUp(entryId: string, answer: string) {
    const entry = getDiaryEntries().find((item) => item.id === entryId);
    if (!entry) return;
    updateDiaryEntry(entryId, { body: `${entry.body}\n\nDetails: ${answer}` });
    deleteDiarySummary(entry.day);
    setFollowUp(null);
    addTurn('assistant', 'Added those details to the entry.');
    bump();
  }

  async function submit() {
    const value = chatInput.trim();
    if (!value || saving) return;
    setChatInput('');
    addTurn('user', value);

    if (followUp) {
      answerFollowUp(followUp.entryId, value);
      return;
    }

    const looksLikeQuestion =
      /\?$/.test(value) ||
      /^(what|which|when|where|who|how|did|do|does|is|are|tell)\b/i.test(value);

    if (looksLikeQuestion) {
      const terms =
        diaryQuery(value) ??
        value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
          .split(/\s+/)
          .filter((word) => word.length >= 3);
      const found = searchDiary(terms.length ? terms : [value]);
      addTurn('assistant', formatDiaryAnswer(terms, found));
      return;
    }

    setSaving(true);
    const settings = {
      apiKey: getMeta('openRouterApiKey', ''),
      baseUrl: getMeta('openRouterBaseUrl', DEFAULT_BASE_URL),
    };
    const cleaned = settings.apiKey
      ? await cleanDiaryEntry(value, settings, getMeta(modelKey(), 'tencent/hy4-flash'))
      : basicCleanup(value);
    const entry = insertDiaryEntry({
      ...cleaned,
      day,
      body: cleaned.body.trim(),
      summary: cleaned.summary.trim() || cleaned.body.trim().slice(0, 100),
    });
    deleteDiarySummary(day);
    setSummary(deterministicDaySummary(day, getDiaryEntries(day)));
    addTurn(
      'assistant',
      `Saved to diary for ${displayDay(day)}:\n${entry.summary}${
        entry.tags.length ? `\n${entry.tags.join(', ')}` : ''
      }${
        cleaned.questions.length
          ? `\n\nA few details would help (optional):\n${cleaned.questions.map((q) => `• ${q}`).join('\n')}`
          : ''
      }`,
    );
    setFollowUp(cleaned.questions.length ? { entryId: entry.id, questions: cleaned.questions } : null);
    setSaving(false);
    bump();
  }

  return (
    <View style={styles.root}>
      <Screen
        header={
          <ScreenHeader
            title="Diary"
            subtitle={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} on this day`}
          />
        }
      >
        {chatLog.length ? (
          <Card>
            <Text style={styles.sectionLabel}>DIARY CHAT</Text>
            {chatLog.map((turn) => (
              <View
                key={turn.id}
                style={turn.role === 'user' ? styles.userTurn : styles.assistantTurn}
              >
                <Muted>{turn.role === 'user' ? 'YOU' : 'ORM'}</Muted>
                <Text style={styles.turnText}>{turn.body}</Text>
                {turn.role === 'assistant' ? <ReadButton text={turn.body} /> : null}
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            style={styles.dateButton}
          >
            <Text style={styles.dayLabel}>{displayDay(day)}</Text>
            <Tag tone="accent">CHANGE DATE</Tag>
          </Pressable>
          <View style={styles.dayRow}>
            <SmallButton title="Today" onPress={() => setDay(localDay())} />
          </View>
        </Card>

        {summary ? (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>DAY SUMMARY</Text>
              {generating ? <ActivityIndicator color={colors.accent} size="small" /> : null}
            </View>
            <Text style={styles.summaryText}>{summary}</Text>
            <View style={styles.rowWrap}>
              <ReadButton text={summary} />
              <SmallButton
                title="Regenerate"
                onPress={() => {
                  if (!generating) void refreshSummary();
                }}
              />
              <SmallButton
                title="Use offline summary"
                onPress={() => {
                  const text = deterministicDaySummary(day, entries);
                  setSummary(text);
                  saveDiarySummary(day, text, 'offline');
                  bump();
                }}
              />
              <SmallButton
                title="Clear summary"
                onPress={() => {
                  deleteDiarySummary(day);
                  setSummary(deterministicDaySummary(day, entries));
                  bump();
                }}
              />
            </View>
          </Card>
        ) : null}

        <Text style={styles.sectionLabel}>ENTRIES · TAP TO EXPAND</Text>
        {entries.length === 0 ? (
          <Card>
            <Muted>Nothing recorded on this day. Type a short note below.</Muted>
          </Card>
        ) : (
          entries.map((entry, index) => (
            <Card key={entry.id}>
              <Pressable onPress={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                <Text style={styles.entryLine}>
                  {index + 1}. {entry.summary || entry.body.slice(0, 100)}
                </Text>
                <Muted>
                  {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {entry.tags.length ? ` · ${entry.tags.join(', ')}` : ''}
                </Muted>
              </Pressable>
              {expanded === entry.id ? (
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>CLEANED ENTRY</Text>
                  <Text style={styles.detailText}>{entry.body}</Text>
                  <Text style={styles.detailLabel}>YOUR WORDS</Text>
                  <Text style={styles.detailOriginal}>{entry.original}</Text>
                  <View style={styles.rowWrap}>
                    <ReadButton text={entry.body} />
                    <SmallButton
                      title="Delete"
                      tone="danger"
                      onPress={() => {
                        deleteDiaryEntry(entry.id);
                        deleteDiarySummary(day);
                        setExpanded(null);
                        bump();
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          ))
        )}
      </Screen>

      {followUp ? (
        <View style={styles.followUpBar}>
          <Muted>Your next message adds details to the last entry.</Muted>
          <SmallButton title="Skip" onPress={() => setFollowUp(null)} />
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={chatInput}
          onChangeText={setChatInput}
          placeholder={
            followUp ? 'e.g. At Joe’s house, around 2 pm' : 'Write a diary note or ask a question…'
          }
          placeholderTextColor={colors.muted}
          multiline
          onSubmitEditing={() => void submit()}
        />
        <Pressable
          onPress={() => void submit()}
          accessibilityRole="button"
          style={[styles.send, (!chatInput.trim() || saving) && styles.sendDisabled]}
        >
          {saving ? (
            <ActivityIndicator color="#06211F" size="small" />
          ) : (
            <Text style={styles.sendText}>↑</Text>
          )}
        </Pressable>
      </View>
      <Muted>Notes save to the selected day. Questions search your diary.</Muted>

      {pickerOpen ? (
        <DiaryCalendar
          day={day}
          onSelect={(next) => {
            setDay(next);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  followUpBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  userTurn: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: spacing.sm, marginBottom: spacing.sm },
  assistantTurn: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.sm, marginBottom: spacing.sm },
  turnText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  dayLabel: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  dayInput: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm },
  summaryText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  entryLine: { color: colors.text, fontSize: 15, lineHeight: 21 },
  detail: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  detailLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: spacing.sm },
  detailText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  detailOriginal: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxHeight: 120,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#06211F', fontSize: 22, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.md },
  pickerCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  pickerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
