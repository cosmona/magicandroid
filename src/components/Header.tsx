import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

/** Top header (the web version held Login/SignUp here; this app has no accounts). */
export function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Magic Swipe</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.accent, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
});
