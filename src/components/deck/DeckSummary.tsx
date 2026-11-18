import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { artCropUrl } from '@/api/scryfall';
import { TagChip, useDeckTags, useTags } from '@/components/tags/Tags';
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
  compact = false,
  onTags,
}: {
  /** Deck sheet: its tags with a button to change them (the closed bar shows only their icons). */
  onTags?: () => void;
  right?: ReactNode;
  /** Closed deck bar: cover at half size. It grows / shrinks when switching (sheet ⇄ bar). */
  compact?: boolean;
  /** Tapping the cover (or its arrow) toggles the deck picker; without it the arrow is just a hint. */
  onPressCover?: () => void;
  pickerOpen?: boolean;
}) {
  const { activeDeck, activeCards, activeSideboard, prefs } = useAppState();
  const allTags = useTags();
  const deckTags = (useDeckTags()[activeDeck?.uid ?? ''] ?? []).map((u) => allTags.find((t) => t.uid === u)).filter((t) => !!t);
  const validation = validateDeck(activeDeck?.format ?? null, activeCards, activeSideboard);
  const details = useCardDetails(activeCards.map((c) => c.scryfallId));
  const price = priceTotal(activeCards, details);
  // Starts at the other size and animates to its own: the bar's cover shrinks as the sheet
  // closes, the sheet's grows as it opens.
  const target = compact ? DECK_COVER_SIZE / 2 : DECK_COVER_SIZE;
  const coverSize = useSharedValue(compact ? DECK_COVER_SIZE : DECK_COVER_SIZE / 2);
  useEffect(() => {
    coverSize.set(withTiming(target, { duration: 260, easing: Easing.out(Easing.cubic) }));
  }, [coverSize, target]);
  const coverStyle = useAnimatedStyle(() => ({
    width: coverSize.get(),
    height: coverSize.get(),
    borderRadius: coverSize.get() / 6,
  }));
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
        <Animated.View style={[styles.cover, coverStyle, pickerOpen && styles.coverOpen]}>
          {activeDeck?.coverImage && (
            <Image
              source={{ uri: artCropUrl(activeDeck.coverImage) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </Animated.View>
        <MaterialCommunityIcons
          name={pickerOpen ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={pickerOpen ? colors.accent : colors.textMuted}
        />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
            {activeDeck?.name ?? 'Sin mazo'}
          </Text>
          {(compact || !onTags) && prefs.showTags !== false && deckTags.map((t) => <TagChip key={t.uid} tag={t} iconOnly />)}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {activeDeck
            ? `${formatLabel(activeDeck.format)} · ${activeDeck.cardCount} cartas${status}${
                activeDeck.name === UNNAMED_DECK ? ' · sin guardar' : ''
              }`
            : 'Desliza a la derecha para empezar uno'}
        </Text>
        {prefs.pricesDeck && price.priced > 0 && (
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
        {onTags && activeDeck && (
          <View style={styles.tagsRow}>
            {prefs.showTags !== false && deckTags.map((t) => <TagChip key={t.uid} tag={t} small />)}
            <Pressable style={styles.tagsButton} onPress={onTags} hitSlop={6} accessibilityLabel="Etiquetas del mazo">
              <MaterialCommunityIcons name="tag-outline" size={12} color={colors.textMuted} />
              {deckTags.length === 0 && <Text style={styles.tagsButtonText}>Etiquetas</Text>}
            </Pressable>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 3 },
  tagsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagsButtonText: { color: colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -6 },
  coverOpen: { borderWidth: 2, borderColor: colors.accent },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  price: { color: colors.accent, fontSize: 13, fontWeight: '800' },
});
