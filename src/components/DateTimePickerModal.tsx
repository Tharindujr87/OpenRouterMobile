import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { localDay } from '../lib/diary';
import { diaryMonthCells } from '../lib/diaryCalendar';
import { colors, radius, spacing } from '../theme';
import { SecondaryButton, SmallButton } from './ui';

type Mode = 'date' | 'time' | 'datetime';

interface Props {
  visible: boolean;
  value: number | null;
  mode: Mode;
  onSelect: (timestamp: number) => void;
  onClose: () => void;
}

function atTime(date: Date, source: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), source.getHours(), source.getMinutes(), 0, 0);
}

export default function DateTimePickerModal(props: Props) {
  if (Platform.OS !== 'web') return <NativeDateTimePicker {...props} />;
  return <WebDateTimePicker {...props} />;
}

function WebDateTimePicker({ visible, value, mode, onSelect, onClose }: Props) {
  const [selected, setSelected] = useState(() => new Date(value ?? Date.now()));
  const [viewMonth, setViewMonth] = useState(() => {
    const date = new Date(value ?? Date.now());
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });

  useEffect(() => {
    if (!visible) return;
    const date = new Date(value ?? Date.now());
    setSelected(date);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  }, [visible, value]);

  const cells = diaryMonthCells(viewMonth.getFullYear(), viewMonth.getMonth());
  const today = localDay();
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const timeLabel = selected.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  function setHour(delta: number) {
    const next = new Date(selected);
    next.setHours((next.getHours() + delta + 24) % 24);
    setSelected(next);
  }

  function setMinute(delta: number) {
    const next = new Date(selected);
    next.setMinutes((next.getMinutes() + delta + 60) % 60);
    setSelected(next);
  }

  function preset(hour: number, minute: number) {
    const next = new Date(selected);
    next.setHours(hour, minute, 0, 0);
    setSelected(next);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title}>
            {mode === 'time' ? 'Choose a time' : mode === 'date' ? 'Choose a date' : 'Choose date and time'}
          </Text>
          {mode === 'time' ? null : (
            <>
              <View style={styles.monthRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1, 12))} style={styles.arrow}>
                  <Text style={styles.arrowText}>‹</Text>
                </Pressable>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  disabled={localDay(viewMonth).slice(0, 7) >= today.slice(0, 7)}
                  onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1, 12))}
                  style={styles.arrow}
                >
                  <Text style={[styles.arrowText, localDay(viewMonth).slice(0, 7) >= today.slice(0, 7) && styles.dim]}>›</Text>
                </Pressable>
              </View>
              <View style={styles.row}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                  <Text key={index} style={styles.weekday}>{day}</Text>
                ))}
              </View>
              <ScrollView style={styles.grid}>
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                  <View key={row} style={styles.row}>
                    {cells.slice(row * 7, row * 7 + 7).map((date, col) => {
                      if (!date) return <View key={col} style={styles.cell} />;
                      const key = localDay(date);
                      const active = key === localDay(selected);
                      const disabled = key > today;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityLabel={localDay(date)}
                          accessibilityState={{ selected: active, disabled }}
                          disabled={disabled}
                          onPress={() => setSelected(atTime(date, selected))}
                          style={({ pressed }) => [styles.cell, active && styles.selected, (disabled || pressed) && styles.dim]}
                        >
                          <Text style={styles.cellText}>{date.getDate()}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </>
          )}
          {mode === 'date' ? null : (
            <View style={styles.timeBlock}>
              <Text style={styles.fieldLabel}>TIME</Text>
              <View style={styles.timeRow}>
                <SmallButton title="−" onPress={() => setHour(-1)} />
                <Text style={styles.timeValue}>{timeLabel}</Text>
                <SmallButton title="+" onPress={() => setHour(1)} />
                <SmallButton title="−5" onPress={() => setMinute(-5)} />
                <SmallButton title="+5" onPress={() => setMinute(5)} />
              </View>
              <View style={styles.rowWrap}>
                {[[9, 0], [12, 0], [15, 0], [18, 0]].map(([hour, minute]) => (
                  <SmallButton
                    key={hour}
                    title={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
                    onPress={() => preset(hour, minute)}
                  />
                ))}
              </View>
            </View>
          )}
          <View style={styles.rowWrap}>
            <SmallButton title="Done" tone="accent" onPress={() => onSelect(selected.getTime())} />
            <SecondaryButton title="Cancel" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function NativeDateTimePicker({
  visible,
  value,
  mode,
  onSelect,
  onClose,
}: Props) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>{mode === 'time' ? 'Choose a time' : mode === 'date' ? 'Choose a date' : 'Choose date and time'}</Text>
          <DateTimePicker
            value={new Date(value ?? Date.now())}
            mode={mode}
            display="default"
            onChange={(_event: DateTimePickerEvent, date?: Date) => {
              onClose();
              if (date) onSelect(date.getTime());
            }}
          />
          <SecondaryButton title="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'center', padding: 8 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 10, maxHeight: '88%' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: colors.text, fontSize: 28 },
  monthLabel: { color: colors.text, fontWeight: '700', fontSize: 16 },
  grid: { maxHeight: 320 },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, paddingVertical: 6 },
  cell: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  cellText: { color: colors.text, fontWeight: '600' },
  selected: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  dim: { opacity: 0.4 },
  timeBlock: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  timeValue: { color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 110, textAlign: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
