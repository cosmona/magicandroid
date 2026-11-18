import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { artCropUrl } from '@/api/scryfall';
import { DeckFormModal } from '@/components/DeckFormModal';
import { ImportListModal } from '@/components/ImportListModal';
import { useAppState } from '@/context/AppState';
import { TagChip, useDeckTags, useTags } from '@/components/tags/Tags';
import { createDeck } from '@/db/database';
import { colors, formatLabel } from '@/theme';

/**
 * Row of saved decks (the web's Mazos list) that drops down under the deck's cover in the
 * deck sheet; tap one to load it, ＋ to create one, Importar to paste a list. `onPicked` closes the dropdown.
 */
export function DeckPicker({ onPicked }: { onPicked?: () => void }) {
  const db = useSQLiteContext();
  const { decks, activeDeck, setActiveDeckId } = useAppState();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const allTags = useTags();
  const deckTags = useDeckTags();

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
        <Pressable style={[styles.tile, styles.newTile]} onPress={() => setImporting(true)}>
          <MaterialCommunityIcons name="import" size={30} color={colors.accent} style={{ marginVertical: 3 }} />
          <Text style={styles.tileName}>Importar</Text>
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
              {/* The deck's tags, as icons over the cover. */}
              <View style={styles.tagIcons}>
                {(deckTags[deck.uid] ?? []).map((u) => {
                  const t = allTags.find((x) => x.uid === u);
                  return t ? <TagChip key={u} tag={t} iconOnly /> : null;
                })}
              </View>
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

      {importing && (
        <ImportListModal
          target="deck"
          onClose={() => {
            setImporting(false);
            onPicked?.();
          }}
        />
      )}
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
  tagIcons: { position: 'absolute', left: 3, bottom: 3, right: 3, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  tileName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  tileMeta: { color: colors.textMuted, fontSize: 10 },
});
