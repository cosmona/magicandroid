import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { activeFilterCount, type Filters } from '@/api/scryfall';
import { OptionIcon } from '@/components/Select';
import { useAppState } from '@/context/AppState';
import { COLOR_ORDER, KEYWORD_LABELS, MANA_ICONS, RARITY_ICONS, TYPE_LABELS, typeIcon } from '@/icons';
import { colors, formatOption } from '@/theme';

/** App title + "Filtros" and settings buttons, with a one-line summary of the active filters (tap = edit). */
export function TopBar({ onOpenFilters, onOpenSettings }: { onOpenFilters: () => void; onOpenSettings: () => void }) {
  const { filters } = useAppState();
  const count = activeFilterCount(filters);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>Magic Swipe</Text>
        <View style={styles.buttons}>
          <Pressable style={[styles.filterButton, count > 0 && styles.filterButtonActive]} onPress={onOpenFilters}>
            <Text style={[styles.filterText, count > 0 && { color: colors.bg }]}>
              🔍 Filtros{count ? ` · ${count}` : ''}
            </Text>
          </Pressable>
          <Pressable style={styles.settingsButton} onPress={onOpenSettings} hitSlop={6}>
            <Text style={styles.settingsText}>⚙</Text>
          </Pressable>
        </View>
      </View>
      {count > 0 && (
        <Pressable onPress={onOpenFilters}>
          <Summary filters={filters} />
        </Pressable>
      )}
    </View>
  );
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'] as const;

function Summary({ filters: f }: { filters: Filters }) {
  const texts = [
    f.name && `"${f.name}"`,
    f.text && `texto: ${f.text}`,
    f.types.length > 0 && f.types.map((t) => TYPE_LABELS[t] ?? t).join('/'),
    f.legendary && 'legendaria',
    f.subtype,
    (f.cmcMin !== null || f.cmcMax !== null) && `coste ${f.cmcMin ?? 0}–${f.cmcMax ?? '∞'}`,
    f.keywords.length > 0 && f.keywords.map((k) => KEYWORD_LABELS[k] ?? k).join(', '),
    f.format && formatOption(f.format).label,
    f.set && f.set.toUpperCase(),
  ].filter(Boolean);

  return (
    <View style={styles.summary}>
      {COLOR_ORDER.filter((c) => f.colors.includes(c)).map((c) => (
        <Image key={c} source={MANA_ICONS[c]} style={styles.icon} contentFit="contain" />
      ))}
      {f.colorless && <Text style={styles.summaryText}>◇</Text>}
      {RARITY_ORDER.filter((r) => f.rarities.includes(r)).map((r) => (
        <Image key={r} source={RARITY_ICONS[r]} style={styles.icon} contentFit="contain" />
      ))}
      {f.types.slice(0, 3).map((t) => (
        <OptionIcon key={t} icon={typeIcon(t)} tint size={16} />
      ))}
      <Text style={styles.summaryText} numberOfLines={1}>
        {texts.join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.accent, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  filterButton: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  filterButtonActive: { backgroundColor: colors.accent },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsText: { color: colors.text, fontSize: 18 },
  filterText: { color: colors.accent, fontWeight: '800' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { width: 16, height: 16 },
  summaryText: { flex: 1, color: colors.textMuted, fontSize: 12 },
});
