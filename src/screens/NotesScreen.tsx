import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteNote,
  getNotes,
  insertNote,
  searchNotes,
  updateNote,
} from '../db/repository';
import { pickPhotos } from '../lib/photos';
import { colors, radius, spacing } from '../theme';
import {
  Body,
  Card,
  EmptyState,
  Muted,
  PhotoStrip,
  PrimaryButton,
  ReadButton,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SmallButton,
  inputStyle,
} from '../components/ui';

interface Props {
  refreshKey: number;
  navigate: (screen: 'capture', prefill?: string) => void;
  bump: () => void;
}

export default function NotesScreen({ refreshKey, navigate, bump }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);

  const notes = query.trim() ? searchNotes(query.trim()) : getNotes();
  const selected = notes.find((note) => note.id === selectedId) ?? null;

  function quickAdd() {
    const body = newNote.trim();
    if (!body && pendingPhotos.length === 0) return;
    insertNote(body, pendingPhotos);
    setNewNote('');
    setPendingPhotos([]);
    bump();
  }

  async function addPendingPhotos() {
    const picked = await pickPhotos();
    if (!picked.length) return;
    setPendingPhotos((current) => [...current, ...picked]);
  }

  async function addPhotosToNote() {
    if (!selected) return;
    const picked = await pickPhotos();
    if (!picked.length) return;
    updateNote(selected.id, selected.body, [...selected.photos, ...picked]);
    bump();
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Notes"
          subtitle={`${getNotes().length} saved`}
          action={<SmallButton title="New" tone="accent" onPress={() => navigate('capture', 'Note: ')} />}
        />
      }
    >
      <Card>
        <TextInput
          style={inputStyle}
          value={newNote}
          onChangeText={setNewNote}
          placeholder="Write a quick note…"
          placeholderTextColor={colors.muted}
          onSubmitEditing={quickAdd}
        />
        <PhotoStrip
          uris={pendingPhotos}
          onRemove={(uri) => setPendingPhotos((current) => current.filter((item) => item !== uri))}
        />
        <View style={styles.row}>
          <SmallButton
            title="Photos"
            onPress={() => void addPendingPhotos()}
          />
          <PrimaryButton
            title="Add"
            onPress={quickAdd}
            disabled={!newNote.trim() && pendingPhotos.length === 0}
          />
        </View>
      </Card>

      <TextInput
        style={inputStyle}
        value={query}
        onChangeText={setQuery}
        placeholder="Search notes"
        placeholderTextColor={colors.muted}
      />

      {notes.length === 0 ? (
        <EmptyState>{query ? 'No notes match that search.' : 'No notes yet.'}</EmptyState>
      ) : (
        notes.map((note) => (
          <Pressable key={note.id} onPress={() => setSelectedId(note.id)}>
            <Card>
              <Muted>{new Date(note.updatedAt).toLocaleString()}</Muted>
              <Body>{note.body}</Body>
              <PhotoStrip uris={note.photos} />
            </Card>
          </Pressable>
        ))
      )}

      <Modal transparent animationType="fade" visible={selected !== null} onRequestClose={() => setSelectedId(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedId(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Muted>{selected ? new Date(selected.updatedAt).toLocaleString() : ''}</Muted>
            {editing ? (
              <TextInput
                style={[inputStyle, styles.editInput]}
                value={editValue}
                onChangeText={setEditValue}
                multiline
                autoFocus
              />
            ) : (
              <Body>{selected?.body}</Body>
            )}
            <PhotoStrip
              uris={selected?.photos ?? []}
              onRemove={(uri) => {
                if (!selected) return;
                updateNote(selected.id, selected.body, selected.photos.filter((item) => item !== uri));
                bump();
              }}
            />
            <View style={styles.rowWrap}>
              {editing ? (
                <PrimaryButton
                  title="Save"
                  onPress={() => {
                    if (!selected) return;
                    updateNote(selected.id, editValue);
                    setEditing(false);
                    bump();
                  }}
                />
              ) : (
                <SmallButton
                  title="Edit"
                  onPress={() => {
                    setEditValue(selected?.body ?? '');
                    setEditing(true);
                  }}
                />
              )}
              {selected ? <ReadButton text={selected.body} /> : null}
              <SmallButton title="Add photo" onPress={() => void addPhotosToNote()} />
              <SmallButton
                title="Make task"
                onPress={() => {
                  const body = selected?.body ?? '';
                  setSelectedId(null);
                  navigate('capture', `add task ${body}`);
                }}
              />
              <SmallButton
                title="Delete"
                tone="danger"
                onPress={() => {
                  if (!selected) return;
                  deleteNote(selected.id);
                  setSelectedId(null);
                  bump();
                }}
              />
              <SecondaryButton title="Close" onPress={() => setSelectedId(null)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  editInput: { minHeight: 120, textAlignVertical: 'top', color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.md },
  modal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, maxHeight: '80%' },
});
