import { useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme';

const BUBBLE_WIDTH = 220;
const SHOW_MS = 1600;

/**
 * Tooltip para botones de icono: mantener el dedo en el botón (pulsación larga) muestra su nombre en una
 * burbuja encima un momento. Pon `ref` en el botón, dale `onLongPress`, y renderiza `bubble` en cualquier
 * sitio junto a él (es un Modal, así que nada lo recorta).
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
 * Un Pressable que muestra `hint` (también su etiqueta de accesibilidad) en una burbuja cuando el dedo
 * se queda en él. Por lo demás, las mismas props que Pressable.
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
