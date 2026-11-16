import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { getCardInLanguage, getCardsByNames, type Card } from '@/api/scryfall';
import { mainType, TYPE_GROUP_LABELS } from '@/collection/organize';
import { Section, SectionHelp } from '@/components/cardInfo/Section';
import { LanguagePill } from '@/components/LanguagePicker';
import { CARD_RATIO } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import {
  addCardToDeck,
  changeQuantity,
  restoreSnapshot,
  snapshotDeck,
  type DeckCard,
  type DeckSnapshot,
} from '@/db/database';
import {
  BASIC_COLORS,
  BASIC_NAMES,
  buildLibrary,
  recommendLands,
  type LandPlan,
  CURVE_MAX,
  deckStats,
  landOdds,
  MANA_COLORS,
  shuffle,
  type DeckStats,
  type LibraryCard,
  type ManaColor,
} from '@/deck/stats';
import { MANA_ICONS } from '@/icons';
import { colors } from '@/theme';
import { commanderDeckSize } from '@/validation';

type Tab = 'stats' | 'hand';

const COLOR_NAMES: Record<ManaColor, string> = {
  W: 'Blanco',
  U: 'Azul',
  B: 'Negro',
  R: 'Rojo',
  G: 'Verde',
  C: 'Incoloro',
};
/** Bar colors: the usual Magic colors, readable on the dark surface. Each row also has its icon + name. */
const BAR_COLORS: Record<ManaColor, string> = {
  W: '#e8dcae',
  U: '#4a95dc',
  B: '#8c7a9e',
  R: '#e0563f',
  G: '#3fa860',
  C: '#b8b0c4',
};
const CREATURE_COLOR = colors.accent;
const OTHER_COLOR = '#7b8fe0';

const fmt = (n: number, digits = 0) => n.toFixed(digits).replace('.', ',');
const pctText = (n: number) => `${Math.round(n * 100)} %`;

/** Full-screen analysis of the active deck: statistics (curve, colors, types) and a sample hand. */
export function DeckStatsScreen({
  cards,
  usesCommander,
  onClose,
}: {
  cards: DeckCard[];
  usesCommander: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('stats');
  const stats = useMemo(() => deckStats(cards), [cards]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver" style={styles.headerButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Análisis del mazo</Text>
        </View>

        <View style={styles.tabs}>
          {(
            [
              { key: 'stats', label: 'Estadísticas', icon: 'chart-bar' },
              { key: 'hand', label: 'Mano de prueba', icon: 'hand-back-left-outline' },
            ] as const
          ).map((t) => (
            <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
              <MaterialCommunityIcons name={t.icon} size={18} color={tab === t.key ? colors.bg : colors.textMuted} />
              <Text style={[styles.tabText, tab === t.key && { color: colors.bg }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'stats' ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
            <StatsView stats={stats}>
              <LandRecommender cards={cards} stats={stats} usesCommander={usesCommander} />
            </StatsView>
          </ScrollView>
        ) : (
          <SampleHand cards={cards} usesCommander={usesCommander} bottomInset={insets.bottom} />
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- Statistics

function StatsView({ stats, children }: { stats: DeckStats; children: ReactNode }) {
  const [lo, hi] = stats.landRange;
  const landsOk = stats.lands >= lo && stats.lands <= hi;
  const curveMax = Math.max(1, ...stats.curve.map((c) => c.creatures + c.others));
  const symbolTotal = MANA_COLORS.reduce((s, c) => s + stats.symbols[c], 0);
  const shownColors = MANA_COLORS.filter((c) => stats.symbols[c] > 0 || stats.sources[c] > 0);
  const typeMax = Math.max(1, ...stats.types.map((t) => t.count));

  return (
    <>
      <View style={styles.tiles}>
        <Tile value={String(stats.total)} label="cartas" />
        <Tile value={String(stats.lands)} label="tierras" />
        <Tile value={fmt(stats.averageCost, 2)} label="coste medio" />
      </View>

      {stats.total > 0 && (
        <View style={[styles.advice, !landsOk && styles.adviceWarn]}>
          <MaterialCommunityIcons
            name={landsOk ? 'check-circle-outline' : 'alert-outline'}
            size={20}
            color={landsOk ? colors.add : colors.undo}
          />
          <Text style={styles.adviceText}>
            {stats.lands < lo
              ? `Pocas tierras: con ${stats.total} cartas se suelen jugar entre ${lo} y ${hi}.`
              : stats.lands > hi
                ? `Muchas tierras: con ${stats.total} cartas se suelen jugar entre ${lo} y ${hi}.`
                : `Buen número de tierras (lo habitual con ${stats.total} cartas es ${lo}-${hi}).`}
            {stats.averageCost < 2.5 && stats.lands < lo ? ' Con una curva baja como la tuya puede bastar.' : ''}
          </Text>
        </View>
      )}

      {stats.total > 0 && children}

      <Section title="Curva de maná" icon="chart-bar">
        <SectionHelp>
          Cada columna es un coste de maná (el número de abajo: 1, 2, 3…). El número de arriba y la altura de la barra
          dicen cuántas cartas de tu mazo cuestan eso; dentro, la parte amarilla son criaturas y la azul otros hechizos,
          cada una con su número. Las tierras no cuentan. Lo ideal es tener muchas cartas baratas (2-3) y pocas caras,
          para poder jugar algo cada turno.
        </SectionHelp>
        <View style={styles.legend}>
          <Swatch color={CREATURE_COLOR} label="Criaturas" />
          <Swatch color={OTHER_COLOR} label="Otros hechizos" />
        </View>
        <View style={styles.curve}>
          {stats.curve.map((c, i) => {
            const total = c.creatures + c.others;
            return (
              <View
                key={i}
                style={styles.curveColumn}
                accessible
                accessibilityLabel={`Coste ${i}${i === CURVE_MAX ? ' o más' : ''}: ${total} cartas, ${c.creatures} criaturas`}
              >
                <Text style={styles.curveCount}>{total || ''}</Text>
                <View style={styles.curveBarArea}>
                  {c.others > 0 && (
                    <View
                      style={[
                        styles.curveSegment,
                        styles.curveTop,
                        { height: `${(c.others / curveMax) * 100}%`, backgroundColor: OTHER_COLOR },
                      ]}
                    >
                      <Text style={styles.segmentCount}>{c.others}</Text>
                    </View>
                  )}
                  {c.creatures > 0 && (
                    <View
                      style={[
                        styles.curveSegment,
                        c.others === 0 && styles.curveTop,
                        { height: `${(c.creatures / curveMax) * 100}%`, backgroundColor: CREATURE_COLOR },
                      ]}
                    >
                      <Text style={styles.segmentCount}>{c.creatures}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.curveLabel}>{i === CURVE_MAX ? `${CURVE_MAX}+` : i}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.axisCaption}>Coste de maná →</Text>
      </Section>

      <Section title="Colores" icon="palette-outline">
        <SectionHelp>
          Barra: qué parte de los símbolos de maná de los costes es de cada color. A la derecha, cuántas tierras pueden
          dar ese color. Los colores con muchos símbolos necesitan muchas tierras que los den.
        </SectionHelp>
        {shownColors.length === 0 ? (
          <Text style={styles.value}>Sin cartas con color.</Text>
        ) : (
          shownColors.map((c) => {
            const share = symbolTotal ? stats.symbols[c] / symbolTotal : 0;
            return (
              <View key={c} style={styles.barRow}>
                <ColorIcon color={c} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.barLabels}>
                    <Text style={styles.barName}>{COLOR_NAMES[c]}</Text>
                    <Text style={styles.barValue}>
                      {stats.symbols[c]} símbolos · {pctText(share)}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: BAR_COLORS[c] }]} />
                  </View>
                </View>
                <View style={styles.sources}>
                  <Text style={styles.sourcesValue}>{stats.sources[c]}</Text>
                  <Text style={styles.sourcesLabel}>tierras</Text>
                </View>
              </View>
            );
          })
        )}
      </Section>

      <Section title="Tipos" icon="shape-outline">
        <SectionHelp>Copias de cada tipo de carta. Una criatura-tierra cuenta como criatura.</SectionHelp>
        {stats.types.map((t) => (
          <View key={t.type} style={styles.barRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.barLabels}>
                <Text style={styles.barName}>{TYPE_GROUP_LABELS[t.type]}</Text>
                <Text style={styles.barValue}>
                  {t.count} · {pctText(stats.total ? t.count / stats.total : 0)}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${(t.count / typeMax) * 100}%`, backgroundColor: colors.accent }]}
                />
              </View>
            </View>
          </View>
        ))}
      </Section>
    </>
  );
}

const BASIC_LABELS: Record<(typeof BASIC_COLORS)[number], string> = {
  W: 'Llanura',
  U: 'Isla',
  B: 'Pantano',
  R: 'Montaña',
  G: 'Bosque',
};

type LandStep =
  | { kind: 'idle' }
  | { kind: 'confirm'; plan: LandPlan }
  | { kind: 'adding' }
  | { kind: 'done'; count: number; snapshot: DeckSnapshot }
  | { kind: 'error' };

/**
 * "Recomendar maná" (like Arena): adds the basic lands the deck is missing, in the preferred
 * language, split by colors so each color gets sources in proportion to its mana symbols.
 */
function LandRecommender({
  cards,
  stats,
  usesCommander,
}: {
  cards: DeckCard[];
  stats: DeckStats;
  usesCommander: boolean;
}) {
  const db = useSQLiteContext();
  const { activeDeck, refresh, prefs } = useAppState();
  const [step, setStep] = useState<LandStep>({ kind: 'idle' });

  const deckSize = usesCommander ? commanderDeckSize(activeDeck?.format ?? null) : null;
  const leaders = cards.filter((c) => usesCommander && c.isCommander && c.colorIdentity !== null);
  const identity = leaders.length ? leaders.map((c) => c.colorIdentity).join('') : null;
  const plan = recommendLands(stats, deckSize, identity, activeDeck?.format === 'limited');

  const add = async (p: LandPlan) => {
    if (!activeDeck) return;
    setStep({ kind: 'adding' });
    try {
      const snapshot = await snapshotDeck(db, activeDeck.id);
      const colorsToAdd = BASIC_COLORS.filter((c) => p.add[c] > 0);
      const found = await getCardsByNames(colorsToAdd.map((c) => BASIC_NAMES[c]));
      for (const color of colorsToAdd) {
        const english = found.find((card) => card.name === BASIC_NAMES[color]);
        if (!english) continue;
        const card =
          prefs.language !== 'en'
            ? ((await getCardInLanguage(english, prefs.language).catch(() => null)) ?? english)
            : english;
        await addCardToDeck(db, activeDeck.id, card);
        if (p.add[color] > 1) await changeQuantity(db, activeDeck.id, card.oracleId, p.add[color] - 1);
      }
      await refresh();
      setStep({ kind: 'done', count: p.count, snapshot });
    } catch {
      setStep({ kind: 'error' });
    }
  };

  // Back to exactly the cards before adding (the basics may have merged into existing rows).
  const undo = async (snapshot: DeckSnapshot) => {
    if (!activeDeck) return;
    await db.runAsync('DELETE FROM deck_cards WHERE deck_id = ?', activeDeck.id);
    await restoreSnapshot(db, snapshot);
    await refresh();
    setStep({ kind: 'idle' });
  };

  if (step.kind === 'adding') {
    return (
      <View style={styles.landBox}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.adviceText}>Añadiendo tierras…</Text>
      </View>
    );
  }
  if (step.kind === 'done') {
    return (
      <View style={styles.landBox}>
        <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.add} />
        <Text style={styles.adviceText}>Añadidas {step.count} tierras básicas.</Text>
        <Pressable style={styles.landSmallButton} onPress={() => undo(step.snapshot)}>
          <MaterialCommunityIcons name="undo-variant" size={18} color={colors.text} />
          <Text style={styles.landSmallText}>Deshacer</Text>
        </Pressable>
      </View>
    );
  }
  if (step.kind === 'confirm') {
    return (
      <View style={[styles.landBox, styles.landColumn]}>
        <Text style={styles.adviceText}>
          Se añadirán {step.plan.count} tierras básicas, hasta tener {stats.lands + step.plan.count}:
        </Text>
        <View style={styles.landPlan}>
          {BASIC_COLORS.filter((c) => step.plan.add[c] > 0).map((c) => (
            <View key={c} style={styles.landPlanItem}>
              <Image source={MANA_ICONS[c]} style={styles.landPlanIcon} contentFit="contain" />
              <Text style={styles.barName}>
                {step.plan.add[c]} {BASIC_LABELS[c]}
              </Text>
            </View>
          ))}
        </View>
        {deckSize !== null && stats.total + step.plan.count > deckSize && (
          <Text style={styles.small}>
            El mazo pasará de {deckSize} cartas ({stats.total + step.plan.count}): tendrás que quitar hechizos.
          </Text>
        )}
        <View style={styles.landButtons}>
          <Pressable style={[styles.landButton, { flex: 1 }]} onPress={() => setStep({ kind: 'idle' })}>
            <Text style={styles.landButtonText}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.landButton, styles.landButtonPrimary, { flex: 1 }]} onPress={() => add(step.plan)}>
            <Text style={[styles.landButtonText, { color: colors.bg }]}>Añadir</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const reason =
    plan.needed === 0
      ? `Ya tienes tierras suficientes (${stats.lands}; lo recomendado son unas ${plan.target}).`
      : plan.count === 0
        ? 'El mazo no tiene símbolos de color: no se pueden recomendar tierras básicas.'
        : null;

  return (
    <View style={[styles.landBox, styles.landColumn]}>
      <Pressable
        style={({ pressed }) => [
          styles.landButton,
          styles.landButtonPrimary,
          (pressed || !!reason) && { opacity: reason ? 0.4 : 0.7 },
        ]}
        disabled={!!reason}
        onPress={() => setStep({ kind: 'confirm', plan })}
      >
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.bg} />
        <Text style={[styles.landButtonText, { color: colors.bg }]}>Recomendar maná</Text>
      </Pressable>
      <Text style={styles.small}>
        {step.kind === 'error'
          ? 'No se pudieron añadir las tierras. Comprueba la conexión e inténtalo otra vez.'
          : (reason ??
            `Añade las ${plan.count} tierras básicas que faltan, repartidas según los símbolos de maná de cada color y las tierras que ya los dan.`)}
      </Text>
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

function ColorIcon({ color }: { color: ManaColor }) {
  if (color === 'C') {
    return (
      <View style={[styles.manaIcon, styles.colorless]}>
        <Text style={styles.colorlessText}>C</Text>
      </View>
    );
  }
  return <Image source={MANA_ICONS[color]} style={styles.manaIcon} contentFit="contain" />;
}

// ---------------------------------------------------------------- Sample hand

interface Game {
  /** Shuffled library; the hand is the first `drawn` cards. */
  order: LibraryCard[];
  drawn: number;
  mulligans: number;
  /** Keys of the hand cards chosen to go to the bottom (London mulligan). */
  bottom: string[];
}

const HAND_SIZE = 7;
const deal = (library: LibraryCard[], mulligans: number): Game => ({
  order: shuffle(library),
  drawn: Math.min(HAND_SIZE, library.length),
  mulligans,
  bottom: [],
});

function SampleHand({
  cards,
  usesCommander,
  bottomInset,
}: {
  cards: DeckCard[];
  usesCommander: boolean;
  bottomInset: number;
}) {
  const library = useMemo(() => buildLibrary(cards, usesCommander), [cards, usesCommander]);
  const [game, setGame] = useState<Game>(() => deal(library, 0));
  const [preview, setPreview] = useState<DeckCard | null>(null);
  // The previewed card in another language (only what's shown).
  const [previewPrinting, setPreviewPrinting] = useState<Card | null>(null);

  const hand = game.order.slice(0, game.drawn);
  const kept = hand.filter((c) => !game.bottom.includes(c.key));
  const toBottom = game.mulligans - game.bottom.length;
  const choosing = toBottom > 0;
  const landsInHand = kept.filter((c) => mainType(c.card.typeLine) === 'land').length;
  const left = game.order.length - game.drawn;
  const libraryLands = library.filter((c) => mainType(c.card.typeLine) === 'land').length;
  const odds = landOdds(library.length, libraryLands, HAND_SIZE, 2, 4);

  // After a mulligan, tapping the opening cards picks the ones to bottom (until the first draw).
  const tapCard = (c: LibraryCard, index: number) => {
    const picking =
      game.mulligans > 0 && game.drawn === HAND_SIZE && index < HAND_SIZE && (choosing || game.bottom.includes(c.key));
    if (!picking) {
      setPreview(c.card);
      setPreviewPrinting(null);
      return;
    }
    setGame((g) => {
      if (g.bottom.includes(c.key)) return { ...g, bottom: g.bottom.filter((k) => k !== c.key) };
      if (g.bottom.length >= g.mulligans) return g;
      return { ...g, bottom: [...g.bottom, c.key] };
    });
  };

  if (library.length < HAND_SIZE) {
    return (
      <View style={styles.content}>
        <Section title="Mano de prueba" icon="hand-back-left-outline">
          <Text style={styles.value}>Añade al menos {HAND_SIZE} cartas al mazo para robar una mano.</Text>
        </Section>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 }]}>
        <View style={styles.handInfo}>
          <Text style={styles.handTitle}>
            {game.mulligans === 0 ? 'Mano inicial' : `Mulligan ${game.mulligans}`}
            {game.drawn > HAND_SIZE ? ` · ${game.drawn - HAND_SIZE} robadas` : ''}
          </Text>
          <Text style={styles.small}>
            {kept.length} cartas · {landsInHand} {landsInHand === 1 ? 'tierra' : 'tierras'} · quedan {left} en la
            biblioteca
          </Text>
        </View>

        {choosing && (
          <View style={[styles.advice, styles.adviceWarn]}>
            <MaterialCommunityIcons name="arrow-collapse-down" size={20} color={colors.undo} />
            <Text style={styles.adviceText}>
              Toca {toBottom} {toBottom === 1 ? 'carta' : 'cartas'} para ponerla{toBottom === 1 ? '' : 's'} al fondo de
              la biblioteca.
            </Text>
          </View>
        )}

        <View style={styles.hand}>
          {hand.map((c, index) => {
            const isBottom = game.bottom.includes(c.key);
            return (
              <Pressable
                key={c.key}
                style={styles.handCard}
                onPress={() => tapCard(c, index)}
                accessibilityLabel={c.card.printedName ?? c.card.name}
              >
                <View style={[styles.handImage, isBottom && styles.handImageBottom]}>
                  {c.card.imageUrl ? (
                    <Image source={{ uri: c.card.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Text style={styles.handName}>{c.card.printedName ?? c.card.name}</Text>
                  )}
                </View>
                {isBottom && (
                  <View style={styles.bottomBadge}>
                    <Text style={styles.bottomText}>Al fondo</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <SectionHelp>
          Toca una carta para verla en grande. Probabilidad de robar entre 2 y 4 tierras en la mano inicial:{' '}
          {pctText(odds)} ({libraryLands} tierras en {library.length} cartas
          {usesCommander ? ', sin el comandante' : ''}).
        </SectionHelp>
      </ScrollView>

      <View style={[styles.handButtons, { paddingBottom: bottomInset + 12 }]}>
        <HandButton icon="refresh" label="Nueva mano" onPress={() => setGame(deal(library, 0))} />
        <HandButton
          icon="shuffle-variant"
          label="Mulligan"
          disabled={game.mulligans >= HAND_SIZE - 1}
          onPress={() => setGame(deal(library, game.mulligans + 1))}
        />
        <HandButton
          icon="cards-outline"
          label="Robar"
          primary
          disabled={choosing || left === 0}
          onPress={() => setGame((g) => ({ ...g, drawn: Math.min(g.drawn + 1, g.order.length) }))}
        />
      </View>

      {preview && (
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)} accessibilityLabel="Cerrar">
          {(previewPrinting?.imageUrl ?? preview.imageUrl) && (
            <Image
              source={{ uri: previewPrinting?.imageUrl ?? preview.imageUrl! }}
              style={styles.previewImage}
              contentFit="contain"
            />
          )}
          <LanguagePill card={preview.scryfallId} lang={previewPrinting?.lang} onPick={setPreviewPrinting} />
        </Pressable>
      )}
    </>
  );
}

function HandButton(props: {
  icon: 'refresh' | 'shuffle-variant' | 'cards-outline';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const color = props.primary ? colors.bg : colors.text;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.handButton,
        props.primary && styles.handButtonPrimary,
        (pressed || props.disabled) && { opacity: props.disabled ? 0.35 : 0.6 },
      ]}
    >
      <MaterialCommunityIcons name={props.icon} size={20} color={color} />
      <Text style={[styles.handButtonText, { color }]}>{props.label}</Text>
    </Pressable>
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
  value: { color: colors.text, fontSize: 15 },
  small: { color: colors.textMuted, fontSize: 12 },

  tiles: { flexDirection: 'row', gap: 8 },
  landBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  landColumn: { flexDirection: 'column', alignItems: 'stretch' },
  landButtons: { flexDirection: 'row', gap: 8 },
  landButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  landButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  landButtonText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  landSmallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  landSmallText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  landPlan: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  landPlanItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  landPlanIcon: { width: 22, height: 22 },
  tile: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tileValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  tileLabel: { color: colors.textMuted, fontSize: 12 },
  advice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.add,
    backgroundColor: colors.surface,
  },
  adviceWarn: { borderColor: colors.undo },
  adviceText: { flex: 1, color: colors.text, fontSize: 13 },

  legend: { flexDirection: 'row', gap: 16 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  curve: { flexDirection: 'row', gap: 6, height: 170 },
  curveColumn: { flex: 1, alignItems: 'stretch' },
  curveCount: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center', height: 18 },
  curveBarArea: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Tall enough for its number even when it's a single card.
  curveSegment: { width: '100%', minHeight: 16, alignItems: 'center', justifyContent: 'center' },
  segmentCount: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  curveTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axisCaption: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: -6 },
  curveLabel: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barName: { color: colors.text, fontWeight: '800' },
  barValue: { color: colors.textMuted, fontSize: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  manaIcon: { width: 26, height: 26 },
  colorless: {
    borderRadius: 13,
    backgroundColor: '#b8b0c4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorlessText: { color: colors.bg, fontWeight: '900' },
  sources: { width: 48, alignItems: 'center' },
  sourcesValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sourcesLabel: { color: colors.textMuted, fontSize: 10 },

  handInfo: { gap: 2 },
  handTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  handCard: { width: '31.5%' },
  handImage: {
    width: '100%',
    aspectRatio: 1 / CARD_RATIO,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    padding: 4,
  },
  handImageBottom: { opacity: 0.35 },
  handName: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  bottomBadge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.undo,
  },
  bottomText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  handButtons: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  handButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  handButtonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  handButtonText: { fontWeight: '800', fontSize: 13 },
  previewBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  previewImage: { width: '100%', maxHeight: '75%', aspectRatio: 1 / CARD_RATIO, borderRadius: 16 },
});
