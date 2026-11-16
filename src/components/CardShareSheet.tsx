import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCardDetails } from '@/api/scryfall';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface ShareableCard {
  /** Scryfall id of the printing. */
  scryfallId: string;
  /** Name shown to people (in the card's language). */
  name: string;
  /** Scryfall `normal` image URL. */
  imageUrl: string | null;
}

/** The printing's page on Scryfall (from its details; falls back to a name search). */
async function scryfallLink(card: ShareableCard): Promise<string> {
  const details = await getCardDetails([card.scryfallId]).catch(() => ({}) as Record<string, never>);
  return (
    details[card.scryfallId]?.scryfallUrl ?? `https://scryfall.com/search?q=${encodeURIComponent(`!"${card.name}"`)}`
  );
}

/**
 * The card's large image as a file in the cache. Uses the native download first and, if that
 * fails, fetches the bytes and writes the file itself.
 */
async function downloadImage(imageUrl: string, id: string): Promise<File> {
  const url = imageUrl.replace('/normal/', '/large/');
  const file = new File(Paths.cache, `carta-${id}.jpg`);
  if (file.exists && file.size) return file;
  try {
    return await File.downloadFileAsync(url, file, { idempotent: true });
  } catch (e) {
    console.warn('[CardShareSheet] downloadFileAsync', e);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Scryfall respondió ${res.status} al pedir la imagen.`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    return file;
  }
}

/**
 * Share a card: its picture (the large Scryfall image as a file, with the link copied to paste
 * next to it), its Scryfall link as text, or just copy the link.
 */
export function CardShareSheet({ card, onClose }: { card: ShareableCard; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setNote(null);
    try {
      await task();
    } catch (e) {
      // Say which step failed: "no connection" was misleading when the problem was elsewhere.
      const detail = e instanceof Error ? e.message : String(e);
      console.warn('[CardShareSheet]', detail);
      setNote(`No se pudo compartir: ${detail}`);
    } finally {
      setBusy(null);
    }
  };

  const shareImage = () =>
    run('image', async () => {
      if (!card.imageUrl) throw new Error('la carta no tiene imagen.');
      if (!(await Sharing.isAvailableAsync())) throw new Error('este móvil no permite compartir archivos.');
      const link = await scryfallLink(card);
      await Clipboard.setStringAsync(`${card.name}\n${link}`);
      const file = await downloadImage(card.imageUrl, card.scryfallId);
      setNote('Enlace de Scryfall copiado: pégalo junto a la imagen.');
      await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg', dialogTitle: card.name });
    });

  const shareLink = () =>
    run('link', async () => {
      const link = await scryfallLink(card);
      await Share.share({ message: `${card.name}\n${link}` });
    });

  const copyLink = () =>
    run('copy', async () => {
      await Clipboard.setStringAsync(await scryfallLink(card));
      setNote('Enlace copiado.');
    });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <Text style={styles.title} numberOfLines={1}>
            Compartir {card.name}
          </Text>
          <Option
            icon="image-outline"
            label="Imagen de la carta"
            help="Envía la imagen y copia el enlace de Scryfall para pegarlo en el mensaje"
            busy={busy === 'image'}
            disabled={!card.imageUrl || !!busy}
            onPress={shareImage}
          />
          <Option
            icon="link-variant"
            label="Enlace de Scryfall"
            help="El nombre y el enlace; WhatsApp y Telegram enseñan la carta al abrirlo"
            busy={busy === 'link'}
            disabled={!!busy}
            onPress={shareLink}
          />
          <Option
            icon="content-copy"
            label="Copiar enlace"
            busy={busy === 'copy'}
            disabled={!!busy}
            onPress={copyLink}
          />
          {note && <Text style={styles.note}>{note}</Text>}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option(props: {
  icon: IconName;
  label: string;
  help?: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, (pressed || props.disabled) && { opacity: props.disabled ? 0.5 : 0.7 }]}
      onPress={props.onPress}
      disabled={props.disabled}
    >
      <View style={styles.optionIcon}>
        {props.busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <MaterialCommunityIcons name={props.icon} size={22} color={colors.accent} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{props.label}</Text>
        {props.help && <Text style={styles.help}>{props.help}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    gap: 10,
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionIcon: { width: 28, alignItems: 'center' },
  optionLabel: { color: colors.text, fontWeight: '800', fontSize: 15 },
  help: { color: colors.textMuted, fontSize: 12 },
  note: { color: colors.add, fontSize: 13, textAlign: 'center' },
  cancel: { alignItems: 'center', justifyContent: 'center', height: 44 },
  cancelText: { color: colors.textMuted, fontWeight: '800' },
});
