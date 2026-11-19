import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/BottomSheet';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useSQLiteContext } from 'expo-sqlite';
import { getCollectionVersion } from '@/db/database';
import { useSeen } from '@/hooks/useSeen';
import { colors } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * The app's header + tool tabs, drawn at the top (`tabBarPosition: 'top'`): "Magic Swipe"
 * with the settings button, then a segmented control with one pill per tab (icon from the
 * screen's `tabBarIcon`, label from its `title`). Settings are app-wide, so their sheet lives here.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const db = useSQLiteContext();
  const { isNew, markSeen } = useSeen();
  const [collVer, setCollVer] = useState(0);
  const onCollection = state.routes[state.index]?.name === 'collection';
  useEffect(() => {
    getCollectionVersion(db).then(setCollVer).catch(() => {});
  }, [db, state.index]);
  useEffect(() => {
    if (onCollection) markSeen('collection', collVer);
  }, [onCollection, collVer, markSeen]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Magic Swipe</Text>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
          hitSlop={6}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // Hidden tabs (a beta turned off in Ajustes).
          if ((options as { href?: unknown }).href === null) return null;
          const focused = state.index === index;
          const color = focused ? colors.bg : colors.textMuted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tab,
                focused && styles.tabActive,
                pressed && !focused && { opacity: 0.6 },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
            >
              {options.tabBarIcon?.({ focused, color, size: 20 })}
              <Text style={[styles.tabLabel, { color }]}>{options.title ?? route.name}</Text>
              {route.name === 'collection' && !focused && isNew('collection', collVer) && <View style={styles.tabDot} />}
            </Pressable>
          );
        })}
      </View>

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} heightRatio={0.75}>
        <SettingsSheet />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.accent, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  tabDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginLeft: 1 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 38,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { fontWeight: '800', fontSize: 14 },
});
