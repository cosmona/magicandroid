import { Stack } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStateProvider, useAppState } from '@/context/AppState';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/database';
import { colors } from '@/theme';

/** Android's navigation buttons: light icons over the app (transparent bar), or hidden. */
function SystemNavigationBar() {
  const { prefs } = useAppState();
  return <NavigationBar style="light" hidden={prefs.hideNavBar} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <AppStateProvider>
          <StatusBar style="light" />
          <SystemNavigationBar />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </AppStateProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
