import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { deleteSession, getSessions, updateSession } from '../db/repository';
import type { ChatSession } from '../lib/types';
import { colors, radius, spacing } from '../theme';
import { Muted, Tag } from './ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  activeSessionId: string;
  refreshKey: number;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onOpenSettings: () => void;
  bump: () => void;
}

export default function Drawer({
  visible,
  onClose,
  activeSessionId,
  refreshKey,
  onSelect,
  onNew,
  onOpenSettings,
  bump,
}: Props) {
  const sessions = getSessions();
  const pinned = sessions.filter((session) => session.pinned);
  const regular = sessions.filter((session) => !session.pinned);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.brand}>ORM</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              onNew();
              onClose();
            }}
            accessibilityRole="button"
            style={styles.newButton}
          >
            <Text style={styles.newText}>＋  New session</Text>
          </Pressable>

          <ScrollView style={styles.list}>
            <Text style={styles.section}>PINNED</Text>
            {pinned.length === 0 ? <Muted>Nothing pinned yet.</Muted> : null}
            {pinned.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                onSelect={() => {
                  onSelect(session.id);
                  onClose();
                }}
                onPin={() => {
                  updateSession(session.id, { pinned: false });
                  bump();
                }}
                onDelete={() => {
                  deleteSession(session.id);
                  bump();
                }}
              />
            ))}

            <Text style={styles.section}>CHAT SESSIONS</Text>
            {regular.length === 0 ? <Muted>No sessions yet.</Muted> : null}
            {regular.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                onSelect={() => {
                  onSelect(session.id);
                  onClose();
                }}
                onPin={() => {
                  updateSession(session.id, { pinned: true });
                  bump();
                }}
                onDelete={() => {
                  deleteSession(session.id);
                  bump();
                }}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={() => {
              onOpenSettings();
              onClose();
            }}
            accessibilityRole="button"
            style={styles.footer}
          >
            <Text style={styles.footerText}>⚙  Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onPin,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable onPress={onSelect} style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {session.title}
        </Text>
        <Muted>{new Date(session.updatedAt).toLocaleDateString()}</Muted>
      </Pressable>
      {active ? <Tag tone="accent">OPEN</Tag> : null}
      <Pressable onPress={onPin} accessibilityRole="button" style={styles.mini}>
        <Text style={styles.miniText}>{session.pinned ? 'Unpin' : 'Pin'}</Text>
      </Pressable>
      <Pressable onPress={onDelete} accessibilityRole="button" style={styles.mini}>
        <Text style={[styles.miniText, { color: colors.danger }]}>Del</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: { width: '82%', maxWidth: 360, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, padding: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  brand: { color: colors.accent, fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.muted, fontSize: 24 },
  newButton: { backgroundColor: colors.accent, borderRadius: radius.md, padding: 14, alignItems: 'center', marginBottom: spacing.lg },
  newText: { color: '#06211F', fontWeight: '800', fontSize: 15 },
  list: { flex: 1 },
  section: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowActive: { backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: 6 },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  mini: { paddingHorizontal: 6, paddingVertical: 4 },
  miniText: { color: colors.muted, fontSize: 11 },
  footer: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { color: colors.text, fontSize: 14 },
});
