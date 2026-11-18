import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { useAppState } from '@/context/AppState';
import { getSetting, setSetting } from '@/db/database';
import {
  changeCommander,
  changeLife,
  changePoison,
  COMMANDER_LIMIT,
  DEFAULT_GAME,
  LIFE_OPTIONS,
  lossReason,
  MAX_PLAYERS,
  MIN_PLAYERS,
  newGame,
  parseGame,
  PLAYER_COLORS,
  POISON_LIMIT,
  EFFECT_OPTIONS,
  lifeSettings,
  PHOTO_KINDS,
  recolorPlayer,
  setEffect,
  setPhoto,
  setShow,
  SHOW_OPTIONS,
  winnerOf,
  type LifeEffects,
  type LifeSettings,
  type PhotoKind,
  renamePlayer,
  SETTINGS_KEY,
  tableRows,
  type LifeGame,
  type Player,
} from '@/life/game';
import { colors } from '@/theme';

const KEEP_AWAKE_TAG = 'life-counter';

/**
 * "Vidas" tab: a life counter for 2-6 players around the phone. Tap the left / right half of a
 * panel for −1 / +1 (hold for −10 / +10); the top row faces the players across the table. Poison
 * and commander damage per player, dice and who goes first in the menu. Saved in SQLite.
 */
export function LifeCounterScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { prefs } = useAppState();
  const [game, setGame] = useState<LifeGame>(DEFAULT_GAME);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [first, setFirst] = useState<number | null>(null);
  const settings = lifeSettings(game);
  // What just happened to each panel (photo, flash, shake, floating number), for a moment.
  const [events, setEvents] = useState<Record<number, PanelEvent>>({});
  const reactions = useRef(0);
  const react = (i: number, kind: PhotoKind, delta?: number) => {
    reactions.current += 1;
    const at = reactions.current;
    setEvents((r) => ({ ...r, [i]: { kind, at, delta } }));
    setTimeout(() => setEvents((r) => (r[i]?.at === at ? Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== i)) : r)), 1900);
  };

  // Load the saved game once; save every change after that.
  useEffect(() => {
    getSetting(db, SETTINGS_KEY)
      .then((json) => {
        const saved = parseGame(json);
        if (saved) setGame(saved);
      })
      .finally(() => setLoaded(true));
  }, [db]);
  useEffect(() => {
    if (loaded) setSetting(db, SETTINGS_KEY, JSON.stringify(game)).catch(() => {});
  }, [db, game, loaded]);

  // The screen stays on while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      };
    }, []),
  );

  const buzz = () => {
    if (prefs.haptics) Haptics.selectionAsync().catch(() => {});
  };

  const rows = tableRows(game.players.length);
  const rotatedIndexes = new Set(rows[0]);
  const winner = winnerOf(game);
  const count = game.players.length;

  /** A change of life of player `i`; `from` = who caused it (with 2 players, the other one). */
  const lifeChange = (i: number, delta: number, from?: number) => {
    buzz();
    setGame((g) => changeLife(g, i, delta));
    react(i, delta > 0 ? 'heal' : 'hurt', delta);
    if (delta < 0) {
      const attacker = from !== undefined && from !== i ? from : count === 2 ? 1 - i : undefined;
      if (attacker !== undefined) react(attacker, 'attack');
    }
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 6 }]}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((i) => (
            <PlayerPanel
              key={i}
              index={i}
              player={game.players[i]}
              players={game.players}
              settings={settings}
              rotated={r === 0}
              first={first === i}
              winner={winner === i}
              onLife={(delta, from) => lifeChange(i, delta, from)}
              onOpen={() => setDetail(i)}
              event={events[i]}
              onCommander={(from, d) => {
                buzz();
                setGame((g) => changeCommander(g, i, from, d));
                // Commander damage: this player takes it, the other one deals it.
                if (d > 0) {
                  react(i, 'hurt', -d);
                  react(from, 'attack');
                }
              }}
            />
          ))}
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.7 }]}
        onPress={() => setMenuOpen(true)}
        accessibilityLabel="Menú del contador"
        hitSlop={8}
      >
        <MaterialCommunityIcons name="cog-outline" size={26} color={colors.bg} />
      </Pressable>

      {detail !== null && game.players[detail] && (
        <PlayerDetail
          game={game}
          index={detail}
          rotated={rotatedIndexes.has(detail)}
          onChange={setGame}
          onClose={() => setDetail(null)}
          onReact={(p, k) => react(p, k, k === 'hurt' ? -1 : undefined)}
          photos={settings.effects.photos}
        />
      )}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} heightRatio={0.8}>
        <LifeMenu
          game={game}
          settings={settings}
          onChange={setGame}
          onNewGame={(count, life) => {
            setGame((g) => newGame(count, life, g));
            setFirst(null);
          }}
          onFirst={(i) => {
            setFirst(i);
            setMenuOpen(false);
          }}
        />
      </BottomSheet>
    </View>
  );
}

// ---------------------------------------------------------------- Player panel

/** Something that just happened to a panel (for its photo, flash, shake and floating number). */
interface PanelEvent {
  at: number;
  kind: PhotoKind;
  /** The change, for the floating number (none for the attacker's photo). */
  delta?: number;
}

function PlayerPanel({
  index,
  player,
  players,
  settings,
  rotated,
  first,
  winner,
  onLife,
  onOpen,
  event,
  onCommander,
}: {
  index: number;
  player: Player;
  players: Player[];
  settings: LifeSettings;
  rotated: boolean;
  first: boolean;
  /** The last one standing (confetti). */
  winner: boolean;
  /** A change of life; `from` = the player who caused it (the side's colored buttons). */
  onLife: (delta: number, from?: number) => void;
  onOpen: () => void;
  /** What just happened (photo, flash, shake, floating number). */
  event?: PanelEvent;
  onCommander: (from: number, delta: number) => void;
}) {
  const { show, effects: fx } = settings;
  const opponents = players
    .map((p, f) => ({ index: f, name: p.name, color: PLAYER_COLORS[p.color], damage: player.commander[f] ?? 0 }))
    .filter((o) => o.index !== index);
  // With 3+ players each side is split in one button per opponent (who deals the damage) and one for the rest.
  const segments =
    show.sources && players.length > 2
      ? [...opponents.map((o) => ({ from: o.index as number | undefined, color: o.color, label: o.name })), { from: undefined, color: 'rgba(0,0,0,0.25)', label: '' }]
      : null;
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!fx.shake || event?.kind !== 'hurt') return;
    shake.setValue(0);
    Animated.sequence([-1, 1, -0.7, 0.6, -0.3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  }, [event, fx.shake, shake]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Running change shown above the number ("−3"), cleared after a pause.
  const [delta, setDelta] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = (d: number, from?: number) => {
    onLife(d, from);
    setDelta((x) => x + d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDelta(0), 1800);
  };

  const out = lossReason(player);
  const big = Math.max(32, Math.min(size.width * 0.42, size.height * 0.5, 140));
  // Narrow panels (4+ players): compact commander damage and segments with less room below.
  const compact = size.width < 260 && players.length > 2;
  const danger = fx.heartbeat && !out && player.life > 0 && player.life <= 5;
  const photo = fx.photos && event ? player.photos?.[event.kind] : undefined;

  return (
    <View
      style={[styles.panel, { backgroundColor: PLAYER_COLORS[player.color] }, rotated && styles.rotated, danger && styles.danger]}
      onLayout={(e: LayoutChangeEvent) => setSize(e.nativeEvent.layout)}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] },
        ]}
      >
      {fx.flash && event && event.kind !== 'attack' && <Flash key={`f${event.at}`} kind={event.kind} />}
      {photo && <ReactionPhoto key={event!.at} uri={photo} kind={event!.kind} size={Math.min(size.height * 0.62, size.width * 0.45, 220)} />}
      <View style={styles.halves}>
        {(['minus', 'plus'] as const).map((side) => {
          const sign = side === 'plus' ? 1 : -1;
          return segments ? (
            // One button per player (in their color): who deals the damage, or gives the life.
            <View key={side} style={[styles.segments, compact && { paddingBottom: 66 }, side === 'minus' ? { paddingLeft: 5 } : { paddingRight: 5 }]}>
              {segments.map((sg, k) => (
                <Pressable
                  key={k}
                  style={({ pressed }) => [styles.segment, side === 'plus' && styles.halfRight, { backgroundColor: sg.color, opacity: pressed ? 0.85 : 0.45 }]}
                  onPress={() => change(sign, sg.from)}
                  onLongPress={() => change(10 * sign, sg.from)}
                  delayLongPress={400}
                  accessibilityLabel={`${sign < 0 ? 'Restar' : 'Sumar'} vida a ${player.name}${sg.label ? ` (${sg.label})` : ''}`}
                >
                  <View style={[styles.segmentInner, side === 'plus' && { flexDirection: 'row-reverse' }]}>
                    {show.steps && <MaterialCommunityIcons name={side} size={18} color="rgba(255,255,255,0.75)" />}
                    {!!sg.label && size.width > 160 && (
                      <Text style={styles.segmentLabel} numberOfLines={1}>
                        {sg.label}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
              key={side}
              style={({ pressed }) => [styles.half, side === 'plus' && styles.halfRight, pressed && styles.halfPressed]}
              onPress={() => change(sign)}
              onLongPress={() => change(10 * sign)}
              delayLongPress={400}
              accessibilityLabel={`${sign < 0 ? 'Restar' : 'Sumar'} vida a ${player.name}`}
            >
              {show.steps && <MaterialCommunityIcons name={side} size={28} color="rgba(255,255,255,0.45)" />}
            </Pressable>
          );
        })}
      </View>

      {/* Number and labels don't take touches: the halves underneath do. */}
      <View style={styles.center} pointerEvents="none">
        {show.name && (
          <Text style={styles.name} numberOfLines={1}>
            {first ? '👑 ' : ''}
            {player.name}
          </Text>
        )}
        {show.delta && <Text style={styles.delta}>{delta ? (delta > 0 ? `+${delta}` : `${delta}`) : ' '}</Text>}
        <Beat on={danger}>
          <Text style={[styles.life, { fontSize: big, lineHeight: big * 1.1 }]} adjustsFontSizeToFit numberOfLines={1}>
            {player.life}
          </Text>
        </Beat>
        {out && <Text style={styles.out}>☠ {out}</Text>}
      </View>
      {fx.floating && !!event?.delta && <FloatingNumber key={`n${event.at}`} delta={event.delta} seed={event.at} />}
      {out && fx.skull && <Skull size={Math.min(size.height * 0.7, size.width * 0.6, 200)} />}
      {winner && fx.confetti && <Confetti width={size.width} height={size.height} />}
      </Animated.View>

      {/* Commander damage from each opponent (− / ＋ right here; it also takes life), then poison. */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={styles.cmdRow} pointerEvents="box-none">
          {show.commander && compact && opponents.map((o) => (
            // Narrow panel: one circle per opponent with the damage; tap = +1, hold = −1.
            <Pressable
              key={o.index}
              style={({ pressed }) => [styles.cmdDot, { backgroundColor: o.color }, o.damage >= COMMANDER_LIMIT && styles.cmdLethal, pressed && { opacity: 0.7 }]}
              onPress={() => onCommander(o.index, 1)}
              onLongPress={() => o.damage > 0 && onCommander(o.index, -1)}
              delayLongPress={400}
              hitSlop={3}
              accessibilityLabel={`Daño de comandante de ${o.name}: ${o.damage}. Toca para sumar, mantén para restar`}
            >
              <MaterialCommunityIcons name="shield-crown-outline" size={11} color={colors.text} />
              <Text style={styles.cmdDotValue}>{o.damage}</Text>
            </Pressable>
          ))}
          {show.commander && !compact && opponents.map((o) => (
            <View key={o.index} style={[styles.cmd, { backgroundColor: o.color }, o.damage >= COMMANDER_LIMIT && styles.cmdLethal]}>
              <Pressable
                style={({ pressed }) => [styles.cmdStep, pressed && styles.cmdPressed, o.damage === 0 && { opacity: 0.35 }]}
                onPress={() => onCommander(o.index, -1)}
                disabled={o.damage === 0}
                hitSlop={4}
                accessibilityLabel={`Quitar daño de comandante de ${o.name}`}
              >
                <MaterialCommunityIcons name="minus" size={15} color={colors.text} />
              </Pressable>
              <MaterialCommunityIcons name="shield-crown-outline" size={13} color={colors.text} style={{ marginLeft: 4 }} />
              {size.width > 150 && (
                <Text style={styles.cmdName} numberOfLines={1}>
                  {o.name}
                </Text>
              )}
              <Text style={styles.cmdValue}>{o.damage}</Text>
              <Pressable
                style={({ pressed }) => [styles.cmdStep, pressed && styles.cmdPressed]}
                onPress={() => onCommander(o.index, 1)}
                hitSlop={4}
                accessibilityLabel={`Sumar daño de comandante de ${o.name}`}
              >
                <MaterialCommunityIcons name="plus" size={15} color={colors.text} />
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.countersButton, pressed && { opacity: 0.6 }]}
          onPress={onOpen}
          hitSlop={6}
          accessibilityLabel={`Veneno, nombre, color y fotos de ${player.name}`}
        >
          {show.poison && (
            <>
              <MaterialCommunityIcons name="bottle-tonic-skull-outline" size={16} color={colors.text} />
              <Text style={styles.counterText}>{player.poison}</Text>
            </>
          )}
          <MaterialCommunityIcons name="cog-outline" size={15} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Effects

/** The panel lights up red (damage) or green (life) and fades. */
function Flash({ kind }: { kind: PhotoKind }) {
  const [a] = useState(() => new Animated.Value(1));
  useEffect(() => {
    Animated.timing(a, { toValue: 0, duration: 550, useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: 1, opacity: a, backgroundColor: kind === 'heal' ? 'rgba(46,204,113,0.45)' : 'rgba(255,40,40,0.5)' }]}
    />
  );
}

/** «−1» / «+3» floating up from the panel. */
function FloatingNumber({ delta, seed }: { delta: number; seed: number }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.float,
        { left: `${25 + ((seed * 37) % 45)}%`, color: delta > 0 ? '#b6ffcf' : '#ffb3b3' },
        {
          opacity: a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, -110] }) },
            { scale: a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.7, 1.2, 1] }) },
          ],
        },
      ]}
    >
      {delta > 0 ? `+${delta}` : delta}
    </Animated.Text>
  );
}

/** The life number beating like a heart (5 life or less). */
function Beat({ on, children }: { on: boolean; children: React.ReactNode }) {
  const [a] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!on) {
      a.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1.12, duration: 120, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.98, duration: 120, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1.08, duration: 120, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, a]);
  return <Animated.View style={{ transform: [{ scale: a }] }}>{children}</Animated.View>;
}

/** A big skull when the player is out. */
function Skull({ size }: { size: number }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
  }, [a]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.skullWrap]}>
      <Animated.Text
        style={{
          fontSize: size,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
          transform: [
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) },
            { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] }) },
          ],
        }}
      >
        ☠
      </Animated.Text>
    </View>
  );
}

const CONFETTI_COLORS = ['#f1c40f', '#e74c3c', '#2ecc71', '#3498db', '#ff7a9c', '#ffffff', '#9b59b6'];
/** Confetti falling over the winner's panel, with a trophy. */
function Confetti({ width, height }: { width: number; height: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: 34 }, (_, i) => ({ x: (i * 53) % 100, delay: ((i * 37) % 30) * 90, duration: 2000 + ((i * 17) % 20) * 90, color: CONFETTI_COLORS[i % 7], v: new Animated.Value(0) })),
  );
  useEffect(() => {
    const anims = pieces.map((p) =>
      Animated.loop(Animated.sequence([Animated.delay(p.delay), Animated.timing(p.v, { toValue: 1, duration: p.duration, easing: Easing.linear, useNativeDriver: true })])),
    );
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [pieces]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', zIndex: 2 }]}>
      <Text style={styles.trophy}>🏆</Text>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.confetti,
            {
              left: (p.x / 100) * width,
              backgroundColor: p.color,
              transform: [
                { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [-20, height + 20] }) },
                { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- Player detail

function PlayerDetail({
  game,
  index,
  rotated,
  onChange,
  onClose,
  onReact,
  photos,
}: {
  game: LifeGame;
  index: number;
  rotated: boolean;
  onChange: (update: (g: LifeGame) => LifeGame) => void;
  onClose: () => void;
  onReact: (player: number, kind: PhotoKind) => void;
  /** The «Fotos» effect is on: show the photos to take. */
  photos: boolean;
}) {
  const player = game.players[index];
  const [shooting, setShooting] = useState<PhotoKind | null>(null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Faces the same way as the player's panel. */}
        <Pressable style={[styles.dialog, rotated && styles.rotated]} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={player.name}
              onChangeText={(name) => onChange((g) => renamePlayer(g, index, name))}
              style={styles.nameInput}
              maxLength={20}
              selectTextOnFocus
              accessibilityLabel="Nombre del jugador"
            />
            <View style={styles.swatches}>
              {PLAYER_COLORS.map((c, i) => (
                <Pressable
                  key={c}
                  onPress={() => onChange((g) => recolorPlayer(g, index, i))}
                  style={[styles.swatch, { backgroundColor: c }, player.color === i && styles.swatchOn]}
                  accessibilityLabel={`Color ${i + 1}`}
                />
              ))}
            </View>

            <Counter
              icon="bottle-tonic-skull-outline"
              label="Veneno"
              help={`Con ${POISON_LIMIT} pierde la partida.`}
              value={player.poison}
              danger={player.poison >= POISON_LIMIT}
              onChange={(d) => {
                onChange((g) => changePoison(g, index, d));
                if (d > 0) onReact(index, 'hurt');
              }}
            />

            <Text style={styles.sectionTitle}>Daño de comandante recibido</Text>
            <Text style={styles.help}>
              Resta también vidas. Con {COMMANDER_LIMIT} del mismo comandante pierde la partida.
            </Text>
            {game.players.map((from, f) =>
              f === index ? null : (
                <Counter
                  key={f}
                  icon="shield-crown-outline"
                  label={`De ${from.name}`}
                  color={PLAYER_COLORS[from.color]}
                  value={player.commander[f] ?? 0}
                  danger={(player.commander[f] ?? 0) >= COMMANDER_LIMIT}
                  onChange={(d) => {
                    onChange((g) => changeCommander(g, index, f, d));
                    if (d > 0) {
                      onReact(index, 'hurt');
                      onReact(f, 'attack');
                    }
                  }}
                />
              ),
            )}

            {!photos && <Text style={styles.help}>Activa el efecto «Fotos» en el menú ⚙ → Efectos para que cada jugador se haga sus fotos.</Text>}
            {photos && <Text style={styles.sectionTitle}>Fotos</Text>}
            {photos && <Text style={styles.help}>Salen en su panel cuando pasa cada cosa. Se hacen con la cámara delantera.</Text>}
            {photos && <View style={styles.photoSlots}>
              {PHOTO_KINDS.map((k) => {
                const uri = player.photos?.[k.key];
                return (
                  <View key={k.key} style={styles.photoSlot}>
                    <Pressable
                      style={[styles.photoPreview, { backgroundColor: PLAYER_COLORS[player.color] }]}
                      onPress={() => setShooting(k.key)}
                      accessibilityLabel={`${uri ? 'Repetir' : 'Hacer'} la foto «${k.label}»`}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.photoImage} contentFit="cover" />
                      ) : (
                        <MaterialCommunityIcons name="camera-outline" size={26} color="rgba(255,255,255,0.7)" />
                      )}
                    </Pressable>
                    <Text style={styles.photoLabel}>{k.label}</Text>
                    {uri && (
                      <Pressable
                        onPress={() => {
                          deletePhotoFile(uri);
                          onChange((g) => setPhoto(g, index, k.key, null));
                        }}
                        hitSlop={6}
                        accessibilityLabel={`Quitar la foto «${k.label}»`}
                      >
                        <Text style={styles.photoRemove}>Quitar</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>}

            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Listo</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
      {shooting && (
        <PhotoBooth
          title={`${player.name} · ${PHOTO_KINDS.find((k) => k.key === shooting)!.label}`}
          color={PLAYER_COLORS[player.color]}
          onCancel={() => setShooting(null)}
          onSave={(uri) => {
            const old = player.photos?.[shooting];
            if (old) deletePhotoFile(old);
            onChange((g) => setPhoto(g, index, shooting, uri));
            setShooting(null);
          }}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Photos

/** Where the players' photos are kept (the game stores their file URIs). */
const photoDir = () => {
  const dir = new Directory(Paths.document, 'life-photos');
  if (!dir.exists) dir.create();
  return dir;
};
function deletePhotoFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

/** The player's photo popping up from the bottom of the panel (shakes when taking damage). */
function ReactionPhoto({ uri, kind, size }: { uri: string; kind: PhotoKind; size: number }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 5, tension: 80 }),
      Animated.delay(1000),
      Animated.timing(anim, { toValue: 2, duration: 350, useNativeDriver: true }),
    ]).start();
    if (kind === 'hurt')
      Animated.sequence([
        Animated.delay(150),
        ...[-1, 1, -1, 1, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, useNativeDriver: true })),
      ]).start();
  }, [anim, shake, kind]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.reaction,
        kind === 'attack' ? { right: '6%' } : { left: '6%' },
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: anim.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [size * 0.6, 0, size * 0.2] }) },
            { scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.8, 1, 0.95] }) },
            { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] }) },
            { rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
          ],
        },
      ]}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </Animated.View>
  );
}

/** The front camera: a 3 s countdown, the photo, and «Guardar» / «Repetir». */
function PhotoBooth({ title, color, onCancel, onSave }: { title: string; color: string; onCancel: () => void; onSave: (uri: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [count, setCount] = useState<number | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shoot = () => {
    setShot(null);
    let n = 3;
    setCount(n);
    const t = setInterval(async () => {
      n -= 1;
      if (n > 0) return setCount(n);
      clearInterval(t);
      setCount(null);
      try {
        const pic = await camera.current?.takePictureAsync({ quality: 0.5, skipProcessing: false });
        if (pic?.uri) setShot(pic.uri);
      } catch {
        setError('No se pudo hacer la foto.');
      }
    }, 1000);
  };
  const save = () => {
    if (!shot) return;
    try {
      const dest = new File(photoDir(), `foto-${Date.now()}.jpg`);
      new File(shot).copy(dest);
      onSave(dest.uri);
    } catch {
      setError('No se pudo guardar la foto.');
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.booth}>
        <Text style={styles.boothTitle}>{title}</Text>
        {!permission ? null : !permission.granted ? (
          <View style={{ gap: 12, alignItems: 'center', padding: 20 }}>
            <Text style={styles.help}>Para hacer la foto, la app necesita usar la cámara.</Text>
            <Pressable style={[styles.closeButton, styles.primary]} onPress={requestPermission}>
              <Text style={[styles.closeText, { color: colors.bg }]}>Permitir la cámara</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.boothFrame, { borderColor: color }]}>
            {shot ? (
              <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mirror />
            )}
            {count !== null && <Text style={styles.boothCount}>{count}</Text>}
          </View>
        )}
        {error && <Text style={{ color: colors.discard }}>{error}</Text>}
        <Text style={styles.help}>En el panel se verá dentro de un círculo: centra la cara.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={styles.closeButton} onPress={onCancel}>
            <Text style={styles.closeText}>Cancelar</Text>
          </Pressable>
          {permission?.granted && (
            <Pressable style={[styles.closeButton, !shot && styles.primary]} onPress={shoot} disabled={count !== null}>
              <MaterialCommunityIcons name="camera" size={18} color={shot ? colors.text : colors.bg} />
              <Text style={[styles.closeText, !shot && { color: colors.bg }]}>{shot ? 'Repetir' : 'Hacer foto'}</Text>
            </Pressable>
          )}
          {shot && (
            <Pressable style={[styles.closeButton, styles.primary]} onPress={save}>
              <MaterialCommunityIcons name="check" size={18} color={colors.bg} />
              <Text style={[styles.closeText, { color: colors.bg }]}>Guardar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Counter({
  icon,
  label,
  help,
  value,
  color,
  danger,
  onChange,
}: {
  icon: 'bottle-tonic-skull-outline' | 'shield-crown-outline';
  label: string;
  help?: string;
  value: number;
  color?: string;
  danger?: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <View style={styles.counter}>
      <View style={[styles.counterIcon, color ? { backgroundColor: color } : null]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.counterLabel} numberOfLines={1}>
          {label}
        </Text>
        {help && <Text style={styles.help}>{help}</Text>}
      </View>
      <Pressable style={styles.step} onPress={() => onChange(-1)} accessibilityLabel={`Restar ${label}`}>
        <MaterialCommunityIcons name="minus" size={20} color={colors.text} />
      </Pressable>
      <Text style={[styles.counterValue, danger && { color: colors.discard }]}>{value}</Text>
      <Pressable style={styles.step} onPress={() => onChange(1)} accessibilityLabel={`Sumar ${label}`}>
        <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Menu

type Roll = { label: string; value: string } | null;

function LifeMenu({
  game,
  settings,
  onChange,
  onNewGame,
  onFirst,
}: {
  game: LifeGame;
  settings: LifeSettings;
  onChange: (update: (g: LifeGame) => LifeGame) => void;
  onNewGame: (count: number, life: number) => void;
  onFirst: (index: number) => void;
}) {
  const toggle = (key: string, label: string, hint: string, value: boolean, onToggle: (on: boolean) => void) => (
    <View key={key} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.help}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
    </View>
  );
  const [count, setCount] = useState(game.players.length);
  const [life, setLife] = useState(game.startingLife);
  const [roll, setRoll] = useState<Roll>(null);
  const random = (n: number) => Math.floor(Math.random() * n);

  return (
    <ScrollView contentContainerStyle={styles.menu}>
      <Text style={styles.sectionTitle}>Nueva partida</Text>
      <Text style={styles.help}>Jugadores</Text>
      <View style={styles.chips}>
        {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
          <Chip key={n} label={String(n)} on={count === n} onPress={() => setCount(n)} />
        ))}
      </View>
      <Text style={styles.help}>Vidas iniciales (Commander: 40)</Text>
      <View style={styles.chips}>
        {LIFE_OPTIONS.map((n) => (
          <Chip key={n} label={String(n)} on={life === n} onPress={() => setLife(n)} />
        ))}
      </View>
      <Pressable style={[styles.closeButton, styles.primary]} onPress={() => onNewGame(count, life)}>
        <MaterialCommunityIcons name="restart" size={20} color={colors.bg} />
        <Text style={[styles.closeText, { color: colors.bg }]}>Empezar partida</Text>
      </Pressable>
      <Text style={styles.help}>Se mantienen los nombres y colores de los jugadores.</Text>

      <Text style={styles.sectionTitle}>Sorteos</Text>
      <View style={styles.chips}>
        <MenuButton icon="crown-outline" label="¿Quién empieza?" onPress={() => onFirst(random(game.players.length))} />
        <MenuButton
          icon="dice-6-outline"
          label="Dado de 6"
          onPress={() => setRoll({ label: 'Dado de 6', value: String(random(6) + 1) })}
        />
        <MenuButton
          icon="dice-d20-outline"
          label="Dado de 20"
          onPress={() => setRoll({ label: 'Dado de 20', value: String(random(20) + 1) })}
        />
        <MenuButton
          icon="circle-multiple-outline"
          label="Moneda"
          onPress={() => setRoll({ label: 'Moneda', value: random(2) ? 'Cara' : 'Cruz' })}
        />
      </View>
      {roll && (
        <View style={styles.rollBox}>
          <Text style={styles.help}>{roll.label}</Text>
          <Text style={styles.rollValue}>{roll.value}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Pantalla</Text>
      <Text style={styles.help}>Qué se ve en el recuadro de cada jugador.</Text>
      {SHOW_OPTIONS.map((o) => toggle(o.key, o.label, o.hint, settings.show[o.key], (on) => onChange((g) => setShow(g, o.key, on))))}

      <Text style={styles.sectionTitle}>Efectos</Text>
      <Text style={styles.help}>Para darle vidilla a la partida.</Text>
      {EFFECT_OPTIONS.filter((o) => o.key !== 'sound').map((o) =>
        toggle(o.key, o.label, o.hint, settings.effects[o.key as keyof LifeEffects], (on) => onChange((g) => setEffect(g, o.key, on))),
      )}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

function MenuButton({
  icon,
  label,
  onPress,
}: {
  icon: 'crown-outline' | 'dice-6-outline' | 'dice-d20-outline' | 'circle-multiple-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 6, gap: 6 },
  row: { flex: 1, flexDirection: 'row', gap: 6 },
  panel: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  rotated: { transform: [{ rotate: '180deg' }] },
  halves: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  half: { flex: 1, justifyContent: 'center', paddingLeft: 12 },
  halfRight: { alignItems: 'flex-end', paddingLeft: 0, paddingRight: 12 },
  halfPressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  name: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 14 },
  delta: { color: colors.text, fontWeight: '900', fontSize: 18, height: 24 },
  life: { color: colors.text, fontWeight: '900', fontVariant: ['tabular-nums'] },
  out: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  countersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  counterText: { color: colors.text, fontWeight: '800', fontSize: 13, marginRight: 4 },
  bottomBar: { position: 'absolute', left: 6, right: 6, bottom: 8, alignItems: 'center', gap: 5 },
  cmdRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 5 },
  cmd: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  cmdDot: {
    minWidth: 40,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  cmdDotValue: { color: colors.text, fontWeight: '900', fontSize: 14 },
  cmdLethal: { borderColor: colors.discard, borderWidth: 2.5 },
  cmdStep: { width: 30, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  cmdPressed: { backgroundColor: 'rgba(0,0,0,0.45)' },
  cmdName: { color: colors.text, fontSize: 11, fontWeight: '700', maxWidth: 70, marginLeft: 3 },
  cmdValue: { color: colors.text, fontSize: 15, fontWeight: '900', minWidth: 22, textAlign: 'center' },
  reaction: {
    position: 'absolute',
    bottom: '12%',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    zIndex: 1,
  },
  photoSlots: { flexDirection: 'row', gap: 10 },
  photoSlot: { flex: 1, alignItems: 'center', gap: 4 },
  photoPreview: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoImage: { width: '100%', height: '100%' },
  photoLabel: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  photoRemove: { color: colors.discard, fontSize: 12, fontWeight: '700' },
  booth: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  boothTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  boothFrame: { width: 280, height: 280, borderRadius: 140, overflow: 'hidden', borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  boothCount: { color: '#fff', fontSize: 110, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 18 },
  danger: { borderWidth: 3, borderColor: 'rgba(255,70,70,0.9)' },
  segments: { flex: 1, gap: 3, paddingTop: 5, paddingBottom: 70 },
  segment: { flex: 1, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 8 },
  segmentInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentLabel: { color: '#fff', fontSize: 11, fontWeight: '800', maxWidth: 80, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  float: { position: 'absolute', top: '38%', fontSize: 38, fontWeight: '900', zIndex: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 },
  skullWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  confetti: { position: 'absolute', top: 0, width: 8, height: 13, borderRadius: 2 },
  trophy: { position: 'absolute', top: 8, alignSelf: 'center', fontSize: 40 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  toggleLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
  menuButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 48,
    height: 48,
    marginTop: -24,
    marginLeft: -24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.bg,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  dialog: {
    maxHeight: '85%',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  nameInput: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: colors.text },
  sectionTitle: { color: colors.accent, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  help: { color: colors.textMuted, fontSize: 12 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counterIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  counterLabel: { color: colors.text, fontWeight: '800' },
  counterValue: { color: colors.text, fontSize: 22, fontWeight: '900', minWidth: 34, textAlign: 'center' },
  step: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  closeButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  closeText: { color: colors.text, fontWeight: '900', fontSize: 15 },

  menu: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 52,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '800' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  rollBox: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  rollValue: { color: colors.accent, fontSize: 40, fontWeight: '900' },
});
