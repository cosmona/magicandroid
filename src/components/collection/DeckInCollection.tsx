import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { displayName } from '@/api/scryfall';
import { PrintSheet } from '@/components/deck/PrintSheet';
import { deckTokens, TokensModal } from '@/components/deck/TokensModal';
import { useAppState } from '@/context/AppState';
import { changeMaybeQuantity, changeSideboardQuantity, moveCopy, type Deck, type DeckCard } from '@/db/database';
import { useCardDetails } from '@/hooks/useCardDetails';
import { isBasicLand } from '@/print/cardSheet';
import { colors, formatLabel } from '@/theme';
import { validateDeck } from '@/validation';

/** «📦 Mi colección ▾» / «🃏 Krenko ▾»: qué muestra la colección (todo, o un mazo). */
export function DeckPickerModal({
  decks,
  current,
  onPick,
  onClose,
}: {
  decks: Deck[];
  current: number | null;
  onPick: (id: number | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>Ver en la colección</Text>
          <ScrollView contentContainerStyle={{ gap: 4 }}>
            <Pressable style={[styles.option, current === null && styles.optionOn]} onPress={() => onPick(null)}>
              <Text style={{ fontSize: 18 }}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionName}>Mi colección</Text>
                <Text style={styles.hint}>Todas tus cartas</Text>
              </View>
            </Pressable>
            {decks.map((d) => (
              <Pressable key={d.id} style={[styles.option, current === d.id && styles.optionOn]} onPress={() => onPick(d.id)}>
                <Text style={{ fontSize: 18 }}>🃏</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={styles.hint}>
                    {formatLabel(d.format)} · {d.cardCount} cartas
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * La barra de un mazo visto desde la colección (como en el PC): lo que tienes de él y lo que falta, y su
 * Banquillo (solo en formatos que lo tienen), Posibles, Fichas, Imprimir y «Abrir en Construir».
 */
export function DeckInCollectionBar({
  deck,
  cards,
  owned,
  onChanged,
}: {
  deck: Deck;
  cards: DeckCard[];
  /** Copias que tienes de cada carta (por oracle id). */
  owned: Record<string, number>;
  onChanged: () => void;
}) {
  const db = useSQLiteContext();
  const { activeSideboard, activeMaybe, refresh } = useAppState();
  const [open, setOpen] = useState<'side' | 'maybe' | 'tokens' | 'print' | null>(null);
  const usesCommander = validateDeck(deck.format, cards).usesCommander;
  const details = useCardDetails(cards.map((c) => c.scryfallId));
  const tokens = deckTokens(cards, details);
  const need = cards.reduce((n, c) => n + c.quantity, 0);
  const have = cards.reduce((n, c) => n + Math.min(c.quantity, owned[c.oracleId] ?? 0), 0);
  const run = async (p: Promise<unknown>) => {
    await p;
    await refresh();
    onChanged();
  };
  const chip = (icon: keyof typeof MaterialCommunityIcons.glyphMap, label: string, color: string, onPress: () => void, count?: number) => (
    <Pressable style={[styles.chip, { borderColor: color }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      {count !== undefined && <Text style={[styles.chipCount, { color }]}>{count}</Text>}
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
  const toPrint = (list: DeckCard[]) => list.map((c) => ({ name: displayName(c), image: c.imageUrl, copies: c.quantity, basic: isBasicLand(c.typeLine) }));
  const zone = open === 'side' ? activeSideboard : open === 'maybe' ? activeMaybe : [];
  return (
    <View style={styles.bar}>
      <Text style={styles.summary}>
        Tienes <Text style={{ color: colors.add, fontWeight: '900' }}>{have}</Text> de {need}
        {need - have > 0 && <Text style={{ color: colors.undo, fontWeight: '900' }}> · faltan {need - have}</Text>}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {!usesCommander && chip('tray-full', 'Banquillo', colors.textMuted, () => setOpen('side'), activeSideboard.reduce((n, c) => n + c.quantity, 0))}
        {chip('help-circle-outline', 'Posibles', colors.info, () => setOpen('maybe'), activeMaybe.reduce((n, c) => n + c.quantity, 0))}
        {chip('cards-outline', 'Fichas', colors.info, () => setOpen('tokens'), tokens.length)}
        {chip('printer-outline', 'Imprimir', colors.text, () => setOpen('print'))}
        {chip('cards-playing-outline', 'Abrir en Construir', colors.accent, () => router.navigate('/'))}
      </ScrollView>

      {(open === 'side' || open === 'maybe') && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(null)} statusBarTranslucent>
          <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
            <Pressable style={styles.box} onPress={() => {}}>
              <Text style={styles.title}>
                {open === 'side' ? 'Banquillo' : 'Posibles'} · {deck.name}
              </Text>
              {zone.length === 0 && <Text style={styles.hint}>Vacío. Pasa cartas aquí desde el mazo en Construir.</Text>}
              <ScrollView contentContainerStyle={{ gap: 4 }}>
                {zone.map((c) => (
                  <View key={c.oracleId} style={styles.zoneRow}>
                    <Pressable
                      style={styles.step}
                      onPress={() => run(open === 'side' ? changeSideboardQuantity(db, deck.id, c.oracleId, -1) : changeMaybeQuantity(db, deck.id, c.oracleId, -1))}
                    >
                      <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={styles.qty}>{c.quantity}</Text>
                    <Pressable
                      style={styles.step}
                      onPress={() => run(open === 'side' ? changeSideboardQuantity(db, deck.id, c.oracleId, 1) : changeMaybeQuantity(db, deck.id, c.oracleId, 1))}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={styles.zoneName} numberOfLines={1}>
                      {displayName(c)}
                    </Text>
                    <Pressable style={styles.toMain} onPress={() => run(moveCopy(db, deck.id, c.oracleId, 'main', open))}>
                      <MaterialCommunityIcons name="tray-arrow-up" size={16} color={colors.accent} />
                      <Text style={styles.toMainText}>Al mazo</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {open === 'tokens' && <TokensModal tokens={tokens} deckName={deck.name} onClose={() => setOpen(null)} />}
      {open === 'print' && (
        <PrintSheet
          title={deck.name}
          cards={toPrint([...cards].sort((a, b) => Number(!!b.isCommander) - Number(!!a.isCommander)))}
          side={usesCommander ? [] : toPrint(activeSideboard)}
          maybe={toPrint(activeMaybe)}
          onClose={() => setOpen(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  box: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, maxHeight: '85%' },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  optionOn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.accent },
  optionName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  bar: { marginHorizontal: 14, marginBottom: 8, gap: 6 },
  summary: { color: colors.textMuted, fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, backgroundColor: colors.surface },
  chipCount: { fontWeight: '900' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  step: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qty: { color: colors.text, fontWeight: '900', minWidth: 20, textAlign: 'center' },
  zoneName: { flex: 1, color: colors.text, fontSize: 14 },
  toMain: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.accent },
  toMainText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
});
