import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { displayName, smallImageUrl, type Card } from '@/api/scryfall';
import { LanguagePill } from '@/components/LanguagePicker';
import { OwnPill } from '@/components/collection/OwnButton';
import { InDeckBadge } from '@/components/deck/InDeckBadge';
import { colors } from '@/theme';

/** Qué pasó con una carta que el usuario ya deslizó. */
export type Decision = 'added' | 'discarded';

interface Props {
  cards: Card[];
  /** Posición de la carta actual en `cards`. */
  index: number;
  /** Decisión por id de carta (las cartas se pueden revisitar, así que cualquier posición puede tener una). */
  decisions: Record<string, Decision>;
  /** Scryfall tiene más páginas para esta búsqueda. */
  hasMore: boolean;
  /** Pide a la cola que cargue al menos tantas cartas. */
  onNeedMore: (count: number) => void;
  /** Tocar una miniatura: lleva el constructor a esa carta. */
  onSelect: (position: number) => void;
}

const COLUMNS = 4;
const UPCOMING = 20;
/** Cartas próximas extra que se muestran cada vez que se hace scroll hasta el final de la lista. */
const STEP = 40;
const GAP = 6;
const PADDING = 10;
const CARD_RATIO = 680 / 488;
const LABEL_HEIGHT = 18;

const BADGES: Record<Decision, { label: string; color: string }> = {
  added: { label: '✓', color: colors.add },
  discarded: { label: '✕', color: colors.discard },
};

/** `skipped` = pasada con las flechas, sin decisión. */
type Status = 'current' | 'upcoming' | 'skipped';
interface Thumb {
  card: Card;
  position: number;
  status: Status;
  decision?: Decision;
}

/**
 * Rejilla de miniaturas: cartas deslizadas (con su decisión), la actual resaltada, y las siguientes. Usa
 * las imágenes `small` de ~15 KB de Scryfall y una lista virtualizada de filas de altura fija, abierta ya
 * desplazada hasta la carta actual. Tocar = ir a esa carta, pulsación larga = verla en grande.
 */
export function HistorySheet({ cards, index, decisions, hasMore, onNeedMore, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<Thumb | null>(null);
  const [previewPrinting, setPreviewPrinting] = useState<Card | null>(null);
  // Cartas próximas mostradas tras la actual; crece según el usuario baja.
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
    // Nada más que revelar: se muestra todo lo cargado y Scryfall no tiene más páginas.
    if (wantedCount >= cards.length && !hasMore) return;
    const next = ahead + STEP;
    setAhead(next);
    onNeedMore(index + 1 + next);
  };
  // Cartas pedidas pero aún no descargadas.
  const waiting = thumbs.length < wantedCount && hasMore;

  // Las troceamos en filas nosotros para que getItemLayout/initialScrollIndex sean exactos.
  const rows = useMemo(() => {
    const out: Thumb[][] = [];
    for (let i = 0; i < thumbs.length; i += COLUMNS) out.push(thumbs.slice(i, i + COLUMNS));
    return out;
  }, [thumbs]);
  const currentRow = Math.floor(index / COLUMNS);

  // Precalienta la caché de las miniaturas justo alrededor de la carta actual.
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
                onLongPress={() => {
                  setPreview(t);
                  setPreviewPrinting(null);
                }}
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
                source={{ uri: previewPrinting?.imageUrl ?? preview.card.imageUrl ?? undefined }}
                // Muestra la miniatura cacheada al instante mientras carga la imagen completa.
                placeholder={preview.card.imageUrl ? { uri: smallImageUrl(preview.card.imageUrl) } : undefined}
                placeholderContentFit="contain"
                style={styles.previewImage}
                contentFit="contain"
                transition={150}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <LanguagePill
                  card={preview.card}
                  lang={previewPrinting?.lang ?? preview.card.lang}
                  onPick={setPreviewPrinting}
                />
                <OwnPill card={previewPrinting ?? preview.card} />
              </View>
              <InDeckBadge oracleId={preview.card.oracleId} />
              <Text style={styles.previewText}>
                {displayName(previewPrinting ?? preview.card)} ·{' '}
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
