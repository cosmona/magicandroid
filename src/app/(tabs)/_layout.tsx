import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/theme';

const icon = (symbol: string) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Text style={{ color, fontSize: focused ? 22 : 20 }}>{symbol}</Text>;
  };

/**
 * App tools as bottom tabs. "Construir" (the card swipe) is first and is where the app
 * opens, so you always start with cards in your hands. New tools (life counter…) are
 * added here as another <Tabs.Screen> + a file in this folder.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Construir', tabBarIcon: icon('🃏') }} />
      <Tabs.Screen name="collection" options={{ title: 'Colección', tabBarIcon: icon('📦') }} />
    </Tabs>
  );
}
