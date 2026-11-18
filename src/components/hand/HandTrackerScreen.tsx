import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { displayName } from '@/api/scryfall';
import { useAppState } from '@/context/AppState';
import { cardsInText, correctHand, emptyHand, updateHand, type HandCandidate, type HandState } from '@/hand/handTracker';
import { colors } from '@/theme';

type TextExtractor = typeof import('expo-text-extractor');
// On-device text recognition (ML Kit): only in the APK, not in Expo Go.
let extractor: TextExtractor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  extractor = require('expo-text-extractor') as TextExtractor;
  if (!extractor.isSupported) extractor = null;
} catch {
  extractor = null;
}

/** Pause between photos (ms). */
const GAP_MS = 500;
const now = () => Date.now();
const clockOf = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * «Mano» (prototype): the phone on a stand looks at your hand of cards in a fan (only the titles need to
 * show). It takes a photo every moment, reads the titles and compares them with the cards of the active
 * deck: what appears is «robada», what disappears «sale». Tap a card in the hand to correct it.
 */
export function HandTrackerScreen() {
  // Only while this tab is shown (the camera is let go when you leave it).
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { activeDeck, activeCards } = useAppState();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [running, setRunning] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [state, setState] = useState<HandState>(emptyHand);
  const [lastLines, setLastLines] = useState<string[]>([]);
  const [showText, setShowText] = useState(false);
  const [photos, setPhotos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The deck's cards (not the commander: it isn't in the hand).
  const candidates = useMemo<HandCandidate[]>(
    () =>
      activeCards
        .filter((c) => !c.isCommander)
        .map((c) => ({ oracleId: c.oracleId, label: displayName(c), names: [c.printedName ?? '', c.name], copies: c.quantity })),
    [activeCards],
  );
  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  // The loop: photo → text → cards seen → hand (while running and the tab is shown).
  useEffect(() => {
    if (!running || !focused || !extractor) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const pic = await camera.current?.takePictureAsync({ quality: 0.6, shutterSound: false, skipProcessing: true });
          if (pic?.uri && !stop) {
            const lines = await extractor!.extractTextFromImage(pic.uri);
            try {
              new File(pic.uri).delete();
            } catch {
              /* a temporary file anyway */
            }
            if (stop) break;
            setLastLines(lines);
            setPhotos((n) => n + 1);
            const seen = cardsInText(lines, candidatesRef.current);
            setState((s) => updateHand(s, seen, candidatesRef.current, now()));
          }
        } catch {
          setError('La cámara no responde: vuelve a pulsar «Empezar».');
          stop = true;
          setRunning(false);
        }
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    })();
    return () => {
      stop = true;
    };
  }, [running, focused]);

  const hand = [...state.hand.entries()].map(([id, n]) => ({ c: candidates.find((x) => x.oracleId === id), id, n }));
  const total = hand.reduce((s, h) => s + h.n, 0);

  if (!extractor) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>El reconocimiento de texto solo funciona en el APK (no en Expo Go).</Text>
      </View>
    );
  }
  if (!activeDeck || !candidates.length) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="cards-outline" size={40} color={colors.textMuted} />
        <Text style={styles.muted}>Abre un mazo en Construir: la cámara reconoce las cartas de ese mazo.</Text>
      </View>
    );
  }
  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Para ver tu mano, la app necesita la cámara.</Text>
        <Pressable style={[styles.button, styles.primary]} onPress={requestPermission}>
          <Text style={[styles.buttonText, { color: colors.bg }]}>Permitir la cámara</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.cameraBox}>
        {focused && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} animateShutter={false} />}
        <View style={styles.cameraTop}>
          <Text style={styles.badge}>
            {running ? `● Leyendo · ${photos} fotos` : 'Pausado'} · {activeDeck.name}
          </Text>
          <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} hitSlop={8} accessibilityLabel="Cambiar de cámara">
            <MaterialCommunityIcons name="camera-flip-outline" size={24} color="#fff" />
          </Pressable>
        </View>
        {showText && (
          <ScrollView style={styles.textBox}>
            <Text style={styles.textLines}>{lastLines.join('\n') || '(nada leído)'}</Text>
          </ScrollView>
        )}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.button, !running && styles.primary]}
          onPress={() => {
            setError(null);
            setRunning((r) => !r);
          }}
        >
          <MaterialCommunityIcons name={running ? 'pause' : 'play'} size={20} color={running ? colors.text : colors.bg} />
          <Text style={[styles.buttonText, !running && { color: colors.bg }]}>{running ? 'Pausar' : 'Empezar'}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setShowText((v) => !v)}>
          <MaterialCommunityIcons name="text-recognition" size={20} color={colors.text} />
          <Text style={styles.buttonText}>{showText ? 'Ocultar texto' : 'Ver texto'}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setState(emptyHand())}>
          <MaterialCommunityIcons name="restart" size={20} color={colors.text} />
          <Text style={styles.buttonText}>Reiniciar</Text>
        </Pressable>
      </View>
      {error && <Text style={[styles.muted, { color: colors.discard, paddingHorizontal: 12 }]}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>En la mano ({total})</Text>
        {hand.length === 0 && <Text style={styles.muted}>Pon el móvil en el soporte, enfoca tu mano en abanico (que se lean los títulos) y pulsa «Empezar».</Text>}
        <View style={styles.wrap}>
          {hand.map(({ c, id, n }) => (
            <Pressable
              key={id}
              style={styles.handChip}
              onPress={() => setState((s) => correctHand(s, id, c?.label ?? id, -1, now()))}
              accessibilityLabel={`${c?.label}: toca para quitar una`}
            >
              {n > 1 && <Text style={styles.handCount}>{n}×</Text>}
              <Text style={styles.handName} numberOfLines={1}>
                {c?.label ?? id}
              </Text>
              <MaterialCommunityIcons name="close" size={14} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Lo que ha pasado</Text>
        {state.events.length === 0 && <Text style={styles.muted}>Aquí sale cada carta que robas y cada carta que sale de tu mano.</Text>}
        {[...state.events].reverse().map((e, i) => (
          <View key={i} style={styles.event}>
            <Text style={styles.time}>{clockOf(e.at)}</Text>
            <MaterialCommunityIcons
              name={e.kind === 'drawn' ? 'arrow-down-bold-circle-outline' : 'arrow-up-bold-circle-outline'}
              size={18}
              color={e.kind === 'drawn' ? colors.add : colors.undo}
            />
            <Text style={[styles.eventKind, { color: e.kind === 'drawn' ? colors.add : colors.undo }]}>{e.kind === 'drawn' ? 'Robada' : 'Sale'}</Text>
            <Text style={styles.eventName} numberOfLines={1}>
              {e.label}
            </Text>
            {e.manual && <Text style={styles.muted}>(a mano)</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  cameraBox: { height: '42%', backgroundColor: '#000', overflow: 'hidden' },
  cameraTop: { position: 'absolute', top: 8, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { color: '#fff', fontWeight: '800', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  textBox: { position: 'absolute', left: 8, right: 8, bottom: 8, maxHeight: '55%', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: 8 },
  textLines: { color: '#fff', fontSize: 11 },
  controls: { flexDirection: 'row', gap: 8, padding: 10 },
  button: { flex: 1, flexDirection: 'row', gap: 6, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  body: { padding: 12, gap: 8, paddingBottom: 30 },
  section: { color: colors.accent, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  handChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.add, backgroundColor: colors.surface, maxWidth: '100%' },
  handCount: { color: colors.add, fontWeight: '900' },
  handName: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  time: { color: colors.textMuted, fontSize: 11, width: 62, fontVariant: ['tabular-nums'] },
  eventKind: { fontWeight: '900', fontSize: 13, width: 54 },
  eventName: { flex: 1, color: colors.text, fontSize: 14 },
});
