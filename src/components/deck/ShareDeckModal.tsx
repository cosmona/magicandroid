import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { artCropUrl } from '@/api/scryfall';
import { mainType, TYPE_GROUP_LABELS, type TypeKey } from '@/collection/organize';
import { CARD_RATIO } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import type { Deck, DeckCard } from '@/db/database';
import { arenaDeckList } from '@/deck/arena';
import { CURVE_MAX, deckStats } from '@/deck/stats';
import { priceTotal, useCardDetails } from '@/hooks/useCardDetails';
import { LOGO_MARK, LOGO_MARK_RATIO, MANA_ICONS } from '@/icons';
import { colors, formatEur, formatLabel } from '@/theme';

/** Order of the card groups in the image. */
const TYPE_ORDER: TypeKey[] = [
  'creature',
  'planeswalker',
  'battle',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'land',
  'other',
];
const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G'] as const;
/** Width of the saved image in pixels, whatever the phone. */
const IMAGE_WIDTH = 1080;
/** Give up waiting for slow images after this long. */
const IMAGE_TIMEOUT = 6000;

const displayName = (c: DeckCard) => c.printedName ?? c.name;

/**
 * Shares the deck as a picture (cover art, commander or key cards, curve, colors and the list
 * by type), drawn in a hidden-size View and captured with react-native-view-shot, or as text.
 */
export function ShareDeckModal({
  deck,
  cards,
  usesCommander,
  onClose,
}: {
  deck: Deck;
  cards: DeckCard[];
  usesCommander: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { prefs } = useAppState();
  const shotRef = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(false);
  const [arenaNote, setArenaNote] = useState<string | null>(null);

  const details = useCardDetails(cards.map((c) => c.scryfallId));
  const price = priceTotal(cards, details);
  const stats = deckStats(cards);

  const commanders = usesCommander ? cards.filter((c) => c.isCommander) : [];
  // Commander(s), else the three most expensive (or costliest to cast) non-land cards.
  const featured = (
    commanders.length
      ? commanders
      : cards
          .filter((c) => mainType(c.typeLine) !== 'land')
          .sort((a, b) => (details[b.scryfallId]?.eur ?? 0) - (details[a.scryfallId]?.eur ?? 0) || b.cmc - a.cmc)
          .slice(0, 3)
  ).filter((c) => c.imageUrl);

  const groups = TYPE_ORDER.map((type) => ({
    type,
    cards: cards
      .filter((c) => !commanders.includes(c) && mainType(c.typeLine) === type)
      .sort((a, b) => a.cmc - b.cmc || displayName(a).localeCompare(displayName(b))),
  })).filter((g) => g.cards.length > 0);

  // Wait for the remote images before capturing (or give up after a while).
  const remote = featured.length + (deck.coverImage ? 1 : 0);
  const [loaded, setLoaded] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), IMAGE_TIMEOUT);
    return () => clearTimeout(timer);
  }, []);
  const ready = loaded >= remote || timedOut;
  const onImage = () => setLoaded((n) => n + 1);

  const shareImage = async () => {
    if (!shotRef.current) return;
    setSharing(true);
    setError(false);
    try {
      const uri = await captureRef(shotRef, { format: 'png', result: 'tmpfile', width: IMAGE_WIDTH });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: deck.name });
    } catch {
      setError(true);
    } finally {
      setSharing(false);
    }
  };

  const shareText = () =>
    Share.share({
      message: `${deck.name} (${formatLabel(deck.format)})\n` + cards.map((c) => `${c.quantity} ${c.name}`).join('\n'),
    });

  const copyForArena = async () => {
    const { text, skipped } = arenaDeckList(cards, usesCommander);
    await Clipboard.setStringAsync(text);
    setArenaNote(
      'Copiado. En MTG Arena: Mazos → Importar.' +
        (skipped.length
          ? ` No se incluyen ${skipped.length} que no existen en Arena: ${skipped.map(displayName).join(', ')}.`
          : ''),
    );
  };

  const width = Math.min(screenWidth - 24, 420);
  const curveMax = Math.max(1, ...stats.curve.map((c) => c.creatures + c.others));
  const symbolTotal = COLOR_KEYS.reduce((s, c) => s + stats.symbols[c], 0);
  const showPrice = prefs.pricesDeck && price.priced > 0;
  const featuredWidth = featured.length > 1 ? (width - 32 - (featured.length - 1) * 8) / featured.length : 150;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver" style={styles.headerButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Compartir mazo</Text>
        </View>

        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 12 }}>
          {/* Everything inside this View is the picture. */}
          <View ref={shotRef} collapsable={false} style={[styles.shot, { width }]}>
            <View style={styles.banner}>
              {deck.coverImage && (
                <Image
                  source={{ uri: artCropUrl(deck.coverImage) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  onLoad={onImage}
                  onError={onImage}
                />
              )}
              <View style={styles.bannerShade} />
              <View style={styles.bannerText}>
                <Text style={styles.deckName} numberOfLines={2}>
                  {deck.name}
                </Text>
                <Text style={styles.deckMeta}>
                  {formatLabel(deck.format)} · {stats.total} cartas
                  {showPrice ? ` · ≈ ${formatEur(price.eur)}` : ''}
                </Text>
              </View>
            </View>

            {featured.length > 0 && (
              <View style={[styles.featured, featured.length === 1 && { justifyContent: 'flex-start' }]}>
                {featured.map((c) => (
                  <Image
                    key={c.oracleId}
                    source={{ uri: c.imageUrl! }}
                    style={[styles.featuredImage, { width: featuredWidth, height: featuredWidth * CARD_RATIO }]}
                    contentFit="cover"
                    onLoad={onImage}
                    onError={onImage}
                  />
                ))}
                {featured.length === 1 && (
                  <View style={{ flex: 1, gap: 10 }}>
                    <Text style={styles.featuredLabel}>{commanders.length ? 'Comandante' : 'Carta destacada'}</Text>
                    <Text style={styles.featuredName}>{displayName(featured[0])}</Text>
                    <StatsBlock stats={stats} curveMax={curveMax} symbolTotal={symbolTotal} />
                  </View>
                )}
              </View>
            )}
            {featured.length !== 1 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <StatsBlock stats={stats} curveMax={curveMax} symbolTotal={symbolTotal} />
              </View>
            )}

            <View style={styles.list}>
              {groups.map((g) => (
                <View key={g.type} style={styles.group}>
                  <Text style={styles.groupTitle}>
                    {TYPE_GROUP_LABELS[g.type]} ({g.cards.reduce((s, c) => s + c.quantity, 0)})
                  </Text>
                  {g.cards.map((c) => (
                    <Text key={c.oracleId} style={styles.line} numberOfLines={1}>
                      <Text style={styles.qty}>{c.quantity} </Text>
                      {displayName(c)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <Image source={LOGO_MARK} style={styles.logo} contentFit="contain" />
              <Text style={styles.footerText}>Hecho con Magic Swipe</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.buttons, { paddingBottom: insets.bottom + 12 }]}>
          {error && <Text style={styles.error}>No se pudo crear la imagen. Inténtalo otra vez.</Text>}
          {arenaNote && <Text style={styles.arenaNote}>{arenaNote}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[styles.button, { flex: 1 }]} onPress={shareText}>
              <MaterialCommunityIcons name="text-box-outline" size={20} color={colors.text} />
              <Text style={styles.buttonText}>Texto</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { flex: 1 }]}
              onPress={copyForArena}
              accessibilityLabel="Copiar para MTG Arena"
            >
              <MaterialCommunityIcons name="content-copy" size={20} color={colors.text} />
              <Text style={styles.buttonText}>Arena</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primary, { flex: 2 }, (!ready || sharing) && { opacity: 0.5 }]}
              onPress={shareImage}
              disabled={!ready || sharing}
            >
              {sharing || !ready ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <MaterialCommunityIcons name="image-outline" size={20} color={colors.bg} />
              )}
              <Text style={[styles.buttonText, { color: colors.bg }]}>
                {ready ? 'Compartir imagen' : 'Cargando imágenes…'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatsBlock({
  stats,
  curveMax,
  symbolTotal,
}: {
  stats: ReturnType<typeof deckStats>;
  curveMax: number;
  symbolTotal: number;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.tiles}>
        <Tile value={String(stats.lands)} label="tierras" />
        <Tile value={stats.averageCost.toFixed(2).replace('.', ',')} label="coste medio" />
      </View>
      <View style={styles.curve}>
        {stats.curve.map((c, i) => {
          const n = c.creatures + c.others;
          return (
            <View key={i} style={styles.curveColumn}>
              <Text style={styles.curveCount}>{n || ''}</Text>
              <View style={styles.curveArea}>
                {n > 0 && <View style={[styles.curveBar, { height: `${(n / curveMax) * 100}%` }]} />}
              </View>
              <Text style={styles.curveLabel}>{i === CURVE_MAX ? `${CURVE_MAX}+` : i}</Text>
            </View>
          );
        })}
      </View>
      {symbolTotal > 0 && (
        <View style={styles.colors}>
          {COLOR_KEYS.filter((c) => stats.symbols[c] > 0).map((c) => (
            <View key={c} style={styles.colorItem}>
              <Image source={MANA_ICONS[c]} style={styles.mana} contentFit="contain" />
              <Text style={styles.colorPct}>{Math.round((stats.symbols[c] / symbolTotal) * 100)} %</Text>
            </View>
          ))}
        </View>
      )}
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

  shot: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  banner: { height: 170, justifyContent: 'flex-end', backgroundColor: colors.surfaceAlt },
  bannerShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,16,28,0.45)' },
  bannerText: { padding: 16, gap: 4 },
  deckName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  deckMeta: { color: colors.accent, fontSize: 14, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  featured: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, justifyContent: 'center' },
  featuredImage: { borderRadius: 8 },
  featuredLabel: { color: colors.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  featuredName: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: -6 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tileValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  tileLabel: { color: colors.textMuted, fontSize: 10 },
  curve: { flexDirection: 'row', gap: 3, height: 74 },
  curveColumn: { flex: 1 },
  curveCount: { color: colors.text, fontSize: 9, fontWeight: '800', textAlign: 'center', height: 12 },
  curveArea: { flex: 1, justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border },
  curveBar: { backgroundColor: colors.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  curveLabel: { color: colors.textMuted, fontSize: 9, textAlign: 'center', marginTop: 2 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mana: { width: 18, height: 18 },
  colorPct: { color: colors.text, fontSize: 12, fontWeight: '800' },
  list: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 14, columnGap: 12, rowGap: 12 },
  group: { width: '47%', gap: 1 },
  groupTitle: { color: colors.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 2 },
  line: { color: colors.text, fontSize: 11 },
  qty: { color: colors.textMuted, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  logo: { width: 28, height: 28 / LOGO_MARK_RATIO },
  footerText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

  buttons: {
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  error: { color: colors.discard, fontSize: 12, textAlign: 'center' },
  arenaNote: { color: colors.add, fontSize: 12, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '900' },
});
