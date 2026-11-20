import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, getCardsByIds } from '@/api/scryfall';
import { matchesFilters, sortCards } from '@/collection/localSearch';
import { BottomSheet } from '@/components/BottomSheet';
import { CardSheet } from '@/components/CardSheet';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { RailButton, SynergySheet, WantRailButton } from '@/components/swipe/SwipeRail';
import { ArtPickerModal } from '@/components/ArtPicker';
import { Button } from '@/components/Button';
import { HistorySheet, type Decision } from '@/components/HistorySheet';
import { OwnRoundButton } from '@/components/collection/OwnButton';
import { HintButton } from '@/components/Hint';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck, addCardToMaybe, addToCollection, changeMaybeQuantity, changeQuantity, getCollection, getOwnedCounts, removeOneFromCollection } from '@/db/database';
import { useCardQueue } from '@/hooks/useCardQueue';
import { colors } from '@/theme';

/** El riel lateral se cierra solo tras este tiempo sin tocarlo. */
const RAIL_AUTO_HIDE_MS = 4000;

/** Pila de cartas en el centro de la pantalla (la vista Deck de la web): derecha = añadir, izquierda = descartar. */
export function SwipeArea({ onToast }: { onToast: (msg: string) => void }) {
  const db = useSQLiteContext();
  const { ready, filters, ensureActiveDeck, refresh, prefs, activeDeck, activeCards, activeMaybe } = useAppState();
  // «Solo en mi colección»: tus cartas (datos de Scryfall de cada impresión, cacheados) con los filtros aplicados en el móvil.
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
  // Decisión de cada carta deslizada de esta búsqueda (mostrada en la carta y en el historial).
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showBack, setShowBack] = useState(false);
  // El tamaño del área de la carta (el tamaño de la carta se deriva de él y de si el riel está visible).
  const [area, setArea] = useState({ width: 0, height: 0 });
  const cardRef = useRef<SwipeCardHandle>(null);
  const [picker, setPicker] = useState<'language' | 'art' | null>(null);
  // Las pantallas propias de la carta: su ficha (tocar la carta), «Ficha completa» y «Sinergias».
  const [open, setOpen] = useState<'sheet' | 'info' | 'synergy' | null>(null);

  // Las decisiones se refieren a la búsqueda actual: se reinician en una nueva.
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

  // Pulsación larga en ✓: la carta vuela a la derecha pero va a «Posibles» del mazo en su lugar.
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
      // Siempre se añade: las reglas de formato se comprueban dentro del mazo, no aquí.
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

  /** − / ＋ del mazo y «Posibles» para la carta en pantalla (sin deslizarla). */
  const changeCopies = async (where: 'deck' | 'maybe', delta: 1 | -1) => {
    const shown = queue.current;
    if (!shown) return;
    if (delta < 0 && !activeDeck) return;
    const deck = delta > 0 ? await ensureActiveDeck() : activeDeck!;
    if (where === 'deck') {
      if (delta > 0) await addCardToDeck(db, deck.id, shown);
      else await changeQuantity(db, deck.id, shown.oracleId, -1);
    } else if (delta > 0) await addCardToMaybe(db, deck.id, shown);
    else await changeMaybeQuantity(db, deck.id, shown.oracleId, -1);
    buzz(delta > 0 ? 'add' : 'discard');
    refresh(deck.id);
  };

  // Copias de la carta en pantalla que tienes (en la colección), y − / ＋ para ella aquí mismo.
  const [owned, setOwned] = useState(0);
  const [ownedBump, setOwnedBump] = useState(0);
  const ownedOracle = queue.current?.oracleId;
  useEffect(() => {
    if (!ownedOracle) return setOwned(0);
    let cancelled = false;
    getOwnedCounts(db, [ownedOracle], 'paper')
      .then((counts) => !cancelled && setOwned(counts[ownedOracle] ?? 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, ownedOracle, ownedBump]);
  const changeOwned = async (delta: 1 | -1) => {
    const shown = queue.current;
    if (!shown) return;
    if (delta > 0) await addToCollection(db, shown, 'paper');
    else {
      if (owned === 0) return;
      await removeOneFromCollection(db, shown.oracleId, shown.id, 'paper');
    }
    buzz(delta > 0 ? 'add' : 'discard');
    setOwnedBump((n) => n + 1);
  };

  // Flechas: pasa por las cartas sin añadir ni descartar.
  const browse = (step: 1 | -1) => () => {
    setShowBack(false);
    if (step === 1) queue.next();
    else queue.back();
  };

  // El riel lateral: oculto hasta que deslizas a la izquierda desde el borde derecho (o tocas su pestaña); se
  // cierra solo tras un rato, con un deslizamiento a la derecha, o cuando se usa uno de sus botones.
  const [railOpen, setRailOpen] = useState(false);
  const [railTouch, setRailTouch] = useState(0);
  const [slide] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(slide, { toValue: railOpen ? 0 : 1, duration: 180, useNativeDriver: true }).start();
    if (!railOpen) return;
    const t = setTimeout(() => setRailOpen(false), RAIL_AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [railOpen, railTouch, slide]);
  const [edgePan] = useState(() =>
    PanResponder.create({
      // Solo un arrastre horizontal a la izquierda desde el borde (un toque va a la pestaña).
      onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -24) setRailOpen(true);
      },
    }),
  );
  const [railPan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 24) setRailOpen(false);
      },
    }),
  );
  /** Un botón del riel: hace lo suyo y cierra el riel. */
  const railAction = (fn: () => void) => () => {
    fn();
    setRailOpen(false);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };
  // Sitio a la derecha para el riel lateral de botones (cuando se muestra).
  const cardWidth = area.width ? Math.min(area.width - 32, (area.height - 10) / CARD_RATIO) : 0;
  const cardSize = { width: cardWidth, height: cardWidth * CARD_RATIO };

  const card = queue.current;
  // La carta en el mazo activo, su precio y si el formato del mazo la permite.
  const inDeck = card ? (activeCards.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
  const inMaybe = card ? (activeMaybe.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
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
      <View style={styles.cardArea} onLayout={onLayout}>
        <View style={styles.cardSlot}>
        {cardSize.width > 0 && body}
        </View>
        {card && notLegal && (
          <View style={styles.legalBadge} pointerEvents="none">
            <MaterialCommunityIcons name="alert-outline" size={13} color={colors.discard} />
            <Text style={styles.legalBadgeText} numberOfLines={1}>{notLegal}</Text>
          </View>
        )}
        {card && (
          // La pestaña cerca del borde derecho: deslízala a la izquierda (o tócala) para traer los botones.
          <View style={styles.edge} {...edgePan.panHandlers}>
            {!railOpen && (
              <HintButton hint="Mostrar los botones (o desliza desde el borde)" onPress={() => setRailOpen(true)} style={styles.railTab} hitSlop={8}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={colors.text} />
              </HintButton>
            )}
          </View>
        )}
        {card && (
          // Todo sobre la carta al alcance del pulgar, sobre su borde derecho.
          <Animated.View
            pointerEvents={railOpen ? 'auto' : 'none'}
            style={[
              styles.rail,
              { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
              { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) }] },
            ]}
            onTouchStart={() => setRailTouch((n) => n + 1)}
            {...railPan.panHandlers}
          >
            <View onTouchEnd={() => setTimeout(() => setRailOpen(false), 250)}>
              <WantRailButton card={card} />
            </View>
            <View style={styles.railItem} onTouchEnd={() => setRailOpen(false)}>
              <OwnRoundButton card={card} size={42} />
              <Text style={styles.railLabel}>La tengo</Text>
            </View>
            <RailButton icon="information-outline" hint="Ficha completa (todo lo de Scryfall)" label="Ficha" onPress={railAction(() => setOpen('info'))} />
            <RailButton icon="puzzle-outline" hint="Sinergias y combos de la carta" label="Sinergias" onPress={railAction(() => setOpen('synergy'))} />
            {card.backImageUrl && (
              <RailButton icon="rotate-3d-variant" hint="Ver la otra cara" label="Girar" active={showBack} onPress={railAction(() => setShowBack((b) => !b))} />
            )}
            <RailButton icon="translate" hint="Idioma de la carta" label={card.lang.toUpperCase()} small onPress={railAction(() => setPicker('language'))} />
            <RailButton icon="palette-outline" hint="Otras artes de la carta" label="Arte" small onPress={railAction(() => setPicker('art'))} />
          </Animated.View>
        )}
      </View>
      {card && (
        // Lo que importa de esta carta, en una línea: dónde estás, el mazo, el precio, las reglas; idioma y arte.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.strip}>
          <Stepper
            icon="cards-playing"
            label="Mazo"
            value={inDeck}
            color={colors.add}
            onSub={() => changeCopies('deck', -1)}
            onAdd={() => changeCopies('deck', 1)}
          />
          <Stepper
            icon="help-circle-outline"
            label="Posibles"
            value={inMaybe}
            color={colors.info}
            onSub={() => changeCopies('maybe', -1)}
            onAdd={() => changeCopies('maybe', 1)}
          />
          <Stepper
            icon="bookshelf"
            label="Tengo"
            value={owned}
            color={colors.accent}
            onSub={() => changeOwned(-1)}
            onAdd={() => changeOwned(1)}
          />
        </ScrollView>
      )}
      {card && (
        <View style={styles.actions}>
          <SmallRound icon="chevron-left" hint="Carta anterior" disabled={queue.index === 0} onPress={browse(-1)} />
          <RoundButton symbol="✕" color={colors.discard} onPress={() => cardRef.current?.swipe('left')} />
          <HintButton hint="Historial de esta búsqueda" onPress={() => setHistoryOpen(true)} style={styles.counterButton} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={16} color={colors.accent} />
            <Text style={styles.counterText}>
              {queue.position}/{queue.total.toLocaleString('es-ES')}
            </Text>
          </HintButton>
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
          nav={{ index: queue.index, total: queue.total, onMove: (step) => browse(step > 0 ? 1 : -1)(), cardAt: (i) => queue.cards[i] }}
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

/** − [icono etiqueta N] ＋, como los botones de mazo del PC: las copias de la carta en pantalla en el mazo o «Posibles». */
function Stepper(props: {
  icon: 'cards-playing' | 'help-circle-outline' | 'bookshelf';
  label: string;
  value: number;
  color: string;
  onSub: () => void;
  onAdd: () => void;
}) {
  const on = props.value > 0;
  return (
    <View style={[styles.stepper, { borderColor: props.color }, on && { backgroundColor: props.color }]}>
      <Pressable
        onPress={props.onSub}
        disabled={!on}
        hitSlop={4}
        style={({ pressed }) => [styles.stepperSide, (pressed || !on) && { opacity: on ? 0.6 : 0.35 }]}
        accessibilityLabel={`Una copia menos en ${props.label}`}
      >
        <MaterialCommunityIcons name="minus" size={18} color={on ? colors.bg : props.color} />
      </Pressable>
      <Pressable
        onPress={props.onAdd}
        hitSlop={4}
        style={({ pressed }) => [styles.stepperMain, pressed && { opacity: 0.6 }]}
        accessibilityLabel={`Una copia más en ${props.label}`}
      >
        <MaterialCommunityIcons name="plus" size={16} color={on ? colors.bg : props.color} />
        <MaterialCommunityIcons name={props.icon} size={17} color={on ? colors.bg : props.color} />
        {on && (
          <View style={styles.stepperBadge}>
            <Text style={[styles.stepperBadgeText, { color: props.color }]}>{props.value}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Un botón redondo pequeño de la fila inferior (anterior / siguiente / «Posibles»). */
function SmallRound(props: {
  icon: 'chevron-left' | 'chevron-right';
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
  /** Pulsación larga: una segunda acción (✓ → «Posibles»). */
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
  cardArea: { flex: 1 },
  cardSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
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
  rail: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', gap: 8 },
  railItem: { alignItems: 'center', gap: 2 },
  // Lejos del borde de la pantalla: el gesto «atrás» de Android empieza ahí.
  edge: { position: 'absolute', right: 18, top: '35%', height: 120, width: 34, justifyContent: 'center', alignItems: 'flex-end' },
  railTab: {
    width: 26,
    height: 64,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,16,28,0.82)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  railLabel: { color: colors.text, fontSize: 10, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  strip: { gap: 10, paddingHorizontal: 12, paddingTop: 8, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
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
  counterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    height: 44,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  counterText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 32, borderRadius: 16, borderWidth: 1.5, overflow: 'hidden' },
  stepperSide: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.25)',
  },
  stepperMain: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: '100%' },
  stepperText: { fontSize: 13, fontWeight: '800' },
  legalBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.72)', borderColor: colors.discard, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '70%' },
  legalBadgeText: { color: colors.discard, fontSize: 12, fontWeight: '700' },
  stepperBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  stepperBadgeText: { fontSize: 12, fontWeight: '900' },
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
