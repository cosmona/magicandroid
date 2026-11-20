import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { DEFAULT_FILTERS, LANGUAGE_NAMES, MAIN_LANGUAGES } from '@/api/scryfall';
import { Chip } from '@/components/Button';
import { SyncScreen } from '@/components/SyncScreen';
import { LayoutBuilder } from '@/components/LayoutBuilder';
import { useAppState, type DeckView } from '@/context/AppState';
import { colors } from '@/theme';
import { AppearanceSettings } from '@/components/AppearanceSettings';

const DECK_VIEWS: { key: DeckView; label: string }[] = [
  { key: 'list', label: '☰ Lista' },
  { key: 'gallery', label: '▦ Galería' },
  { key: 'big', label: '▭ Grande' },
  { key: 'text', label: '≡ Texto' },
];

type PricePref = 'pricesDeck' | 'pricesDeckCards' | 'pricesShopping' | 'pricesCollection' | 'pricesCardInfo';
const PRICE_PLACES: { key: PricePref; label: string; hint: string }[] = [
  { key: 'pricesDeck', label: 'Precio del mazo', hint: 'En la barra y la cabecera del mazo.' },
  { key: 'pricesDeckCards', label: 'Cartas del mazo', hint: 'El precio de cada carta en las vistas lista y grande.' },
  { key: 'pricesShopping', label: 'Lo que te falta (🛒)', hint: 'El total y el precio de cada carta al comprar.' },
  {
    key: 'pricesCollection',
    label: 'Colección',
    hint: 'Valor total, de cada grupo y de cada carta, y el filtro y la agrupación por precio.',
  },
  { key: 'pricesCardInfo', label: 'Ficha completa', hint: 'La sección «Precios» de la ficha de una carta.' },
];

/** Ajustes de la app, guardados en SQLite (`prefs`). */
export function SettingsSheet() {
  const { prefs, setPrefs, setFilters } = useAppState();
  const [building, setBuilding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const resetFilters = () =>
    Alert.alert('Restablecer filtros', '¿Quitar todos los filtros de búsqueda?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restablecer', style: 'destructive', onPress: () => setFilters(DEFAULT_FILTERS) },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Ajustes</Text>

      <Section title="Apariencia" hint="El tema de colores de la app y, si quieres, cada color por separado (como en el PC). Se aplica al reabrir la app.">
        <AppearanceSettings />
      </Section>

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

      <Section title="Cartas y listas" hint="Qué datos salen en cada línea de las listas y dónde va cada icono en las galerías (mazo y colección).">
        <Pressable style={styles.linkButton} onPress={() => setBuilding(true)}>
          <Text style={[styles.linkText, { color: colors.accent }]}>Elegir datos e iconos</Text>
        </Pressable>
      </Section>
      <LayoutBuilder visible={building} onClose={() => setBuilding(false)} />

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

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Etiquetas</Text>
          <Text style={styles.hint}>Las etiquetas de las cartas y los mazos en las listas (se pueden poner igualmente).</Text>
        </View>
        <Switch
          value={prefs.showTags !== false}
          onValueChange={(showTags) => setPrefs({ ...prefs, showTags })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Lo que tienes y te falta</Text>
          <Text style={styles.hint}>«Faltan N» del mazo, «En tu colección: 3», «✓ / falta N» y «En Krenko (2) · 1 libre».</Text>
        </View>
        <Switch
          value={prefs.showOwned !== false}
          onValueChange={(showOwned) => setPrefs({ ...prefs, showOwned })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Código de colores</Text>
          <Text style={styles.hint}>Borde verde en las cartas del mazo que tienes y rosa en las que quieres y aún no tienes.</Text>
        </View>
        <Switch
          value={prefs.colorCode !== false}
          onValueChange={(colorCode) => setPrefs({ ...prefs, colorCode })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Mano (beta)</Text>
          <Text style={styles.hint}>
            Pestaña «Mano»: con el móvil en un soporte, la cámara lee los títulos de tu mano y apunta lo que robas y lo que juegas. Está en pruebas: puede equivocarse.
          </Text>
        </View>
        <Switch
          value={!!prefs.handBeta}
          onValueChange={(on) => {
            if (!on) return setPrefs({ ...prefs, handBeta: false });
            Alert.alert(
              'Versión beta',
              'La pestaña «Mano» está en pruebas: el reconocimiento depende de la luz, la cámara y cómo sujetes las cartas, y puede equivocarse. Puedes desactivarla aquí cuando quieras.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Activar', onPress: () => setPrefs({ ...prefs, handBeta: true }) },
              ],
            );
          }}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <Section
        title="Precios"
        hint="Precios orientativos de Cardmarket (Scryfall los actualiza una vez al día). Elige dónde verlos."
      >
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Todos</Text>
            <Text style={styles.hint}>Activa o desactiva todos los precios a la vez.</Text>
          </View>
          <Switch
            value={PRICE_PLACES.some((p) => prefs[p.key])}
            onValueChange={(on) => setPrefs({ ...prefs, ...Object.fromEntries(PRICE_PLACES.map((p) => [p.key, on])) })}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        {PRICE_PLACES.map((p) => (
          <View key={p.key} style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>{p.label}</Text>
              <Text style={styles.hint}>{p.hint}</Text>
            </View>
            <Switch
              value={prefs[p.key]}
              onValueChange={(on) => setPrefs({ ...prefs, [p.key]: on })}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
        ))}
      </Section>

      <Section
        title="Sincronizar con el PC"
        hint="Junta tus mazos y tu colección con Magic Swipe para PC por la Wi-Fi (los dos en la misma red)."
      >
        <Pressable style={[styles.linkButton, styles.syncButton]} onPress={() => setSyncing(true)}>
          <Text style={[styles.linkText, { color: colors.accent }]}>⇄ Sincronizar con el PC</Text>
        </Pressable>
      </Section>

      <Section title="Búsqueda">
        <Pressable style={styles.linkButton} onPress={resetFilters}>
          <Text style={styles.linkText}>Restablecer filtros</Text>
        </Pressable>
      </Section>

      {syncing && <SyncScreen onClose={() => setSyncing(false)} />}

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
  switchLabel: { color: colors.text, fontWeight: '700' },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.discard,
  },
  linkText: { color: colors.discard, fontWeight: '700' },
  syncButton: { borderColor: colors.accent },
  footer: { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 8 },
});
