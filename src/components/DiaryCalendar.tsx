import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { displayDay, localDay } from '../lib/diary';
import { diaryMonthCells } from '../lib/diaryCalendar';
import { colors, radius, spacing } from '../theme';
import { SecondaryButton } from './ui';

export default function DiaryCalendar({ day, onSelect, onClose }: {
  day: string;
  onSelect: (day: string) => void;
  onClose: () => void;
}) {
  const [year, month] = day.split('-').map(Number);
  const [visible, setVisible] = useState(() => new Date(year, month - 1, 1, 12));
  const today = localDay();
  const currentMonth = today.slice(0, 7);
  const cells = diaryMonthCells(visible.getFullYear(), visible.getMonth());
  const monthLabel = visible.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const move = (step: number) => setVisible((current) => new Date(current.getFullYear(), current.getMonth() + step, 1, 12));

  return (
    <Modal visible transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.panel} accessibilityViewIsModal>
            <Text style={styles.title}>Choose a diary date</Text>
            <View style={styles.monthRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => move(-1)} style={styles.arrow}>
                <Text style={styles.label}>‹</Text>
              </Pressable>
              <Text style={styles.label} accessibilityLiveRegion="polite">{monthLabel}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={localDay(visible).slice(0, 7) >= currentMonth} onPress={() => move(1)} style={styles.arrow}>
                <Text style={styles.label}>›</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => <Text key={name} style={styles.weekday}>{name}</Text>)}
            </View>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} style={styles.row}>
                {cells.slice(row * 7, row * 7 + 7).map((date, col) => {
                  if (!date) return <View key={col} style={styles.cell} />;
                  const key = localDay(date);
                  const selected = key === day;
                  const disabled = key > today;
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityLabel={displayDay(key)}
                      accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onSelect(key)}
                      style={({ pressed }) => [styles.cell, selected && styles.selected, (disabled || pressed) && styles.dim]}>
                      <Text style={styles.label}>{date.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={styles.monthRow}>
              <SecondaryButton title="Today" onPress={() => onSelect(today)} />
              <SecondaryButton title="Cancel" onPress={onClose} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 8 },
  panel: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', padding: 8 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, paddingVertical: 6 },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  selected: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  dim: { opacity: 0.45 },
  label: { color: colors.text, fontWeight: '600' },
});
