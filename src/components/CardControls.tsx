import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { HintButton } from '@/components/Hint';
import { colors, TONE_COLORS, type Tone } from '@/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Fila bajo una carta (hoja del mazo y colección): un stepper de cantidad, luego botones de icono repartiéndose el ancho. */
export function CardControlsRow({ children }: { children: ReactNode }) {
  return <View style={styles.controls}>{children}</View>;
}

/** «− 2 +» en una sola pieza redondeada. */
export function QuantityStepper(props: { value: number; onSub: () => void; onAdd: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
        onPress={props.onSub}
        accessibilityLabel="Quitar una copia"
        hitSlop={4}
      >
        <MaterialCommunityIcons name="minus" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.qtyText}>{props.value}</Text>
      <Pressable
        style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
        onPress={props.onAdd}
        accessibilityLabel="Añadir una copia"
        hitSlop={4}
      >
        <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

export function CardIconButton(props: {
  icon: IconName;
  hint: string;
  onPress: () => void;
  /** Fondo de acento (estado activo, p. ej. el comandante). */
  filled?: boolean;
  danger?: boolean;
  /** Código de color del icono (ver `Tone` en theme). */
  tone?: Tone;
}) {
  const tone = props.danger ? 'danger' : props.tone;
  return (
    <HintButton
      hint={props.hint}
      onPress={props.onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.button, props.filled && styles.filled, pressed && { opacity: 0.6 }]}
    >
      <MaterialCommunityIcons
        name={props.icon}
        size={20}
        color={props.filled ? colors.bg : tone ? TONE_COLORS[tone] : colors.text}
      />
    </HintButton>
  );
}

/** Barra flotante «Relámpago quitada · ↶ Deshacer» en la parte inferior de su contenedor. */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <View style={styles.undoBar} pointerEvents="box-none">
      <View style={styles.undoBox}>
        <Text style={styles.undoText} numberOfLines={1}>
          {label}
        </Text>
        <Pressable onPress={onUndo} hitSlop={8} style={styles.undoButton} accessibilityRole="button">
          <MaterialCommunityIcons name="undo-variant" size={18} color={colors.bg} />
          <Text style={styles.undoButtonText}>Deshacer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stepperButton: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: colors.text, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  button: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  filled: { backgroundColor: colors.accent, borderColor: colors.accent },
  undoBar: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  undoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
  },
  undoText: { flex: 1, color: colors.text, fontWeight: '700' },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  undoButtonText: { color: colors.bg, fontWeight: '800' },
});
