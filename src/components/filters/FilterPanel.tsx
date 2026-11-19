import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import {
  DEFAULT_FILTERS,
  getKeywords,
  getSets,
  type ColorMode,
  type Filters,
  type MtgSet,
  type Rarity,
  type SortOrder,
} from '@/api/scryfall';
import { Button, Chip } from '@/components/Button';
import { MultiSelect, OptionIcon, Select, type SelectOption } from '@/components/Select';
import {
  COLOR_ORDER,
  COMMON_KEYWORDS,
  KEYWORD_LABELS,
  MAIN_TYPES,
  MANA_ICONS,
  RARITY_ICONS,
  RARITY_LABELS,
  TYPE_LABELS,
  typeIcon,
} from '@/icons';
import { colors, DECK_ONLY_FORMATS, FORMATS } from '@/theme';
import { rulesQuery } from '@/api/rulesGlossary';
import { useAppState } from '@/context/AppState';
import { useSeen } from '@/hooks/useSeen';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];

const COLOR_MODES: { key: ColorMode; label: string; hint: string }[] = [
  { key: 'identity', label: 'Jugables en', hint: 'Cartas que caben en un mazo de estos colores (incluye incoloras).' },
  { key: 'exact', label: 'Exactamente', hint: 'Cartas de exactamente estos colores.' },
  { key: 'include', label: 'Incluye', hint: 'Cartas que tienen al menos estos colores.' },
];

const ORDERS: { key: SortOrder; label: string }[] = [
  { key: 'edhrec', label: 'Popularidad' },
  { key: 'name', label: 'Nombre' },
  { key: 'cmc', label: 'Coste' },
  { key: 'released', label: 'Fecha' },
  { key: 'usd', label: 'Precio' },
];

const FORMAT_OPTIONS: SelectOption<string>[] = FORMATS.filter((f) => f.key && !DECK_ONLY_FORMATS.includes(f.key)).map((f) => ({
  value: f.key!,
  label: f.label,
  icon: f.icon,
  tint: true,
}));

const keywordLabel = (k: string) => KEYWORD_LABELS[k] ?? k;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface Props {
  applied: Filters;
  onApply: (f: Filters) => void;
}

/**
 * Search form shown in the filters sheet. Edits a draft and applies it with "Buscar",
 * so the card stack isn't reloaded on every tap. Actions sit at the top so they stay
 * visible whatever the sheet height.
 */
export function FilterPanel({ applied, onApply }: Props) {
  const [draft, setDraft] = useState<Filters>(applied);
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Filtros</Text>
        <Button
          label="Limpiar"
          variant="secondary"
          onPress={() => setDraft(DEFAULT_FILTERS)}
          style={styles.headerButton}
        />
        <Button
          label={dirty ? 'Buscar' : 'Buscar de nuevo'}
          onPress={() => onApply(draft)}
          style={styles.headerButton}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <SavedSearches draft={draft} onApply={onApply} />
        <Section title="Nombre">
          <Input
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="Parte del nombre (inglés o español)"
            onSubmit={() => onApply(draft)}
          />
        </Section>

        <Section
          title="Texto de reglas"
          hint="En español o en inglés. Cada palabra por separado, en cualquier orden («cost less» encuentra «costs {1} less»); entre comillas, la frase exacta."
        >
          <Input
            value={draft.text}
            onChangeText={(text) => set({ text })}
            placeholder="Texto de la carta"
            onSubmit={() => onApply(draft)}
          />
          {rulesQuery(draft.text).translated && (
            // Spanish is searched in the English rules text: what is really searched.
            <Text style={{ color: colors.info, fontSize: 13 }}>
              Se busca en inglés: {rulesQuery(draft.text).terms.map((t) => (t.includes(' ') ? `«${t}»` : t)).join(' · ')}
            </Text>
          )}
        </Section>

        <Section title="Colores" hint={COLOR_MODES.find((m) => m.key === draft.colorMode)!.hint}>
          <View style={styles.manaRow}>
            {COLOR_ORDER.map((c) => (
              <IconToggle
                key={c}
                selected={draft.colors.includes(c)}
                onPress={() => set({ colors: toggle(draft.colors, c) })}
              >
                <Image source={MANA_ICONS[c]} style={styles.mana} contentFit="contain" />
              </IconToggle>
            ))}
            <IconToggle selected={draft.colorless} onPress={() => set({ colorless: !draft.colorless })}>
              <View style={[styles.mana, styles.colorless]}>
                <Text style={styles.colorlessText}>◇</Text>
              </View>
            </IconToggle>
          </View>
          <Segmented
            options={COLOR_MODES.map((m) => ({ key: m.key, label: m.label }))}
            value={draft.colorMode}
            onChange={(colorMode) => set({ colorMode })}
          />
        </Section>

        <Section title="Tipo" hint="Varios tipos = cualquiera de ellos.">
          <View style={styles.chips}>
            {MAIN_TYPES.map((t) => (
              <IconChip
                key={t}
                label={TYPE_LABELS[t] ?? t}
                icon={<OptionIcon icon={typeIcon(t)} tint size={16} />}
                selected={draft.types.includes(t)}
                onPress={() => set({ types: toggle(draft.types, t) })}
              />
            ))}
            <Chip label="Legendaria" selected={draft.legendary} onPress={() => set({ legendary: !draft.legendary })} />
          </View>
          <Input
            value={draft.subtype}
            onChangeText={(subtype) => set({ subtype })}
            placeholder="Subtipo en inglés: elf, dragon, equipment…"
            onSubmit={() => onApply(draft)}
          />
        </Section>

        <Section title="Coste de maná">
          <View style={styles.cmcRow}>
            <Stepper label="Mín" value={draft.cmcMin} onChange={(cmcMin) => set({ cmcMin })} max={draft.cmcMax ?? 16} />
            <Stepper label="Máx" value={draft.cmcMax} onChange={(cmcMax) => set({ cmcMax })} min={draft.cmcMin ?? 0} />
          </View>
        </Section>

        <Section title="Rareza">
          <View style={styles.rarityRow}>
            {RARITIES.map((r) => (
              <IconToggle
                key={r}
                selected={draft.rarities.includes(r)}
                onPress={() => set({ rarities: toggle(draft.rarities, r) })}
              >
                <View style={styles.rarityItem}>
                  <Image source={RARITY_ICONS[r]} style={styles.rarityIcon} contentFit="contain" />
                  <Text style={styles.rarityLabel}>{RARITY_LABELS[r]}</Text>
                </View>
              </IconToggle>
            ))}
          </View>
        </Section>

        <Section title="Habilidades" hint="Varias = la carta debe tenerlas todas.">
          <View style={styles.chips}>
            {[...new Set([...COMMON_KEYWORDS, ...draft.keywords])].map((k) => (
              <Chip
                key={k}
                label={keywordLabel(k)}
                selected={draft.keywords.includes(k)}
                onPress={() => set({ keywords: toggle(draft.keywords, k) })}
              />
            ))}
          </View>
          <KeywordPicker values={draft.keywords} onChange={(keywords) => set({ keywords })} />
        </Section>

        <Section title="Formato y edición">
          <Select
            placeholder="Legal en formato"
            value={draft.format}
            options={FORMAT_OPTIONS}
            onChange={(format) => set({ format })}
          />
          <SetPicker value={draft.set} onChange={(s) => set({ set: s })} />
          <View style={styles.chips}>
            <Chip
              label="Solo cartas de MTG Arena"
              selected={draft.arena}
              onPress={() => set({ arena: !draft.arena })}
            />
            <Chip
              label="📦 Solo en mi colección"
              selected={!!draft.onlyCollection}
              onPress={() => set({ onlyCollection: !draft.onlyCollection })}
            />
          </View>
        </Section>

        <Section title="Orden">
          <View style={styles.chips}>
            {ORDERS.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                selected={draft.order === o.key}
                onPress={() => set({ order: o.key })}
              />
            ))}
          </View>
          <Segmented
            options={[
              { key: 'auto', label: 'Auto' },
              { key: 'asc', label: 'Ascendente ↑' },
              { key: 'desc', label: 'Descendente ↓' },
            ]}
            value={draft.dir}
            onChange={(dir) => set({ dir })}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

/** Saved searches (name + filters), kept in Ajustes and synced with the PC. Tap one to search with it. */
function SavedSearches({ draft, onApply }: { draft: Filters; onApply: (f: Filters) => void }) {
  const { prefs, setPrefs } = useAppState();
  const saved = prefs.savedSearches ?? [];
  const { isNew, markSeen } = useSeen();
  const [name, setName] = useState('');
  const same = (f: Filters) => JSON.stringify({ ...DEFAULT_FILTERS, ...f }) === JSON.stringify({ ...DEFAULT_FILTERS, ...draft });
  const save = () => {
    const n = name.trim();
    if (!n) return;
    // A name that already exists is replaced (to update a saved search).
    setPrefs({ ...prefs, savedSearches: [...saved.filter((x) => x.name !== n), { name: n, filters: draft, updatedAt: Date.now() }] });
    setName('');
  };
  const remove = (n: string) => setPrefs({ ...prefs, savedSearches: saved.filter((x) => x.name !== n) });
  return (
    <Section title="Búsquedas guardadas" hint="Guarda estos filtros con un nombre y vuelve a buscar con un toque. Se sincronizan con el PC.">
      {saved.length > 0 && (
        <View style={styles.savedList}>
          {saved.map((sch) => (
            <View key={sch.name} style={[styles.savedChip, same(sch.filters) && { borderColor: colors.accent }]}>
              <Pressable
                style={styles.savedChipMain}
                onPress={() => {
                  markSeen(`search:${sch.name}`, sch.updatedAt);
                  onApply({ ...DEFAULT_FILTERS, ...sch.filters });
                }}
                accessibilityLabel={`Buscar «${sch.name}»`}
              >
                <Text style={styles.savedChipText} numberOfLines={1}>
                  🔖 {sch.name}
                </Text>
                {isNew(`search:${sch.name}`, sch.updatedAt) && <Text style={styles.savedChipNew}>nuevo</Text>}
              </Pressable>
              <Pressable onPress={() => remove(sch.name)} hitSlop={8} accessibilityLabel={`Borrar «${sch.name}»`}>
                <Text style={styles.savedChipX}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.savedSaveRow}>
        <View style={{ flex: 1 }}>
          <Input value={name} onChangeText={setName} placeholder="Nombre de esta búsqueda" onSubmit={save} />
        </View>
        <Button label="Guardar" onPress={save} style={{ opacity: name.trim() ? 1 : 0.5 }} />
      </View>
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function Input(props: { value: string; onChangeText: (v: string) => void; placeholder: string; onSubmit: () => void }) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={props.onSubmit}
        returnKeyType="search"
        autoCorrect={false}
      />
      {!!props.value && (
        <Pressable hitSlop={10} onPress={() => props.onChangeText('')}>
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

function IconToggle({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={[styles.iconToggle, selected ? styles.iconSelected : { opacity: 0.45 }]}>
      {children}
    </Pressable>
  );
}

function IconChip(props: { label: string; icon: ReactNode; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.iconChip, props.selected && styles.iconChipSelected]}>
      {props.icon}
      <Text style={[styles.iconChipText, props.selected && { color: colors.accent }]}>{props.label}</Text>
    </Pressable>
  );
}

function Segmented<T extends string>(props: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {props.options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.segment, props.value === o.key && styles.segmentSelected]}
          onPress={() => props.onChange(o.key)}
        >
          <Text style={[styles.segmentText, props.value === o.key && { color: colors.bg }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Number picker where "—" (null) means no limit. */
function Stepper(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
}) {
  const { value, min = 0, max = 16 } = props;
  const dec = () => props.onChange(value === null ? null : value <= min ? null : value - 1);
  const inc = () => props.onChange(value === null ? min : Math.min(max, value + 1));
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{props.label}</Text>
      <Pressable style={styles.stepButton} onPress={dec} hitSlop={4}>
        <Text style={styles.stepButtonText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value ?? '—'}</Text>
      <Pressable style={styles.stepButton} onPress={inc} hitSlop={4}>
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

/** Full keyword catalog (224) in a searchable multi-select; Spanish label + English detail. */
function KeywordPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [keywords, setKeywords] = useState<string[]>(COMMON_KEYWORDS);
  useEffect(() => {
    getKeywords()
      .then(setKeywords)
      .catch(() => {});
  }, []);
  return (
    <MultiSelect
      placeholder="Más habilidades"
      searchable
      values={values}
      onChange={onChange}
      options={keywords.map((k) => ({
        value: k,
        label: keywordLabel(k),
        detail: KEYWORD_LABELS[k] ? k : undefined,
      }))}
    />
  );
}

function SetPicker({ value, onChange }: { value: string | null; onChange: (code: string | null) => void }) {
  const [sets, setSets] = useState<MtgSet[]>([]);
  useEffect(() => {
    getSets()
      .then(setSets)
      .catch(() => {});
  }, []);
  return (
    <Select
      placeholder="Edición"
      searchable
      value={value}
      onChange={onChange}
      options={sets.map((s) => ({
        value: s.code,
        label: s.name,
        detail: `${s.code.toUpperCase()} · ${s.releasedAt.slice(0, 4)}`,
        icon: s.iconUrl,
        tint: true,
      }))}
    />
  );
}

const styles = StyleSheet.create({
  savedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  savedChipNew: { color: colors.bg, backgroundColor: colors.accent, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  savedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 8, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: '100%' },
  savedChipMain: { flexShrink: 1 },
  savedChipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  savedChipX: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  savedSaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panel: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
  headerButton: { paddingVertical: 9, paddingHorizontal: 14 },
  content: { padding: 12, gap: 18 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: 12,
  },
  input: { flex: 1, color: colors.text, paddingHorizontal: 12, paddingVertical: 9 },
  clear: { color: colors.textMuted, fontSize: 16 },
  manaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mana: { width: 38, height: 38 },
  colorless: {
    borderRadius: 19,
    backgroundColor: '#cbc2b9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorlessText: { fontSize: 22, color: '#2b2b2b', fontWeight: '900' },
  iconToggle: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  iconSelected: { borderColor: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconChipSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  iconChipText: { color: colors.text, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  cmcRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperLabel: { color: colors.textMuted, fontWeight: '700' },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  stepValue: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  rarityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rarityItem: { alignItems: 'center', paddingHorizontal: 4 },
  rarityIcon: { width: 36, height: 30 },
  rarityLabel: { color: colors.text, fontSize: 11 },
});
