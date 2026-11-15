import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { displayName, smallImageUrl, type Card } from '@/api/scryfall';
import { colors } from '@/theme';

/** What happened to a card the user already swiped. */
export type Decision = 'added' | 'discarded';

interface Props {
  cards: Card[];
  /** Position of the current card in `cards`. */
  index: number;
  /** Decision per card id (cards can be revisited, so any position may have one). */
  decisions: Record<string, Decision>;
  /** Scryfall has more pages for this search. */
  hasMore: boolean;
  /** Ask the queue to load at least this many cards. */
  onNeedMore: (count: number) => void;
  /** Tap on a thumbnail: move the builder to that card. */
  onSelect: (position: number) => void;
}

const COLUMNS = 4;
const UPCOMING = 20;
/** Extra upcoming cards shown each time the list is scrolled to the end. */
const STEP = 40;
const GAP = 6;
const PADDING = 10;
const CARD_RATIO = 680 / 488;
const LABEL_HEIGHT = 18;

const BADGES: Record<Decision, { label: string; color: string }> = {
  added: { label: '✓', color: colors.add },
  discarded: { label: '✕', color: colors.discard },
};

/** `skipped` = passed with the arrows, no decision. */
type Status = 'current' | 'upcoming' | 'skipped';
interface Thumb {
  card: Card;
  position: number;
  status: Status;
  decision?: Decision;
}

/**
 * Grid of thumbnails: swiped cards (with their decision), the current one highlighted,
 * and the next few. Uses Scryfall's ~15 KB `small` images and a virtualized list of
 * fixed-height rows, opened already scrolled to the current card. Tap = go to that card,
 * long press = see it big.
 */
export function HistorySheet({ cards, index, decisions, hasMore, onNeedMore, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<Thumb | null>(null);
  // Upcoming cards shown after the current one; grows as the user scrolls down.
  const [ahead, setAhead] = useState(UPCOMING);
  const wantedCount = index + 1 + ahead;

  const thumbWidth = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const rowHeight = thumbWidth * CARD_RATIO + LABEL_HEIGHT + GAP;

  const thumbs = useMemo<Thumb[]>(
    () =>
      cards.slice(0, wantedCount).map((card, position) => ({
        card,
        position,
        status: position === index ? 'current' : position < index ? 'skipped' : 'upcoming',
        decision: decisions[card.id],
      })),
    [cards, index, decisions, wantedCount],
  );

  const showMore = () => {
    // Nothing more to reveal: everything loaded is shown and Scryfall has no more pages.
    if (wantedCount >= cards.length && !hasMore) return;
    const next = ahead + STEP;
    setAhead(next);
    onNeedMore(index + 1 + next);
  };
  // Cards requested but not downloaded yet.
  const waiting = thumbs.length < wantedCount && hasMore;

  // Chunk into rows ourselves so getItemLayout/initialScrollIndex are exact.
  const rows = useMemo(() => {
    const out: Thumb[][] = [];
    for (let i = 0; i < thumbs.length; i += COLUMNS) out.push(thumbs.slice(i, i + COLUMNS));
    return out;
  }, [thumbs]);
  const currentRow = Math.floor(index / COLUMNS);

  // Warm the cache for the thumbnails right around the current card.
  useEffect(() => {
    const urls = cards
      .slice(Math.max(0, index - 8), index + 1 + UPCOMING)
      .map((c) => c.imageUrl && smallImageUrl(c.imageUrl))
      .filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls);
  }, [cards, index]);

  const counts = useMemo(() => {
    const c = { added: 0, discarded: 0 };
    for (const t of thumbs) if (t.decision) c[t.decision]++;
    return c;
  }, [thumbs]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <Text style={styles.stats}>
          <Text style={{ color: colors.add }}>✓ {counts.added}</Text>
          {'   '}
          <Text style={{ color: colors.discard }}>✕ {counts.discarded}</Text>
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => String(row[0].position)}
        getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
        initialScrollIndex={Math.max(0, currentRow - 1)}
        initialNumToRender={8}
        windowSize={5}
        maxToRenderPerBatch={6}
        removeClippedSubviews
        onEndReached={showMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          waiting ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 16 }} />
          ) : !hasMore && thumbs.length >= cards.length ? (
            <Text style={styles.end}>Fin de los resultados</Text>
          ) : undefined
        }
        contentContainerStyle={{ paddingHorizontal: PADDING, paddingBottom: 16 }}
        renderItem={({ item: row }) => (
          <View style={[styles.row, { height: rowHeight }]}>
            {row.map((t) => (
              <ThumbView
                key={t.card.id}
                thumb={t}
                width={thumbWidth}
                onPress={() => onSelect(t.position)}
                onLongPress={() => setPreview(t)}
              />
            ))}
          </View>
        )}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && (
            <>
              <Image
                source={{ uri: preview.card.imageUrl ?? undefined }}
                // Shows the cached thumbnail instantly while the full image loads.
                placeholder={preview.card.imageUrl ? { uri: smallImageUrl(preview.card.imageUrl) } : undefined}
                placeholderContentFit="contain"
                style={styles.previewImage}
                contentFit="contain"
                transition={150}
              />
              <Text style={styles.previewText}>
                {displayName(preview.card)} ·{' '}
                {preview.decision ? DECISION_TEXT[preview.decision] : STATUS_TEXT[preview.status]}
              </Text>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const DECISION_TEXT: Record<Decision, string> = { added: 'Añadida al mazo', discarded: 'Descartada' };
const STATUS_TEXT: Record<Status, string> = { current: 'Carta actual', upcoming: 'Próxima', skipped: 'Sin decidir' };

function ThumbView(props: { thumb: Thumb; width: number; onPress: () => void; onLongPress: () => void }) {
  const { thumb, width } = props;
  const { card, status, position, decision } = thumb;
  const isCurrent = status === 'current';
  const badge = decision ? BADGES[decision] : null;

  return (
    <Pressable onPress={props.onPress} onLongPress={props.onLongPress} style={{ width }}>
      <View
        style={[
          styles.thumb,
          { height: width * CARD_RATIO },
          isCurrent && styles.thumbCurrent,
          decision === 'added' && !isCurrent && { borderColor: colors.add },
          status === 'upcoming' && !decision && { opacity: 0.55 },
        ]}
      >
        {card.imageUrl && (
          <Image
            source={{ uri: smallImageUrl(card.imageUrl) }}
            style={[StyleSheet.absoluteFill, decision === 'discarded' && !isCurrent && { opacity: 0.4 }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={card.id}
            transition={100}
          />
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.label, isCurrent && styles.labelCurrent]} numberOfLines={1}>
        {isCurrent ? '▶ AHORA' : `#${position + 1}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  stats: { color: colors.textMuted, fontWeight: '800' },
  row: { flexDirection: 'row', gap: GAP },
  thumb: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbCurrent: { borderColor: colors.accent, borderWidth: 3, transform: [{ scale: 1.04 }] },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#111', fontWeight: '900', fontSize: 12 },
  label: { color: colors.textMuted, fontSize: 11, textAlign: 'center', height: LABEL_HEIGHT, lineHeight: LABEL_HEIGHT },
  labelCurrent: { color: colors.accent, fontWeight: '900' },
  end: { color: colors.textMuted, textAlign: 'center', padding: 16 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  previewImage: { width: '100%', aspectRatio: 488 / 680, borderRadius: 16 },
  previewText: { color: colors.text, fontWeight: '700', textAlign: 'center' },
});
