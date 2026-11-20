import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getCardsByIds, getCardsByNames, smallImageUrl, type Card } from '@/api/scryfall';
import type { Combo, EdhrecEntry } from '@/api/synergy';
import { LanguagePill } from '@/components/LanguagePicker';
import { OwnPill } from '@/components/collection/OwnButton';
import { InDeckBadge } from '@/components/deck/InDeckBadge';
import { CARD_RATIO } from '@/components/SwipeCard';
import { ManaCost } from '@/components/ManaCost';
import { colors } from '@/theme';

/** «45 %» */
export const pct = (n: number) => `${Math.round(n * 100)} %`;
/** «1,2 mil» / «46 mil» / «320» */
export const count = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`
    : n >= 1000
      ? `${Math.round(n / 1000)} mil`
      : String(n);

/**
 * Imágenes pequeñas para cartas conocidas por id de Scryfall o por nombre inglés, obtenidas en un lote
 * (Scryfall /cards/collection). Empieza vacío; las cartas que falten simplemente no tienen imagen.
 */
export function useCardImages(keys: string[], by: 'id' | 'name'): Record<string, string> {
  const key = [...new Set(keys)].join('|');
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const list = key.split('|');
    (by === 'id' ? getCardsByIds(list) : getCardsByNames(list))
      .then((cards) => {
        if (cancelled) return;
        const out: Record<string, string> = {};
        for (const c of cards) {
          if (!c.imageUrl) continue;
          const url = smallImageUrl(c.imageUrl);
          out[c.id] = url;
          out[c.name] = url;
          out[c.name.split(' // ')[0]] = url;
        }
        setImages((prev) => ({ ...prev, ...out }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, by]);
  return images;
}

/** URL de imagen de Scryfall de otro tamaño (miniaturas «small» → «large» para la vista grande). */
const resize = (url: string, size: 'normal' | 'large') => url.replace(/\/(small|normal|large)\//, `/${size}/`);

/**
 * Un combo: sus cartas (las que faltan marcadas), qué hace, maná para arrancarlo, pasos bajo demanda.
 * Tocar una carta la muestra en grande. Con `onAdd`, las cartas que faltan reciben un ＋ (en la tarjeta y en
 * la vista grande) que las añade al mazo; `added` / `adding` son los nombres ya añadidos / en curso.
 */
export function ComboView({
  combo,
  images,
  missing = [],
  onAdd,
  added,
  adding,
}: {
  combo: Combo;
  images: Record<string, string>;
  /** Cartas del combo que no están en el mazo. */
  missing?: string[];
  onAdd?: (name: string) => void;
  added?: Set<string>;
  adding?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  // La carta grande en otro idioma, elegida con la pill 🌐 (solo cambia lo que se muestra).
  const [bigPrinting, setBigPrinting] = useState<Card | null>(null);
  const openBig = (name: string | null) => {
    setBig(name);
    setBigPrinting(null);
  };
  const canAdd = (name: string) => !!onAdd && missing.includes(name) && !added?.has(name);
  const bigUri = big ? (images[big] ?? images[big.split(' // ')[0]]) : undefined;
  return (
    <View style={styles.combo}>
      <View style={styles.comboCards}>
        {combo.cards.map((name) => {
          const isAdded = !!added?.has(name);
          const isMissing = missing.includes(name) && !isAdded;
          const uri = images[name] ?? images[name.split(' // ')[0]];
          return (
            <Pressable key={name} style={styles.comboCard} onPress={() => openBig(name)}>
              <View style={[styles.comboImage, isMissing && styles.missingImage]}>
                {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                {isAdded ? (
                  <View style={styles.tileBadge}>
                    <MaterialCommunityIcons name="check-circle" size={24} color={colors.add} />
                  </View>
                ) : adding === name ? (
                  <View style={styles.tileBadge}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : (
                  canAdd(name) && (
                    <Pressable
                      style={[styles.tileBadge, styles.tileAdd]}
                      onPress={() => onAdd?.(name)}
                      hitSlop={6}
                      accessibilityLabel={`Añadir ${name} al mazo`}
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={colors.bg} />
                    </Pressable>
                  )
                )}
              </View>
              <Text style={[styles.comboCardName, isMissing && { color: colors.undo }]} numberOfLines={2}>
                {isMissing ? 'Falta: ' : isAdded ? 'Añadida: ' : ''}
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.results}>
        {combo.results.map((r) => (
          <Text key={r} style={styles.result}>
            {r}
          </Text>
        ))}
      </View>

      <View style={styles.comboFooter}>
        {!!combo.manaNeeded && (
          <View style={styles.mana}>
            <Text style={styles.small}>Para empezar:</Text>
            <ManaCost cost={combo.manaNeeded} size={16} />
          </View>
        )}
        <Text style={[styles.small, { flex: 1, textAlign: 'right' }]}>en {count(combo.popularity)} mazos</Text>
      </View>

      <View style={styles.comboButtons}>
        <Pressable style={styles.linkButton} onPress={() => setOpen((o) => !o)}>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
          <Text style={styles.linkText}>Cómo funciona</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => Linking.openURL(combo.url)}>
          <MaterialCommunityIcons name="open-in-new" size={16} color={colors.accent} />
          <Text style={styles.linkText}>Commander Spellbook</Text>
        </Pressable>
      </View>
      {big && (
        <Modal visible transparent animationType="fade" onRequestClose={() => openBig(null)}>
          <Pressable style={styles.bigBackdrop} onPress={() => openBig(null)}>
            {(bigPrinting?.imageUrl || bigUri) && (
              <Image
                source={{ uri: resize(bigPrinting?.imageUrl ?? bigUri!, 'large') }}
                placeholder={bigPrinting ? undefined : { uri: bigUri }}
                placeholderContentFit="contain"
                style={styles.bigImage}
                contentFit="contain"
              />
            )}
            <Text style={styles.bigName}>{bigPrinting?.printedName ?? big}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <LanguagePill card={{ name: big }} lang={bigPrinting?.lang} onPick={setBigPrinting} />
              <OwnPill card={bigPrinting ?? { name: big }} />
            </View>
            <InDeckBadge name={big} />
            {added?.has(big) ? (
              <Text style={[styles.bigName, { color: colors.add }]}>✓ Añadida al mazo</Text>
            ) : canAdd(big) ? (
              <Pressable
                style={styles.bigAdd}
                onPress={() => onAdd?.(big)}
                disabled={adding === big}
                accessibilityLabel={`Añadir ${big} al mazo`}
              >
                {adding === big ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
                )}
                <Text style={styles.bigAddText}>Añadir al mazo</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Modal>
      )}
      {open && (
        <View style={styles.steps}>
          {!!combo.prerequisites && (
            <>
              <Text style={styles.stepsTitle}>Requisitos</Text>
              <Text style={styles.stepsText}>{combo.prerequisites}</Text>
            </>
          )}
          <Text style={styles.stepsTitle}>Pasos (en inglés)</Text>
          <Text style={styles.stepsText}>{combo.description}</Text>
        </View>
      )}
    </View>
  );
}

/** Una carta de una lista de EDHREC con su número principal (sinergia o cuántos mazos la juegan). */
export function EntryRow({
  entry,
  image,
  metric,
  right,
  onPress,
}: {
  entry: EdhrecEntry;
  image?: string;
  /** synergy: «+27 % de sinergia»; inclusion: «en el 45 % de sus mazos». */
  metric: 'synergy' | 'inclusion';
  right?: ReactNode;
  /** Tocar la carta (imagen + nombre): normalmente la abre en grande. */
  onPress?: () => void;
}) {
  const inclusion = entry.potentialDecks ? entry.numDecks / entry.potentialDecks : 0;
  return (
    <View style={styles.entry}>
      <Pressable
        style={({ pressed }) => [styles.entryMain, pressed && { opacity: 0.6 }]}
        onPress={onPress}
        disabled={!onPress}
        accessibilityLabel={onPress ? `Ver ${entry.name} en grande` : undefined}
      >
        <View style={styles.entryImage}>
          {image && <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.entryName} numberOfLines={1}>
            {entry.name}
          </Text>
          {metric === 'synergy' ? (
            <Text style={styles.small}>
              <Text style={styles.synergy}>
                {(entry.synergy ?? 0) >= 0 ? '+' : ''}
                {pct(entry.synergy ?? 0)} de sinergia
              </Text>
              {' · '}en el {pct(inclusion)} de sus mazos
            </Text>
          ) : (
            <Text style={styles.small}>
              En {count(entry.numDecks)} mazos ({pct(inclusion)})
            </Text>
          )}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  combo: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  comboCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  comboCard: { width: 72, gap: 3 },
  comboImage: {
    width: 72,
    aspectRatio: 1 / CARD_RATIO,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  missingImage: { borderWidth: 2, borderColor: colors.undo },
  tileBadge: { position: 'absolute', right: 3, bottom: 3 },
  tileAdd: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  bigBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  bigImage: { width: '100%', maxHeight: '70%', aspectRatio: 1 / CARD_RATIO, borderRadius: 16 },
  bigName: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  bigAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  bigAddText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  comboCardName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  results: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  result: {
    color: colors.bg,
    backgroundColor: colors.accent,
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  comboFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mana: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  small: { color: colors.textMuted, fontSize: 12 },
  comboButtons: { flexDirection: 'row', gap: 8 },
  linkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  linkText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  steps: { gap: 4 },
  stepsTitle: { color: colors.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  stepsText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryImage: {
    width: 40,
    aspectRatio: 1 / CARD_RATIO,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  entryName: { color: colors.text, fontWeight: '800' },
  synergy: { color: colors.add, fontWeight: '800' },
});
