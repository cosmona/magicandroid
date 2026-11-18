// Selecting several cards (deck and collection), as on the PC: a long press (or «Seleccionar») starts it,
// a tap marks / unmarks, and a bar at the bottom offers what to do with all of them.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

type Glyph = keyof typeof MaterialCommunityIcons.glyphMap;

export interface BulkAction {
  label: string;
  icon: Glyph;
  onPress: () => void;
  color?: string;
}

export function useSelection<T>(items: T[], keyOf: (item: T) => string) {
  const [selecting, setSelecting] = useState(false);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const chosen = useMemo(() => items.filter((i) => keys.has(keyOf(i))), [items, keys, keyOf]);
  return {
    selecting,
    chosen,
    isSelected: (item: T) => selecting && keys.has(keyOf(item)),
    toggle: (item: T) => {
      setSelecting(true);
      setKeys((prev) => {
        const next = new Set(prev);
        const k = keyOf(item);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
    },
    start: (item?: T) => {
      setSelecting(true);
      setKeys(item ? new Set([keyOf(item)]) : new Set());
    },
    selectAll: () => setKeys(new Set(items.map(keyOf))),
    clear: () => setKeys(new Set()),
    exit: () => {
      setSelecting(false);
      setKeys(new Set());
    },
  };
}
export type Selection<T> = ReturnType<typeof useSelection<T>>;

/** Over a card while selecting: a tap marks / unmarks it; the checkbox in its corner. */
export function SelectOverlay({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[StyleSheet.absoluteFill, styles.overlay, on && styles.overlayOn]} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[styles.check, on && styles.checkOn]}>{on && <MaterialCommunityIcons name="check" size={16} color={colors.bg} />}</View>
    </Pressable>
  );
}

/** The bar at the bottom while selecting: how many, all / none, the actions and close. */
export function SelectionBar<T>({ sel, total, actions, extra }: { sel: Selection<T>; total: number; actions: BulkAction[]; extra?: ReactNode }) {
  const insets = useSafeAreaInsets();
  if (!sel.selecting) return null;
  const n = sel.chosen.length;
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.head}>
        <Text style={styles.count}>
          {n} {n === 1 ? 'seleccionada' : 'seleccionadas'}
        </Text>
        <Pressable style={styles.small} onPress={sel.selectAll}>
          <Text style={styles.smallText}>Todas ({total})</Text>
        </Pressable>
        <Pressable style={styles.small} onPress={sel.clear} disabled={!n}>
          <Text style={styles.smallText}>Ninguna</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={sel.exit} hitSlop={10} accessibilityLabel="Terminar de seleccionar">
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {actions.map((a) => (
          <Pressable key={a.label} style={[styles.action, !n && { opacity: 0.4 }]} onPress={a.onPress} disabled={!n}>
            <MaterialCommunityIcons name={a.icon} size={18} color={a.color ?? colors.text} />
            <Text style={[styles.actionText, a.color ? { color: a.color } : null]}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 5, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.25)' },
  overlayOn: { borderColor: colors.accent, backgroundColor: 'rgba(201,162,39,0.12)' },
  check: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderColor: colors.accent,
    zIndex: 20,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { color: colors.text, fontWeight: '900', fontSize: 15 },
  small: { paddingHorizontal: 10, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  smallText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  actionText: { color: colors.text, fontWeight: '800', fontSize: 13 },
});
