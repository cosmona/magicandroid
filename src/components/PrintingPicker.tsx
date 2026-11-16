import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Card } from '@/api/scryfall';
import { ArtPickerModal } from '@/components/ArtPicker';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import { colors } from '@/theme';

/**
 * One button for deck and collection rows (their button row has no room for two): asks
 * "Arte" or "Idioma", then opens that picker. `onPick` gets the chosen printing.
 */
export function PrintingPicker({
  scryfallId,
  name,
  onPick,
  onClose,
}: {
  scryfallId: string;
  name: string;
  onPick: (card: Card) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'ask' | 'art' | 'language'>('ask');
  const pick = (card: Card) => {
    onClose();
    if (card.id !== scryfallId) onPick(card);
  };

  if (mode === 'art') return <ArtPickerModal card={scryfallId} onPick={pick} onClose={onClose} />;
  if (mode === 'language') return <LanguagePickerModal card={scryfallId} onPick={pick} onClose={onClose} />;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.row}>
            <Option
              icon="palette-outline"
              label="Arte"
              help="Otra ilustración o edición"
              onPress={() => setMode('art')}
            />
            <Option
              icon="translate"
              label="Idioma"
              help="La carta en otro idioma"
              onPress={() => setMode('language')}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option(props: { icon: 'palette-outline' | 'translate'; label: string; help: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]} onPress={props.onPress}>
      <MaterialCommunityIcons name={props.icon} size={30} color={colors.accent} />
      <Text style={styles.label}>{props.label}</Text>
      <Text style={styles.help}>{props.help}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: {
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: '900' },
  help: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
});
