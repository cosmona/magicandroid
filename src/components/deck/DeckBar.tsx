import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Easing, withTiming, type SharedValue } from 'react-native-reanimated';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { DeckSummary } from '@/components/deck/DeckSummary';
import { colors } from '@/theme';

/**
 * Bottom bar showing the active deck. Tap it to open the deck sheet, or drag it up: the sheet
 * follows the finger (`follow`) and, on letting go, opens if it went past half way (or with a
 * flick up) and goes back down otherwise.
 */
export function DeckBar({ onOpen, onClose, follow }: { onOpen: () => void; onClose: () => void; follow: SharedValue<number> }) {
  // It's the bottom edge of the screen: keep it clear of Android's navigation buttons.
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const travel = height * 0.9;
  const swipeUp = usePanGesture({
    activeOffsetY: -10,
    failOffsetX: [-25, 25],
    onActivate: () => {
      follow.set(0);
      scheduleOnRN(onOpen);
    },
    onUpdate: (e) => {
      follow.set(Math.min(1, Math.max(0, -e.translationY / travel)));
    },
    onDeactivate: (e) => {
      const projected = follow.get() + (-e.velocityY * 0.15) / travel;
      const open = !e.canceled && projected > 0.5;
      follow.set(
        withTiming(open ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }, (done) => {
          if (!done) return;
          follow.set(-1);
          if (!open) scheduleOnRN(onClose);
        }),
      );
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
      <View style={[styles.bar, { paddingBottom: 6 + insets.bottom }]}>
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
    paddingBottom: 6,
  },
});
