import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  edhrecCardUrl,
  edhrecCommanderUrl,
  getCardCombos,
  getEdhrecCard,
  getEdhrecCommander,
  type Combo,
  type EdhrecCard,
  type EdhrecCommander,
} from '@/api/synergy';
import { Section, SectionHelp, SubTitle } from '@/components/cardInfo/Section';
import { ComboView, count, EntryRow, pct, useCardImages } from '@/components/synergy/SynergyParts';
import { colors } from '@/theme';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'done'; data: T };

/** Runs `load` once per `key`; the state says loading / error / done. */
function useLoad<T>(key: string, load: () => Promise<T>, enabled = true): Load<T> {
  const [state, setState] = useState<{ key: string; value: Load<T> }>({ key: '', value: { status: 'loading' } });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ key, value: { status: 'done', data } }))
      .catch(() => !cancelled && setState({ key, value: { status: 'error' } }));
    return () => {
      cancelled = true;
    };
    // `load` is rebuilt every render; `key` says when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return state.key === key ? state.value : { status: 'loading' };
}

/**
 * The card's synergies, for the card info screen: how Commander decks use it and its
 * commanders (EDHREC), its high-synergy cards if it can lead a deck, and the combos it's in
 * (Commander Spellbook).
 */
export function CardSynergy({ name, canBeCommander }: { name: string; canBeCommander: boolean }) {
  const edhrec = useLoad(`card:${name}`, () => getEdhrecCard(name));
  const commander = useLoad(`cmd:${name}`, () => getEdhrecCommander(name), canBeCommander);
  const combos = useLoad(`combos:${name}`, () => getCardCombos(name, 10));

  const card = edhrec.status === 'done' ? edhrec.data : null;
  const cmd = canBeCommander && commander.status === 'done' ? commander.data : null;
  const comboList = combos.status === 'done' ? combos.data.combos : [];

  const ids = [
    ...(card?.topCommanders.slice(0, 8) ?? []),
    ...(card?.topCards.slice(0, 8) ?? []),
    ...(cmd?.cards.slice(0, 15) ?? []),
  ].map((e) => e.id);
  const entryImages = useCardImages(ids, 'id');
  const comboImages = useCardImages(
    comboList.flatMap((c) => c.cards),
    'name',
  );

  return (
    <>
      <Section collapsible title="Uso en Commander" icon="chart-box-outline">
        <SectionHelp>
          Datos de EDHREC, que recopila cientos de miles de mazos de Commander publicados en internet.
        </SectionHelp>
        <Body state={edhrec} empty="EDHREC no tiene datos de esta carta (puede que no sea legal en Commander).">
          {card && <EdhrecCardView card={card} name={name} images={entryImages} />}
        </Body>
      </Section>

      {canBeCommander && (commander.status !== 'done' || cmd) && (
        <Section collapsible title="Como comandante" icon="crown-outline">
          <SectionHelp>
            Las cartas que más se juegan en los mazos que la llevan de comandante, ordenadas por sinergia: cuánto más
            aparecen en sus mazos que en la media de mazos de sus colores.
          </SectionHelp>
          <Body state={commander} empty="">
            {cmd && <CommanderView cmd={cmd} name={name} images={entryImages} />}
          </Body>
        </Section>
      )}

      <Section collapsible title="Combos" icon="puzzle-outline">
        <SectionHelp>
          Combinaciones de cartas que juntas consiguen algo enorme (maná infinito, ganar la partida…), de Commander
          Spellbook. Las más jugadas primero.
        </SectionHelp>
        <Body state={combos} empty="">
          {comboList.length === 0 ? (
            <Text style={styles.value}>No aparece en ningún combo conocido.</Text>
          ) : (
            comboList.map((c: Combo) => <ComboView key={c.id} combo={c} images={comboImages} />)
          )}
        </Body>
      </Section>
    </>
  );
}

function Body<T>({ state, empty, children }: { state: Load<T>; empty: string; children: ReactNode }) {
  if (state.status === 'loading') return <ActivityIndicator color={colors.accent} />;
  if (state.status === 'error') return <Text style={styles.value}>No se pudo cargar. Comprueba la conexión.</Text>;
  if (state.data === null && empty) return <Text style={styles.value}>{empty}</Text>;
  return <>{children}</>;
}

function EdhrecCardView({ card, name, images }: { card: EdhrecCard; name: string; images: Record<string, string> }) {
  const inclusion = card.potentialDecks ? card.numDecks / card.potentialDecks : 0;
  return (
    <>
      <View style={styles.stats}>
        <Stat value={count(card.numDecks)} label="mazos la llevan" />
        <Stat value={pct(inclusion)} label="de los que podrían" />
        {card.salt !== null && card.salt > 0 && (
          <Stat value={card.salt.toFixed(1).replace('.', ',')} label="de «sal» (0-4)" />
        )}
      </View>
      <SectionHelp>
        «De los que podrían» = de los mazos cuyos colores permiten jugarla. La «sal» mide cuánto molesta a los rivales
        según votos de la comunidad.
      </SectionHelp>

      {card.topCommanders.length > 0 && (
        <>
          <SubTitle>Comandantes que más la usan</SubTitle>
          {card.topCommanders.slice(0, 8).map((e) => (
            <EntryRow key={e.id} entry={e} image={images[e.id]} metric="inclusion" />
          ))}
        </>
      )}
      {card.topCards.length > 0 && (
        <>
          <SubTitle>Se juega junto a</SubTitle>
          {card.topCards.slice(0, 8).map((e) => (
            <EntryRow key={e.id} entry={e} image={images[e.id]} metric="inclusion" />
          ))}
        </>
      )}
      <LinkButton label="Ver en EDHREC" url={edhrecCardUrl(name)} />
    </>
  );
}

function CommanderView({ cmd, name, images }: { cmd: EdhrecCommander; name: string; images: Record<string, string> }) {
  return (
    <>
      <View style={styles.stats}>
        <Stat value={count(cmd.numDecks)} label="mazos la llevan de comandante" />
      </View>
      <SubTitle>Cartas de más sinergia</SubTitle>
      {cmd.cards.slice(0, 15).map((e) => (
        <EntryRow key={e.id} entry={e} image={images[e.id]} metric="synergy" />
      ))}
      <LinkButton label="Ver su página en EDHREC" url={edhrecCommanderUrl(name)} />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]} onPress={() => Linking.openURL(url)}>
      <MaterialCommunityIcons name="open-in-new" size={16} color={colors.accent} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  value: { color: colors.text, fontSize: 15 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  linkText: { color: colors.text, fontWeight: '700' },
});
