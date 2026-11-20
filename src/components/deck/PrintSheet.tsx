import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { sheetCount, type PrintCard, type SheetOptions } from '@/print/cardSheet';
import { printCardSheet } from '@/print/printSheet';
import { colors } from '@/theme';

/**
 * «Imprimir (PDF)» de un mazo o sus fichas (como en el PC): las cartas a tamaño real (9 por página A4, para
 * recortar) o pequeñas tipo hoja de contactos (16 por página, con nombres); cada copia o una de cada (fichas:
 * cuántas de cada), ambas caras y líneas de corte. El PDF abre el menú de compartir (guardar, enviar o imprimir).
 */
export function PrintSheet({
  title,
  cards,
  onClose,
  tokens = false,
  side = [],
  maybe = [],
}: {
  title: string;
  cards: PrintCard[];
  onClose: () => void;
  tokens?: boolean;
  /** El Banquillo y los Posibles del mazo (se imprimen solo si se eligen). */
  side?: PrintCard[];
  maybe?: PrintCard[];
}) {
  const [o, setO] = useState<SheetOptions>({ title, allCopies: !tokens, backs: true, size: 'real', cutLines: true, names: true });
  const [each, setEach] = useState(3);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noBasics, setNoBasics] = useState(false);
  const [withSide, setWithSide] = useState(false);
  const [withMaybe, setWithMaybe] = useState(false);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  // Cada carta que se puede imprimir, con su zona.
  const entries = [
    ...cards.map((c, i) => ({ key: `main:${i}`, zone: '', c })),
    ...(withSide ? side.map((c, i) => ({ key: `side:${i}`, zone: 'Banquillo', c })) : []),
    ...(withMaybe ? maybe.map((c, i) => ({ key: `maybe:${i}`, zone: 'Posibles', c })) : []),
  ];
  const isOff = (e: (typeof entries)[number]) => skip.has(e.key) || (noBasics && !!e.c.basic);
  const chosen = entries.filter((e) => !isOff(e)).map((e) => e.c);
  const list = tokens ? chosen.map((c) => ({ ...c, copies: each })) : chosen;
  const toggleCard = (k: string) =>
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const opts = tokens ? { ...o, allCopies: true } : o;
  const count = sheetCount(list, opts);
  const pages = Math.ceil(count / 9);
  const run = async () => {
    setError(null);
    setProgress('Preparando las imágenes…');
    try {
      await printCardSheet(list, opts, (d, t) => setProgress(`Descargando imágenes ${d} / ${t}…`));
      onClose();
    } catch {
      setError('No se pudo crear el PDF. Comprueba la conexión e inténtalo otra vez.');
    } finally {
      setProgress(null);
    }
  };
  const toggle = (label: string, hint: string, value: boolean, set: (v: boolean) => void) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={set} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </View>
  );
  const chip = (label: string, on: boolean, press: () => void) => (
    <Pressable key={label} style={[styles.chip, on && styles.chipOn]} onPress={press}>
      <Text style={[styles.chipText, on && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="printer" size={22} color={colors.accent} />
              <Text style={styles.title} numberOfLines={1}>
                Imprimir · {title}
              </Text>
            </View>
            <Text style={styles.hint}>Hojas A4 con las cartas a tamaño real (63 × 88 mm, 9 por hoja) para imprimirlas y recortarlas.</Text>
            {tokens ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Copias de cada ficha</Text>
                <View style={styles.chips}>{[1, 2, 3, 4, 6, 9].map((n) => chip(String(n), each === n, () => setEach(n)))}</View>
              </View>
            ) : (
              toggle('Todas las copias', 'Si no, una de cada carta.', o.allCopies, (allCopies) => setO({ ...o, allCopies }))
            )}
            {side.length > 0 && toggle('Incluir el banquillo', `${side.reduce((n, c) => n + c.copies, 0)} cartas, después del mazo.`, withSide, setWithSide)}
            {maybe.length > 0 && toggle('Incluir Posibles', `${maybe.reduce((n, c) => n + c.copies, 0)} cartas, al final.`, withMaybe, setWithMaybe)}
            {entries.some((e) => e.c.basic) && toggle('Quitar las tierras básicas', 'Las básicas no se imprimen.', noBasics, setNoBasics)}
            <Pressable style={styles.row} onPress={() => setChoosing((v) => !v)}>
              <MaterialCommunityIcons name={choosing ? 'chevron-down' : 'chevron-right'} size={20} color={colors.text} />
              <Text style={styles.label}>
                Elegir qué cartas ({chosen.length} de {entries.length})
              </Text>
            </Pressable>
            {choosing && (
              <View style={styles.pick}>
                <View style={styles.chips}>
                  {chip('Todas', false, () => setSkip(new Set()))}
                  {chip('Ninguna', false, () => setSkip(new Set(entries.map((e) => e.key))))}
                </View>
                {entries.map((e) => {
                  const off = isOff(e);
                  return (
                    <Pressable key={e.key} style={[styles.pickRow, off && { opacity: 0.45 }]} onPress={() => !(noBasics && e.c.basic) && toggleCard(e.key)}>
                      <MaterialCommunityIcons name={off ? 'checkbox-blank-outline' : 'checkbox-marked'} size={20} color={off ? colors.textMuted : colors.accent} />
                      {!tokens && <Text style={styles.pickQty}>{e.c.copies}</Text>}
                      <Text style={[styles.label, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                        {e.c.name}
                      </Text>
                      {!!e.zone && <Text style={styles.hint}>{e.zone}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {entries.some((e) => e.c.back) && toggle('Las dos caras', 'Las cartas de dos caras, con su reverso al lado.', o.backs, (backs) => setO({ ...o, backs }))}
            {toggle('Líneas de corte', 'Sin separación, con una línea fina para recortar.', o.cutLines, (cutLines) => setO({ ...o, cutLines }))}
            <View style={styles.summary}>
              <Text style={{ fontSize: 24 }}>🖨️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {count} {count === 1 ? 'carta' : 'cartas'} · {pages} {pages === 1 ? 'página' : 'páginas'} A4
                </Text>
                <Text style={styles.hint}>Imprime al 100 % (sin «ajustar a la página») para que salgan a tamaño real.</Text>
              </View>
            </View>
            {error && <Text style={{ color: colors.discard }}>{error}</Text>}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={styles.button} onPress={onClose} disabled={!!progress}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.primary]} onPress={run} disabled={!!progress || !count}>
                {progress ? <ActivityIndicator color={colors.bg} /> : <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.bg} />}
                <Text style={[styles.buttonText, { color: colors.bg }]}>{progress ? 'Creando…' : 'Crear PDF'}</Text>
              </Pressable>
            </View>
            {progress && <Text style={styles.hint}>{progress}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  box: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, maxHeight: '90%' },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  label: { color: colors.text, fontWeight: '800', fontSize: 14 },
  hint: { color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '800' },
  pick: { gap: 2, padding: 8, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  pickQty: { color: colors.accent, fontWeight: '900', minWidth: 20, textAlign: 'right' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  button: { flex: 1, flexDirection: 'row', gap: 6, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '900', fontSize: 15 },
});
