// Un paginador horizontal para las vistas del mazo y la colección (lista, galería, grande, texto).
// Deslizar la lista a los lados trae la siguiente (o anterior) vista bajo el dedo, con su contenido real;
// al soltar pasado un tercio de la pantalla (o con un golpe seco) se asienta ahí, si no vuelve. La vista
// vecina solo se monta mientras hay un arrastre lateral en curso, así que normalmente solo hay una lista en
// pantalla. El scroll vertical y los arrastres de carta por pulsación larga siguen funcionando (este gesto
// solo reclama los movimientos claramente horizontales).
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
  /** El contenido real de la vista `i` (un índice en la lista de vistas). */
  renderView: (index: number) => ReactNode;
  /** True mientras hay un arrastre lateral (para fijar una cabecera sobre las cartas que se deslizan). */
  onDrag?: (active: boolean) => void;
  /** Una cabecera fija dibujada sobre las cartas que se deslizan; solo se muestra mientras se arrastra (sin retardo). */
  pinned?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  // La vecina montada durante un arrastre, atada a la vista desde la que empezó (así se descarta sola
  // cuando cambia la vista, sin reiniciar estado dentro de un efecto).
  const [drag, setDrag] = useState<{ at: number; dir: -1 | 1 } | null>(null);

  // Vuelve a la posición de reposo cada vez que la vista cambia de verdad.
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
  // La cabecera fija se muestra en cuanto las cartas empiezan a moverse, y se oculta cuando se asientan
  // (gobernada por el gesto en el hilo de UI, así que no hay retardo).
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
