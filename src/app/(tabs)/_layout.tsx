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
 * Las herramientas de la app como pestañas arriba, bajo la cabecera de la app (`AppTabBar`). «Construir»
 * (el swipe de cartas) es la primera y es donde abre la app, así que siempre empiezas con cartas en la mano.
 * Las herramientas nuevas (contador de vidas…) se añaden aquí como otro <Tabs.Screen> + un archivo en esta carpeta.
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
