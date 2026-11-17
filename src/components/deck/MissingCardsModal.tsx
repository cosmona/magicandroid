import { useState } from 'react';
import { FlatList, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { smallImageUrl, type CardDetails } from '@/api/scryfall';
import type { DeckCard } from '@/db/database';
import { colors, formatEur } from '@/theme';

export interface MissingCard {
  card: DeckCard;
  /** Copies the deck needs beyond the ones in the collection. */
  count: number;
}

const CARDMARKET = 'https://www.cardmarket.com/es/Magic';
/** Search page of one card (Cardmarket finds it by its English name). */
const searchUrl = (name: string) => `${CARDMARKET}/Products/Search?searchString=${encodeURIComponent(name)}`;
/** Wants lists: "Añadir lista de mazo" takes a pasted "2 Card name" list. */
const WANTS_URL = `${CARDMARKET}/Wants`;

/**
 * The deck's cards missing from the collection, to buy them on Cardmarket: copy them as a
 * deck list (pasted into a Cardmarket wants list, the Shopping Wizard buys them all at once)
 * or open each card's search.
 */
export function MissingCardsModal({
  missing,
  details,
  showPrices,
  onClose,
}: {
  missing: MissingCard[];
  /** Live prices + Cardmarket links, by Scryfall id. */
  details: Record<string, CardDetails>;
  /** Show the total and per-card prices (Ajustes → Precios). */
  showPrices: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const total = missing.reduce((n, m) => n + m.count, 0);
  let cost = 0;
  let unpriced = 0;
  for (const m of missing) {
    const eur = details[m.card.scryfallId]?.eur;
    if (eur == null) unpriced += m.count;
    else cost += eur * m.count;
  }
  // Scryfall's link goes straight to the card's product page; a search is the fallback.
  const open = (m: MissingCard) =>
    Linking.openURL(details[m.card.scryfallId]?.cardmarketUrl ?? searchUrl(m.card.name.split(' // ')[0]));

  const copy = async () => {
    // Double-faced names ("A // B"): Cardmarket's list import wants the front face.
    await Clipboard.setStringAsync(missing.map((m) => `${m.count} ${m.card.name.split(' // ')[0]}`).join('\n'));
    setCopied(true);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>
              🛒 Te {total === 1 ? 'falta' : 'faltan'} {total}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          {showPrices && cost > 0 && (
            <Text style={styles.cost}>
              ≈ {formatEur(cost)} en Cardmarket
              {unpriced > 0 && <Text style={styles.help}> · {unpriced} sin precio</Text>}
            </Text>
          )}
          <Text style={styles.help}>
            {'Toca una carta para verla en Cardmarket. Para comprarlas todas de una vez: copia la lista y pégala en Cardmarket → Listas de deseos → «Añadir lista de mazo».'}
          </Text>
          <View style={styles.buttons}>
            <Pressable style={[styles.button, copied && styles.buttonDone]} onPress={copy}>
              <Text style={styles.buttonText}>{copied ? '✓ Copiada' : '📋 Copiar lista'}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonMain]} onPress={() => Linking.openURL(WANTS_URL)}>
                <Text style={[styles.buttonText, { color: colors.bg }]}>Listas de deseos ↗</Text>
              </Pressable>
          </View>
          <FlatList
            data={missing}
            keyExtractor={(m) => m.card.oracleId}
            style={styles.list}
            renderItem={({ item: { card, count } }) => (
              <Pressable style={styles.row} onPress={() => open({ card, count })}>
                {card.imageUrl && (
                  <Image source={{ uri: smallImageUrl(card.imageUrl) }} style={styles.thumb} contentFit="cover" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {count}× {card.name}
                  </Text>
                  {card.printedName && card.printedName !== card.name && (
                    <Text style={styles.printed} numberOfLines={1}>
                      {card.printedName}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {showPrices && details[card.scryfallId]?.eur != null && (
                    <Text style={styles.rowPrice}>{formatEur((details[card.scryfallId].eur ?? 0) * count)}</Text>
                  )}
                  <Text style={styles.search}>Ver ↗</Text>
                </View>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  close: { color: colors.textMuted, fontSize: 20 },
  help: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  buttonMain: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonDone: { borderColor: colors.add },
  buttonText: { color: colors.text, fontWeight: '800' },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: { width: 36, height: 50, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontWeight: '700' },
  printed: { color: colors.textMuted, fontSize: 12 },
  cost: { color: colors.accent, fontSize: 16, fontWeight: '900', marginTop: 4 },
  rowPrice: { color: colors.text, fontWeight: '800' },
  search: { color: colors.accent, fontWeight: '800' },
});
