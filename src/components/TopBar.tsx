import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { activeFilterCount, type Filters } from '@/api/scryfall';
import { OptionIcon } from '@/components/Select';
import { useAppState } from '@/context/AppState';
import { COLOR_ORDER, KEYWORD_LABELS, MANA_ICONS, RARITY_ICONS, TYPE_LABELS, typeIcon } from '@/icons';
import { colors, formatOption } from '@/theme';

/** Botón «Filtros» + un resumen de una línea de los filtros activos (tocar = editar), sobre las cartas. */
export function TopBar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const { filters } = useAppState();
  const count = activeFilterCount(filters);

  return (
    <Pressable style={styles.container} onPress={onOpenFilters} accessibilityRole="button">
      <View style={[styles.filterButton, count > 0 && styles.filterButtonActive]}>
        <MaterialCommunityIcons name="filter-variant" size={18} color={count > 0 ? colors.bg : colors.accent} />
        <Text style={[styles.filterText, count > 0 && { color: colors.bg }]}>Filtros{count ? ` · ${count}` : ''}</Text>
      </View>
      {count > 0 ? (
        <Summary filters={filters} />
      ) : (
        <Text style={styles.summaryText} numberOfLines={1}>
          Todas las cartas
        </Text>
      )}
    </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  filterButtonActive: { backgroundColor: colors.accent },
  filterText: { color: colors.accent, fontWeight: '800' },
  summary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { width: 16, height: 16 },
  summaryText: { flex: 1, color: colors.textMuted, fontSize: 12 },
});
