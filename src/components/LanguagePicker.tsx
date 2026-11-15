import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { displayName, getCardLanguages, LANGUAGE_NAMES, type Card } from '@/api/scryfall';
import { colors } from '@/theme';

const languageName = (lang: string) => LANGUAGE_NAMES[lang] ?? lang.toUpperCase();

/**
 * "🌐 English ▾" pill above the card. Opens the languages Scryfall has for this card
 * (loaded on demand, cached) and swaps the card for the chosen printing.
 */
export function LanguagePicker({ card, onChange }: { card: Card; onChange: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Card[] | null>(null);
  const [error, setError] = useState(false);

  const show = () => {
    setOpen(true);
    setOptions(null);
    setError(false);
    getCardLanguages(card)
      .then((list) => {
        setOptions(list);
        // Warm the cache so the chosen language appears instantly.
        Image.prefetch(list.map((c) => c.imageUrl).filter((u): u is string => !!u));
      })
      .catch(() => setError(true));
  };

  return (
    <>
      <Pressable style={styles.pill} onPress={show} hitSlop={6}>
        <Text style={styles.pillText}>🌐 {languageName(card.lang)} ▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Idiomas disponibles</Text>
            {error ? (
              <Text style={styles.message}>No se pudieron cargar los idiomas. Inténtalo de nuevo.</Text>
            ) : !options ? (
              <ActivityIndicator color={colors.accent} style={{ padding: 24 }} />
            ) : (
              <FlatList
                data={options}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.option, item.lang === card.lang && styles.optionSelected]}
                    onPress={() => {
                      setOpen(false);
                      if (item.id !== card.id) onChange(item);
                    }}
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
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
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
