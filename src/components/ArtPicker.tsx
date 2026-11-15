import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { getCardArts, smallImageUrl, type Card } from '@/api/scryfall';
import { CARD_RATIO } from '@/components/SwipeCard';
import { colors } from '@/theme';

/**
 * "🎨 Arte ▾" pill above the card. Opens every artwork Scryfall has for this card
 * (loaded on demand, cached) as thumbnails and swaps the card for the chosen printing.
 */
export function ArtPicker({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Card[] | null>(null);
  const [error, setError] = useState(false);

  const show = () => {
    setOpen(true);
    setOptions(null);
    setError(false);
    getCardArts(card)
      .then(setOptions)
      .catch(() => setError(true));
  };

  const pick = (item: Card) => {
    setOpen(false);
    if (item.id !== card.id) {
      if (item.imageUrl) Image.prefetch(item.imageUrl);
      onChange(item);
    }
  };

  return (
    <>
      <Pressable style={styles.pill} onPress={show} hitSlop={6}>
        <Text style={styles.pillText}>🎨 Arte ▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>
              {options ? `Artes disponibles · ${options.length}` : 'Artes disponibles'}
            </Text>
            {error ? (
              <Text style={styles.message}>No se pudieron cargar los artes. Inténtalo de nuevo.</Text>
            ) : !options ? (
              <ActivityIndicator color={colors.accent} style={{ padding: 24 }} />
            ) : options.length === 1 ? (
              <Text style={styles.message}>Esta carta solo tiene un arte.</Text>
            ) : (
              <FlatList
                data={options}
                numColumns={3}
                keyExtractor={(c) => c.id}
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => (
                  <Pressable style={styles.cell} onPress={() => pick(item)}>
                    <View style={[styles.thumbFrame, item.id === card.id && styles.thumbSelected]}>
                      <Image
                        source={item.imageUrl ? smallImageUrl(item.imageUrl) : undefined}
                        style={styles.thumb}
                        contentFit="cover"
                        recyclingKey={item.id}
                        transition={120}
                      />
                    </View>
                    <Text style={styles.caption} numberOfLines={1}>
                      {item.set.toUpperCase()}
                      {item.releasedAt ? ` · ${item.releasedAt.slice(0, 4)}` : ''}
                      {item.lang !== card.lang ? ` · ${item.lang.toUpperCase()}` : ''}
                    </Text>
                    {item.setName && (
                      <Text style={styles.setName} numberOfLines={1}>
                        {item.setName}
                      </Text>
                    )}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    maxHeight: '85%',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.textMuted, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 8 },
  message: { color: colors.textMuted, padding: 16 },
  grid: { paddingHorizontal: 6, paddingBottom: 6 },
  cell: { flex: 1 / 3, padding: 5 },
  thumbFrame: { borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  thumbSelected: { borderColor: colors.accent },
  thumb: { width: '100%', aspectRatio: 1 / CARD_RATIO },
  caption: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 3, textAlign: 'center' },
  setName: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
});
