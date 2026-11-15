import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName } from '@/api/scryfall';
import { useAppState } from '@/context/AppState';
import { changeQuantity, copyLimit, getDeck, getDeckCards, type Deck, type DeckCard } from '@/db/database';
import { colors, formatLabel } from '@/theme';

// Order matters: a card goes in the first matching group (e.g. "Artifact Creature" → Criaturas).
const TYPE_GROUPS: [string, string][] = [
  ['Land', 'Tierras'],
  ['Creature', 'Criaturas'],
  ['Planeswalker', 'Planeswalkers'],
  ['Battle', 'Batallas'],
  ['Instant', 'Instantáneos'],
  ['Sorcery', 'Conjuros'],
  ['Enchantment', 'Encantamientos'],
  ['Artifact', 'Artefactos'],
];

function groupOf(typeLine: string) {
  const front = typeLine.split('//')[0];
  return TYPE_GROUPS.find(([t]) => front.includes(t))?.[1] ?? 'Otros';
}

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const db = useSQLiteContext();
  const { activeDeckId, setActiveDeckId } = useAppState();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDeck(await getDeck(db, deckId));
    setCards(await getDeckCards(db, deckId));
  }, [db, deckId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const map = new Map<string, DeckCard[]>();
    for (const c of cards) {
      const g = groupOf(c.typeLine);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    const order = [...TYPE_GROUPS.map(([, label]) => label), 'Otros'];
    return order
      .filter((label) => map.has(label))
      .map((label) => {
        const data = map.get(label)!;
        return { title: label, count: data.reduce((n, c) => n + c.quantity, 0), data };
      });
  }, [cards]);

  const change = async (card: DeckCard, delta: number) => {
    await changeQuantity(db, deckId, card.oracleId, delta);
    load();
  };

  if (!deck) return <View style={styles.screen} />;
  const isActive = activeDeckId === deck.id;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: deck.name }} />
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {formatLabel(deck.format)} · {deck.cardCount} cartas
        </Text>
        <Pressable onPress={() => setActiveDeckId(deck.id)} disabled={isActive}>
          <Text style={[styles.activeLink, isActive && { color: colors.textMuted }]}>
            {isActive ? 'Mazo activo' : 'Usar este mazo'}
          </Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(c) => c.oracleId}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Este mazo está vacío. Desliza cartas a la derecha para añadirlas.</Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>
            {section.title} ({section.count})
          </Text>
        )}
        renderItem={({ item }) => {
          const atLimit = item.quantity >= copyLimit(item, deck.format);
          return (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => setPreview(item.imageUrl)}>
                {item.imageUrl && (
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {displayName(item)}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.manaCost || '—'} · {item.typeLine}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.qty}>
                <QtyButton label="−" onPress={() => change(item, -1)} />
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <QtyButton label="+" onPress={() => change(item, 1)} disabled={atLimit} />
              </View>
            </View>
          );
        }}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.modalImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

function QtyButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={[styles.qtyButton, disabled && { opacity: 0.3 }]}>
      <Text style={styles.qtyButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  summaryText: { color: colors.textMuted, fontWeight: '600' },
  activeLink: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 32 },
  sectionHeader: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 15,
    backgroundColor: colors.bg,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    gap: 8,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 50, borderRadius: 4 },
  cardName: { color: colors.text, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyText: { color: colors.text, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 16 },
});
