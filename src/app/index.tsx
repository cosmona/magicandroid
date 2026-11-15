import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { DeckBar } from '@/components/deck/DeckBar';
import { DeckSheet } from '@/components/deck/DeckSheet';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { SettingsSheet } from '@/components/SettingsSheet';
import { SwipeArea } from '@/components/SwipeArea';
import { TopBar } from '@/components/TopBar';
import { useAppState } from '@/context/AppState';
import { colors } from '@/theme';

/**
 * Main screen: top bar (filters) → card stack → active deck bar.
 * Filters and the deck open in bottom sheets (RN Modal) over this screen, which stays
 * mounted so the card stack keeps its position.
 */
export default function MainScreen() {
  const { filters, setFilters } = useAppState();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <TopBar onOpenFilters={() => setFiltersOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
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

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} heightRatio={0.75}>
        <SettingsSheet />
      </BottomSheet>

      <BottomSheet visible={deckOpen} onClose={() => setDeckOpen(false)} heightRatio={0.85}>
        <DeckSheet />
      </BottomSheet>
    </SafeAreaView>
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
