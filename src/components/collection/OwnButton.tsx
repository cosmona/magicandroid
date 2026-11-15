import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { Card } from '@/api/scryfall';
import { addToCollection, getOwnedCounts } from '@/db/database';
import { colors } from '@/theme';

/**
 * "📦 La tengo" pill above the swiped card: adds the printing on screen to the collection
 * without moving to the next card, and shows how many copies (any printing) you own.
 */
export function OwnButton({ card, onAdded }: { card: Card; onAdded: (msg: string) => void }) {
  const db = useSQLiteContext();
  const [owned, setOwned] = useState<{ oracleId: string; count: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOwnedCounts(db, [card.oracleId]).then((counts) => {
      if (!cancelled) setOwned({ oracleId: card.oracleId, count: counts[card.oracleId] ?? 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [db, card.oracleId]);

  const count = owned?.oracleId === card.oracleId ? owned.count : 0;

  const add = async () => {
    await addToCollection(db, card);
    const counts = await getOwnedCounts(db, [card.oracleId]);
    const total = counts[card.oracleId] ?? 1;
    setOwned({ oracleId: card.oracleId, count: total });
    onAdded(`📦 Añadida a tu colección (tienes ${total})`);
  };

  return (
    <Pressable style={[styles.pill, count > 0 && styles.pillOwned]} onPress={add} hitSlop={6}>
      <Text style={[styles.text, count > 0 && { color: colors.bg }]}>
        📦 {count > 0 ? `Tienes ${count} · +1` : 'La tengo'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
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
