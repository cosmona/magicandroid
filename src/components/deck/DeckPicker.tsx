import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { artCropUrl } from '@/api/scryfall';
import { DeckFormModal } from '@/components/DeckFormModal';
import { useAppState } from '@/context/AppState';
import { createDeck } from '@/db/database';
import { colors, formatLabel } from '@/theme';

/**
 * Row of saved decks (the web's Mazos list) that drops down under the deck's cover in the
 * deck sheet; tap one to load it, ＋ to create one. `onPicked` closes the dropdown.
 */
export function DeckPicker({ onPicked }: { onPicked?: () => void }) {
  const db = useSQLiteContext();
  const { decks, activeDeck, setActiveDeckId } = useAppState();
  const [creating, setCreating] = useState(false);

  const create = async (name: string, format: string | null) => {
    const id = await createDeck(db, name, format);
    setCreating(false);
    setActiveDeckId(id);
    onPicked?.();
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal contentContainerStyle={styles.list} showsHorizontalScrollIndicator={false}>
        <Pressable style={[styles.tile, styles.newTile]} onPress={() => setCreating(true)}>
          <Text style={styles.newPlus}>＋</Text>
          <Text style={styles.tileName}>Nuevo</Text>
        </Pressable>
        {decks.map((deck) => (
          <Pressable
            key={deck.id}
            style={[styles.tile, deck.id === activeDeck?.id && styles.tileActive]}
            onPress={() => {
              setActiveDeckId(deck.id);
              onPicked?.();
            }}
          >
            <View style={styles.cover}>
              {deck.coverImage && (
                <Image
                  source={{ uri: artCropUrl(deck.coverImage) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}
            </View>
            <Text style={styles.tileName} numberOfLines={1}>
              {deck.name}
            </Text>
            <Text style={styles.tileMeta} numberOfLines={1}>
              {deck.cardCount} · {formatLabel(deck.format)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {creating && <DeckFormModal title="Nuevo mazo" onCancel={() => setCreating(false)} onSubmit={create} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  list: { padding: 8, gap: 8 },
  tile: {
    width: 86,
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    gap: 3,
  },
  tileActive: { borderColor: colors.accent, borderWidth: 2 },
  newTile: { justifyContent: 'center', borderStyle: 'dashed' },
  newPlus: { color: colors.accent, fontSize: 30, fontWeight: '800' },
  cover: {
    width: 73,
    height: 73,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  tileName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  tileMeta: { color: colors.textMuted, fontSize: 10 },
});
