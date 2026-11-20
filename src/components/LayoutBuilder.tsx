// Ajustes → Cartas y listas: qué muestran las listas y las galerías del mazo y la colección
// (como el constructor del PC). Listas: líneas de datos, toca un dato para moverlo o quitarlo, «＋» para añadir.
// Galerías: una carta de muestra con su rejilla 3 × 4; toca una celda y elige los iconos que van ahí.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppState } from '@/context/AppState';
import {
  CELLS,
  DEFAULT_GALLERY,
  DEFAULT_LIST,
  FIELD_BY_KEY,
  fieldsOf,
  galleryFor,
  GRID_COLS,
  GRID_ROWS,
  ICON_BY_KEY,
  iconsOf,
  LAYOUT_PLACES,
  listFor,
  MAX_LINES,
  RowLines,
  TileIcons,
  type CardInfo,
  type GalleryLayout,
  type LayoutPlace,
  type ListLayout,
} from '@/listLayout';
import { colors } from '@/theme';

const SAMPLE_IMAGE = 'https://cards.scryfall.io/normal/front/f/f/ff8d4998-f70c-410e-9fb9-f4a61c8cfb13.jpg';
/** Una carta con todos los datos, para las vistas previas. */
const SAMPLE: CardInfo = {
  name: 'Elvish Archdruid',
  printedName: 'Archidruida élfico',
  manaCost: '{1}{G}{G}',
  typeLine: 'Criatura — Druida elfo',
  oracleText: 'Las otras criaturas Elfo que controlas obtienen +1/+1. {T}: Agrega {G} por cada Elfo que controles.',
  set: 'm10',
  lang: 'es',
  rarity: 'rare',
  price: 0.9,
  stats: '2/2',
  legalities: { commander: 'legal' },
  deckFormat: 'commander',
  tags: [{ uid: 's', name: 'Rampa', color: '#2e9e5b', icon: 'mdiSprout', createdAt: 0 } as never],
  quantity: 1,
  owned: 1,
  wanted: true,
  maybe: 1,
  issues: ['Ejemplo'],
  decks: [{ name: 'Elfos', quantity: 1 }],
  free: 1,
};

export function LayoutBuilder({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { prefs, setPrefs } = useAppState();
  const [place, setPlace] = useState<LayoutPlace>('deck');
  const [mode, setMode] = useState<'list' | 'gallery'>('list');
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Text style={s.title}>Cartas y listas</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <MaterialCommunityIcons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={s.switches}>
          <Segment options={LAYOUT_PLACES} value={place} onChange={setPlace} />
          <Segment
            options={[
              { key: 'list', label: 'Lista' },
              { key: 'gallery', label: 'Galería' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <ScrollView contentContainerStyle={s.body}>
          {mode === 'list' ? (
            <ListEditor
              place={place}
              layout={listFor(prefs, place)}
              onChange={(l) => setPrefs({ ...prefs, listLayout: { ...prefs.listLayout, [place]: l } })}
              onReset={() => setPrefs({ ...prefs, listLayout: { ...prefs.listLayout, [place]: DEFAULT_LIST[place] } })}
            />
          ) : (
            <GalleryEditor
              place={place}
              layout={galleryFor(prefs, place)}
              onChange={(g) => setPrefs({ ...prefs, galleryLayout: { ...prefs.galleryLayout, [place]: g } })}
              onReset={() => setPrefs({ ...prefs, galleryLayout: { ...prefs.galleryLayout, [place]: DEFAULT_GALLERY[place] } })}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Segment<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.key} style={[s.segOption, value === o.key && s.segOn]} onPress={() => onChange(o.key)}>
          <Text style={[s.segText, value === o.key && { color: colors.bg }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------- Listas ----------------

function ListEditor({ place, layout, onChange, onReset }: { place: LayoutPlace; layout: ListLayout; onChange: (l: ListLayout) => void; onReset: () => void }) {
  const [picked, setPicked] = useState<{ line: number; index: number } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const used = new Set(layout.flat());
  const free = fieldsOf(place).filter((f) => !used.has(f.key));
  const copy = () => layout.map((l) => [...l]);

  const move = (dLine: number, dIndex: number) => {
    if (!picked) return;
    const next = copy();
    const [key] = next[picked.line].splice(picked.index, 1);
    const line = Math.max(0, Math.min(next.length - 1, picked.line + dLine));
    const index = dLine ? next[line].length : Math.max(0, Math.min(next[line].length, picked.index + dIndex));
    next[line].splice(index, 0, key);
    onChange(next);
    setPicked({ line, index });
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.hint}>Así se ve cada carta en la vista lista. Toca un dato para moverlo o quitarlo; «＋» añade otro a esa línea.</Text>
      <View style={s.preview}>
        <Image source={{ uri: SAMPLE_IMAGE }} style={s.previewThumb} contentFit="cover" />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.previewName}>{SAMPLE.printedName}</Text>
          <RowLines layout={layout} info={SAMPLE} />
        </View>
      </View>

      {layout.map((line, li) => (
        <View key={li} style={s.lineBox}>
          <Text style={s.lineLabel}>Línea {li + 1}</Text>
          <View style={s.chips}>
            {line.map((k, i) => {
              const on = picked?.line === li && picked.index === i;
              return (
                <Pressable key={k} style={[s.chip, on && s.chipOn]} onPress={() => setPicked(on ? null : { line: li, index: i })}>
                  <Text style={[s.chipText, on && { color: colors.bg }]}>{FIELD_BY_KEY.get(k)?.label ?? k}</Text>
                </Pressable>
              );
            })}
            {free.length > 0 && (
              <Pressable style={[s.chip, s.addChip]} onPress={() => setAdding(li)} accessibilityLabel={`Añadir un dato a la línea ${li + 1}`}>
                <MaterialCommunityIcons name="plus" size={16} color={colors.accent} />
              </Pressable>
            )}
          </View>
          {picked?.line === li && (
            <View style={s.tools}>
              <Tool icon="chevron-left" label="Antes" onPress={() => move(0, -1)} />
              <Tool icon="chevron-right" label="Después" onPress={() => move(0, 1)} />
              <Tool icon="arrow-up" label="Subir" onPress={() => move(-1, 0)} disabled={li === 0} />
              <Tool icon="arrow-down" label="Bajar" onPress={() => move(1, 0)} disabled={li === layout.length - 1} />
              <Tool
                icon="close"
                label="Quitar"
                danger
                onPress={() => {
                  const next = copy();
                  next[li].splice(picked.index, 1);
                  onChange(next);
                  setPicked(null);
                }}
              />
            </View>
          )}
        </View>
      ))}

      <View style={s.linesRow}>
        <Text style={s.lineLabel}>Líneas</Text>
        <Pressable
          style={s.round}
          disabled={layout.length <= 1}
          onPress={() => {
            // Los datos de la última línea pasan a la anterior.
            const next = copy();
            const last = next.pop()!;
            next[next.length - 1].push(...last);
            onChange(next);
            setPicked(null);
          }}
        >
          <MaterialCommunityIcons name="minus" size={18} color={layout.length <= 1 ? colors.border : colors.text} />
        </Pressable>
        <Text style={s.count}>{layout.length}</Text>
        <Pressable style={s.round} disabled={layout.length >= MAX_LINES} onPress={() => onChange([...copy(), []])}>
          <MaterialCommunityIcons name="plus" size={18} color={layout.length >= MAX_LINES ? colors.border : colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={s.reset} onPress={onReset}>
          <Text style={s.resetText}>Restablecer</Text>
        </Pressable>
      </View>

      <Modal visible={adding !== null} transparent animationType="fade" onRequestClose={() => setAdding(null)}>
        <Pressable style={s.backdrop} onPress={() => setAdding(null)}>
          <Pressable style={s.menu} onPress={() => {}}>
            <Text style={s.menuTitle}>Añadir a la línea {(adding ?? 0) + 1}</Text>
            <ScrollView>
              {free.map((f) => (
                <Pressable
                  key={f.key}
                  style={s.menuOption}
                  onPress={() => {
                    const next = copy();
                    next[adding!].push(f.key);
                    onChange(next);
                    setAdding(null);
                  }}
                >
                  <Text style={s.menuText}>{f.label}</Text>
                  <Text style={s.hint}>{f.hint}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Tool({ icon, label, onPress, disabled, danger }: { icon: 'chevron-left' | 'chevron-right' | 'arrow-up' | 'arrow-down' | 'close'; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const color = disabled ? colors.border : danger ? colors.discard : colors.text;
  return (
    <Pressable style={s.tool} onPress={onPress} disabled={disabled}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={[s.toolText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------- Galerías ----------------

function GalleryEditor({ place, layout, onChange, onReset }: { place: LayoutPlace; layout: GalleryLayout; onChange: (g: GalleryLayout) => void; onReset: () => void }) {
  const [cellIndex, setCellIndex] = useState<number | null>(null);
  const where = (key: string) => layout.findIndex((c) => c.includes(key));
  const toggle = (key: string) => {
    if (cellIndex === null) return;
    const next = layout.map((c) => c.filter((k) => k !== key));
    // Ya está en esta celda: se quita; si no, se mueve aquí (un icono está en un solo sitio).
    if (!layout[cellIndex].includes(key)) next[cellIndex] = [...next[cellIndex], key];
    onChange(next);
  };
  const cellName = (i: number) => `${['arriba', 'medio alto', 'medio bajo', 'abajo'][Math.floor(i / GRID_COLS)]} · ${['izquierda', 'centro', 'derecha'][i % GRID_COLS]}`;
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.hint}>Toca una casilla de la carta y elige qué iconos van en ella.</Text>
      <View style={s.galleryCard}>
        <Image source={{ uri: SAMPLE_IMAGE }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <TileIcons layout={layout} info={SAMPLE} />
        <View style={StyleSheet.absoluteFill}>
          {Array.from({ length: GRID_ROWS }, (_, r) => (
            <View key={r} style={{ flex: 1, flexDirection: 'row' }}>
              {Array.from({ length: GRID_COLS }, (_, c) => {
                const i = r * GRID_COLS + c;
                return <Pressable key={c} style={[s.cell, cellIndex === i && s.cellOn]} onPress={() => setCellIndex(cellIndex === i ? null : i)} />;
              })}
            </View>
          ))}
        </View>
      </View>
      {cellIndex !== null ? (
        <View style={{ gap: 6 }}>
          <Text style={s.lineLabel}>Casilla: {cellName(cellIndex)}</Text>
          {iconsOf(place).map((icon) => {
            const at = where(icon.key);
            const here = at === cellIndex;
            return (
              <Pressable key={icon.key} style={[s.iconOption, here && s.iconOptionOn]} onPress={() => toggle(icon.key)}>
                <MaterialCommunityIcons name={here ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={here ? colors.accent : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.menuText}>{icon.label}</Text>
                  <Text style={s.hint}>{at >= 0 && !here ? `Ahora en: ${cellName(at)}` : icon.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          {Array.from({ length: CELLS }, (_, i) => i)
            .filter((i) => layout[i].length)
            .map((i) => (
              <Text key={i} style={s.hint}>
                {cellName(i)}: {layout[i].map((k) => ICON_BY_KEY.get(k)?.label ?? k).join(', ')}
              </Text>
            ))}
        </View>
      )}
      <Pressable style={[s.reset, { alignSelf: 'flex-end' }]} onPress={onReset}>
        <Text style={s.resetText}>Restablecer</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  switches: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  segment: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  segOption: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  segOn: { backgroundColor: colors.accent },
  segText: { color: colors.text, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 40 },
  hint: { color: colors.textMuted, fontSize: 12.5 },
  preview: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewThumb: { width: 62, height: 86, borderRadius: 5 },
  previewName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  lineBox: { gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  lineLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  addChip: { borderStyle: 'dashed', borderColor: colors.accent, width: 40, alignItems: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  toolText: { fontSize: 12.5, fontWeight: '700' },
  linesRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  count: { color: colors.text, fontWeight: '900', fontSize: 16, minWidth: 18, textAlign: 'center' },
  reset: { paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  resetText: { color: colors.textMuted, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  menu: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, maxHeight: '80%', borderWidth: 1, borderColor: colors.border },
  menuTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  menuOption: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  galleryCard: { alignSelf: 'center', width: 220, height: 220 * (680 / 488), borderRadius: 12, overflow: 'hidden' },
  cell: { flex: 1, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' },
  cellOn: { borderWidth: 2, borderColor: colors.accent, backgroundColor: 'rgba(212,175,55,0.18)' },
  iconOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  iconOptionOn: { borderColor: colors.accent },
});
