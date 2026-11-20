import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAppState } from '@/context/AppState';
import { colors } from '@/theme';

const front = (name: string) => name.split(' // ')[0].trim().toLowerCase();

/**
 * «En «Mazo»: 2» / «No está en «Mazo»» para cualquier carta ampliada: si el mazo que se está construyendo
 * (el activo) la tiene, en el mazo principal y/o el banquillo. Se cruza por oracle id, o por nombre inglés
 * cuando solo se conoce eso (combos). Nada sin un mazo activo.
 */
export function InDeckBadge({ oracleId, name }: { oracleId?: string; name?: string }) {
  const { activeDeck, activeCards, activeSideboard } = useAppState();
  if (!activeDeck || (!oracleId && !name)) return null;

  const match = (c: { oracleId: string; name: string }) =>
    oracleId ? c.oracleId === oracleId : front(c.name) === front(name!);
  const main = activeCards.find(match)?.quantity ?? 0;
  const side = activeSideboard.find(match)?.quantity ?? 0;
  const inDeck = main + side > 0;

  const text = !inDeck
    ? `No está en «${activeDeck.name}»`
    : main > 0
      ? `En «${activeDeck.name}»: ${main}${side ? ` (+${side} en el banquillo)` : ''}`
      : `En el banquillo de «${activeDeck.name}»: ${side}`;

  return (
    <View style={[styles.badge, inDeck ? styles.inDeck : styles.notInDeck]}>
      <MaterialCommunityIcons
        name={inDeck ? 'cards-playing' : 'cards-playing-outline'}
        size={16}
        color={inDeck ? colors.bg : colors.textMuted}
      />
      <Text style={[styles.text, inDeck && { color: colors.bg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  inDeck: { backgroundColor: colors.accent, borderColor: colors.accent },
  notInDeck: { borderColor: colors.border, backgroundColor: colors.surface },
  text: { color: colors.textMuted, fontWeight: '800', fontSize: 13, flexShrink: 1 },
});
