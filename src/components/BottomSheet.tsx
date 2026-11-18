import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { colors } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fraction of the screen height the sheet opens at. */
  heightRatio?: number;
  /** Dragging up from the open position grows it to the full screen (a third stop). */
  expandable?: boolean;
  /** Opens at the full screen (under the status bar): just two positions, open or closed. */
  fullScreen?: boolean;
  /**
   * Driven from outside while a finger drags it (the deck bar): 0 = closed … 1 = open; -1 = not
   * driven (its own animations and drag work as usual).
   */
  follow?: SharedValue<number>;
  children: ReactNode;
}

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic) };
const SNAP = { damping: 24, stiffness: 240, overshootClamping: true };

interface SheetDrag {
  /** How far the sheet is pushed down: 0 = full size, `rest` = open, `hidden` = off screen. */
  offset: SharedValue<number>;
  rest: number;
  hidden: number;
  expandable: boolean;
  /** Set when a drag closes the sheet: its own animation finishes the job. */
  dragClosing: SharedValue<boolean>;
  onClose: () => void;
  onDragClosed: () => void;
  setExpanded: (expanded: boolean) => void;
}
const SheetDragContext = createContext<SheetDrag | null>(null);

/**
 * Makes its children a handle of the enclosing BottomSheet: a vertical drag on them moves
 * the sheet (buttons inside still work with a tap; once the drag starts, their press is
 * cancelled). Horizontal moves are left alone, so horizontal lists inside keep scrolling.
 * Don't wrap vertical lists: use it for the fixed part above them.
 */
export function SheetDragArea({ children }: { children: ReactNode }) {
  const ctx = useContext(SheetDragContext);
  if (!ctx) throw new Error('SheetDragArea must be inside a BottomSheet');
  const { offset, rest, hidden, expandable, dragClosing, onClose, onDragClosed, setExpanded } = ctx;
  const start = useSharedValue(0);
  // Highest the sheet can go: full screen if expandable, else its open position.
  const top = expandable ? 0 : rest;

  // Each detector needs its own gesture, so every area builds one.
  const drag = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-20, 20],
    onActivate: () => {
      start.set(offset.get());
    },
    onUpdate: (e) => {
      const next = start.get() + e.translationY;
      // Follows the finger; resists when pulled past the top stop.
      offset.set(next >= top ? next : top + (next - top) * 0.15);
    },
    onDeactivate: (e) => {
      if (e.canceled) {
        offset.set(withSpring(start.get(), SNAP));
        return;
      }
      // Where a flick would carry it.
      const projected = offset.get() + e.velocityY * 0.2;
      if (projected > rest + (hidden - rest) * 0.25) {
        // Closing: keep the drag's momentum all the way out (ease-out, no restart).
        dragClosing.set(true);
        offset.set(
          withTiming(hidden, { duration: 200, easing: Easing.out(Easing.quad) }, (finished) => {
            if (finished) scheduleOnRN(onDragClosed);
          }),
        );
        scheduleOnRN(onClose);
        return;
      }
      const target = expandable && projected < rest / 2 ? 0 : rest;
      scheduleOnRN(setExpanded, target === 0);
      offset.set(withSpring(target, { ...SNAP, velocity: e.velocityY }));
    },
  });

  return (
    <GestureDetector gesture={drag}>
      <Animated.View>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * Bottom sheet on React Native's Modal (reliable on every Android/Expo Go), animated with
 * Reanimated. Dragging the top area (or any `SheetDragArea` inside) moves the sheet with the
 * finger; letting go past a quarter of the way down (or with a flick) closes it, otherwise it
 * snaps back — or, when `expandable`, up to the full screen. Also closes by tapping outside or
 * with the back button. Children stay mounted until the closing animation ends.
 */
export function BottomSheet({
  visible,
  onClose,
  heightRatio = 0.9,
  expandable = false,
  fullScreen = false,
  follow,
  children,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The Modal draws under the status and navigation bars (translucent), which on Android can be
  // taller than the window size reports: measure the real area so full screen reaches the top.
  const [areaHeight, setAreaHeight] = useState(0);
  const height = areaHeight || windowHeight;
  // Expandable sheets are laid out at full size and pushed down to their open height.
  const openHeight = fullScreen ? height - insets.top : height * heightRatio;
  const sheetHeight = expandable ? Math.max(openHeight, height - insets.top) : openHeight;
  const rest = sheetHeight - openHeight;
  const hidden = sheetHeight;

  const offset = useSharedValue(hidden);
  const dragClosing = useSharedValue(false);
  const [mounted, setMounted] = useState(visible);
  const [expanded, setExpanded] = useState(false);
  if (visible && !mounted) {
    setMounted(true);
    setExpanded(false);
  }

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      dragClosing.set(false);
      // A finger is moving it (it follows that instead of opening by itself).
      if (follow && follow.get() >= 0) return;
      offset.set(withTiming(rest, OPEN));
    } else if (!dragClosing.get()) {
      offset.set(
        withTiming(hidden, CLOSE, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, mounted, rest, hidden, offset, dragClosing, follow]);
  // Follow the outside finger.
  useAnimatedReaction(
    () => (follow ? follow.get() : -1),
    (p) => {
      if (p >= 0) offset.set(hidden - p * (hidden - rest));
    },
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [rest, hidden], [1, 0], 'clamp'),
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
      <GestureHandlerRootView
        style={styles.root}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h && h !== areaHeight) setAreaHeight(h);
        }}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            // At the open stop the bottom `rest` px are off screen: keep the content above them.
            { height: sheetHeight, paddingBottom: insets.bottom + (expanded ? 0 : rest) },
            expanded && styles.sheetFull,
            sheetStyle,
          ]}
        >
          <SheetDragContext.Provider
            value={{
              offset,
              rest,
              hidden,
              expandable,
              dragClosing,
              onClose,
              onDragClosed: () => setMounted(false),
              setExpanded,
            }}
          >
            <SheetDragArea>
              <View style={styles.handleArea}>
                <SheetGrip />
              </View>
            </SheetDragArea>
            {children}
          </SheetDragContext.Provider>
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
  sheetFull: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  // Tall enough to grab comfortably with a thumb.
  handleArea: { paddingTop: 6, paddingBottom: 10 },
});
