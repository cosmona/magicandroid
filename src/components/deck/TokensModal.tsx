import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { displayName, getCardsByIds, smallImageUrl, type CardDetails } from '@/api/scryfall';
import type { DeckCard } from '@/db/database';
import { CARD_RATIO } from '@/components/SwipeCard';
import { colors } from '@/theme';
import { PrintSheet } from '@/components/deck/PrintSheet';

interface DeckToken {
  id: string;
  name: string;
  typeLine: string;
  /** Cartas del mazo que la crean. */
  makers: string[];
}

/** Fichas y emblemas que crean las cartas del mazo (de `all_parts` de Scryfall), con sus imágenes. */
export function deckTokens(cards: DeckCard[], details: Record<string, CardDetails>): DeckToken[] {
  // La misma ficha tiene muchas impresiones: agrupar por nombre + línea de tipo.
  const byKey = new Map<string, DeckToken>();
  for (const card of cards) {
    for (const t of details[card.scryfallId]?.tokens ?? []) {
      const key = `${t.name}|${t.typeLine}`;
      const token = byKey.get(key) ?? { ...t, makers: [] };
      const maker = displayName(card);
      if (!token.makers.includes(maker)) token.makers.push(maker);
      byKey.set(key, token);
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function TokensModal({ tokens, onClose, deckName }: { tokens: DeckToken[]; onClose: () => void; deckName?: string }) {
  const [printing, setPrinting] = useState(false);
  const ids = useMemo(() => tokens.map((t) => t.id), [tokens]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCardsByIds(ids)
      .then((cards) => {
        if (cancelled) return;
        const out: Record<string, string> = {};
        for (const c of cards) if (c.imageUrl) out[c.id] = c.imageUrl;
        setImages(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.box} onPress={() => {}}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="cards-outline" size={22} color={colors.accent} />
            <Text style={styles.title}>Fichas del mazo ({tokens.length})</Text>
            <Pressable onPress={() => setPrinting(true)} hitSlop={10} accessibilityLabel="Imprimir fichas (PDF)">
              <MaterialCommunityIcons name="printer-outline" size={22} color={colors.accent} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <MaterialCommunityIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <FlatList
            data={tokens}
            keyExtractor={(t) => t.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 12 }}
            renderItem={({ item }) => (
              <Pressable style={styles.token} onPress={() => images[item.id] && setPreview(images[item.id])}>
                <View style={styles.imageBox}>
                  {images[item.id] && (
                    <Image
                      source={{ uri: smallImageUrl(images[item.id]) }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  )}
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.makers} numberOfLines={2}>
                  {item.makers.join(', ')}
                </Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>

      {printing && (
        <PrintSheet
          title={`Fichas${deckName ? ` · ${deckName}` : ''}`}
          tokens
          cards={tokens.map((t) => ({ name: t.name, image: images[t.id] ?? null, copies: 1 }))}
          onClose={() => setPrinting(false)}
        />
      )}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.previewImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  token: { flex: 1, gap: 2 },
  imageBox: {
    width: '100%',
    aspectRatio: 1 / CARD_RATIO,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  name: { color: colors.text, fontWeight: '800' },
  makers: { color: colors.textMuted, fontSize: 11 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewImage: { width: '100%', aspectRatio: 1 / CARD_RATIO, borderRadius: 16 },
});
