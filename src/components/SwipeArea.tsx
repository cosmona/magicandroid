import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName } from '@/api/scryfall';
import { BottomSheet } from '@/components/BottomSheet';
import { ArtPickerModal } from '@/components/ArtPicker';
import { Button } from '@/components/Button';
import { HistorySheet, type Decision } from '@/components/HistorySheet';
import { OwnRoundButton } from '@/components/collection/OwnButton';
import { HintButton } from '@/components/Hint';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck, addCardToMaybe } from '@/db/database';
import { useCardQueue } from '@/hooks/useCardQueue';
import { colors } from '@/theme';

/** Card stack in the middle of the screen (the web's Deck view): right = add, left = discard. */
export function SwipeArea({ onToast }: { onToast: (msg: string) => void }) {
  const db = useSQLiteContext();
  const { ready, filters, ensureActiveDeck, refresh, prefs } = useAppState();
  const queue = useCardQueue(filters, ready, prefs.language);
  const buzz = (kind: 'add' | 'discard') => {
    if (!prefs.haptics) return;
    Haptics.impactAsync(kind === 'add' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  };
  // Decision for every swiped card of this search (shown on the card and in the history).
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<SwipeCardHandle>(null);
  const [picker, setPicker] = useState<'language' | 'art' | null>(null);

  // Decisions refer to the current search: reset them on a new one.
  const [historyFilters, setHistoryFilters] = useState(filters);
  if (historyFilters !== filters) {
    setHistoryFilters(filters);
    setDecisions({});
  }

  const decide = (cardId: string, decision: Decision | null) =>
    setDecisions((d) => {
      const next = { ...d };
      if (decision) next[cardId] = decision;
      else delete next[cardId];
      return next;
    });

  // Long press on ✓: the card flies right but goes to the deck's «Posibles» instead.
  const toMaybe = useRef(false);

  const onSwiped = async (dir: SwipeDirection) => {
    const card = queue.current;
    if (!card) return;
    queue.next();
    setShowBack(false);

    if (dir === 'right' && toMaybe.current) {
      toMaybe.current = false;
      const deck = await ensureActiveDeck();
      await addCardToMaybe(db, deck.id, card);
      buzz('add');
      onToast(`? ${displayName(card)} apartada en Posibles`);
      refresh(deck.id);
    } else if (dir === 'right') {
      const deck = await ensureActiveDeck();
      // Always added: format rules are checked inside the deck, not here.
      const quantity = await addCardToDeck(db, deck.id, card);
      buzz('add');
      decide(card.id, 'added');
      onToast(`+1 ${displayName(card)} (${quantity} en el mazo)`);
      refresh(deck.id);
    } else {
      buzz('discard');
      decide(card.id, 'discarded');
    }
  };

  // Arrows: move through the cards without adding or discarding.
  const browse = (step: 1 | -1) => () => {
    setShowBack(false);
    if (step === 1) queue.next();
    else queue.back();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.min(width - 32, height / CARD_RATIO);
    setCardSize({ width: w, height: w * CARD_RATIO });
  };

  const card = queue.current;
  const decision = card ? decisions[card.id] : undefined;
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
      {card && decision && (
        <View style={styles.languageRow}>
          {decision && (
            <View style={[styles.decided, { borderColor: decision === 'added' ? colors.add : colors.discard }]}>
              <Text style={[styles.decidedText, { color: decision === 'added' ? colors.add : colors.discard }]}>
                {decision === 'added' ? '✓ Ya añadida' : '✕ Descartada'}
              </Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.cardArea} onLayout={onLayout}>
        {cardSize.width > 0 && body}
        {card && (
          <>
            <ArrowButton side="left" disabled={queue.index === 0} onPress={browse(-1)} />
            <ArrowButton side="right" disabled={!queue.upcoming} onPress={browse(1)} />
            {card.backImageUrl && (
              <HintButton
                hint="Ver la otra cara"
                style={styles.flip}
                onPress={() => setShowBack((b) => !b)}
                hitSlop={6}
              >
                <MaterialCommunityIcons name="rotate-3d-variant" size={22} color={colors.text} />
              </HintButton>
            )}
          </>
        )}
      </View>
      {card && (
        <View style={styles.actions}>
          <RoundButton symbol="✕" color={colors.discard} onPress={() => cardRef.current?.swipe('left')} />
          <IconRound
            icon="translate"
            hint="Idioma"
            label={card.lang.toUpperCase()}
            onPress={() => setPicker('language')}
          />
          <IconRound icon="palette-outline" hint="Arte" onPress={() => setPicker('art')} />
          <HintButton hint="Historial" style={styles.historyButton} onPress={() => setHistoryOpen(true)} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={colors.accent} />
            <Text style={styles.counter}>
              {queue.position}/{queue.total.toLocaleString('es-ES')}
            </Text>
          </HintButton>
          <OwnRoundButton card={card} />
          <RoundButton
            symbol="✓"
            color={colors.add}
            onPress={() => cardRef.current?.swipe('right')}
            onLongPress={() => {
              toMaybe.current = true;
              cardRef.current?.swipe('right');
            }}
          />
        </View>
      )}

      {card && picker === 'language' && (
        <LanguagePickerModal
          card={card}
          onClose={() => setPicker(null)}
          onPick={(c) => {
            setPicker(null);
            if (c.id === card.id) return;
            setShowBack(false);
            queue.replaceCurrent(c);
          }}
        />
      )}
      {card && picker === 'art' && (
        <ArtPickerModal
          card={card}
          onClose={() => setPicker(null)}
          onPick={(c) => {
            setPicker(null);
            if (c.id === card.id) return;
            setShowBack(false);
            queue.replaceCurrent(c);
          }}
        />
      )}

      <BottomSheet visible={historyOpen} onClose={() => setHistoryOpen(false)} heightRatio={0.85}>
        <HistorySheet
          cards={queue.cards}
          index={queue.index}
          decisions={decisions}
          hasMore={queue.hasMore}
          onNeedMore={queue.loadUpTo}
          onSelect={(position) => {
            setHistoryOpen(false);
            setShowBack(false);
            queue.goTo(position);
          }}
        />
      </BottomSheet>
    </View>
  );
}

function ArrowButton(props: { side: 'left' | 'right'; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.arrow,
        props.side === 'left' ? { left: 2 } : { right: 2 },
        props.disabled && { opacity: 0.2 },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <Text style={styles.arrowText}>{props.side === 'left' ? '‹' : '›'}</Text>
    </Pressable>
  );
}

/** Small round icon button of the bottom row (with an optional tiny label, e.g. the language). */
function IconRound(props: {
  icon: 'translate' | 'palette-outline';
  hint: string;
  label?: string;
  onPress: () => void;
}) {
  return (
    <HintButton
      hint={props.hint}
      onPress={props.onPress}
      style={({ pressed }) => [styles.iconRound, pressed && { opacity: 0.6 }]}
    >
      <MaterialCommunityIcons name={props.icon} size={20} color={colors.text} />
      {props.label && <Text style={styles.iconLabel}>{props.label}</Text>}
    </HintButton>
  );
}

function RoundButton(props: {
  symbol: string;
  color: string;
  onPress: () => void;
  /** Long press: a second action (✓ → «Posibles»). */
  onLongPress?: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const size = props.small ? 44 : 58;
  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
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
  languageRow: {
    paddingTop: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -28,
    width: 34,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,16,28,0.75)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowText: { color: colors.text, fontSize: 30, fontWeight: '700', marginTop: -4 },
  decided: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  decidedText: { fontWeight: '800', fontSize: 13 },
  upcoming: { borderRadius: 16, transform: [{ scale: 0.94 }], opacity: 0.6 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 10 },
  iconRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '900', marginTop: -2 },
  flip: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,16,28,0.8)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyButton: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
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
