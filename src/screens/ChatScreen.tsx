import React, { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import {
  getMemory,
  getMeta,
  getMessages,
  getSession,
  insertMessage,
  insertDiaryEntry,
  deleteMessage,
  setMeta,
  updateMessage,
  updateSession,
} from '../db/repository';
import { saveDraft } from '../lib/actions';
import {
  buildSystemPrompt,
  DEFAULT_BASE_URL,
  sendChatMessage,
  type AiSettings,
} from '../lib/ai';
import {
  extractActions,
  looksLikeMultiAction,
  type ProposedAction,
} from '../lib/actionProposals';
import { answerDateQuestion } from '../lib/dateAnswers';
import {
  cleanDiaryEntry,
  diaryQuery,
  displayDay,
  formatDiaryAnswer,
  type DiaryDraft,
} from '../lib/diary';
import { searchDiary } from '../lib/diarySearch';
import { accessToken, AI_FUNCTION_URL, supabaseConfigured } from '../lib/supabase';
import { formatWhen } from '../lib/dates';
import { parseCapture, resolveWhenText } from '../lib/parse';
import {
  AUTO,
  DIARY_RE,
  presetLabel,
  presetsForMode,
  modelMetaKey,
  routeTask,
  routingDefaults,
  type AiMode,
  type RouteDecision,
  type RoutingSettings,
} from '../lib/routing';
import { colors, radius, spacing } from '../theme';
import {
  Card,
  Muted,
  PrimaryButton,
  ReadButton,
  SecondaryButton,
  SmallButton,
  Tag,
} from '../components/ui';

interface Props {
  prefill?: string;
  sessionId: string;
  refreshKey: number;
  bump: () => void;
  onOpenDrawer: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

function readRoutingSettings(mode: AiMode): RoutingSettings {
  const defaults = routingDefaults(mode);
  return {
    autoModel: getMeta(modelMetaKey(mode, 'autoModel'), defaults.autoModel),
    strongModel: getMeta(modelMetaKey(mode, 'strongModel'), defaults.strongModel),
    imageModel: getMeta(modelMetaKey(mode, 'imageModel'), defaults.imageModel),
    documentModel: getMeta(modelMetaKey(mode, 'documentModel'), defaults.documentModel),
    videoModel: getMeta(modelMetaKey(mode, 'videoModel'), defaults.videoModel),
  };
}

function selectionKey(mode: AiMode): string {
  return `chatSelection.${mode}`;
}

function routeLabel(decision: RouteDecision): string {
  const model = decision.modelId ? presetLabel(decision.modelId) : 'no model';
  return `${decision.category} → ${model} · ${decision.reason}`;
}

export default function ChatScreen({
  sessionId,
  refreshKey,
  bump,
  onOpenDrawer,
  onNewSession,
  onOpenSettings,
  prefill = '',
}: Props) {
  const [input, setInput] = useState(prefill);
  const [mode, setMode] = useState<AiMode>(getMeta('aiMode') === 'free' ? 'free' : 'pro');
  const [selection, setSelection] = useState(getMeta(selectionKey(getMeta('aiMode') === 'free' ? 'free' : 'pro'), AUTO));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedAction[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const [cleaningDiary, setCleaningDiary] = useState(false);
  const [diaryDraft, setDiaryDraft] = useState<DiaryDraft | null>(null);
  const [diaryDetails, setDiaryDetails] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = getMessages(sessionId, 300);
  const session = getSession(sessionId);
  const routing = readRoutingSettings(mode);
  async function aiSettings(): Promise<AiSettings> {
    const token = supabaseConfigured ? await accessToken() : undefined;
    if (token && AI_FUNCTION_URL) {
      return { apiKey: '', baseUrl: AI_FUNCTION_URL, accessToken: token };
    }
    return {
      apiKey: getMeta('openRouterApiKey', ''),
      baseUrl: getMeta('openRouterBaseUrl', DEFAULT_BASE_URL),
    };
  }

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, streaming, refreshKey, proposal, diaryDraft, proposing, cleaningDiary]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copyAnswer(messageId: string, text: string) {
    await Clipboard.setStringAsync(text);
    setCopiedId(messageId);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
  }

  function updateProposal(index: number, patch: Partial<ProposedAction>) {
    setProposal((current) =>
      current ? current.map((action, i) => (i === index ? { ...action, ...patch } : action)) : current,
    );
  }

  function timesFor(action: ProposedAction): Pick<ProposedAction, 'reminderAt' | 'dueAt'> {
    const when = action.whenText.trim();
    const deadline = action.deadlineText.trim();
    if (action.kind === 'note') return { reminderAt: null, dueAt: null };
    if (action.kind === 'reminder') {
      return {
        reminderAt: when ? resolveWhenText(when) : null,
        dueAt: deadline ? resolveWhenText(deadline) : null,
      };
    }
    const dueText = deadline || when;
    return { reminderAt: null, dueAt: dueText ? resolveWhenText(dueText) : null };
  }

  function changeKind(index: number, kind: ProposedAction['kind']) {
    const current = proposal?.[index];
    if (!current) return;
    updateProposal(index, { kind, ...timesFor({ ...current, kind }) });
  }

  async function saveProposal() {
    if (!proposal) return;
    for (const action of proposal) {
      await saveDraft({
        kind: action.kind,
        title: action.title,
        body: action.title,
        originalText: action.title,
        reminderAt: action.reminderAt,
        dueAt: action.dueAt,
        addToCalendar: false,
        sessionId,
        assistantRouteInfo: 'proposed → saved after your review · dates resolved on device',
      });
    }
    setProposal(null);
    bump();
  }

  function saveDiaryDraft() {
    if (!diaryDraft || !diaryDraft.body.trim()) return;
    const details = diaryDetails.trim();
    const entry = insertDiaryEntry({
      day: diaryDraft.day,
      body: details ? `${diaryDraft.body.trim()}\n\nDetails: ${details}` : diaryDraft.body.trim(),
      original: diaryDraft.original,
      summary: diaryDraft.summary.trim() || diaryDraft.body.trim().slice(0, 100),
      tags: diaryDraft.tags,
    });
    insertMessage(
      'assistant',
      `Saved to diary for ${displayDay(entry.day)}: ${entry.summary}`,
      entry.id,
      sessionId,
      'diary → saved after your review',
    );
    setDiaryDraft(null);
    setDiaryDetails('');
    bump();
  }

  function updateDraft(patch: Partial<DiaryDraft>) {
    setDiaryDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function chooseModel(id: string) {
    setSelection(id);
    setMetaSelection(id);
    setPickerOpen(false);
  }

  function setMetaSelection(id: string) {
    setMeta(selectionKey(mode), id);
  }

  function switchMode(next: AiMode) {
    if (next === mode) return;
    setMode(next);
    setMeta('aiMode', next);
    setSelection(getMeta(selectionKey(next), AUTO));
    setProposal(null);
    bump();
  }

  function freshMessages() {
    return getMessages(sessionId, 300);
  }

  /** Local saves and date answers must not be replayed as new actions. */
  function isReplayable(index: number): boolean {
    const next = messages[index + 1];
    if (!next || next.role !== 'assistant') return true;
    return !/capture|local date helper|proposed/.test(next.routeInfo ?? '');
  }

  function assistantIdsAfter(userId: string): string[] {
    const all = freshMessages();
    const start = all.findIndex((message) => message.id === userId);
    if (start < 0) return [];
    const ids: string[] = [];
    for (let index = start + 1; index < all.length; index++) {
      if (all[index].role === 'user') break;
      ids.push(all[index].id);
    }
    return ids;
  }

  function retryUser(userId: string) {
    if (sending) return;
    assistantIdsAfter(userId).forEach(deleteMessage);
    bump();
    void send({ existingUserId: userId });
  }

  function retryAssistant(assistantId: string) {
    if (sending) return;
    const all = freshMessages();
    const index = all.findIndex((message) => message.id === assistantId);
    if (index < 0) return;
    for (let i = index; i < all.length; i++) {
      if (all[i].role === 'user') break;
      deleteMessage(all[i].id);
    }
    const previousUser = all.slice(0, index).reverse().find((message) => message.role === 'user');
    if (previousUser) void send({ existingUserId: previousUser.id });
    bump();
  }

  function startEdit(messageId: string, body: string) {
    setEditingId(messageId);
    setEditText(body);
  }

  function saveEdit(userId: string) {
    const next = editText.trim();
    if (!next) return;
    updateMessage(userId, next);
    setEditingId(null);
    assistantIdsAfter(userId).forEach(deleteMessage);
    void send({ existingUserId: userId });
    bump();
  }

  async function send(options?: { existingUserId?: string }) {
    const existingUserId = options?.existingUserId;
    const source = existingUserId
      ? freshMessages().find((message) => message.id === existingUserId)
      : null;
    const value = existingUserId ? source?.body.trim() ?? '' : input.trim();
    if (!value || sending) return;
    if (!existingUserId) setInput('');
    setError('');

    const sessionTitle = session?.title ?? 'New chat';
    if (sessionTitle === 'New chat') {
      updateSession(sessionId, { title: value.slice(0, 42) });
    }

    const decision = routeTask(value, selection, routing);
    const label = routeLabel(decision);
    const settings = await aiSettings();
    if (!existingUserId) insertMessage('user', value, null, sessionId);

    if (DIARY_RE.test(value)) {
      setCleaningDiary(true);
      const raw = value.replace(DIARY_RE, '').trim();
      const draft = await cleanDiaryEntry(raw, settings, decision.modelId);
      setDiaryDraft(draft);
      setCleaningDiary(false);
      bump();
      return;
    }

    const terms = diaryQuery(value);
    if (terms) {
      const found = searchDiary(terms);
      insertMessage(
        'assistant',
        formatDiaryAnswer(terms, found),
        null,
        sessionId,
        'local diary search · no model call',
      );
      bump();
      return;
    }

    const dateAnswer = answerDateQuestion(value);
    if (dateAnswer) {
      insertMessage(
        'assistant',
        dateAnswer,
        null,
        sessionId,
        'local date helper · answered from your device clock',
      );
      bump();
      return;
    }

    if (looksLikeMultiAction(value)) {
      setProposing(true);
      const actions = await extractActions(value, settings, decision.modelId);
      setProposal(actions);
      setProposing(false);
      bump();
      return;
    }

    if (decision.useLocalParser) {
      const parsed = parseCapture(value);
      if (parsed.kind === 'unknown') {
        insertMessage('assistant', parsed.hints.join(' '), null, sessionId, label);
      } else {
        await saveDraft({
          kind: parsed.kind as 'note' | 'task' | 'reminder',
          title: parsed.title || value,
          body: parsed.kind === 'note' ? parsed.body : value,
          originalText: value,
          reminderAt: parsed.kind === 'reminder' ? parsed.reminderAt : null,
          dueAt: parsed.kind === 'note' ? null : parsed.dueAt,
          addToCalendar: false,
          sessionId,
          assistantRouteInfo: label,
        });
      }
      bump();
      return;
    }

    if (decision.unavailable) {
      insertMessage('assistant', decision.reason, null, sessionId, label);
      bump();
      return;
    }

    if (!settings.accessToken && !settings.apiKey) {
      insertMessage(
        'assistant',
        'Sign in to cloud sync or add an OpenRouter API key in Settings. Note:, add task and remind me messages work right now without a model.',
        null,
        sessionId,
        label,
      );
      bump();
      return;
    }

    setSending(true);
    setStreaming('');
    const history = freshMessages().map((message) => ({
      role: message.role,
      content: message.body,
    }));
    try {
      const text = await sendChatMessage({
        settings,
        model: decision.modelId,
        messages: [
          { role: 'system', content: buildSystemPrompt(getMemory()) },
          ...history,
        ],
        onToken: (chunk) => setStreaming((previous) => previous + chunk),
      });
      insertMessage('assistant', text || '(empty response)', null, sessionId, label);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      setError(detail);
      insertMessage('assistant', `Could not complete the request. ${detail}`, null, sessionId, label);
    } finally {
      setSending(false);
      setStreaming('');
      bump();
    }
  }

  const pickerModels = [AUTO, ...presetsForMode(mode).map((preset) => preset.id)];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onOpenDrawer} accessibilityRole="button" style={styles.iconButton}>
          <Text style={styles.iconText}>☰</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {session?.title ?? 'New chat'}
          </Text>
          <Muted>{`${mode === 'free' ? 'Free' : 'Pro'} · ${presetLabel(selection === AUTO ? routing.autoModel : selection)}${selection === AUTO ? '' : ' · Manual'}`}</Muted>
        </View>
        <View style={styles.modeGroup}>
          <Pressable
            onPress={() => switchMode('free')}
            accessibilityRole="button"
            style={[styles.modeButton, mode === 'free' && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, mode === 'free' && styles.modeTextActive]}>Free</Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode('pro')}
            accessibilityRole="button"
            style={[styles.modeButton, mode === 'pro' && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, mode === 'pro' && styles.modeTextActive]}>Pro</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" style={styles.modelButton}>
          <Text style={styles.modelButtonText}>Model</Text>
        </Pressable>
        <Pressable onPress={onNewSession} accessibilityRole="button" style={styles.iconButton}>
          <Text style={styles.iconText}>＋</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 && !sending ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>What do you need?</Text>
            <Muted>
              Talk normally, or start with Diary:, Note:, add task, or remind me. Ask “what happened with Joe?” to search your diary.
            </Muted>
          </View>
        ) : null}

        {messages.map((message, index) =>
          message.role === 'user' ? (
            <View key={message.id} style={[styles.bubbleWrap, styles.userWrap]}>
              <View style={[styles.bubble, styles.userBubble]}>
                {editingId === message.id ? (
                  <>
                    <TextInput
                      style={styles.proposalInput}
                      value={editText}
                      onChangeText={setEditText}
                      multiline
                      autoFocus
                    />
                    <View style={styles.actionRow}>
                      <SmallButton title="Save" tone="accent" onPress={() => saveEdit(message.id)} />
                      <SmallButton title="Cancel" onPress={() => setEditingId(null)} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.bubbleText}>{message.body}</Text>
                    <View style={styles.actionRow}>
                      <SmallButton
                        title="Edit"
                        onPress={() => startEdit(message.id, message.body)}
                      />
                      <SmallButton
                        title="Copy"
                        onPress={() => void copyAnswer(message.id, message.body)}
                      />
                      {isReplayable(index) ? (
                        <SmallButton title="Retry" onPress={() => retryUser(message.id)} />
                      ) : null}
                      {copiedId === message.id ? <Tag tone="accent">COPIED</Tag> : null}
                    </View>
                  </>
                )}
              </View>
            </View>
          ) : (
            <View key={message.id} style={[styles.bubbleWrap, styles.assistantWrap]}>
              <View style={styles.answerCard}>
                <Text style={styles.bubbleText}>{message.body}</Text>
              </View>
              <View style={styles.metaBar}>
                {message.routeInfo ? (
                  <>
                    <Text style={styles.metaLabel}>DETAILS</Text>
                    <Muted>{message.routeInfo}</Muted>
                  </>
                ) : null}
                <View style={styles.actionRow}>
                  <SmallButton
                    title="Copy answer"
                    tone="accent"
                    onPress={() => void copyAnswer(message.id, message.body)}
                  />
                  <ReadButton text={message.body} />
                  {!/(capture|local date helper|proposed)/.test(message.routeInfo ?? '') ? (
                    <SmallButton title="Retry" onPress={() => retryAssistant(message.id)} />
                  ) : null}
                  {copiedId === message.id ? <Tag tone="accent">COPIED</Tag> : null}
                </View>
              </View>
            </View>
          ),
        )}

        {proposal ? (
          <Card tone="accent">
            <Text style={styles.proposalTitle}>Suggested actions</Text>
            <Muted>
              Edit anything before saving. Dates are resolved by your phone, not by the model.
            </Muted>
            {proposal.map((action, index) => (
              <View key={index} style={styles.proposalRow}>
                <TextInput
                  style={styles.proposalInput}
                  value={action.title}
                  onChangeText={(text) => updateProposal(index, { title: text })}
                />
                <View style={styles.actionRow}>
                  {(['task', 'reminder', 'note'] as const).map((kind) => (
                    <SmallButton
                      key={kind}
                      title={kind}
                      tone={action.kind === kind ? 'accent' : 'normal'}
                      onPress={() => changeKind(index, kind)}
                    />
                  ))}
                </View>
                <Muted>
                  {action.kind === 'note'
                    ? 'No dates'
                    : [
                        action.reminderAt ? `Remind ${formatWhen(action.reminderAt)}` : null,
                        action.dueAt ? `Due ${formatWhen(action.dueAt)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No dates'}
                </Muted>
              </View>
            ))}
            <View style={styles.actionRow}>
              <PrimaryButton title="Save all" onPress={() => void saveProposal()} />
              <SecondaryButton title="Discard" onPress={() => setProposal(null)} />
            </View>
          </Card>
        ) : null}

        {diaryDraft ? (
          <Card tone="accent">
            <Text style={styles.proposalTitle}>Diary entry · {displayDay(diaryDraft.day)}</Text>
            <Muted>Spelling and grammar corrected. Review before saving.</Muted>
            <TextInput
              style={[styles.proposalInput, styles.diaryBody]}
              value={diaryDraft.body}
              onChangeText={(text) => updateDraft({ body: text })}
              multiline
            />
            <TextInput
              style={styles.proposalInput}
              value={diaryDraft.summary}
              onChangeText={(text) => updateDraft({ summary: text })}
              placeholder="Short summary line"
              placeholderTextColor={colors.muted}
            />
            {diaryDraft.tags.length ? (
              <View style={styles.actionRow}>
                {diaryDraft.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </View>
            ) : null}
            {diaryDraft.questions.length ? (
              <View style={styles.questionBox}>
                <Text style={styles.metaLabel}>A FEW DETAILS WOULD HELP (OPTIONAL)</Text>
                {diaryDraft.questions.map((question) => (
                  <Muted key={question}>• {question}</Muted>
                ))}
                <TextInput
                  style={[styles.proposalInput, { marginTop: spacing.sm }]}
                  value={diaryDetails}
                  onChangeText={setDiaryDetails}
                  placeholder="e.g. At Joe’s house, around 2 pm"
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <PrimaryButton title="Save to diary" onPress={saveDiaryDraft} />
              <SecondaryButton title="Discard" onPress={() => setDiaryDraft(null)} />
            </View>
          </Card>
        ) : null}

        {cleaningDiary ? (
          <View style={[styles.bubbleWrap, styles.assistantWrap]}>
            <View style={[styles.bubble, styles.assistantBubble]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Muted>Cleaning the entry…</Muted>
            </View>
          </View>
        ) : null}

        {proposing ? (
          <View style={[styles.bubbleWrap, styles.assistantWrap]}>
            <View style={[styles.bubble, styles.assistantBubble]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Muted>Breaking this into actions…</Muted>
            </View>
          </View>
        ) : null}

        {sending ? (
          <View style={[styles.bubbleWrap, styles.assistantWrap]}>
            <View style={[styles.bubble, styles.assistantBubble]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.bubbleText}>{streaming || 'Thinking…'}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {error ? <Muted>{error}</Muted> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message ORM…"
          placeholderTextColor={colors.muted}
          multiline
          onSubmitEditing={() => void send()}
        />
        <Pressable
          onPress={() => void send()}
          disabled={sending || !input.trim()}
          accessibilityRole="button"
          style={[styles.send, sending || !input.trim() ? styles.sendDisabled : null]}
        >
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
      <Muted>Dictate with your phone keyboard mic. Chat data stays on this device.</Muted>

      <Modal transparent animationType="fade" visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.picker} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Choose a model</Text>
            <ScrollView>
              {pickerModels.map((id) => (
                <Pressable key={id} onPress={() => chooseModel(id)} style={styles.pickerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>
                      {id === AUTO ? 'Auto routing' : presetLabel(id)}
                    </Text>
                    <Muted>{id === AUTO ? 'Cheap default, escalate when needed' : id}</Muted>
                  </View>
                  {selection === id ? <Tag tone="accent">SELECTED</Tag> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={onOpenSettings} style={styles.pickerSettings}>
              <Text style={styles.pickerSettingsText}>Manage models in Settings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  iconButton: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  modeGroup: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  modeButton: { paddingHorizontal: 8, paddingVertical: 8 },
  modeButtonActive: { backgroundColor: colors.accentSoft },
  modeText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  modeTextActive: { color: colors.accent },
  modelButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accent },
  modelButtonText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  messages: { flex: 1 },
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
  welcome: { paddingVertical: spacing.lg, gap: spacing.sm },
  welcomeTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  bubbleWrap: { marginBottom: spacing.md },
  userWrap: { alignItems: 'flex-end' },
  assistantWrap: { alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: spacing.md },
  userBubble: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  assistantBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleRole: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  answerCard: {
    maxWidth: '92%',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  metaBar: {
    maxWidth: '92%',
    width: '92%',
    marginTop: 6,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  proposalTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  proposalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  diaryBody: { minHeight: 120, textAlignVertical: 'top' },
  questionBox: { borderLeftWidth: 2, borderLeftColor: colors.warn, paddingLeft: spacing.sm, marginTop: spacing.sm },
  proposalInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
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
  picker: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, maxHeight: '80%' },
  pickerTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pickerSettings: { paddingTop: spacing.md },
  pickerSettingsText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
