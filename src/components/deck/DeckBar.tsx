import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { artCropUrl } from '@/api/scryfall';
import { SheetGrip } from '@/components/SheetGrip';
import { UNNAMED_DECK, useAppState } from '@/context/AppState';
import { colors, formatLabel } from '@/theme';
import { validateDeck } from '@/validation';

/**
 * Bottom bar showing the active deck. Tap it or swipe it up to open the deck sheet.
 * It holds no buttons, so the tap and the swipe never compete with anything else.
 */
export function DeckBar({ onOpen }: { onOpen: () => void }) {
  const { activeDeck, activeCards } = useAppState();
  const validation = validateDeck(activeDeck?.format ?? null, activeCards);
  const status = !validation.checked || !activeCards.length ? '' : validation.valid ? ' · ✓ válido' : ' · ⚠ revisar';

  // Opens as soon as the finger starts moving up (not on release), so the sheet
  // slides in while you're still dragging.
  const swipeUp = usePanGesture({
    activeOffsetY: -10,
    failOffsetX: [-25, 25],
    onActivate: () => {
      scheduleOnRN(onOpen);
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      scheduleOnRN(onOpen);
    },
  });
  const gesture = useCompetingGestures(swipeUp, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.bar}>
        <SheetGrip />
        <View style={styles.row}>
          <View style={styles.cover}>
            {activeDeck?.coverImage && (
              <Image source={{ uri: artCropUrl(activeDeck.coverImage) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
          </View>
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
          </View>
          <Text style={styles.open}>Mazo ▲</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12 },
  open: { color: colors.accent, fontWeight: '800' },
});
