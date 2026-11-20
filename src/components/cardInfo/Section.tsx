import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Un bloque con título tipo tarjeta de las pantallas de info (info de carta, sinergias del mazo, estadísticas).
 * `collapsible`: tocar el título lo pliega / despliega (empieza abierto).
 */
export function Section({
  title,
  icon,
  collapsible = false,
  children,
}: {
  title: string;
  icon: IconName;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const header = (
    <>
      <MaterialCommunityIcons name={icon} size={20} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
      {collapsible && (
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textMuted} />
      )}
    </>
  );
  return (
    <View style={styles.section}>
      {collapsible ? (
        <Pressable
          style={({ pressed }) => [styles.header, pressed && { opacity: 0.6 }]}
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={title}
        >
          {header}
        </Pressable>
      ) : (
        <View style={styles.header}>{header}</View>
      )}
      {(!collapsible || open) && children}
    </View>
  );
}

/** Explicación en gris bajo el título de una sección. */
export function SectionHelp({ children }: { children: ReactNode }) {
  return <Text style={styles.help}>{children}</Text>;
}

/** Subtítulo pequeño en mayúsculas dentro de una sección. */
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
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '900' },
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
