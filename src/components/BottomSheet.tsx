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
  /** Fracción de la altura de la pantalla a la que abre la hoja. */
  heightRatio?: number;
  /** Arrastrar hacia arriba desde la posición abierta la agranda a pantalla completa (un tercer tope). */
  expandable?: boolean;
  /** Abre a pantalla completa (bajo la barra de estado): solo dos posiciones, abierta o cerrada. */
  fullScreen?: boolean;
  /**
   * Gobernada desde fuera mientras un dedo la arrastra (la barra del mazo): 0 = cerrada … 1 = abierta;
   * -1 = sin gobernar (sus propias animaciones y arrastre funcionan como siempre).
   */
  follow?: SharedValue<number>;
  children: ReactNode;
}

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic) };
const SNAP = { damping: 24, stiffness: 240, overshootClamping: true };

interface SheetDrag {
  /** Cuánto se empuja hacia abajo la hoja: 0 = tamaño completo, `rest` = abierta, `hidden` = fuera de pantalla. */
  offset: SharedValue<number>;
  rest: number;
  hidden: number;
  expandable: boolean;
  /** Se activa cuando un arrastre cierra la hoja: su propia animación termina el trabajo. */
  dragClosing: SharedValue<boolean>;
  onClose: () => void;
  onDragClosed: () => void;
  setExpanded: (expanded: boolean) => void;
}
const SheetDragContext = createContext<SheetDrag | null>(null);

/**
 * Convierte a sus hijos en un asa del BottomSheet que los envuelve: un arrastre vertical sobre ellos
 * mueve la hoja (los botones de dentro siguen funcionando con un toque; en cuanto empieza el arrastre,
 * su pulsación se cancela). Los movimientos horizontales se dejan en paz, así que las listas
 * horizontales de dentro siguen haciendo scroll. No envuelvas listas verticales: úsalo para la parte
 * fija que está encima de ellas.
 */
export function SheetDragArea({ children }: { children: ReactNode }) {
  const ctx = useContext(SheetDragContext);
  if (!ctx) throw new Error('SheetDragArea must be inside a BottomSheet');
  const { offset, rest, hidden, expandable, dragClosing, onClose, onDragClosed, setExpanded } = ctx;
  const start = useSharedValue(0);
  // Lo más alto que puede subir la hoja: pantalla completa si es expandible, si no su posición abierta.
  const top = expandable ? 0 : rest;

  // Cada detector necesita su propio gesto, así que cada área construye uno.
  const drag = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-20, 20],
    onActivate: () => {
      start.set(offset.get());
    },
    onUpdate: (e) => {
      const next = start.get() + e.translationY;
      // Sigue al dedo; resiste cuando se tira más allá del tope superior.
      offset.set(next >= top ? next : top + (next - top) * 0.15);
    },
    onDeactivate: (e) => {
      if (e.canceled) {
        offset.set(withSpring(start.get(), SNAP));
        return;
      }
      // Adónde la llevaría un golpe seco.
      const projected = offset.get() + e.velocityY * 0.2;
      if (projected > rest + (hidden - rest) * 0.25) {
        // Cerrando: mantén el impulso del arrastre hasta el final (ease-out, sin reiniciar).
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
 * Hoja inferior sobre el Modal de React Native (fiable en todo Android/Expo Go), animada con
 * Reanimated. Arrastrar la zona superior (o cualquier `SheetDragArea` de dentro) mueve la hoja con el
 * dedo; soltar pasado un cuarto del recorrido hacia abajo (o con un golpe seco) la cierra, si no
 * vuelve a su sitio — o, cuando es `expandable`, sube a pantalla completa. También cierra tocando
 * fuera o con el botón atrás. Los hijos siguen montados hasta que termina la animación de cierre.
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
  // El Modal se dibuja bajo las barras de estado y navegación (translúcidas), que en Android pueden ser
  // más altas de lo que informa el tamaño de la ventana: mide el área real para que la pantalla completa llegue arriba.
  const [areaHeight, setAreaHeight] = useState(0);
  const height = areaHeight || windowHeight;
  // Las hojas expandibles se maquetan a tamaño completo y se empujan hacia abajo hasta su altura abierta.
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
      // Un dedo la está moviendo (sigue eso en vez de abrirse por sí sola).
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
  // Sigue al dedo de fuera.
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
            // En el tope abierto los `rest` px de abajo quedan fuera de pantalla: mantén el contenido por encima.
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
  // Lo bastante alta para agarrarla cómodamente con el pulgar.
  handleArea: { paddingTop: 6, paddingBottom: 10 },
});
