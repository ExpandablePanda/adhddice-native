import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import TasksScreen from './src/screens/TasksScreen';
import RoutinesScreen from './src/screens/RoutinesScreen';
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
import { RoutinesProvider } from './src/lib/RoutinesContext';

import { ProfileProvider, useProfile } from './src/lib/ProfileContext';
import { SettingsProvider } from './src/lib/SettingsContext';
import AuthScreen from './src/screens/AuthScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Error Boundary for Recovery ─────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReset = async () => {
    try {
      if (Platform.OS === 'web') {
        localStorage.clear();
      }
      await AsyncStorage.clear();
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      alert("Failed to reset data. Please clear your browser cache manually.");
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Ionicons name="alert-circle" size={64} color="#ef4444" />
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 16, textAlign: 'center' }}>Something went wrong</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              The app encountered a critical error during initialization. This is usually caused by corrupted local data.
            </Text>
            <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 12, marginTop: 24, width: '100%' }}>
              <Text style={{ fontSize: 12, color: '#b91c1c', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                {this.state.error?.toString()}
              </Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: '#6366f1', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 32 }}
              onPress={this.handleReset}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Reset App Data & Reload</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

const Tab = createBottomTabNavigator();

const tabs = [
  { name: 'Tasks',        component: TasksScreen,    icon: 'checkbox-outline' },
  { name: 'Routines',     component: RoutinesScreen,  icon: 'list-circle-outline' },
  { name: 'Focus',        component: FocusScreen,     icon: 'timer-outline' },
  { name: 'Roll Rewards', component: DiceScreen,      icon: 'dice-outline' },
  { name: 'Games',        component: GamesScreen,     icon: 'game-controller-outline' },
  { name: 'Stats',        component: StatsScreen,     icon: 'bar-chart-outline' },
  { name: 'Notes',        component: NotesScreen,     icon: 'document-text-outline' },
  { name: 'Settings',     component: SettingsScreen,  icon: 'settings-outline' },
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

const APP_VERSION = 'V.03.06';

function LogoHeaderLeft() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('./assets/logo.png')}
        style={{ height: 64, width: 280, marginLeft: -80, marginTop: -10, backgroundColor: 'transparent', resizeMode: 'contain' }}
      />
      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, marginLeft: -45, marginTop: 4 }}>{APP_VERSION}</Text>
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
        if (saved) {
          const parsed = JSON.parse(saved);
          // Simple validation: ensure it's an object with a routes array
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.routes)) {
            setInitialNavState(parsed);
          }
        }
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


function RootApp() {
  const { user } = useProfile();

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ThemeProvider>
      <SettingsProvider>
        <EconomyProvider>
          <TasksProvider>
            <RoutinesProvider>
              <NotesProvider>
                <FocusProvider>
                  <MainApp />
                </FocusProvider>
              </NotesProvider>
            </RoutinesProvider>
          </TasksProvider>
        </EconomyProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ProfileProvider>
          <RootApp />
        </ProfileProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  lvlBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 12,
  },
  lvlText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  xpContainer: {
    width: 60,
    marginRight: 12,
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
