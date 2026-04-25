import { Platform, View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, LayoutAnimation } from 'react-native';
import React from 'react';
import { NavigationContainer, NavigationIndependentTree, useNavigation, useNavigationState } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LogBox } from 'react-native';

// Silence noisy but harmless WebGL/EXGL, Three.js, and hot-reload warnings
const IGNORED_LOGS = [
  'Multiple instances of Three.js being imported',
  'Clock: This module has been deprecated',
  'EXT_color_buffer_float extension not supported',
  'gl.pixelStorei() doesn\'t support this parameter yet!',
  'Three.js being imported multiple times',
  // r3f v9 bridges ALL React contexts (including React Navigation) into the Canvas's
  // new React root via its-fine. During Fast Refresh, the bridged NavigationStateContext
  // lingers while the main tree remounts, causing a false "nested NavigationContainer"
  // detection. This is a dev-only hot-reload artifact — the app works correctly.
  "Looks like you have nested a 'NavigationContainer' inside another",
];

LogBox.ignoreLogs(IGNORED_LOGS);

// Override console.warn to capture and suppress these from terminal output as well
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = args.join(' ');
  if (IGNORED_LOGS.some(log => msg.includes(log))) return;
  originalWarn(...args);
};

// Suppress the NavigationContainer false-positive from console.error too (Fast Refresh artifact)
const originalError = console.error;
console.error = (...args) => {
  const msg = args.join(' ');
  if (IGNORED_LOGS.some(log => msg.includes(log))) return;
  originalError(...args);
};

// Also filter console.log for the pixelStorei EXGL messages which often come as LOG
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');
  if (msg.includes('gl.pixelStorei()')) return;
  originalLog(...args);
};

import TasksScreen from './src/screens/TasksScreen';
import RoutinesScreen from './src/screens/RoutinesScreen';
import FocusScreen from './src/screens/FocusScreen';
import DiceScreen from './src/screens/DiceScreen';
import GamesScreen from './src/screens/GamesScreen';
import StatsScreen from './src/screens/StatsScreen';
import NotesScreen from './src/screens/NotesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TestScreen from './src/screens/TestScreen';
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
import { APP_VERSION } from './src/lib/Constants';
import { createDailyBackup } from './src/lib/BackupManager';

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
  { name: 'Tasks', component: TasksScreen, icon: 'checkbox-outline' },
  { name: 'Routines', component: RoutinesScreen, icon: 'list-circle-outline' },
  { name: 'Focus', component: FocusScreen, icon: 'timer-outline' },
  { name: 'Roll', component: DiceScreen, icon: 'dice-outline' },
  { name: 'Games', component: GamesScreen, icon: 'game-controller-outline' },
  { name: 'Stats', component: StatsScreen, icon: 'bar-chart-outline' },
  { name: 'Notes', component: NotesScreen, icon: 'document-text-outline' },
  { name: 'Settings', component: SettingsScreen, icon: 'settings-outline' },
  { name: 'Test', component: TestScreen, icon: 'flask-outline' },
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
      <View style={[headerStyles.pointsBadge, { marginLeft: 8 }]}>
        <Ionicons name="wallet" size={12} color="#8b5cf6" />
        <Text style={[headerStyles.pointsText, { color: colors.textPrimary }]}>{economy.tokens || 0}</Text>
      </View>
    </View>
  );
}


function LogoHeaderLeft() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('./assets/logo.png')}
        style={{
          height: 80,       // <--- Original x 1.25
          width: 350,       // <--- Original x 1.25
          marginLeft: -110, // <--- Adjusted for extra width
          marginTop: -10,   // <--- Move logo up/down
          backgroundColor: 'transparent',
          resizeMode: 'contain'
        }}
      />
      <Text style={{
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
        marginLeft: -115,    // <--- Spacing between Logo and Version
        marginTop: 4
      }}>
        {APP_VERSION}
      </Text>
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
      } catch (_) { }

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
    // NavigationIndependentTree resets the navigation context check so r3f/its-fine's
    // context bridging (which re-provides NavigationStateContext inside the Canvas root)
    // doesn't trigger React Navigation's nested-container detection.
    <NavigationIndependentTree>
      <NavigationContainer
        initialState={initialNavState}
        onStateChange={(state) => {
          if (Platform.OS === 'web') {
            try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)); } catch (_) { }
          }
        }}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <Tab.Navigator
          tabBar={props => <FloatingNav {...props} tabs={tabs} />}
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: colors.headerBackground },
            headerTintColor: colors.textPrimary,
            headerTitle: '',
            headerLeft: () => <LogoHeaderLeft />,
            headerRight: () => <RPGHeaderRight />,
            tabBarStyle: { display: 'none' }, // HIDE DEFAULT TAB BAR
          })}
        >
          {tabs.map(t => (
            <Tab.Screen key={t.name} name={t.name} component={t.component} options={{ unmountOnBlur: false }} />
          ))}
        </Tab.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}


function RootApp() {
  const { user, storagePrefix } = useProfile();

  React.useEffect(() => {
    if (user && storagePrefix) {
      createDailyBackup(storagePrefix).catch(e => console.error("AutoBackup error", e));
    }
  }, [user, storagePrefix]);

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <SettingsProvider>
      <ThemeProvider>
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
      </ThemeProvider>
    </SettingsProvider>
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
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  lvlText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  xpContainer: {
    width: 50,
    marginRight: 8,
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
    gap: 3,
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 12,
  },
  pointsText: {
    fontWeight: '800',
    fontSize: 12,
  },
});

function FloatingNav({ tabs, state, navigation }) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  const currentRouteName = state?.routes[state.index]?.name || 'Tasks';

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const goTo = (name) => {
    navigation.navigate(name);
  };

  return (
    <View style={navStyles.container} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={expanded ? undefined : toggle}
        style={[
          navStyles.pill,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: colors.border,
            width: expanded ? '90%' : 60,
          }
        ]}
      >
        {expanded ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[navStyles.scrollContent, { paddingRight: 20 }]}
          >
            {tabs.map(t => {
              const active = tabs[state?.index || 0]?.name === t.name;
              return (
                <TouchableOpacity
                  key={t.name}
                  onPress={() => goTo(t.name)}
                  style={[navStyles.iconWrap, active && { backgroundColor: colors.primary + '20', borderRadius: 12 }]}
                >
                  <Ionicons name={t.icon} size={24} color={active ? colors.primary : colors.textMuted} />
                  <Text style={[navStyles.iconLabel, { color: active ? colors.primary : colors.textMuted }]}>{t.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={navStyles.minimized}>
            <Ionicons
              name={tabs[state?.index || 0]?.icon || 'menu'}
              size={28}
              color={colors.primary}
            />
          </View>
        )}

        {expanded && (
          <TouchableOpacity onPress={toggle} style={navStyles.closeBtn}>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

const navStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // CENTER THE MINIMIZED CONTENT
    paddingHorizontal: 0,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimized: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 60,
  },
  iconLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 10,
    marginRight: 4,
  }
});
