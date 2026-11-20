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
 * Portada + nombre + línea «formato · N cartas · ✓ válido» del mazo activo. Compartida por el
 * `DeckBar` cerrado y la hoja del mazo abierta para que la cabecera se vea igual en ambos. La tercera
 * línea es el precio del mazo en Cardmarket (en vivo de Scryfall; oculto sin conexión).
 */
export function DeckSummary({
  right,
  onPressCover,
  pickerOpen = false,
  compact = false,
  onTags,
}: {
  /** Hoja del mazo: sus etiquetas con un botón para cambiarlas (la barra cerrada muestra solo sus iconos). */
  onTags?: () => void;
  right?: ReactNode;
  /** Barra de mazo cerrada: portada a mitad de tamaño. Crece / encoge al cambiar (hoja ⇄ barra). */
  compact?: boolean;
  /** Tocar la portada (o su flecha) alterna el selector de mazo; sin él la flecha es solo una pista. */
  onPressCover?: () => void;
  pickerOpen?: boolean;
}) {
  const { activeDeck, activeCards, activeSideboard, prefs } = useAppState();
  const allTags = useTags();
  const deckTags = (useDeckTags()[activeDeck?.uid ?? ''] ?? []).map((u) => allTags.find((t) => t.uid === u)).filter((t) => !!t);
  const validation = validateDeck(activeDeck?.format ?? null, activeCards, activeSideboard);
  const details = useCardDetails(activeCards.map((c) => c.scryfallId));
  const price = priceTotal(activeCards, details);
  // Empieza en el otro tamaño y anima al suyo: la portada de la barra encoge según se cierra la hoja,
  // la de la hoja crece según se abre.
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
          <Text style={[styles.name, compact && styles.nameCompact, { flexShrink: 1 }]} numberOfLines={1}>
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
          {compact && prefs.pricesDeck && price.priced > 0 && <Text style={styles.price}> · ≈ {formatEur(price.eur)}</Text>}
        </Text>
        {!compact && prefs.pricesDeck && price.priced > 0 && (
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

/** Tamaño de la portada; la hoja del mazo alinea las cosas bajo el nombre con él. */
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
  nameCompact: { fontSize: 16 },
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
