import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_FILTERS,
  displayName,
  getCardInLanguage,
  LANGUAGE_NAMES,
  searchCards,
  smallImageUrl,
  type Card,
} from '@/api/scryfall';
import { SwipeToDelete } from '@/components/deck/SwipeToDelete';
import { useAppState } from '@/context/AppState';
import {
  addToCollection,
  changeCollectionQuantity,
  getCollection,
  removeFromCollection,
  type CollectionCard,
} from '@/db/database';
import { RARITY_LABELS } from '@/icons';
import { colors } from '@/theme';

type CollectionView = 'list' | 'gallery';
const MIN_QUERY = 2;
const DEBOUNCE_MS = 450;
const MAX_RESULTS = 20;

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * "Colección" tab: the cards the user owns, one row per printing (edition + language).
 * The search box filters the collection and, at the same time, searches Scryfall to add
 * new cards (added in the default language from settings when available).
 */
export function CollectionScreen() {
  const db = useSQLiteContext();
  const { prefs } = useAppState();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<CollectionView>('list');
  const [remote, setRemote] = useState<{ q: string; cards: Card[]; loading: boolean }>({
    q: '',
    cards: [],
    loading: false,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => setCards(await getCollection(db)), [db]);
  // Reload whenever the tab is shown (cards can be added from the swipe tab with 📦).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const q = query.trim();

  // Debounced Scryfall search for the typed name.
  useEffect(() => {
    if (q.length < MIN_QUERY) return;
    const timer = setTimeout(() => {
      setRemote({ q, cards: [], loading: true });
      searchCards({ ...DEFAULT_FILTERS, name: q })
        .then((page) => setRemote({ q, cards: page.cards.slice(0, MAX_RESULTS), loading: false }))
        .catch(() => setRemote({ q, cards: [], loading: false }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const searching = q.length >= MIN_QUERY;
  const results = remote.q === q ? remote.cards : [];
  const loadingResults = searching && (remote.q !== q || remote.loading);

  const owned = useMemo(() => {
    if (!q) return cards;
    const words = fold(q).split(/\s+/);
    return cards.filter((c) => {
      const text = fold(`${c.name} ${c.printedName ?? ''}`);
      return words.every((w) => text.includes(w));
    });
  }, [cards, q]);

  const stats = useMemo(
    () => ({ total: cards.reduce((n, c) => n + c.quantity, 0), unique: new Set(cards.map((c) => c.oracleId)).size }),
    [cards],
  );

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const add = async (card: Card) => {
    const printing =
      prefs.language !== 'en' ? ((await getCardInLanguage(card, prefs.language).catch(() => null)) ?? card) : card;
    const quantity = await addToCollection(db, printing);
    showToast(`📦 ${displayName(printing)} (${quantity})`);
    load();
  };

  const change = async (card: CollectionCard, delta: number) => {
    await changeCollectionQuantity(db, card.scryfallId, delta);
    load();
  };
  const remove = async (card: CollectionCard) => {
    await removeFromCollection(db, card.scryfallId);
    load();
  };

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>📦 Mi colección</Text>
        <Text style={styles.stats}>
          {stats.total} cartas · {stats.unique} distintas
        </Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Busca en tu colección o añade cartas…"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable hitSlop={10} onPress={() => setQuery('')}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        )}
      </View>

      {searching && (
        <View style={styles.results}>
          <Text style={styles.sectionTitle}>Añadir de Scryfall</Text>
          {loadingResults ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 12 }} />
          ) : results.length === 0 ? (
            <Text style={styles.muted}>Sin resultados para «{q}».</Text>
          ) : (
            results.map((card) => (
              <Pressable key={card.id} style={styles.result} onPress={() => add(card)}>
                {card.imageUrl && (
                  <Image source={{ uri: smallImageUrl(card.imageUrl) }} style={styles.resultThumb} contentFit="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName(card)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {card.typeLine}
                  </Text>
                </View>
                <Text style={styles.addButton}>＋</Text>
              </Pressable>
            ))
          )}
          {prefs.language !== 'en' && (
            <Text style={styles.muted}>Se añaden en {LANGUAGE_NAMES[prefs.language]} si existe (Ajustes).</Text>
          )}
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>{searching ? `En tu colección (${owned.length})` : 'Tus cartas'}</Text>
        <View style={styles.viewSwitch}>
          {(['list', 'gallery'] as const).map((v) => (
            <Pressable key={v} style={[styles.viewOption, view === v && styles.viewOptionSelected]} onPress={() => setView(v)}>
              <Text style={[styles.viewOptionText, view === v && { color: colors.bg }]}>
                {v === 'list' ? '☰' : '▦'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        key={view}
        data={owned}
        keyExtractor={(c) => c.scryfallId}
        numColumns={view === 'gallery' ? 3 : 1}
        columnWrapperStyle={view === 'gallery' ? styles.galleryRow : undefined}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        initialNumToRender={12}
        windowSize={7}
        ListEmptyComponent={
          searching ? undefined : (
            <Text style={styles.empty}>
              Tu colección está vacía.{'\n'}Busca cartas arriba, o pulsa 📦 en «Construir» para añadir la carta que tienes
              delante.
            </Text>
          )
        }
        renderItem={({ item }) =>
          view === 'list' ? (
            <SwipeToDelete onDelete={() => remove(item)}>
              <View style={styles.row}>
                <Pressable onPress={() => setPreview(item.imageUrl)}>
                  {item.imageUrl && (
                    <Image
                      source={{ uri: smallImageUrl(item.imageUrl) }}
                      style={styles.thumb}
                      contentFit="cover"
                      recyclingKey={item.scryfallId}
                    />
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName(item)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.setCode.toUpperCase()} · {LANGUAGE_NAMES[item.lang] ?? item.lang}
                    {item.rarity ? ` · ${RARITY_LABELS[item.rarity] ?? item.rarity}` : ''}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.typeLine}
                  </Text>
                </View>
                <View style={styles.qty}>
                  <QtyButton label="−" onPress={() => change(item, -1)} />
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <QtyButton label="+" onPress={() => change(item, 1)} />
                </View>
              </View>
            </SwipeToDelete>
          ) : (
            <Pressable style={styles.galleryItem} onPress={() => setPreview(item.imageUrl)}>
              {item.imageUrl && (
                <Image
                  source={{ uri: smallImageUrl(item.imageUrl) }}
                  style={styles.galleryImage}
                  contentFit="contain"
                  recyclingKey={item.scryfallId}
                />
              )}
              <Text style={styles.badge}>x{item.quantity}</Text>
            </Pressable>
          )
        }
      />

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreview(null)}>
          {preview && (
            <Image
              source={{ uri: preview }}
              placeholder={{ uri: smallImageUrl(preview) }}
              placeholderContentFit="contain"
              style={styles.modalImage}
              contentFit="contain"
            />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function QtyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={styles.qtyButton}>
      <Text style={styles.qtyButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', padding: 14 },
  title: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  stats: { color: colors.textMuted, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingRight: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  clear: { color: colors.textMuted, fontSize: 16 },
  results: {
    margin: 12,
    padding: 10,
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  resultThumb: { width: 36, height: 50, borderRadius: 4 },
  addButton: { color: colors.add, fontSize: 26, fontWeight: '900', paddingHorizontal: 8 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  viewSwitch: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  viewOption: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: colors.surface },
  viewOptionSelected: { backgroundColor: colors.accent },
  viewOptionText: { color: colors.text, fontWeight: '800' },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 32, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 10,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 46, height: 64, borderRadius: 5 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.textMuted, fontSize: 12 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyText: { color: colors.text, fontWeight: '900', minWidth: 20, textAlign: 'center' },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  galleryRow: { gap: 6, paddingHorizontal: 8, marginTop: 6 },
  galleryItem: { width: '31.5%', aspectRatio: 488 / 680 },
  galleryImage: { flex: 1, borderRadius: 8 },
  badge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: colors.text,
    fontWeight: '800',
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    maxWidth: '90%',
  },
  toastText: { color: colors.text, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 16 },
});
