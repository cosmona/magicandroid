import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, getCardsByIds } from '@/api/scryfall';
import { matchesFilters, sortCards } from '@/collection/localSearch';
import { BottomSheet } from '@/components/BottomSheet';
import { CardSheet } from '@/components/CardSheet';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { RailButton, SynergySheet, WantRailButton } from '@/components/swipe/SwipeRail';
import { useCardDetails } from '@/hooks/useCardDetails';
import { ArtPickerModal } from '@/components/ArtPicker';
import { Button } from '@/components/Button';
import { HistorySheet, type Decision } from '@/components/HistorySheet';
import { OwnRoundButton } from '@/components/collection/OwnButton';
import { HintButton } from '@/components/Hint';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck, addCardToMaybe, getCollection } from '@/db/database';
import { useCardQueue } from '@/hooks/useCardQueue';
import { colors, formatEur } from '@/theme';

/** Width kept on the right of the card for the rail of buttons. */
const RAIL_ROOM = 50;

/** Card stack in the middle of the screen (the web's Deck view): right = add, left = discard. */
export function SwipeArea({ onToast }: { onToast: (msg: string) => void }) {
  const db = useSQLiteContext();
  const { ready, filters, ensureActiveDeck, refresh, prefs, activeDeck, activeCards, activeMaybe } = useAppState();
  // «Solo en mi colección»: your cards (Scryfall data of each printing, cached) with the filters applied on the phone.
  const queue = useCardQueue(filters, ready, prefs.language, async (f) => {
    const rows = await getCollection(db, 'paper');
    const all = await getCardsByIds([...new Set(rows.filter((r) => r.quantity > 0).map((r) => r.scryfallId))]);
    const seen = new Set<string>();
    const unique = all.filter((c) => (seen.has(c.oracleId) ? false : (seen.add(c.oracleId), true)));
    return sortCards(unique.filter((c) => matchesFilters(c, f)), f);
  });
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
  // The card's own screens: its sheet (tap on the card), «Ficha completa» and «Sinergias».
  const [open, setOpen] = useState<'sheet' | 'info' | 'synergy' | null>(null);

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

    if (dir === 'up' || (dir === 'right' && toMaybe.current)) {
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
    // Room on the right for the side rail of buttons.
    const w = Math.min(width - 32 - RAIL_ROOM, height / CARD_RATIO);
    setCardSize({ width: w, height: w * CARD_RATIO });
  };

  const card = queue.current;
  const decision = card ? decisions[card.id] : undefined;
  // The card in the active deck, its price and whether the deck's format allows it.
  const inDeck = card ? (activeCards.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
  const inMaybe = card ? (activeMaybe.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
  const price = useCardDetails(card && prefs.pricesDeckCards ? [card.id] : [])[card?.id ?? '']?.eur ?? null;
  const legality = card && activeDeck?.format ? card.legalities?.[activeDeck.format] : undefined;
  const notLegal =
    legality && legality !== 'legal' && legality !== 'restricted'
      ? `${legality === 'banned' ? 'Prohibida' : 'No legal'} en ${activeDeck?.format}`
      : null;
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
        <SwipeCard key={card.id} ref={cardRef} card={card} showBack={showBack} onSwiped={onSwiped} onTap={() => setOpen('sheet')} />
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
          // Everything about the card at a thumb's reach, over its right edge.
          <View style={styles.rail}>
            <WantRailButton card={card} />
            <View style={styles.railItem}>
              <OwnRoundButton card={card} size={46} />
              <Text style={styles.railLabel}>La tengo</Text>
            </View>
            <RailButton icon="information-outline" hint="Ficha completa (todo lo de Scryfall)" label="Ficha" onPress={() => setOpen('info')} />
            <RailButton icon="puzzle-outline" hint="Sinergias y combos de la carta" label="Sinergias" onPress={() => setOpen('synergy')} />
            {card.backImageUrl && (
              <RailButton icon="rotate-3d-variant" hint="Ver la otra cara" label="Girar" active={showBack} onPress={() => setShowBack((b) => !b)} />
            )}
          </View>
        )}
      </View>
      {card && (
        // What matters of this card, in one line: where you are, the deck, the price, the rules; language and art.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.strip}>
          <HintButton hint="Historial de esta búsqueda" onPress={() => setHistoryOpen(true)} style={styles.chip} hitSlop={4}>
            <MaterialCommunityIcons name="history" size={15} color={colors.accent} />
            <Text style={styles.chipText}>
              {queue.position}/{queue.total.toLocaleString('es-ES')}
            </Text>
          </HintButton>
          {inDeck > 0 && (
            <View style={[styles.chip, { borderColor: colors.add }]}>
              <MaterialCommunityIcons name="cards-playing" size={15} color={colors.add} />
              <Text style={[styles.chipText, { color: colors.add }]}>{inDeck} en el mazo</Text>
            </View>
          )}
          {inMaybe > 0 && (
            <View style={[styles.chip, { borderColor: colors.info }]}>
              <MaterialCommunityIcons name="help-circle-outline" size={15} color={colors.info} />
              <Text style={[styles.chipText, { color: colors.info }]}>{inMaybe} en Posibles</Text>
            </View>
          )}
          {notLegal && (
            <View style={[styles.chip, { borderColor: colors.discard }]}>
              <MaterialCommunityIcons name="alert-outline" size={15} color={colors.discard} />
              <Text style={[styles.chipText, { color: colors.discard }]}>{notLegal}</Text>
            </View>
          )}
          {price != null && (
            <View style={styles.chip}>
              <Text style={[styles.chipText, { color: colors.undo }]}>{formatEur(price)}</Text>
            </View>
          )}
          <HintButton hint="Idioma de la carta" onPress={() => setPicker('language')} style={styles.chip} hitSlop={4}>
            <MaterialCommunityIcons name="translate" size={15} color={colors.text} />
            <Text style={styles.chipText}>{card.lang.toUpperCase()}</Text>
          </HintButton>
          <HintButton hint="Otras artes de la carta" onPress={() => setPicker('art')} style={styles.chip} hitSlop={4}>
            <MaterialCommunityIcons name="palette-outline" size={15} color={colors.text} />
            <Text style={styles.chipText}>Arte</Text>
          </HintButton>
        </ScrollView>
      )}
      {card && (
        <View style={styles.actions}>
          <SmallRound icon="chevron-left" hint="Carta anterior" disabled={queue.index === 0} onPress={browse(-1)} />
          <RoundButton symbol="✕" color={colors.discard} onPress={() => cardRef.current?.swipe('left')} />
          <SmallRound icon="help-circle-outline" hint="A Posibles (o desliza hacia arriba)" color={colors.info} onPress={() => cardRef.current?.swipe('up')} />
          <RoundButton
            symbol="✓"
            color={colors.add}
            onPress={() => cardRef.current?.swipe('right')}
            onLongPress={() => {
              toMaybe.current = true;
              cardRef.current?.swipe('right');
            }}
          />
          <SmallRound icon="chevron-right" hint="Pasar sin decidir" disabled={!queue.upcoming} onPress={browse(1)} />
        </View>
      )}

      {card && open === 'sheet' && (
        <CardSheet
          card={card}
          exact
          subtitle="Construir"
          onClose={() => setOpen(null)}
          onPrinting={(c) => queue.replaceCurrent(c)}
          nav={{ index: queue.index, total: queue.total, onMove: (step) => browse(step > 0 ? 1 : -1)() }}
        />
      )}
      {card && open === 'info' && <CardInfoScreen id={card.id} onClose={() => setOpen(null)} />}
      <SynergySheet card={card && open === 'synergy' ? card : null} onClose={() => setOpen(null)} />

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

/** A small round button of the bottom row (previous / next / «Posibles»). */
function SmallRound(props: {
  icon: 'chevron-left' | 'chevron-right' | 'help-circle-outline';
  hint: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <HintButton
      hint={props.hint}
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconRound,
        props.color ? { borderColor: props.color } : null,
        (pressed || props.disabled) && { opacity: props.disabled ? 0.3 : 0.6 },
      ]}
    >
      <MaterialCommunityIcons name={props.icon} size={24} color={props.color ?? colors.text} />
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
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingRight: RAIL_ROOM },
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
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, paddingVertical: 8 },
  rail: { position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center', gap: 12 },
  railItem: { alignItems: 'center', gap: 2 },
  railLabel: { color: colors.text, fontSize: 10, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  strip: { gap: 6, paddingHorizontal: 12, paddingTop: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
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
