import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

/** Drag handle drawn at the top of a sheet or bar (Android sheets don't show a native grabber). */
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
