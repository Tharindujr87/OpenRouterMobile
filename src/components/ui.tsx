import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Speech from 'expo-speech';
import { getMeta } from '../db/repository';
import { colors, radius, spacing } from '../theme';

export function Screen({
  children,
  header,
  scroll = true,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
}) {
  const content = (
    <View style={styles.screenInner}>
      {header}
      {children}
    </View>
  );
  if (!scroll) return <View style={styles.screen}>{content}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'normal',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'normal' | 'accent' | 'warn';
}) {
  const borderColor =
    tone === 'accent' ? colors.accent : tone === 'warn' ? colors.warn : colors.border;
  return (
    <View style={[styles.card, { borderColor }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Body({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Muted({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  tone = 'normal',
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'normal' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        styles.secondaryButton,
        tone === 'danger' && styles.dangerButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.secondaryButtonText, tone === 'danger' && styles.dangerText]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function SmallButton({
  title,
  onPress,
  tone = 'normal',
}: {
  title: string;
  onPress: () => void;
  tone?: 'normal' | 'accent' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.smallButton,
        tone === 'accent' && styles.smallAccent,
        tone === 'danger' && styles.smallDanger,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.smallButtonText,
          tone === 'accent' && styles.smallAccentText,
          tone === 'danger' && styles.smallDangerText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Tag({
  children,
  tone = 'normal',
}: {
  children: React.ReactNode;
  tone?: 'normal' | 'accent' | 'warn' | 'danger';
}) {
  const color =
    tone === 'accent'
      ? colors.accent
      : tone === 'warn'
        ? colors.warn
        : tone === 'danger'
          ? colors.danger
          : colors.muted;
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{children}</Text>
    </View>
  );
}

function speechNumber(key: string, fallback: number, min: number, max: number): number {
  const value = Number.parseFloat(getMeta(key, String(fallback)));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function ReadButton({ text }: { text: string }) {
  return (
    <SmallButton
      title="Read"
      onPress={() => {
        void Speech.stop();
        void Speech.speak(text, {
          language: 'en',
          rate: speechNumber('speechRate', 0.9, 0.5, 2),
          volume: speechNumber('speechVolume', 1, 0, 1),
        });
      }}
    />
  );
}

export function PhotoStrip({
  uris,
  onRemove,
}: {
  uris: string[];
  onRemove?: (uri: string) => void;
}) {
  if (uris.length === 0) return null;
  return (
    <ScrollView horizontal style={styles.photoStrip} contentContainerStyle={styles.photoStripContent}>
      {uris.map((uri) => (
        <View key={uri} style={styles.photoItem}>
          <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
          {onRemove ? (
            <Pressable
              onPress={() => onRemove(uri)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              style={styles.photoRemove}
            >
              <Text style={styles.photoRemoveText}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Muted>{children}</Muted>
    </View>
  );
}

export const inputStyle = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
  },
}).input;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenInner: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  scrollContent: { paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: colors.muted, marginTop: 3 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { fontSize: 13, lineHeight: 19, color: colors.muted },
  button: {
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: { backgroundColor: colors.accent },
  primaryButtonText: { color: '#06211F', fontWeight: '700', fontSize: 15 },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  dangerButton: { borderColor: colors.danger },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  smallButton: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  smallButtonText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  smallAccent: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  smallAccentText: { color: colors.accent },
  smallDanger: { borderColor: colors.danger },
  smallDangerText: { color: colors.danger },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '700' },
  photoStrip: { marginTop: spacing.sm },
  photoStripContent: { gap: spacing.sm, alignItems: 'center' },
  photoItem: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  photoRemove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 18 },
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
});
