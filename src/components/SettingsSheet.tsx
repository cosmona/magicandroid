import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { DEFAULT_FILTERS, LANGUAGE_NAMES, MAIN_LANGUAGES } from '@/api/scryfall';
import { Chip } from '@/components/Button';
import { useAppState, type DeckView } from '@/context/AppState';
import { colors } from '@/theme';

const DECK_VIEWS: { key: DeckView; label: string }[] = [
  { key: 'list', label: '☰ Lista' },
  { key: 'gallery', label: '▦ Galería' },
  { key: 'big', label: '▭ Grande' },
];

/** App settings, saved in SQLite (`prefs`). */
export function SettingsSheet() {
  const { prefs, setPrefs, setFilters } = useAppState();

  const resetFilters = () =>
    Alert.alert('Restablecer filtros', '¿Quitar todos los filtros de búsqueda?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restablecer', style: 'destructive', onPress: () => setFilters(DEFAULT_FILTERS) },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Ajustes</Text>

      <Section
        title="Idioma de las cartas"
        hint="Las cartas se muestran en este idioma si Scryfall lo tiene; si no, en inglés. Puedes cambiarlo en cada carta con 🌐."
      >
        <View style={styles.chips}>
          {MAIN_LANGUAGES.map((lang) => (
            <Chip
              key={lang}
              label={LANGUAGE_NAMES[lang]}
              selected={prefs.language === lang}
              onPress={() => setPrefs({ ...prefs, language: lang })}
            />
          ))}
        </View>
      </Section>

      <Section title="Vista del mazo" hint="Cómo se abre la lista de cartas del mazo.">
        <View style={styles.chips}>
          {DECK_VIEWS.map((v) => (
            <Chip
              key={v.key}
              label={v.label}
              selected={prefs.deckView === v.key}
              onPress={() => setPrefs({ ...prefs, deckView: v.key })}
            />
          ))}
        </View>
      </Section>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Vibración</Text>
          <Text style={styles.hint}>Al añadir o descartar una carta.</Text>
        </View>
        <Switch
          value={prefs.haptics}
          onValueChange={(haptics) => setPrefs({ ...prefs, haptics })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Pantalla completa</Text>
          <Text style={styles.hint}>
            Oculta los botones de Android. Desliza desde el borde inferior para que vuelvan a aparecer.
          </Text>
        </View>
        <Switch
          value={prefs.hideNavBar}
          onValueChange={(hideNavBar) => setPrefs({ ...prefs, hideNavBar })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <Section title="Búsqueda">
        <Pressable style={styles.linkButton} onPress={resetFilters}>
          <Text style={styles.linkText}>Restablecer filtros</Text>
        </Pressable>
      </Section>

      <Text style={styles.footer}>
        Magic Swipe {Constants.expoConfig?.version ?? ''}
        {'\n'}Datos e imágenes de cartas: Scryfall (scryfall.com).
        {'\n'}Magic: The Gathering es una marca de Wizards of the Coast.
      </Text>
    </ScrollView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 22 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.discard,
  },
  linkText: { color: colors.discard, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 8 },
});
