import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
// RNGH lists cooperate with the rows' swipe-to-delete gesture.
import { FlatList } from 'react-native-gesture-handler';
import { displayName, getCardsByIds, smallImageUrl, type CardDetails } from '@/api/scryfall';
import { SheetDragArea } from '@/components/BottomSheet';
import { DeckFormModal } from '@/components/DeckFormModal';
import { DeckPicker } from '@/components/deck/DeckPicker';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { CardControlsRow, CardIconButton, QuantityStepper, UndoBar } from '@/components/CardControls';
import { CardShareSheet, type ShareableCard } from '@/components/CardShareSheet';
import { PrintingPicker } from '@/components/PrintingPicker';
import { LanguagePill } from '@/components/LanguagePicker';
import { DeckSummary } from '@/components/deck/DeckSummary';
import { DeckStatsScreen } from '@/components/deck/DeckStatsScreen';
import { ShareDeckModal } from '@/components/deck/ShareDeckModal';
import { DeckSynergyScreen } from '@/components/deck/DeckSynergyScreen';
import { MissingCardsModal, type MissingCard } from '@/components/deck/MissingCardsModal';
import { deckTokens, TokensModal } from '@/components/deck/TokensModal';
import { ManaCost } from '@/components/ManaCost';
import { useCardDetails } from '@/hooks/useCardDetails';
import { UNNAMED_DECK, useAppState, type DeckView } from '@/context/AppState';
import {
  addCardToDeck,
  changeQuantity,
  changeSideboardQuantity,
  moveCopy,
  clearDeck,
  createDeck,
  deleteDeck,
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
} from '@/db/database';
import { RARITY_LABELS } from '@/icons';
import { colors, formatEur, formatLabel } from '@/theme';
import { validateDeck, type DeckValidation } from '@/validation';

const VIEWS: { key: DeckView; label: string; icon: IconName }[] = [
  { key: 'list', label: 'Lista', icon: 'format-list-bulleted' },
  { key: 'gallery', label: 'Galería', icon: 'view-grid-outline' },
  { key: 'big', label: 'Grande', icon: 'view-agenda-outline' },
];

/**
 * Content of the deck bottom sheet (the web's MazoConstructor + Mazos): deck actions,
 * deck picker, then the active deck's cards as a detailed list, an image gallery, or
 * one big card per row. Opens in the view chosen in settings.
 */
export function DeckSheet() {
  const db = useSQLiteContext();
  const { activeDeck, activeCards, activeSideboard, setActiveDeckId, refresh, prefs, setPrefs } = useAppState();
  const [mode, setMode] = useState<DeckView>(prefs.deckView);
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
  useEffect(() => {
    let cancelled = false;
    getOwnedCounts(
      db,
      activeCards.map((c) => c.oracleId),
    ).then((counts) => {
      if (!cancelled) setOwned(counts);
    });
    return () => {
      cancelled = true;
    };
  }, [db, activeCards]);
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
  const [showSynergy, setShowSynergy] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCard, setShareCard] = useState<ShareableCard | null>(null);
  const [printingCard, setPrintingCard] = useState<DeckCard | null>(null);
  // "Mis mazos" drops down from the cover, like a select.
  const [picking, setPicking] = useState(false);
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

  const remove = () =>
    activeDeck &&
    confirm('Borrar mazo', `¿Borrar "${activeDeck.name}"?`, async () => {
      const snapshot = await snapshotDeck(db, activeDeck.id, { withDeck: true });
      await deleteDeck(db, activeDeck.id);
      setActiveDeckId(null);
      offerUndo(`«${activeDeck.name}» borrado`, snapshot);
    });

  const deckId = activeDeck?.id;
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
    toSide: (c) => deckId && run(moveCopy(db, deckId, c.oracleId, 'side')),
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
        <DeckSummary onPressCover={() => setPicking((p) => !p)} pickerOpen={picking} />
      </View>

      {/* Without a deck the picker is the only way forward: always show it then. */}
      {(picking || !activeDeck) && <DeckPicker onPicked={() => setPicking(false)} />}

      <View style={styles.titleRow}>
        {activeDeck && (
          <View style={styles.infoRow}>
            {missing !== null && activeCards.length > 0 ? (
              <View style={styles.ownedSummary}>
                <MaterialCommunityIcons
                  name="package-variant-closed"
                  size={16}
                  color={missing ? colors.undo : colors.add}
                />
                <Text
                  style={[styles.ownedSummaryText, { color: missing ? colors.undo : colors.add }]}
                  numberOfLines={1}
                >
                  {missing === 0
                    ? 'Las tienes todas en tu colección'
                    : `Te ${missing === 1 ? 'falta' : 'faltan'} ${missing} de tu colección`}
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {activeCards.length > 0 && (
              <View style={styles.viewSwitch}>
                {VIEWS.map((v) => (
                  <Pressable
                    key={v.key}
                    style={[styles.viewOption, mode === v.key && styles.viewOptionSelected]}
                    onPress={() => setMode(v.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Vista ${v.label}`}
                    accessibilityState={{ selected: mode === v.key }}
                  >
                    <MaterialCommunityIcons
                      name={v.icon}
                      size={18}
                      color={mode === v.key ? colors.bg : colors.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable
              style={[styles.toolsToggle, !toolsHidden && styles.toolsToggleOpen]}
              onPress={() => setPrefs({ ...prefs, deckToolsHidden: !toolsHidden })}
              accessibilityRole="button"
              accessibilityLabel={toolsHidden ? 'Mostrar botones' : 'Ocultar botones'}
              hitSlop={6}
            >
              <MaterialCommunityIcons
                name={toolsHidden ? 'dots-horizontal' : 'chevron-up'}
                size={20}
                color={toolsHidden ? colors.text : colors.accent}
              />
            </Pressable>
          </View>
        )}
      </View>

      {activeDeck && activeCards.length > 0 && (
        <ValidationBanner
          validation={validation}
          format={activeDeck.format}
          cards={activeCards}
          onOpenCard={(c) => setPreviewId(c.oracleId)}
        />
      )}

      {activeDeck && !toolsHidden && (
        <View style={styles.actions}>
          <Action
            icon={unnamed ? 'content-save-outline' : 'pencil-outline'}
            hint={unnamed ? 'Guardar' : 'Editar'}
            highlight={unnamed}
            onPress={() => setEditing(true)}
          />
          <Action
            icon="share-variant-outline"
            hint="Compartir"
            onPress={() => setShowShare(true)}
            disabled={!activeCards.length}
          />
          {!!missing && (
            <Action icon="cart-outline" hint="Comprar en Cardmarket" filled onPress={() => setShopping(true)} />
          )}
          {activeCards.length > 0 && (
            <Action icon="chart-bar" hint="Estadísticas y mano de prueba" onPress={() => setShowStats(true)} />
          )}
          {activeCards.length > 0 && (
            <Action icon="puzzle-outline" hint="Sinergias y combos" onPress={() => setShowSynergy(true)} />
          )}
          {tokens.length > 0 && (
            <Action icon="cards-outline" hint={`Fichas (${tokens.length})`} onPress={() => setShowTokens(true)} />
          )}
          <Action icon="broom" hint="Vaciar" onPress={clear} disabled={!activeCards.length} />
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
    </View>
  );

  return (
    <View style={styles.sheet}>
      <SheetDragArea>{header}</SheetDragArea>
      <FlatList
        key={mode} // numColumns can't change on the fly
        data={activeDeck ? activeCards : []}
        keyExtractor={(c) => c.oracleId}
        numColumns={mode === 'gallery' ? 3 : 1}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          activeDeck && activeSideboard.length > 0 ? (
            <SideboardSection
              cards={activeSideboard}
              onAdd={(c) => run(changeSideboardQuantity(db, activeDeck.id, c.oracleId, 1))}
              onSub={(c) => run(changeSideboardQuantity(db, activeDeck.id, c.oracleId, -1))}
              onToMain={(c) => run(moveCopy(db, activeDeck.id, c.oracleId, 'main'))}
            />
          ) : undefined
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        columnWrapperStyle={mode === 'gallery' ? styles.galleryRow : undefined}
        nestedScrollEnabled
        ListEmptyComponent={
          activeDeck ? (
            <Text style={styles.empty}>Mazo vacío. Desliza cartas a la derecha para añadirlas.</Text>
          ) : undefined
        }
        initialNumToRender={mode === 'big' ? 2 : 8}
        windowSize={mode === 'big' ? 3 : 7}
        renderItem={({ item }) =>
          mode === 'list' ? (
            <CardRow
              card={item}
              actions={actions}
              issues={validation.cardIssues[item.oracleId]}
              crown={validation.usesCommander}
              owned={owned?.[item.oracleId]}
              details={details[item.scryfallId]}
              showPrice={prefs.pricesDeckCards}
            />
          ) : mode === 'big' ? (
            <BigCard
              card={item}
              actions={actions}
              issues={validation.cardIssues[item.oracleId]}
              crown={validation.usesCommander}
              owned={owned?.[item.oracleId]}
              details={details[item.scryfallId]}
              showPrice={prefs.pricesDeckCards}
            />
          ) : (
            <Pressable
              style={[styles.galleryItem, validation.cardIssues[item.oracleId] && styles.galleryInvalid]}
              onPress={() => actions.preview(item)}
            >
              {item.imageUrl && (
                // Gallery tiles are small: the ~15 KB thumbnail is enough and loads fast.
                <Image
                  source={{ uri: smallImageUrl(item.imageUrl) }}
                  style={styles.galleryImage}
                  contentFit="contain"
                  recyclingKey={item.oracleId}
                />
              )}
              <Text style={styles.badge}>
                {validation.usesCommander && item.isCommander ? '👑 ' : ''}x{item.quantity}
              </Text>
              {validation.cardIssues[item.oracleId] && <Text style={styles.warnBadge}>⚠</Text>}
            </Pressable>
          )
        }
      />

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
      {showTokens && <TokensModal tokens={tokens} onClose={() => setShowTokens(false)} />}

      {editing && (
        <DeckFormModal
          title={activeDeck ? 'Guardar mazo' : 'Nuevo mazo'}
          initialName={activeDeck && !unnamed ? activeDeck.name : ''}
          initialFormat={activeDeck?.format ?? null}
          onCancel={() => setEditing(false)}
          onSubmit={save}
        />
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreviewId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewId(null)}>
          {preview?.imageUrl && (
            <Image
              source={{ uri: preview.imageUrl }}
              placeholder={{ uri: smallImageUrl(preview.imageUrl) }}
              placeholderContentFit="contain"
              style={styles.modalImage}
              contentFit="contain"
            />
          )}
          {preview && deckId && (
            <LanguagePill
              card={preview.scryfallId}
              onPick={(c) => {
                if (c.id !== preview.scryfallId) run(setDeckCardPrinting(db, deckId, preview.imageUrl, c));
              }}
            />
          )}
          {preview && validation.checked && (
            <View style={[styles.previewStatus, previewIssues ? styles.bannerBad : styles.bannerOk]}>
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
          {/* The same buttons as in the list: the gallery tiles are too small for them. Buttons that
              open another screen close this one first. */}
          {preview && (
            <Pressable style={styles.previewControls} onPress={() => {}}>
              <CardControls
                card={preview}
                crown={validation.usesCommander}
                actions={{
                  ...actions,
                  info: (c) => (setPreviewId(null), actions.info(c)),
                  share: (c) => (setPreviewId(null), actions.share(c)),
                  printing: (c) => (setPreviewId(null), actions.printing(c)),
                  confirmRemove: (c) => (setPreviewId(null), actions.confirmRemove(c)),
                }}
              />
            </Pressable>
          )}
        </Pressable>
      </Modal>
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
  /** Accent background (Cardmarket). */
  filled?: boolean;
  danger?: boolean;
}) {
  const color = props.filled
    ? colors.bg
    : props.danger
      ? colors.discard
      : props.highlight
        ? colors.accent
        : colors.text;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.hint}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.action,
        props.highlight && styles.actionHighlight,
        props.filled && styles.actionFilled,
        props.disabled && { opacity: 0.35 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <MaterialCommunityIcons name={props.icon} size={22} color={color} />
    </Pressable>
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
  share: (c: DeckCard) => void;
  preview: (c: DeckCard) => void;
  /** Opens the screen with everything Scryfall knows about the card. */
  info: (c: DeckCard) => void;
  commander: (c: DeckCard) => void;
}

interface CardProps {
  card: DeckCard;
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
}

/** "📦 Tienes 2" / "📦 Te falta 1 (tienes 1)" line under a deck card. */
function OwnedLine({ owned, needed }: { owned?: number; needed: number }) {
  if (owned === undefined) return null;
  const short = needed - owned;
  return (
    <Text style={[styles.owned, short > 0 && styles.ownedShort]}>
      {short <= 0
        ? `📦 Tienes ${owned}`
        : owned > 0
          ? `📦 Te ${short === 1 ? 'falta' : 'faltan'} ${short} (tienes ${owned})`
          : `📦 No la tienes`}
    </Text>
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
  if (!v.checked) {
    return (
      <View style={[styles.banner, styles.bannerNeutral]}>
        <MaterialCommunityIcons name="information-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.bannerText, { flex: 1 }]} numberOfLines={2}>
          Formato libre: sin comprobaciones. Elige un formato al editar.
        </Text>
      </View>
    );
  }
  const badCards = cards.filter((c) => v.cardIssues[c.oracleId]);
  const count = v.issues.length + badCards.reduce((n, c) => n + v.cardIssues[c.oracleId].length, 0);
  const title = v.valid
    ? `Mazo válido para ${formatLabel(format)}`
    : `${count} ${count === 1 ? 'problema' : 'problemas'} para ${formatLabel(format)}`;
  return (
    <>
      <Pressable
        style={[styles.banner, v.valid ? styles.bannerOk : styles.bannerBad]}
        onPress={() => setOpen(true)}
        disabled={v.valid}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name={v.valid ? 'check-circle-outline' : 'alert-outline'}
          size={18}
          color={v.valid ? colors.add : colors.discard}
        />
        <Text style={[styles.bannerTitle, { flex: 1 }]} numberOfLines={1}>
          {title}
          {v.pendingData > 0 ? ' · comprobando…' : ''}
        </Text>
        {!v.valid && <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />}
      </Pressable>

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
function CardRow({ card, actions, issues, crown, owned, details, showPrice }: CardProps) {
  const [types, subtypes] = card.typeLine.split(' — ');
  const stats = statsOf(details);
  return (
    <View style={[styles.row, issues && styles.invalid, crown && !!card.isCommander && styles.commander]}>
      <View style={styles.rowTop}>
        <Pressable onPress={() => actions.preview(card)}>
          {card.imageUrl && <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" />}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>
            {crown && card.isCommander ? '👑 ' : ''}
            {displayName(card)}
          </Text>
          <Text style={styles.type}>{card.typeLine}</Text>
          {!!card.oracleText && (
            <Text style={styles.oracle} numberOfLines={4}>
              {card.oracleText}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.data}>
        <Datum label="Maná">
          <ManaCost cost={card.manaCost} />
        </Datum>
        {stats && <Datum label={stats.label} value={stats.value} />}
        {showPrice && details?.eur != null && <Datum label="Precio" value={formatEur(details.eur)} />}
        <Datum label="Rareza" value={card.rarity ? (RARITY_LABELS[card.rarity] ?? card.rarity) : '—'} />
        <Datum label="Tipos" value={types} />
        {!!subtypes && <Datum label="Subtipos" value={subtypes} />}
      </View>

      <OwnedLine owned={owned} needed={card.quantity} />
      <CardIssues issues={issues} />

      <CardControls card={card} actions={actions} crown={crown} />
    </View>
  );
}

/** "Grande" view: the card at full width (like the swipe stack) with its controls below. */
function BigCard({ card, actions, issues, crown, owned, details, showPrice }: CardProps) {
  return (
    <View style={[styles.big, issues && styles.invalid, crown && !!card.isCommander && styles.commander]}>
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
      <OwnedLine owned={owned} needed={card.quantity} />
      <CardIssues issues={issues} />
      <CardControls card={card} actions={actions} crown={crown} />
    </View>
  );
}

function Datum({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={styles.datumLabel}>{label}</Text>
      {children ?? <Text style={styles.datumValue}>{value}</Text>}
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
 * The deck's sideboard under its cards (collapsible): not counted in size, curve or stats.
 * Each card: copies and a button that moves one copy to the main deck.
 */
function SideboardSection({
  cards,
  onAdd,
  onSub,
  onToMain,
}: {
  cards: DeckCard[];
  onAdd: (c: DeckCard) => void;
  onSub: (c: DeckCard) => void;
  onToMain: (c: DeckCard) => void;
}) {
  const [open, setOpen] = useState(true);
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  return (
    <View style={styles.side}>
      <Pressable style={styles.sideHeader} onPress={() => setOpen((o) => !o)} accessibilityRole="button">
        <MaterialCommunityIcons name="tray-full" size={20} color={colors.accent} />
        <Text style={styles.sideTitle}>Banquillo ({total})</Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
      </Pressable>
      {open &&
        cards.map((c) => (
          <View key={c.oracleId} style={styles.sideRow}>
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
            <QuantityStepper value={c.quantity} onSub={() => onSub(c)} onAdd={() => onAdd(c)} />
            <Pressable
              style={styles.sideMove}
              onPress={() => onToMain(c)}
              hitSlop={4}
              accessibilityLabel="Pasar una copia al mazo"
            >
              <MaterialCommunityIcons name="tray-arrow-up" size={20} color={colors.text} />
            </Pressable>
          </View>
        ))}
    </View>
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
      <CardIconButton icon="information-outline" hint="Ficha completa" onPress={() => actions.info(card)} />
      <CardIconButton icon="pencil-outline" hint="Cambiar arte o idioma" onPress={() => actions.printing(card)} />
      {/* Commander-style decks have no sideboard (the crown takes that place). */}
      {!crown && (
        <CardIconButton
          icon="tray-arrow-down"
          hint="Pasar una copia al banquillo"
          onPress={() => actions.toSide(card)}
        />
      )}
      <CardIconButton icon="image-outline" hint="Usar como portada" onPress={() => actions.cover(card)} />
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

const styles = StyleSheet.create({
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
