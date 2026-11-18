import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import { galleryFor, listFor, RowLines, TileIcons, type CardInfo, type GalleryLayout, type ListLayout } from '@/listLayout';
import { useRememberedSet } from '@/hooks/useRememberedSet';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
// RNGH lists cooperate with the rows' swipe-to-delete gesture.
import { FlatList, GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { displayName, getCardsByIds, smallImageUrl, type CardDetails } from '@/api/scryfall';
import { SheetDragArea } from '@/components/BottomSheet';
import { DeckFormModal } from '@/components/DeckFormModal';
import { DeckPicker } from '@/components/deck/DeckPicker';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { CardControlsRow, CardIconButton, QuantityStepper, UndoBar } from '@/components/CardControls';
import { CardShareSheet, type ShareableCard } from '@/components/CardShareSheet';
import { HintButton } from '@/components/Hint';
import { PrintingPicker } from '@/components/PrintingPicker';
import { DeckSummary } from '@/components/deck/DeckSummary';
import { DeckStatsScreen } from '@/components/deck/DeckStatsScreen';
import { ShareDeckModal } from '@/components/deck/ShareDeckModal';
import { DeckSynergyScreen } from '@/components/deck/DeckSynergyScreen';
import { MissingCardsModal, type MissingCard } from '@/components/deck/MissingCardsModal';
import { deckTokens, TokensModal } from '@/components/deck/TokensModal';
import { PrintSheet } from '@/components/deck/PrintSheet';
import { isBasicLand } from '@/print/cardSheet';
import { ManaCost } from '@/components/ManaCost';
import { CardSheet } from '@/components/CardSheet';
import { useCardDetails } from '@/hooks/useCardDetails';
import { setWanted, useWantedPrintings } from '@/hooks/useWanted';
import { UNNAMED_DECK, useAppState, type DeckView, type DeckSort } from '@/context/AppState';
import {
  addCardToDeck,
  addToCollection,
  removeOneFromCollection,
  changeQuantity,
  changeSideboardQuantity,
  changeMaybeQuantity,
  type Zone,
  moveCopy,
  clearDeck,
  createDeck,
  deleteDeck,
  duplicateDeck,
  getCardsMissingData,
  getOwnedCounts,
  removeCardFromDeck,
  restoreSnapshot,
  snapshotDeck,
  type DeckSnapshot,
  setCommander,
  setDeckCardPrinting,
  setDeckCover,
  updateCardData,
  updateDeck,
  type DeckCard,
 Tag } from '@/db/database';
import { colors, formatEur, formatLabel, TONE_COLORS, type Tone } from '@/theme';
import { validateDeck, type DeckValidation } from '@/validation';
import { DECK_GROUP_OPTIONS, groupDeck, type DeckGroup, type DeckGroupBy, type DeckGroupContext } from '@/deck/group';
import { DeckTagsSheet, TagChip, useCardTags, useTags } from '@/components/tags/Tags';

/** Color of «La quiero» (hearts). */
const WANT_COLOR = '#ff7a9c';

/** Height of the drop zone that appears at the bottom while dragging a card. */
const DROP_ZONE_HEIGHT = 84;
/** Key of the sideboard in the collapsed set (it folds with the groups). */
const SIDEBOARD_KEY = '__sideboard';
const MAYBE_KEY = '__maybe';
const GHOST_WIDTH = 92;

type Side = 'main' | 'side';

/** What the rows need to start / follow / finish a drag (long press, then move). */
interface DragApi {
  x: SharedValue<number>;
  y: SharedValue<number>;
  start: (oracleId: string, from: Side) => void;
  end: (absoluteY: number, ok: boolean) => void;
}

type ListItem =
  | { type: 'header'; key: string; group: DeckGroup; collapsed: boolean }
  | { type: 'sub'; key: string; subKey: string; label: string; count: number; collapsed: boolean }
  | { type: 'card'; key: string; card: DeckCard }
  | { type: 'row'; key: string; cards: DeckCard[] };

const VIEWS: { key: DeckView; label: string; icon: IconName }[] = [
  { key: 'list', label: 'Lista', icon: 'format-list-bulleted' },
  { key: 'gallery', label: 'Galería', icon: 'view-grid-outline' },
  { key: 'big', label: 'Grande', icon: 'view-agenda-outline' },
  { key: 'text', label: 'Texto', icon: 'text-box-outline' },
];

/**
 * Content of the deck bottom sheet (the web's MazoConstructor + Mazos): deck actions,
 * deck picker, then the active deck's cards as a detailed list, an image gallery, or
 * one big card per row. Opens in the view chosen in settings.
 */
export function DeckSheet() {
  const db = useSQLiteContext();
  const { activeDeck, activeCards, activeSideboard, activeMaybe, setActiveDeckId, refresh, prefs, setPrefs } = useAppState();
  // «La quiero» of the exact printing each deck card has.
  const wantedIds = useWantedPrintings(db, activeCards.map((c) => c.scryfallId));
  const [mode, setMode] = useState<DeckView>(prefs.deckView);
  const [groupMenu, setGroupMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [collapsed, setCollapsed] = useRememberedSet('deck');
  const [editing, setEditing] = useState(false);
  // Oracle id of the card shown enlarged; the card itself is read from the deck so its
  // quantity / commander update live while the buttons under it are used.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const validation = useMemo(
    () => validateDeck(activeDeck?.format ?? null, activeCards, activeSideboard),
    [activeDeck?.format, activeCards, activeSideboard],
  );
  const preview = previewId ? (activeCards.find((c) => c.oracleId === previewId) ?? null) : null;
  const previewIssues = preview ? validation.cardIssues[preview.oracleId] : undefined;

  // Copies of each deck card in the user's collection (any printing).
  const [owned, setOwned] = useState<Record<string, number> | null>(null);
  // Bumped after adding to the collection from here, to recount.
  const [ownedVersion, setOwnedVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getOwnedCounts(
      db,
      activeCards.map((c) => c.oracleId),
      'paper',
    ).then((counts) => {
      if (!cancelled) setOwned(counts);
    });
    return () => {
      cancelled = true;
    };
  }, [db, activeCards, ownedVersion]);
  const missingCards: MissingCard[] = owned
    ? activeCards
        .map((card) => ({
          card,
          count: Math.max(0, card.quantity - (owned[card.oracleId] ?? 0)),
        }))
        .filter((m) => m.count > 0)
    : [];
  const missing = owned ? missingCards.reduce((n, m) => n + m.count, 0) : null;
  const [shopping, setShopping] = useState(false);

  // Prices, P/T and tokens from Scryfall (cached; shared with the deck summary).
  const details = useCardDetails(activeCards.map((c) => c.scryfallId));
  const tokens = deckTokens(activeCards, details);
  const [showTokens, setShowTokens] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showSynergy, setShowSynergy] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCard, setShareCard] = useState<ShareableCard | null>(null);
  const [printingCard, setPrintingCard] = useState<DeckCard | null>(null);
  // "Mis mazos" drops down from the cover, like a select.
  const [picking, setPicking] = useState(false);
  const [taggingDeck, setTaggingDeck] = useState(false);
  // Printing shown in the full Scryfall info screen.
  const [infoId, setInfoId] = useState<string | null>(null);

  // Cards saved before validation data existed get it from Scryfall, once per deck.
  const backfilled = useRef(new Set<number>());
  const activeDeckId = activeDeck?.id;
  useEffect(() => {
    if (activeDeckId === undefined || backfilled.current.has(activeDeckId)) return;
    backfilled.current.add(activeDeckId);
    (async () => {
      const missing = await getCardsMissingData(db, activeDeckId);
      if (!missing.length) return;
      const cards = await getCardsByIds(missing.map((m) => m.scryfallId));
      for (const card of cards) await updateCardData(db, card);
      refresh();
    })().catch(() => backfilled.current.delete(activeDeckId));
  }, [activeDeckId, db, refresh]);

  const save = async (name: string, format: string | null) => {
    setEditing(false);
    if (activeDeck) {
      await updateDeck(db, activeDeck.id, name, format);
      refresh();
    } else {
      setActiveDeckId(await createDeck(db, name, format));
    }
  };

  const confirm = (title: string, message: string, action: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí', style: 'destructive', onPress: action },
    ]);

  // Last destructive action, undoable for a few seconds from the bar at the bottom.
  const [undo, setUndo] = useState<{ label: string; snapshot: DeckSnapshot } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const offerUndo = (label: string, snapshot: DeckSnapshot) => {
    clearTimeout(undoTimer.current);
    setUndo({ label, snapshot });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };
  const runUndo = async () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setUndo(null);
    await restoreSnapshot(db, undo.snapshot);
    const restoredDeck = undo.snapshot.deck?.id;
    if (typeof restoredDeck === 'number') setActiveDeckId(restoredDeck);
    else refresh();
  };

  const clear = () =>
    activeDeck &&
    confirm('Vaciar mazo', `¿Quitar todas las cartas de "${activeDeck.name}"?`, async () => {
      const snapshot = await snapshotDeck(db, activeDeck.id);
      await clearDeck(db, activeDeck.id);
      refresh();
      offerUndo('Mazo vaciado', snapshot);
    });

  // A copy of the deck (cards, sideboard, «Posibles», format, cover) opened right away.
  const duplicate = async () => {
    if (!activeDeck) return;
    setActiveDeckId(await duplicateDeck(db, activeDeck.id, `${activeDeck.name} (copia)`));
  };

  const remove = () =>
    activeDeck &&
    confirm('Borrar mazo', `¿Borrar "${activeDeck.name}"?`, async () => {
      const snapshot = await snapshotDeck(db, activeDeck.id, { withDeck: true });
      await deleteDeck(db, activeDeck.id);
      setActiveDeckId(null);
      offerUndo(`«${activeDeck.name}» borrado`, snapshot);
    });

  const deckId = activeDeck?.id;

  // ---- Groups: the list is flattened into headers + cards (or gallery rows of 3). ----
  const groupBy = prefs.deckGroup;
  const subGroupBy: DeckGroupBy = groupBy === 'none' || prefs.deckSubGroup === groupBy ? 'none' : (prefs.deckSubGroup ?? 'none');
  // What the edition, collection, price and tag groupings need: the edition of each printing (from
  // Scryfall, once), copies owned, prices and tags.
  const [editions, setEditions] = useState<Record<string, { code: string; name: string; releasedAt: string }>>({});
  const deckIdsKey = activeCards.map((c) => c.scryfallId).sort().join(',');
  useEffect(() => {
    if (groupBy !== 'set' && subGroupBy !== 'set') return;
    const missingIds = deckIdsKey.split(',').filter((id) => id && !editions[id]);
    if (!missingIds.length) return;
    let cancelled = false;
    getCardsByIds(missingIds)
      .then((list) => {
        if (cancelled) return;
        setEditions((prev) => ({
          ...prev,
          ...Object.fromEntries(list.map((c) => [c.id, { code: c.set, name: c.setName ?? c.set.toUpperCase(), releasedAt: c.releasedAt ?? '' }])),
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckIdsKey, groupBy, subGroupBy]);
  const deckTags = useCardTags(activeCards.map((c) => c.oracleId));
  const allTags = useTags();
  // Ajustes → Cartas y listas: what the list rows and the gallery tiles show.
  const listLayout = listFor(prefs, 'deck');
  const galleryLayout = galleryFor(prefs, 'deck');
  const infoOf = (c: DeckCard): CardInfo => {
    const d = details[c.scryfallId];
    const st = statsOf(d);
    let legalities: Record<string, string> | null = null;
    try {
      legalities = c.legalities ? JSON.parse(c.legalities) : null;
    } catch {
      legalities = null;
    }
    return {
      name: c.name,
      printedName: c.printedName,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      oracleText: c.oracleText,
      set: editions[c.scryfallId]?.code,
      rarity: c.rarity,
      price: prefs.pricesDeckCards ? d?.eur : null,
      stats: st ? `${st.label} ${st.value}` : null,
      legalities,
      deckFormat: activeDeck?.format,
      tags: prefs.showTags === false ? [] : (deckTags[c.oracleId] ?? []).map((u) => allTags.find((t) => t.uid === u)).filter((t) => !!t),
      quantity: c.quantity,
      commander: validation.usesCommander && !!c.isCommander,
      owned: owned?.[c.oracleId],
      wanted: wantedIds.has(c.scryfallId),
      maybe: activeMaybe.find((m) => m.oracleId === c.oracleId)?.quantity ?? 0,
      issues: validation.cardIssues[c.oracleId],
    };
  };
  const groupCtx = useMemo<DeckGroupContext>(() => {
    const tagName = Object.fromEntries(allTags.map((t) => [t.uid, t.name]));
    return {
      setOf: (c) => editions[c.scryfallId],
      owned: (c) => owned?.[c.oracleId],
      price: (c) => details[c.scryfallId]?.eur,
      tags: (c) => (deckTags[c.oracleId] ?? []).map((u) => tagName[u]).filter(Boolean),
    };
  }, [editions, owned, details, deckTags, allTags]);
  // The cards in the chosen order (each group keeps it).
  const sortBy = prefs.deckSort ?? 'cmc';
  const sortedCards = useMemo(() => {
    const name = (c: DeckCard) => c.printedName ?? c.name;
    const byName = (a: DeckCard, b: DeckCard) => name(a).localeCompare(name(b), 'es');
    const list = [...activeCards];
    if (sortBy === 'name') list.sort(byName);
    else if (sortBy === 'added') list.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
    else if (sortBy === 'addedNew') list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    else if (sortBy === 'copies') list.sort((a, b) => b.quantity - a.quantity || byName(a, b));
    else list.sort((a, b) => a.cmc - b.cmc || byName(a, b));
    return list;
  }, [activeCards, sortBy]);
  const groups = useMemo(
    () => groupDeck(activeDeck ? sortedCards : [], groupBy, validation.usesCommander, groupCtx),
    [activeDeck, sortedCards, groupBy, validation.usesCommander, groupCtx],
  );
  const items = useMemo(() => {
    const out: ListItem[] = [];
    const headers = groups.length > 1 || groupBy !== 'none';
    for (const group of groups) {
      const isCollapsed = collapsed.has(group.key);
      if (headers) out.push({ type: 'header', key: `h:${group.key}`, group, collapsed: isCollapsed });
      if (isCollapsed) continue;
      const put = (cards: DeckCard[], prefix: string) => {
        if (mode === 'gallery') {
          for (let i = 0; i < cards.length; i += 3)
            out.push({ type: 'row', key: `r:${prefix}:${cards[i].oracleId}`, cards: cards.slice(i, i + 3) });
        } else {
          for (const card of cards) out.push({ type: 'card', key: `${prefix}:${card.oracleId}`, card });
        }
      };
      // Second level (subgroups), except for the commander.
      const subs = subGroupBy === 'none' || group.key === 'commander' ? [] : groupDeck(group.cards, subGroupBy, false, groupCtx);
      if (subs.length) {
        for (const sg of subs) {
          const subKey = `${group.key}/${sg.key}`;
          const subCollapsed = collapsed.has(subKey);
          out.push({ type: 'sub', key: `s:${subKey}`, subKey, label: sg.label, count: sg.count, collapsed: subCollapsed });
          if (!subCollapsed) put(sg.cards, subKey);
        }
      } else put(group.cards, group.key);
    }
    return out;
  }, [groups, groupBy, subGroupBy, groupCtx, collapsed, mode]);
  const hasGroups = items.some((i) => i.type === 'header');
  const openAll = () => setCollapsed(new Set());
  const closeAll = () => setCollapsed(new Set([...groups.map((g) => g.key), SIDEBOARD_KEY, MAYBE_KEY]));
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ---- Drag a card (long press) to the drop zone: main deck ⇄ sideboard. ----
  const sheetRef = useRef<ComponentRef<typeof View>>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetTop = useSharedValue(0);
  const zoneTop = useSharedValue(Number.POSITIVE_INFINITY);
  const [dragging, setDragging] = useState<{ card: DeckCard; from: Side } | null>(null);
  const draggingRef = useRef<{ card: DeckCard; from: Side } | null>(null);
  const drag: DragApi = {
    x: dragX,
    y: dragY,
    start: (oracleId, from) => {
      const card = (from === 'main' ? activeCards : activeSideboard).find((c) => c.oracleId === oracleId);
      if (!card) return;
      sheetRef.current?.measureInWindow((_x, y, _w, h) => {
        sheetTop.set(y);
        zoneTop.set(y + h - DROP_ZONE_HEIGHT - 24);
      });
      if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      draggingRef.current = { card, from };
      setDragging({ card, from });
    },
    end: (absoluteY, ok) => {
      const current = draggingRef.current;
      draggingRef.current = null;
      setDragging(null);
      if (!current || !ok || !deckId || absoluteY < zoneTop.get()) return;
      run(moveCopy(db, deckId, current.card.oracleId, current.from === 'main' ? 'side' : 'main'));
    },
  };
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.get() - GHOST_WIDTH / 2 },
      { translateY: dragY.get() - sheetTop.get() - (GHOST_WIDTH * 680) / 488 / 2 },
      { rotate: '-4deg' },
    ],
  }));
  const zoneStyle = useAnimatedStyle(() => {
    const over = dragY.get() >= zoneTop.get();
    return { opacity: over ? 1 : 0.8, transform: [{ scale: over ? 1.03 : 1 }] };
  });
  const run = (p: Promise<unknown>) => p.then(() => refresh());
  const removeCard = async (c: DeckCard) => {
    if (!deckId) return;
    const snapshot = await snapshotDeck(db, deckId, { oracleId: c.oracleId });
    await removeCardFromDeck(db, deckId, c.oracleId);
    refresh();
    offerUndo(`${displayName(c)} quitada`, snapshot);
  };
  const actions: CardActions = {
    add: (c) => deckId && run(changeQuantity(db, deckId, c.oracleId, 1)),
    // Going below 1 copy removes the card: undoable like any removal.
    sub: (c) => (c.quantity <= 1 ? removeCard(c) : deckId && run(changeQuantity(db, deckId, c.oracleId, -1))),
    confirmRemove: (c) =>
      confirm('Quitar carta', `¿Quitar ${displayName(c)} del mazo?`, () => {
        removeCard(c);
      }),
    cover: (c) => deckId && run(setDeckCover(db, deckId, c.imageUrl)),
    printing: (c) => setPrintingCard(c),
    own: async (c) => {
      const [printing] = await getCardsByIds([c.scryfallId]).catch(() => []);
      if (!printing) return;
      await addToCollection(db, printing, 'paper');
      setOwnedVersion((v) => v + 1);
    },
    unown: async (c) => {
      await removeOneFromCollection(db, c.oracleId, c.scryfallId, 'paper');
      setOwnedVersion((v) => v + 1);
    },
    toSide: (c) => deckId && run(moveCopy(db, deckId, c.oracleId, 'side')),
    toMaybe: (c) => deckId && run(moveCopy(db, deckId, c.oracleId, 'maybe')),
    want: async (c) => {
      const [printing] = await getCardsByIds([c.scryfallId]).catch(() => []);
      if (printing) await setWanted(db, printing, !wantedIds.has(c.scryfallId));
    },
    share: (c) => setShareCard({ scryfallId: c.scryfallId, name: displayName(c), imageUrl: c.imageUrl }),
    preview: (c) => setPreviewId(c.oracleId),
    info: (c) => setInfoId(c.scryfallId),
    commander: (c) => deckId && run(setCommander(db, deckId, c.oracleId, !c.isCommander)),
  };

  const unnamed = activeDeck?.name === UNNAMED_DECK;
  const toolsHidden = prefs.deckToolsHidden;

  // Fixed above the cards; dragging anywhere on it (buttons included) moves the sheet.
  const header = (
    <View style={styles.top}>
      <View style={styles.titleRow}>
        <DeckSummary
          onPressCover={() => setPicking((p) => !p)}
          pickerOpen={picking}
          onTags={() => setTaggingDeck(true)}
          right={
            activeDeck && missing !== null && activeCards.length > 0 && prefs.showOwned !== false ? (
              <HintButton
                hint={
                  missing ? 'Cartas que te faltan de tu colección: ver y comprar' : 'Tienes todas en tu colección'
                }
                style={[styles.ownedChip, { borderColor: missing ? colors.undo : colors.add }]}
                onPress={() => missing && setShopping(true)}
              >
                <MaterialCommunityIcons
                  name={missing ? 'package-variant-closed' : 'package-variant-closed-check'}
                  size={18}
                  color={missing ? colors.undo : colors.add}
                />
                <Text style={[styles.ownedChipValue, { color: missing ? colors.undo : colors.add }]}>
                  {missing ? `Faltan ${missing}` : 'Completo'}
                </Text>
                <Text style={styles.ownedChipLabel}>
                  {missing ? 'de tu colección' : 'en tu colección'}
                </Text>
              </HintButton>
            ) : undefined
          }
        />
      </View>

      {/* Without a deck the picker is the only way forward: always show it then. */}
      {(picking || !activeDeck) && <DeckPicker onPicked={() => setPicking(false)} />}

      <View style={styles.titleRow}>
        {activeDeck && (
          <View style={styles.infoRow}>
            {activeCards.length > 0 && (
              <ValidationBanner
                validation={validation}
                format={activeDeck.format}
                cards={activeCards}
                onOpenCard={(c) => setPreviewId(c.oracleId)}
              />
            )}
            <View style={{ flex: 1 }} />
            {hasGroups && (
              // One button: closes every group, or opens them all if any is closed.
              <HintButton
                hint={collapsed.size ? 'Abrir todos los grupos' : 'Cerrar todos los grupos'}
                style={styles.groupButton}
                onPress={collapsed.size ? openAll : closeAll}
                hitSlop={4}
              >
                <MaterialCommunityIcons
                  name={collapsed.size ? 'unfold-more-horizontal' : 'unfold-less-horizontal'}
                  size={18}
                  color={colors.textMuted}
                />
              </HintButton>
            )}
            {activeCards.length > 1 && (
              <HintButton
                hint={`Ordenar: ${DECK_SORTS.find((o) => o.key === sortBy)?.label}`}
                style={[styles.groupButton, sortBy !== 'cmc' && styles.groupButtonOn]}
                onPress={() => setSortMenu(true)}
                hitSlop={4}
              >
                <MaterialCommunityIcons name="sort" size={18} color={sortBy !== 'cmc' ? colors.bg : colors.textMuted} />
              </HintButton>
            )}
            {activeCards.length > 0 && (
              <HintButton
                hint="Agrupar cartas"
                style={[styles.groupButton, groupBy !== 'none' && styles.groupButtonOn]}
                onPress={() => setGroupMenu(true)}
                hitSlop={4}
              >
                <MaterialCommunityIcons
                  name="format-list-group"
                  size={18}
                  color={groupBy !== 'none' ? colors.bg : colors.textMuted}
                />
              </HintButton>
            )}
            {activeCards.length > 0 && (
              <View style={styles.viewSwitch}>
                {VIEWS.map((v) => (
                  <HintButton
                    key={v.key}
                    hint={`Vista ${v.label.toLowerCase()}`}
                    style={[styles.viewOption, mode === v.key && styles.viewOptionSelected]}
                    onPress={() => setMode(v.key)}
                    accessibilityState={{ selected: mode === v.key }}
                  >
                    <MaterialCommunityIcons
                      name={v.icon}
                      size={18}
                      color={mode === v.key ? colors.bg : colors.textMuted}
                    />
                  </HintButton>
                ))}
              </View>
            )}
            <HintButton
              hint={toolsHidden ? 'Mostrar botones' : 'Ocultar botones'}
              style={[styles.toolsToggle, !toolsHidden && styles.toolsToggleOpen]}
              onPress={() => setPrefs({ ...prefs, deckToolsHidden: !toolsHidden })}
              hitSlop={6}
            >
              <MaterialCommunityIcons
                name={toolsHidden ? 'dots-horizontal' : 'chevron-up'}
                size={20}
                color={toolsHidden ? colors.text : colors.accent}
              />
            </HintButton>
          </View>
        )}
      </View>


      {activeDeck && !toolsHidden && (
        <View style={styles.actions}>
          <Action
            icon={unnamed ? 'content-save-outline' : 'pencil-outline'}
            hint={unnamed ? 'Guardar' : 'Editar'}
            highlight={unnamed}
            tone="primary"
            onPress={() => setEditing(true)}
          />
          <Action
            icon="share-variant-outline"
            hint="Compartir"
            onPress={() => setShowShare(true)}
            disabled={!activeCards.length}
          />
          <Action icon="content-copy" hint="Duplicar mazo" onPress={duplicate} />
          {!!missing && (
            <Action
              icon="cart-outline"
              hint="Comprar en Cardmarket"
              filled
              tone="warn"
              onPress={() => setShopping(true)}
            />
          )}
          {activeCards.length > 0 && (
            <Action
              icon="chart-bar"
              hint="Estadísticas y mano de prueba"
              tone="info"
              onPress={() => setShowStats(true)}
            />
          )}
          {activeCards.length > 0 && (
            <Action icon="puzzle-outline" hint="Sinergias y combos" tone="info" onPress={() => setShowSynergy(true)} />
          )}
          {tokens.length > 0 && (
            <Action
              icon="cards-outline"
              hint={`Fichas (${tokens.length})`}
              tone="info"
              onPress={() => setShowTokens(true)}
            />
          )}
          {activeCards.length > 0 && <Action icon="printer-outline" hint="Imprimir (PDF)" onPress={() => setPrinting(true)} />}
          <Action icon="broom" hint="Vaciar" danger onPress={clear} disabled={!activeCards.length} />
          <Action icon="trash-can-outline" hint="Borrar" danger onPress={remove} />
        </View>
      )}
    </View>
  );

  // Scrolls with the cards: the problem list can get long.
  const listHeader = (
    <View>
      {!activeDeck && (
        <Text style={styles.empty}>
          No hay ningún mazo cargado. Elige uno, crea uno con ＋ o desliza una carta a la derecha.
        </Text>
      )}
      {/* «Texto»: the commander(s) in big, as on the shared deck picture. */}
      {mode === 'text' && validation.usesCommander && activeCards.some((c) => c.isCommander) && (
        <View style={styles.textCommanders}>
          {activeCards
            .filter((c) => c.isCommander && c.imageUrl)
            .map((c) => (
              <Pressable key={c.oracleId} onPress={() => actions.preview(c)} style={{ alignItems: 'center', gap: 4 }}>
                <Image source={{ uri: c.imageUrl! }} style={styles.textCommanderImage} contentFit="cover" />
                <Text style={styles.textCommanderName} numberOfLines={1}>
                  👑 {displayName(c)}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.sheet} ref={sheetRef} collapsable={false}>
      <SheetDragArea>{header}</SheetDragArea>
      <FlatList
        key={mode}
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          // Always there for decks that can have one (so it can be found), and whenever it has cards.
          activeDeck ? (
            <View>
              {activeCards.length > 0 && !validation.usesCommander && (
                <ZoneSection
                  zone="side"
                  title="Banquillo"
                  icon="tray-full"
                  empty="Vacío. Pasa cartas aquí con el botón de la bandeja ↓ de cada carta, manteniéndola pulsada y arrastrándola abajo, o importando una lista con banquillo (sideboard)."
                  cards={activeSideboard}
                  moves={[
                    { to: 'main', icon: 'tray-arrow-up', hint: 'Pasar una copia al mazo' },
                    { to: 'maybe', icon: 'help-circle-outline', hint: 'Pasar una copia a Posibles' },
                  ]}
                  onAdd={(c) => run(changeSideboardQuantity(db, activeDeck.id, c.oracleId, 1))}
                  onSub={(c) => run(changeSideboardQuantity(db, activeDeck.id, c.oracleId, -1))}
                  onMove={(c, to) => run(moveCopy(db, activeDeck.id, c.oracleId, to, 'side'))}
                  drag={drag}
                  open={!collapsed.has(SIDEBOARD_KEY)}
                  onToggle={() => toggleGroup(SIDEBOARD_KEY)}
                />
              )}
              {tokens.length > 0 && (
                // The deck's tokens, next to Banquillo and Posibles (view or print them).
                <Pressable style={styles.tokensRow} onPress={() => setShowTokens(true)}>
                  <MaterialCommunityIcons name="cards-outline" size={20} color={colors.info} />
                  <Text style={styles.tokensTitle}>Fichas</Text>
                  <Text style={styles.tokensCount}>{tokens.length}</Text>
                  <Text style={styles.tokensHint} numberOfLines={1}>
                    {tokens.map((t) => t.name).join(', ')}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </Pressable>
              )}
              <ZoneSection
                zone="maybe"
                title="Posibles"
                icon="help-circle-outline"
                empty="Cartas que te estás pensando o quieres probar: no cuentan para el mazo (ni tamaño, ni validación, ni estadísticas, ni precio). Pásalas aquí con el botón ? de cada carta, o mantén pulsado ✓ al pasar cartas."
                cards={activeMaybe}
                moves={[
                  { to: 'main', icon: 'tray-arrow-up', hint: 'Pasar una copia al mazo' },
                  ...(validation.usesCommander
                    ? []
                    : [{ to: 'side' as const, icon: 'tray-arrow-down' as const, hint: 'Pasar una copia al banquillo' }]),
                ]}
                onAdd={(c) => run(changeMaybeQuantity(db, activeDeck.id, c.oracleId, 1))}
                onSub={(c) => run(changeMaybeQuantity(db, activeDeck.id, c.oracleId, -1))}
                onMove={(c, to) => run(moveCopy(db, activeDeck.id, c.oracleId, to, 'maybe'))}
                drag={drag}
                open={!collapsed.has(MAYBE_KEY)}
                onToggle={() => toggleGroup(MAYBE_KEY)}
              />
            </View>
          ) : undefined
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        nestedScrollEnabled
        ListEmptyComponent={
          activeDeck ? (
            <Text style={styles.empty}>Mazo vacío. Desliza cartas a la derecha para añadirlas.</Text>
          ) : undefined
        }
        initialNumToRender={mode === 'big' ? 2 : 8}
        windowSize={mode === 'big' ? 3 : 7}
        renderItem={({ item: entry }) => {
          if (entry.type === 'sub') {
            return (
              <Pressable
                style={styles.subHeader}
                onPress={() => toggleGroup(entry.subKey)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !entry.collapsed }}
              >
                <MaterialCommunityIcons name={entry.collapsed ? 'chevron-right' : 'chevron-down'} size={16} color={colors.textMuted} />
                <Text style={styles.subTitle}>{entry.label}</Text>
                <Text style={styles.subCount}>{entry.count}</Text>
              </Pressable>
            );
          }
          if (entry.type === 'header') {
            return (
              <Pressable
                style={styles.groupHeader}
                onPress={() => toggleGroup(entry.group.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded: !entry.collapsed }}
              >
                <MaterialCommunityIcons
                  name={entry.collapsed ? 'chevron-right' : 'chevron-down'}
                  size={20}
                  color={colors.textMuted}
                />
                <Text style={styles.groupTitle}>{entry.group.label}</Text>
                <Text style={styles.groupCount}>{entry.group.count}</Text>
              </Pressable>
            );
          }
          if (entry.type === 'row') {
            return (
              <View style={styles.galleryRow}>
                {entry.cards.map((item) => (
                  <Draggable
                    key={item.oracleId}
                    oracleId={item.oracleId}
                    from="main"
                    drag={drag}
                    style={styles.galleryCell}
                  >
                    <GalleryTile
                      info={infoOf(item)}
                      layout={galleryLayout}
                      card={item}
                      invalid={!!validation.cardIssues[item.oracleId]}
                      crown={validation.usesCommander}
                      onPress={() => actions.preview(item)}
                    />
                  </Draggable>
                ))}
              </View>
            );
          }
          const item = entry.card;
          return (
            <>
              {mode === 'text' ? (
                <TextRow
                  card={item}
                  issues={validation.cardIssues[item.oracleId]}
                  owned={owned ? (owned[item.oracleId] ?? 0) : undefined}
                  tags={prefs.showTags === false ? [] : (deckTags[item.oracleId] ?? []).map((u) => allTags.find((t) => t.uid === u)).filter((t) => !!t)}
                  onPress={() => actions.preview(item)}
                  onAdd={() => actions.add(item)}
                  onSub={() => actions.sub(item)}
                />
              ) : mode === 'big' ? (
                <BigCard
                  card={item}
                  actions={actions}
                  issues={validation.cardIssues[item.oracleId]}
                  crown={validation.usesCommander}
                  owned={owned?.[item.oracleId]}
                  wanted={wantedIds.has(item.scryfallId)}
                  details={details[item.scryfallId]}
                  showPrice={prefs.pricesDeckCards}
                  drag={drag}
                />
              ) : (
                <CardRow
                  info={infoOf(item)}
                  layout={listLayout}
                  card={item}
                  actions={actions}
                  issues={validation.cardIssues[item.oracleId]}
                  crown={validation.usesCommander}
                  owned={owned?.[item.oracleId]}
                  wanted={wantedIds.has(item.scryfallId)}
                  details={details[item.scryfallId]}
                  showPrice={prefs.pricesDeckCards}
                  drag={drag}
                />
              )}
            </>
          );
        }}
      />

      {dragging && (
        <>
          <Animated.View style={[styles.dropZone, zoneStyle]} pointerEvents="none">
            <MaterialCommunityIcons
              name={dragging.from === 'main' ? 'tray-arrow-down' : 'tray-arrow-up'}
              size={26}
              color={colors.accent}
            />
            <Text style={styles.dropText}>
              Suelta aquí para pasarla {dragging.from === 'main' ? 'al banquillo' : 'al mazo'}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.ghost, ghostStyle]} pointerEvents="none">
            {dragging.card.imageUrl && (
              <Image
                source={{ uri: smallImageUrl(dragging.card.imageUrl) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            )}
          </Animated.View>
        </>
      )}

      <Modal visible={sortMenu} transparent animationType="fade" onRequestClose={() => setSortMenu(false)}>
        <Pressable style={styles.issuesBackdrop} onPress={() => setSortMenu(false)}>
          <Pressable style={styles.groupMenu} onPress={() => {}}>
            <Text style={styles.groupMenuTitle}>Ordenar las cartas</Text>
            {DECK_SORTS.map((o) => (
              <Pressable
                key={o.key}
                style={[styles.groupOption, sortBy === o.key && styles.groupOptionOn]}
                onPress={() => {
                  setPrefs({ ...prefs, deckSort: o.key });
                  setSortMenu(false);
                }}
              >
                <MaterialCommunityIcons
                  name={sortBy === o.key ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={sortBy === o.key ? colors.accent : colors.textMuted}
                />
                <Text style={styles.groupOptionText}>{o.label}</Text>
              </Pressable>
            ))}
            <Text style={styles.groupMenuHelp}>Dentro de cada grupo.</Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={groupMenu} transparent animationType="fade" onRequestClose={() => setGroupMenu(false)}>
        <Pressable style={styles.issuesBackdrop} onPress={() => setGroupMenu(false)}>
          <Pressable style={[styles.groupMenu, { maxHeight: '85%' }]} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              <Text style={styles.groupMenuTitle}>Agrupar por</Text>
              <View style={styles.menuGrid}>
                {DECK_GROUP_OPTIONS.map((o) => (
                  <Pressable
                    key={o.key}
                    style={[styles.menuChip, groupBy === o.key && styles.menuChipOn]}
                    onPress={() => {
                      setPrefs({ ...prefs, deckGroup: o.key as DeckGroupBy });
                      setCollapsed(new Set());
                      if (o.key === 'none') setGroupMenu(false);
                    }}
                  >
                    <Text style={[styles.menuChipText, groupBy === o.key && { color: colors.bg }]}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              {groupBy !== 'none' && (
                <>
                  <Text style={[styles.groupMenuTitle, { marginTop: 6 }]}>Subgrupo</Text>
                  <View style={styles.menuGrid}>
                    {[{ key: 'none', label: 'Ninguno' }, ...DECK_GROUP_OPTIONS.filter((o) => o.key !== groupBy && o.key !== 'none')].map((o) => (
                      <Pressable
                        key={o.key}
                        style={[styles.menuChip, subGroupBy === o.key && styles.menuChipOn]}
                        onPress={() => {
                          setPrefs({ ...prefs, deckSubGroup: o.key as DeckGroupBy });
                          setCollapsed(new Set());
                        }}
                      >
                        <Text style={[styles.menuChipText, subGroupBy === o.key && { color: colors.bg }]}>{o.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.groupMenuHelp}>
                Toca el título de un grupo para plegarlo. Mantén pulsada una carta y arrástrala abajo para pasarla al
                banquillo (o del banquillo al mazo).
              </Text>
              <Pressable style={styles.menuDone} onPress={() => setGroupMenu(false)}>
                <Text style={styles.menuDoneText}>Listo</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <DeckTagsSheet deckUid={taggingDeck ? (activeDeck?.uid ?? null) : null} name={activeDeck?.name} onClose={() => setTaggingDeck(false)} />

      {shopping && (
        <MissingCardsModal
          missing={missingCards}
          details={details}
          showPrices={prefs.pricesShopping}
          onClose={() => setShopping(false)}
        />
      )}
      {undo && <UndoBar label={undo.label} onUndo={runUndo} />}
      {infoId && <CardInfoScreen id={infoId} onClose={() => setInfoId(null)} />}
      {shareCard && <CardShareSheet card={shareCard} onClose={() => setShareCard(null)} />}
      {printingCard && deckId && (
        <PrintingPicker
          scryfallId={printingCard.scryfallId}
          name={displayName(printingCard)}
          onClose={() => setPrintingCard(null)}
          onCover={() => actions.cover(printingCard)}
          onPick={(printing) => run(setDeckCardPrinting(db, deckId, printingCard.imageUrl, printing))}
        />
      )}
      {showShare && activeDeck && (
        <ShareDeckModal
          deck={activeDeck}
          cards={activeCards}
          usesCommander={validation.usesCommander}
          onClose={() => setShowShare(false)}
        />
      )}
      {showStats && activeDeck && (
        <DeckStatsScreen
          cards={activeCards}
          usesCommander={validation.usesCommander}
          onClose={() => setShowStats(false)}
        />
      )}
      {showSynergy && activeDeck && (
        <DeckSynergyScreen
          cards={activeCards}
          usesCommander={validation.usesCommander}
          onAdd={async (card) => {
            await addCardToDeck(db, activeDeck.id, card);
            await refresh();
          }}
          onClose={() => setShowSynergy(false)}
        />
      )}
      {showTokens && <TokensModal tokens={tokens} deckName={activeDeck?.name} onClose={() => setShowTokens(false)} />}
      {printing && activeDeck && (
        <PrintSheet
          title={activeDeck.name}
          cards={groups.flatMap((g) => g.cards).map((c) => ({ name: displayName(c), image: c.imageUrl, copies: c.quantity, basic: isBasicLand(c.typeLine) }))}
          side={validation.usesCommander ? [] : activeSideboard.map((c) => ({ name: displayName(c), image: c.imageUrl, copies: c.quantity, basic: isBasicLand(c.typeLine) }))}
          maybe={activeMaybe.map((c) => ({ name: displayName(c), image: c.imageUrl, copies: c.quantity, basic: isBasicLand(c.typeLine) }))}
          onClose={() => setPrinting(false)}
        />
      )}

      {editing && (
        <DeckFormModal
          title={activeDeck ? 'Guardar mazo' : 'Nuevo mazo'}
          initialName={activeDeck && !unnamed ? activeDeck.name : ''}
          initialFormat={activeDeck?.format ?? null}
          onCancel={() => setEditing(false)}
          onSubmit={save}
        />
      )}

      {preview && (
        <CardSheet
          card={preview.scryfallId}
          exact
          subtitle={`Mazo · ${activeDeck?.name ?? ''}`}
          onClose={() => setPreviewId(null)}
          onPrinting={(c) => {
            if (deckId && c.id !== preview.scryfallId) run(setDeckCardPrinting(db, deckId, preview.imageUrl, c));
          }}
          nav={(() => {
            const order = groups.flatMap((g) => g.cards);
            const index = order.findIndex((c) => c.oracleId === preview.oracleId);
            return index < 0
              ? undefined
              : { index, total: order.length, onMove: (step: number) => order[index + step] && setPreviewId(order[index + step].oracleId) };
          })()}
          extra={
            <View style={{ gap: 8 }}>
              {validation.checked && (
                <View style={[styles.previewStatus, previewIssues ? styles.bannerBad : styles.bannerOk, { alignSelf: 'stretch' }]}>
                  {previewIssues ? (
                    previewIssues.map((issue) => (
                      <Text key={issue} style={styles.bannerText}>
                        ⚠ {issue}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.bannerText}>✓ Sin problemas en {formatLabel(activeDeck?.format ?? null)}</Text>
                  )}
                </View>
              )}
              {/* What only a deck card has: commander, cover, sideboard, remove. */}
              <CardControlsRow>
                {validation.usesCommander && (
                  <CardIconButton
                    icon={preview.isCommander ? 'crown' : 'crown-outline'}
                    hint={preview.isCommander ? 'Quitar de comandante' : 'Hacer comandante'}
                    filled={!!preview.isCommander}
                    onPress={() => actions.commander(preview)}
                  />
                )}
                <CardIconButton icon="image-outline" tone="primary" hint="Usar como portada del mazo" onPress={() => actions.printing(preview)} />
                {!validation.usesCommander && (
                  <CardIconButton icon="tray-arrow-down" hint="Pasar una copia al banquillo" onPress={() => actions.toSide(preview)} />
                )}
                <CardIconButton icon="help-circle-outline" hint="Pasar una copia a Posibles" onPress={() => actions.toMaybe(preview)} />
                <CardIconButton
                  icon="trash-can-outline"
                  hint="Quitar del mazo"
                  danger
                  onPress={() => {
                    setPreviewId(null);
                    actions.confirmRemove(preview);
                  }}
                />
              </CardControlsRow>
            </View>
          }
        />
      )}
    </View>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Icon-only deck action; the row's buttons share its width equally. */
function Action(props: {
  icon: IconName;
  /** Accessibility name of the icon-only button. */
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  /** Accent outline (pending "Guardar"). */
  highlight?: boolean;
  /** Background in the tone's color (Cardmarket). */
  filled?: boolean;
  danger?: boolean;
  /** Color code (see `Tone` in theme). */
  tone?: Tone;
}) {
  const tone: Tone | undefined = props.danger ? 'danger' : props.highlight ? 'primary' : props.tone;
  const color = props.filled ? colors.bg : tone ? TONE_COLORS[tone] : colors.text;
  return (
    <HintButton
      hint={props.hint}
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.action,
        props.highlight && styles.actionHighlight,
        props.filled && [
          styles.actionFilled,
          tone && { backgroundColor: TONE_COLORS[tone], borderColor: TONE_COLORS[tone] },
        ],
        props.disabled && { opacity: 0.35 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <MaterialCommunityIcons name={props.icon} size={22} color={color} />
    </HintButton>
  );
}

interface CardActions {
  add: (c: DeckCard) => void;
  sub: (c: DeckCard) => void;
  /** Trash button: asks first, then the removal can be undone. */
  confirmRemove: (c: DeckCard) => void;
  cover: (c: DeckCard) => void;
  /** Pick another printing of the card: artwork or language. */
  printing: (c: DeckCard) => void;
  /** Moves one copy to the sideboard. */
  toSide: (c: DeckCard) => void;
  /** Moves one copy to «Posibles». */
  toMaybe: (c: DeckCard) => void;
  /** «La quiero» on / off. */
  want: (c: DeckCard) => void;
  /** "La tengo": adds this printing to the collection. */
  own: (c: DeckCard) => void;
  /** Removes one copy of the card from the collection. */
  unown: (c: DeckCard) => void;
  share: (c: DeckCard) => void;
  preview: (c: DeckCard) => void;
  /** Opens the screen with everything Scryfall knows about the card. */
  info: (c: DeckCard) => void;
  commander: (c: DeckCard) => void;
}

interface CardProps {
  card: DeckCard;
  /** Long press on the card image drags it to the sideboard. */
  drag: DragApi;
  actions: CardActions;
  /** Validation problems of this card (red border + messages). */
  issues?: string[];
  /** Show the 👑 commander toggle. */
  crown: boolean;
  /** Copies in the collection; undefined while loading. */
  owned?: number;
  /** Live Scryfall data (price, P/T); undefined until loaded or offline. */
  details?: CardDetails;
  /** Show the card's price (Ajustes → Precios). */
  showPrice: boolean;
  /** What the row shows (Ajustes → Cartas y listas). */
  info?: CardInfo;
  layout?: ListLayout;
  /** Marked as «La quiero». */
  wanted?: boolean;
}

/**
 * "Tienes 2" / "Te falta 1 (tienes 1)" / "No la tienes" under a deck card, from the collection.
 * Tapping it ("+ La tengo") adds this printing to the collection.
 */
function OwnedLine({
  owned,
  needed,
  onOwn,
  onUnown,
  wanted,
  onWant,
}: {
  owned?: number;
  needed: number;
  onOwn: () => void;
  onUnown: () => void;
  wanted?: boolean;
  onWant?: () => void;
}) {
  const { prefs } = useAppState();
  if (owned === undefined || prefs.showOwned === false) return null;
  const short = needed - owned;
  return (
    <View style={styles.ownedLine}>
      <MaterialCommunityIcons
        name={short <= 0 ? 'package-variant-closed-check' : 'package-variant-closed'}
        size={15}
        color={short <= 0 ? colors.add : colors.undo}
      />
      <Text style={[styles.owned, short > 0 && styles.ownedShort, { flexShrink: 1 }]}>
        {short <= 0
          ? `En tu colección: ${owned}`
          : owned > 0
            ? `Te ${short === 1 ? 'falta' : 'faltan'} ${short} (tienes ${owned})`
            : 'No la tienes en tu colección'}
      </Text>
      {owned > 0 && (
        <Pressable
          onPress={onUnown}
          hitSlop={8}
          style={({ pressed }) => [styles.ownStep, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Quitar una de tu colección"
        >
          <Text style={styles.ownRemove}>−</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onOwn}
        hitSlop={8}
        style={({ pressed }) => [styles.ownStep, pressed && { opacity: 0.6 }]}
        accessibilityLabel="La tengo: añadir a tu colección"
      >
        <Text style={styles.ownAdd}>{owned > 0 ? '＋' : '＋ La tengo'}</Text>
      </Pressable>
      {onWant && short > 0 && (
        <Pressable
          onPress={onWant}
          hitSlop={8}
          style={({ pressed }) => [styles.ownStep, { flexDirection: 'row', gap: 3 }, pressed && { opacity: 0.6 }]}
          accessibilityLabel={wanted ? 'Quitar de «La quiero»' : 'La quiero: apúntala para conseguirla'}
        >
          <MaterialCommunityIcons name={wanted ? 'heart' : 'heart-outline'} size={15} color={wanted ? WANT_COLOR : colors.textMuted} />
          <Text style={[styles.ownAdd, { color: wanted ? WANT_COLOR : colors.textMuted }]}>{wanted ? 'La quieres' : 'La quiero'}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * One-line "✓ Válido" / "⚠ N problemas" summary in the deck sheet's fixed header (so it can
 * be dragged like the rest of it). Tapping it lists the deck-level problems and every card
 * with its own problems in a popup; tapping a card there opens it.
 */
function ValidationBanner(props: {
  validation: DeckValidation;
  format: string | null;
  cards: DeckCard[];
  onOpenCard: (card: DeckCard) => void;
}) {
  const { validation: v, format, cards, onOpenCard } = props;
  const [open, setOpen] = useState(false);
  // Only when there are problems: a red ⚠ with how many; tap it for the list.
  if (!v.checked || v.valid) return null;
  const badCards = cards.filter((c) => v.cardIssues[c.oracleId]);
  const count = v.issues.length + badCards.reduce((n, c) => n + v.cardIssues[c.oracleId].length, 0);
  const title = v.valid
    ? `Mazo válido para ${formatLabel(format)}`
    : `${count} ${count === 1 ? 'problema' : 'problemas'} para ${formatLabel(format)}`;
  return (
    <>
      <HintButton hint={title} style={styles.issuesIcon} onPress={() => setOpen(true)} hitSlop={4}>
        <MaterialCommunityIcons name="alert-outline" size={17} color={colors.discard} />
        <Text style={styles.issuesIconText}>{count}</Text>
      </HintButton>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.issuesBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.issuesBox} onPress={() => {}}>
            <View style={styles.issuesHeader}>
              <MaterialCommunityIcons name="alert-outline" size={22} color={colors.discard} />
              <Text style={styles.issuesTitle}>{title}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Cerrar">
                <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 6 }}>
              {v.issues.map((issue) => (
                <Text key={issue} style={styles.bannerText}>
                  • {issue}
                </Text>
              ))}
              {badCards.length > 0 && (
                <Text style={styles.bannerSubtitle}>Cartas ({badCards.length}) · toca para verla</Text>
              )}
              {badCards.map((card) => (
                <Pressable
                  key={card.oracleId}
                  style={styles.bannerCard}
                  onPress={() => {
                    setOpen(false);
                    onOpenCard(card);
                  }}
                >
                  <Text style={styles.bannerCardName}>
                    {v.usesCommander && card.isCommander ? '👑 ' : ''}
                    {displayName(card)}
                    {card.quantity > 1 ? ` ×${card.quantity}` : ''}
                  </Text>
                  {v.cardIssues[card.oracleId].map((issue) => (
                    <Text key={issue} style={styles.bannerCardIssue}>
                      {issue}
                    </Text>
                  ))}
                </Pressable>
              ))}
              {v.pendingData > 0 && (
                <Text style={styles.bannerText}>Cargando datos de {v.pendingData} cartas para comprobarlas…</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function CardIssues({ issues }: { issues?: string[] }) {
  if (!issues?.length) return null;
  return (
    <View style={styles.issues}>
      {issues.map((i) => (
        <Text key={i} style={styles.issueText}>
          ⚠ {i}
        </Text>
      ))}
    </View>
  );
}

/** One card of the list view, with the same data the web table showed. */
/** «Texto» view line: copies · name · ⚠ · tags · ✓ / falta N · − ＋ · mana cost (like the shared deck list). */
function TextRow(props: Parameters<typeof TextRowInner>[0]) {
  const { prefs } = useAppState();
  return <TextRowInner {...props} showOwned={prefs.showOwned !== false} />;
}

function TextRowInner({
  card,
  issues,
  owned,
  tags,
  onPress,
  onAdd,
  onSub,
  showOwned = true,
}: {
  showOwned?: boolean;
  card: DeckCard;
  issues?: string[];
  owned?: number;
  tags: Tag[];
  onPress: () => void;
  onAdd: () => void;
  onSub: () => void;
}) {
  const missing = owned === undefined ? null : Math.max(0, card.quantity - owned);
  return (
    <View style={styles.textRow}>
      <Text style={styles.textQty}>{card.quantity}</Text>
      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={onPress} accessibilityLabel={`Ver ${displayName(card)}`}>
        <Text style={styles.textName} numberOfLines={1}>
          {displayName(card)}
          {issues ? <Text style={{ color: colors.discard }}> ⚠</Text> : null}
        </Text>
        {tags.length > 0 && (
          <View style={styles.textTags}>
            {tags.map((t) => (
              <TagChip key={t.uid} tag={t} small />
            ))}
          </View>
        )}
      </Pressable>
      {missing !== null && showOwned && (
        <Text style={[styles.textNote, { color: missing ? colors.undo : colors.add }]}>{missing ? `falta ${missing}` : '✓'}</Text>
      )}
      <Pressable style={styles.textStep} onPress={onSub} hitSlop={4} accessibilityLabel="Quitar una copia">
        <MaterialCommunityIcons name="minus" size={14} color={colors.text} />
      </Pressable>
      <Pressable style={styles.textStep} onPress={onAdd} hitSlop={4} accessibilityLabel="Añadir una copia">
        <MaterialCommunityIcons name="plus" size={14} color={colors.text} />
      </Pressable>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>
        <ManaCost cost={card.manaCost} />
      </View>
    </View>
  );
}

/** Color of a row's border (Ajustes → Código de colores): green = you have all the copies, pink = you want it. */
function useRowTint(owned: number | undefined, needed: number, wanted: boolean) {
  const { prefs } = useAppState();
  if (prefs.colorCode === false) return null;
  if (owned !== undefined && owned >= needed) return { borderColor: colors.add };
  if (wanted) return { borderColor: '#ff7a9c' };
  return null;
}

function CardRow({ card, actions, issues, crown, owned, drag, wanted, info, layout }: CardProps) {
  const tint = useRowTint(owned, card.quantity, !!wanted);
  return (
    <View style={[styles.row, tint, issues && styles.invalid, crown && !!card.isCommander && styles.commander]}>
      <View style={styles.rowTop}>
        <Draggable oracleId={card.oracleId} from="main" drag={drag}>
          <Pressable onPress={() => actions.preview(card)}>
            {card.imageUrl && <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" />}
          </Pressable>
        </Draggable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>
            {crown && card.isCommander ? '👑 ' : ''}
            {displayName(card)}
          </Text>
          {info && layout && <RowLines layout={layout} info={info} />}
        </View>
      </View>

      <OwnedLine
        owned={owned}
        needed={card.quantity}
        onOwn={() => actions.own(card)}
        onUnown={() => actions.unown(card)}
        wanted={wanted}
        onWant={() => actions.want(card)}
      />
      <CardIssues issues={issues} />

      <CardControls card={card} actions={actions} crown={crown} />
    </View>
  );
}

/** "Grande" view: the card at full width (like the swipe stack) with its controls below. */
function BigCard({ card, actions, issues, crown, owned, details, showPrice, drag, wanted }: CardProps) {
  const tint = useRowTint(owned, card.quantity, !!wanted);
  return (
    <View style={[styles.big, tint, issues && styles.invalid, crown && !!card.isCommander && styles.commander]}>
      <Draggable oracleId={card.oracleId} from="main" drag={drag}>
        <Pressable onPress={() => actions.preview(card)}>
          {card.imageUrl && (
            <Image
              source={{ uri: card.imageUrl }}
              // Thumbnail first (usually cached), full image when it arrives.
              placeholder={{ uri: smallImageUrl(card.imageUrl) }}
              placeholderContentFit="contain"
              style={styles.bigImage}
              contentFit="contain"
              recyclingKey={card.oracleId}
              transition={120}
            />
          )}
          <Text style={styles.bigBadge}>
            {crown && card.isCommander ? '👑 ' : ''}x{card.quantity}
            {showPrice && details?.eur != null ? ` · ${formatEur(details.eur)}` : ''}
          </Text>
        </Pressable>
      </Draggable>
      <OwnedLine
        owned={owned}
        needed={card.quantity}
        onOwn={() => actions.own(card)}
        onUnown={() => actions.unown(card)}
        wanted={wanted}
        onWant={() => actions.want(card)}
      />
      <CardIssues issues={issues} />
      <CardControls card={card} actions={actions} crown={crown} />
    </View>
  );
}

/** "F/R 3/4", "Lealtad 5" or "Defensa 4", from the card's live data. */
function statsOf(d?: CardDetails): { label: string; value: string } | null {
  if (!d) return null;
  if (d.power != null && d.toughness != null) return { label: 'F/R', value: `${d.power}/${d.toughness}` };
  if (d.loyalty != null) return { label: 'Lealtad', value: d.loyalty };
  if (d.defense != null) return { label: 'Defensa', value: d.defense };
  return null;
}

/** Quantity stepper + icon buttons under a deck card (same look as the header's actions). */
/**
 * A secondary zone of the deck under its cards (collapsible): the sideboard or «Posibles». Neither counts
 * for the deck's size, curve, stats or price. Sideboard cards can also be dragged back to the main deck.
 */
function ZoneSection({
  zone,
  title,
  icon,
  empty,
  cards,
  moves,
  onAdd,
  onSub,
  onMove,
  drag,
  open,
  onToggle,
}: {
  zone: 'side' | 'maybe';
  title: string;
  icon: IconName;
  empty: string;
  cards: DeckCard[];
  moves: { to: Zone; icon: IconName; hint: string }[];
  onAdd: (c: DeckCard) => void;
  onSub: (c: DeckCard) => void;
  onMove: (c: DeckCard, to: Zone) => void;
  drag: DragApi;
  open: boolean;
  onToggle: () => void;
}) {
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  const info = (c: DeckCard) => (
    <>
      <View style={styles.sideThumb}>
        {c.imageUrl && (
          <Image source={{ uri: smallImageUrl(c.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sideName} numberOfLines={1}>
          {displayName(c)}
        </Text>
        <Text style={styles.sideType} numberOfLines={1}>
          {c.typeLine}
        </Text>
      </View>
    </>
  );
  return (
    <View style={styles.side}>
      <Pressable style={styles.sideHeader} onPress={onToggle} accessibilityRole="button">
        <MaterialCommunityIcons name={icon} size={20} color={colors.accent} />
        <Text style={styles.sideTitle}>
          {title} ({total})
        </Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
      </Pressable>
      {open && cards.length === 0 && <Text style={styles.sideType}>{empty}</Text>}
      {open &&
        cards.map((c) => (
          <View key={c.oracleId} style={styles.sideRow}>
            {zone === 'side' ? (
              <Draggable oracleId={c.oracleId} from="side" drag={drag} style={styles.sideDrag}>
                {info(c)}
              </Draggable>
            ) : (
              <View style={styles.sideDrag}>{info(c)}</View>
            )}
            <QuantityStepper value={c.quantity} onSub={() => onSub(c)} onAdd={() => onAdd(c)} />
            {moves.map((m) => (
              <HintButton key={m.to} hint={m.hint} style={styles.sideMove} onPress={() => onMove(c, m.to)} hitSlop={4}>
                <MaterialCommunityIcons name={m.icon} size={20} color={colors.text} />
              </HintButton>
            ))}
          </View>
        ))}
    </View>
  );
}

/**
 * Makes its content draggable after a long press (a quick touch still scrolls the list or
 * presses buttons). Positions go to the sheet's shared values; the sheet draws the card
 * following the finger and decides where it was dropped.
 */
function Draggable({
  oracleId,
  from,
  drag,
  style,
  children,
}: {
  oracleId: string;
  from: Side;
  drag: DragApi;
  style?: ComponentProps<typeof View>['style'];
  children: ReactNode;
}) {
  const { x, y, start, end } = drag;
  const pan = usePanGesture({
    activateAfterLongPress: 350,
    onActivate: (e) => {
      x.set(e.absoluteX);
      y.set(e.absoluteY);
      scheduleOnRN(start, oracleId, from);
    },
    onUpdate: (e) => {
      x.set(e.absoluteX);
      y.set(e.absoluteY);
    },
    onDeactivate: (e) => {
      scheduleOnRN(end, e.absoluteY, !e.canceled);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={style}>
        {children}
      </View>
    </GestureDetector>
  );
}

/** One card of the gallery view: thumbnail, copies (👑 for commanders) and a ⚠ mark. */
function GalleryTile({
  card,
  info,
  layout,
  invalid,
  onPress,
}: {
  card: DeckCard;
  /** What the tile's icons show, and where (Ajustes → Cartas y listas). */
  info: CardInfo;
  layout: GalleryLayout;
  invalid: boolean;
  crown: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.galleryItem, invalid && styles.galleryInvalid]} onPress={onPress}>
      {card.imageUrl && (
        // Gallery tiles are small: the ~15 KB thumbnail is enough and loads fast.
        <Image
          source={{ uri: smallImageUrl(card.imageUrl) }}
          style={styles.galleryImage}
          contentFit="contain"
          recyclingKey={card.oracleId}
        />
      )}
      <TileIcons layout={layout} info={info} />
    </Pressable>
  );
}

function CardControls({ card, actions, crown }: { card: DeckCard; actions: CardActions; crown: boolean }) {
  return (
    <CardControlsRow>
      <QuantityStepper value={card.quantity} onSub={() => actions.sub(card)} onAdd={() => actions.add(card)} />
      {crown && (
        <CardIconButton
          icon={card.isCommander ? 'crown' : 'crown-outline'}
          hint={card.isCommander ? 'Quitar de comandante' : 'Hacer comandante'}
          filled={!!card.isCommander}
          onPress={() => actions.commander(card)}
        />
      )}
      <CardIconButton icon="information-outline" hint="Ficha completa" tone="info" onPress={() => actions.info(card)} />
      <CardIconButton
        icon="pencil-outline"
        tone="primary"
        hint="Editar: arte, idioma o portada"
        onPress={() => actions.printing(card)}
      />
      {/* Commander-style decks have no sideboard (the crown takes that place). */}
      {!crown && (
        <CardIconButton
          icon="tray-arrow-down"
          hint="Pasar una copia al banquillo"
          onPress={() => actions.toSide(card)}
        />
      )}
      <CardIconButton icon="help-circle-outline" hint="Pasar una copia a Posibles" onPress={() => actions.toMaybe(card)} />
      <CardIconButton icon="share-variant-outline" hint="Compartir" onPress={() => actions.share(card)} />
      <CardIconButton
        icon="trash-can-outline"
        hint="Quitar del mazo"
        danger
        onPress={() => actions.confirmRemove(card)}
      />
    </CardControlsRow>
  );
}

const DECK_SORTS: { key: DeckSort; label: string }[] = [
  { key: 'cmc', label: 'Coste de maná' },
  { key: 'name', label: 'Nombre' },
  { key: 'added', label: 'Orden de añadido (primero lo más antiguo)' },
  { key: 'addedNew', label: 'Orden de añadido (primero lo último)' },
  { key: 'copies', label: 'Número de copias' },
];

const styles = StyleSheet.create({
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
  menuDone: { marginTop: 4, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: colors.accent },
  menuDoneText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  issuesIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.discard,
  },
  issuesIconText: { color: colors.discard, fontWeight: '900', fontSize: 13 },
  tokensRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.info,
    backgroundColor: colors.surface,
  },
  tokensTitle: { color: colors.info, fontWeight: '900', fontSize: 15 },
  tokensCount: { color: colors.text, fontWeight: '900' },
  tokensHint: { flex: 1, color: colors.textMuted, fontSize: 12 },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  subTitle: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  subCount: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  textQty: { color: colors.accent, fontWeight: '900', fontSize: 14, width: 22, textAlign: 'right' },
  textName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  textTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 2 },
  textNote: { fontSize: 11, fontWeight: '800' },
  textStep: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCommanders: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 10 },
  textCommanderImage: { width: 150, height: 209, borderRadius: 9 },
  textCommanderName: { color: colors.accent, fontWeight: '800', fontSize: 13, maxWidth: 160 },
  sheet: { flex: 1, backgroundColor: colors.surface },
  side: {
    marginTop: 16,
    marginHorizontal: 12,
    padding: 10,
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  sideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideDrag: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideThumb: {
    width: 34,
    aspectRatio: 488 / 680,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  sideName: { color: colors.text, fontWeight: '800' },
  sideType: { color: colors.textMuted, fontSize: 11 },
  sideMove: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  top: { borderBottomWidth: 1, borderBottomColor: colors.border },
  titleRow: { paddingHorizontal: 14 },
  // Under the cover + name: collection status, view switch, buttons toggle.
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 },
  ownedSummary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolsToggle: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  toolsToggleOpen: { borderColor: colors.accent },
  ownedSummaryText: { fontSize: 13, fontWeight: '700' },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  action: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionHighlight: { borderColor: colors.accent },
  actionFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 24 },
  row: {
    marginHorizontal: 10,
    marginTop: 8,
    padding: 10,
    gap: 8,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', gap: 10 },
  thumb: { width: 70, height: 98, borderRadius: 5 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  type: { color: '#47ace2' },
  oracle: { color: colors.textMuted, fontSize: 12 },
  data: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  datumLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  datumValue: { color: colors.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 10,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  issuesBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  issuesBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.discard,
    padding: 16,
    gap: 12,
    maxHeight: '85%',
  },
  issuesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  issuesTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  bannerOk: {
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderColor: colors.add,
  },
  bannerBad: {
    backgroundColor: 'rgba(231,76,60,0.12)',
    borderColor: colors.discard,
  },
  bannerNeutral: { backgroundColor: colors.bg, borderColor: colors.border },
  bannerTitle: { color: colors.text, fontWeight: '800' },
  bannerText: { color: colors.text, fontSize: 13 },
  bannerCards: { gap: 6, marginTop: 4 },
  bannerSubtitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  bannerCard: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 2,
  },
  bannerCardName: { color: colors.text, fontWeight: '800' },
  bannerCardIssue: { color: '#ff8a80', fontSize: 12 },
  warnBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.discard,
    color: '#fff',
    fontWeight: '900',
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  previewStatus: {
    alignSelf: 'stretch',
    padding: 10,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
  },
  invalid: { borderColor: colors.discard, borderWidth: 2 },
  commander: { borderColor: colors.accent, borderWidth: 2 },
  issues: {
    gap: 2,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(231,76,60,0.15)',
  },
  issueText: { color: '#ff8a80', fontSize: 12, fontWeight: '600' },
  owned: { color: colors.add, fontSize: 12, fontWeight: '700' },
  ownedShort: { color: colors.undo },
  galleryInvalid: {
    borderWidth: 2,
    borderColor: colors.discard,
    borderRadius: 10,
  },
  viewSwitch: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  viewOption: { width: 34, height: 28, alignItems: 'center', justifyContent: 'center' },
  viewOptionSelected: { backgroundColor: colors.accent },
  big: {
    marginHorizontal: 10,
    marginTop: 12,
    padding: 8,
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bigImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 14 },
  bigBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  galleryRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, marginTop: 6 },
  galleryCell: { width: '31.5%' },
  ownedChip: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.bg,
    maxWidth: 96,
  },
  ownedChipValue: { fontWeight: '900', fontSize: 13 },
  ownedChipLabel: { color: colors.textMuted, fontSize: 9, textAlign: 'center' },
  ownedBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ownAdd: { color: colors.add, fontWeight: '900', fontSize: 13 },
  ownRemove: { color: colors.discard, fontWeight: '900', fontSize: 16 },
  ownStep: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryItem: { width: '100%', aspectRatio: 488 / 680 },
  groupButton: {
    width: 34,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 4,
  },
  groupTitle: { flex: 1, color: colors.accent, fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  groupCount: { color: colors.textMuted, fontWeight: '800' },
  groupMenu: {
    alignSelf: 'stretch',
    gap: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  groupMenuTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  groupOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  groupOptionOn: { backgroundColor: colors.surfaceAlt },
  groupOptionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  groupMenuHelp: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  dropZone: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: DROP_ZONE_HEIGHT,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dropText: { color: colors.text, fontWeight: '900' },
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GHOST_WIDTH,
    aspectRatio: 488 / 680,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
    elevation: 12,
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  modalImage: { width: '100%', maxHeight: '62%', aspectRatio: 488 / 680, borderRadius: 16 },
  previewControls: { alignSelf: 'stretch' },
});
