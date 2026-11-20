import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCardInLanguage, getCardsByIds, getCardsByNames, type Card } from '@/api/scryfall';
import {
  edhrecCommanderUrl,
  findDeckCombos,
  getEdhrecCommander,
  type DeckCombos,
  type EdhrecCommander,
  type EdhrecEntry,
} from '@/api/synergy';
import { Section, SectionHelp, SubTitle } from '@/components/cardInfo/Section';
import { ComboView, count, EntryRow, pct, useCardImages } from '@/components/synergy/SynergyParts';
import { CardBigView } from '@/components/CardBigView';
import { LanguagePill } from '@/components/LanguagePicker';
import { OwnPill } from '@/components/collection/OwnButton';
import { InDeckBadge } from '@/components/deck/InDeckBadge';
import { CARD_RATIO, SwipeCard, type SwipeCardHandle, type SwipeDirection } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import type { DeckCard } from '@/db/database';
import { colors } from '@/theme';

type Tab = 'combos' | 'recommend';
/** Cómo se muestran las recomendaciones. */
type RecView = 'list' | 'gallery' | 'swipe';
type Load<T> = { key: string; status: 'loading' | 'error' | 'done'; data?: T };

const ALMOST_PAGE = 15;
const RECOMMEND_COUNT = 40;
/** El swipe es rápido, así que profundiza más en la lista. */
const SWIPE_COUNT = 100;
const front = (name: string) => name.split(' // ')[0].toLowerCase();

/**
 * Sinergias a pantalla completa del mazo activo: sus combos y los que están a una carta (Commander Spellbook),
 * y las cartas que EDHREC recomienda para su comandante, añadibles con ＋.
 */
export function DeckSynergyScreen({
  cards,
  usesCommander,
  onAdd,
  onClose,
}: {
  cards: DeckCard[];
  usesCommander: boolean;
  /** Añade una impresión (ya en el idioma preferido) al mazo. */
  onAdd: (card: Card) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { prefs } = useAppState();
  const [tab, setTab] = useState<Tab>('combos');
  const [recView, setRecView] = useState<RecView>('list');
  const [bigId, setBigId] = useState<string | null>(null);

  const commanders = useMemo(
    () => (usesCommander ? cards.filter((c) => c.isCommander).map((c) => c.name) : []),
    [cards, usesCommander],
  );
  const main = useMemo(() => cards.filter((c) => !commanders.includes(c.name)).map((c) => c.name), [cards, commanders]);
  const inDeck = useMemo(() => new Set(cards.map((c) => front(c.name))), [cards]);

  // ---- Combos (Commander Spellbook) ----
  // El mazo tal como estaba al abrir la pantalla: añadir una pieza de combo desde aquí la marca como añadida
  // en vez de recargar (y re-desplazar) toda la lista.
  const [comboQuery] = useState(() => ({ main, commanders, key: [...commanders, '|', ...main].join('\n') }));
  const comboKey = comboQuery.key;
  const [combos, setCombos] = useState<Load<DeckCombos>>({ key: '', status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    findDeckCombos(comboQuery.main, comboQuery.commanders)
      .then((data) => !cancelled && setCombos({ key: comboQuery.key, status: 'done', data }))
      .catch(() => !cancelled && setCombos({ key: comboQuery.key, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [comboQuery, attempt]);
  const comboState = combos.key === comboKey ? combos : { status: 'loading' as const, data: undefined };
  const [almostShown, setAlmostShown] = useState(ALMOST_PAGE);

  // ---- Recomendaciones (EDHREC, para el primer comandante) ----
  const leader = commanders[0];
  const [rec, setRec] = useState<Load<EdhrecCommander | null>>({ key: '', status: 'loading' });
  useEffect(() => {
    if (!leader) return;
    let cancelled = false;
    getEdhrecCommander(leader)
      .then((data) => !cancelled && setRec({ key: leader, status: 'done', data }))
      .catch(() => !cancelled && setRec({ key: leader, status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [leader, attempt]);
  const recState = rec.key === leader ? rec : { status: 'loading' as const, data: undefined };
  const notInDeck = useMemo(
    () => (recState.data?.cards ?? []).filter((e) => !inDeck.has(front(e.name))),
    [recState.data, inDeck],
  );
  const recommended = notInDeck.slice(0, RECOMMEND_COUNT);

  // Añadidas desde aquí durante esta visita (la lista del mazo se actualiza detrás).
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  /** `keepLanguage`: la impresión se eligió a mano, no la cambies al idioma preferido. */
  const add = async (id: string, known?: Card, keepLanguage = false) => {
    setAdding(id);
    try {
      const card = known ?? (await getCardsByIds([id]))[0];
      if (card) {
        const printing =
          prefs.language !== 'en' && !keepLanguage
            ? ((await getCardInLanguage(card, prefs.language).catch(() => null)) ?? card)
            : card;
        await onAdd(printing);
        setAdded((prev) => new Set(prev).add(id));
      }
    } finally {
      setAdding(null);
    }
  };

  // Piezas de combo añadidas desde aquí, por nombre (Commander Spellbook da nombres en inglés).
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [addingName, setAddingName] = useState<string | null>(null);
  const addByName = async (name: string) => {
    setAddingName(name);
    try {
      const [card] = await getCardsByNames([name]);
      if (card) {
        const printing =
          prefs.language !== 'en' ? ((await getCardInLanguage(card, prefs.language).catch(() => null)) ?? card) : card;
        await onAdd(printing);
        setAddedNames((prev) => new Set(prev).add(name));
      }
    } catch {
      // Se queda con su ＋ para poder intentarlo de nuevo.
    } finally {
      setAddingName(null);
    }
  };

  // Imágenes: las cartas de los combos en pantalla, o las recomendadas.
  const almostList = comboState.data?.almost.slice(0, almostShown) ?? [];
  const comboNames = [
    ...(comboState.data?.included ?? []).flatMap((c) => c.cards),
    ...almostList.flatMap((a) => a.combo.cards),
  ];
  const comboImages = useCardImages(tab === 'combos' ? comboNames : [], 'name');
  const recImages = useCardImages(tab === 'recommend' && recView !== 'swipe' ? recommended.map((e) => e.id) : [], 'id');
  const showRecViews = tab === 'recommend' && !!leader && recState.status === 'done' && !!recState.data;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver" style={styles.headerButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Sinergias del mazo</Text>
        </View>

        <View style={styles.tabs}>
          {(
            [
              { key: 'combos', label: 'Combos', icon: 'puzzle-outline' },
              { key: 'recommend', label: 'Recomendadas', icon: 'star-outline' },
            ] as const
          ).map((t) => (
            <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
              <MaterialCommunityIcons name={t.icon} size={18} color={tab === t.key ? colors.bg : colors.textMuted} />
              <Text style={[styles.tabText, tab === t.key && { color: colors.bg }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {showRecViews && (
          <View style={styles.viewSwitch}>
            {(
              [
                { key: 'list', icon: 'format-list-bulleted', label: 'Lista' },
                { key: 'gallery', icon: 'view-grid-outline', label: 'Galería' },
                { key: 'swipe', icon: 'gesture-swipe-horizontal', label: 'Pasar cartas' },
              ] as const
            ).map((v) => (
              <Pressable
                key={v.key}
                style={[styles.viewButton, recView === v.key && styles.viewButtonOn]}
                onPress={() => setRecView(v.key)}
                accessibilityLabel={v.label}
              >
                <MaterialCommunityIcons name={v.icon} size={20} color={recView === v.key ? colors.bg : colors.text} />
                <Text style={[styles.viewText, recView === v.key && { color: colors.bg }]}>{v.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {showRecViews && recView === 'swipe' ? (
          <RecommendSwipe
            entries={notInDeck.slice(0, SWIPE_COUNT)}
            bottomInset={insets.bottom}
            onAdd={(e, card, keepLanguage) => add(e.id, card, keepLanguage)}
          />
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
            {tab === 'combos' ? (
              comboState.status === 'loading' ? (
                <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />
              ) : comboState.status === 'error' || !comboState.data ? (
                <Retry onRetry={() => setAttempt((a) => a + 1)} />
              ) : (
                <>
                  <Section title={`En tu mazo (${comboState.data.included.length})`} icon="puzzle-check-outline">
                    <SectionHelp>
                      Combos que ya tienes completos. Datos de Commander Spellbook: los combos conocidos y en cuántos
                      mazos se juegan.
                    </SectionHelp>
                    {comboState.data.included.length === 0 ? (
                      <Text style={styles.value}>Ningún combo conocido todavía.</Text>
                    ) : (
                      comboState.data.included.map((c) => <ComboView key={c.id} combo={c} images={comboImages} />)
                    )}
                  </Section>

                  <Section title={`Te falta una carta (${comboState.data.almost.length})`} icon="puzzle-plus-outline">
                    <SectionHelp>
                      Combos a los que solo les falta una pieza. La que falta va marcada en amarillo.
                    </SectionHelp>
                    {almostList.length === 0 ? (
                      <Text style={styles.value}>Ninguno.</Text>
                    ) : (
                      almostList.map(({ combo, missing }) => (
                        <ComboView
                          key={combo.id}
                          combo={combo}
                          missing={missing}
                          images={comboImages}
                          onAdd={addByName}
                          added={addedNames}
                          adding={addingName}
                        />
                      ))
                    )}
                    {comboState.data.almost.length > almostShown && (
                      <Pressable style={styles.more} onPress={() => setAlmostShown((n) => n + ALMOST_PAGE)}>
                        <Text style={styles.moreText}>Ver más</Text>
                      </Pressable>
                    )}
                  </Section>
                </>
              )
            ) : !leader ? (
              <Section title="Recomendadas" icon="star-outline">
                <Text style={styles.value}>
                  {usesCommander
                    ? 'Elige el comandante del mazo (👑 en su carta) para ver qué cartas se juegan con él.'
                    : 'Las recomendaciones salen de los mazos de Commander de EDHREC: pon el mazo en un formato con comandante y elige uno.'}
                </Text>
              </Section>
            ) : recState.status === 'loading' ? (
              <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />
            ) : recState.status === 'error' ? (
              <Retry onRetry={() => setAttempt((a) => a + 1)} />
            ) : !recState.data ? (
              <Section title="Recomendadas" icon="star-outline">
                <Text style={styles.value}>EDHREC no tiene mazos de {leader} como comandante.</Text>
              </Section>
            ) : (
              <Section title={`Para ${leader}`} icon="star-outline">
                <SectionHelp>
                  Las cartas de más sinergia en los {count(recState.data.numDecks)} mazos de EDHREC con este comandante
                  que aún no están en el tuyo. Sinergia = cuánto más aparece en sus mazos que en la media de mazos de
                  sus colores. Pulsa ＋ para añadirla.
                </SectionHelp>
                <SubTitle>Cartas recomendadas</SubTitle>
                {recView === 'gallery' ? (
                  <View style={styles.gallery}>
                    {recommended.map((e) => (
                      <View key={e.id} style={styles.galleryItem}>
                        <View style={styles.galleryImage}>
                          {recImages[e.id] && (
                            <Image
                              source={{ uri: recImages[e.id] }}
                              style={StyleSheet.absoluteFill}
                              contentFit="cover"
                            />
                          )}
                          <View style={styles.galleryAdd}>
                            {added.has(e.id) ? (
                              <MaterialCommunityIcons name="check-circle" size={30} color={colors.add} />
                            ) : adding === e.id ? (
                              <ActivityIndicator color={colors.accent} />
                            ) : (
                              <Pressable
                                onPress={() => add(e.id)}
                                hitSlop={6}
                                style={styles.addButton}
                                accessibilityLabel={`Añadir ${e.name}`}
                              >
                                <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
                              </Pressable>
                            )}
                          </View>
                        </View>
                        <Text style={styles.galleryName} numberOfLines={1}>
                          {e.name}
                        </Text>
                        <Text style={styles.gallerySynergy}>
                          {(e.synergy ?? 0) >= 0 ? '+' : ''}
                          {pct(e.synergy ?? 0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  recommended.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      image={recImages[e.id]}
                      metric="synergy"
                      onPress={() => setBigId(e.id)}
                      right={
                        added.has(e.id) ? (
                          <MaterialCommunityIcons name="check-circle" size={28} color={colors.add} />
                        ) : adding === e.id ? (
                          <ActivityIndicator color={colors.accent} />
                        ) : (
                          <Pressable
                            onPress={() => add(e.id)}
                            hitSlop={6}
                            style={styles.addButton}
                            accessibilityLabel={`Añadir ${e.name}`}
                          >
                            <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
                          </Pressable>
                        )
                      }
                    />
                  ))
                )}
                <Pressable style={styles.more} onPress={() => Linking.openURL(edhrecCommanderUrl(leader))}>
                  <Text style={styles.moreText}>Ver todo en EDHREC ↗</Text>
                </Pressable>
              </Section>
            )}
          </ScrollView>
        )}
        {bigId && <CardBigView id={bigId} onClose={() => setBigId(null)} />}
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Las recomendaciones como una mano de cartas: derecha añade la carta al mazo, izquierda la salta.
 * La lista se fija al abrir esta vista, así que añadir cartas no la rebaraja.
 */
function RecommendSwipe({
  entries,
  bottomInset,
  onAdd,
}: {
  entries: EdhrecEntry[];
  bottomInset: number;
  onAdd: (entry: EdhrecEntry, card: Card, keepLanguage: boolean) => Promise<void>;
}) {
  const [list] = useState(entries);
  const [cards, setCards] = useState<Map<string, Card> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getCardsByIds(list.map((e) => e.id))
      .then((found) => !cancelled && setCards(new Map(found.map((c) => [c.id, c]))))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [list, attempt]);

  const [pos, setPos] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const cardRef = useRef<SwipeCardHandle>(null);

  // Las cartas que Scryfall no pudo encontrar se saltan.
  const deck = cards ? list.filter((e) => cards.has(e.id)) : [];
  const entry = deck[pos];
  const card = entry && cards?.get(entry.id);
  const next = deck[pos + 1] && cards?.get(deck[pos + 1].id);
  // Idiomas elegidos a mano con la pill 🌐, por id de EDHREC.
  const [picked, setPicked] = useState<Record<string, Card>>({});

  const onSwiped = (dir: SwipeDirection) => {
    if (dir === 'right' && entry && card) {
      onAdd(entry, picked[entry.id] ?? card, !!picked[entry.id]).catch(() => {});
      setAddedCount((n) => n + 1);
    }
    setPos((p) => p + 1);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.min(width - 48, height / CARD_RATIO);
    setSize({ width: w, height: w * CARD_RATIO });
  };

  if (failed) return <Retry onRetry={() => (setFailed(false), setAttempt((a) => a + 1))} />;
  if (!cards) return <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />;

  if (!entry || !card) {
    return (
      <View style={{ alignItems: 'center', gap: 12, marginTop: 40, paddingHorizontal: 24 }}>
        <MaterialCommunityIcons name="cards-outline" size={48} color={colors.accent} />
        <Text style={[styles.value, { textAlign: 'center' }]}>
          Has visto las {deck.length} cartas recomendadas. Añadidas: {addedCount}.
        </Text>
        <Pressable style={styles.more} onPress={() => setPos(0)}>
          <Text style={styles.moreText}>Volver a empezar</Text>
        </Pressable>
      </View>
    );
  }

  const shown = picked[entry.id] ?? card;
  const inclusion = entry.potentialDecks ? entry.numDecks / entry.potentialDecks : 0;
  return (
    <View style={{ flex: 1, paddingBottom: bottomInset + 12 }}>
      <View style={styles.swipeInfo}>
        <Text style={styles.swipeCounter}>
          {pos + 1} / {deck.length} · añadidas {addedCount}
        </Text>
        <Text style={styles.small}>
          <Text style={styles.synergy}>
            {(entry.synergy ?? 0) >= 0 ? '+' : ''}
            {pct(entry.synergy ?? 0)} de sinergia
          </Text>
          {' · '}en el {pct(inclusion)} de sus mazos
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <LanguagePill
            card={card}
            lang={shown.lang}
            onPick={(c) => setPicked((prev) => ({ ...prev, [entry.id]: c }))}
          />
          <OwnPill card={shown} />
        </View>
        <InDeckBadge oracleId={shown.oracleId} />
      </View>
      <View style={styles.swipeArea} onLayout={onLayout}>
        {size.width > 0 && (
          <View style={{ width: size.width, height: size.height }}>
            {next?.imageUrl && (
              <Image
                source={{ uri: next.imageUrl }}
                style={[StyleSheet.absoluteFill, { opacity: 0.5, transform: [{ scale: 0.94 }] }]}
                contentFit="contain"
              />
            )}
            <SwipeCard key={shown.id} ref={cardRef} card={shown} showBack={false} onSwiped={onSwiped} />
          </View>
        )}
      </View>
      <View style={styles.swipeButtons}>
        <Pressable
          style={[styles.swipeButton, { borderColor: colors.discard }]}
          onPress={() => cardRef.current?.swipe('left')}
          accessibilityLabel="Descartar"
        >
          <MaterialCommunityIcons name="close" size={30} color={colors.discard} />
        </Pressable>
        <Pressable
          style={[styles.swipeButton, { borderColor: colors.add }]}
          onPress={() => cardRef.current?.swipe('right')}
          accessibilityLabel="Añadir al mazo"
        >
          <MaterialCommunityIcons name="check" size={30} color={colors.add} />
        </Pressable>
      </View>
    </View>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 12, marginTop: 40 }}>
      <Text style={styles.value}>No se pudo cargar. Comprueba la conexión.</Text>
      <Pressable style={styles.more} onPress={onRetry}>
        <Text style={styles.moreText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    height: 52,
    backgroundColor: colors.surface,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginHorizontal: 14,
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
  },
  tabOn: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontWeight: '800' },
  content: { paddingHorizontal: 14, gap: 14 },
  small: { color: colors.textMuted, fontSize: 12 },
  synergy: { color: colors.add, fontWeight: '800' },
  viewSwitch: { flexDirection: 'row', gap: 6, marginHorizontal: 14, marginBottom: 10 },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  viewButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  viewText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryItem: { width: '31.5%', gap: 2 },
  galleryImage: {
    width: '100%',
    aspectRatio: 1 / CARD_RATIO,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  galleryAdd: { position: 'absolute', right: 4, bottom: 4 },
  galleryName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  gallerySynergy: { color: colors.add, fontSize: 11, fontWeight: '800' },
  swipeInfo: { alignItems: 'center', gap: 2, paddingHorizontal: 14 },
  swipeCounter: { color: colors.text, fontWeight: '900' },
  swipeArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  swipeButtons: { flexDirection: 'row', justifyContent: 'center', gap: 40 },
  swipeButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  value: { color: colors.text, fontSize: 15 },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  moreText: { color: colors.text, fontWeight: '700' },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
