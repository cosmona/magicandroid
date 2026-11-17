import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCardInLanguage, resolveCardList, type Card } from '@/api/scryfall';
import { useAppState } from '@/context/AppState';
import {
  addCardToDeck,
  addCardToSideboard,
  addToCollection,
  changeQuantity,
  createDeck,
  setCommander,
} from '@/db/database';
import { parseDeckList } from '@/deck/importList';
import { colors } from '@/theme';

type Step =
  | { kind: 'edit' }
  | { kind: 'working'; message: string }
  | { kind: 'done'; imported: number; notFound: string[] }
  | { kind: 'error'; message: string };

const EXAMPLE = `Commander
1 Atraxa, Praetors' Voice

Deck
4 Lightning Bolt (M11) 149
1x Sol Ring
Swords to Plowshares`;

/**
 * Paste a deck list (MTG Arena, MTGO, Moxfield, Archidekt or plain "4 Name" lines) and turn it
 * into a new deck (`target="deck"`) or add it to the collection (`target="collection"`).
 */
export function ImportListModal({ target, onClose }: { target: 'deck' | 'collection'; onClose: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { prefs, refresh, setActiveDeckId } = useAppState();
  const [text, setText] = useState('');
  const [deckName, setDeckName] = useState('');
  const [translate, setTranslate] = useState(prefs.language !== 'en');
  const [step, setStep] = useState<Step>({ kind: 'edit' });

  const parsed = useMemo(() => parseDeckList(text), [text]);
  const copies = parsed.cards.reduce((n, c) => n + c.quantity, 0);
  const hasCommander = parsed.cards.some((c) => c.commander);
  const sideCopies = parsed.sideboard.reduce((n, c) => n + c.quantity, 0);
  // ~40 cards without a commander: a draft / sealed deck (Arena exports the rest of the pool as sideboard).
  const looksLimited = !hasCommander && copies >= 38 && copies <= 45;
  // The sideboard only goes into decks; the collection gets the main list.
  const withSide = target === 'deck';

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) setText(clip);
  };

  const run = async () => {
    try {
      setStep({ kind: 'working', message: 'Buscando las cartas en Scryfall…' });
      const lines = withSide ? [...parsed.cards, ...parsed.sideboard] : parsed.cards;
      const found = await resolveCardList(lines);

      // In the preferred language when asked (one lookup per different card; slow for big lists).
      const localized = new Map<string, Card>();
      if (translate && prefs.language !== 'en') {
        const unique = [...new Map(found.filter((c): c is Card => !!c).map((c) => [c.id, c])).values()];
        for (const [i, card] of unique.entries()) {
          setStep({ kind: 'working', message: `Pasando a tu idioma ${i + 1} / ${unique.length}…` });
          const local = await getCardInLanguage(card, prefs.language).catch(() => null);
          if (local) localized.set(card.id, local);
        }
      }

      setStep({ kind: 'working', message: 'Guardando…' });
      const notFound: string[] = [];
      let imported = 0;
      let deckId: number | null = null;
      if (target === 'deck') {
        const name = deckName.trim() || parsed.name || 'Mazo importado';
        deckId = await createDeck(db, name, hasCommander ? 'commander' : looksLimited ? 'limited' : null);
      }
      for (const [i, line] of lines.entries()) {
        const english = found[i];
        if (!english) {
          notFound.push(line.name);
          continue;
        }
        const card = localized.get(english.id) ?? english;
        if (deckId !== null && i >= parsed.cards.length) {
          await addCardToSideboard(db, deckId, card, line.quantity);
        } else if (deckId !== null) {
          await addCardToDeck(db, deckId, card);
          if (line.quantity > 1) await changeQuantity(db, deckId, card.oracleId, line.quantity - 1);
          if (line.commander) await setCommander(db, deckId, card.oracleId, true);
        } else {
          await addToCollection(db, card, 'paper', line.quantity);
        }
        imported += line.quantity;
      }
      if (deckId !== null) setActiveDeckId(deckId);
      else await refresh();
      setStep({ kind: 'done', imported, notFound });
    } catch {
      setStep({ kind: 'error', message: 'No se pudo importar. Comprueba la conexión e inténtalo otra vez.' });
    }
  };

  const title = target === 'deck' ? 'Importar mazo' : 'Importar a la colección';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver" style={styles.headerButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        {step.kind === 'working' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.value}>{step.message}</Text>
          </View>
        ) : step.kind === 'done' ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.result}>
              <MaterialCommunityIcons name="check-circle-outline" size={40} color={colors.add} />
              <Text style={styles.resultTitle}>
                {step.imported} {step.imported === 1 ? 'carta importada' : 'cartas importadas'}
              </Text>
              <Text style={styles.help}>
                {target === 'deck'
                  ? 'El mazo nuevo ya está abierto. Cambia su nombre o formato con ✏️.'
                  : 'Ya están en tu colección.'}
              </Text>
            </View>
            {step.notFound.length > 0 && (
              <View style={styles.box}>
                <Text style={styles.warnTitle}>No encontradas ({step.notFound.length})</Text>
                <Text style={styles.help}>Revisa que el nombre esté en inglés y bien escrito.</Text>
                <Text style={styles.value}>{step.notFound.join('\n')}</Text>
              </View>
            )}
            <Pressable style={[styles.button, styles.primary]} onPress={onClose}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Listo</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.help}>
              Pega una lista exportada de MTG Arena, Moxfield, Archidekt o MTGO, o escríbela con una carta por línea («4
              Lightning Bolt»). Los nombres en inglés o en el idioma de la exportación de Arena.
            </Text>
            <Pressable style={styles.button} onPress={paste}>
              <MaterialCommunityIcons name="content-paste" size={20} color={colors.text} />
              <Text style={styles.buttonText}>Pegar del portapapeles</Text>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={EXAMPLE}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />
            <Text style={styles.help}>
              {copies > 0
                ? `${copies} cartas en ${parsed.cards.length} líneas` +
                  (hasCommander ? ' · con comandante' : '') +
                  (sideCopies
                    ? withSide
                      ? ` · ${sideCopies} en el banquillo`
                      : ` · ${sideCopies} del banquillo no se importan`
                    : '') +
                  (withSide && looksLimited ? ' · se creará en formato Limitado' : '') +
                  (parsed.skipped ? ` · ${parsed.skipped} de «quizás» no se importan` : '') +
                  (parsed.unreadable.length ? ` · ${parsed.unreadable.length} líneas no se entienden` : '')
                : 'Aún no hay cartas.'}
            </Text>

            {target === 'deck' && (
              <TextInput
                value={deckName}
                onChangeText={setDeckName}
                placeholder={parsed.name ?? 'Nombre del mazo'}
                placeholderTextColor={colors.textMuted}
                style={styles.nameInput}
              />
            )}
            {prefs.language !== 'en' && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>En tu idioma</Text>
                  <Text style={styles.help}>Busca cada carta en tu idioma. Con listas largas tarda un poco.</Text>
                </View>
                <Switch
                  value={translate}
                  onValueChange={setTranslate}
                  trackColor={{ true: colors.accent, false: colors.border }}
                />
              </View>
            )}
            {step.kind === 'error' && <Text style={styles.error}>{step.message}</Text>}
            <Pressable
              style={[styles.button, styles.primary, copies === 0 && { opacity: 0.4 }]}
              onPress={run}
              disabled={copies === 0}
            >
              <MaterialCommunityIcons name="import" size={20} color={colors.bg} />
              <Text style={[styles.buttonText, { color: colors.bg }]}>
                {target === 'deck' ? 'Crear el mazo' : 'Añadir a la colección'}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
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
  content: { padding: 14, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  value: { color: colors.text, fontSize: 15 },
  help: { color: colors.textMuted, fontSize: 12 },
  input: {
    minHeight: 220,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  nameInput: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  error: { color: colors.discard, textAlign: 'center' },
  result: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  resultTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  box: {
    gap: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.undo,
    backgroundColor: colors.surface,
  },
  warnTitle: { color: colors.undo, fontWeight: '900' },
});
