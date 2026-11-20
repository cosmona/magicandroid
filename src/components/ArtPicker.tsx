import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getCardArts, getCardsByIds, smallImageUrl, type Card } from '@/api/scryfall';
import { CARD_RATIO } from '@/components/SwipeCard';
import { colors } from '@/theme';

/**
 * Pill «🎨 Arte ▾» sobre la carta. Abre todos los artes que Scryfall tiene para esta carta
 * (cargados bajo demanda, cacheados) como miniaturas y cambia la carta por la impresión elegida.
 */
export function ArtPicker({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.pill} onPress={() => setOpen(true)} hitSlop={6}>
        <MaterialCommunityIcons name="palette-outline" size={16} color={colors.text} />
        <Text style={styles.pillText}>Arte</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      {open && (
        <ArtPickerModal
          card={card}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            setOpen(false);
            if (item.id !== card.id) onChange(item);
          }}
        />
      )}
    </>
  );
}

/**
 * Los artes de una carta en una rejilla emergente; `card` es la impresión en pantalla o solo su
 * id de Scryfall (filas de mazo y colección), cargada primero. Llama a `onPick` con la impresión elegida.
 */
export function ArtPickerModal({
  card,
  onPick,
  onClose,
}: {
  card: Card | string;
  onPick: (card: Card) => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState<Card | null>(typeof card === 'string' ? null : card);
  const [options, setOptions] = useState<Card[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = typeof card === 'string' ? ((await getCardsByIds([card]))[0] ?? null) : card;
      if (!current) throw new Error('not found');
      if (cancelled) return;
      setBase(current);
      const arts = await getCardArts(current);
      if (!cancelled) setOptions(arts);
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [card, attempt]);

  const pick = (item: Card) => {
    if (item.imageUrl) Image.prefetch(item.imageUrl);
    onPick(item);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{options ? `Artes disponibles · ${options.length}` : 'Artes disponibles'}</Text>
          {error ? (
            <Pressable
              onPress={() => {
                setError(false);
                setAttempt((a) => a + 1);
              }}
            >
              <Text style={styles.message}>No se pudieron cargar los artes. Toca para reintentar.</Text>
            </Pressable>
          ) : !options || !base ? (
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
                  <View style={[styles.thumbFrame, item.id === base.id && styles.thumbSelected]}>
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
                    {item.lang !== base.lang ? ` · ${item.lang.toUpperCase()}` : ''}
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
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
