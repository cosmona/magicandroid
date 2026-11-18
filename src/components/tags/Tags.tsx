// Tags the user defines (text, color and icon) to mark cards of the collection, e.g. «Para cambiar»,
// «Prestada», «Foil». Stored in the database (DB v11) and synced with the PC. The icon is saved with
// the PC's name («mdiTagOutline») and shown here as its Material Community glyph («tag-outline»).
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { BottomSheet } from '@/components/BottomSheet';
import { createTag, deleteTag, getCardTags, getDeckTags, getTags, setCardTag, setDeckTag, updateTag, type Tag } from '@/db/database';
import { colors } from '@/theme';

type Glyph = keyof typeof MaterialCommunityIcons.glyphMap;

/** Icons a tag can have (the PC's names). */
export const TAG_ICONS = [
  'mdiTagOutline',
  'mdiStar',
  'mdiHeart',
  'mdiFlash',
  'mdiLightningBolt',
  'mdiSword',
  'mdiShieldOutline',
  'mdiSkull',
  'mdiWater',
  'mdiCrown',
  'mdiSwapHorizontal',
  'mdiCart',
  'mdiTrayArrowDown',
  'mdiDiceMultiple',
  'mdiHexagon',
  'mdiPuzzleOutline',
];

/** Colors offered for a new tag. */
export const TAG_COLORS = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#2ec4b6', '#3498db', '#9b59b6', '#ff7a9c', '#95a5a6'];

/** «mdiTagOutline» → «tag-outline» (unknown names → the tag glyph). */
export function glyphOf(icon: string): Glyph {
  const name = icon.replace(/^mdi/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
  return (name in MaterialCommunityIcons.glyphMap ? name : 'tag-outline') as Glyph;
}

const listeners = new Set<() => void>();
/** Tells every screen showing tags to reload them (after a change or a sync). */
export function notifyTagsChanged() {
  for (const l of listeners) l();
}
function useTagsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return version;
}

/** Every tag, kept up to date. */
export function useTags(): Tag[] {
  const db = useSQLiteContext();
  const version = useTagsVersion();
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    getTags(db)
      .then(setTags)
      .catch(() => {});
  }, [db, version]);
  return tags;
}

/** Tag uids of each of these cards (by oracle id), kept up to date. */
export function useCardTags(oracleIds: string[]): Record<string, string[]> {
  const db = useSQLiteContext();
  const version = useTagsVersion();
  const key = [...new Set(oracleIds)].sort().join(',');
  const [map, setMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getCardTags(db, key.split(','))
      .then((m) => !cancelled && setMap(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, key, version]);
  return map;
}

/** Tag uids of every deck (by deck uid), kept up to date. */
export function useDeckTags(): Record<string, string[]> {
  const db = useSQLiteContext();
  const version = useTagsVersion();
  const [map, setMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    getDeckTags(db)
      .then(setMap)
      .catch(() => {});
  }, [db, version]);
  return map;
}

/** Dark or white text, whichever reads better on the tag's color. */
export function tagTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1a1a1a' : '#fff';
}

/**
 * A tag: its icon and text in its color (outlined when `selected` is false). `small` for lists;
 * `iconOnly` shows just the icon in a colored dot (deck bar, deck tiles).
 */
export function TagChip({
  tag,
  onPress,
  selected,
  small,
  iconOnly,
}: {
  tag: Tag;
  onPress?: () => void;
  selected?: boolean;
  small?: boolean;
  iconOnly?: boolean;
}) {
  const outline = selected === false;
  const fg = outline ? tag.color : tagTextColor(tag.color);
  if (iconOnly)
    return (
      <View style={[styles.dot, { backgroundColor: tag.color }]} accessibilityLabel={`Etiqueta ${tag.name}`}>
        <MaterialCommunityIcons name={glyphOf(tag.icon)} size={11} color={fg} />
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, small && styles.chipSmall, { borderColor: tag.color, backgroundColor: outline ? 'transparent' : tag.color }]}
      accessibilityLabel={`Etiqueta ${tag.name}${selected ? ', puesta' : ''}`}
    >
      <MaterialCommunityIcons name={glyphOf(tag.icon)} size={small ? 12 : 14} color={fg} />
      <Text style={[styles.chipText, small && styles.chipTextSmall, { color: fg }]}>{tag.name}</Text>
    </Pressable>
  );
}

/** Bottom sheet for one deck: every tag to put on or take off, and «Gestionar etiquetas». */
export function DeckTagsSheet({ deckUid, name, onClose }: { deckUid: string | null; name?: string; onClose: () => void }) {
  const db = useSQLiteContext();
  const tags = useTags();
  const on = useDeckTags()[deckUid ?? ''] ?? [];
  const [managing, setManaging] = useState(false);
  const toggle = async (tag: Tag) => {
    if (!deckUid) return;
    await setDeckTag(db, tag.uid, deckUid, !on.includes(tag.uid));
    notifyTagsChanged();
  };
  return (
    <>
      <BottomSheet visible={!!deckUid && !managing} onClose={onClose} heightRatio={0.5}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Etiquetas del mazo{name ? ` · ${name}` : ''}</Text>
          <Text style={styles.hint}>Las mismas etiquetas que las cartas: «Para torneo», «Casual», «En construcción»…</Text>
          {tags.length === 0 && <Text style={styles.hint}>Aún no tienes etiquetas. Créalas con «Gestionar etiquetas».</Text>}
          <View style={styles.wrap}>
            {tags.map((t) => (
              <TagChip key={t.uid} tag={t} selected={on.includes(t.uid)} onPress={() => toggle(t)} />
            ))}
          </View>
          <Pressable style={styles.link} onPress={() => setManaging(true)}>
            <MaterialCommunityIcons name="cog-outline" size={18} color={colors.accent} />
            <Text style={styles.linkText}>Gestionar etiquetas</Text>
          </Pressable>
        </View>
      </BottomSheet>
      <TagsManagerSheet visible={managing} onClose={() => setManaging(false)} />
    </>
  );
}

/** Bottom sheet for one card: every tag to put on or take off, and «Gestionar etiquetas». */
export function CardTagsSheet({ oracleId, name, onClose }: { oracleId: string | null; name?: string; onClose: () => void }) {
  const db = useSQLiteContext();
  const tags = useTags();
  const on = useCardTags(oracleId ? [oracleId] : [])[oracleId ?? ''] ?? [];
  const [managing, setManaging] = useState(false);
  const toggle = async (tag: Tag) => {
    if (!oracleId) return;
    await setCardTag(db, tag.uid, oracleId, !on.includes(tag.uid));
    notifyTagsChanged();
  };
  return (
    <>
      <BottomSheet visible={!!oracleId && !managing} onClose={onClose} heightRatio={0.5}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Etiquetas{name ? ` · ${name}` : ''}</Text>
          {tags.length === 0 && <Text style={styles.hint}>Aún no tienes etiquetas. Créalas con «Gestionar etiquetas».</Text>}
          <View style={styles.wrap}>
            {tags.map((t) => (
              <TagChip key={t.uid} tag={t} selected={on.includes(t.uid)} onPress={() => toggle(t)} />
            ))}
          </View>
          <Pressable style={styles.link} onPress={() => setManaging(true)}>
            <MaterialCommunityIcons name="cog-outline" size={18} color={colors.accent} />
            <Text style={styles.linkText}>Gestionar etiquetas</Text>
          </Pressable>
        </View>
      </BottomSheet>
      <TagsManagerSheet visible={managing} onClose={() => setManaging(false)} />
    </>
  );
}

/** Create, edit and delete tags: text, color and icon. */
export function TagsManagerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const db = useSQLiteContext();
  const tags = useTags();
  const [editing, setEditing] = useState<Tag | null>(null);
  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    if (editing.uid) await updateTag(db, { ...editing, name: editing.name.trim() });
    else await createTag(db, editing.name.trim(), editing.color, editing.icon);
    notifyTagsChanged();
    setEditing(null);
  };
  const remove = async (tag: Tag) => {
    await deleteTag(db, tag.uid);
    notifyTagsChanged();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} heightRatio={0.8}>
      <ScrollView contentContainerStyle={styles.sheet}>
        <Text style={styles.title}>Etiquetas</Text>
        <Text style={styles.hint}>Marca tus cartas con lo que quieras: «Para cambiar», «Prestada», «Foil»…</Text>
        {tags.map((t) => (
          <View key={t.uid} style={styles.tagRow}>
            <TagChip tag={t} />
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setEditing(t)} hitSlop={8} accessibilityLabel={`Editar ${t.name}`}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.accent} />
            </Pressable>
            <Pressable onPress={() => remove(t)} hitSlop={8} accessibilityLabel={`Borrar ${t.name}`}>
              <MaterialCommunityIcons name="delete-outline" size={20} color={colors.discard} />
            </Pressable>
          </View>
        ))}
        {editing ? (
          <View style={styles.editor}>
            <TextInput
              value={editing.name}
              onChangeText={(name) => setEditing({ ...editing, name })}
              placeholder="Texto de la etiqueta"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <View style={styles.wrap}>
              {TAG_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setEditing({ ...editing, color: c })}
                  style={[styles.swatch, { backgroundColor: c, borderColor: editing.color === c ? colors.text : colors.border }]}
                  accessibilityLabel={`Color ${c}`}
                />
              ))}
            </View>
            <View style={styles.wrap}>
              {TAG_ICONS.map((i) => (
                <Pressable
                  key={i}
                  onPress={() => setEditing({ ...editing, icon: i })}
                  style={[styles.iconBtn, editing.icon === i && { backgroundColor: colors.accent }]}
                >
                  <MaterialCommunityIcons name={glyphOf(i)} size={18} color={editing.icon === i ? colors.bg : colors.text} />
                </Pressable>
              ))}
            </View>
            <View style={[styles.wrap, { justifyContent: 'flex-end' }]}>
              <TagChip tag={{ ...editing, name: editing.name || 'Etiqueta' }} />
              <Pressable style={styles.secondary} onPress={() => setEditing(null)}>
                <Text style={styles.secondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={save} disabled={!editing.name.trim()}>
                <Text style={styles.primaryText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.link}
            onPress={() => setEditing({ uid: '', name: '', color: TAG_COLORS[tags.length % TAG_COLORS.length], icon: 'mdiTagOutline' })}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
            <Text style={styles.linkText}>Nueva etiqueta</Text>
          </Pressable>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 13 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, height: 26 },
  chipText: { fontSize: 13, fontWeight: '800' },
  chipSmall: { height: 18, borderRadius: 9, paddingHorizontal: 5, gap: 2 },
  chipTextSmall: { fontSize: 10.5 },
  dot: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { color: colors.accent, fontWeight: '700' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  editor: { gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, height: 42 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 3 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  primaryText: { color: colors.bg, fontWeight: '800' },
  secondary: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
