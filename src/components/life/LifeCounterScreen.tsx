import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
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
  PHOTO_KINDS,
  recolorPlayer,
  setPhoto,
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
  // The photo each player shows right now (taking damage, dealing it, gaining life), for a moment.
  const [reaction, setReaction] = useState<Record<number, { kind: PhotoKind; at: number }>>({});
  const reactions = useRef(0);
  const react = (i: number, kind: PhotoKind) => {
    reactions.current += 1;
    const at = reactions.current;
    setReaction((r) => ({ ...r, [i]: { kind, at } }));
    setTimeout(() => setReaction((r) => (r[i]?.at === at ? Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== i)) : r)), 1900);
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

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 6 }]}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((i) => (
            <PlayerPanel
              key={i}
              player={game.players[i]}
              rotated={r === 0}
              first={first === i}
              onLife={(delta) => {
                buzz();
                setGame((g) => changeLife(g, i, delta));
                react(i, delta > 0 ? 'heal' : 'hurt');
              }}
              onOpen={() => setDetail(i)}
              reaction={reaction[i]}
              opponents={game.players
                .map((p, f) => ({ index: f, name: p.name, color: PLAYER_COLORS[p.color], damage: game.players[i].commander[f] ?? 0 }))
                .filter((o) => o.index !== i)}
              onCommander={(from, d) => {
                buzz();
                setGame((g) => changeCommander(g, i, from, d));
                // Commander damage: this player takes it, the other one deals it.
                if (d > 0) {
                  react(i, 'hurt');
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
          onReact={react}
        />
      )}

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} heightRatio={0.8}>
        <LifeMenu
          game={game}
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

function PlayerPanel({
  player,
  rotated,
  first,
  onLife,
  onOpen,
  reaction,
  opponents,
  onCommander,
}: {
  player: Player;
  rotated: boolean;
  first: boolean;
  onLife: (delta: number) => void;
  onOpen: () => void;
  /** A photo to show now (taking damage, dealing it, gaining life). */
  reaction?: { kind: PhotoKind; at: number };
  /** The other players, with the commander damage this one has taken from each. */
  opponents: { index: number; name: string; color: string; damage: number }[];
  onCommander: (from: number, delta: number) => void;
}) {
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

  const change = (d: number) => {
    onLife(d);
    setDelta((x) => x + d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDelta(0), 1800);
  };

  const out = lossReason(player);
  const big = Math.max(32, Math.min(size.width * 0.42, size.height * 0.5, 140));

  return (
    <View
      style={[styles.panel, { backgroundColor: PLAYER_COLORS[player.color] }, rotated && styles.rotated]}
      onLayout={(e: LayoutChangeEvent) => setSize(e.nativeEvent.layout)}
    >
      {reaction && player.photos?.[reaction.kind] && (
        <ReactionPhoto key={reaction.at} uri={player.photos[reaction.kind]!} kind={reaction.kind} size={Math.min(size.height * 0.62, size.width * 0.45, 220)} />
      )}
      <View style={styles.halves}>
        <Pressable
          style={({ pressed }) => [styles.half, pressed && styles.halfPressed]}
          onPress={() => change(-1)}
          onLongPress={() => change(-10)}
          delayLongPress={400}
          accessibilityLabel={`Restar vida a ${player.name}`}
        >
          <MaterialCommunityIcons name="minus" size={28} color="rgba(255,255,255,0.45)" />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.half, styles.halfRight, pressed && styles.halfPressed]}
          onPress={() => change(1)}
          onLongPress={() => change(10)}
          delayLongPress={400}
          accessibilityLabel={`Sumar vida a ${player.name}`}
        >
          <MaterialCommunityIcons name="plus" size={28} color="rgba(255,255,255,0.45)" />
        </Pressable>
      </View>

      {/* Number and labels don't take touches: the halves underneath do. */}
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.name} numberOfLines={1}>
          {first ? '👑 ' : ''}
          {player.name}
        </Text>
        <Text style={styles.delta}>{delta ? (delta > 0 ? `+${delta}` : `${delta}`) : ' '}</Text>
        <Text style={[styles.life, { fontSize: big, lineHeight: big * 1.1 }]} adjustsFontSizeToFit numberOfLines={1}>
          {player.life}
        </Text>
        {out && <Text style={styles.out}>☠ {out}</Text>}
      </View>

      {/* Commander damage from each opponent (− / ＋ right here; it also takes life), then poison. */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={styles.cmdRow} pointerEvents="box-none">
          {opponents.map((o) => (
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
          <MaterialCommunityIcons name="bottle-tonic-skull-outline" size={16} color={colors.text} />
          <Text style={styles.counterText}>{player.poison}</Text>
          <MaterialCommunityIcons name="cog-outline" size={15} color={colors.text} />
        </Pressable>
      </View>
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
}: {
  game: LifeGame;
  index: number;
  rotated: boolean;
  onChange: (update: (g: LifeGame) => LifeGame) => void;
  onClose: () => void;
  onReact: (player: number, kind: PhotoKind) => void;
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

            <Text style={styles.sectionTitle}>Fotos</Text>
            <Text style={styles.help}>Salen en su panel cuando pasa cada cosa. Se hacen con la cámara delantera.</Text>
            <View style={styles.photoSlots}>
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
            </View>

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
  onNewGame,
  onFirst,
}: {
  game: LifeGame;
  onNewGame: (count: number, life: number) => void;
  onFirst: (index: number) => void;
}) {
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
