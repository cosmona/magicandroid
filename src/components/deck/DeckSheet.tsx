import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
// RNGH lists cooperate with the rows' swipe-to-delete gesture.
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { displayName, getCardsByIds, smallImageUrl } from '@/api/scryfall';
import { DeckFormModal } from '@/components/DeckFormModal';
import { DeckPicker } from '@/components/deck/DeckPicker';
import { SwipeToDelete } from '@/components/deck/SwipeToDelete';
import { UNNAMED_DECK, useAppState, type DeckView } from '@/context/AppState';
import {
  changeQuantity,
  clearDeck,
  createDeck,
  deleteDeck,
  getCardsMissingData,
  removeCardFromDeck,
  setCommander,
  setDeckCover,
  updateCardData,
  updateDeck,
  type DeckCard,
} from '@/db/database';
import { RARITY_LABELS } from '@/icons';
import { colors, formatLabel } from '@/theme';
import { validateDeck, type DeckValidation } from '@/validation';

const VIEWS: { key: DeckView; label: string }[] = [
  { key: 'list', label: '☰ Lista' },
  { key: 'gallery', label: '▦ Galería' },
  { key: 'big', label: '▭ Grande' },
];

/**
 * Content of the deck bottom sheet (the web's MazoConstructor + Mazos): deck actions,
 * deck picker, then the active deck's cards as a detailed list, an image gallery, or
 * one big card per row. Opens in the view chosen in settings.
 */
export function DeckSheet() {
  const db = useSQLiteContext();
  const { activeDeck, activeCards, setActiveDeckId, refresh, prefs } = useAppState();
  const [mode, setMode] = useState<DeckView>(prefs.deckView);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<DeckCard | null>(null);
  const validation = useMemo(
    () => validateDeck(activeDeck?.format ?? null, activeCards),
    [activeDeck?.format, activeCards],
  );
  const previewIssues = preview ? validation.cardIssues[preview.oracleId] : undefined;

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

  const clear = () =>
    activeDeck &&
    confirm('Vaciar mazo', `¿Quitar todas las cartas de "${activeDeck.name}"?`, async () => {
      await clearDeck(db, activeDeck.id);
      refresh();
    });

  const remove = () =>
    activeDeck &&
    confirm('Borrar mazo', `¿Borrar "${activeDeck.name}"? No se puede deshacer.`, async () => {
      await deleteDeck(db, activeDeck.id);
      setActiveDeckId(null);
    });

  const shareList = () =>
    activeDeck &&
    Share.share({
      message:
        `${activeDeck.name} (${formatLabel(activeDeck.format)})\n` +
        activeCards.map((c) => `${c.quantity} ${c.name}`).join('\n'),
    });

  const deckId = activeDeck?.id;
  const run = (p: Promise<unknown>) => p.then(() => refresh());
  const actions: CardActions = {
    add: (c) => deckId && run(changeQuantity(db, deckId, c.oracleId, 1)),
    sub: (c) => deckId && run(changeQuantity(db, deckId, c.oracleId, -1)),
    remove: (c) => deckId && run(removeCardFromDeck(db, deckId, c.oracleId)),
    cover: (c) => deckId && run(setDeckCover(db, deckId, c.imageUrl)),
    share: (c) => Share.share({ message: `${displayName(c)}\n${c.imageUrl ?? ''}` }),
    preview: (c) => setPreview(c),
    commander: (c) => deckId && run(setCommander(db, deckId, c.oracleId, !c.isCommander)),
  };

  const unnamed = activeDeck?.name === UNNAMED_DECK;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {activeDeck?.name ?? 'Sin mazo'}
          </Text>
          {activeDeck && (
            <Text style={styles.subtitle}>
              {formatLabel(activeDeck.format)} · {activeDeck.cardCount} cartas
            </Text>
          )}
        </View>
      </View>

      {activeDeck && activeCards.length > 0 && (
        <ValidationBanner
          validation={validation}
          format={activeDeck.format}
          cards={activeCards}
          onOpenCard={setPreview}
        />
      )}

      {activeDeck && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
          <Action label={unnamed ? '💾 Guardar' : '✎ Editar'} highlight={unnamed} onPress={() => setEditing(true)} />
          <Action label="↗ Compartir" onPress={shareList} disabled={!activeCards.length} />
          <Action label="🧽 Vaciar" onPress={clear} disabled={!activeCards.length} />
          <Action label="🗑 Borrar" danger onPress={remove} />
        </ScrollView>
      )}

      <DeckPicker />

      {activeDeck && activeCards.length > 0 && (
        <View style={styles.viewSwitch}>
          {VIEWS.map((v) => (
            <Pressable
              key={v.key}
              style={[styles.viewOption, mode === v.key && styles.viewOptionSelected]}
              onPress={() => setMode(v.key)}
            >
              <Text style={[styles.viewOptionText, mode === v.key && { color: colors.bg }]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!activeDeck && (
        <Text style={styles.empty}>
          No hay ningún mazo cargado. Elige uno, crea uno con ＋ o desliza una carta a la derecha.
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.sheet}>
      <FlatList
        key={mode} // numColumns can't change on the fly
        data={activeDeck ? activeCards : []}
        keyExtractor={(c) => c.oracleId}
        numColumns={mode === 'gallery' ? 3 : 1}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        columnWrapperStyle={mode === 'gallery' ? styles.galleryRow : undefined}
        nestedScrollEnabled
        ListEmptyComponent={
          activeDeck ? <Text style={styles.empty}>Mazo vacío. Desliza cartas a la derecha para añadirlas.</Text> : undefined
        }
        initialNumToRender={mode === 'big' ? 2 : 8}
        windowSize={mode === 'big' ? 3 : 7}
        renderItem={({ item }) =>
          mode === 'list' ? (
            <SwipeToDelete onDelete={() => actions.remove(item)}>
              <CardRow
                card={item}
                actions={actions}
                issues={validation.cardIssues[item.oracleId]}
                crown={validation.usesCommander}
              />
            </SwipeToDelete>
          ) : mode === 'big' ? (
            <SwipeToDelete onDelete={() => actions.remove(item)}>
              <BigCard
                card={item}
                actions={actions}
                issues={validation.cardIssues[item.oracleId]}
                crown={validation.usesCommander}
              />
            </SwipeToDelete>
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
                {item.isCommander ? '👑 ' : ''}x{item.quantity}
              </Text>
              {validation.cardIssues[item.oracleId] && <Text style={styles.warnBadge}>⚠</Text>}
            </Pressable>
          )
        }
      />

      {editing && (
        <DeckFormModal
          title={activeDeck ? 'Guardar mazo' : 'Nuevo mazo'}
          initialName={activeDeck && !unnamed ? activeDeck.name : ''}
          initialFormat={activeDeck?.format ?? null}
          onCancel={() => setEditing(false)}
          onSubmit={save}
        />
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
        </Pressable>
      </Modal>
    </View>
  );
}

function Action(props: { label: string; onPress: () => void; disabled?: boolean; highlight?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.action, props.highlight && styles.actionHighlight, props.disabled && { opacity: 0.35 }]}
    >
      <Text
        style={[
          styles.actionText,
          props.highlight && { color: colors.bg },
          props.danger && { color: colors.discard },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

interface CardActions {
  add: (c: DeckCard) => void;
  sub: (c: DeckCard) => void;
  remove: (c: DeckCard) => void;
  cover: (c: DeckCard) => void;
  share: (c: DeckCard) => void;
  preview: (c: DeckCard) => void;
  commander: (c: DeckCard) => void;
}

interface CardProps {
  card: DeckCard;
  actions: CardActions;
  /** Validation problems of this card (red border + messages). */
  issues?: string[];
  /** Show the 👑 commander toggle. */
  crown: boolean;
}

/**
 * "✓ Válido" / "⚠ N problemas" summary at the top of the deck. Expanded, it lists the
 * deck-level problems and then every card with its own problems; tapping a card opens it.
 */
function ValidationBanner(props: {
  validation: DeckValidation;
  format: string | null;
  cards: DeckCard[];
  onOpenCard: (card: DeckCard) => void;
}) {
  const { validation: v, format, cards, onOpenCard } = props;
  const [open, setOpen] = useState(true);
  if (!v.checked) {
    return (
      <View style={[styles.banner, styles.bannerNeutral]}>
        <Text style={styles.bannerText}>Formato libre: sin comprobaciones. Elige un formato en ✎ Editar.</Text>
      </View>
    );
  }
  const badCards = cards.filter((c) => v.cardIssues[c.oracleId]);
  const count = v.issues.length + badCards.reduce((n, c) => n + v.cardIssues[c.oracleId].length, 0);
  const title = v.valid
    ? `✓ Mazo válido para ${formatLabel(format)}`
    : `⚠ ${count} ${count === 1 ? 'problema' : 'problemas'} para ${formatLabel(format)} ${open ? '▲' : '▼'}`;
  return (
    <Pressable style={[styles.banner, v.valid ? styles.bannerOk : styles.bannerBad]} onPress={() => setOpen((o) => !o)}>
      <Text style={styles.bannerTitle}>{title}</Text>
      {open &&
        v.issues.map((issue) => (
          <Text key={issue} style={styles.bannerText}>
            • {issue}
          </Text>
        ))}
      {open && badCards.length > 0 && (
        <View style={styles.bannerCards}>
          <Text style={styles.bannerSubtitle}>Cartas ({badCards.length}) · toca para verla</Text>
          {badCards.map((card) => (
            <Pressable key={card.oracleId} style={styles.bannerCard} onPress={() => onOpenCard(card)}>
              <Text style={styles.bannerCardName}>
                {card.isCommander ? '👑 ' : ''}
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
        </View>
      )}
      {v.pendingData > 0 && (
        <Text style={styles.bannerText}>Cargando datos de {v.pendingData} cartas para comprobarlas…</Text>
      )}
    </Pressable>
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
function CardRow({ card, actions, issues, crown }: CardProps) {
  const [types, subtypes] = card.typeLine.split(' — ');
  return (
    <View style={[styles.row, issues && styles.invalid, !!card.isCommander && styles.commander]}>
      <View style={styles.rowTop}>
        <Pressable onPress={() => actions.preview(card)}>
          {card.imageUrl && <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" />}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>
            {card.isCommander ? '👑 ' : ''}
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
        <Datum label="Maná" value={card.manaCost || '—'} />
        <Datum label="Rareza" value={card.rarity ? RARITY_LABELS[card.rarity] ?? card.rarity : '—'} />
        <Datum label="Tipos" value={types} />
        {!!subtypes && <Datum label="Subtipos" value={subtypes} />}
      </View>

      <CardIssues issues={issues} />

      <View style={styles.rowActions}>
        <View style={styles.qty}>
          <SmallButton label="−" onPress={() => actions.sub(card)} />
          <Text style={styles.qtyText}>{card.quantity}</Text>
          <SmallButton label="+" onPress={() => actions.add(card)} />
        </View>
        <View style={styles.qty}>
          {crown && <SmallButton label="👑" onPress={() => actions.commander(card)} active={!!card.isCommander} />}
          <SmallButton label="🗑" onPress={() => actions.remove(card)} />
          <SmallButton label="🖼" onPress={() => actions.cover(card)} />
          <SmallButton label="↗" onPress={() => actions.share(card)} />
        </View>
      </View>
    </View>
  );
}

/** "Grande" view: the card at full width (like the swipe stack) with its controls below. */
function BigCard({ card, actions, issues, crown }: CardProps) {
  return (
    <View style={[styles.big, issues && styles.invalid, !!card.isCommander && styles.commander]}>
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
          {card.isCommander ? '👑 ' : ''}x{card.quantity}
        </Text>
      </Pressable>
      <CardIssues issues={issues} />
      <View style={styles.rowActions}>
        <View style={styles.qty}>
          <SmallButton label="−" onPress={() => actions.sub(card)} />
          <Text style={styles.qtyText}>{card.quantity}</Text>
          <SmallButton label="+" onPress={() => actions.add(card)} />
        </View>
        <View style={styles.qty}>
          {crown && <SmallButton label="👑" onPress={() => actions.commander(card)} active={!!card.isCommander} />}
          <SmallButton label="🗑" onPress={() => actions.remove(card)} />
          <SmallButton label="🖼" onPress={() => actions.cover(card)} />
          <SmallButton label="↗" onPress={() => actions.share(card)} />
        </View>
      </View>
    </View>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={styles.datumLabel}>{label}</Text>
      <Text style={styles.datumValue}>{value}</Text>
    </View>
  );
}

function SmallButton(props: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const { label, onPress, disabled, active } = props;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={[styles.small, active && styles.smallActive, disabled && { opacity: 0.3 }]}
    >
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted },
  actions: { gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  action: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionHighlight: { backgroundColor: colors.accent, borderColor: colors.accent },
  actionText: { color: colors.text, fontWeight: '700' },
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
  data: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  datumLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  datumValue: { color: colors.text },
  rowActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyText: { color: colors.text, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  small: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  banner: { marginHorizontal: 10, marginTop: 4, marginBottom: 2, padding: 10, borderRadius: 10, gap: 4, borderWidth: 1 },
  bannerOk: { backgroundColor: 'rgba(46,204,113,0.12)', borderColor: colors.add },
  bannerBad: { backgroundColor: 'rgba(231,76,60,0.12)', borderColor: colors.discard },
  bannerNeutral: { backgroundColor: colors.bg, borderColor: colors.border },
  bannerTitle: { color: colors.text, fontWeight: '800' },
  bannerText: { color: colors.text, fontSize: 13 },
  bannerCards: { gap: 6, marginTop: 4 },
  bannerSubtitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  bannerCard: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', gap: 2 },
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
  previewStatus: { alignSelf: 'stretch', padding: 10, borderRadius: 10, gap: 4, borderWidth: 1 },
  invalid: { borderColor: colors.discard, borderWidth: 2 },
  commander: { borderColor: colors.accent, borderWidth: 2 },
  issues: { gap: 2, padding: 8, borderRadius: 8, backgroundColor: 'rgba(231,76,60,0.15)' },
  issueText: { color: '#ff8a80', fontSize: 12, fontWeight: '600' },
  smallActive: { backgroundColor: colors.accent },
  galleryInvalid: { borderWidth: 2, borderColor: colors.discard, borderRadius: 10 },
  viewSwitch: {
    flexDirection: 'row',
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  viewOption: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.bg },
  viewOptionSelected: { backgroundColor: colors.accent },
  viewOptionText: { color: colors.text, fontWeight: '700' },
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
  modalImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 16 },
});
