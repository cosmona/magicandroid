import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '@/theme';

/** One card of the drawn fan: tilted around its bottom, its title highlighted. */
function FanCard({ angle, offset }: { angle: number; offset: number }) {
  return (
    <View style={[styles.fanCard, { transform: [{ translateX: offset }, { translateY: 40 }, { rotate: `${angle}deg` }, { translateY: -40 }] }]}>
      <View style={styles.fanTitle} />
      <View style={styles.fanArt} />
      <View style={styles.fanLine} />
      <View style={[styles.fanLine, { width: '60%' }]} />
    </View>
  );
}

/** The phone on its stand, seen from the side, looking down at the hand. */
function StandDrawing() {
  return (
    <View style={styles.scene}>
      {/* Stand and phone (left) */}
      <View style={styles.standBase} />
      <View style={styles.standPole} />
      <View style={styles.phone}>
        <View style={styles.phoneLens} />
      </View>
      {/* What the camera sees */}
      <View style={[styles.ray, { transform: [{ rotate: '24deg' }] }]} />
      <View style={[styles.ray, { transform: [{ rotate: '40deg' }] }]} />
      {/* The hand of cards on the table (right) */}
      <View style={styles.handSide}>
        <MaterialCommunityIcons name="hand-back-right-outline" size={30} color={colors.textMuted} />
      </View>
      <View style={styles.cardsSide} />
      <View style={styles.table} />
      <Text style={[styles.tag, { left: 6, top: 4 }]}>Móvil en el soporte</Text>
      <Text style={[styles.tag, { right: 6, bottom: 22 }]}>Tu mano</Text>
      <Text style={[styles.tag, { left: '38%', bottom: 22 }]}>30–40 cm</Text>
    </View>
  );
}

/** The fan as the camera should see it: titles at the top, none covered. */
function FanDrawing() {
  return (
    <View style={[styles.scene, { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 }]}>
      <View style={{ width: 200, height: 130, alignItems: 'center', justifyContent: 'flex-end' }}>
        {[-24, -12, 0, 12, 24].map((a, i) => (
          <FanCard key={a} angle={a} offset={(i - 2) * 14} />
        ))}
      </View>
      <View style={styles.titleNote}>
        <View style={styles.titleSwatch} />
        <Text style={styles.small}>Los títulos, a la vista y sin tapar</Text>
      </View>
    </View>
  );
}

const TIPS: [string, string][] = [
  ['lightbulb-on-outline', 'Buena luz y sin reflejos: el brillo sobre las cartas impide leerlas.'],
  ['arrow-expand-vertical', 'El móvil a unos 30–40 cm, mirando desde arriba y un poco de frente.'],
  ['cards-outline', 'Abre la mano en abanico: basta con que se vea la parte de arriba de cada carta.'],
  ['rotate-3d-variant', 'Las cartas del derecho, sin girar ni inclinar hacia la cámara.'],
  ['gesture-tap', 'Si se equivoca, toca una carta de la lista para corregirla.'],
];

/** How to place the camera and the cards: shown the first time «Mano» opens (and with «?»). */
export function HandGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.beta}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
          <Text style={styles.title}>Cómo colocar la cámara</Text>
          <Text style={styles.muted}>
            La cámara lee los títulos de tu mano y apunta lo que robas y lo que juegas. Solo reconoce las cartas del mazo activo.
          </Text>

          <Text style={styles.step}>1 · El móvil en un soporte</Text>
          <StandDrawing />

          <Text style={styles.step}>2 · Tu mano en abanico</Text>
          <FanDrawing />

          <Text style={styles.step}>Consejos</Text>
          {TIPS.map(([icon, text]) => (
            <View key={icon} style={styles.tip}>
              <MaterialCommunityIcons name={icon as never} size={22} color={colors.accent} />
              <Text style={styles.tipText}>{text}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable style={styles.ok} onPress={onClose} accessibilityRole="button">
          <Text style={styles.okText}>Entendido</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const CARD = { w: 62, h: 88 };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 18, gap: 12, paddingBottom: 30 },
  beta: { alignSelf: 'flex-start', backgroundColor: colors.undo, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  betaText: { color: '#000', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.textMuted, fontSize: 12 },
  step: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  scene: {
    height: 170,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  table: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, backgroundColor: colors.border },
  standBase: { position: 'absolute', left: 30, bottom: 16, width: 50, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  standPole: { position: 'absolute', left: 52, bottom: 24, width: 6, height: 100, backgroundColor: colors.textMuted },
  phone: {
    position: 'absolute',
    left: 40,
    top: 18,
    width: 70,
    height: 16,
    borderRadius: 4,
    backgroundColor: colors.accent,
    transform: [{ rotate: '20deg' }],
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  phoneLens: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.bg },
  ray: {
    position: 'absolute',
    left: 100,
    top: 38,
    width: 210,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    transformOrigin: 'left',
  },
  handSide: { position: 'absolute', right: 40, bottom: 18 },
  cardsSide: {
    position: 'absolute',
    right: 70,
    bottom: 30,
    width: 50,
    height: 34,
    borderRadius: 4,
    backgroundColor: colors.text,
    opacity: 0.85,
    transform: [{ rotate: '-30deg' }],
  },
  tag: { position: 'absolute', color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  fanCard: {
    position: 'absolute',
    bottom: 0,
    width: CARD.w,
    height: CARD.h,
    borderRadius: 6,
    backgroundColor: '#efe6d2',
    borderWidth: 2,
    borderColor: '#222',
    padding: 4,
    gap: 3,
  },
  fanTitle: { height: 12, borderRadius: 3, backgroundColor: colors.accent },
  fanArt: { height: 30, borderRadius: 2, backgroundColor: '#8a9bb0' },
  fanLine: { height: 4, borderRadius: 2, backgroundColor: '#9b9283' },
  titleNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  titleSwatch: { width: 18, height: 10, borderRadius: 3, backgroundColor: colors.accent },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  ok: { margin: 16, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  okText: { color: colors.bg, fontWeight: '900', fontSize: 16 },
});
