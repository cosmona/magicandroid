import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { DEFAULT_FILTERS, displayName, type Card, type Filters } from '@/api/scryfall';
import { Button } from '@/components/Button';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck, changeQuantity, getDeck, type Deck } from '@/db/database';
import { useCardQueue } from '@/hooks/useCardQueue';
import { colors } from '@/theme';

interface HistoryEntry {
  card: Card;
  /** Deck the card was added to, or null if it was discarded / over the copy limit. */
  addedTo: number | null;
}

const MAX_HISTORY = 50;

function activeFilterCount(f: Filters) {
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter(
    (k) => k !== 'order' && JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k]),
  ).length;
}

export default function DiscoverScreen() {
  const db = useSQLiteContext();
  const { ready, activeDeckId, setActiveDeckId, filters } = useAppState();
  const queue = useCardQueue(filters, ready);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showBack, setShowBack] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<SwipeCardHandle>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refreshDeck = useCallback(async () => {
    if (activeDeckId === null) return setDeck(null);
    const d = await getDeck(db, activeDeckId);
    if (!d) setActiveDeckId(null); // active deck was deleted
    setDeck(d);
  }, [db, activeDeckId, setActiveDeckId]);

  useFocusEffect(
    useCallback(() => {
      refreshDeck();
    }, [refreshDeck]),
  );

  // History refers to positions in the current result list, so reset it on a new search.
  const [historyFilters, setHistoryFilters] = useState(filters);
  if (historyFilters !== filters) {
    setHistoryFilters(filters);
    setHistory([]);
  }

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const onSwiped = async (dir: SwipeDirection) => {
    const card = queue.current;
    if (!card || !deck) return;
    queue.next();
    setShowBack(false);

    let addedTo: number | null = null;
    if (dir === 'right') {
      const res = await addCardToDeck(db, deck.id, deck.format, card);
      if (res.added) {
        addedTo = deck.id;
        showToast(`+1 ${displayName(card)} (${res.quantity} en el mazo)`);
        refreshDeck();
      } else {
        showToast(`Límite alcanzado: máximo ${res.limit} ${res.limit === 1 ? 'copia' : 'copias'}`);
      }
    }
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { card, addedTo }]);
  };

  const undo = async () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    queue.back();
    setShowBack(false);
    if (last.addedTo !== null) {
      await changeQuantity(db, last.addedTo, last.card.oracleId, -1);
      showToast(`Deshecho: −1 ${displayName(last.card)}`);
      refreshDeck();
    }
  };

  const onCardAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.min(width - 32, height / CARD_RATIO);
    setCardSize({ width: w, height: w * CARD_RATIO });
  };

  const filterCount = activeFilterCount(filters);
  const card = queue.current;

  let body: React.ReactNode;
  if (!ready || (queue.loading && !card)) {
    body = <ActivityIndicator size="large" color={colors.accent} />;
  } else if (!deck) {
    body = (
      <View style={styles.message}>
        <Text style={styles.messageTitle}>Elige un mazo</Text>
        <Text style={styles.messageText}>
          Crea o selecciona un mazo para empezar a añadir cartas deslizando.
        </Text>
        <Button label="Ir a mis mazos" onPress={() => router.navigate('/decks')} />
      </View>
    );
  } else if (!card) {
    body = (
      <View style={styles.message}>
        <Text style={styles.messageTitle}>{queue.error ? 'Algo ha fallado' : 'No hay más cartas'}</Text>
        <Text style={styles.messageText}>
          {queue.error ?? 'No quedan cartas con estos filtros. Prueba a cambiarlos.'}
        </Text>
        {queue.error ? (
          <Button label="Reintentar" onPress={queue.reload} />
        ) : (
          <Button label="Cambiar filtros" onPress={() => router.push('/filters')} />
        )}
      </View>
    );
  } else {
    body = (
      <View style={{ width: cardSize.width, height: cardSize.height }}>
        {queue.upcoming?.imageUrl && (
          <Image
            source={{ uri: queue.upcoming.imageUrl }}
            style={[StyleSheet.absoluteFill, styles.upcoming]}
            contentFit="contain"
          />
        )}
        <SwipeCard key={card.id} ref={cardRef} card={card} showBack={showBack} onSwiped={onSwiped} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable style={styles.deckPill} onPress={() => router.navigate('/decks')}>
          <Text style={styles.deckPillText} numberOfLines={1}>
            {deck ? `📚 ${deck.name} · ${deck.cardCount} cartas` : '📚 Sin mazo'}
          </Text>
        </Pressable>
        <Pressable style={styles.filterButton} onPress={() => router.push('/filters')}>
          <Text style={styles.filterButtonText}>
            Filtros{filterCount ? ` (${filterCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <View style={styles.cardArea} onLayout={onCardAreaLayout}>
        {cardSize.width > 0 && body}
      </View>

      {card && deck && (
        <>
          <Text style={styles.counter}>
            {queue.position} / {queue.total}
          </Text>
          <View style={styles.actions}>
            <RoundButton symbol="✕" color={colors.discard} onPress={() => cardRef.current?.swipe('left')} />
            <RoundButton symbol="↶" color={colors.undo} small disabled={!history.length} onPress={undo} />
            {card.backImageUrl && (
              <RoundButton symbol="⟳" color={colors.textMuted} small onPress={() => setShowBack((b) => !b)} />
            )}
            <RoundButton symbol="✓" color={colors.add} onPress={() => cardRef.current?.swipe('right')} />
          </View>
        </>
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function RoundButton(props: {
  symbol: string;
  color: string;
  onPress: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const size = props.small ? 52 : 68;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderColor: props.color },
        (pressed || props.disabled) && { opacity: props.disabled ? 0.3 : 0.6 },
      ]}
    >
      <Text style={{ color: props.color, fontSize: props.small ? 22 : 30, fontWeight: '800' }}>
        {props.symbol}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', gap: 8, padding: 12 },
  deckPill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckPillText: { color: colors.text, fontWeight: '600' },
  filterButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  filterButtonText: { color: colors.accent, fontWeight: '700' },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  upcoming: { borderRadius: 16, transform: [{ scale: 0.94 }], opacity: 0.6 },
  counter: { color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 14,
  },
  round: {
    borderRadius: 999,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  message: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  messageTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  messageText: { color: colors.textMuted, textAlign: 'center' },
  toast: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    maxWidth: '90%',
  },
  toastText: { color: colors.text, fontWeight: '600' },
});
