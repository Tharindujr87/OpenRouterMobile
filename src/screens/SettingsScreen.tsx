import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePickerModal from '../components/DateTimePickerModal';
import {
  accessToken,
  AI_FUNCTION_URL,
  signIn,
  signOut,
  supabase,
  supabaseConfigured,
} from '../lib/supabase';
import { downloadAndRestore, uploadBackup } from '../lib/cloudBackup';
import { clearMessages, deleteMemory, getMemory, getMeta, setMemory, setMeta } from '../db/repository';
import {
  getSavedCalendarId,
  hasCalendarAccess,
  listCalendars,
  requestCalendarAccess,
  saveCalendarId,
  type CalendarChoice,
} from '../lib/calendar';
import {
  checkNotificationPermission,
  requestNotificationPermission,
  sendTestReminder,
  setDailyReview,
  type PermissionResult,
} from '../lib/notifications';
import { exportBackup, exportMarkdown } from '../lib/actions';
import { DEFAULT_BASE_URL, normalizeBaseUrl, sendChatMessage, verifyOpenRouterKey } from '../lib/ai';
import {
  modelMetaKey,
  presetsForMode,
  routingDefaults,
  type AiMode,
} from '../lib/routing';
import { colors, radius, spacing } from '../theme';
import {
  Body,
  Card,
  Muted,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionTitle,
  SecondaryButton,
  SmallButton,
  Tag,
  inputStyle,
} from '../components/ui';

interface Props {
  refreshKey: number;
  permission: PermissionResult | null;
  setPermission: (value: PermissionResult) => void;
  bump: () => void;
}

export default function SettingsScreen({ permission, setPermission, bump }: Props) {
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const [calendarAccess, setCalendarAccess] = useState(false);
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(getSavedCalendarId());
  const [reviewEnabled, setReviewEnabled] = useState(getMeta('dailyReviewEnabled') === '1');
  const [reviewAt, setReviewAt] = useState(() => {
    const date = new Date();
    date.setHours(parseInt(getMeta('dailyReviewHour', '20'), 10) || 20, parseInt(getMeta('dailyReviewMinute', '0'), 10) || 0, 0, 0);
    return date.getTime();
  });
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [mode] = useState<AiMode>(getMeta('aiMode') === 'free' ? 'free' : 'pro');
  const [memory, setMemoryState] = useState<Record<string, string>>(getMemory());
  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');
  const [email, setEmail] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const access = await hasCalendarAccess();
      if (!active) return;
      setCalendarAccess(access);
      if (access) setCalendars(await listCalendars());
      const latest = await checkNotificationPermission();
      setPermission(latest);
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (active) setUserEmail(data.user?.email ?? null);
      }
    })();
    return () => {
      active = false;
    };
  }, [setPermission]);

  async function enableNotifications() {
    const result = await requestNotificationPermission();
    setPermission(result);
    setStatus(result.granted ? 'Notifications enabled.' : 'Permission was not granted.');
  }

  async function enableCalendar() {
    const granted = await requestCalendarAccess();
    setCalendarAccess(granted);
    if (granted) setCalendars(await listCalendars());
    setStatus(granted ? 'Calendar access granted.' : 'Calendar access was not granted.');
  }

  return (
    <Screen
      header={<ScreenHeader title="Settings" subtitle="Permissions, backups and memory" />}
    >
      <Card>
        <SectionTitle>AI &amp; routing</SectionTitle>
        <Muted>
          Your key is stored on this device in plain text. For a shared or backed-up phone, use a server proxy instead.
        </Muted>
        <MetaTextInput
          metaKey="openRouterApiKey"
          placeholder="OpenRouter API key"
          secure
        />
        <Muted>Paste the full key here (starts with sk-or-v1-), not in the URL field below.</Muted>
        <MetaTextInput
          key={`base-${settingsVersion}`}
          metaKey="openRouterBaseUrl"
          fallback={DEFAULT_BASE_URL}
          placeholder="API base URL"
        />
        <View style={styles.rowWrap}>
          <SecondaryButton
            title="Reset API URL"
            onPress={() => {
              setMeta('openRouterBaseUrl', DEFAULT_BASE_URL);
              setSettingsVersion((value) => value + 1);
              setStatus('API URL reset to default.');
            }}
          />
          <SecondaryButton
            title="Test connection"
            onPress={async () => {
              try {
                const token = supabaseConfigured ? await accessToken() : undefined;
                const settings = token
                  ? { apiKey: '', baseUrl: AI_FUNCTION_URL, accessToken: token }
                  : {
                      apiKey: getMeta('openRouterApiKey', ''),
                      baseUrl: getMeta('openRouterBaseUrl', DEFAULT_BASE_URL),
                    };
                if (settings.baseUrl === AI_FUNCTION_URL) {
                  const text = await sendChatMessage({
                    settings,
                    model: getMeta(modelMetaKey(mode, 'autoModel'), routingDefaults(mode).autoModel),
                    messages: [{ role: 'user', content: 'Reply with exactly OK' }],
                  });
                  setStatus(`Cloud AI proxy OK. Model said: ${text.slice(0, 80)}`);
                  return;
                }
                if (normalizeBaseUrl(settings.baseUrl) === DEFAULT_BASE_URL) {
                  await verifyOpenRouterKey(settings);
                  setStatus('OpenRouter accepted your API key. No model was called.');
                  return;
                }
                const text = await sendChatMessage({
                  settings,
                  model: getMeta(modelMetaKey(mode, 'autoModel'), routingDefaults(mode).autoModel),
                  messages: [{ role: 'user', content: 'Reply with exactly OK' }],
                });
                setStatus(`Connection OK. Model said: ${text.slice(0, 80)}`);
              } catch (error) {
                setStatus(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
              }
            }}
          />
        </View>
        {status ? <Muted>{status}</Muted> : null}
        <Muted>Current mode: {mode === 'free' ? 'Free' : 'Pro'} — switch it in the chat header.</Muted>
        <ModelChoice
          label="Auto / cheap model"
          metaKey={modelMetaKey(mode, 'autoModel')}
          fallback={routingDefaults(mode).autoModel}
          mode={mode}
        />
        <ModelChoice
          label="Strong model"
          metaKey={modelMetaKey(mode, 'strongModel')}
          fallback={routingDefaults(mode).strongModel}
          mode={mode}
        />
        <ModelChoice
          label="Image model"
          metaKey={modelMetaKey(mode, 'imageModel')}
          fallback={routingDefaults(mode).imageModel}
          mode={mode}
        />
        <ModelChoice
          label="Document model"
          metaKey={modelMetaKey(mode, 'documentModel')}
          fallback={routingDefaults(mode).documentModel}
          mode={mode}
        />
        <View style={styles.modelChoice}>
          <Body>Video model (optional)</Body>
          <Muted>
            OpenRouter has no public video models. Paste an ID only if you have a provider that works with this endpoint.
          </Muted>
          <MetaTextInput
            metaKey={modelMetaKey(mode, 'videoModel')}
            placeholder="provider/video-model"
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>Cloud account</SectionTitle>
        {!supabaseConfigured ? (
          <Muted>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sign-in and cloud backup.
          </Muted>
        ) : null}
        {userEmail ? (
          <>
            <View style={styles.row}>
              <Body>{userEmail}</Body>
              <Tag tone="accent">SIGNED IN</Tag>
            </View>
            <View style={styles.rowWrap}>
              <SecondaryButton
                title="Upload backup"
                onPress={async () => {
                  const error = await uploadBackup();
                  setStatus(error ?? 'Backup uploaded.');
                }}
              />
              <SecondaryButton
                title="Download from cloud"
                onPress={async () => {
                  const error = await downloadAndRestore();
                  setStatus(error ?? 'Cloud backup restored. This replaced local data.');
                  bump();
                }}
              />
              <SecondaryButton
                title="Sign out"
                onPress={async () => {
                  await signOut();
                  setUserEmail(null);
                  setStatus('Signed out.');
                }}
              />
            </View>
          </>
        ) : (
          <>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <PrimaryButton
              title="Send sign-in link"
              onPress={async () => {
                const error = await signIn(email);
                setStatus(error ?? 'Check your email for the sign-in link.');
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Notifications</SectionTitle>
        <View style={styles.row}>
          <Body>Status</Body>
          <Tag tone={permission?.granted ? 'accent' : 'warn'}>
            {permission?.granted ? 'ON' : permission?.available ? 'OFF' : 'UNAVAILABLE'}
          </Tag>
        </View>
        <Muted>
          Local notifications fire even when the app is closed. Focus modes and device settings can still hide them.
        </Muted>
        <View style={styles.rowWrap}>
          <PrimaryButton title="Allow notifications" onPress={enableNotifications} />
          <SecondaryButton
            title="Send test reminder"
            onPress={async () => {
              const sent = await sendTestReminder();
              setStatus(sent ? 'Test reminder will appear in 8 seconds.' : 'Allow notifications first.');
            }}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>Calendar</SectionTitle>
        <View style={styles.row}>
          <Body>Status</Body>
          <Tag tone={calendarAccess ? 'accent' : 'warn'}>{calendarAccess ? 'ON' : 'OFF'}</Tag>
        </View>
        {!calendarAccess ? (
          <PrimaryButton title="Allow calendar access" onPress={enableCalendar} />
        ) : calendars.length === 0 ? (
          <Muted>No writable calendar was found on this device.</Muted>
        ) : (
          calendars.map((calendar) => (
            <PressableRow
              key={calendar.id}
              label={calendar.title}
              selected={selectedCalendar === calendar.id}
              onPress={() => {
                saveCalendarId(calendar.id);
                setSelectedCalendar(calendar.id);
              }}
            />
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Daily review</SectionTitle>
        <View style={styles.row}>
          <Body>Remind me at the end of the day</Body>
          <Tag tone={reviewEnabled ? 'accent' : 'normal'}>{reviewEnabled ? 'ON' : 'OFF'}</Tag>
        </View>
        <View style={styles.timeRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTimePickerOpen(true)}
            style={styles.timeButton}
          >
            <Body>{new Date(reviewAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Body>
          </Pressable>
          <PrimaryButton
            title={reviewEnabled ? 'Update' : 'Enable'}
            onPress={async () => {
              const hour = new Date(reviewAt).getHours();
              const minute = new Date(reviewAt).getMinutes();
              setReviewEnabled(!reviewEnabled);
              setMeta('dailyReviewEnabled', reviewEnabled ? '0' : '1');
              setMeta('dailyReviewHour', String(hour));
              setMeta('dailyReviewMinute', String(minute));
              await setDailyReview(!reviewEnabled, hour, minute);
              setStatus(!reviewEnabled ? 'Daily review enabled.' : 'Daily review disabled.');
            }}
          />
        </View>
        <Muted>The review itself is built on your phone and works offline.</Muted>
        <DateTimePickerModal
          visible={timePickerOpen}
          value={reviewAt}
          mode="time"
          onSelect={(next) => {
            setReviewAt(next);
            setTimePickerOpen(false);
          }}
          onClose={() => setTimePickerOpen(false)}
        />
      </Card>

      <Card>
        <SectionTitle>Memory</SectionTitle>
        <Muted>Style and preferences the assistant can reuse across chats later.</Muted>
        {Object.entries(memory).length === 0 ? <Muted>Nothing remembered yet.</Muted> : null}
        {Object.entries(memory).map(([key, value]) => (
          <View key={key} style={styles.memoryRow}>
            <View style={{ flex: 1 }}>
              <Body>{key}</Body>
              <Muted>{value}</Muted>
            </View>
            <SmallButton
              title="Remove"
              tone="danger"
              onPress={() => {
                deleteMemory(key);
                setMemoryState(getMemory());
              }}
            />
          </View>
        ))}
        <TextInput
          style={inputStyle}
          value={memoryKey}
          onChangeText={setMemoryKey}
          placeholder="Preference, e.g. Tone"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={inputStyle}
          value={memoryValue}
          onChangeText={setMemoryValue}
          placeholder="Details, e.g. Short and direct"
          placeholderTextColor={colors.muted}
        />
        <PrimaryButton
          title="Remember this"
          onPress={() => {
            if (!memoryKey.trim() || !memoryValue.trim()) return;
            setMemory(memoryKey.trim(), memoryValue.trim());
            setMemoryKey('');
            setMemoryValue('');
            setMemoryState(getMemory());
          }}
        />
      </Card>

      <Card>
        <SectionTitle>Data</SectionTitle>
        <View style={styles.rowWrap}>
          <SecondaryButton
            title="Export chat as Markdown"
            onPress={() => {
              void exportMarkdown().then(() => setStatus('Markdown export opened.')).catch((error) => setStatus(String(error)));
            }}
          />
          <SecondaryButton
            title="Full backup (JSON)"
            onPress={() => {
              void exportBackup().then(() => setStatus('Backup opened.')).catch((error) => setStatus(String(error)));
            }}
          />
          <SecondaryButton
            title="Clear chat history"
            onPress={() => {
              clearMessages();
              bump();
              setStatus('Chat history cleared. Notes and tasks kept.');
            }}
          />
        </View>
        <Muted>Export regularly. This app is your only copy of these notes.</Muted>
      </Card>

      {status ? <Muted>{status}</Muted> : null}
      <View style={{ height: 24 }} />
    </Screen>
  );
}

function MetaTextInput({
  metaKey,
  fallback = '',
  placeholder,
  secure = false,
}: {
  metaKey: string;
  fallback?: string;
  placeholder: string;
  secure?: boolean;
}) {
  const [value, setValue] = useState(getMeta(metaKey, fallback));
  return (
    <TextInput
      style={inputStyle}
      value={value}
      onChangeText={(next) => {
        setValue(next);
        setMeta(metaKey, next);
      }}
      onEndEditing={() => {
        const trimmed = value.trim();
        setValue(trimmed);
        setMeta(metaKey, trimmed);
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      secureTextEntry={secure}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

function ModelChoice({
  label,
  metaKey,
  fallback,
  mode,
}: {
  label: string;
  metaKey: string;
  fallback: string;
  mode: AiMode;
}) {
  const [value, setValue] = useState(getMeta(metaKey, fallback));
  const presets = presetsForMode(mode);
  return (
    <View style={styles.modelChoice}>
      <Body>{label}</Body>
      <Muted>{value}</Muted>
      <View style={styles.rowWrap}>
        {presets.map((preset) => (
          <SmallButton
            key={preset.id}
            title={preset.label}
            tone={value === preset.id ? 'accent' : 'normal'}
            onPress={() => {
              setMeta(metaKey, preset.id);
              setValue(preset.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function PressableRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <SecondaryButton
      title={`${selected ? '✓ ' : ''}${label}`}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  timeButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  memoryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  modelChoice: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
});
