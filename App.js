import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import { View, Text, StyleSheet, Image } from 'react-native';

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

function LogoHeaderLeft() {
  return (
    <Image
      source={require('./assets/logo.png')}
      style={{ height: 64, width: 280, marginLeft: -80, marginTop: -10, backgroundColor: 'transparent', resizeMode: 'contain' }}
    />
  );
}

function MainApp() {
  const { colors, isDark } = useTheme();

  return (
    <NavigationContainer>
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
          <Tab.Screen key={t.name} name={t.name} component={t.component} />
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
    <ProfileProvider>
      <RootApp />
    </ProfileProvider>
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
