import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { useSettings } from './SettingsContext';

export const lightColors = {
  background: '#ffffff',
  surface: '#f9fafb',
  border: '#e5e7eb',
  primary: '#4f46e5',
  green: '#059669',
  red: '#dc2626',
  amber: '#d97706',
  teal: '#0891b2',
  violet: '#7c3aed',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  cardBackground: '#ffffff',
  headerBackground: '#ffffff',
  inputBackground: '#f3f4f6',
};

export const darkColors = {
  background: '#030712',      // Very dark gray/black
  surface: '#111827',         // Dark gray cards
  border: '#1f2937',          // Darker border
  primary: '#818cf8',         // Lighter indigo for dark mode contrast
  green: '#34d399',           // Brighter green
  red: '#f87171',             // Brighter red
  amber: '#fbbf24',           // Brighter yellow
  teal: '#2dd4bf',            // Brighter teal
  violet: '#a78bfa',          // Brighter violet
  textPrimary: '#f9fafb',     // Almost white
  textSecondary: '#9ca3af',   // Light gray
  textMuted: '#6b7280',       // Medium gray
  cardBackground: '#111827',
  headerBackground: '#030712',
  inputBackground: '#1f2937',
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { storagePrefix } = useProfile();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(`${storagePrefix}theme_preference`).then(val => {
      if (val === 'dark') setIsDark(true);
    });
  }, [storagePrefix]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    AsyncStorage.setItem(`${storagePrefix}theme_preference`, nextDark ? 'dark' : 'light');
  };

  const { highlightColor } = useSettings();
  const baseColors = isDark ? darkColors : lightColors;
  const colors = {
    ...baseColors,
    primary: highlightColor || baseColors.primary
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
