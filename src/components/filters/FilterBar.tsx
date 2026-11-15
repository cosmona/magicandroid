import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { activeFilterCount, type Filters } from '@/api/scryfall';
import { Collapsible } from '@/components/Collapsible';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { OptionIcon } from '@/components/Select';
import { useAppState } from '@/context/AppState';
import { COLOR_ORDER, MANA_ICONS, RARITY_ICONS, typeIcon } from '@/icons';
import { colors, formatOption } from '@/theme';

/**
 * Port of the web app's Filtros + FilterStatusBar: the panel unfolds above a status bar
 * that summarises the active filters with icons. Tap or drag the bar to open/close.
 */
export function FilterBar() {
  const { filters, setFilters } = useAppState();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      panelPosition="above"
      barStyle={styles.bar}
      bar={
        <>
          <StatusSummary filters={filters} />
          <Text style={styles.title}>
            Filtros{count ? ` (${count})` : ''} {open ? '▲' : '▼'}
          </Text>
        </>
      }
    >
      {/* Remount on apply/clear so the draft starts from the applied filters. */}
      <FilterPanel
        key={JSON.stringify(filters)}
        applied={filters}
        onApply={(f) => {
          setFilters(f);
          setOpen(false);
        }}
      />
    </Collapsible>
  );
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'] as const;

/** Icons/text for the active filters, shown on the bar. */
function StatusSummary({ filters: f }: { filters: Filters }) {
  const texts = [
    f.name && `"${f.name}"`,
    f.text && `texto: ${f.text}`,
    f.subtype && f.subtype,
    (f.cmcMin !== null || f.cmcMax !== null) && `CMC ${f.cmcMin ?? 0}-${f.cmcMax ?? '∞'}`,
    f.keywords.length > 0 && `${f.keywords.length} hab.`,
    f.set && f.set.toUpperCase(),
  ].filter(Boolean);

  return (
    <View style={styles.summary}>
      {COLOR_ORDER.filter((c) => f.colors.includes(c)).map((c) => (
        <Image key={c} source={MANA_ICONS[c]} style={styles.icon} contentFit="contain" />
      ))}
      {f.colorless && <Text style={styles.text}>◇</Text>}
      {RARITY_ORDER.filter((r) => f.rarities.includes(r)).map((r) => (
        <Image key={r} source={RARITY_ICONS[r]} style={styles.icon} contentFit="contain" />
      ))}
      {f.types.map((t) => (
        <OptionIcon key={t} icon={typeIcon(t)} tint size={18} />
      ))}
      {f.format && <OptionIcon icon={formatOption(f.format).icon} tint size={18} />}
      {texts.length > 0 && (
        <Text style={styles.text} numberOfLines={1}>
          {texts.join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.accent, fontWeight: '700' },
  summary: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  icon: { width: 18, height: 18 },
  text: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
});
