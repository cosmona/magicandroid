import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, type Card } from '@/api/scryfall';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { HistorySheet, type Decision } from '@/components/HistorySheet';
import { LanguagePicker } from '@/components/LanguagePicker';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck, changeQuantity } from '@/db/database';
import { useCardQueue } from '@/hooks/useCardQueue';
import { colors } from '@/theme';

interface HistoryEntry {
  card: Card;
  /** Deck the card was added to, or null if it was discarded / over the copy limit. */
  addedTo: number | null;
}

const MAX_HISTORY = 50;

/** Card stack in the middle of the screen (the web's Deck view): right = add, left = discard. */
export function SwipeArea({ onToast }: { onToast: (msg: string) => void }) {
  const db = useSQLiteContext();
  const { ready, filters, ensureActiveDeck, refresh, prefs } = useAppState();
  const queue = useCardQueue(filters, ready, prefs.language);
  const buzz = (kind: 'add' | 'discard') => {
    if (!prefs.haptics) return;
    Haptics.impactAsync(kind === 'add' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  };
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // Decision for every swiped card of this search (the undo history above is capped).
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<SwipeCardHandle>(null);

  // History refers to positions in the current result list, so reset it on a new search.
  const [historyFilters, setHistoryFilters] = useState(filters);
  if (historyFilters !== filters) {
    setHistoryFilters(filters);
    setHistory([]);
    setDecisions({});
  }

  const decide = (cardId: string, decision: Decision | null) =>
    setDecisions((d) => {
      const next = { ...d };
      if (decision) next[cardId] = decision;
      else delete next[cardId];
      return next;
    });

  const onSwiped = async (dir: SwipeDirection) => {
    const card = queue.current;
    if (!card) return;
    queue.next();
    setShowBack(false);

    let addedTo: number | null = null;
    if (dir === 'right') {
      const deck = await ensureActiveDeck();
      // Always added: format rules are checked inside the deck, not here.
      const quantity = await addCardToDeck(db, deck.id, card);
      addedTo = deck.id;
      buzz('add');
      decide(card.id, 'added');
      onToast(`+1 ${displayName(card)} (${quantity} en el mazo)`);
      refresh(deck.id);
    } else {
      buzz('discard');
      decide(card.id, 'discarded');
    }
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { card, addedTo }]);
  };

  const undo = async () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    decide(last.card.id, null);
    queue.back();
    setShowBack(false);
    if (last.addedTo !== null) {
      await changeQuantity(db, last.addedTo, last.card.oracleId, -1);
      onToast(`Deshecho: −1 ${displayName(last.card)}`);
      refresh();
    }
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.min(width - 32, height / CARD_RATIO);
    setCardSize({ width: w, height: w * CARD_RATIO });
  };

  const card = queue.current;
  let body: React.ReactNode;
  if (!ready || (queue.loading && !card)) {
    body = <ActivityIndicator size="large" color={colors.accent} />;
  } else if (!card) {
    body = (
      <View style={styles.message}>
        <Text style={styles.messageTitle}>{queue.error ? 'Algo ha fallado' : 'No hay más cartas'}</Text>
        <Text style={styles.messageText}>
          {queue.error ?? 'No quedan cartas con estos filtros. Prueba a cambiarlos.'}
        </Text>
        {queue.error && <Button label="Reintentar" onPress={queue.reload} />}
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
    <View style={styles.container}>
      {card && (
        <View style={styles.languageRow}>
          <LanguagePicker
            card={card}
            onChange={(c) => {
              setShowBack(false);
              queue.replaceCurrent(c);
            }}
          />
        </View>
      )}
      <View style={styles.cardArea} onLayout={onLayout}>
        {cardSize.width > 0 && body}
      </View>
      {card && (
        <View style={styles.actions}>
          <RoundButton symbol="✕" color={colors.discard} onPress={() => cardRef.current?.swipe('left')} />
          <RoundButton symbol="↶" color={colors.undo} small disabled={!history.length} onPress={undo} />
          <Pressable style={styles.historyButton} onPress={() => setHistoryOpen(true)} hitSlop={6}>
            <Text style={styles.historyIcon}>▤</Text>
            <Text style={styles.counter}>
              {queue.position}/{queue.total.toLocaleString('es-ES')}
            </Text>
          </Pressable>
          {card.backImageUrl && (
            <RoundButton symbol="⟳" color={colors.textMuted} small onPress={() => setShowBack((b) => !b)} />
          )}
          <RoundButton symbol="✓" color={colors.add} onPress={() => cardRef.current?.swipe('right')} />
        </View>
      )}

      <BottomSheet visible={historyOpen} onClose={() => setHistoryOpen(false)} heightRatio={0.85}>
        <HistorySheet
          cards={queue.cards}
          index={queue.index}
          decisions={decisions}
          hasMore={queue.hasMore}
          onNeedMore={queue.loadUpTo}
        />
      </BottomSheet>
    </View>
  );
}

function RoundButton(props: { symbol: string; color: string; onPress: () => void; small?: boolean; disabled?: boolean }) {
  const size = props.small ? 44 : 58;
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
      <Text style={{ color: props.color, fontSize: props.small ? 20 : 26, fontWeight: '800' }}>{props.symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  languageRow: { paddingTop: 8 },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  upcoming: { borderRadius: 16, transform: [{ scale: 0.94 }], opacity: 0.6 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, paddingVertical: 10 },
  historyButton: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyIcon: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  counter: { color: colors.textMuted, fontSize: 11, minWidth: 44, textAlign: 'center' },
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
});
