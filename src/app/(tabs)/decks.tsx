import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Chip } from '@/components/Button';
import { useAppState } from '@/context/AppState';
import { createDeck, deleteDeck, getDecks, renameDeck, type Deck } from '@/db/database';
import { colors, FORMATS, formatLabel } from '@/theme';

export default function DecksScreen() {
  const db = useSQLiteContext();
  const { activeDeckId, setActiveDeckId } = useAppState();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFormat, setNewFormat] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => setDecks(await getDecks(db)), [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await createDeck(db, name, newFormat);
    setActiveDeckId(id);
    setNewName('');
    setNewFormat(null);
    setCreating(false);
    load();
  };

  const saveRename = async () => {
    const name = editName.trim();
    if (editingId !== null && name) await renameDeck(db, editingId, name);
    setEditingId(null);
    load();
  };

  const confirmDelete = (deck: Deck) =>
    Alert.alert('Borrar mazo', `¿Seguro que quieres borrar "${deck.name}"? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(db, deck.id);
          if (deck.id === activeDeckId) setActiveDeckId(null);
          load();
        },
      },
    ]);

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.list}
      data={decks}
      keyExtractor={(d) => String(d.id)}
      ListHeaderComponent={
        creating ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Nombre del mazo"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              onSubmitEditing={create}
            />
            <Text style={styles.label}>Formato</Text>
            <View style={styles.chips}>
              {FORMATS.map((f) => (
                <Chip
                  key={f.label}
                  label={f.label}
                  selected={newFormat === f.key}
                  onPress={() => setNewFormat(f.key)}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              {newFormat === 'commander'
                ? 'Commander: máximo 1 copia por carta.'
                : 'Máximo 4 copias por carta (tierras básicas sin límite).'}
            </Text>
            <View style={styles.row}>
              <Button label="Cancelar" variant="secondary" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Button label="Crear" onPress={create} disabled={!newName.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="＋ Nuevo mazo" onPress={() => setCreating(true)} style={{ marginBottom: 12 }} />
        )
      }
      ListEmptyComponent={
        <Text style={styles.empty}>Todavía no tienes mazos. ¡Crea el primero!</Text>
      }
      renderItem={({ item }) => {
        const active = item.id === activeDeckId;
        return (
          <Pressable
            style={[styles.deck, active && styles.deckActive]}
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
          >
            <View style={styles.cover}>
              {item.coverImage && (
                <Image source={{ uri: item.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              {editingId === item.id ? (
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  onSubmitEditing={saveRename}
                  onBlur={saveRename}
                />
              ) : (
                <Text style={styles.deckName}>{item.name}</Text>
              )}
              <Text style={styles.deckMeta}>
                {formatLabel(item.format)} · {item.cardCount} cartas
                {active ? ' · ACTIVO' : ''}
              </Text>
              <View style={styles.row}>
                {!active && <SmallAction label="Usar" onPress={() => setActiveDeckId(item.id)} />}
                <SmallAction
                  label="Renombrar"
                  onPress={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                  }}
                />
                <SmallAction label="Borrar" danger onPress={() => confirmDelete(item)} />
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function SmallAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={{ color: danger ? colors.discard : colors.accent, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textMuted, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 32 },
  deck: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckActive: { borderColor: colors.accent, borderWidth: 2 },
  cover: {
    width: 56,
    height: 78,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  deckName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  deckMeta: { color: colors.textMuted },
});
