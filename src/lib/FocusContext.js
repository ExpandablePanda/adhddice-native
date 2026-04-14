import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const FocusContext = createContext();

const DEFAULT_CATEGORIES = [
  { key: 'work',     label: 'Work',      color: '#4f46e5', icon: 'briefcase-outline' },
  { key: 'study',    label: 'Study',     color: '#0891b2', icon: 'book-outline' },
  { key: 'creative', label: 'Creative',  color: '#7c3aed', icon: 'color-palette-outline' },
  { key: 'exercise', label: 'Exercise',  color: '#059669', icon: 'fitness-outline' },
  { key: 'chores',   label: 'Chores',    color: '#d97706', icon: 'home-outline' },
  { key: 'personal', label: 'Personal',  color: '#ec4899', icon: 'person-outline' },
  { key: 'other',    label: 'Other',     color: '#6b7280', icon: 'ellipsis-horizontal-outline' },
];

export function FocusProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [entries, setEntries]       = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [timerState, setTimerState] = useState({ isRunning: false, category: 'work', secondsAtStart: 0, startTime: null });
  const [loaded, setLoaded]         = useState(false);
  const [isSyncing, setIsSyncing]   = useState(false);
  
  const lastLocalChangeRef = useRef(0);
  const isRemoteUpdateRef  = useRef(false);
  const broadcastRef       = useRef(null);

  // 1. Multi-tab Sync (Web)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
      const channelName = `focus_sync_${user?.id || 'anon'}`;
      broadcastRef.current = new BroadcastChannel(channelName);
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'FOCUS_UPDATE' && event.data.storagePrefix === storagePrefix) {
          isRemoteUpdateRef.current = true;
          if (event.data.entries) setEntries(event.data.entries.map(e => ({ ...e, date: new Date(e.date) })));
          if (event.data.categories) setCategories(event.data.categories);
          if (event.data.timerState) setTimerState(event.data.timerState);
        }
      };
    }
    return () => { if (broadcastRef.current) broadcastRef.current.close(); };
  }, [user?.id, storagePrefix]);

  // 2. Initial Load (Local + Cloud merge)
  useEffect(() => {
    async function loadData() {
      setLoaded(false);
      
      const storedEntries = await AsyncStorage.getItem(`${storagePrefix}focus_entries`);
      const storedCats    = await AsyncStorage.getItem(`${storagePrefix}focus_cats`);
      const storedTimer   = await AsyncStorage.getItem(`${storagePrefix}timer_state`);
      
      if (storedEntries) {
        try { setEntries(JSON.parse(storedEntries).map(e => ({ ...e, date: new Date(e.date) }))); } catch(e) {}
      }
      if (storedCats) {
        try { setCategories(JSON.parse(storedCats)); } catch(e) {}
      }
      if (storedTimer) {
        try { setTimerState(JSON.parse(storedTimer)); } catch(e) {}
      }

      if (user) {
        try {
          const { data } = await supabase.from('user_focus').select('data').eq('user_id', user.id).single();
          if (data?.data) {
            isRemoteUpdateRef.current = true;
            const cloud = data.data;
            if (cloud.entries) setEntries(cloud.entries.map(e => ({ ...e, date: new Date(e.date) })));
            if (cloud.categories) setCategories(cloud.categories);
            if (cloud.timerState) setTimerState(cloud.timerState);
          }
        } catch (e) {
          console.log('Focus sync skipped', e);
        }
      }
      setLoaded(true);
    }
    loadData();
  }, [storagePrefix, user]);

  // 3. Real-time Subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt:user_focus:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_focus', filter: `user_id=eq.${user.id}` }, 
      (payload) => {
        if (payload.new?.data) {
          const remoteTime = new Date(payload.new.updated_at).getTime();
          if (remoteTime > lastLocalChangeRef.current + 1000) {
            isRemoteUpdateRef.current = true;
            const cloud = payload.new.data;
            if (cloud.entries) setEntries(cloud.entries.map(e => ({ ...e, date: new Date(e.date) })));
            if (cloud.categories) setCategories(cloud.categories);
            if (cloud.timerState) setTimerState(cloud.timerState);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // 4. Save Data (Debounced)
  useEffect(() => {
    if (!loaded || !user) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    lastLocalChangeRef.current = Date.now();

    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ type: 'FOCUS_UPDATE', entries, categories, timerState, storagePrefix });
    }

    const saveData = async () => {
      const focusData = { entries, categories, timerState };
      await AsyncStorage.setItem(`${storagePrefix}focus_entries`, JSON.stringify(entries));
      await AsyncStorage.setItem(`${storagePrefix}focus_cats`, JSON.stringify(categories));
      await AsyncStorage.setItem(`${storagePrefix}timer_state`, JSON.stringify(timerState));

      setIsSyncing(true);
      try {
        const { error } = await supabase
          .from('user_focus')
          .upsert({ user_id: user.id, data: focusData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (e) {
        console.error('Focus cloud save failed', e);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(saveData, 1500);
    const handleUnload = () => saveData();
    if (Platform.OS === 'web') window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearTimeout(timeoutId);
      if (Platform.OS === 'web') window.removeEventListener('beforeunload', handleUnload);
    };
  }, [entries, categories, timerState, loaded, user, storagePrefix]);

  const addEntry = (entry) => {
    setEntries(prev => [entry, ...prev]);
  };

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateEntry = (updated) => {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  if (!loaded) return null;

  return (
    <FocusContext.Provider value={{ 
      entries, setEntries, addEntry, deleteEntry, updateEntry,
      categories, setCategories,
      timerState, setTimerState,
      isSyncing 
    }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) throw new Error('useFocus must be used within FocusProvider');
  return context;
}
