import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { getCardsByIds, getCardsByNames, type Card } from '@/api/scryfall';
import type { CardRef } from '@/components/LanguagePicker';
import { addToCollection, getOwnedCounts } from '@/db/database';
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

/** The pill above the swiped card in Construir (adds the printing on screen). */
export function OwnButton({ card, onAdded }: { card: Card; onAdded: (msg: string) => void }) {
  return <OwnPill card={card} onAdded={(total) => onAdded(`📦 Añadida a tu colección (tienes ${total})`)} />;
}

const styles = StyleSheet.create({
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
