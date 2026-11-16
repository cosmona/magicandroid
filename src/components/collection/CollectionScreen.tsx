import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  DEFAULT_FILTERS,
  displayName,
  fold,
  getAllSets,
  getCardsByIds,
  getCardInLanguage,
  LANGUAGE_NAMES,
  searchCards,
  smallImageUrl,
  type Card,
  type MtgSet,
} from '@/api/scryfall';
import { BottomSheet } from '@/components/BottomSheet';
import { CardScanner } from '@/components/collection/CardScanner';
import { CollectionFilterPanel } from '@/components/collection/CollectionFilterPanel';
import { ManaCost } from '@/components/ManaCost';
import {
  activeFilterCount,
  applyFilter,
  EMPTY_FILTER,
  GROUP_LABELS,
  groupCards,
  type CardGroup,
  type CollectionFilter,
  type GroupBy,
} from '@/collection/organize';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { PrintingPicker } from '@/components/PrintingPicker';
import { LanguagePill } from '@/components/LanguagePicker';
import { CardShareSheet, type ShareableCard } from '@/components/CardShareSheet';
import { ImportListModal } from '@/components/ImportListModal';
import { CardControlsRow, CardIconButton, QuantityStepper, UndoBar } from '@/components/CardControls';
import { useAppState } from '@/context/AppState';
import {
  addToCollection,
  changeCollectionPrinting,
  changeCollectionQuantity,
  getCollection,
  addCardToDeck,
  getDeckOracleIds,
  removeFromCollection,
  restoreCollectionRow,
  snapshotCollectionCard,
  type Row,
  type CollectionCard,
} from '@/db/database';
import { RARITY_LABELS } from '@/icons';
import { priceTotal, useCardDetails } from '@/hooks/useCardDetails';
import { colors, formatEur } from '@/theme';

type CollectionView = 'list' | 'gallery';
const GROUPINGS: GroupBy[] = ['none', 'color', 'type', 'set', 'rarity', 'cost', 'price'];
const GALLERY_COLUMNS = 3;

/** Flat list items: group headers + cards (list view) or rows of 3 cards (gallery). */
type Item =
  | { type: 'header'; key: string; group: CardGroup; collapsed: boolean }
  | { type: 'card'; key: string; card: CollectionCard }
  | { type: 'row'; key: string; cards: CollectionCard[] };
const MIN_QUERY = 2;
const DEBOUNCE_MS = 450;
const MAX_RESULTS = 20;

/**
 * "Colección" tab: the cards the user owns, one row per printing (edition + language).
 * The search box filters the collection and, at the same time, searches Scryfall to add
 * new cards (added in the default language from settings when available).
 */
export function CollectionScreen({ search }: { search?: { q: string; t: string } } = {}) {
  const db = useSQLiteContext();
  const { prefs, ensureActiveDeck, refresh } = useAppState();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [query, setQuery] = useState('');
  // Opened from elsewhere to look for a card ("Ver en mi colección"): put it in the search box.
  const [searchKey, setSearchKey] = useState('');
  if (search && `${search.q}|${search.t}` !== searchKey) {
    setSearchKey(`${search.q}|${search.t}`);
    setQuery(search.q);
  }
  const [view, setView] = useState<CollectionView>('list');
  const [remote, setRemote] = useState<{ q: string; cards: Card[]; loading: boolean }>({
    q: '',
    cards: [],
    loading: false,
  });
  const [preview, setPreview] = useState<CollectionCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [filter, setFilter] = useState<CollectionFilter>(EMPTY_FILTER);
  const [filtering, setFiltering] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inDecks, setInDecks] = useState<Set<string>>(new Set());
  const [sets, setSets] = useState<Record<string, MtgSet>>({});

  const load = useCallback(async () => {
    setCards(await getCollection(db));
    setInDecks(await getDeckOracleIds(db));
  }, [db]);

  // Set names and dates, for the edition grouping/filter (cached for the app run).
  useEffect(() => {
    getAllSets()
      .then(setSets)
      .catch(() => {});
  }, []);
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

  // Collection value on Cardmarket (live prices from Scryfall; hidden offline).
  const details = useCardDetails(cards.map((c) => c.scryfallId));
  const value = priceTotal(cards, details);
  const showPrices = prefs.pricesCollection;
  // Grouping/filtering by price only while prices are shown.
  const effectiveGroup: GroupBy = !showPrices && groupBy === 'price' ? 'none' : groupBy;
  const effectiveFilter = useMemo(
    () => (showPrices ? filter : { ...filter, priceMin: null, priceMax: null }),
    [filter, showPrices],
  );

  const owned = useMemo(() => {
    const ctx = { details, inDecks, sets };
    const filtered = applyFilter(cards, effectiveFilter, ctx);
    if (!q) return filtered;
    const words = fold(q).split(/\s+/);
    return filtered.filter((c) => {
      const text = fold(`${c.name} ${c.printedName ?? ''}`);
      return words.every((w) => text.includes(w));
    });
  }, [cards, q, effectiveFilter, details, inDecks, sets]);

  const groups = useMemo(
    () => groupCards(owned, effectiveGroup, { details, inDecks, sets }),
    [owned, effectiveGroup, details, inDecks, sets],
  );

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const group of groups) {
      const isCollapsed = groupBy !== 'none' && collapsed.has(group.key);
      if (groupBy !== 'none') out.push({ type: 'header', key: `h:${group.key}`, group, collapsed: isCollapsed });
      if (isCollapsed) continue;
      if (view === 'list') {
        for (const card of group.cards) out.push({ type: 'card', key: card.scryfallId, card });
      } else {
        for (let i = 0; i < group.cards.length; i += GALLERY_COLUMNS) {
          const row = group.cards.slice(i, i + GALLERY_COLUMNS);
          out.push({ type: 'row', key: `r:${group.key}:${row[0].scryfallId}`, cards: row });
        }
      }
    }
    return out;
  }, [groups, groupBy, collapsed, view]);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Options of the set/language filters: only what the collection has.
  const setCodes = useMemo(
    () =>
      [...new Set(cards.map((c) => c.setCode))].sort((a, b) =>
        (sets[b]?.releasedAt ?? '').localeCompare(sets[a]?.releasedAt ?? ''),
      ),
    [cards, sets],
  );
  const langs = useMemo(() => [...new Set(cards.map((c) => c.lang))], [cards]);
  const filterCount = activeFilterCount(filter);

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

  // Last removal, undoable for a few seconds.
  const [undo, setUndo] = useState<{ label: string; row: Row } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const runUndo = async () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setUndo(null);
    await restoreCollectionRow(db, undo.row);
    load();
  };

  const remove = async (card: CollectionCard) => {
    const row = await snapshotCollectionCard(db, card.scryfallId);
    await removeFromCollection(db, card.scryfallId);
    load();
    if (row) {
      clearTimeout(undoTimer.current);
      setUndo({ label: `${displayName(card)} quitada`, row });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    }
  };
  const confirmRemove = (card: CollectionCard) =>
    Alert.alert('Quitar de la colección', `¿Quitar ${displayName(card)} (${card.quantity}) de tu colección?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí', style: 'destructive', onPress: () => remove(card) },
    ]);
  // Going below 1 copy removes it: undoable like the trash button.
  const change = async (card: CollectionCard, delta: number) => {
    if (card.quantity + delta <= 0) return remove(card);
    await changeCollectionQuantity(db, card.scryfallId, delta);
    load();
  };

  const [infoId, setInfoId] = useState<string | null>(null);
  const [shareCard, setShareCard] = useState<ShareableCard | null>(null);
  const [printingCard, setPrintingCard] = useState<CollectionCard | null>(null);

  /** Adds this printing to the active deck (creating "Mazo sin nombre" if there's none). */
  const addToDeck = async (card: CollectionCard) => {
    try {
      const [full] = await getCardsByIds([card.scryfallId]);
      if (!full) throw new Error('not found');
      const deck = await ensureActiveDeck();
      const quantity = await addCardToDeck(db, deck.id, full);
      await refresh(deck.id);
      setInDecks(await getDeckOracleIds(db));
      showToast(`＋ ${displayName(card)} en «${deck.name}» (${quantity})`);
    } catch {
      showToast('No se pudo añadir: comprueba la conexión');
    }
  };

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>📦 Mi colección</Text>
        <Text style={styles.stats}>
          {stats.total} cartas · {stats.unique} distintas
          {showPrices && value.priced > 0 && <Text style={styles.value}> · ≈ {formatEur(value.eur)}</Text>}
        </Text>
      </View>

      <View style={styles.searchRow}>
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
        <Pressable
          style={[styles.scanButton, styles.importButton]}
          onPress={() => setImporting(true)}
          hitSlop={6}
          accessibilityLabel="Importar lista"
        >
          <MaterialCommunityIcons name="import" size={24} color={colors.accent} />
        </Pressable>
        <Pressable style={styles.scanButton} onPress={() => setScanning(true)} hitSlop={6}>
          <Text style={styles.scanIcon}>📷</Text>
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={({ pressed }) => [
            styles.filterButton,
            filterCount > 0 && styles.filterButtonOn,
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => setFiltering(true)}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="filter-variant" size={18} color={filterCount ? colors.bg : colors.accent} />
          <Text style={[styles.filterText, filterCount > 0 && { color: colors.bg }]}>
            Filtros{filterCount ? ` · ${filterCount}` : ''}
          </Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChips}>
          <MaterialCommunityIcons name="format-list-group" size={18} color={colors.textMuted} />
          {GROUPINGS.filter((g) => showPrices || g !== 'price').map((g) => (
            <Pressable
              key={g}
              style={[styles.groupChip, groupBy === g && styles.groupChipOn]}
              onPress={() => {
                setGroupBy(g);
                setCollapsed(new Set());
              }}
            >
              <Text style={[styles.groupChipText, groupBy === g && { color: colors.bg }]}>{GROUP_LABELS[g]}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
        <Text style={styles.sectionTitle}>
          {searching || filterCount ? `En tu colección (${owned.length})` : 'Tus cartas'}
        </Text>
        <View style={styles.viewSwitch}>
          {(['list', 'gallery'] as const).map((v) => (
            <Pressable
              key={v}
              style={[styles.viewOption, view === v && styles.viewOptionSelected]}
              onPress={() => setView(v)}
            >
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
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        initialNumToRender={12}
        windowSize={7}
        ListEmptyComponent={
          searching ? undefined : filterCount ? (
            <Text style={styles.empty}>Ninguna carta cumple los filtros.</Text>
          ) : (
            <Text style={styles.empty}>
              Tu colección está vacía.{'\n'}Busca cartas arriba, o pulsa 📦 en «Construir» para añadir la carta que
              tienes delante.
            </Text>
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            const { group } = item;
            return (
              <Pressable style={styles.groupHeader} onPress={() => toggleGroup(group.key)}>
                <MaterialCommunityIcons
                  name={item.collapsed ? 'chevron-right' : 'chevron-down'}
                  size={22}
                  color={colors.textMuted}
                />
                {group.symbols && <ManaCost cost={group.symbols} size={18} />}
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {group.title}
                </Text>
                <Text style={styles.groupMeta}>
                  {group.copies}
                  {showPrices && group.value > 0 && <Text style={styles.value}> · {formatEur(group.value)}</Text>}
                </Text>
              </Pressable>
            );
          }
          if (item.type === 'row') {
            return (
              <View style={styles.galleryRow}>
                {item.cards.map((card) => (
                  <Pressable key={card.scryfallId} style={styles.galleryItem} onPress={() => setPreview(card)}>
                    {card.imageUrl && (
                      <Image
                        source={{ uri: smallImageUrl(card.imageUrl) }}
                        style={styles.galleryImage}
                        contentFit="contain"
                        recyclingKey={card.scryfallId}
                      />
                    )}
                    <Text style={styles.badge}>x{card.quantity}</Text>
                  </Pressable>
                ))}
              </View>
            );
          }
          const card = item.card;
          const price = showPrices ? details[card.scryfallId]?.eur : undefined;
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Pressable onPress={() => setPreview(card)}>
                  {card.imageUrl && (
                    <Image
                      source={{ uri: smallImageUrl(card.imageUrl) }}
                      style={styles.thumb}
                      contentFit="cover"
                      recyclingKey={card.scryfallId}
                    />
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName(card)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {card.setCode.toUpperCase()} · {LANGUAGE_NAMES[card.lang] ?? card.lang}
                    {card.rarity ? ` · ${RARITY_LABELS[card.rarity] ?? card.rarity}` : ''}
                    {price != null && <Text style={styles.value}> · {formatEur(price)}</Text>}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {card.typeLine}
                  </Text>
                  {inDecks.has(card.oracleId) && <Text style={styles.inDeck}>En algún mazo</Text>}
                </View>
              </View>
              <CardControlsRow>
                <QuantityStepper value={card.quantity} onSub={() => change(card, -1)} onAdd={() => change(card, 1)} />
                <CardIconButton
                  icon="information-outline"
                  tone="info"
                  hint="Ficha completa"
                  onPress={() => setInfoId(card.scryfallId)}
                />
                <CardIconButton
                  icon="cards-playing-outline"
                  tone="primary"
                  hint="Añadir al mazo activo"
                  onPress={() => addToDeck(card)}
                />
                <CardIconButton
                  icon="pencil-outline"
                  tone="primary"
                  hint="Cambiar arte o idioma"
                  onPress={() => setPrintingCard(card)}
                />
                <CardIconButton
                  icon="share-variant-outline"
                  hint="Compartir"
                  onPress={() =>
                    setShareCard({ scryfallId: card.scryfallId, name: displayName(card), imageUrl: card.imageUrl })
                  }
                />
                <CardIconButton
                  icon="trash-can-outline"
                  hint="Quitar de la colección"
                  danger
                  onPress={() => confirmRemove(card)}
                />
              </CardControlsRow>
            </View>
          );
        }}
      />

      <BottomSheet visible={filtering} onClose={() => setFiltering(false)} heightRatio={0.85}>
        <CollectionFilterPanel
          filter={filter}
          onChange={setFilter}
          setCodes={setCodes}
          langs={langs}
          sets={sets}
          shown={owned.length}
          showPrices={showPrices}
        />
      </BottomSheet>

      <CardScanner
        visible={scanning}
        onClose={() => {
          setScanning(false);
          load();
        }}
        onAdded={() => load()}
        onSearch={(text) => {
          setScanning(false);
          setQuery(text);
        }}
      />

      {undo && <UndoBar label={undo.label} onUndo={runUndo} />}
      {infoId && <CardInfoScreen id={infoId} onClose={() => setInfoId(null)} />}
      {importing && (
        <ImportListModal
          target="collection"
          onClose={() => {
            setImporting(false);
            load();
          }}
        />
      )}
      {printingCard && (
        <PrintingPicker
          scryfallId={printingCard.scryfallId}
          name={displayName(printingCard)}
          onClose={() => setPrintingCard(null)}
          onPick={async (printing) => {
            await changeCollectionPrinting(db, printingCard.scryfallId, printing);
            load();
          }}
        />
      )}
      {shareCard && <CardShareSheet card={shareCard} onClose={() => setShareCard(null)} />}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreview(null)}>
          {preview?.imageUrl && (
            <Image
              source={{ uri: preview.imageUrl }}
              placeholder={{ uri: smallImageUrl(preview.imageUrl) }}
              placeholderContentFit="contain"
              style={styles.modalImage}
              contentFit="contain"
            />
          )}
          {preview && (
            <LanguagePill
              card={preview.scryfallId}
              lang={preview.lang}
              onPick={async (c) => {
                if (c.id === preview.scryfallId) return;
                setPreview(null);
                await changeCollectionPrinting(db, preview.scryfallId, c);
                load();
              }}
            />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', padding: 14 },
  title: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14 },
  scanButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  scanIcon: { fontSize: 22 },
  importButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stats: { color: colors.textMuted, fontWeight: '700' },
  value: { color: colors.accent, fontWeight: '800' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
    gap: 10,
    marginHorizontal: 10,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inDeck: { color: colors.add, fontSize: 12, fontWeight: '700' },
  thumb: { width: 46, height: 64, borderRadius: 5 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.textMuted, fontSize: 12 },
  galleryRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, marginTop: 6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, marginTop: 10 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  filterButtonOn: { backgroundColor: colors.accent },
  filterText: { color: colors.accent, fontWeight: '800' },
  groupChips: { alignItems: 'center', gap: 6, paddingRight: 14 },
  groupChip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  groupChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  groupChipText: { color: colors.text, fontWeight: '700' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  groupMeta: { color: colors.textMuted, fontWeight: '700' },
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
