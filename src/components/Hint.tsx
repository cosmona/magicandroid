import { useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme';

const BUBBLE_WIDTH = 220;
const SHOW_MS = 1600;

/**
 * Tooltip for icon buttons: keeping the finger on the button (long press) shows its name in a
 * bubble above it for a moment. Attach `ref` to the button, give it `onLongPress`, and render
 * `bubble` anywhere next to it (it's a Modal, so nothing clips it).
 */
export function useHint(label: string) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onLongPress = () => {
    ref.current?.measureInWindow((x, y, w) => {
      setPos({ x, y, w });
      Haptics.selectionAsync().catch(() => {});
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPos(null), SHOW_MS);
    });
  };

  const left = pos ? Math.min(Math.max(8, pos.x + pos.w / 2 - BUBBLE_WIDTH / 2), width - BUBBLE_WIDTH - 8) : 0;
  const bubble = pos ? (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPos(null)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPos(null)}>
        <View style={[styles.wrap, { left, top: Math.max(8, pos.y - 46) }]} pointerEvents="none">
          <View style={styles.bubble}>
            <Text style={styles.text}>{label}</Text>
          </View>
        </View>
      </Pressable>
    </Modal>
  ) : null;

  return { ref, onLongPress, bubble };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: BUBBLE_WIDTH, alignItems: 'center' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.text,
    elevation: 10,
  },
  text: { color: colors.bg, fontWeight: '800', fontSize: 13, textAlign: 'center' },
});

/**
 * A Pressable that shows `hint` (also its accessibility label) in a bubble when the finger
 * stays on it. Same props as Pressable otherwise.
 */
export function HintButton({
  hint,
  children,
  ...props
}: Omit<ComponentProps<typeof Pressable>, 'onLongPress' | 'ref'> & { hint: string }) {
  const { ref, onLongPress, bubble } = useHint(hint);
  return (
    <>
      <Pressable
        {...props}
        ref={ref}
        onLongPress={onLongPress}
        delayLongPress={400}
        accessibilityRole={props.accessibilityRole ?? 'button'}
        accessibilityLabel={props.accessibilityLabel ?? hint}
      >
        {children}
      </Pressable>
      {bubble}
    </>
  );
}
