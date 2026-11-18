import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { galleryFor, listFor, RowLines, TileIcons, type CardInfo } from '@/listLayout';
import { useRememberedSet } from '@/hooks/useRememberedSet';
import {
  ActivityIndicator,
  Modal,
  Alert,
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
import { BulkTagsSheet, CardTagsSheet, TagChip, TagsManagerSheet, useCardTags, useTags } from '@/components/tags/Tags';
import { ManaCost } from '@/components/ManaCost';
import { CardSheet } from '@/components/CardSheet';
import { SelectionBar, SelectOverlay, useSelection, type BulkAction } from '@/components/Selection';
import * as Clipboard from 'expo-clipboard';
import { DeckInCollectionBar, DeckPickerModal } from '@/components/collection/DeckInCollection';
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
  getWanted,
  removeWanted,
  type Row,
  type CollectionCard,
  type WantedCard,
  getDeckUsage,
  getDeckCards,
  type DeckCard,
  addCardToMaybe,
} from '@/db/database';

import { priceTotal, useCardDetails } from '@/hooks/useCardDetails';
import { notifyWantedChanged, setWanted, useWantedVersion } from '@/hooks/useWanted';
import { colors, formatEur } from '@/theme';

/** Color of «La quiero» (hearts). */
const WANT_COLOR = '#ff7a9c';

type CollectionView = 'list' | 'gallery';
const GROUPINGS: GroupBy[] = ['none', 'color', 'type', 'subtype', 'set', 'rarity', 'cost', 'price', 'lang', 'copies', 'deck', 'tag'];
const GALLERY_COLUMNS = 3;

/** Flat list items: group headers + cards (list view) or rows of 3 cards (gallery). */
type Item =
  | { type: 'header'; key: string; group: CardGroup; collapsed: boolean }
  | { type: 'sub'; key: string; subKey: string; group: CardGroup; collapsed: boolean }
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
const cardKey = (c: CollectionCard) => c.scryfallId;

export function CollectionScreen({ search }: { search?: { q: string; t: string } } = {}) {
  const db = useSQLiteContext();
  const { prefs, ensureActiveDeck, refresh, decks, setActiveDeckId } = useAppState();
  // A deck seen from the collection (null = all your cards); choosing one makes it the active deck.
  const [viewDeckId, setViewDeckId] = useState<number | null>(null);
  const [viewDeckCards, setViewDeckCards] = useState<DeckCard[]>([]);
  const [pickingDeck, setPickingDeck] = useState(false);
  const [viewVersion, setViewVersion] = useState(0);
  const viewDeck = viewDeckId !== null ? (decks.find((d) => d.id === viewDeckId) ?? null) : null;
  useEffect(() => {
    if (viewDeckId === null) return;
    let cancelled = false;
    getDeckCards(db, viewDeckId)
      .then((c) => !cancelled && setViewDeckCards(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, viewDeckId, viewVersion, decks]);
  const place = 'paper';
  const [cards, setCards] = useState<CollectionCard[]>([]);
  // Copies owned of each card, every printing together.
  const ownedByOracle = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) m[c.oracleId] = (m[c.oracleId] ?? 0) + c.quantity;
    return m;
  }, [cards]);
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
  // Second level of the grouping ('none' = no subgroups).
  const [subGroupBy, setSubGroupBy] = useState<GroupBy>('none');
  const [groupMenu, setGroupMenu] = useState(false);
  const [collapsed, setCollapsed] = useRememberedSet('collection');
  const [inDecks, setInDecks] = useState<Set<string>>(new Set());
  // Which decks use each card, and how many copies (by oracle id).
  const [usage, setUsage] = useState<Record<string, { deckName: string; quantity: number }[]>>({});
  const loadUsage = useCallback(async () => {
    const rows = await getDeckUsage(db);
    const out: Record<string, { deckName: string; quantity: number }[]> = {};
    for (const r of rows) (out[r.oracleId] ??= []).push({ deckName: r.deckName, quantity: r.quantity });
    setUsage(out);
  }, [db]);
  const [sets, setSets] = useState<Record<string, MtgSet>>({});

  const [wanted, setWantedList] = useState<WantedCard[]>([]);
  const [onlyWanted, setOnlyWanted] = useState(false);
  // Tags: the card whose tags are being changed, the manager, and the cards shown by tag.
  const [tagCard, setTagCard] = useState<{ oracleId: string; name: string } | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const allTags = useTags();
  const wantedVersion = useWantedVersion();

  const load = useCallback(async () => {
    setCards(await getCollection(db, place));
    setWantedList(await getWanted(db));
    setInDecks(await getDeckOracleIds(db));
    await loadUsage();
  }, [db, place, loadUsage]);

  // «La quiero» changed somewhere else (a card, the deck, a sync): reload the list.
  useEffect(() => {
    let cancelled = false;
    getWanted(db)
      .then((list) => !cancelled && setWantedList(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, wantedVersion]);

  // «La quiero»: marked printings (edition + language + artwork); the ones you don't own yet show up
  // as rows with 0 copies.
  const wantedIds = useMemo(() => new Set(wanted.map((w) => w.scryfallId)), [wanted]);
  const listCards = useMemo(() => {
    // A deck: its cards — the printings you own of each, or the deck's printing (0 copies) if you have none.
    if (viewDeck) {
      const out: CollectionCard[] = [];
      for (const dc of viewDeckCards) {
        const mine = cards.filter((c) => c.oracleId === dc.oracleId);
        if (mine.length) out.push(...mine);
        else
          out.push({
            scryfallId: dc.scryfallId,
            oracleId: dc.oracleId,
            name: dc.name,
            printedName: dc.printedName,
            typeLine: dc.typeLine,
            manaCost: dc.manaCost,
            imageUrl: dc.imageUrl,
            rarity: dc.rarity,
            setCode: '',
            lang: '',
            quantity: 0,
          });
      }
      return out;
    }
    const ownedIds = new Set(cards.map((c) => c.scryfallId));
    const pending: CollectionCard[] = wanted.filter((w) => !ownedIds.has(w.scryfallId)).map((w) => ({ ...w, quantity: 0 }));
    const all = [...cards, ...pending];
    return onlyWanted ? all.filter((c) => wantedIds.has(c.scryfallId)) : all;
  }, [cards, wanted, wantedIds, onlyWanted, viewDeck, viewDeckCards]);

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
  const effectiveSub: GroupBy =
    effectiveGroup === 'none' || subGroupBy === effectiveGroup || (!showPrices && subGroupBy === 'price') ? 'none' : subGroupBy;
  const effectiveFilter = useMemo(
    () => (showPrices ? filter : { ...filter, priceMin: null, priceMax: null }),
    [filter, showPrices],
  );

  const cardTags = useCardTags(listCards.map((c) => c.oracleId));
  const tagsByUid = useMemo(() => Object.fromEntries(allTags.map((t) => [t.uid, t])), [allTags]);
  const organizeCtx = useMemo(
    () => ({
      details,
      inDecks,
      sets,
      langNames: LANGUAGE_NAMES,
      tags: Object.fromEntries(Object.entries(cardTags).map(([id, uids]) => [id, uids.map((u) => tagsByUid[u]?.name).filter(Boolean) as string[]])),
    }),
    [details, inDecks, sets, cardTags, tagsByUid],
  );
  const owned = useMemo(() => {
    const ctx = organizeCtx;
    const byTags = tagFilter.length ? listCards.filter((c) => (cardTags[c.oracleId] ?? []).some((u) => tagFilter.includes(u))) : listCards;
    const filtered = applyFilter(byTags, effectiveFilter, ctx);
    if (!q) return filtered;
    const words = fold(q).split(/\s+/);
    return filtered.filter((c) => {
      const text = fold(`${c.name} ${c.printedName ?? ''}`);
      return words.every((w) => text.includes(w));
    });
  }, [listCards, q, effectiveFilter, organizeCtx, tagFilter, cardTags]);

  const groups = useMemo(
    () => groupCards(owned, effectiveGroup, organizeCtx),
    [owned, effectiveGroup, organizeCtx],
  );

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const group of groups) {
      const isCollapsed = groupBy !== 'none' && collapsed.has(group.key);
      if (groupBy !== 'none') out.push({ type: 'header', key: `h:${group.key}`, group, collapsed: isCollapsed });
      if (isCollapsed) continue;
      const put = (list: CollectionCard[], prefix: string) => {
        if (view === 'list') {
          for (const card of list) out.push({ type: 'card', key: `${prefix}:${card.scryfallId}`, card });
        } else {
          for (let i = 0; i < list.length; i += GALLERY_COLUMNS) {
            const row = list.slice(i, i + GALLERY_COLUMNS);
            out.push({ type: 'row', key: `r:${prefix}:${row[0].scryfallId}`, cards: row });
          }
        }
      };
      const subs = effectiveSub === 'none' ? [] : groupCards(group.cards, effectiveSub, organizeCtx);
      if (subs.length) {
        for (const sg of subs) {
          const subKey = `${group.key}/${sg.key}`;
          const subCollapsed = collapsed.has(subKey);
          out.push({ type: 'sub', key: `s:${subKey}`, subKey, group: sg, collapsed: subCollapsed });
          if (!subCollapsed) put(sg.cards, subKey);
        }
      } else put(group.cards, group.key);
    }
    return out;
  }, [groups, groupBy, collapsed, view, effectiveSub, organizeCtx]);

  // ---- Several cards selected (long press or «Seleccionar»): a bar at the bottom with what to do.
  const shownCards = useMemo(() => items.flatMap((it) => (it.type === 'card' ? [it.card] : it.type === 'row' ? it.cards : [])), [items]);
  const sel = useSelection(shownCards, cardKey);
  const [bulkTags, setBulkTags] = useState<string[] | null>(null);
  const bulkActions: BulkAction[] = [
    {
      label: 'Al mazo',
      icon: 'cards-playing-outline',
      color: colors.accent,
      onPress: async () => {
        const full = await getCardsByIds(sel.chosen.map((c) => c.scryfallId)).catch(() => []);
        const deck = await ensureActiveDeck();
        for (const c of full) await addCardToDeck(db, deck.id, c);
        await refresh(deck.id);
        showToast(`${full.length} añadidas a «${deck.name}»`);
        load();
      },
    },
    {
      label: 'A Posibles',
      icon: 'help-circle-outline',
      color: colors.info,
      onPress: async () => {
        const full = await getCardsByIds(sel.chosen.map((c) => c.scryfallId)).catch(() => []);
        const deck = await ensureActiveDeck();
        for (const c of full) await addCardToMaybe(db, deck.id, c);
        await refresh(deck.id);
        showToast(`${full.length} apartadas en Posibles`);
      },
    },
    { label: 'Etiquetas', icon: 'tag-outline', onPress: () => setBulkTags(sel.chosen.map((c) => c.oracleId)) },
    {
      label: 'La quiero',
      icon: 'heart-outline',
      color: WANT_COLOR,
      onPress: async () => {
        const full = await getCardsByIds(sel.chosen.map((c) => c.scryfallId)).catch(() => []);
        for (const c of full) await setWanted(db, c, true);
        notifyWantedChanged();
        load();
      },
    },
    {
      label: 'Copiar lista',
      icon: 'content-copy',
      onPress: async () => {
        await Clipboard.setStringAsync(sel.chosen.map((c) => `${Math.max(1, c.quantity)} ${c.name}`).join('\n'));
        showToast('Lista copiada');
      },
    },
    {
      label: 'Quitar',
      icon: 'trash-can-outline',
      color: colors.discard,
      onPress: () => {
        const list = sel.chosen.filter((c) => c.quantity > 0);
        Alert.alert('Quitar de la colección', `¿Quitar ${list.length} ${list.length === 1 ? 'carta' : 'cartas'} de tu colección?`, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Quitar',
            style: 'destructive',
            onPress: async () => {
              for (const c of list) await removeFromCollection(db, c.scryfallId, place);
              sel.exit();
              load();
            },
          },
        ]);
      },
    },
  ];

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

  /** «La quiero» on / off from a collection row. */
  const toggleWant = async (card: CollectionCard) => {
    if (wantedIds.has(card.scryfallId)) {
      await removeWanted(db, card.scryfallId);
      notifyWantedChanged();
      return;
    }
    const [printing] = await getCardsByIds([card.scryfallId]).catch(() => []);
    if (printing) await setWanted(db, printing, true);
  };
  /** A wanted card you just got: into the collection, and off «La quiero». */
  const gotIt = async (card: CollectionCard) => {
    const [printing] = await getCardsByIds([card.scryfallId]).catch(() => []);
    if (!printing) return showToast('No se pudo añadir: comprueba la conexión');
    await addToCollection(db, printing, place);
    await setWanted(db, printing, false);
    showToast(`📦 ¡${displayName(card)} conseguida!`);
  };

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const add = async (card: Card) => {
    const printing =
      prefs.language !== 'en' ? ((await getCardInLanguage(card, prefs.language).catch(() => null)) ?? card) : card;
    const quantity = await addToCollection(db, printing, place);
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
    const row = await snapshotCollectionCard(db, card.scryfallId, place);
    await removeFromCollection(db, card.scryfallId, place);
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
    await changeCollectionQuantity(db, card.scryfallId, delta, place);
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
      await loadUsage();
      showToast(`＋ ${displayName(card)} en «${deck.name}» (${quantity})`);
    } catch {
      showToast('No se pudo añadir: comprueba la conexión');
    }
  };

  // Ajustes → Cartas y listas: what the list rows and the gallery tiles show.
  const listLayout = listFor(prefs, 'collection');
  const galleryLayout = galleryFor(prefs, 'collection');
  const infoOf = (card: CollectionCard): CardInfo => {
    const u = usage[card.oracleId] ?? [];
    const used = u.reduce((n, x) => n + x.quantity, 0);
    return {
      name: card.name,
      printedName: card.printedName,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      set: card.setCode,
      lang: card.lang,
      rarity: card.rarity,
      price: showPrices ? details[card.scryfallId]?.eur : null,
      tags: prefs.showTags === false ? [] : (cardTags[card.oracleId] ?? []).map((t) => tagsByUid[t]).filter(Boolean),
      quantity: card.quantity,
      wanted: wantedIds.has(card.scryfallId),
      decks: prefs.showOwned === false ? [] : u.map((x) => ({ name: x.deckName, quantity: x.quantity })),
      free: u.length ? (ownedByOracle[card.oracleId] ?? card.quantity) - used : undefined,
    };
  };

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Pressable onPress={() => setPickingDeck(true)} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }} accessibilityLabel="Ver toda la colección o las cartas de un mazo">
          <Text style={styles.title} numberOfLines={1}>
            {viewDeck ? `🃏 ${viewDeck.name}` : '📦 Mi colección'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.stats} numberOfLines={1}>
          {stats.total} cartas · {stats.unique} distintas
          {showPrices && value.priced > 0 && <Text style={styles.value}> · ≈ {formatEur(value.eur)}</Text>}
        </Text>
      </View>

      {viewDeck && (
        <DeckInCollectionBar
          deck={viewDeck}
          cards={viewDeckCards}
          owned={Object.fromEntries(ownedByOracle ? Object.entries(ownedByOracle) : [])}
          onChanged={() => setViewVersion((v) => v + 1)}
        />
      )}
      {pickingDeck && (
        <DeckPickerModal
          decks={decks}
          current={viewDeckId}
          onClose={() => setPickingDeck(false)}
          onPick={(id) => {
            setViewDeckId(id);
            if (id !== null) setActiveDeckId(id);
            setPickingDeck(false);
          }}
        />
      )}

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
        <Pressable
          style={[styles.toolChip, onlyWanted && { borderColor: WANT_COLOR }]}
          onPress={() => setOnlyWanted((v) => !v)}
          accessibilityLabel="Ver solo las cartas marcadas con «La quiero»"
        >
          <MaterialCommunityIcons name={onlyWanted ? 'heart' : 'heart-outline'} size={17} color={WANT_COLOR} />
          <Text style={[styles.groupChipText, onlyWanted && { color: WANT_COLOR }]}>{wanted.length}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.toolIcon, sel.selecting && styles.groupChipOn]}
          onPress={() => (sel.selecting ? sel.exit() : sel.start())}
          accessibilityLabel="Seleccionar varias cartas"
        >
          <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={19} color={sel.selecting ? colors.bg : colors.textMuted} />
        </Pressable>
        <Pressable
          style={[styles.toolIcon, effectiveGroup !== 'none' && styles.groupChipOn]}
          onPress={() => setGroupMenu(true)}
          accessibilityLabel={`Agrupar: ${GROUP_LABELS[effectiveGroup]}`}
        >
          <MaterialCommunityIcons name="format-list-group" size={19} color={effectiveGroup !== 'none' ? colors.bg : colors.textMuted} />
        </Pressable>
        <View style={styles.viewSwitch}>
          {(['list', 'gallery'] as const).map((v) => (
            <Pressable
              key={v}
              style={[styles.viewOption, view === v && styles.viewOptionSelected]}
              onPress={() => setView(v)}
              accessibilityLabel={v === 'list' ? 'Lista' : 'Galería'}
            >
              <MaterialCommunityIcons name={v === 'list' ? 'view-list' : 'view-grid'} size={17} color={view === v ? colors.bg : colors.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
      {allTags.length > 0 && (
        // The tags filter the list; the last chip manages them.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagChips}>
          {allTags.map((t) => (
            <TagChip
              key={t.uid}
              tag={t}
              selected={tagFilter.includes(t.uid)}
              onPress={() => setTagFilter((f) => (f.includes(t.uid) ? f.filter((x) => x !== t.uid) : [...f, t.uid]))}
            />
          ))}
          <Pressable style={styles.groupChip} onPress={() => setManagingTags(true)} accessibilityLabel="Gestionar etiquetas">
            <MaterialCommunityIcons name="tag-edit-outline" size={14} color={colors.textMuted} />
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={groupMenu} transparent animationType="fade" onRequestClose={() => setGroupMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setGroupMenu(false)}>
          <Pressable style={styles.menuBox} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              <Text style={styles.menuTitle}>Agrupar por</Text>
              <View style={styles.menuGrid}>
                {GROUPINGS.filter((g) => showPrices || g !== 'price').map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.menuChip, groupBy === g && styles.menuChipOn]}
                    onPress={() => {
                      setGroupBy(g);
                      setCollapsed(new Set());
                      if (g === 'none') setGroupMenu(false);
                    }}
                  >
                    <Text style={[styles.menuChipText, groupBy === g && { color: colors.bg }]}>{GROUP_LABELS[g]}</Text>
                  </Pressable>
                ))}
              </View>
              {effectiveGroup !== 'none' && (
                <>
                  <Text style={[styles.menuTitle, { marginTop: 6 }]}>Subgrupo</Text>
                  <View style={styles.menuGrid}>
                    {GROUPINGS.filter((g) => g !== effectiveGroup && (showPrices || g !== 'price')).map((g) => (
                      <Pressable
                        key={g}
                        style={[styles.menuChip, effectiveSub === g && styles.menuChipOn]}
                        onPress={() => {
                          setSubGroupBy(g);
                          setCollapsed(new Set());
                        }}
                      >
                        <Text style={[styles.menuChipText, effectiveSub === g && { color: colors.bg }]}>
                          {g === 'none' ? 'Ninguno' : GROUP_LABELS[g]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              <Pressable style={styles.menuDone} onPress={() => setGroupMenu(false)}>
                <Text style={styles.menuDoneText}>Listo</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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

      {(searching || filterCount > 0) && (
        <Text style={[styles.sectionTitle, { paddingHorizontal: 16, paddingTop: 8 }]}>En tu colección ({owned.length})</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: sel.selecting ? 140 : 24 }}
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
          if (item.type === 'sub') {
            return (
              <Pressable style={styles.subHeader} onPress={() => toggleGroup(item.subKey)}>
                <MaterialCommunityIcons name={item.collapsed ? 'chevron-right' : 'chevron-down'} size={18} color={colors.textMuted} />
                {item.group.symbols && <ManaCost cost={item.group.symbols} size={14} />}
                <Text style={styles.subTitle} numberOfLines={1}>
                  {item.group.title}
                </Text>
                <Text style={styles.subTitle}>{item.group.copies}</Text>
              </Pressable>
            );
          }
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
                  <Pressable key={card.scryfallId} style={styles.galleryItem} onPress={() => setPreview(card)} onLongPress={() => sel.toggle(card)}>
                    {card.imageUrl && (
                      <Image
                        source={{ uri: smallImageUrl(card.imageUrl) }}
                        style={styles.galleryImage}
                        contentFit="contain"
                        recyclingKey={card.scryfallId}
                      />
                    )}
                    <TileIcons layout={galleryLayout} info={infoOf(card)} />
                    {sel.selecting && <SelectOverlay on={sel.isSelected(card)} onPress={() => sel.toggle(card)} />}
                  </Pressable>
                ))}
              </View>
            );
          }
          const card = item.card;
          // Código de colores: wanted and not owned = pink border.
          const tint = prefs.colorCode !== false && card.quantity === 0 && wantedIds.has(card.scryfallId) ? { borderColor: WANT_COLOR } : null;
          return (
            <View style={[styles.row, tint]}>
              {sel.selecting && <SelectOverlay on={sel.isSelected(card)} onPress={() => sel.toggle(card)} />}
              <View style={styles.rowTop}>
                <Pressable onPress={() => setPreview(card)} onLongPress={() => sel.toggle(card)}>
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
                  <RowLines layout={listLayout} info={infoOf(card)} />
                </View>
              </View>
              <CardControlsRow>
                {card.quantity > 0 ? (
                  <QuantityStepper value={card.quantity} onSub={() => change(card, -1)} onAdd={() => change(card, 1)} />
                ) : (
                  <Pressable style={styles.gotIt} onPress={() => gotIt(card)} accessibilityLabel="Ya la tienes: pásala a tu colección">
                    <Text style={styles.gotItText}>＋ La tengo</Text>
                  </Pressable>
                )}
                <CardIconButton
                  icon={wantedIds.has(card.scryfallId) ? 'heart' : 'heart-outline'}
                  hint={wantedIds.has(card.scryfallId) ? 'Quitar de «La quiero»' : 'La quiero (más copias)'}
                  tone={wantedIds.has(card.scryfallId) ? 'danger' : undefined}
                  onPress={() => toggleWant(card)}
                />
                <CardIconButton icon="tag-outline" hint="Etiquetas" onPress={() => setTagCard({ oracleId: card.oracleId, name: displayName(card) })} />
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
                {card.quantity > 0 && (
                  <CardIconButton
                    icon="pencil-outline"
                    tone="primary"
                    hint="Cambiar arte o idioma"
                    onPress={() => setPrintingCard(card)}
                  />
                )}
                <CardIconButton
                  icon="share-variant-outline"
                  hint="Compartir"
                  onPress={() =>
                    setShareCard({ scryfallId: card.scryfallId, name: displayName(card), imageUrl: card.imageUrl })
                  }
                />
                {card.quantity > 0 && (
                  <CardIconButton
                    icon="trash-can-outline"
                    hint="Quitar de la colección"
                    danger
                    onPress={() => confirmRemove(card)}
                  />
                )}
              </CardControlsRow>
            </View>
          );
        }}
      />

      <CardTagsSheet oracleId={tagCard?.oracleId ?? null} name={tagCard?.name} onClose={() => setTagCard(null)} />
      <TagsManagerSheet visible={managingTags} onClose={() => setManagingTags(false)} />
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
            await changeCollectionPrinting(db, printingCard.scryfallId, printing, place);
            load();
          }}
        />
      )}
      {shareCard && <CardShareSheet card={shareCard} onClose={() => setShareCard(null)} />}

      <SelectionBar sel={sel} total={shownCards.length} actions={bulkActions} />
      <BulkTagsSheet oracleIds={bulkTags} onClose={() => setBulkTags(null)} />
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {preview && (
        <CardSheet
          card={preview.scryfallId}
          exact
          subtitle="Tu colección"
          onClose={() => setPreview(null)}
          onPrinting={async (c) => {
            if (c.id === preview.scryfallId) return;
            await changeCollectionPrinting(db, preview.scryfallId, c, place);
            setPreview({ ...preview, scryfallId: c.id, lang: c.lang, imageUrl: c.imageUrl });
            load();
          }}
          nav={(() => {
            const order = groups.flatMap((g) => g.cards);
            const index = order.findIndex((c) => c.scryfallId === preview.scryfallId);
            return index < 0
              ? undefined
              : { index, total: order.length, onMove: (step: number) => order[index + step] && setPreview(order[index + step]) };
          })()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolIcon: {
    width: 36,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagChips: { gap: 6, paddingHorizontal: 16, paddingBottom: 6, alignItems: 'center' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  menuBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, maxHeight: '85%' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuChip: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  menuChipText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  menuDone: { marginTop: 8, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: colors.accent },
  menuDoneText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  menuTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  menuOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  menuText: { color: colors.text, fontSize: 15 },
  subLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', alignSelf: 'center' },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  subTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', flexShrink: 1 },
  gotIt: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: colors.add,
  },
  gotItText: { color: colors.bg, fontWeight: '900' },
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
