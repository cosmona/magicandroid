import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { DEFAULT_FILTERS, type Color, type Filters, type Rarity, type SortOrder } from '@/api/scryfall';
import { Button, Chip } from '@/components/Button';
import { useAppState } from '@/context/AppState';
import { colors, FORMATS } from '@/theme';

const COLORS: { key: Color; label: string }[] = [
  { key: 'W', label: '☀ Blanco' },
  { key: 'U', label: '💧 Azul' },
  { key: 'B', label: '💀 Negro' },
  { key: 'R', label: '🔥 Rojo' },
  { key: 'G', label: '🌳 Verde' },
];

const RARITIES: { key: Rarity; label: string }[] = [
  { key: 'common', label: 'Común' },
  { key: 'uncommon', label: 'Infrecuente' },
  { key: 'rare', label: 'Rara' },
  { key: 'mythic', label: 'Mítica' },
];

const TYPES: { key: string; label: string }[] = [
  { key: 'creature', label: 'Criatura' },
  { key: 'instant', label: 'Instantáneo' },
  { key: 'sorcery', label: 'Conjuro' },
  { key: 'enchantment', label: 'Encantamiento' },
  { key: 'artifact', label: 'Artefacto' },
  { key: 'planeswalker', label: 'Planeswalker' },
  { key: 'land', label: 'Tierra' },
  { key: 'battle', label: 'Batalla' },
];

const ORDERS: { key: SortOrder; label: string }[] = [
  { key: 'edhrec', label: 'Popularidad' },
  { key: 'name', label: 'Nombre' },
  { key: 'released', label: 'Más recientes' },
  { key: 'cmc', label: 'Coste de maná' },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Edits a local copy of the filters; they're applied (and the card stack reloaded) on "Aplicar". */
export default function FiltersScreen() {
  const { filters, setFilters } = useAppState();
  const [draft, setDraft] = useState<Filters>(filters);
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = () => {
    setFilters(draft);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Nombre">
          <TextInput
            style={styles.input}
            placeholder="Parte del nombre (español o inglés)"
            placeholderTextColor={colors.textMuted}
            value={draft.name}
            onChangeText={(name) => set({ name })}
          />
        </Section>

        <Section title="Texto de reglas">
          <TextInput
            style={styles.input}
            placeholder='p. ej. "flying" o "draw a card"'
            placeholderTextColor={colors.textMuted}
            value={draft.text}
            onChangeText={(text) => set({ text })}
          />
        </Section>

        <Section title="Colores" hint="Cartas jugables en un mazo de estos colores (incluye incoloras).">
          {COLORS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={draft.colors.includes(c.key)}
              onPress={() => set({ colors: toggle(draft.colors, c.key) })}
            />
          ))}
        </Section>

        <Section title="Rareza">
          {RARITIES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              selected={draft.rarities.includes(r.key)}
              onPress={() => set({ rarities: toggle(draft.rarities, r.key) })}
            />
          ))}
        </Section>

        <Section title="Tipo">
          {TYPES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              selected={draft.types.includes(t.key)}
              onPress={() => set({ types: toggle(draft.types, t.key) })}
            />
          ))}
        </Section>

        <Section title="Legal en formato">
          {FORMATS.map((f) => (
            <Chip
              key={f.label}
              label={f.key ? f.label : 'Cualquiera'}
              selected={draft.format === f.key}
              onPress={() => set({ format: f.key })}
            />
          ))}
        </Section>

        <Section title="Orden">
          {ORDERS.map((o) => (
            <Chip key={o.key} label={o.label} selected={draft.order === o.key} onPress={() => set({ order: o.key })} />
          ))}
        </Section>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Solo cartas en español</Text>
            <Text style={styles.hint}>Desactívalo para ver también cartas sin edición en español.</Text>
          </View>
          <Switch
            value={draft.spanish}
            onValueChange={(spanish) => set({ spanish })}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Limpiar" variant="secondary" onPress={() => setDraft(DEFAULT_FILTERS)} style={{ flex: 1 }} />
        <Button label="Aplicar" onPress={apply} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
