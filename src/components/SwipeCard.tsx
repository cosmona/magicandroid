import { useImperativeHandle, type Ref } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { smallImageUrl, type Card } from '@/api/scryfall';
import { colors } from '@/theme';

export type SwipeDirection = 'left' | 'right' | 'up';

export interface SwipeCardHandle {
  /** Anima la carta hacia fuera como si se deslizara (lo usan los botones en pantalla). */
  swipe: (dir: SwipeDirection) => void;
}

interface Props {
  card: Card;
  showBack: boolean;
  onSwiped: (dir: SwipeDirection) => void;
  /** Un toque en la carta (sin arrastrarla). */
  onTap?: () => void;
  ref?: Ref<SwipeCardHandle>;
}

export const CARD_RATIO = 680 / 488; // height / width of a Magic card image
const FLING_VELOCITY = 800;

/**
 * Carta de arriba de la pila. Arrastrar a la derecha = añadir al mazo, izquierda = descartar, arriba =
 * «Posibles»; un toque la abre. Los callbacks de gestos corren en el hilo de UI (worklets de Reanimated);
 * el resultado se devuelve a React con `scheduleOnRN`. Renderiza con `key={card.id}` para que cada carta
 * nueva empiece con shared values frescos.
 */
export function SwipeCard({ card, showBack, onSwiped, onTap, ref }: Props) {
  const { width, height } = useWindowDimensions();
  const threshold = width * 0.25;
  const upThreshold = height * 0.14;
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const gone = useSharedValue(false);

  // Los shared values usan .get()/.set() (no .value) para seguir siendo compatibles con el React Compiler.
  const flyOut = (dir: SwipeDirection) => {
    'worklet';
    if (gone.get()) return;
    gone.set(true);
    if (dir === 'up') {
      y.set(
        withTiming(-height * 1.2, { duration: 220 }, (done) => {
          if (done) scheduleOnRN(onSwiped, dir);
        }),
      );
      return;
    }
    x.set(
      withTiming((dir === 'right' ? 1 : -1) * width * 1.5, { duration: 220 }, (done) => {
        if (done) scheduleOnRN(onSwiped, dir);
      }),
    );
  };

  useImperativeHandle(ref, () => ({ swipe: (dir) => flyOut(dir) }));

  const pan = usePanGesture({
    onUpdate: (e) => {
      if (gone.get()) return;
      x.set(e.translationX);
      y.set(e.translationY);
    },
    onDeactivate: (e) => {
      const right = e.translationX > threshold || (e.velocityX > FLING_VELOCITY && e.translationX > 0);
      const left = e.translationX < -threshold || (e.velocityX < -FLING_VELOCITY && e.translationX < 0);
      // Arriba (sobre todo vertical): «Posibles».
      const up =
        Math.abs(e.translationY) > Math.abs(e.translationX) &&
        (e.translationY < -upThreshold || (e.velocityY < -FLING_VELOCITY && e.translationY < 0));
      if (!e.canceled && up) {
        flyOut('up');
      } else if (!e.canceled && (right || left)) {
        flyOut(right ? 'right' : 'left');
      } else {
        x.set(withSpring(0));
        y.set(withSpring(0));
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${interpolate(x.get(), [-width, width], [-18, 18])}deg` },
    ],
  }));
  const addStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const discardStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const maybeStampStyle = useAnimatedStyle(() => ({
    opacity:
      Math.abs(y.get()) > Math.abs(x.get()) ? interpolate(y.get(), [-upThreshold, 0], [1, 0], Extrapolation.CLAMP) : 0,
  }));

  const uri = (showBack && card.backImageUrl) || card.imageUrl;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onTap} disabled={!onTap} accessibilityLabel="Ver la ficha de la carta">
        <Image
          source={{ uri: uri ?? undefined }}
          // La miniatura de ~15 KB se muestra casi al instante mientras carga la imagen completa.
          placeholder={uri ? { uri: smallImageUrl(uri) } : undefined}
          placeholderContentFit="contain"
          style={styles.image}
          contentFit="contain"
          transition={150}
        />
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.stamp, styles.maybeStamp, maybeStampStyle]}>
          <Text style={[styles.stampText, { color: colors.info }]}>POSIBLES</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.stamp, styles.addStamp, addStampStyle]}>
          <Text style={[styles.stampText, { color: colors.add }]}>AÑADIR</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.stamp, styles.discardStamp, discardStampStyle]}>
          <Text style={[styles.stampText, { color: colors.discard }]}>DESCARTAR</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: { ...StyleSheet.absoluteFill },
  image: { flex: 1, borderRadius: 16 },
  stamp: {
    position: 'absolute',
    top: 32,
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  addStamp: { left: 20, borderColor: colors.add, transform: [{ rotate: '-15deg' }] },
  discardStamp: { right: 20, borderColor: colors.discard, transform: [{ rotate: '15deg' }] },
  maybeStamp: { top: undefined, bottom: 40, alignSelf: 'center', borderColor: colors.info },
  stampText: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
});
