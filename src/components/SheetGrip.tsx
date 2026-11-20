import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

/** Asa de arrastre dibujada arriba de una hoja o barra (las hojas de Android no muestran un tirador nativo). */
export function SheetGrip() {
  return <View pointerEvents="none" style={styles.grip} />;
}

const styles = StyleSheet.create({
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
});
