import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '@/theme';

/**
 * Row wrapper: drag right to delete. Only rightward horizontal drags activate, so the
 * list's vertical scroll and leftward moves are left alone.
 */
export function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.35;
  const x = useSharedValue(0);

  const pan = usePanGesture({
    activeOffsetX: 15, // activates only after moving 15pt to the right
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      x.set(Math.max(0, e.translationX));
    },
    onDeactivate: (e) => {
      if (!e.canceled && (e.translationX > threshold || e.velocityX > 900)) {
        x.set(
          withTiming(width, { duration: 180 }, (done) => {
            if (done) scheduleOnRN(onDelete);
          }),
        );
      } else {
        x.set(withSpring(0));
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const behindStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, threshold], [0.3, 1], 'clamp'),
  }));

  return (
    <View>
      <Animated.View style={[styles.behind, behindStyle]}>
        <Text style={styles.behindText}>🗑 Quitar</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  behind: {
    ...StyleSheet.absoluteFill,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: colors.discard,
    justifyContent: 'center',
    paddingLeft: 20,
  },
  behindText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
