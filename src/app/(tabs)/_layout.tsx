import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AppTabBar } from '@/components/AppTabBar';
import { useAppState } from '@/context/AppState';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const icon = (name: IconName, focusedName: IconName = name) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <MaterialCommunityIcons name={focused ? focusedName : name} size={size} color={color as string} />;
  };

/**
 * App tools as tabs at the top, under the app header (`AppTabBar`). "Construir" (the card
 * swipe) is first and is where the app opens, so you always start with cards in your hands.
 * New tools (life counter…) are added here as another <Tabs.Screen> + a file in this folder.
 */
export default function TabsLayout() {
  const { prefs } = useAppState();
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: 'top',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Construir', tabBarIcon: icon('cards-playing-outline', 'cards-playing') }}
      />
      <Tabs.Screen name="collection" options={{ title: 'Colección', tabBarIcon: icon('bookshelf') }} />
      <Tabs.Screen name="life" options={{ title: 'Vidas', tabBarIcon: icon('heart-outline', 'heart') }} />
      {/* Beta: only when turned on in Ajustes. */}
      <Tabs.Screen
        name="hand"
        options={{ title: 'Mano', tabBarIcon: icon('hand-back-right-outline', 'hand-back-right'), href: prefs.handBeta ? undefined : null }}
      />
    </Tabs>
  );
}
