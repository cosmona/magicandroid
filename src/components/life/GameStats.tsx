import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gameStats, PLAYER_COLORS, type LifeGame } from '@/life/game';
import { colors } from '@/theme';

/** «12 min», «1 h 05 min». */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de un minuto';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/**
 * The game's statistics (the same as on the PC): winner, duration, awards, each player's numbers and who
 * dealt damage to whom. Opens by itself when only one player is left, and from the menu.
 */
export function GameStatsModal({ game, onClose, onNewGame }: { game: LifeGame; onClose: () => void; onNewGame: () => void }) {
  const insets = useSafeAreaInsets();
  const st = gameStats(game);
  const p = game.players;
  const name = (i: number) => p[i]?.name || `Jugador ${i + 1}`;
  const color = (i: number) => PLAYER_COLORS[p[i]?.color ?? 0];
  const best = (value: (i: number) => number) => {
    let top = 0;
    let who = -1;
    p.forEach((_, i) => {
      const v = value(i);
      if (v > top) {
        top = v;
        who = i;
      }
    });
    return who >= 0 ? { who, value: top } : null;
  };
  const awards = [
    { icon: '⚔️', label: 'Más daño hecho', a: best((i) => st.players[i].damageDealt) },
    { icon: '💥', label: 'Golpe más fuerte', a: best((i) => st.players[i].biggestHit) },
    { icon: '🛡️', label: 'El más castigado', a: best((i) => st.players[i].damageTaken) },
    { icon: '💚', label: 'Más vida ganada', a: best((i) => st.players[i].lifeGained) },
    { icon: '👑', label: 'Daño de comandante', a: best((i) => st.players[i].commanderDealt) },
  ].filter((x) => x.a);
  const order = p.map((_, i) => i).sort((a, b) => (st.players[b].outOrder ?? 99) - (st.players[a].outOrder ?? 99));
  const anyDealt = st.dealt.some((row) => row.some((v) => v > 0));
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{st.winner !== null ? 'Fin de la partida' : 'Estadísticas de la partida'}</Text>
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.hero}>
            {st.winner !== null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 40 }}>🏆</Text>
                <View>
                  <Text style={styles.muted}>Gana</Text>
                  <Text style={[styles.winner, { color: color(st.winner) }]}>{name(st.winner)}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.muted}>La partida sigue: así va.</Text>
            )}
            <View style={styles.facts}>
              <Fact value={formatDuration(st.duration)} label="de partida" />
              <Fact value={String(st.players.reduce((n, s) => n + s.damageTaken, 0))} label="de daño en total" />
            </View>
          </View>

          {awards.length > 0 && (
            <View style={styles.awards}>
              {awards.map((x) => (
                <View key={x.label} style={[styles.award, { borderLeftColor: color(x.a!.who) }]}>
                  <Text style={{ fontSize: 22 }}>{x.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.muted}>{x.label}</Text>
                    <Text style={styles.bold} numberOfLines={1}>
                      {name(x.a!.who)} · {x.a!.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>Jugadores</Text>
          {order.map((i) => {
            const s = st.players[i];
            return (
              <View key={i} style={[styles.player, { borderColor: color(i) }]}>
                <View style={styles.playerHead}>
                  <View style={[styles.dot, { backgroundColor: color(i) }]} />
                  <Text style={[styles.bold, { flex: 1 }]} numberOfLines={1}>
                    {name(i)}
                  </Text>
                  <Text style={styles.result}>
                    {st.winner === i ? '🏆 Ganador' : s.outOrder ? `☠ ${s.outOrder}º eliminado${s.outBy !== undefined ? ` (por ${name(s.outBy)})` : ''}` : 'Sigue'}
                  </Text>
                </View>
                <View style={styles.grid}>
                  <Cell label="Vidas" value={p[i].life} />
                  <Cell label="Daño hecho" value={s.damageDealt} />
                  <Cell label="Recibido" value={s.damageTaken} />
                  <Cell label="Comandante" value={s.commanderDealt} />
                  <Cell label="Vida ganada" value={s.lifeGained} />
                  <Cell label="Mínimo" value={s.lowest} />
                  <Cell label="Golpe mayor" value={s.biggestHit} />
                  <Cell label="Veneno" value={s.poison} />
                </View>
              </View>
            );
          })}

          {anyDealt && (
            <>
              <Text style={styles.section}>Quién hizo daño a quién</Text>
              {p.map((_, i) =>
                p.map((__, j) =>
                  i !== j && st.dealt[i][j] > 0 ? (
                    <View key={`${i}-${j}`} style={styles.dealtRow}>
                      <View style={[styles.dot, { backgroundColor: color(i) }]} />
                      <Text style={styles.text} numberOfLines={1}>
                        {name(i)}
                      </Text>
                      <MaterialCommunityIcons name="arrow-right" size={16} color={colors.textMuted} />
                      <View style={[styles.dot, { backgroundColor: color(j) }]} />
                      <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                        {name(j)}
                      </Text>
                      <Text style={styles.bold}>{st.dealt[i][j]}</Text>
                    </View>
                  ) : null,
                ),
              )}
            </>
          )}
          {st.events === 0 && <Text style={styles.muted}>Aún no ha pasado nada en esta partida.</Text>}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Cerrar</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.primary]} onPress={onNewGame}>
              <MaterialCommunityIcons name="restart" size={18} color={colors.bg} />
              <Text style={[styles.buttonText, { color: colors.bg }]}>Nueva partida</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  body: { padding: 16, gap: 12 },
  hero: { padding: 16, borderRadius: 14, gap: 12, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.accent },
  winner: { fontSize: 28, fontWeight: '900' },
  facts: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  factValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  awards: { gap: 8 },
  award: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5 },
  section: { color: colors.accent, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', marginTop: 6 },
  player: { padding: 12, borderRadius: 12, borderWidth: 1.5, backgroundColor: colors.surface, gap: 10 },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  result: { color: colors.textMuted, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '23%', flexGrow: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: colors.surfaceAlt },
  cellValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cellLabel: { color: colors.textMuted, fontSize: 10 },
  dealtRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { color: colors.text, fontSize: 14, maxWidth: 110 },
  bold: { color: colors.text, fontSize: 15, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 12 },
  button: { flex: 1, flexDirection: 'row', gap: 6, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '900', fontSize: 15 },
});
