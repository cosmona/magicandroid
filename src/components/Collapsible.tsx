import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '@/theme';

const FLING_VELOCITY = 500;
const DURATION = 200;

/** 0 = closed, 1 = open. Animates whenever `open` changes. */
export function useOpenProgress(open: boolean) {
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(open ? 1 : 0, { duration: DURATION }));
  }, [open, progress]);
  return progress;
}

/**
 * Vertical drag that moves `progress` with the finger (one panel `height` = full travel)
 * and snaps open/closed on release, by position or fling velocity.
 * `openDirection` is the finger direction that opens: 'down' for top bars, 'up' for bottom sheets.
 */
export function useDragToggle(
  progress: SharedValue<number>,
  height: SharedValue<number>,
  onOpenChange: (open: boolean) => void,
  openDirection: 'down' | 'up' = 'down',
) {
  const start = useSharedValue(0);
  const sign = openDirection === 'down' ? 1 : -1;
  return usePanGesture({
    activeOffsetY: [-10, 10],
    failOffsetX: [-20, 20],
    onActivate: () => {
      start.set(progress.get());
    },
    onUpdate: (e) => {
      const h = Math.max(height.get(), 1);
      progress.set(Math.min(1, Math.max(0, start.get() + (sign * e.translationY) / h)));
    },
    onDeactivate: (e) => {
      const v = sign * e.velocityY;
      const open = v > FLING_VELOCITY ? true : v < -FLING_VELOCITY ? false : progress.get() > 0.5;
      progress.set(withTiming(open ? 1 : 0, { duration: DURATION }));
      scheduleOnRN(onOpenChange, open);
    },
  });
}

/** Small pill that hints a bar can be dragged. */
export function Grip({ position }: { position: 'top' | 'bottom' }) {
  return <View pointerEvents="none" style={[styles.grip, position === 'top' ? { top: 3 } : { bottom: 3 }]} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the panel unfolds relative to the bar. */
  panelPosition: 'above' | 'below';
  /** Bar content. Tapping the bar toggles; dragging it down/up opens/closes. */
  bar: ReactNode;
  barStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Bar + panel that unfolds following the finger. The panel is always mounted (so it can be
 * measured and keeps its state) and clipped to `progress × its natural height`.
 */
export function Collapsible({ open, onOpenChange, panelPosition, bar, barStyle, children }: Props) {
  const progress = useOpenProgress(open);
  const height = useSharedValue(0);

  const toggle = () => onOpenChange(!open);
  const tap = useTapGesture({
    onActivate: () => {
      scheduleOnRN(toggle);
    },
  });
  const barPan = useDragToggle(progress, height, onOpenChange);
  const barGesture = useCompetingGestures(barPan, tap);

  const clipStyle = useAnimatedStyle(() => ({ height: progress.get() * height.get() }));

  const panel = (
    <Animated.View style={[{ overflow: 'hidden' }, clipStyle]}>
      <View
        style={{ position: 'absolute', left: 0, right: 0, [panelPosition === 'above' ? 'bottom' : 'top']: 0 }}
        onLayout={(e) => height.set(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );

  return (
    <View>
      {panelPosition === 'above' && panel}
      <GestureDetector gesture={barGesture}>
        <View style={barStyle}>
          {bar}
          <Grip position="bottom" />
        </View>
      </GestureDetector>
      {panelPosition === 'below' && panel}
    </View>
  );
}

const styles = StyleSheet.create({
  grip: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
