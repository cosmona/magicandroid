import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { LANGUAGE_NAMES, type MtgSet } from '@/api/scryfall';
import { ManaCost } from '@/components/ManaCost';
import {
  activeFilterCount,
  COLOR_LABELS,
  EMPTY_FILTER,
  TYPE_GROUP_LABELS,
  type CollectionFilter,
  type ColorKey,
  type TypeKey,
  type Usage,
} from '@/collection/organize';
import { RARITY_LABELS } from '@/icons';
import { colors } from '@/theme';

const COLORS: ColorKey[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const RARITIES = ['mythic', 'rare', 'uncommon', 'common'];
const USAGES: { key: Usage; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'inDeck', label: 'En algún mazo' },
  { key: 'free', label: 'Libres' },
];

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/**
 * Collection filters, applied live as you touch them (the list behind updates).
 * Sets and languages only offer the ones in the collection.
 */
export function CollectionFilterPanel(props: {
  filter: CollectionFilter;
  onChange: (f: CollectionFilter) => void;
  /** Set codes and languages present in the collection. */
  setCodes: string[];
  langs: string[];
  sets: Record<string, MtgSet>;
  /** Cards shown with the current filter. */
  shown: number;
  /** Offer the price range (Ajustes → Precios). */
  showPrices: boolean;
}) {
  const { filter: f, onChange, setCodes, langs, sets, shown, showPrices } = props;
  const set = (patch: Partial<CollectionFilter>) => onChange({ ...f, ...patch });
  const count = activeFilterCount(f);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Filtrar colección</Text>
        <Pressable
          onPress={() => onChange(EMPTY_FILTER)}
          disabled={!count}
          style={[styles.clear, !count && { opacity: 0.4 }]}
        >
          <Text style={styles.clearText}>Limpiar{count ? ` (${count})` : ''}</Text>
        </Pressable>
      </View>
      <Text style={styles.shown}>{shown} cartas con estos filtros</Text>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Group title="Color" help="Por los símbolos de su coste. Incoloro = sin color (artefactos, tierras…).">
          <View style={styles.chips}>
            {COLORS.map((c) => (
              <Chip key={c} selected={f.colors.includes(c)} onPress={() => set({ colors: toggle(f.colors, c) })}>
                <ManaCost cost={`{${c}}`} size={18} />
                <Text style={[styles.chipText, f.colors.includes(c) && styles.chipTextOn]}>{COLOR_LABELS[c]}</Text>
              </Chip>
            ))}
          </View>
        </Group>

        <Group title="Tipo">
          <View style={styles.chips}>
            {(Object.keys(TYPE_GROUP_LABELS) as TypeKey[]).map((t) => (
              <Chip key={t} selected={f.types.includes(t)} onPress={() => set({ types: toggle(f.types, t) })}>
                <Text style={[styles.chipText, f.types.includes(t) && styles.chipTextOn]}>{TYPE_GROUP_LABELS[t]}</Text>
              </Chip>
            ))}
          </View>
        </Group>

        <Group title="Coste de maná" help="Las tierras cuentan como 0.">
          <Range min={f.costMin} max={f.costMax} onChange={(costMin, costMax) => set({ costMin, costMax })} />
        </Group>

        <Group title="Rareza">
          <View style={styles.chips}>
            {RARITIES.map((r) => (
              <Chip key={r} selected={f.rarities.includes(r)} onPress={() => set({ rarities: toggle(f.rarities, r) })}>
                <Text style={[styles.chipText, f.rarities.includes(r) && styles.chipTextOn]}>{RARITY_LABELS[r]}</Text>
              </Chip>
            ))}
          </View>
        </Group>

        {setCodes.length > 1 && (
          <Group title="Edición">
            <View style={styles.chips}>
              {setCodes.map((code) => (
                <Chip key={code} selected={f.sets.includes(code)} onPress={() => set({ sets: toggle(f.sets, code) })}>
                  <Text style={[styles.chipText, f.sets.includes(code) && styles.chipTextOn]} numberOfLines={1}>
                    {sets[code]?.name ?? code.toUpperCase()}
                  </Text>
                </Chip>
              ))}
            </View>
          </Group>
        )}

        {langs.length > 1 && (
          <Group title="Idioma">
            <View style={styles.chips}>
              {langs.map((l) => (
                <Chip key={l} selected={f.langs.includes(l)} onPress={() => set({ langs: toggle(f.langs, l) })}>
                  <Text style={[styles.chipText, f.langs.includes(l) && styles.chipTextOn]}>
                    {LANGUAGE_NAMES[l] ?? l}
                  </Text>
                </Chip>
              ))}
            </View>
          </Group>
        )}

        {showPrices && (
          <Group
            title="Precio por copia (€)"
            help="Precio de Cardmarket. Con un límite, las cartas sin precio no salen."
          >
            <Range
              min={f.priceMin}
              max={f.priceMax}
              decimals
              onChange={(priceMin, priceMax) => set({ priceMin, priceMax })}
            />
          </Group>
        )}

        <Group title="Uso en mazos" help="Libres = no están en ningún mazo: las que puedes cambiar o vender.">
          <View style={styles.segment}>
            {USAGES.map((u) => (
              <Pressable
                key={u.key}
                style={[styles.segmentOption, f.usage === u.key && styles.segmentOn]}
                onPress={() => set({ usage: u.key })}
              >
                <Text style={[styles.chipText, f.usage === u.key && styles.chipTextOn]}>{u.label}</Text>
              </Pressable>
            ))}
          </View>
        </Group>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle}>Solo repetidas</Text>
            <Text style={styles.help}>Impresiones de las que tienes 2 copias o más.</Text>
          </View>
          <Switch
            value={f.duplicates}
            onValueChange={(duplicates) => set({ duplicates })}
            trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
            thumbColor={colors.text}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Group({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {help && <Text style={styles.help}>{help}</Text>}
      {children}
    </View>
  );
}

function Chip({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {children}
    </Pressable>
  );
}

/** "Mín – Máx" number inputs; empty = no limit. */
function Range(props: {
  min: number | null;
  max: number | null;
  decimals?: boolean;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const { min, max, decimals, onChange } = props;
  // Text as typed ("1," while writing 1,5); the number is parsed on every change.
  const [minText, setMinText] = useState(min === null ? '' : String(min));
  const [maxText, setMaxText] = useState(max === null ? '' : String(max));
  // Reset by "Limpiar".
  if (min === null && minText !== '' && parse(minText) !== null) setMinText('');
  if (max === null && maxText !== '' && parse(maxText) !== null) setMaxText('');

  function parse(text: string): number | null {
    const n = Number(text.replace(',', '.'));
    return text.trim() === '' || Number.isNaN(n) ? null : n;
  }

  return (
    <View style={styles.range}>
      <TextInput
        style={styles.input}
        value={minText}
        onChangeText={(t) => {
          setMinText(t);
          onChange(parse(t), max);
        }}
        placeholder="Mín."
        placeholderTextColor={colors.textMuted}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      />
      <Text style={styles.help}>–</Text>
      <TextInput
        style={styles.input}
        value={maxText}
        onChangeText={(t) => {
          setMaxText(t);
          onChange(min, parse(t));
        }}
        placeholder="Máx."
        placeholderTextColor={colors.textMuted}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  clear: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  clearText: { color: colors.text, fontWeight: '700' },
  shown: { color: colors.accent, fontWeight: '700', paddingHorizontal: 16, marginTop: 2 },
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  group: { gap: 8 },
  groupTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  help: { color: colors.textMuted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700' },
  chipTextOn: { color: colors.bg },
  range: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 15,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  segmentOption: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentOn: { backgroundColor: colors.accent },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
