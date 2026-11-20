import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useAppState } from '@/context/AppState';
import { LOGO_MARK, LOGO_MARK_RATIO } from '@/icons';
import { colors } from '@/theme';

/** Tiempo mínimo que se queda la pantalla de carga, para que se lea como una intro y no como un parpadeo. */
const MIN_VISIBLE_MS = 1400;

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Pantalla de carga sobre toda la app mientras cargan la base de datos y el estado guardado:
 * logo, nombre y versión. Se desvanece cuando la app está lista (y pasó MIN_VISIBLE_MS).
 */
export function LoadingScreen() {
  const { ready } = useAppState();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (ready && minElapsed) return null;

  return (
    <Animated.View exiting={FadeOut.duration(400)} style={styles.container}>
      <Image source={LOGO_MARK} style={styles.logo} contentFit="contain" />
      <Text style={styles.title}>Magic Swipe</Text>
      <Text style={styles.subtitle}>Tus cartas, en la mano</Text>
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
      <Text style={styles.version}>Versión {APP_VERSION}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  logo: { width: 220, height: 220 / LOGO_MARK_RATIO },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: 1, marginTop: 20 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: 4 },
  spinner: { marginTop: 28 },
  version: { position: 'absolute', bottom: 48, color: colors.textMuted, fontSize: 13, letterSpacing: 0.5 },
});
