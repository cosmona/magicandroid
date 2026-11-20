import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, getCardsByIds, getCardsByNames, type Card } from '@/api/scryfall';
import type { CardRef } from '@/components/LanguagePicker';
import { addToCollection, getOwnedCounts, getPrintingCount, removeOneFromCollection } from '@/db/database';
import { setWanted, useWantedIds, useWantedPrintings } from '@/hooks/useWanted';
import { colors } from '@/theme';

async function resolve(ref: CardRef): Promise<Card | null> {
  if (typeof ref === 'string') return (await getCardsByIds([ref]))[0] ?? null;
  if ('id' in ref) return ref;
  return (await getCardsByNames([ref.name]))[0] ?? null;
}

/**
 * Pill «La tengo» para cualquier vista de carta: muestra cuántas copias (de cualquier impresión) tienes;
 * tocarla añade una copia de esta impresión, y en cuanto tienes alguna un «−» a su izquierda quita una. `card`
 * puede ser la impresión, su id de Scryfall o su nombre inglés; `oracleId`, cuando se conoce, evita buscar la
 * carta solo para contar.
 */
export function OwnPill({
  card,
  oracleId,
  onAdded,
}: {
  card: CardRef;
  oracleId?: string;
  /** Tras añadir o quitar: el nuevo total de copias. */
  onAdded?: (total: number) => void;
}) {
  const db = useSQLiteContext();
  const place = 'paper';
  const refKey = typeof card === 'string' ? card : 'id' in card ? card.id : `name:${card.name}`;
  const knownOracle = oracleId ?? (typeof card !== 'string' && 'id' in card ? card.oracleId : undefined);
  // Copias de ESTA impresión (edición + idioma + arte) y de la carta en cualquier impresión.
  const [owned, setOwned] = useState<{ key: string; oracleId: string; count: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const printing = typeof card === 'string' && knownOracle ? { id: card, oracleId: knownOracle } : await resolve(card);
      if (!printing) return;
      const id = knownOracle ?? printing.oracleId;
      const [counts, mine] = await Promise.all([getOwnedCounts(db, [id], place), getPrintingCount(db, printing.id, place)]);
      if (!cancelled) setOwned({ key: refKey, oracleId: id, count: mine, total: counts[id] ?? 0 });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // Indexado por identidad: quien llama puede pasar un `{ name }` nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, refKey, knownOracle, place]);

  const count = owned?.key === refKey ? owned.count : 0;
  const others = owned?.key === refKey ? owned.total - owned.count : 0;

  /** +1 añade esta impresión; −1 (solo se muestra cuando tienes esta) quita una de esta impresión. */
  const change = async (delta: 1 | -1) => {
    setBusy(true);
    try {
      const printing = await resolve(card);
      if (!printing) return;
      if (delta > 0) await addToCollection(db, printing, place);
      else await removeOneFromCollection(db, printing.oracleId, printing.id, place);
      const [counts, mine] = await Promise.all([
        getOwnedCounts(db, [printing.oracleId], place),
        getPrintingCount(db, printing.id, place),
      ]);
      const total = counts[printing.oracleId] ?? 0;
      setOwned({ key: refKey, oracleId: printing.oracleId, count: mine, total });
      onAdded?.(total);
    } catch {
      // Se queda como estaba; el usuario puede tocar otra vez.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <View style={[styles.pill, styles.pillRow, count > 0 && styles.pillOwned, busy && { opacity: 0.6 }]}>
      {count > 0 && (
        <Pressable
          onPress={() => change(-1)}
          disabled={busy}
          hitSlop={8}
          style={styles.pillStep}
          accessibilityLabel="Quitar una de tu colección"
        >
          <MaterialCommunityIcons name="minus" size={16} color={colors.bg} />
        </Pressable>
      )}
      <Pressable
        onPress={() => change(1)}
        disabled={busy}
        hitSlop={6}
        style={styles.pillMain}
        accessibilityLabel={
          count > 0
            ? `Tienes ${count} de esta versión${others > 0 ? ` y ${others} de otras` : ''}. Añadir otra`
            : others > 0
              ? `Tienes ${others} en otras versiones. Añadir una de esta`
              : 'La tengo: añadir esta versión a tu colección'
        }
      >
        <MaterialCommunityIcons
          name={
            count > 0 ? 'package-variant-closed-check' : 'package-variant-closed'
          }
          size={16}
          color={count > 0 ? colors.bg : colors.text}
        />
        <Text style={[styles.text, count > 0 && { color: colors.bg }, count === 0 && others > 0 && { color: colors.textMuted }]}>
          {count > 0 ? `Tienes ${count}` : 'La tengo'}
          {others > 0 ? ` · ${others} ${count > 0 ? 'más' : 'en otras'}` : ''}
        </Text>
        {count > 0 && <MaterialCommunityIcons name="plus" size={16} color={colors.bg} />}
      </Pressable>
    </View>
    <WantPill card={card} oracleId={knownOracle} />
    </>
  );
}

const WANT_COLOR = '#ff7a9c';

/**
 * Interruptor «La quiero» (corazón) para ESTA impresión (edición + idioma + arte): cada impresión se marca
 * por su cuenta. Cuando se quiere otra impresión de la carta, lo indica.
 */
export function WantPill({ card, oracleId }: { card: CardRef; oracleId?: string }) {
  const db = useSQLiteContext();
  const refKey = typeof card === 'string' ? card : 'id' in card ? card.id : `name:${card.name}`;
  const known = typeof card === 'string' ? { id: card, oracleId } : 'id' in card ? { id: card.id, oracleId: card.oracleId } : null;
  const [resolved, setResolved] = useState<{ key: string; id: string; oracleId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (known?.oracleId) return;
    let cancelled = false;
    resolve(card)
      .then((c) => {
        if (c && !cancelled) setResolved({ key: refKey, id: c.id, oracleId: c.oracleId });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Keyed by identity: callers may pass a fresh `{ name }` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, known?.oracleId]);
  const fromResolve = resolved?.key === refKey ? resolved : null;
  const printingId = known?.id ?? fromResolve?.id;
  const cardId = known?.oracleId ?? fromResolve?.oracleId;
  const wanted = useWantedPrintings(db, printingId ? [printingId] : []).has(printingId ?? '');
  const cardWanted = useWantedIds(db, cardId ? [cardId] : []).has(cardId ?? '');
  const otherWanted = cardWanted && !wanted;
  const toggle = async () => {
    setBusy(true);
    try {
      const printing = await resolve(card);
      if (printing) await setWanted(db, printing, !wanted);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      hitSlop={6}
      style={[
        styles.pill,
        styles.pillRow,
        styles.pillMain,
        (wanted || otherWanted) && { borderColor: WANT_COLOR },
        otherWanted && { borderStyle: 'dashed' },
        busy && { opacity: 0.6 },
      ]}
      accessibilityLabel={
        wanted
          ? 'La quieres (esta edición e idioma): quitar de «La quiero»'
          : otherWanted
            ? 'Ya quieres otra edición de esta carta: querer también esta'
            : 'La quiero: apunta esta edición e idioma para conseguirla'
      }
    >
      <MaterialCommunityIcons name={wanted ? 'heart' : 'heart-outline'} size={16} color={wanted || otherWanted ? WANT_COLOR : colors.text} />
      <Text style={[styles.text, wanted && { color: WANT_COLOR }]}>
        {wanted ? 'La quieres' : otherWanted ? 'La quiero · quieres otra' : 'La quiero'}
      </Text>
    </Pressable>
  );
}

/**
 * Botón redondo «La tengo» de la vista de swipe (junto al historial): su insignia dice cuántas copias tienes;
 * tocarlo abre un panel pequeño para añadir (+) o quitar (−) copias de la carta en pantalla y para saltar a
 * ella en la colección.
 */
export function OwnRoundButton({ card, size = 44 }: { card: Card; size?: number }) {
  const db = useSQLiteContext();
  const place = 'paper';
  const [counts, setCounts] = useState<{ id: string; total: number; printing: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([getOwnedCounts(db, [card.oracleId], place), getPrintingCount(db, card.id, place)]).then(
      ([all, printing]) => ({
        id: card.id,
        total: all[card.oracleId] ?? 0,
        printing,
      }),
    );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOwnedCounts(db, [card.oracleId], place), getPrintingCount(db, card.id, place)])
      .then(([all, printing]) => {
        if (!cancelled) setCounts({ id: card.id, total: all[card.oracleId] ?? 0, printing });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, card.id, card.oracleId, place]);

  const total = counts?.id === card.id ? counts.total : 0;
  const printing = counts?.id === card.id ? counts.printing : 0;

  const change = async (delta: 1 | -1) => {
    setBusy(true);
    try {
      if (delta > 0) await addToCollection(db, card, place);
      else await removeOneFromCollection(db, card.oracleId, card.id, place);
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
        accessibilityLabel={`La tengo${total > 0 ? `: tienes ${total}` : ''}`}
      >
        <MaterialCommunityIcons
          name={
            total > 0 ? 'package-variant-closed-check' : 'package-variant-closed'
          }
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
            <WantPill card={card} oracleId={card.oracleId} />
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
  pillRow: { paddingHorizontal: 6 },
  pillMain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  pillStep: {
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: 'rgba(20,16,28,0.35)',
  },
  text: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
