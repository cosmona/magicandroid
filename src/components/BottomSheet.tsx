import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { colors } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fraction of the screen height the sheet takes. */
  heightRatio?: number;
  children: ReactNode;
}

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic) };
const SNAP_BACK = { damping: 22, stiffness: 260, overshootClamping: true };

/**
 * Bottom sheet on React Native's Modal (reliable on every Android/Expo Go), animated with
 * Reanimated. Dragging the top area moves the sheet with the finger; letting go past a
 * quarter of its height (or with a flick) closes it, otherwise it springs back.
 * Also closes by tapping outside or with the back button. Children stay mounted until
 * the closing animation ends.
 */
export function BottomSheet({ visible, onClose, heightRatio = 0.9, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = height * heightRatio;

  // Distance the sheet is pushed down from its open position: 0 = open, sheetHeight = hidden.
  const offset = useSharedValue(sheetHeight);
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      offset.set(withTiming(0, OPEN));
    } else {
      offset.set(
        withTiming(sheetHeight, CLOSE, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, mounted, sheetHeight, offset]);

  const drag = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-30, 30],
    onUpdate: (e) => {
      // Follows the finger down; resists a little when pulled above the open position.
      offset.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15);
    },
    onDeactivate: (e) => {
      const close = !e.canceled && (e.translationY > sheetHeight * 0.25 || e.velocityY > 900);
      if (close) {
        // Keep the flick's momentum on the way out; the visible=false effect finishes it.
        offset.set(withTiming(sheetHeight, { duration: 180, easing: Easing.out(Easing.quad) }));
        scheduleOnRN(onClose);
      } else {
        offset.set(withSpring(0, { ...SNAP_BACK, velocity: e.velocityY }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [0, sheetHeight], [1, 0], 'clamp'),
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Modals render in their own window, so they need their own gesture root. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom }, sheetStyle]}>
          <GestureDetector gesture={drag}>
            <Animated.View style={styles.handleArea}>
              <SheetGrip />
            </Animated.View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // Tall enough to grab comfortably with a thumb.
  handleArea: { paddingTop: 6, paddingBottom: 10 },
});
