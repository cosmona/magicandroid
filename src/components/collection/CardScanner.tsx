import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { displayName, LANGUAGE_NAMES, smallImageUrl, type Card } from '@/api/scryfall';
import { ArtPicker } from '@/components/ArtPicker';
import { LanguagePicker } from '@/components/LanguagePicker';
import { CARD_RATIO } from '@/components/SwipeCard';
import { addToCollection } from '@/db/database';
import { recognizeCard, scanSupported, type ScanResult } from '@/scan/recognizeCard';
import { colors } from '@/theme';

type Step =
  | { kind: 'camera' }
  | { kind: 'reading'; photo: string }
  | { kind: 'found'; card: Card }
  | { kind: 'notFound'; result: ScanResult | null; error?: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  /** After adding a card (to refresh the list and show a toast). */
  onAdded: (message: string) => void;
  /** "Buscar a mano": close and search this text in the collection screen. */
  onSearch: (text: string) => void;
}

/**
 * 📷 Full-screen scanner: photograph a card, read it on the device (ML Kit) and find it
 * on Scryfall. After adding it goes straight back to the camera, to scan a pile quickly.
 */
export function CardScanner({ visible, onClose, onAdded, onSearch }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>{visible && <Scanner {...{ onClose, onAdded, onSearch }} />}</SafeAreaView>
    </Modal>
  );
}

function Scanner({ onClose, onAdded, onSearch }: Omit<Props, 'visible'>) {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'camera' });
  const [count, setCount] = useState(0);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const frameWidth = width * 0.78;

  if (!scanSupported) {
    return (
      <Message
        title="Necesita la app instalada"
        text="El reconocimiento de cartas funciona dentro del móvil (Google ML Kit) y Expo Go no lo incluye. Funcionará en la versión instalada (APK)."
        onClose={onClose}
      />
    );
  }
  if (!permission) return <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />;
  if (!permission.granted) {
    return (
      <Message
        title="Permiso de cámara"
        text="Para reconocer cartas, Magic Swipe necesita usar la cámara."
        action={{ label: 'Permitir cámara', onPress: requestPermission }}
        onClose={onClose}
      />
    );
  }

  const shoot = async () => {
    if (!ready || step.kind !== 'camera') return;
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!photo) return;
      setStep({ kind: 'reading', photo: photo.uri });
      const result = await recognizeCard(photo.uri);
      setStep(result.card ? { kind: 'found', card: result.card } : { kind: 'notFound', result });
    } catch (e) {
      setStep({ kind: 'notFound', result: null, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const add = async (card: Card, copies = 1) => {
    const quantity = await addToCollection(db, card, 'paper', copies);
    setCount((n) => n + copies);
    const message = `✓ ${copies > 1 ? `${copies} × ` : ''}${displayName(card)} (tienes ${quantity})`;
    setLastAdded(message);
    onAdded(message);
    setStep({ kind: 'camera' });
  };

  const setCard = (card: Card) => setStep({ kind: 'found', card });

  return (
    <View style={styles.screen}>
      <View style={styles.cameraBox}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
        />
        {/* Card-shaped guide. */}
        <View pointerEvents="none" style={styles.guideLayer}>
          <View style={[styles.guide, { width: frameWidth, height: frameWidth * CARD_RATIO }]} />
          <Text style={styles.guideText}>Encuadra la carta entera, con buena luz y sin reflejos</Text>
        </View>
        {lastAdded && step.kind === 'camera' && (
          <View pointerEvents="none" style={styles.lastAdded}>
            <Text style={styles.lastAddedText} numberOfLines={1}>
              {lastAdded}
            </Text>
          </View>
        )}
        {step.kind === 'reading' && (
          <View style={styles.reading}>
            <Image source={{ uri: step.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.readingVeil}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.readingText}>Leyendo la carta…</Text>
            </View>
          </View>
        )}
      </View>

      {step.kind === 'found' && (
        <FoundPanel
          card={step.card}
          onChange={setCard}
          onAdd={(copies) => add(step.card, copies)}
          onRetry={() => setStep({ kind: 'camera' })}
        />
      )}
      {step.kind === 'notFound' && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>No he reconocido la carta</Text>
          <Text style={styles.muted} numberOfLines={3}>
            {step.error ??
              (step.result?.text.length
                ? `He leído: «${step.result.text.slice(0, 3).join(' · ').replace(/\n/g, ' ')}»`
                : 'No he encontrado texto en la foto.')}
          </Text>
          <Text style={styles.muted}>Prueba más cerca, con la carta recta y el nombre bien visible.</Text>
          <View style={styles.panelButtons}>
            <PanelButton label="↻ Repetir" onPress={() => setStep({ kind: 'camera' })} primary />
            {!!step.result?.hints.names[0] && (
              <PanelButton label="🔍 Buscar a mano" onPress={() => onSearch(step.result!.hints.names[0])} />
            )}
          </View>
        </View>
      )}

      {(step.kind === 'camera' || step.kind === 'reading') && (
        <View style={styles.controls}>
          <Pressable style={styles.sideButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.sideText}>✕</Text>
            {count > 0 && <Text style={styles.sideLabel}>{count} añadidas</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.shutter, (pressed || !ready || step.kind === 'reading') && { opacity: 0.5 }]}
            onPress={shoot}
            disabled={!ready || step.kind === 'reading'}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable style={styles.sideButton} onPress={() => setTorch((t) => !t)} hitSlop={10}>
            <Text style={[styles.sideText, torch && { color: colors.accent }]}>🔦</Text>
            <Text style={styles.sideLabel}>{torch ? 'Luz sí' : 'Luz no'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function FoundPanel(props: { card: Card; onChange: (card: Card) => void; onAdd: (copies: number) => void; onRetry: () => void }) {
  const { card } = props;
  // Copies to add (a new scan starts again at 1: this panel is made again).
  const [copies, setCopies] = useState(1);
  return (
    <View style={styles.panel}>
      <View style={styles.foundRow}>
        {card.imageUrl && (
          <Image
            source={{ uri: card.imageUrl }}
            placeholder={{ uri: smallImageUrl(card.imageUrl) }}
            style={styles.foundImage}
            contentFit="cover"
            transition={120}
          />
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.panelTitle} numberOfLines={2}>
            {displayName(card)}
          </Text>
          <Text style={styles.muted} numberOfLines={2}>
            {card.setName ?? card.set.toUpperCase()} · {LANGUAGE_NAMES[card.lang] ?? card.lang}
          </Text>
          <View style={styles.pickers}>
            <LanguagePicker card={card} onChange={props.onChange} />
            <ArtPicker card={card} onChange={props.onChange} />
          </View>
        </View>
      </View>
      <View style={styles.copiesRow}>
        <Text style={styles.copiesLabel}>Copias</Text>
        <Pressable
          style={({ pressed }) => [styles.copiesButton, pressed && { opacity: 0.6 }]}
          onPress={() => setCopies((n) => Math.max(1, n - 1))}
          accessibilityLabel="Una copia menos"
          hitSlop={6}
        >
          <Text style={styles.copiesSign}>−</Text>
        </Pressable>
        <Text style={styles.copiesValue}>{copies}</Text>
        <Pressable
          style={({ pressed }) => [styles.copiesButton, pressed && { opacity: 0.6 }]}
          onPress={() => setCopies((n) => Math.min(99, n + 1))}
          accessibilityLabel="Una copia más"
          hitSlop={6}
        >
          <Text style={styles.copiesSign}>＋</Text>
        </Pressable>
      </View>
      <View style={styles.panelButtons}>
        <PanelButton label="↻ No es esta" onPress={props.onRetry} />
        <PanelButton label={copies > 1 ? `＋ Añadir ${copies}` : '＋ Añadir a la colección'} onPress={() => props.onAdd(copies)} primary />
      </View>
    </View>
  );
}

function PanelButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.buttonText, primary && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

function Message(props: {
  title: string;
  text: string;
  action?: { label: string; onPress: () => void };
  onClose: () => void;
}) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageIcon}>📷</Text>
      <Text style={styles.panelTitle}>{props.title}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{props.text}</Text>
      <View style={styles.panelButtons}>
        <PanelButton label="Cerrar" onPress={props.onClose} />
        {props.action && <PanelButton label={props.action.label} onPress={props.action.onPress} primary />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  copiesRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  copiesLabel: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  copiesButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiesSign: { color: colors.text, fontSize: 22, fontWeight: '800' },
  copiesValue: { color: colors.text, fontSize: 20, fontWeight: '900', minWidth: 28, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#000' },
  cameraBox: { flex: 1, overflow: 'hidden' },
  guideLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 14 },
  guide: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 18 },
  guideText: {
    color: '#fff',
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  reading: { ...StyleSheet.absoluteFill },
  lastAdded: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: colors.add,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  lastAddedText: { color: '#111', fontWeight: '800' },
  readingVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  readingText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 18,
    backgroundColor: '#000',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  sideButton: { width: 80, alignItems: 'center', gap: 2 },
  sideText: { color: '#fff', fontSize: 26 },
  sideLabel: { color: colors.textMuted, fontSize: 11 },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 13 },
  foundRow: { flexDirection: 'row', gap: 14 },
  foundImage: { width: 110, aspectRatio: 1 / CARD_RATIO, borderRadius: 8 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  panelButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '800' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: colors.bg },
  messageIcon: { fontSize: 48 },
});
