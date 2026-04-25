import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [dayStartTime, setDayStartTime] = useState(6); // Default 6 AM
  const [resetSubtasksOnParentReset, setResetSubtasksOnParentReset] = useState(true); // Default true
  const [highlightColor, setHighlightColor] = useState(null); // Default uses theme primary
  const [loaded, setLoaded] = useState(false);

  // Load from local storage
  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await AsyncStorage.getItem(`${storagePrefix}settings`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.dayStartTime !== undefined) {
            setDayStartTime(parsed.dayStartTime);
          }
          if (parsed.resetSubtasksOnParentReset !== undefined) {
            setResetSubtasksOnParentReset(parsed.resetSubtasksOnParentReset);
          }
          if (parsed.highlightColor !== undefined) {
            setHighlightColor(parsed.highlightColor);
          }
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      } finally {
        setLoaded(true);
      }
    }
    loadSettings();
  }, [storagePrefix]);

  // Sync with Supabase if logged in
  useEffect(() => {
    if (user && loaded) {
      // Logic to sync settings table if we had one, but for now we rely on AsyncStorage
      // and multi-tab sync could be handled via BroadcastChannel if needed.
    }
  }, [user, loaded]);

  const updateSettings = async (updates) => {
    const newSettings = { dayStartTime, resetSubtasksOnParentReset, highlightColor, ...updates };
    if (updates.dayStartTime !== undefined) setDayStartTime(updates.dayStartTime);
    if (updates.resetSubtasksOnParentReset !== undefined) setResetSubtasksOnParentReset(updates.resetSubtasksOnParentReset);
    if (updates.highlightColor !== undefined) setHighlightColor(updates.highlightColor);

    try {
      await AsyncStorage.setItem(`${storagePrefix}settings`, JSON.stringify(newSettings));
      
      // If we want multi-tab sync on web
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const channel = new window.BroadcastChannel('adhddice_settings_sync');
        channel.postMessage({ type: 'SYNC_SETTINGS', payload: newSettings });
      }
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  // Multi-tab sync listener
  useEffect(() => {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new window.BroadcastChannel('adhddice_settings_sync');
      channel.onmessage = (event) => {
        if (event.data.type === 'SYNC_SETTINGS') {
          const { dayStartTime: newTime, resetSubtasksOnParentReset: newReset, highlightColor: newColor } = event.data.payload;
          if (newTime !== undefined) setDayStartTime(newTime);
          if (newReset !== undefined) setResetSubtasksOnParentReset(newReset);
          if (newColor !== undefined) setHighlightColor(newColor);
        }
      };
      return () => channel.close();
    }
  }, []);

  return (
    <SettingsContext.Provider value={{
      dayStartTime,
      resetSubtasksOnParentReset,
      highlightColor,
      updateSettings
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
}
