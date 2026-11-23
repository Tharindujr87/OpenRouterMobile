import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from './db/database';
import { getSessions, insertSession } from './db/repository';
import { handleNotificationAction } from './lib/actions';
import {
  onNotificationAction,
  setupNotifications,
  type PermissionResult,
} from './lib/notifications';
import { colors, spacing } from './theme';
import ChatScreen from './screens/ChatScreen';
import Drawer from './components/Drawer';
import DiaryScreen from './screens/DiaryScreen';
import TodayScreen from './screens/TodayScreen';
import CaptureScreen from './screens/CaptureScreen';
import NotesScreen from './screens/NotesScreen';
import TasksScreen from './screens/TasksScreen';
import SettingsScreen from './screens/SettingsScreen';

type ScreenName = 'chat' | 'diary' | 'today' | 'capture' | 'notes' | 'tasks' | 'settings';

const TABS: Array<{ id: ScreenName; label: string; glyph: string }> = [
  { id: 'chat', label: 'Chat', glyph: '◌' },
  { id: 'diary', label: 'Diary', glyph: '▧' },
  { id: 'today', label: 'Today', glyph: '◉' },
  { id: 'capture', label: 'Capture', glyph: '＋' },
  { id: 'notes', label: 'Notes', glyph: '▤' },
  { id: 'tasks', label: 'Tasks', glyph: '✓' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('chat');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState('');
  const [captureNonce, setCaptureNonce] = useState(0);
  const [chatPrefill, setChatPrefill] = useState('');
  const [chatNonce, setChatNonce] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    void (async () => {
      try {
        await initializeDatabase();
        const sessions = getSessions();
        setActiveSessionId(sessions[0]?.id ?? insertSession('New chat').id);
        void setupNotifications().then(setPermission).catch(() => undefined);
        unsubscribe = onNotificationAction((action, taskId) => {
          void handleNotificationAction(action, taskId)
            .then(() => setRefreshKey((key) => key + 1))
            .catch(() => undefined);
        });
      } catch (error) {
        console.error('Database failed to open', error);
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const bump = useCallback(() => setRefreshKey((key) => key + 1), []);

  const newSession = useCallback(() => {
    const session = insertSession('New chat');
    setActiveSessionId(session.id);
    setScreen('chat');
    setRefreshKey((key) => key + 1);
  }, []);

  const navigate = useCallback((next: ScreenName, text = '') => {
    setPrefill(text);
    if (next === 'capture') setCaptureNonce((value) => value + 1);
    if (next === 'chat' && text) {
      setChatPrefill(text);
      setChatNonce((value) => value + 1);
    }
    setScreen(next);
    setRefreshKey((key) => key + 1);
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>ORM</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {screen === 'chat' && activeSessionId ? (
          <ChatScreen
            key={chatNonce}
            prefill={chatPrefill}
            sessionId={activeSessionId}
            refreshKey={refreshKey}
            bump={bump}
            onOpenDrawer={() => setDrawerOpen(true)}
            onNewSession={newSession}
            onOpenSettings={() => setScreen('settings')}
          />
        ) : null}
        {screen === 'diary' ? (
          <DiaryScreen refreshKey={refreshKey} bump={bump} />
        ) : null}
        {screen === 'today' ? (
          <TodayScreen refreshKey={refreshKey} permission={permission} navigate={navigate} bump={bump} />
        ) : null}
        {screen === 'capture' ? (
          <CaptureScreen key={captureNonce} prefill={prefill} refreshKey={refreshKey} bump={bump} />
        ) : null}
        {screen === 'notes' ? (
          <NotesScreen refreshKey={refreshKey} navigate={navigate} bump={bump} />
        ) : null}
        {screen === 'tasks' ? (
          <TasksScreen refreshKey={refreshKey} bump={bump} navigate={navigate} />
        ) : null}
        {screen === 'settings' ? (
          <SettingsScreen
            refreshKey={refreshKey}
            permission={permission}
            setPermission={setPermission}
            bump={bump}
          />
        ) : null}
      </View>

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeSessionId={activeSessionId}
        refreshKey={refreshKey}
        onSelect={(id) => setActiveSessionId(id)}
        onNew={newSession}
        onOpenSettings={() => setScreen('settings')}
        bump={bump}
      />

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = screen === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => navigate(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Text style={[styles.tabGlyph, active && styles.tabGlyphActive]}>{tab.glyph}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.accent, fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabGlyph: { fontSize: 20, color: colors.muted, lineHeight: 24 },
  tabGlyphActive: { color: colors.accent },
  tabLabel: { fontSize: 10, color: colors.muted },
  tabLabelActive: { color: colors.accent, fontWeight: '700' },
});
