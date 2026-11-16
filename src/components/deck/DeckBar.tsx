import { StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { DeckSummary } from '@/components/deck/DeckSummary';
import { colors } from '@/theme';

/**
 * Bottom bar showing the active deck. Tap it or swipe it up to open the deck sheet.
 * It holds no buttons, so the tap and the swipe never compete with anything else.
 */
export function DeckBar({ onOpen }: { onOpen: () => void }) {
  // It's the bottom edge of the screen: keep it clear of Android's navigation buttons.
  const insets = useSafeAreaInsets();
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
      <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
        <SheetGrip />
        <DeckSummary compact />
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
});
