import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { DeckBar } from '@/components/deck/DeckBar';
import { DeckSheet } from '@/components/deck/DeckSheet';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { SwipeArea } from '@/components/SwipeArea';
import { TopBar } from '@/components/TopBar';
import { useAppState } from '@/context/AppState';
import { markSeen } from '@/hooks/useSeen';
import { colors } from '@/theme';

/**
 * Pestaña «Construir» — la app abre aquí: cartas en la mano.
 * Barra de filtros → pila de cartas → barra del mazo activo (la cabecera y las pestañas están arriba, en `AppTabBar`).
 * Los filtros y el mazo abren en hojas inferiores (Modal de RN) sobre esta pantalla, que se queda
 * montada para que la pila de cartas conserve su posición.
 */
export default function MainScreen() {
  const { filters, setFilters, activeDeck } = useAppState();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  // La hoja del mazo mientras se arrastra la barra (0 cerrada … 1 abierta; -1 sin arrastrar).
  return (
    <View style={styles.screen}>
      <TopBar onOpenFilters={() => setFiltersOpen(true)} />
      <View style={styles.content}>
        <SwipeArea onToast={showToast} />
        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>
      <DeckBar onOpen={() => setDeckOpen(true)} />

      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} heightRatio={0.92}>
        <FilterPanel
          applied={filters}
          onApply={(f) => {
            setFilters(f);
            setFiltersOpen(false);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={deckOpen}
        onClose={() => {
          if (activeDeck) markSeen(`deckcards:${activeDeck.uid}`, Date.now());
          setDeckOpen(false);
        }}
        fullScreen
      >
        <DeckSheet />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  toast: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    maxWidth: '90%',
  },
  toastText: { color: colors.text, fontWeight: '600' },
});
