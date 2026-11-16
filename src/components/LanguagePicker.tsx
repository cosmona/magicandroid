import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  displayName,
  getCardLanguages,
  getCardsByIds,
  getCardsByNames,
  LANGUAGE_NAMES,
  type Card,
} from '@/api/scryfall';
import { colors } from '@/theme';

export const languageName = (lang: string) => LANGUAGE_NAMES[lang] ?? lang.toUpperCase();

/** A card to look up: the printing itself, its Scryfall id, or just its English name. */
export type CardRef = Card | string | { name: string };

async function resolveRef(ref: CardRef): Promise<Card | null> {
  if (typeof ref === 'string') return (await getCardsByIds([ref]))[0] ?? null;
  if ('id' in ref) return ref;
  return (await getCardsByNames([ref.name]))[0] ?? null;
}

/**
 * "🌐 Español ▾" pill for any enlarged card (card info, combos, sample hand, deck preview…):
 * opens the card's languages and hands the chosen printing to `onPick`.
 */
export function LanguagePill({ card, lang, onPick }: { card: CardRef; lang?: string; onPick: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.pill} onPress={() => setOpen(true)} hitSlop={6} accessibilityLabel="Cambiar idioma">
        <MaterialCommunityIcons name="translate" size={16} color={colors.text} />
        <Text style={styles.pillText}>{lang ? languageName(lang) : 'Idioma'}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      {open && (
        <LanguagePickerModal
          card={card}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            setOpen(false);
            onPick(item);
          }}
        />
      )}
    </>
  );
}

/**
 * "🌐 English ▾" pill above the card. Opens the languages Scryfall has for this card
 * (loaded on demand, cached) and swaps the card for the chosen printing.
 */
export function LanguagePicker({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.pill} onPress={() => setOpen(true)} hitSlop={6}>
        <MaterialCommunityIcons name="translate" size={16} color={colors.text} />
        <Text style={styles.pillText}>{languageName(card.lang)}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      {open && (
        <LanguagePickerModal
          card={card}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            setOpen(false);
            if (item.id !== card.id) onChange(item);
          }}
        />
      )}
    </>
  );
}

/**
 * The languages a card exists in, as a popup list; `card` is the printing on screen, its Scryfall
 * id (deck and collection rows) or its English name (combos), loaded first. Calls `onPick` with
 * the chosen printing.
 */
export function LanguagePickerModal({
  card,
  onPick,
  onClose,
}: {
  card: CardRef;
  onPick: (card: Card) => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState<Card | null>(typeof card !== 'string' && 'id' in card ? card : null);
  const [options, setOptions] = useState<Card[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refKey = typeof card === 'string' ? card : 'id' in card ? card.id : `name:${card.name}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await resolveRef(card);
      if (!current) throw new Error('not found');
      if (cancelled) return;
      setBase(current);
      const list = await getCardLanguages(current);
      if (cancelled) return;
      setOptions(list);
      // Warm the cache so the chosen language appears instantly.
      Image.prefetch(list.map((c) => c.imageUrl).filter((u): u is string => !!u));
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // Keyed by identity, not object: callers may pass a fresh `{ name }` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, attempt]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Idiomas disponibles</Text>
          {error ? (
            <Pressable
              onPress={() => {
                setError(false);
                setAttempt((a) => a + 1);
              }}
            >
              <Text style={styles.message}>No se pudieron cargar los idiomas. Toca para reintentar.</Text>
            </Pressable>
          ) : !options || !base ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 24 }} />
          ) : (
            <FlatList
              data={options}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.lang === base.lang && styles.optionSelected]}
                  onPress={() => onPick(item)}
                >
                  <Text style={styles.optionLang}>{languageName(item.lang)}</Text>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {displayName(item)} · {item.set.toUpperCase()}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    maxHeight: '75%',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.textMuted, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 8 },
  message: { color: colors.textMuted, padding: 16 },
  option: { paddingHorizontal: 16, paddingVertical: 11 },
  optionSelected: { backgroundColor: colors.surfaceAlt },
  optionLang: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionName: { color: colors.textMuted, fontSize: 12 },
});
