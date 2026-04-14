import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import TasksScreen from './src/screens/TasksScreen';
import FocusScreen from './src/screens/FocusScreen';
import DiceScreen from './src/screens/DiceScreen';
import GamesScreen from './src/screens/GamesScreen';
import StatsScreen from './src/screens/StatsScreen';
import NotesScreen from './src/screens/NotesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/lib/ThemeContext';
import { TasksProvider } from './src/lib/TasksContext';
import { EconomyProvider, useEconomy } from './src/lib/EconomyContext';
import { NotesProvider } from './src/lib/NotesContext';
import { FocusProvider } from './src/lib/FocusContext';
import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';

import { ProfileProvider, useProfile } from './src/lib/ProfileContext';

const Tab = createBottomTabNavigator();

const tabs = [
  { name: 'Tasks', component: TasksScreen, icon: 'checkbox-outline' },
  { name: 'Focus', component: FocusScreen, icon: 'timer-outline' },
  { name: 'Roll Rewards', component: DiceScreen, icon: 'dice-outline' },
  { name: 'Games', component: GamesScreen, icon: 'game-controller-outline' },
  { name: 'Stats', component: StatsScreen, icon: 'bar-chart-outline' },
  { name: 'Notes', component: NotesScreen, icon: 'document-text-outline' },
  { name: 'Settings', component: SettingsScreen, icon: 'settings-outline' },
];

function RPGHeaderRight() {
  const { economy } = useEconomy();
  const { colors } = useTheme();

  return (
    <View style={headerStyles.container}>
      <View style={[headerStyles.lvlBadge, { backgroundColor: colors.primary }]}>
        <Text style={headerStyles.lvlText}>Lvl {economy.level}</Text>
      </View>
      <View style={headerStyles.xpContainer}>
        <View style={headerStyles.xpTextRow}>
          <Text style={[headerStyles.xpVal, { color: colors.textSecondary }]}>{economy.xp} / {economy.xpReq} XP</Text>
        </View>
        <View style={[headerStyles.xpBarBg, { backgroundColor: colors.border }]}>
          <View style={[headerStyles.xpBarFill, { width: `${Math.min(100, Math.floor((economy.xp / economy.xpReq) * 100))}%` }]} />
        </View>
      </View>
      <View style={headerStyles.pointsBadge}>
        <Ionicons name="star" size={12} color={colors.amber} />
        <Text style={[headerStyles.pointsText, { color: colors.textPrimary }]}>{economy.points}</Text>
      </View>
    </View>
  );
}

const APP_VERSION = 'V.02.06';

function LogoHeaderLeft() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('./assets/logo.png')}
        style={{ height: 64, width: 280, marginLeft: -80, marginTop: -10, backgroundColor: 'transparent', resizeMode: 'contain' }}
      />
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', marginLeft: -24, marginTop: 4 }}>{APP_VERSION}</Text>
    </View>
  );
}

const NAV_STATE_KEY = 'adhddice_nav_state';

function MainApp() {
  const { colors, isDark } = useTheme();
  const [navReady, setNavReady] = React.useState(false);
  const [initialNavState, setInitialNavState] = React.useState(undefined);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem(NAV_STATE_KEY);
        if (saved) setInitialNavState(JSON.parse(saved));
      } catch (_) {}

      // When Safari restores from BFCache (e.g. switching back from a full-screen Space),
      // the page is not reloaded — dispatch visibilitychange so contexts can re-sync
      const handlePageShow = (e) => {
        if (e.persisted) {
          document.dispatchEvent(new Event('visibilitychange'));
        }
      };
      window.addEventListener('pageshow', handlePageShow);
      setNavReady(true);
      return () => window.removeEventListener('pageshow', handlePageShow);
    }
    setNavReady(true);
  }, []);

  if (!navReady) return null;

  return (
    <NavigationContainer
      initialState={initialNavState}
      onStateChange={(state) => {
        if (Platform.OS === 'web') {
          try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)); } catch (_) {}
        }
      }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.headerBackground },
          headerTintColor: colors.textPrimary,
          headerTitle: '',
          headerLeft: () => <LogoHeaderLeft />,
          headerRight: () => <RPGHeaderRight />,
          tabBarStyle: { backgroundColor: colors.headerBackground, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ color, size }) => {
            const tab = tabs.find(t => t.name === route.name);
            return <Ionicons name={tab.icon} size={size} color={color} />;
          },
        })}
      >
        {tabs.map(t => (
          <Tab.Screen key={t.name} name={t.name} component={t.component} options={{ unmountOnBlur: false }} />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

import AuthScreen from './src/screens/AuthScreen';

function RootApp() {
  const { user } = useProfile();

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ThemeProvider>
      <EconomyProvider>
        <TasksProvider>
          <NotesProvider>
            <FocusProvider>
              <MainApp />
            </FocusProvider>
          </NotesProvider>
        </TasksProvider>
      </EconomyProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProfileProvider>
        <RootApp />
      </ProfileProvider>
    </SafeAreaProvider>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 12,
  },
  lvlBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lvlText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  xpContainer: {
    width: 60,
  },
  xpTextRow: {
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  xpVal: {
    fontSize: 10,
    fontWeight: '700',
  },
  xpBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#34d399',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pointsText: {
    fontWeight: '800',
    fontSize: 12,
  },
});
