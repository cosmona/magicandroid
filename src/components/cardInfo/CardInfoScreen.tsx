import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRawCard, getRulings, type RawCard, type Ruling } from '@/api/scryfall';
import { CARD_RATIO } from '@/components/SwipeCard';
import { CardSynergy } from '@/components/cardInfo/CardSynergy';
import { LanguagePill } from '@/components/LanguagePicker';
import { OwnPill } from '@/components/collection/OwnButton';
import { InDeckBadge } from '@/components/deck/InDeckBadge';
import { Section as BaseSection } from '@/components/cardInfo/Section';
import { ManaCost } from '@/components/ManaCost';
import { useAppState } from '@/context/AppState';
import { colors, formatEur } from '@/theme';
import {
  COMPONENTS,
  HANDLED_KEYS,
  LEGALITY_FORMATS,
  LEGALITY_STATUS,
  LINKS,
  RULES_FIELDS,
  SECTIONS,
  type FieldDef,
} from './fields';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const COLOR_NAMES: Record<string, string> = {
  W: 'Blanco',
  U: 'Azul',
  B: 'Negro',
  R: 'Rojo',
  G: 'Verde',
  C: 'Incoloro',
};

const get = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Las criaturas legendarias (y las cartas que lo dicen) pueden liderar un mazo de Commander: muestra su página de comandante de EDHREC. */
const canBeCommander = (card: RawCard) => {
  const faces = (card.card_faces as RawCard[] | undefined) ?? [];
  const type = String(card.type_line ?? faces[0]?.type_line ?? '');
  const text = String(card.oracle_text ?? faces.map((f) => f.oracle_text ?? '').join('\n'));
  return (/\bLegendary\b/.test(type) && /\bCreature\b/.test(type)) || /can be your commander/i.test(text);
};

const formatDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
};

/**
 * Página a pantalla completa con todo lo que Scryfall sabe de una impresión, agrupado y explicado
 * campo a campo (los campos de imagen se omiten). Abre sobre la hoja del mazo, de ahí el Modal.
 */
export function CardInfoScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { prefs } = useAppState();
  const [card, setCard] = useState<RawCard | null>(null);
  const [rulings, setRulings] = useState<Ruling[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // La impresión mostrada: empieza como `id`, la pill 🌐 la cambia a otro idioma.
  const [shownId, setShownId] = useState(id);

  useEffect(() => {
    let cancelled = false;
    getRawCard(shownId)
      .then((c) => {
        if (cancelled) return;
        setCard(c);
        setError(null);
        if (typeof c.rulings_uri === 'string') {
          getRulings(c.rulings_uri)
            .then((r) => !cancelled && setRulings(r))
            .catch(() => !cancelled && setRulings([]));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [shownId, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  const faces = (card?.card_faces as RawCard[] | undefined) ?? [];
  const images = [get(card, 'image_uris.normal'), ...faces.map((f) => get(f, 'image_uris.normal'))].filter(
    (u): u is string => typeof u === 'string',
  );
  const title = (card?.printed_name as string | undefined) ?? (card?.name as string | undefined) ?? '';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Volver" style={styles.headerButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || 'Ficha de la carta'}
          </Text>
          {typeof card?.scryfall_uri === 'string' && (
            <Pressable
              onPress={() => Linking.openURL(card.scryfall_uri as string)}
              hitSlop={10}
              accessibilityLabel="Abrir en Scryfall"
              style={styles.headerButton}
            >
              <MaterialCommunityIcons name="open-in-new" size={22} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {!card ? (
          <View style={styles.center}>
            {error ? (
              <>
                <Text style={styles.errorText}>No se pudo cargar la carta: {error}</Text>
                <Pressable style={styles.retry} onPress={retry}>
                  <Text style={styles.retryText}>Reintentar</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colors.accent} size="large" />
            )}
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
            {images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.images}>
                {images.map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={[styles.image, images.length > 1 && styles.imageHalf]}
                    contentFit="contain"
                  />
                ))}
              </ScrollView>
            )}
            <InDeckBadge oracleId={typeof card.oracle_id === 'string' ? card.oracle_id : undefined} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <OwnPill card={shownId} />
              <LanguagePill
                card={shownId}
                lang={typeof card.lang === 'string' ? card.lang : undefined}
                onPick={(c) => {
                  if (c.id === shownId) return;
                  setCard(null);
                  setRulings(null);
                  setShownId(c.id);
                }}
              />
            </View>
            <Text style={styles.intro}>
              Todo lo que Scryfall sabe de esta impresión. Debajo de cada dato tienes qué significa.
            </Text>

            <Section title={SECTIONS[0].title} icon={SECTIONS[0].icon as IconName}>
              <Fields fields={SECTIONS[0].fields} source={card} />
            </Section>

            {faces.length > 0 && (
              <Section title={`Caras (${faces.length})`} icon="card-multiple-outline">
                <Text style={styles.sectionHelp}>
                  Esta carta tiene varias partes (dos caras, mitades, aventura…). Cada una con sus datos:
                </Text>
                {faces.map((face, i) => (
                  <View key={i} style={styles.face}>
                    <Text style={styles.faceTitle}>
                      {i + 1}. {(face.printed_name as string) ?? (face.name as string)}
                    </Text>
                    <Fields fields={RULES_FIELDS} source={face} />
                  </View>
                ))}
              </Section>
            )}

            <Legalities legalities={card.legalities as Record<string, string> | undefined} />

            {SECTIONS.slice(1)
              .filter((s) => prefs.pricesCardInfo || s.title !== 'Precios')
              .map((s) => (
                <Section key={s.title} title={s.title} icon={s.icon as IconName}>
                  <Fields fields={s.fields} source={card} />
                </Section>
              ))}

            <RelatedParts parts={card.all_parts as RawCard[] | undefined} selfId={card.id as string} />

            <CardSynergy name={card.name as string} canBeCommander={canBeCommander(card)} />

            <Section title="Aclaraciones oficiales" icon="gavel">
              <Text style={styles.sectionHelp}>
                Rulings: respuestas oficiales de Wizards y del Gatherer a dudas de reglas sobre esta carta (en inglés).
              </Text>
              {rulings === null ? (
                <ActivityIndicator color={colors.accent} />
              ) : rulings.length === 0 ? (
                <Text style={styles.value}>No tiene aclaraciones.</Text>
              ) : (
                rulings.map((r, i) => (
                  <View key={i} style={styles.ruling}>
                    <Text style={styles.rulingMeta}>
                      {formatDate(r.published_at)} · {r.source === 'wotc' ? 'Wizards of the Coast' : 'Scryfall'}
                    </Text>
                    <Text style={styles.value}>{r.comment}</Text>
                  </View>
                ))
              )}
            </Section>

            <Links card={card} />
            <Others card={card} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/** Cada bloque de esta pantalla se pliega tocando su título. */
function Section(props: { title: string; icon: IconName; children: ReactNode }) {
  return <BaseSection collapsible {...props} />;
}

function Fields({ fields, source }: { fields: FieldDef[]; source: RawCard }) {
  return (
    <>
      {fields.map((f) => {
        const v = get(source, f.key);
        if (isEmpty(v)) return null;
        return (
          <View key={f.key} style={styles.field}>
            <Text style={styles.label}>{f.label}</Text>
            <Value def={f} value={v} />
            <Text style={styles.help}>{f.help}</Text>
          </View>
        );
      })}
    </>
  );
}

function Value({ def, value }: { def: FieldDef; value: unknown }) {
  const tr = (x: unknown) => def.values?.[String(x)] ?? String(x);
  switch (def.kind) {
    case 'mana':
      return <ManaCost cost={String(value)} size={20} />;
    case 'colors': {
      const list = (value as string[]).length ? (value as string[]) : ['C'];
      return (
        <View style={styles.colorsRow}>
          <ManaCost cost={list.map((c) => `{${c}}`).join('')} size={20} />
          <Text style={styles.value}>{list.map((c) => COLOR_NAMES[c] ?? c).join(', ')}</Text>
        </View>
      );
    }
    case 'bool':
      return (
        <View style={styles.colorsRow}>
          <MaterialCommunityIcons
            name={value ? 'check-circle' : 'close-circle-outline'}
            size={18}
            color={value ? colors.add : colors.textMuted}
          />
          <Text style={styles.value}>{value ? 'Sí' : 'No'}</Text>
        </View>
      );
    case 'date':
      return <Text style={styles.value}>{formatDate(String(value))}</Text>;
    case 'list':
      return (
        <View style={styles.chips}>
          {(value as unknown[]).map((x, i) => (
            <Text key={i} style={styles.chip}>
              {tr(x)}
            </Text>
          ))}
        </View>
      );
    case 'number':
      return <Text style={styles.value}>{String(value).replace('.', ',').replace(/,0$/, '')}</Text>;
    case 'price-eur':
      return <Text style={styles.price}>{formatEur(Number(value))}</Text>;
    case 'price-usd':
      return <Text style={styles.price}>{Number(value).toFixed(2)} $</Text>;
    case 'price-tix':
      return <Text style={styles.price}>{Number(value).toFixed(2)} tix</Text>;
    case 'code':
      return (
        <Text style={styles.code} selectable>
          {def.key === 'set' ? String(value).toUpperCase() : String(value)}
        </Text>
      );
    case 'multiline':
      return (
        <Text style={styles.value} selectable>
          {String(value)}
        </Text>
      );
    case 'italic':
      return <Text style={[styles.value, { fontStyle: 'italic' }]}>{String(value)}</Text>;
    default:
      return (
        <Text style={styles.value} selectable>
          {tr(value)}
        </Text>
      );
  }
}

function Legalities({ legalities }: { legalities?: Record<string, string> }) {
  if (!legalities) return null;
  const keys = [
    ...Object.keys(LEGALITY_FORMATS).filter((k) => k in legalities),
    ...Object.keys(legalities).filter((k) => !(k in LEGALITY_FORMATS)),
  ];
  return (
    <Section title="Legalidad por formato" icon="scale-balance">
      <Text style={styles.sectionHelp}>
        En qué formatos se puede jugar. Prohibida = no se puede usar; Restringida = solo 1 copia (Vintage).
      </Text>
      <View style={styles.legalGrid}>
        {keys.map((k) => {
          const status = legalities[k];
          const color =
            status === 'legal'
              ? colors.add
              : status === 'banned'
                ? colors.discard
                : status === 'restricted'
                  ? colors.undo
                  : colors.textMuted;
          return (
            <View key={k} style={[styles.legalItem, { borderColor: status === 'not_legal' ? colors.border : color }]}>
              <Text style={styles.legalFormat} numberOfLines={1}>
                {LEGALITY_FORMATS[k] ?? k}
              </Text>
              <Text style={[styles.legalStatus, { color }]}>{LEGALITY_STATUS[status] ?? status}</Text>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

function RelatedParts({ parts, selfId }: { parts?: RawCard[]; selfId: string }) {
  const others = (parts ?? []).filter((p) => p.id !== selfId);
  if (!others.length) return null;
  return (
    <Section title="Cartas relacionadas" icon="link-variant">
      <Text style={styles.sectionHelp}>
        Fichas y emblemas que crea, piezas con las que se fusiona o cartas que la mencionan de forma especial.
      </Text>
      {others.map((p) => (
        <View key={p.id as string} style={styles.part}>
          <Text style={styles.partKind}>{COMPONENTS[p.component as string] ?? String(p.component)}</Text>
          <Text style={styles.value}>{p.name as string}</Text>
          <Text style={styles.help}>{p.type_line as string}</Text>
        </View>
      ))}
    </Section>
  );
}

function Links({ card }: { card: RawCard }) {
  const links = Object.entries(LINKS)
    .map(([key, def]) => ({ ...def, url: get(card, key) }))
    .filter((l): l is { label: string; help: string; url: string } => typeof l.url === 'string');
  if (!links.length) return null;
  return (
    <Section title="Enlaces" icon="web">
      {links.map((l) => (
        <Pressable
          key={l.label}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
          onPress={() => Linking.openURL(l.url.replace('cardmarket.com/en/', 'cardmarket.com/es/'))}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.linkLabel}>{l.label}</Text>
            <Text style={styles.help}>{l.help}</Text>
          </View>
          <MaterialCommunityIcons name="open-in-new" size={18} color={colors.accent} />
        </Pressable>
      ))}
    </Section>
  );
}

/** Cualquier campo que Scryfall añada y que esta pantalla aún no conoce, mostrado en crudo. */
function Others({ card }: { card: RawCard }) {
  const rest = Object.entries(card).filter(([k, v]) => !HANDLED_KEYS.has(k) && !isEmpty(v));
  if (!rest.length) return null;
  return (
    <Section title="Otros datos" icon="dots-horizontal-circle-outline">
      <Text style={styles.sectionHelp}>Campos de Scryfall menos habituales, tal cual vienen.</Text>
      {rest.map(([k, v]) => (
        <View key={k} style={styles.field}>
          <Text style={styles.label}>{k}</Text>
          <Text style={styles.code} selectable>
            {typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}
          </Text>
        </View>
      ))}
    </Section>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { color: colors.text, textAlign: 'center' },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  retryText: { color: colors.bg, fontWeight: '800' },
  content: { padding: 14, gap: 14 },
  images: { gap: 10, justifyContent: 'center', flexGrow: 1 },
  image: { width: 260, aspectRatio: 1 / CARD_RATIO, borderRadius: 14 },
  imageHalf: { width: 220 },
  intro: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  sectionHelp: { color: colors.textMuted, fontSize: 12 },
  field: { gap: 3, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { color: colors.accent, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: 15 },
  help: { color: colors.textMuted, fontSize: 12 },
  price: { color: colors.text, fontSize: 17, fontWeight: '800' },
  code: { color: colors.text, fontFamily: 'monospace', fontSize: 13 },
  colorsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  face: { gap: 0, paddingTop: 6 },
  faceTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  legalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  legalItem: {
    width: '48.5%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.bg,
  },
  legalFormat: { color: colors.text, fontWeight: '700', fontSize: 13 },
  legalStatus: { fontSize: 12, fontWeight: '800' },
  part: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  partKind: { color: colors.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  ruling: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rulingMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkLabel: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
