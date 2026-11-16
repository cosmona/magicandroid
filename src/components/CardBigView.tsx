import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { displayName, getCardInLanguage, getCardsByIds, type Card } from '@/api/scryfall';
import { OwnPill } from '@/components/collection/OwnButton';
import { InDeckBadge } from '@/components/deck/InDeckBadge';
import { LanguagePill } from '@/components/LanguagePicker';
import { CARD_RATIO } from '@/components/SwipeCard';
import { useAppState } from '@/context/AppState';
import { addCardToDeck } from '@/db/database';
import { colors } from '@/theme';

/**
 * A card enlarged from a list (card info synergies, recommendations…), known by its Scryfall id:
 * shown in the preferred language, with 🌐 to switch, "La tengo" for the collection and a
 * button that adds it to the active deck (creating "Mazo sin nombre" if there's none).
 */
export function CardBigView({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useSQLiteContext();
  const { prefs, ensureActiveDeck, refresh } = useAppState();
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [base] = await getCardsByIds([id]);
      if (!base) throw new Error('not found');
      const shown =
        prefs.language !== 'en' ? ((await getCardInLanguage(base, prefs.language).catch(() => null)) ?? base) : base;
      if (!cancelled) setCard(shown);
    })().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id, prefs.language]);

  const addToDeck = async () => {
    if (!card) return;
    setAdding(true);
    try {
      const deck = await ensureActiveDeck();
      const quantity = await addCardToDeck(db, deck.id, card);
      await refresh(deck.id);
      setNote(`Añadida a «${deck.name}» (${quantity} en el mazo)`);
    } catch {
      setNote('No se pudo añadir. Inténtalo otra vez.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {failed ? (
          <Text style={styles.name}>No se pudo cargar la carta.</Text>
        ) : !card ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <>
            {card.imageUrl && (
              <Image
                source={{ uri: card.imageUrl.replace('/normal/', '/large/') }}
                placeholder={{ uri: card.imageUrl }}
                placeholderContentFit="contain"
                style={styles.image}
                contentFit="contain"
              />
            )}
            <Text style={styles.name}>{displayName(card)}</Text>
            <Pressable style={styles.controls} onPress={() => {}}>
              <View style={styles.pills}>
                <LanguagePill card={card} lang={card.lang} onPick={setCard} />
                <OwnPill card={card} />
              </View>
              <InDeckBadge oracleId={card.oracleId} />
              <Pressable
                style={({ pressed }) => [styles.addButton, (pressed || adding) && { opacity: 0.7 }]}
                onPress={addToDeck}
                disabled={adding}
                accessibilityLabel="Añadir al mazo activo"
              >
                {adding ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <MaterialCommunityIcons name="cards-playing-outline" size={20} color={colors.bg} />
                )}
                <Text style={styles.addText}>Añadir al mazo</Text>
              </Pressable>
              {note && <Text style={styles.note}>{note}</Text>}
            </Pressable>
          </>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  image: { width: '100%', maxHeight: '62%', aspectRatio: 1 / CARD_RATIO, borderRadius: 16 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  controls: { alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  addText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  note: { color: colors.add, fontSize: 13, textAlign: 'center' },
});
