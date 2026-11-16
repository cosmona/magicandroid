import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCardInLanguage, getCardsByIds, type Card } from '@/api/scryfall';
import {
  edhrecCommanderUrl,
  findDeckCombos,
  getEdhrecCommander,
  type DeckCombos,
  type EdhrecCommander,
} from '@/api/synergy';
import { Section, SectionHelp, SubTitle } from '@/components/cardInfo/Section';
import { ComboView, count, EntryRow, useCardImages } from '@/components/synergy/SynergyParts';
import { useAppState } from '@/context/AppState';
import type { DeckCard } from '@/db/database';
import { colors } from '@/theme';

type Tab = 'combos' | 'recommend';
type Load<T> = { key: string; status: 'loading' | 'error' | 'done'; data?: T };

const ALMOST_PAGE = 15;
const RECOMMEND_COUNT = 40;
const front = (name: string) => name.split(' // ')[0].toLowerCase();

/**
 * Full-screen synergies of the active deck: its combos and the ones it's one card away from
 * (Commander Spellbook), and the cards EDHREC recommends for its commander, addable with ＋.
 */
export function DeckSynergyScreen({
  cards,
  usesCommander,
  onAdd,
  onClose,
}: {
  cards: DeckCard[];
  usesCommander: boolean;
  /** Adds a printing (already in the preferred language) to the deck. */
  onAdd: (card: Card) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { prefs } = useAppState();
  const [tab, setTab] = useState<Tab>('combos');

  const commanders = useMemo(
    () => (usesCommander ? cards.filter((c) => c.isCommander).map((c) => c.name) : []),
    [cards, usesCommander],
  );
  const main = useMemo(() => cards.filter((c) => !commanders.includes(c.name)).map((c) => c.name), [cards, commanders]);
  const inDeck = useMemo(() => new Set(cards.map((c) => front(c.name))), [cards]);

  // ---- Combos (Commander Spellbook) ----
  const comboKey = [...commanders, '|', ...main].join('\n');
  const [combos, setCombos] = useState<Load<DeckCombos>>({ key: '', status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    findDeckCombos(main, commanders)
      .then((data) => !cancelled && setCombos({ key: comboKey, status: 'done', data }))
      .catch(() => !cancelled && setCombos({ key: comboKey, status: 'error' }));
    return () => {
      cancelled = true;
    };
    // The key covers `main` and `commanders`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboKey, attempt]);
  const comboState = combos.key === comboKey ? combos : { status: 'loading' as const, data: undefined };
  const [almostShown, setAlmostShown] = useState(ALMOST_PAGE);

  // ---- Recommendations (EDHREC, for the first commander) ----
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
  const recommended = useMemo(
    () => (recState.data?.cards ?? []).filter((e) => !inDeck.has(front(e.name))).slice(0, RECOMMEND_COUNT),
    [recState.data, inDeck],
  );

  // Added from here during this visit (the deck list updates behind).
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const add = async (id: string) => {
    setAdding(id);
    try {
      const [card] = await getCardsByIds([id]);
      if (card) {
        const printing =
          prefs.language !== 'en' ? ((await getCardInLanguage(card, prefs.language).catch(() => null)) ?? card) : card;
        await onAdd(printing);
        setAdded((prev) => new Set(prev).add(id));
      }
    } finally {
      setAdding(null);
    }
  };

  // Images: the cards of the combos on screen, or the recommended ones.
  const almostList = comboState.data?.almost.slice(0, almostShown) ?? [];
  const comboNames = [
    ...(comboState.data?.included ?? []).flatMap((c) => c.cards),
    ...almostList.flatMap((a) => a.combo.cards),
  ];
  const comboImages = useCardImages(tab === 'combos' ? comboNames : [], 'name');
  const recImages = useCardImages(tab === 'recommend' ? recommended.map((e) => e.id) : [], 'id');

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
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
                      <ComboView key={combo.id} combo={combo} missing={missing} images={comboImages} />
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
                que aún no están en el tuyo. Sinergia = cuánto más aparece en sus mazos que en la media de mazos de sus
                colores. Pulsa ＋ para añadirla.
              </SectionHelp>
              <SubTitle>Cartas recomendadas</SubTitle>
              {recommended.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  image={recImages[e.id]}
                  metric="synergy"
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
              ))}
              <Pressable style={styles.more} onPress={() => Linking.openURL(edhrecCommanderUrl(leader))}>
                <Text style={styles.moreText}>Ver todo en EDHREC ↗</Text>
              </Pressable>
            </Section>
          )}
        </ScrollView>
      </View>
    </Modal>
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
