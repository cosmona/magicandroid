// Ajustes → Apariencia: elige un tema y (opcionalmente) ajusta cada color, igual que en el PC y con
// los mismos tokens. La paleta se lee una vez al arrancar (theme.ts), así que los cambios se guardan al
// momento y se aplican al reabrir la app (un aviso y un botón «Reiniciar» lo dejan claro).
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  appearance,
  COLOR_GROUPS,
  COLOR_LABELS,
  THEMES,
  colors,
  normalizeAppearance,
  paletteOf,
  reloadApp,
  saveAppearanceSync,
  type Appearance,
  type ColorToken,
  type ThemeKey,
} from '@/theme';

const HEX = /^#([0-9a-fA-F]{6})$/;

export function AppearanceSettings() {
  // La apariencia que se está editando (parte de la que está en uso), guardada en cada cambio.
  const [appr, setAppr] = useState<Appearance>(appearance);
  const [editing, setEditing] = useState<ColorToken | null>(null);
  const palette = paletteOf(appr);

  const apply = (next: Appearance) => {
    const norm = normalizeAppearance(next);
    setAppr(norm);
    saveAppearanceSync(norm);
  };
  const pickTheme = (theme: ThemeKey) => apply({ ...appr, theme });
  const setColor = (token: ColorToken, value: string) => apply({ ...appr, colors: { ...appr.colors, [token]: value } });
  const resetColor = (token: ColorToken) => {
    const rest = { ...appr.colors };
    delete rest[token];
    apply({ ...appr, colors: rest });
  };

  const restart = () => {
    if (!reloadApp()) {
      Alert.alert('Reinicia para aplicar', 'Cierra la app del todo y vuelve a abrirla para ver el tema nuevo.');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {/* Themes */}
      <View style={styles.themeRow}>
        {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
          const t = THEMES[key];
          const on = appr.theme === key;
          return (
            <Pressable key={key} style={[styles.themeCard, on && styles.themeCardOn]} onPress={() => pickTheme(key)}>
              <View style={styles.swatchRow}>
                {(['accent', 'deck', 'collection', 'info', 'discard'] as ColorToken[]).map((tk) => (
                  <View key={tk} style={[styles.miniSwatch, { backgroundColor: t.colors[tk] }]} />
                ))}
              </View>
              <Text style={[styles.themeName, on && { color: colors.accent }]} numberOfLines={1}>
                {t.label}
              </Text>
              {on && <MaterialCommunityIcons name="check-circle" size={16} color={colors.accent} style={styles.themeCheck} />}
            </Pressable>
          );
        })}
      </View>

      {/* Per-color editing, grouped like the PC */}
      {COLOR_GROUPS.map((group) => (
        <View key={group.title} style={{ gap: 6 }}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <Text style={styles.groupHint}>{group.hint}</Text>
          <View style={styles.colorGrid}>
            {group.keys.map((token) => {
              const changed = appr.colors[token] !== undefined;
              return (
                <Pressable key={token} style={styles.colorChip} onPress={() => setEditing(token)}>
                  <View style={[styles.swatch, { backgroundColor: palette[token] }]} />
                  <Text style={styles.colorLabel} numberOfLines={1}>
                    {COLOR_LABELS[token].label}
                    {changed ? ' •' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable style={styles.restartBtn} onPress={restart}>
        <MaterialCommunityIcons name="restart" size={18} color={colors.bg} />
        <Text style={styles.restartText}>Reiniciar para aplicar</Text>
      </Pressable>
      <Text style={styles.note}>
        Los temas y colores se aplican al reabrir la app. El «•» marca un color que has cambiado a mano.
      </Text>

      {editing && (
        <ColorEditor
          token={editing}
          value={palette[editing]}
          themeValue={THEMES[appr.theme].colors[editing]}
          changed={appr.colors[editing] !== undefined}
          onChange={(v) => setColor(editing, v)}
          onReset={() => {
            resetColor(editing);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function ColorEditor({
  token,
  value,
  themeValue,
  changed,
  onChange,
  onReset,
  onClose,
}: {
  token: ColorToken;
  value: string;
  themeValue: string;
  changed: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value);
  const valid = HEX.test(text.trim());
  const preview = valid ? text.trim() : value;
  const commit = () => {
    if (valid) onChange(text.trim().toLowerCase());
    onClose();
  };
  // Unos colores útiles (de varios temas) como elección rápida.
  const quick = ['#c9a227', '#2ec4b6', '#a78bfa', '#5aa9e6', '#2ecc71', '#e74c3c', '#f1c40f', '#ff7a9c', '#e8c547', '#e0a458', '#ffffff', '#14101c'];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.editor} onPress={() => {}}>
          <Text style={styles.editorTitle}>{COLOR_LABELS[token].label}</Text>
          <Text style={styles.editorHint}>{COLOR_LABELS[token].hint}</Text>
          <View style={styles.previewRow}>
            <View style={[styles.previewSwatch, { backgroundColor: preview }]} />
            <TextInput
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="#rrggbb"
              placeholderTextColor={colors.textMuted}
              style={[styles.hexInput, !valid && text.length > 0 && { borderColor: colors.discard }]}
              onSubmitEditing={commit}
            />
          </View>
          <View style={styles.quickRow}>
            {quick.map((c) => (
              <Pressable key={c} style={[styles.quickSwatch, { backgroundColor: c }]} onPress={() => setText(c)} />
            ))}
          </View>
          <View style={styles.editorButtons}>
            {changed && (
              <Pressable style={[styles.editorBtn, styles.editorBtnGhost]} onPress={onReset}>
                <Text style={styles.editorBtnGhostText}>Como el tema ({themeValue})</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable style={[styles.editorBtn, styles.editorBtnGhost]} onPress={onClose}>
              <Text style={styles.editorBtnGhostText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.editorBtn, { backgroundColor: colors.accent, opacity: valid ? 1 : 0.5 }]} onPress={commit} disabled={!valid}>
              <Text style={{ color: colors.bg, fontWeight: '800' }}>Usar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeCard: { width: '31%', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, gap: 6, backgroundColor: colors.surface },
  themeCardOn: { borderColor: colors.accent, borderWidth: 2 },
  swatchRow: { flexDirection: 'row', gap: 3 },
  miniSwatch: { width: 12, height: 12, borderRadius: 3 },
  themeName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  themeCheck: { position: 'absolute', top: 6, right: 6 },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  groupHint: { color: colors.textMuted, fontSize: 12 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.surface, minWidth: '47%', flexGrow: 1 },
  swatch: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
  colorLabel: { color: colors.text, fontSize: 12, flex: 1 },
  restartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 11, marginTop: 4 },
  restartText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  editor: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  editorTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  editorHint: { color: colors.textMuted, fontSize: 13 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewSwatch: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  hexInput: { flex: 1, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickSwatch: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  editorButtons: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  editorBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  editorBtnGhost: { borderWidth: 1, borderColor: colors.border },
  editorBtnGhostText: { color: colors.text, fontWeight: '700' },
});
