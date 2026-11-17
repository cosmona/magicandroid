import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '@/context/AppState';
import { getSetting, setSetting } from '@/db/database';
import { notifyWantedChanged } from '@/hooks/useWanted';
import { notifyTagsChanged } from '@/components/tags/Tags';
import {
  checkSyncData,
  clearSentData,
  copySyncData,
  describeSummary,
  exportSyncData,
  parseSyncUrl,
  SYNC_VERSION,
  type SyncDirection,
  type SyncMode,
  type SyncRequest,
  type SyncTarget,
} from '@/sync/sync';
import { colors } from '@/theme';

/** The last PC synced with (its addresses, port and code), to sync again without scanning. */
const LAST_PC_KEY = 'sync.lastPc';
const PING_TIMEOUT_MS = 2500;
const SYNC_TIMEOUT_MS = 120000;

type Step =
  | { kind: 'idle' }
  | { kind: 'scan' }
  | { kind: 'working'; message: string }
  | { kind: 'done'; title: string; lines: string[] }
  | { kind: 'error'; message: string };

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** First address of the PC that answers (it may have several networks). */
async function findPc(t: SyncTarget): Promise<string | null> {
  for (const host of t.hosts) {
    const base = `http://${host}:${t.port}`;
    try {
      const res = await fetchWithTimeout(`${base}/ping?t=${t.token}`, {}, PING_TIMEOUT_MS);
      if (res.ok) return base;
      if (res.status === 403) throw new Error('El código no coincide con el del PC.');
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('El código')) throw e;
    }
  }
  return null;
}

/**
 * "Sincronizar con el PC": scan the QR code that Magic Swipe for PC shows (or type its address and
 * code) and copy or move decks, collection and «La quiero» from the phone to the PC or the other way.
 * Nothing is merged: the destination gets everything from the origin (what matches is replaced by the
 * origin's, the rest stays); Mover deletes it from the origin once the destination has saved it.
 */
export function SyncScreen({ onClose }: { onClose: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { refresh } = useAppState();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [lastPc, setLastPc] = useState<SyncTarget | null>(null);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [direction, setDirection] = useState<SyncDirection>('toPc');
  const [mode, setMode] = useState<SyncMode>('copy');
  // The camera reports the same QR many times per second: run only once.
  const scanned = useRef(false);

  useEffect(() => {
    getSetting(db, LAST_PC_KEY)
      .then((json) => {
        if (!json) return;
        const t = JSON.parse(json) as SyncTarget;
        setLastPc(t);
        setAddress(`${t.hosts[0]}:${t.port}`);
        setCode(t.token);
      })
      .catch(() => {});
  }, [db]);

  const post = async (base: string, token: string, req: SyncRequest) => {
    const res = await fetchWithTimeout(
      `${base}/sync?t=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) },
      SYNC_TIMEOUT_MS,
    );
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error ?? `El PC respondió ${res.status}`);
    return body;
  };

  const run = async (target: SyncTarget) => {
    const moving = mode === 'move';
    try {
      setStep({ kind: 'working', message: 'Buscando el PC en la red…' });
      const base = await findPc(target);
      if (!base) {
        throw new Error(
          'No encuentro el PC. Comprueba que los dos estáis en la misma Wi-Fi y que en el PC está abierta la ventana «Sincronizar con el móvil».',
        );
      }
      let done: { title: string; lines: string[] };
      if (direction === 'toPc') {
        setStep({ kind: 'working', message: 'Enviando tus mazos y tu colección al PC…' });
        const mine = await exportSyncData(db, 'Android');
        const body = await post(base, target.token, { version: SYNC_VERSION, op: 'receive', mode, data: mine });
        const lines = [`En el PC: ${describeSummary(body.summary)}.`];
        if (moving) {
          setStep({ kind: 'working', message: 'Borrando del móvil lo que se ha movido…' });
          await clearSentData(db, mine);
          lines.push('Borrado del móvil.');
        }
        done = { title: moving ? 'Movido al PC' : 'Copiado al PC', lines };
      } else {
        setStep({ kind: 'working', message: 'Recibiendo los mazos y la colección del PC…' });
        const body = await post(base, target.token, { version: SYNC_VERSION, op: 'send', mode });
        checkSyncData(body.data);
        const summary = await copySyncData(db, body.data);
        const lines = [`En el móvil: ${describeSummary(summary)}.`];
        if (moving) {
          setStep({ kind: 'working', message: 'Borrando del PC lo que se ha movido…' });
          await post(base, target.token, { version: SYNC_VERSION, op: 'clear' });
          lines.push('Borrado del PC.');
        }
        done = { title: moving ? 'Movido al móvil' : 'Copiado al móvil', lines };
      }
      await refresh();
      notifyWantedChanged();
      notifyTagsChanged();
      const remembered = { ...target, hosts: [base.slice(7).split(':')[0], ...target.hosts.filter((h) => !base.includes(h))] };
      await setSetting(db, LAST_PC_KEY, JSON.stringify(remembered));
      setLastPc(remembered);
      setStep({ kind: 'done', ...done });
    } catch (e) {
      const message =
        e instanceof Error ? (e.name === 'AbortError' ? 'El PC tardó demasiado en responder.' : e.message) : String(e);
      setStep({ kind: 'error', message });
    }
  };

  /** Mover deletes from the origin: ask first. */
  const confirmThen = (action: () => void) => {
    if (mode === 'copy') return action();
    Alert.alert(
      'Mover',
      direction === 'toPc'
        ? 'Tus mazos, tu colección y «La quiero» pasarán al PC y se borrarán de este móvil. ¿Seguir?'
        : 'Los mazos, la colección y «La quiero» del PC pasarán a este móvil y se borrarán del PC. ¿Seguir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Mover', style: 'destructive', onPress: action },
      ],
    );
  };

  const manual = () => {
    const [host, port] = address.trim().split(':');
    if (!host || !code.trim()) return;
    confirmThen(() => run({ hosts: [host], port: Number(port) || 47823, token: code.trim().toUpperCase() }));
  };

  const scan = () => confirmThen(startScan);
  const startScan = async () => {
    if (!permission?.granted && !(await requestPermission()).granted) {
      setStep({ kind: 'error', message: 'Sin permiso de cámara: escribe la dirección y el código del PC.' });
      return;
    }
    setStep({ kind: 'scan' });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver">
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Sincronizar con el PC</Text>
        </View>
        {step.kind === 'scan' ? (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                const target = parseSyncUrl(data);
                if (!target || scanned.current) return;
                scanned.current = true;
                run(target).finally(() => {
                  scanned.current = false;
                });
              }}
            />
            <View style={styles.scanHint} pointerEvents="none">
              <Text style={styles.scanText}>Apunta al código QR de la ventana «Sincronizar con el móvil» del PC</Text>
            </View>
            <Pressable style={[styles.button, styles.cancelScan]} onPress={() => setStep({ kind: 'idle' })}>
              <Text style={styles.buttonText}>Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.help}>
              En el PC abre Magic Swipe y pulsa «⇄ Móvil» (arriba a la derecha). Con los dos en la misma Wi-Fi, elige qué
              hacer y escanea el código que aparece. En el destino se añade todo lo del origen: lo que ya tenía se queda, y
              los mazos y cartas que coinciden se sustituyen por los del origen.
            </Text>
            <Text style={styles.sectionTitle}>Dirección</Text>
            <Choice
              value={direction}
              onChange={setDirection}
              options={[
                { key: 'toPc', label: 'Móvil → PC' },
                { key: 'toPhone', label: 'PC → Móvil' },
              ]}
            />
            <Text style={styles.sectionTitle}>Qué hacer</Text>
            <Choice
              value={mode}
              onChange={setMode}
              options={[
                { key: 'copy', label: 'Copiar' },
                { key: 'move', label: 'Mover' },
              ]}
            />
            <Text style={styles.help}>
              {mode === 'copy'
                ? 'Copiar: el origen se queda como está.'
                : 'Mover: cuando el destino lo ha guardado, se borra del origen (mazos, colección y «La quiero»).'}
            </Text>
            {step.kind === 'working' ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={styles.value}>{step.message}</Text>
              </View>
            ) : (
              <>
                {step.kind === 'done' && (
                  <View style={[styles.box, { borderColor: colors.add }]}>
                    <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.add} />
                    <Text style={styles.title}>{step.title}</Text>
                    {step.lines.map((l) => (
                      <Text key={l} style={styles.value}>
                        {l}
                      </Text>
                    ))}
                  </View>
                )}
                {step.kind === 'error' && (
                  <View style={[styles.box, { borderColor: colors.discard }]}>
                    <Text style={[styles.value, { color: colors.discard }]}>{step.message}</Text>
                  </View>
                )}
                <Pressable style={[styles.button, styles.primary]} onPress={scan}>
                  <MaterialCommunityIcons name="qrcode-scan" size={20} color={colors.bg} />
                  <Text style={[styles.buttonText, { color: colors.bg }]}>Escanear el código del PC</Text>
                </Pressable>
                {lastPc && (
                  <Pressable style={styles.button} onPress={() => confirmThen(() => run(lastPc))}>
                    <MaterialCommunityIcons name="sync" size={20} color={colors.text} />
                    <Text style={styles.buttonText}>Otra vez con el mismo PC</Text>
                  </Pressable>
                )}
                <Text style={styles.sectionTitle}>O escríbelo a mano</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Dirección: 192.168.1.20:47823"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Código"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.button, (!address.trim() || !code.trim()) && { opacity: 0.4 }]}
                  onPress={manual}
                  disabled={!address.trim() || !code.trim()}
                >
                  <Text style={styles.buttonText}>Sincronizar</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/** Two-option segmented control. */
function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View style={styles.choice}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.choiceOption, value === o.key && styles.choiceOn]}
          onPress={() => onChange(o.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
        >
          <Text style={[styles.buttonText, value === o.key && { color: colors.bg }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  choiceOption: { flex: 1, alignItems: 'center', paddingVertical: 11, backgroundColor: colors.surface },
  choiceOn: { backgroundColor: colors.accent },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  content: { padding: 16, gap: 14 },
  help: { color: colors.textMuted, lineHeight: 20 },
  center: { alignItems: 'center', gap: 14, paddingVertical: 32 },
  value: { color: colors.text },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 8 },
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6, alignItems: 'flex-start' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '800' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scanHint: { position: 'absolute', top: 24, left: 24, right: 24, alignItems: 'center' },
  scanText: {
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  cancelScan: { position: 'absolute', bottom: 40, left: 40, right: 40 },
});
