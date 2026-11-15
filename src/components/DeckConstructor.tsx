import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { GestureDetector } from 'react-native-gesture-handler';
import { artCropUrl, displayName } from '@/api/scryfall';
import { Grip, type useDragToggle } from '@/components/Collapsible';
import { DeckFormModal } from '@/components/DeckFormModal';
import { DeckPicker } from '@/components/DeckPicker';
import { UNNAMED_DECK, useAppState } from '@/context/AppState';
import {
  changeQuantity,
  clearDeck,
  copyLimit,
  createDeck,
  deleteDeck,
  removeCardFromDeck,
  setDeckCover,
  updateDeck,
  type DeckCard,
} from '@/db/database';
import { RARITY_LABELS } from '@/icons';
import { colors, formatLabel } from '@/theme';

export type ViewMode = 'list' | 'gallery';

interface BarProps {
  open: boolean;
  onToggleOpen: () => void;
  mode: ViewMode;
  onToggleMode: () => void;
  /** Vertical drag that opens/closes the panel (from `useDragToggle`). */
  dragGesture: ReturnType<typeof useDragToggle>;
}

/** Bottom bar of the web's MazoConstructor: deck name + count, view/save/clear/delete buttons, expand toggle. */
export function DeckConstructorBar({ open, onToggleOpen, mode, onToggleMode, dragGesture }: BarProps) {
  const db = useSQLiteContext();
  const { activeDeck, setActiveDeckId, refresh } = useAppState();
  const [saving, setSaving] = useState(false);

  const save = async (name: string, format: string | null) => {
    setSaving(false);
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

  const unsaved = !activeDeck || activeDeck.name === UNNAMED_DECK;

  return (
    <>
      {/* Drag the bar up/down to open/close the panel; its buttons still respond to taps. */}
      <GestureDetector gesture={dragGesture}>
        <View style={styles.bar}>
          <Grip position="top" />
          <Text style={styles.barTitle} numberOfLines={1}>
            {activeDeck ? activeDeck.name : '(Sin mazo)'} - {activeDeck?.cardCount ?? 0}
          </Text>
          <BarButton symbol={mode === 'list' ? '▦' : '☰'} onPress={onToggleMode} />
          <BarButton symbol="💾" onPress={() => setSaving(true)} highlight={unsaved && !!activeDeck?.cardCount} />
          <BarButton symbol="🧽" onPress={clear} disabled={!activeDeck?.cardCount} />
          <BarButton symbol="🗑" onPress={remove} disabled={!activeDeck} />
          <Pressable onPress={onToggleOpen} style={styles.toggle} hitSlop={6}>
            <Text style={styles.toggleText}>Mazo {open ? '▼' : '▲'}</Text>
          </Pressable>
        </View>
      </GestureDetector>

      {saving && (
        <DeckFormModal
          title={activeDeck ? 'Guardar mazo' : 'Nuevo mazo'}
          initialName={activeDeck && activeDeck.name !== UNNAMED_DECK ? activeDeck.name : ''}
          initialFormat={activeDeck?.format ?? null}
          onCancel={() => setSaving(false)}
          onSubmit={save}
        />
      )}
    </>
  );
}

function BarButton(props: { symbol: string; onPress: () => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={4}
      style={[styles.barButton, props.highlight && styles.barButtonHighlight, props.disabled && { opacity: 0.3 }]}
    >
      <Text style={styles.barButtonText}>{props.symbol}</Text>
    </Pressable>
  );
}

/** Expanded content of the constructor: cover header + cards as a list (with details) or a gallery. */
export function DeckPanel({ mode }: { mode: ViewMode }) {
  const db = useSQLiteContext();
  const { activeDeck, activeCards, refresh } = useAppState();
  const [preview, setPreview] = useState<string | null>(null);

  if (!activeDeck) {
    return (
      <View style={styles.panel}>
        <DeckPicker />
        <Text style={styles.empty}>
          No hay ningún mazo cargado. Elige uno arriba, crea uno con ＋ o desliza una carta a la derecha.
        </Text>
      </View>
    );
  }

  const deckId = activeDeck.id;
  const run = (p: Promise<unknown>) => p.then(() => refresh());
  const actions: CardActions = {
    add: (c) => run(changeQuantity(db, deckId, c.oracleId, 1)),
    sub: (c) => run(changeQuantity(db, deckId, c.oracleId, -1)),
    remove: (c) => run(removeCardFromDeck(db, deckId, c.oracleId)),
    cover: (c) => run(setDeckCover(db, deckId, c.imageUrl)),
    share: (c) => Share.share({ message: `${displayName(c)}\n${c.imageUrl ?? ''}` }),
    preview: (c) => setPreview(c.imageUrl),
  };
  const shareList = () =>
    Share.share({
      message:
        `${activeDeck.name} (${formatLabel(activeDeck.format)})\n` +
        activeCards.map((c) => `${c.quantity} ${c.name}`).join('\n'),
    });

  const header = (
    <>
      <DeckPicker />
      <View style={styles.coverHeader}>
        {activeDeck.coverImage && (
          <Image source={{ uri: artCropUrl(activeDeck.coverImage) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
        <View style={styles.coverShade}>
          <Text style={styles.coverTitle} numberOfLines={1}>
            {activeDeck.name}
          </Text>
          <View style={styles.coverRow}>
            <Text style={styles.coverMeta}>
              {formatLabel(activeDeck.format)} · {activeDeck.cardCount} cartas
            </Text>
            {activeCards.length > 0 && (
              <Pressable onPress={shareList} hitSlop={6}>
                <Text style={styles.coverLink}>Compartir lista ↗</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.panel}>
      <FlatList
        key={mode} // numColumns can't change on the fly
        data={activeCards}
        keyExtractor={(c) => c.oracleId}
        numColumns={mode === 'gallery' ? 3 : 1}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 16 }}
        columnWrapperStyle={mode === 'gallery' ? { gap: 6, paddingHorizontal: 6 } : undefined}
        ListEmptyComponent={<Text style={styles.empty}>Mazo vacío. Desliza cartas a la derecha para añadirlas.</Text>}
        renderItem={({ item }) =>
          mode === 'list' ? (
            <CardRow card={item} format={activeDeck.format} actions={actions} />
          ) : (
            <Pressable style={styles.galleryItem} onPress={() => actions.preview(item)}>
              {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.galleryImage} contentFit="contain" />}
              <Text style={styles.badge}>x{item.quantity}</Text>
            </Pressable>
          )
        }
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.modalImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

interface CardActions {
  add: (c: DeckCard) => void;
  sub: (c: DeckCard) => void;
  remove: (c: DeckCard) => void;
  cover: (c: DeckCard) => void;
  share: (c: DeckCard) => void;
  preview: (c: DeckCard) => void;
}

/** One row of the list view, with the same data the web table showed. */
function CardRow({ card, format, actions }: { card: DeckCard; format: string | null; actions: CardActions }) {
  const [types, subtypes] = card.typeLine.split(' — ');
  const atLimit = card.quantity >= copyLimit(card, format);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Pressable onPress={() => actions.preview(card)}>
          {card.imageUrl && <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" />}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{displayName(card)}</Text>
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

      <View style={styles.rowActions}>
        <View style={styles.qty}>
          <SmallButton label="−" onPress={() => actions.sub(card)} />
          <Text style={styles.qtyText}>{card.quantity}</Text>
          <SmallButton label="+" onPress={() => actions.add(card)} disabled={atLimit} />
        </View>
        <View style={styles.qty}>
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

function SmallButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4} style={[styles.small, disabled && { opacity: 0.3 }]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barTitle: { flex: 1, color: colors.text, fontWeight: '700' },
  barButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  barButtonHighlight: { backgroundColor: colors.accent },
  barButtonText: { fontSize: 18, color: colors.text },
  toggle: { paddingLeft: 6 },
  toggleText: { color: colors.accent, fontWeight: '800' },
  panel: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 24 },
  coverHeader: { height: 100, marginBottom: 8, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  coverShade: { flex: 1, justifyContent: 'flex-end', padding: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
  coverTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  coverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coverMeta: { color: '#ddd' },
  coverLink: { color: colors.accent, fontWeight: '700' },
  row: {
    marginHorizontal: 8,
    marginBottom: 8,
    padding: 10,
    gap: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
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
  galleryItem: { width: '31.5%', aspectRatio: 488 / 680, marginBottom: 6 },
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
  },
  modalImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 16 },
});
