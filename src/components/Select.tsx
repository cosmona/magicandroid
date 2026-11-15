import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, type IconSource } from '@/theme';

export interface SelectOption<T> {
  value: T;
  label: string;
  /** Extra text shown dimmed and also matched by the search box (e.g. English name). */
  detail?: string;
  /** Bundled asset or remote URL (e.g. a set's SVG symbol). */
  icon?: IconSource | string;
  /** Tint for black SVG icons. */
  tint?: boolean;
}

export function OptionIcon({ icon, tint, size = 22 }: { icon?: IconSource | string; tint?: boolean; size?: number }) {
  if (!icon) return null;
  return (
    <Image
      source={typeof icon === 'string' ? { uri: icon } : icon}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={tint ? colors.text : undefined}
    />
  );
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

interface ModalProps<T> {
  title: string;
  options: SelectOption<T>[];
  selected: T[];
  multi: boolean;
  searchable?: boolean;
  onToggle: (value: T) => void;
  onClose: () => void;
}

/** Option list in a modal; optional search box and multiple selection with a "Listo" button. */
function OptionsModal<T>({ title, options, selected, multi, searchable, onToggle, onClose }: ModalProps<T>) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(`${o.label} ${o.detail ?? ''}`).includes(q));
  }, [options, query]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>{title}</Text>
            {multi && (
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.done}>Listo{selected.length ? ` (${selected.length})` : ''}</Text>
              </Pressable>
            )}
          </View>
          {searchable && (
            <TextInput
              style={styles.search}
              placeholder="Buscar..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          )}
          <FlatList
            data={visible}
            keyExtractor={(o) => String(o.value)}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            ListEmptyComponent={<Text style={styles.noResults}>Sin resultados</Text>}
            renderItem={({ item }) => {
              const isSelected = selected.includes(item.value);
              return (
                <Pressable
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => {
                    onToggle(item.value);
                    if (!multi) onClose();
                  }}
                >
                  <OptionIcon icon={item.icon} tint={item.tint} size={24} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionText}>{item.label}</Text>
                    {!!item.detail && <Text style={styles.optionDetail}>{item.detail}</Text>}
                  </View>
                  {multi && <Text style={styles.check}>{isSelected ? '☑' : '☐'}</Text>}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SelectProps<T> {
  placeholder: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T | null) => void;
  searchable?: boolean;
}

/** Single-choice dropdown with a ✕ to clear. */
export function Select<T>({ placeholder, value, options, onChange, searchable }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        {selected && <OptionIcon icon={selected.icon} tint={selected.tint} />}
        <Text style={[styles.fieldText, !selected && { color: colors.textMuted }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        {selected ? (
          <Pressable hitSlop={10} onPress={() => onChange(null)}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : (
          <Text style={styles.caret}>▾</Text>
        )}
      </Pressable>
      {open && (
        <OptionsModal
          title={placeholder}
          options={options}
          selected={value === null ? [] : [value]}
          multi={false}
          searchable={searchable}
          onToggle={(v) => onChange(v)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface MultiSelectProps<T> {
  placeholder: string;
  values: T[];
  options: SelectOption<T>[];
  onChange: (values: T[]) => void;
  searchable?: boolean;
}

/** Button that opens a multiple-choice list; shows how many are selected. */
export function MultiSelect<T>({ placeholder, values, options, onChange, searchable }: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !values.length && { color: colors.textMuted }]} numberOfLines={1}>
          {values.length ? `${placeholder}: ${values.length}` : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      {open && (
        <OptionsModal
          title={placeholder}
          options={options}
          selected={values}
          multi
          searchable={searchable}
          onToggle={toggle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldText: { flex: 1, color: colors.text },
  caret: { color: colors.textMuted },
  clear: { color: colors.textMuted, fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    maxHeight: '85%',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { color: colors.textMuted, fontWeight: '700' },
  done: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  search: {
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noResults: { color: colors.textMuted, textAlign: 'center', padding: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  optionSelected: { backgroundColor: colors.surfaceAlt },
  optionText: { color: colors.text, fontSize: 16 },
  optionDetail: { color: colors.textMuted, fontSize: 12 },
  check: { color: colors.accent, fontSize: 20 },
});
