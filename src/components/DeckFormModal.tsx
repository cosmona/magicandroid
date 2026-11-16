import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { colors, FORMATS, SINGLETON_FORMATS } from '@/theme';

interface Props {
  title: string;
  initialName?: string;
  initialFormat?: string | null;
  onCancel: () => void;
  onSubmit: (name: string, format: string | null) => void;
}

/** Name + format form, used for "Nuevo mazo" and for the constructor's save button. Mount it only while visible. */
export function DeckFormModal({ title, initialName = '', initialFormat = null, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [format, setFormat] = useState<string | null>(initialFormat);
  const submit = () => name.trim() && onSubmit(name.trim(), format);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Inner Pressable swallows taps so they don't close the modal. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del mazo"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={submit}
          />
          <Select
            placeholder="Formato"
            value={format}
            onChange={(v) => setFormat(v)}
            options={FORMATS.map((f) => ({ value: f.key, label: f.label, icon: f.icon, tint: true }))}
          />
          <Text style={styles.hint}>
            {!format
              ? 'Sin comprobaciones de formato.'
              : SINGLETON_FORMATS.includes(format)
                ? 'Se comprobará: comandante, tamaño, 1 copia por carta, identidad de color y legalidad.'
                : format === 'limited'
                  ? 'Se comprobará: mínimo 40 cartas. Sin límite de copias ni de legalidad (juegas lo que abriste).'
                  : 'Se comprobará: mínimo 60 cartas, máximo 4 copias (contando el banquillo), banquillo de hasta 15 y legalidad.'}
          </Text>
          <View style={styles.row}>
            <Button label="Cancelar" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button label="Guardar" onPress={submit} disabled={!name.trim()} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
});
