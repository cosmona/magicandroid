import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { artCropUrl } from '@/api/scryfall';
import { UNNAMED_DECK, useAppState } from '@/context/AppState';
import { priceTotal, useCardDetails } from '@/hooks/useCardDetails';
import { colors, formatEur, formatLabel } from '@/theme';
import { validateDeck } from '@/validation';

/**
 * Cover + name + "format · N cartas · ✓ válido" line of the active deck. Shared by the
 * closed `DeckBar` and the open deck sheet so the header looks the same in both. The third
 * line is the deck's price on Cardmarket (live from Scryfall; hidden offline).
 */
export function DeckSummary({
  right,
  onPressCover,
  pickerOpen = false,
}: {
  right?: ReactNode;
  /** Tapping the cover (or its arrow) toggles the deck picker; without it the arrow is just a hint. */
  onPressCover?: () => void;
  pickerOpen?: boolean;
}) {
  const { activeDeck, activeCards } = useAppState();
  const validation = validateDeck(activeDeck?.format ?? null, activeCards);
  const details = useCardDetails(activeCards.map((c) => c.scryfallId));
  const price = priceTotal(activeCards, details);
  const status = !validation.checked || !activeCards.length ? '' : validation.valid ? ' · ✓ válido' : ' · ⚠ revisar';

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.selector}
        onPress={onPressCover}
        disabled={!onPressCover}
        accessibilityRole="button"
        accessibilityLabel="Cambiar de mazo"
        accessibilityState={{ expanded: pickerOpen }}
      >
        <View style={[styles.cover, pickerOpen && styles.coverOpen]}>
          {activeDeck?.coverImage && (
            <Image
              source={{ uri: artCropUrl(activeDeck.coverImage) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </View>
        <MaterialCommunityIcons
          name={pickerOpen ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={pickerOpen ? colors.accent : colors.textMuted}
        />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {activeDeck?.name ?? 'Sin mazo'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {activeDeck
            ? `${formatLabel(activeDeck.format)} · ${activeDeck.cardCount} cartas${status}${
                activeDeck.name === UNNAMED_DECK ? ' · sin guardar' : ''
              }`
            : 'Desliza a la derecha para empezar uno'}
        </Text>
        {price.priced > 0 && (
          <View style={styles.priceRow}>
            <MaterialCommunityIcons name="tag-outline" size={14} color={colors.accent} />
            <Text style={styles.price} numberOfLines={1}>
              ≈ {formatEur(price.eur)}
              {price.priced < price.total && (
                <Text style={styles.meta}> · {price.total - price.priced} sin precio</Text>
              )}
            </Text>
          </View>
        )}
      </View>
      {right}
    </View>
  );
}

/** Cover size; the deck sheet lines things up under the name with it. */
export const DECK_COVER_SIZE = 76;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: {
    width: DECK_COVER_SIZE,
    height: DECK_COVER_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  name: { color: colors.text, fontSize: 19, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -6 },
  coverOpen: { borderWidth: 2, borderColor: colors.accent },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  price: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
