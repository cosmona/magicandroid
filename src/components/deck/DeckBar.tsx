import { StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { DeckSummary } from '@/components/deck/DeckSummary';
import { colors } from '@/theme';

/**
 * Barra inferior que muestra el mazo activo. Tócala o deslízala hacia arriba para abrir la hoja del mazo
 * (que entra con su propia animación). No tiene botones, así que el toque y el swipe nunca compiten con nada.
 */
export function DeckBar({ onOpen }: { onOpen: () => void }) {
  // Es el borde inferior de la pantalla: mantenla despejada de los botones de navegación de Android.
  const insets = useSafeAreaInsets();
  const swipeUp = usePanGesture({
    activeOffsetY: -10,
    failOffsetX: [-25, 25],
    onActivate: () => scheduleOnRN(onOpen),
  });
  const tap = useTapGesture({ onActivate: () => scheduleOnRN(onOpen) });
  const gesture = useCompetingGestures(swipeUp, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.bar, { paddingBottom: 6 + insets.bottom }]}>
        <SheetGrip />
        <DeckSummary compact />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
});
