import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayName, getAllSets, getCardInLanguage, getCardsByIds, type Card } from '@/api/scryfall';
import { ArtPickerModal } from '@/components/ArtPicker';
import { CardShareSheet } from '@/components/CardShareSheet';
import { CardInfoScreen } from '@/components/cardInfo/CardInfoScreen';
import { OwnPill } from '@/components/collection/OwnButton';
import { LanguagePill } from '@/components/LanguagePicker';
import { CARD_RATIO } from '@/components/SwipeCard';
import { SynergySheet } from '@/components/swipe/SwipeRail';
import { CardTagsSheet, TagChip, useCardTags, useTags } from '@/components/tags/Tags';
import { useAppState } from '@/context/AppState';
import {
  addCardToDeck,
  addCardToMaybe,
  createDeck,
  changeMaybeQuantity,
  changeQuantity,
  getDeckUsage,
  removeCardFromDeck,
} from '@/db/database';
import { useCardDetails } from '@/hooks/useCardDetails';
import { RARITY_ICONS, RARITY_LABELS } from '@/icons';
import { colors, formatEur, formatLabel } from '@/theme';

const LEGAL_LABEL: Record<string, string> = { legal: 'Legal', not_legal: 'No legal', banned: 'Prohibida', restricted: 'Restringida' };
const LEGAL_COLOR: Record<string, string> = { legal: colors.add, not_legal: colors.textMuted, banned: colors.discard, restricted: colors.undo };

/**
 * Una carta de la ficha: todo sobre ella (`card` es la impresión o su id de Scryfall; `onPrinting`
 * conserva un cambio de idioma / arte, si no solo cambia lo que se muestra).
 */
function CardPage({
  card: initial,
  onPrinting,
  exact = false,
  extra,
  onTitle,
}: {
  card: Card | string;
  onPrinting?: (card: Card) => void;
  exact?: boolean;
  extra?: ReactNode;
  /** La página en pantalla le dice a la cabecera el nombre de su carta. */
  onTitle?: (title: string | null) => void;
}) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { prefs, decks, activeDeck, activeCards, activeMaybe, ensureActiveDeck, setActiveDeckId, refresh } = useAppState();
  const [deckPicker, setDeckPicker] = useState<false | 'main' | 'maybe'>(false);
  const initialId = typeof initial === 'string' ? initial : initial.id;
  // La carta cargada para un id, y una impresión elegida aquí (idioma / arte), cada una para la carta a la que pertenece.
  const key = `${initialId}|${prefs.language}|${exact}`;
  const [loaded, setLoaded] = useState<{ key: string; card: Card } | null>(null);
  const [picked, setPicked] = useState<{ key: string; card: Card } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const base = typeof initial !== 'string' ? initial : loaded?.key === key ? loaded.card : null;
  const card = picked?.key === initialId ? picked.card : base;
  // El símbolo de la edición (SVG de Scryfall), mostrado antes de la edición.
  const [setIcon, setSetIcon] = useState<string | null>(null);
  const cardSet = card?.set;
  useEffect(() => {
    let cancelled = false;
    getAllSets()
      .then((sets) => !cancelled && setSetIcon((cardSet && sets[cardSet]?.iconUrl) || null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cardSet]);
  const failed = failedKey === key;
  const [back, setBack] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [modal, setModal] = useState<'art' | 'share' | 'info' | 'tags' | 'synergy' | null>(null);
  const [usage, setUsage] = useState<{ deckName: string; quantity: number }[]>([]);
  const [note, setNote] = useState<string | null>(null);

  // Carga la carta cuando solo se conoce su id (en el idioma preferido salvo que sea `exact`).
  useEffect(() => {
    if (typeof initial !== 'string') return;
    let cancelled = false;
    (async () => {
      const [base] = await getCardsByIds([initial]);
      if (!base) throw new Error('not found');
      const shown =
        exact || prefs.language === 'en' || base.lang === prefs.language
          ? base
          : ((await getCardInLanguage(base, prefs.language).catch(() => null)) ?? base);
      if (!cancelled) setLoaded({ key, card: shown });
    })().catch(() => !cancelled && setFailedKey(key));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const oracleId = card?.oracleId;
  useEffect(() => {
    if (!oracleId) return;
    let cancelled = false;
    getDeckUsage(db)
      .then((rows) => !cancelled && setUsage(rows.filter((r) => r.oracleId === oracleId)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, oracleId, activeCards]);

  const details = useCardDetails(card ? [card.id] : [])[card?.id ?? ''];
  const allTags = useTags();
  const tags = (useCardTags(oracleId ? [oracleId] : [])[oracleId ?? ''] ?? [])
    .map((u) => allTags.find((t) => t.uid === u))
    .filter((t) => !!t);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? null : n)), 2200);
  };
  const main = card ? (activeCards.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
  const maybe = card ? (activeMaybe.find((c) => c.oracleId === card.oracleId)?.quantity ?? 0) : 0;
  const addMain = async () => {
    if (!card) return;
    const deck = await ensureActiveDeck();
    const q = await addCardToDeck(db, deck.id, card);
    await refresh(deck.id);
    flash(`＋1 en «${deck.name}» (${q})`);
  };
  const subMain = async () => {
    if (!card || !activeDeck || main === 0) return;
    if (main <= 1) await removeCardFromDeck(db, activeDeck.id, card.oracleId);
    else await changeQuantity(db, activeDeck.id, card.oracleId, -1);
    await refresh(activeDeck.id);
    flash(`−1 de «${activeDeck.name}» (${main - 1})`);
  };
  const addMaybe = async () => {
    if (!card) return;
    const deck = await ensureActiveDeck();
    await addCardToMaybe(db, deck.id, card);
    await refresh(deck.id);
    flash('Apartada en Posibles');
  };
  const subMaybe = async () => {
    if (!card || !activeDeck || maybe === 0) return;
    await changeMaybeQuantity(db, activeDeck.id, card.oracleId, -1);
    await refresh(activeDeck.id);
  };
  // Añade una copia a un mazo elegido (principal o «Posibles») sin salir de la ficha; si no es el
  // mazo activo, pregunta si cambiar a él.
  const addTo = async (id: number, name: string, where: 'main' | 'maybe') => {
    if (!card) return;
    if (where === 'main') await addCardToDeck(db, id, card);
    else await addCardToMaybe(db, id, card);
    await refresh(activeDeck?.id ?? id);
    flash(where === 'maybe' ? `＋1 en Posibles de «${name}»` : `＋1 en «${name}»`);
    if (activeDeck?.id !== id) {
      Alert.alert('Mazo activo', `¿Poner «${name}» como mazo activo?`, [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Sí', onPress: () => setActiveDeckId(id) },
      ]);
    }
  };
  const pick = (c: Card) => {
    setPicked({ key: initialId, card: c });
    setBack(false);
    onPrinting?.(c);
  };

  const stat = details?.power != null
    ? { label: 'Fuerza / Res.', value: `${details.power}/${details.toughness}` }
    : details?.loyalty != null
      ? { label: 'Lealtad', value: details.loyalty }
      : details?.defense != null
        ? { label: 'Defensa', value: details.defense }
        : null;
  const image = card ? (back && card.backImageUrl) || card.imageUrl : null;
  const format = activeDeck?.format;

  const title = card ? displayName(card) : null;
  useEffect(() => {
    onTitle?.(title);
  }, [title, onTitle]);

  return (
    <View style={{ flex: 1 }}>
        {failed ? (
          <Text style={[styles.muted, { padding: 24, textAlign: 'center' }]}>No se pudo cargar la carta: comprueba la conexión.</Text>
        ) : !card ? (
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
            {/* Tags of the card (when it's yours or wanted it can have them) and the button to change them. */}
            <View style={[styles.wrap, { marginTop: 6 }]}>
              {prefs.showTags !== false && tags.map((t) => <TagChip key={t.uid} tag={t} small />)}
              <Pressable style={styles.smallBtn} onPress={() => setModal('tags')} hitSlop={6} accessibilityLabel="Etiquetas de la carta">
                <MaterialCommunityIcons name="tag-outline" size={13} color={colors.textMuted} />
                <Text style={styles.smallBtnText}>{tags.length ? 'Cambiar' : 'Etiquetas'}</Text>
              </Pressable>
            </View>

            <View style={styles.imageWrap}>
              <Pressable onPress={() => setZoom(true)} accessibilityLabel="Ver la carta en grande">
                {image && (
                  <Image
                    source={{ uri: image.replace('/normal/', '/large/') }}
                    placeholder={{ uri: image }}
                    placeholderContentFit="contain"
                    style={styles.image}
                    contentFit="contain"
                    transition={120}
                  />
                )}
              </Pressable>
              {card.backImageUrl && (
                <Pressable style={styles.flip} onPress={() => setBack((b) => !b)} accessibilityLabel="Ver la otra cara">
                  <MaterialCommunityIcons name="rotate-3d-variant" size={22} color={colors.text} />
                </Pressable>
              )}
            </View>

            {/* Language, other arts, shops, share — one line. */}
            <View style={styles.pillRow}>
              <LanguagePill card={card} lang={card.lang} onPick={pick} compact />
              <Pill icon="image-multiple-outline" onPress={() => setModal('art')} />
              {details?.cardmarketUrl && <Pill icon="cart-outline" color={colors.undo} onPress={() => Linking.openURL(details.cardmarketUrl!)} />}
              <Pill icon="share-variant" onPress={() => setModal('share')} />
            </View>

            {/* Edition in one line: the set symbol + edition, then the rarity symbol + its name. */}
            <View style={styles.editionRow}>
              {setIcon ? <Image source={{ uri: setIcon }} style={styles.editionIcon} contentFit="contain" tintColor={colors.textMuted} /> : null}
              <Text style={[styles.muted, { flexShrink: 1 }]} numberOfLines={1}>
                {card.setName ?? card.set.toUpperCase()} · {card.set.toUpperCase()}
                {card.collectorNumber ? ` #${card.collectorNumber}` : ''}
                {card.releasedAt ? ` · ${card.releasedAt.slice(0, 4)}` : ''} ·{' '}
              </Text>
              {RARITY_ICONS[card.rarity as keyof typeof RARITY_ICONS] ? (
                <Image source={RARITY_ICONS[card.rarity as keyof typeof RARITY_ICONS]} style={styles.editionIcon} contentFit="contain" />
              ) : null}
              <Text style={styles.muted}>{RARITY_LABELS[card.rarity] ?? card.rarity}</Text>
            </View>

            {/* Collection. */}
            <View style={styles.wrap}>
              <OwnPill card={card} />
            </View>

            {/* The active deck and «Posibles». */}
            <View style={{ gap: 8 }}>
              <StepButton
                label={activeDeck ? `Al mazo «${activeDeck.name}»` : 'Añadir al mazo'}
                icon="cards-playing-outline"
                color={colors.accent}
                count={main}
                onAdd={addMain}
                onSub={subMain}
                onPickDeck={() => setDeckPicker('main')}
              />
              <StepButton label="A Posibles" icon="help-circle-outline" color={colors.info} count={maybe} onAdd={addMaybe} onSub={subMaybe} onPickDeck={() => setDeckPicker('maybe')} />
              {note && <Text style={styles.note}>{note}</Text>}
            </View>

            {extra}

            {/* Which of your decks have it. */}
            {usage.length > 0 && (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>En tus mazos</Text>
                <View style={styles.wrap}>
                  {usage.map((u) => (
                    <View key={u.deckName} style={styles.deckChip}>
                      <MaterialCommunityIcons name="cards-playing-outline" size={13} color={colors.accent} />
                      <Text style={styles.deckChipText} numberOfLines={1}>
                        {u.deckName}
                      </Text>
                      <Text style={styles.deckChipCount}>{u.quantity}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.wrap}>
              {stat && <Tile label={stat.label} value={stat.value} />}
              <Tile label="Valor de maná" value={String(card.cmc)} />
              {prefs.pricesCardInfo && <Tile label="Precio" value={details?.eur != null ? formatEur(details.eur) : '—'} color={colors.accent} />}
              {format && (
                <Tile
                  label={formatLabel(format)}
                  value={LEGAL_LABEL[card.legalities[format] ?? 'not_legal'] ?? '—'}
                  color={LEGAL_COLOR[card.legalities[format] ?? 'not_legal']}
                />
              )}
            </View>

            <Pressable style={styles.infoBtn} onPress={() => setModal('synergy')} accessibilityLabel="Sinergias y combos">
              <MaterialCommunityIcons name="puzzle-outline" size={20} color={colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoText]}>Sinergias y combos</Text>
                <Text style={styles.muted}>Cartas que combinan con esta</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
            <Pressable style={styles.infoBtn} onPress={() => setModal('info')} accessibilityLabel="Ficha completa">
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoText]}>Ficha completa</Text>
                <Text style={styles.muted}>Todos los datos, legalidad, sinergias y combos</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          </ScrollView>
        )}

        {/* The image alone, as big as the screen. */}
        {zoom && image && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setZoom(false)} statusBarTranslucent>
            <Pressable style={styles.zoom} onPress={() => setZoom(false)}>
              <Image source={{ uri: image.replace('/normal/', '/large/') }} style={styles.zoomImage} contentFit="contain" />
            </Pressable>
          </Modal>
        )}
        {card && modal === 'art' && (
          <ArtPickerModal
            card={card}
            onClose={() => setModal(null)}
            onPick={(c) => {
              setModal(null);
              pick(c);
            }}
          />
        )}
        {card && modal === 'share' && (
          <CardShareSheet card={{ scryfallId: card.id, name: displayName(card), imageUrl: card.imageUrl }} onClose={() => setModal(null)} />
        )}
        {card && modal === 'info' && <CardInfoScreen id={card.id} onClose={() => setModal(null)} />}
        <SynergySheet card={card && modal === 'synergy' ? card : null} onClose={() => setModal(null)} />
        <CardTagsSheet oracleId={card && modal === 'tags' ? card.oracleId : null} name={card ? displayName(card) : undefined} onClose={() => setModal(null)} />

        {/* Choose which deck «Al mazo» / «A Posibles» target (the chosen deck becomes active). */}
        {deckPicker && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setDeckPicker(false)} statusBarTranslucent>
            <Pressable style={styles.pickBackdrop} onPress={() => setDeckPicker(false)}>
              <Pressable style={styles.pickBox} onPress={() => {}}>
                <Text style={styles.pickTitle}>{deckPicker === 'maybe' ? 'Posibles de qué mazo' : 'Añadir a qué mazo'}</Text>
                <ScrollView contentContainerStyle={{ gap: 4 }}>
                  {decks.map((d) => (
                    <Pressable
                      key={d.id}
                      style={[styles.pickOption, activeDeck?.id === d.id && styles.pickOptionOn]}
                      onPress={() => {
                        const where = deckPicker === 'maybe' ? 'maybe' : 'main';
                        setDeckPicker(false);
                        addTo(d.id, d.name, where);
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🃏</Text>
                      <Text style={styles.pickName} numberOfLines={1}>
                        {d.name}
                      </Text>
                      {activeDeck?.id === d.id && <MaterialCommunityIcons name="check" size={18} color={colors.accent} />}
                    </Pressable>
                  ))}
                  <Pressable
                    style={styles.pickOption}
                    onPress={async () => {
                      const where = deckPicker === 'maybe' ? 'maybe' : 'main';
                      const id = await createDeck(db, 'Mazo nuevo', null);
                      setDeckPicker(false);
                      if (card) {
                        if (where === 'main') await addCardToDeck(db, id, card);
                        else await addCardToMaybe(db, id, card);
                      }
                      setActiveDeckId(id);
                      await refresh(id);
                      flash(where === 'maybe' ? '＋1 en Posibles del mazo nuevo (activo)' : '＋1 en el mazo nuevo (activo)');
                    }}
                  >
                    <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
                    <Text style={[styles.pickName, { color: colors.accent }]}>Mazo nuevo</Text>
                  </Pressable>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        )}
    </View>
  );
}

/**
 * La carta ampliada, a pantalla completa (como la ficha de carta del PC): cabecera con sus etiquetas, la
 * imagen grande (tocar para verla sola; ⟲ gira las cartas de doble cara), idioma / otras artes / Cardmarket /
 * compartir, el nombre y la impresión, «La tengo» / «La quiero», el mazo activo y «Posibles» con − / ＋, cuáles
 * de tus mazos la tienen, su texto, datos y legalidad, y «Ficha completa». Con `nav.cardAt`, arrastrar a los
 * lados pasa por la lista: la siguiente (o anterior) carta entra bajo el dedo con todos sus datos, y se asienta
 * al soltar pasado un tercio de la pantalla (o con un golpe seco).
 */
export function CardSheet({
  card,
  onClose,
  onPrinting,
  exact = false,
  subtitle,
  tint,
  extra,
  nav,
}: {
  card: Card | string;
  onClose: () => void;
  onPrinting?: (card: Card) => void;
  /** Muestra esta impresión tal cual (si no, en el idioma preferido cuando se da el id). */
  exact?: boolean;
  /** Desde dónde se abrió (se muestra en la cabecera). */
  subtitle?: string;
  /** Un código de color sutil para la cabecera (mazo = colors.deck, colección = colors.collection…). */
  tint?: string;
  /** Más cosas para esta carta (los botones del mazo y la validación). */
  extra?: ReactNode;
  /** ‹ › por la lista desde la que se abrió; `cardAt` da los vecinos para el swipe. */
  nav?: { index: number; total: number; onMove: (step: number) => void; cardAt?: (index: number) => Card | string | null | undefined };
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState<string | null>(null);
  const index = nav?.index ?? 0;
  const prev = nav?.cardAt && index > 0 ? nav.cardAt(index - 1) : null;
  const next = nav?.cardAt && nav && index < nav.total - 1 ? nav.cardAt(index + 1) : null;
  const keyOf = (c: Card | string) => (typeof c === 'string' ? c : c.id);

  // La fila de páginas está en -index × width; arrastrar la mueve desde ahí.
  const x = useSharedValue(-index * width);
  const start = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(-index * width, { duration: 160, easing: Easing.out(Easing.cubic) }));
  }, [index, width, x]);
  const move = (step: number) => nav?.onMove(step);
  const hasPrev = !!prev;
  const hasNext = !!next;
  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onActivate: () => {
      start.set(x.get());
    },
    onUpdate: (e) => {
      let dx = e.translationX;
      // Nada por ese lado: solo cede un poco.
      if ((dx > 0 && !hasPrev) || (dx < 0 && !hasNext)) dx *= 0.2;
      x.set(start.get() + dx);
    },
    onDeactivate: (e) => {
      const projected = e.translationX + e.velocityX * 0.2;
      const base = -index * width;
      if (!e.canceled && projected < -width / 3 && hasNext) {
        x.set(withTiming(base - width, { duration: 180, easing: Easing.out(Easing.cubic) }, (done) => done && scheduleOnRN(move, 1)));
      } else if (!e.canceled && projected > width / 3 && hasPrev) {
        x.set(withTiming(base + width, { duration: 180, easing: Easing.out(Easing.cubic) }, (done) => done && scheduleOnRN(move, -1)));
      } else {
        x.set(withSpring(base, { damping: 22, stiffness: 220, overshootClamping: true }));
      }
    },
  });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  // Cada página mantiene su key (su carta) cuando pasa del lado al centro: ya cargada.
  const pages = [
    prev ? { card: prev, at: index - 1 } : null,
    { card, at: index },
    next ? { card: next, at: index + 1 } : null,
  ].filter((p): p is { card: Card | string; at: number } => !!p);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header: close, where it comes from, ‹ n / total ›. */}
        <View style={[styles.head, tint ? { backgroundColor: tint + '22', borderColor: tint } : null]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn} accessibilityLabel="Cerrar">
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headTitle} numberOfLines={1}>
              {title ?? 'Carta'}
            </Text>
            {!!subtitle && (
              <Text style={styles.headSub} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {nav && nav.total > 1 && (
            <View style={styles.navRow}>
              <Pressable
                onPress={() => nav.onMove(-1)}
                disabled={nav.index === 0}
                hitSlop={8}
                style={[styles.headBtn, nav.index === 0 && { opacity: 0.3 }]}
                accessibilityLabel="Carta anterior"
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
              </Pressable>
              <Text style={styles.headSub}>
                {nav.index + 1} / {nav.total}
              </Text>
              <Pressable
                onPress={() => nav.onMove(1)}
                disabled={nav.index >= nav.total - 1}
                hitSlop={8}
                style={[styles.headBtn, nav.index >= nav.total - 1 && { opacity: 0.3 }]}
                accessibilityLabel="Carta siguiente"
              >
                <MaterialCommunityIcons name="chevron-right" size={26} color={colors.text} />
              </Pressable>
            </View>
          )}
        </View>

        <GestureDetector gesture={swipe}>
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View style={[StyleSheet.absoluteFill, rowStyle]}>
              {pages.map((pg) => (
                <View key={keyOf(pg.card)} style={{ position: 'absolute', top: 0, bottom: 0, left: pg.at * width, width }}>
                  <CardPage
                    card={pg.card}
                    exact={exact}
                    onPrinting={pg.at === index ? onPrinting : undefined}
                    extra={pg.at === index ? extra : undefined}
                    onTitle={pg.at === index ? setTitle : undefined}
                  />
                </View>
              ))}
            </Animated.View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

type Glyph = keyof typeof MaterialCommunityIcons.glyphMap;

function Pill({ icon, label, color, onPress }: { icon: Glyph; label?: string; color?: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]} onPress={onPress} accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={16} color={color ?? colors.text} />
      {label ? <Text style={[styles.pillText, color ? { color } : null]}>{label}</Text> : null}
    </Pressable>
  );
}

/** «− | ＋ Etiqueta N»: una copia menos / más. */
function StepButton({
  label,
  icon,
  color,
  count,
  onAdd,
  onSub,
  onPickDeck,
}: {
  label: string;
  icon: Glyph;
  color: string;
  count: number;
  onAdd: () => void;
  onSub: () => void;
  /** Abre un selector de mazo (el mazo elegido pasa a ser el activo). */
  onPickDeck?: () => void;
}) {
  return (
    <View style={[styles.step, { borderColor: color }]}>
      <Pressable
        style={({ pressed }) => [styles.stepMinus, { borderColor: color }, pressed && { backgroundColor: color + '33' }, count === 0 && { opacity: 0.35 }]}
        onPress={onSub}
        disabled={count === 0}
        accessibilityLabel={`Quitar una copia: ${label}`}
      >
        <MaterialCommunityIcons name="minus" size={20} color={color} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.stepPlus, pressed && { backgroundColor: color + '33' }]}
        onPress={onAdd}
        accessibilityLabel={`Añadir una copia: ${label}`}
      >
        <MaterialCommunityIcons name="plus" size={18} color={color} />
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <Text style={[styles.stepText, { color }]} numberOfLines={1}>
          {label}
        </Text>
        {count > 0 && (
          <View style={[styles.stepCount, { backgroundColor: color }]}>
            <Text style={styles.stepCountText}>{count}</Text>
          </View>
        )}
      </Pressable>
      {onPickDeck && (
        <Pressable
          style={({ pressed }) => [styles.stepPick, { borderColor: color }, pressed && { backgroundColor: color + '33' }]}
          onPress={onPickDeck}
          accessibilityLabel="Elegir otro mazo"
        >
          <MaterialCommunityIcons name="chevron-down" size={20} color={color} />
        </Pressable>
      )}
    </View>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tileValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'nowrap' },
  editionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editionIcon: { width: 16, height: 16 },
  stepPick: { width: 40, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1.5 },
  pickBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 28 },
  pickBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, maxHeight: '70%', borderWidth: 1, borderColor: colors.border },
  pickTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  pickOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10 },
  pickOptionOn: { backgroundColor: colors.surfaceAlt },
  pickName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  headSub: { color: colors.textMuted, fontSize: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  body: { padding: 16, gap: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  imageWrap: { alignSelf: 'center', width: '82%', maxWidth: 380 },
  image: { width: '100%', aspectRatio: 1 / CARD_RATIO, borderRadius: 16 },
  flip: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900' },
  type: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12.5 },
  step: { flexDirection: 'row', height: 46, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden' },
  stepMinus: { width: 52, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1.5 },
  stepPlus: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  stepText: { fontWeight: '900', fontSize: 15, flexShrink: 1 },
  stepCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  stepCountText: { color: colors.bg, fontWeight: '900', fontSize: 12 },
  note: { color: colors.add, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  block: { gap: 6 },
  blockTitle: { color: colors.accent, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  deckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  deckChipText: { color: colors.text, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  deckChipCount: { color: colors.accent, fontWeight: '900', fontSize: 13 },
  textBox: { padding: 12, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  tile: {
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileLabel: { color: colors.textMuted, fontSize: 11 },
  tileValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.info,
    backgroundColor: colors.surface,
  },
  infoText: { color: colors.info, fontWeight: '900', fontSize: 15 },
  zoom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  zoomImage: { width: '100%', aspectRatio: 1 / CARD_RATIO },
});
