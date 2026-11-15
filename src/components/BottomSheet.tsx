import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SheetGrip } from '@/components/SheetGrip';
import { colors } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fraction of the screen height the sheet takes. */
  heightRatio?: number;
  children: ReactNode;
}

/**
 * Bottom sheet built on React Native's Modal (reliable on every Android/Expo Go).
 * Closes by tapping outside, with the back button, or by swiping the grip area down.
 * Children are only mounted while visible.
 */
export function BottomSheet({ visible, onClose, heightRatio = 0.9, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const swipeDown = usePanGesture({
    activeOffsetY: [-15, 15],
    failOffsetX: [-30, 30],
    onDeactivate: (e) => {
      if (!e.canceled && (e.translationY > 60 || e.velocityY > 600)) scheduleOnRN(onClose);
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Modals render in their own window, so they need their own gesture root. */}
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { height: height * heightRatio, paddingBottom: insets.bottom }]}>
          <GestureDetector gesture={swipeDown}>
            <View style={styles.handleArea}>
              <SheetGrip />
            </View>
          </GestureDetector>
          {children}
        </View>
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
  handleArea: { paddingTop: 4, paddingBottom: 2 },
});
