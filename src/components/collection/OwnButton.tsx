import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, getCardsByIds, getCardsByNames, type Card } from '@/api/scryfall';
import type { CardRef } from '@/components/LanguagePicker';
import { addToCollection, getOwnedCounts, getPrintingCount, removeOneFromCollection } from '@/db/database';
import { colors } from '@/theme';

async function resolve(ref: CardRef): Promise<Card | null> {
  if (typeof ref === 'string') return (await getCardsByIds([ref]))[0] ?? null;
  if ('id' in ref) return ref;
  return (await getCardsByNames([ref.name]))[0] ?? null;
}

/**
 * "La tengo" pill for any card view: shows how many copies (any printing) you own and adds
 * one copy of this printing to the collection on each tap. `card` can be the printing, its
 * Scryfall id or its English name; `oracleId`, when known, avoids looking the card up just to count.
 */
export function OwnPill({
  card,
  oracleId,
  onAdded,
}: {
  card: CardRef;
  oracleId?: string;
  /** After adding: the new total of copies. */
  onAdded?: (total: number) => void;
}) {
  const db = useSQLiteContext();
  const refKey = typeof card === 'string' ? card : 'id' in card ? card.id : `name:${card.name}`;
  const knownOracle = oracleId ?? (typeof card !== 'string' && 'id' in card ? card.oracleId : undefined);
  const [owned, setOwned] = useState<{ key: string; oracleId: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = knownOracle ?? (await resolve(card))?.oracleId;
      if (!id) return;
      const counts = await getOwnedCounts(db, [id]);
      if (!cancelled) setOwned({ key: refKey, oracleId: id, count: counts[id] ?? 0 });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // Keyed by identity: callers may pass a fresh `{ name }` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, refKey, knownOracle]);

  const count = owned?.key === refKey ? owned.count : 0;

  const add = async () => {
    setBusy(true);
    try {
      const printing = await resolve(card);
      if (!printing) return;
      await addToCollection(db, printing);
      const counts = await getOwnedCounts(db, [printing.oracleId]);
      const total = counts[printing.oracleId] ?? 1;
      setOwned({ key: refKey, oracleId: printing.oracleId, count: total });
      onAdded?.(total);
    } catch {
      // Stays as it was; the user can tap again.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={[styles.pill, count > 0 && styles.pillOwned, busy && { opacity: 0.6 }]}
      onPress={add}
      disabled={busy}
      hitSlop={6}
      accessibilityLabel={
        count > 0 ? `Tienes ${count} en tu colección. Añadir otra` : 'La tengo: añadir a tu colección'
      }
    >
      <MaterialCommunityIcons
        name={count > 0 ? 'package-variant-closed-check' : 'package-variant-closed'}
        size={16}
        color={count > 0 ? colors.bg : colors.text}
      />
      <Text style={[styles.text, count > 0 && { color: colors.bg }]}>
        {count > 0 ? `Tienes ${count} · +1` : 'La tengo'}
      </Text>
    </Pressable>
  );
}

/**
 * Round "La tengo" button of the swipe view (next to the history): its badge says how many
 * copies you own; tapping it opens a small panel to add (+) or remove (−) copies of the card
 * on screen and to jump to it in the collection.
 */
export function OwnRoundButton({ card, size = 44 }: { card: Card; size?: number }) {
  const db = useSQLiteContext();
  const [counts, setCounts] = useState<{ id: string; total: number; printing: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([getOwnedCounts(db, [card.oracleId]), getPrintingCount(db, card.id)]).then(([all, printing]) => ({
      id: card.id,
      total: all[card.oracleId] ?? 0,
      printing,
    }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOwnedCounts(db, [card.oracleId]), getPrintingCount(db, card.id)])
      .then(([all, printing]) => {
        if (!cancelled) setCounts({ id: card.id, total: all[card.oracleId] ?? 0, printing });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, card.id, card.oracleId]);

  const total = counts?.id === card.id ? counts.total : 0;
  const printing = counts?.id === card.id ? counts.printing : 0;

  const change = async (delta: 1 | -1) => {
    setBusy(true);
    try {
      if (delta > 0) await addToCollection(db, card);
      else await removeOneFromCollection(db, card.oracleId, card.id);
      setCounts(await load());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.round,
          { width: size, height: size, borderColor: total > 0 ? colors.add : colors.border },
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => setOpen(true)}
        accessibilityLabel={total > 0 ? `La tengo: tienes ${total}` : 'La tengo'}
      >
        <MaterialCommunityIcons
          name={total > 0 ? 'package-variant-closed-check' : 'package-variant-closed'}
          size={22}
          color={total > 0 ? colors.add : colors.text}
        />
        {total > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{total}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={() => {}}>
            <Text style={styles.panelTitle} numberOfLines={1}>
              {displayName(card)}
            </Text>
            <Text style={styles.panelHelp}>
              En tu colección: {total} {total === 1 ? 'copia' : 'copias'}
              {total > 0 ? ` (${printing} de esta edición e idioma)` : ''}
            </Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepButton, (busy || total === 0) && { opacity: 0.35 }]}
                onPress={() => change(-1)}
                disabled={busy || total === 0}
                accessibilityLabel="Quitar una de tu colección"
              >
                <MaterialCommunityIcons name="minus" size={26} color={colors.discard} />
              </Pressable>
              <Text style={styles.stepValue}>{total}</Text>
              <Pressable
                style={[styles.stepButton, busy && { opacity: 0.35 }]}
                onPress={() => change(1)}
                disabled={busy}
                accessibilityLabel="Añadir una a tu colección"
              >
                <MaterialCommunityIcons name="plus" size={26} color={colors.add} />
              </Pressable>
            </View>
            <Text style={styles.panelHelp}>
              ＋ añade esta edición e idioma. − quita una de esta edición (o, si no la tienes, la última que añadiste de
              esta carta).
            </Text>
            <Pressable
              style={styles.galleryButton}
              onPress={() => {
                setOpen(false);
                router.navigate({ pathname: '/collection', params: { q: displayName(card), t: String(Date.now()) } });
              }}
            >
              <MaterialCommunityIcons name="bookshelf" size={20} color={colors.bg} />
              <Text style={styles.galleryText}>Ver en mi colección</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  round: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.add,
  },
  badgeText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  panel: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  panelHelp: { color: colors.textMuted, fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stepValue: { color: colors.text, fontSize: 32, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  galleryText: { color: colors.bg, fontWeight: '900' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOwned: { backgroundColor: colors.add, borderColor: colors.add },
  text: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
