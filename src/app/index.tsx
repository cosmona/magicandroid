import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDragToggle, useOpenProgress } from '@/components/Collapsible';
import { DeckConstructorBar, DeckPanel, type ViewMode } from '@/components/DeckConstructor';
import { FilterBar } from '@/components/filters/FilterBar';
import { Header } from '@/components/Header';
import { SwipeArea } from '@/components/SwipeArea';
import { colors } from '@/theme';

/**
 * Single screen, same top-to-bottom layout as the web app (App.tsx):
 * Header → Filtros → card stack → MazoConstructor (deck picker + deck, slides up over the stack).
 * The web's separate Mazos bar lives inside the constructor panel (DeckPicker).
 */
export default function MainScreen() {
  const [constructorOpen, setConstructorOpen] = useState(false);
  const [mode, setMode] = useState<ViewMode>('list');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Bottom sheet: progress 0 = hidden below the content area, 1 = covering it.
  const sheetProgress = useOpenProgress(constructorOpen);
  const sheetHeight = useSharedValue(0);
  const sheetDrag = useDragToggle(sheetProgress, sheetHeight, setConstructorOpen, 'up');
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.get()) * sheetHeight.get() }],
  }));

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header />
      <FilterBar />

      <View style={styles.content} onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}>
        {/* Kept mounted under the panel so the card queue isn't lost. */}
        <SwipeArea onToast={showToast} />
        {/* Deck panel slides up from the bar, following the finger while dragging. */}
        <Animated.View style={[StyleSheet.absoluteFill, sheetStyle]}>
          <DeckPanel mode={mode} />
        </Animated.View>
        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      <DeckConstructorBar
        open={constructorOpen}
        onToggleOpen={() => setConstructorOpen((o) => !o)}
        mode={mode}
        onToggleMode={() => setMode((m) => (m === 'list' ? 'gallery' : 'list'))}
        dragGesture={sheetDrag}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, overflow: 'hidden' },
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
