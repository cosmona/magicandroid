// Piezas de la pantalla de swipe: los botones redondos del riel lateral («La quiero», ficha, sinergias…)
// y las sinergias a pantalla completa de la carta en pantalla.
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { displayName, type Card } from '@/api/scryfall';
import { CardSynergy } from '@/components/cardInfo/CardSynergy';
import { HintButton } from '@/components/Hint';
import { setWanted, useWantedIds, useWantedPrintings } from '@/hooks/useWanted';
import { colors } from '@/theme';

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];
export const WANT_COLOR = '#ff7a9c';

/** Un botón redondo del riel lateral: icono, etiqueta pequeña opcional debajo, una ayuda con pulsación larga. */
export function RailButton({
  icon,
  hint,
  label,
  color = colors.text,
  active = false,
  small = false,
  onPress,
}: {
  icon: Glyph;
  hint: string;
  label?: string;
  color?: string;
  active?: boolean;
  /** Más pequeño (secundario: idioma, arte). */
  small?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.railItem}>
      <HintButton
        hint={hint}
        onPress={onPress}
        hitSlop={4}
        style={({ pressed }) => [styles.railButton, small && styles.railSmall, active && { borderColor: color }, pressed && { opacity: 0.6 }]}
      >
        <MaterialCommunityIcons name={icon} size={small ? 18 : 22} color={color} />
      </HintButton>
      {label ? <Text style={styles.railLabel}>{label}</Text> : null}
    </View>
  );
}

/** «La quiero» para esta impresión como botón del riel (corazón relleno si la quieres; punteado si lo es otra impresión). */
export function WantRailButton({ card }: { card: Card }) {
  const db = useSQLiteContext();
  const wanted = useWantedPrintings(db, [card.id]).has(card.id);
  const other = useWantedIds(db, [card.oracleId]).has(card.oracleId) && !wanted;
  const [busy, setBusy] = useState(false);
  return (
    <RailButton
      icon={wanted ? 'heart' : 'heart-outline'}
      hint={wanted ? 'La quieres: quitar de «La quiero»' : other ? 'Quieres otra versión: querer también esta' : 'La quiero: apúntala para conseguirla'}
      label={wanted ? 'La quieres' : other ? 'Otra' : 'La quiero'}
      color={wanted || other ? WANT_COLOR : colors.text}
      active={wanted}
      onPress={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await setWanted(db, card, !wanted);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

/** Si una carta puede liderar un mazo de Commander (para la página de comandante de EDHREC). */
const canBeCommander = (c: Card) =>
  (/legendary/i.test(c.typeLine ?? '') && /creature/i.test(c.typeLine ?? '')) || /can be your commander/i.test(c.oracleText ?? '');

/** Las sinergias de la carta (EDHREC y combos), a pantalla completa; sus cartas abren en grande dentro. */
export function SynergySheet({ card, onClose }: { card: Card | null; onClose: () => void }) {
  return (
    <Modal visible={!!card} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="puzzle-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Sinergias</Text>
            {card && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {displayName(card)}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <MaterialCommunityIcons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {card && <CardSynergy name={card.name} canBeCommander={canBeCommander(card)} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  railItem: { alignItems: 'center', gap: 2 },
  railButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,16,28,0.82)',
    borderWidth: 2,
    borderColor: colors.border,
  },
  railSmall: { width: 34, height: 34, borderRadius: 17 },
  railLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.synergyModal,
    backgroundColor: colors.synergyModal + '33',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
});
