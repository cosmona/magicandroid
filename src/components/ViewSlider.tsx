// A horizontal pager for the deck's and collection's views (list, gallery, big, text). Swiping the
// list sideways brings the next (or previous) view in under the finger, with its real content; on
// letting go past a third of the screen (or with a flick) it settles there, otherwise it goes back.
// The neighbour view is only mounted while a sideways drag is in progress, so normally there is just
// one list on screen. Vertical scrolling and long-press card drags still work (this gesture only
// claims clearly-horizontal moves).
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const SLIDE = { duration: 200, easing: Easing.out(Easing.cubic) };
const SNAP = { damping: 22, stiffness: 220, overshootClamping: true };

export function ViewSlider({
  index,
  count,
  onChange,
  renderView,
  onDrag,
  pinned,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
  /** The real content of view `i` (an index into the list of views). */
  renderView: (index: number) => ReactNode;
  /** True while a sideways drag is happening (to pin a fixed header over the sliding cards). */
  onDrag?: (active: boolean) => void;
  /** A fixed header drawn over the sliding cards; it only shows while dragging (no lag). */
  pinned?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  // The neighbour mounted during a drag, tied to the view it was started from (so it drops by itself
  // once the view changes, without resetting state inside an effect).
  const [drag, setDrag] = useState<{ at: number; dir: -1 | 1 } | null>(null);

  // Back to the resting position whenever the view actually changes.
  useEffect(() => {
    x.set(0);
  }, [index, x]);

  const mount = (dir: -1 | 1) => setDrag((d) => (d && d.at === index && d.dir === dir ? d : { at: index, dir }));
  const change = (step: -1 | 1) => {
    onChange(index + step);
    setDrag(null);
    onDrag?.(false);
  };
  const rest = () => {
    setDrag(null);
    onDrag?.(false);
  };
  const begin = () => onDrag?.(true);

  const pan = usePanGesture({
    activeOffsetX: [-20, 20],
    failOffsetY: [-16, 16],
    onActivate: () => scheduleOnRN(begin),
    onUpdate: (e) => {
      let dx = e.translationX;
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      const canGo = dir === 1 ? index < count - 1 : index > 0;
      if (!canGo) {
        x.set(dx * 0.2);
        return;
      }
      scheduleOnRN(mount, dir);
      x.set(dx);
    },
    onDeactivate: (e) => {
      const projected = e.translationX + e.velocityX * 0.2;
      const dir: -1 | 1 = projected < 0 ? 1 : -1;
      const canGo = dir === 1 ? index < count - 1 : index > 0;
      if (!e.canceled && canGo && Math.abs(projected) > width / 3) {
        x.set(withTiming(dir === 1 ? -width : width, SLIDE, (done) => done && scheduleOnRN(change, dir)));
      } else {
        x.set(withSpring(0, SNAP, (done) => done && scheduleOnRN(rest)));
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  // The pinned header shows the instant the cards start moving, and hides when they settle (driven by
  // the gesture on the UI thread, so there is no lag).
  const pinStyle = useAnimatedStyle(() => ({ opacity: Math.abs(x.get()) > 0.5 ? 1 : 0 }));
  const showNeighbour = drag && drag.at === index && index + drag.dir >= 0 && index + drag.dir < count;

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.clip}>
        <Animated.View style={[styles.fill, rowStyle]}>{renderView(index)}</Animated.View>
        {showNeighbour && (
          <Animated.View style={[styles.side, { width, left: drag.dir * width }, rowStyle]}>
            {renderView(index + drag.dir)}
          </Animated.View>
        )}
        {pinned && (
          <Animated.View pointerEvents="none" style={[styles.pin, pinStyle]}>
            {pinned}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  side: { position: 'absolute', top: 0, bottom: 0 },
  pin: { position: 'absolute', top: 0, left: 0, right: 0 },
});
