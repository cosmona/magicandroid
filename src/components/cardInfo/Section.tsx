import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** A titled card-like block of the info screens (card info, deck synergies). */
export function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Grey explanation under a section title. */
export function SectionHelp({ children }: { children: ReactNode }) {
  return <Text style={styles.help}>{children}</Text>;
}

/** Small uppercase sub-heading inside a section. */
export function SubTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '900' },
  help: { color: colors.textMuted, fontSize: 12 },
  subtitle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
