import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { lossReason, PHASES, PLAYER_COLORS, type LifeGame } from '@/life/game';
import { colors } from '@/theme';

/** «3:07» */
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The turn controller (the same as on the PC), as a strip between the rows of panels: whose turn and its
 * time, the phase or step (with a dot for each one of the turn), ‹ / ▶ next phase / ⏭ pass the turn and
 * the game menu. Before starting, who begins.
 */
export function TurnBar({
  game,
  first,
  onStart,
  onNext,
  onPrev,
  onPass,
  onStop,
  onMenu,
}: {
  game: LifeGame;
  first: number | null;
  onStart: (player: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onPass: () => void;
  onStop: () => void;
  onMenu: () => void;
}) {
  const t = game.turn;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!t) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [t]);

  const menu = (
    <Pressable style={styles.menu} onPress={onMenu} hitSlop={6} accessibilityLabel="Menú de la partida">
      <MaterialCommunityIcons name="cog-outline" size={22} color={colors.bg} />
    </Pressable>
  );

  if (!t) {
    return (
      <View style={styles.bar}>
        <Text style={styles.label}>¿Quién empieza?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} style={{ flex: 1 }}>
          {game.players.map((p, i) => (
            <Pressable key={i} style={[styles.start, { backgroundColor: PLAYER_COLORS[p.color] }, first === i && styles.startOn]} onPress={() => onStart(i)}>
              <Text style={styles.startText} numberOfLines={1}>
                {first === i ? '👑 ' : ''}
                {p.name}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.start} onPress={() => onStart(Math.floor(Math.random() * game.players.length))}>
            <MaterialCommunityIcons name="dice-multiple-outline" size={16} color={colors.text} />
          </Pressable>
        </ScrollView>
        {menu}
      </View>
    );
  }

  const player = game.players[t.player];
  const color = PLAYER_COLORS[player?.color ?? 0];
  const phase = PHASES[t.phase];
  const alive = Math.max(1, game.players.filter((p) => !lossReason(p)).length);
  const round = Math.floor((t.number - 1) / alive) + 1;
  return (
    <View style={[styles.bar, { borderColor: color }]}>
      <View style={[styles.who, { backgroundColor: color }]}>
        <Text style={styles.whoName} numberOfLines={1}>
          {player?.name}
        </Text>
        <Text style={styles.whoNum}>
          T{t.number} · R{round} · {clock(now - t.startedAt)}
        </Text>
      </View>
      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={onNext} accessibilityLabel={`${phase.label}. Toca para pasar a la siguiente fase`}>
        <Text style={styles.group} numberOfLines={1}>
          {phase.group}
        </Text>
        <Text style={styles.phase} numberOfLines={1}>
          {phase.label}
        </Text>
        <View style={styles.dots}>
          {PHASES.map((p, i) => (
            <View key={p.key} style={[styles.dot, i < t.phase && styles.dotDone, i === t.phase && { backgroundColor: color, width: 10 }]} />
          ))}
        </View>
      </Pressable>
      <Pressable style={styles.btn} onPress={onPrev} disabled={t.phase === 0} hitSlop={4} accessibilityLabel="Fase anterior">
        <MaterialCommunityIcons name="chevron-left" size={22} color={t.phase === 0 ? colors.border : colors.text} />
      </Pressable>
      <Pressable style={[styles.btn, styles.next]} onPress={onNext} hitSlop={4} accessibilityLabel="Siguiente fase">
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.bg} />
      </Pressable>
      <Pressable style={styles.btn} onPress={onPass} onLongPress={onStop} hitSlop={4} accessibilityLabel="Pasar turno (mantén pulsado para quitar los turnos)">
        <MaterialCommunityIcons name="skip-next" size={22} color={colors.text} />
      </Pressable>
      {menu}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 13 },
  start: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: colors.surfaceAlt },
  startOn: { borderColor: '#fff' },
  startText: { color: '#fff', fontWeight: '800', fontSize: 13, maxWidth: 110 },
  who: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9, maxWidth: 120 },
  whoName: { color: '#fff', fontWeight: '900', fontSize: 13 },
  whoNum: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '700' },
  group: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  phase: { color: colors.text, fontSize: 14, fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.textMuted },
  btn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  next: { backgroundColor: colors.accent, borderColor: colors.accent },
  menu: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
});
