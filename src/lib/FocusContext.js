import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const FocusContext = createContext();

export const DEFAULT_CATEGORIES = [
  { key: 'work',        label: 'Work',          color: '#4f46e5', icon: 'briefcase-outline', nature: 'work', subtype: 'paid' },
  { key: 'lamprey',     label: 'Lamprey (Work)',color: '#4338ca', icon: 'flash-outline',     nature: 'work', subtype: 'productive' },
  { key: 'study',       label: 'Study',         color: '#0891b2', icon: 'book-outline',      nature: 'work', subtype: 'productive' },
  { key: 'learning',    label: 'Learning',      color: '#0e7490', icon: 'school-outline',    nature: 'work', subtype: 'productive' },
  { key: 'creative',    label: 'Creative',      color: '#7c3aed', icon: 'color-palette-outline', nature: 'personal', subtype: 'productive' },
  { key: 'exercise',    label: 'Exercise',      color: '#059669', icon: 'fitness-outline',    nature: 'personal', subtype: 'productive' },
  { key: 'chores',      label: 'Chores',        color: '#d97706', icon: 'home-outline',       nature: 'personal', subtype: 'productive' },
  { key: 'tcg',         label: 'TCG (Social)',  color: '#be185d', icon: 'people-outline',    nature: 'entertainment', subtype: 'comfort' },
  { key: 'music',       label: 'Music (Ent.)',  color: '#db2777', icon: 'musical-notes-outline', nature: 'entertainment', subtype: 'comfort' },
  { key: 'entertainment',label: 'Entertainment', color: '#c026d3', icon: 'tv-outline',        nature: 'entertainment', subtype: 'comfort' },
  { key: 'doomscrolling',label: 'Doomscrolling', color: '#4b5563', icon: 'skull-outline',    nature: 'entertainment', subtype: 'comfort' },
  { key: 'social',      label: 'Social',        color: '#e11d48', icon: 'chatbubble-outline', nature: 'entertainment', subtype: 'comfort' },
  { key: 'personal',    label: 'Personal',      color: '#ec4899', icon: 'person-outline',     nature: 'personal', subtype: 'productive' },
  { key: 'sleep',       label: 'Sleep',         color: '#3b82f6', icon: 'moon-outline',       nature: 'sleep', subtype: 'productive' },
  { key: 'other',       label: 'Other',         color: '#6b7280', icon: 'ellipsis-horizontal-outline', nature: 'personal', subtype: 'productive' },
];

export function FocusProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [entries, setEntries]       = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [goals, setGoals]           = useState({});
  const [timerState, setTimerState] = useState({}); // Map: Record<categoryKey, { secondsAtStart: number, startTime: string | null }>
  const [activeTimerKeys, setActiveTimerKeys] = useState(['work']); // Keys of timers visible on dashboard
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
          if (event.data.goals) setGoals(event.data.goals);
          if (event.data.timerState && typeof event.data.timerState === 'object') {
            setTimerState(event.data.timerState);
          }
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
      const storedGoals   = await AsyncStorage.getItem(`${storagePrefix}focus_goals`);
      const storedTimer   = await AsyncStorage.getItem(`${storagePrefix}timer_state`);
      const storedVisKeys = await AsyncStorage.getItem(`${storagePrefix}active_timer_keys`);
      
      if (storedEntries) {
        try { setEntries(JSON.parse(storedEntries).map(e => ({ ...e, date: new Date(e.date) }))); } catch(e) {}
      }
      if (storedCats) {
        try { 
          let parsed = JSON.parse(storedCats);
          // MIGRATION: Map isProductive to nature
          parsed = parsed.map(c => {
            const label = (c.label || '').toLowerCase();
            let n = c.nature;
            // Map old natures to new branches
            if (n === 'productive' || !n) {
              n = label.includes('work') ? 'work' : 'personal';
            }
            if (n === 'sleep' && !c.subtype) return { ...c, nature: 'sleep', subtype: 'productive' };
            if (n === 'entertainment' && !c.subtype) return { ...c, nature: 'entertainment', subtype: 'comfort' };
            if (n === 'work' && !c.subtype) return { ...c, nature: 'work', subtype: 'paid' };
            if (n === 'personal' && !c.subtype) return { ...c, nature: 'personal', subtype: 'productive' };
            return { ...c, nature: n };
          });
          setCategories(parsed); 
        } catch(e) {}
      }
      if (storedGoals) {
        try { setGoals(JSON.parse(storedGoals)); } catch(e) {}
      }
      if (storedTimer) {
        try { 
          const parsed = JSON.parse(storedTimer);
          // Migrate old single-timer state if detected (object with 'category' key)
          if (parsed && typeof parsed === 'object' && parsed.category && !parsed[parsed.category]) {
             setTimerState({ 
               [parsed.category]: { 
                 secondsAtStart: parsed.secondsAtStart || 0, 
                 startTime: parsed.startTime || null 
               } 
             });
          } else if (parsed && typeof parsed === 'object') {
             // Sanitize to remove any null values that could cause crashes
             const sanitized = {};
             Object.entries(parsed).forEach(([k, v]) => {
               if (v && typeof v === 'object') sanitized[k] = v;
             });
             setTimerState(sanitized); 
          } else {
             setTimerState({});
          }
        } catch(e) {}
      }
      if (storedVisKeys) {
        try { setActiveTimerKeys(JSON.parse(storedVisKeys)); } catch(e) {}
      }

      const localUpdated = await AsyncStorage.getItem(`${storagePrefix}focus_last_updated`);
      const localTs = localUpdated ? parseInt(localUpdated) : 0;

      if (user) {
        try {
          const { data } = await supabase.from('user_focus').select('data, updated_at').eq('user_id', user.id).single();
          if (data?.data) {
            const cloudTs = new Date(data.updated_at).getTime();
            if (cloudTs > localTs) {
              isRemoteUpdateRef.current = true;
              const cloud = data.data;
              if (cloud.entries) setEntries(cloud.entries.map(e => ({ ...e, date: new Date(e.date) })));
              if (cloud.categories) setCategories(cloud.categories);
              if (cloud.goals) setGoals(cloud.goals);
              if (cloud.timerState && typeof cloud.timerState === 'object') {
                const sanitized = {};
                Object.entries(cloud.timerState).forEach(([k, v]) => { if (v && typeof v === 'object') sanitized[k] = v; });
                setTimerState(sanitized);
              } else if (cloud.timerState === null) {
                setTimerState({});
              }
              if (cloud.activeTimerKeys && Array.isArray(cloud.activeTimerKeys) && cloud.activeTimerKeys.length > 0) {
                setActiveTimerKeys(cloud.activeTimerKeys);
              }
            } else if (localTs > cloudTs + 2000) {
              needsImmediateSyncRef.current = true;
            }
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
            if (cloud.goals) setGoals(cloud.goals);
            
            if (cloud.timerState !== undefined) {
              setTimerState(cloud.timerState || {});
            }
            
            if (cloud.activeTimerKeys) setActiveTimerKeys(cloud.activeTimerKeys);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Track state in refs for immediate sync access without closure stale-ness
  const stateRef = useRef({ entries, categories, goals, timerState, activeTimerKeys });
  const needsImmediateSyncRef = useRef(false);

  useEffect(() => {
    stateRef.current = { entries, categories, goals, timerState, activeTimerKeys };
  }, [entries, categories, goals, timerState, activeTimerKeys]);

  const saveFocusData = useCallback(async () => {
    if (!loaded || !user) return;
    const { entries: e, categories: c, goals: g, timerState: ts, activeTimerKeys: atk } = stateRef.current;
    
    const focusData = { entries: e, categories: c, goals: g, timerState: ts, activeTimerKeys: atk };
    
    // Broadcast immediately (even if cloud fails)
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ type: 'FOCUS_UPDATE', ...focusData, storagePrefix });
    }

    const now = Date.now();
    await AsyncStorage.setItem(`${storagePrefix}focus_entries`, JSON.stringify(e));
    await AsyncStorage.setItem(`${storagePrefix}focus_cats`, JSON.stringify(c));
    await AsyncStorage.setItem(`${storagePrefix}focus_goals`, JSON.stringify(g));
    await AsyncStorage.setItem(`${storagePrefix}timer_state`, JSON.stringify(ts));
    await AsyncStorage.setItem(`${storagePrefix}active_timer_keys`, JSON.stringify(atk));
    await AsyncStorage.setItem(`${storagePrefix}focus_last_updated`, String(now));

    if (user) {
      setIsSyncing(true);
      try {
        const { error } = await supabase
          .from('user_focus')
          .upsert({ user_id: user.id, data: focusData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (err) {
        console.error('Focus cloud save failed', err);
      } finally {
        setIsSyncing(false);
      }
    }
  }, [loaded, user, storagePrefix]);

  const syncTimeoutRef = useRef(null);
  const triggerFocusSync = useCallback((immediate = false) => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    if (immediate) {
      saveFocusData();
    } else {
      syncTimeoutRef.current = setTimeout(saveFocusData, 1500);
    }
  }, [saveFocusData]);

  // 4. Save Data (Auto-debounced for general state changes)
  useEffect(() => {
    if (!loaded || !user) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    lastLocalChangeRef.current = Date.now();
    
    // Check if any action requested an immediate sync (e.g., timer start/stop)
    if (needsImmediateSyncRef.current) {
      needsImmediateSyncRef.current = false;
      triggerFocusSync(true);
    } else {
      triggerFocusSync(false); // Debounce by default (1.5s)
    }

    const handleUnload = () => saveFocusData();
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        saveFocusData();
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('pagehide', handleUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      if (Platform.OS === 'web') {
        window.removeEventListener('pagehide', handleUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [entries, categories, goals, timerState, activeTimerKeys, loaded, user, storagePrefix, triggerFocusSync, saveFocusData]);

  const addEntry = (entry) => {
    setEntries(prev => [entry, ...prev]);
  };

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateEntry = (updated) => {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  const startTimer = (category) => {
    needsImmediateSyncRef.current = true;
    setTimerState(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        startTime: new Date().toISOString(),
        secondsAtStart: prev[category]?.secondsAtStart || 0
      }
    }));
  };

  const stopTimer = (category) => {
    const state = timerState[category];
    if (!state || !state.startTime) return 0;
    
    const elapsed = Math.floor((new Date() - new Date(state.startTime)) / 1000);
    const total = (state.secondsAtStart || 0) + elapsed;
    
    needsImmediateSyncRef.current = true;
    setTimerState(prev => {
      const next = { ...prev };
      next[category] = {
        ...next[category],
        startTime: null,
        secondsAtStart: total
      };
      return next;
    });
    return total;
  };

  const resetTimer = (category) => {
    needsImmediateSyncRef.current = true;
    setTimerState(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  };

  const addVisibleTimer = (key) => {
    setActiveTimerKeys(prev => prev.includes(key) ? prev : [...prev, key]);
  };

  const removeVisibleTimer = (key) => {
    setActiveTimerKeys(prev => {
      const next = prev.filter(k => k !== key);
      return next.length > 0 ? next : ['work']; // Never let it be empty
    });
    resetTimer(key); 
  };

  const adjustTimer = (key, deltaSec) => {
    needsImmediateSyncRef.current = true;
    setTimerState(prev => {
      const current = prev[key] || { secondsAtStart: 0, startTime: null };
      const newSeconds = Math.max(0, (current.secondsAtStart || 0) + deltaSec);
      return {
        ...prev,
        [key]: {
          ...current,
          secondsAtStart: newSeconds
        }
      };
    });
  };

  const reorderTimer = (key, direction) => {
    setActiveTimerKeys(prev => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const bumpTimer = (key) => {
    setActiveTimerKeys(prev => {
      const idx = prev.indexOf(key);
      if (idx === -1 || idx === 0) return prev;
      const filtered = prev.filter(k => k !== key);
      return [key, ...filtered];
    });
  };

  if (!loaded) return null;

  return (
    <FocusContext.Provider value={{ 
      entries, setEntries, addEntry, deleteEntry, updateEntry,
      categories, setCategories,
      goals, setGoals,
      timerState, setTimerState,
      activeTimerKeys,
      addVisibleTimer, removeVisibleTimer, reorderTimer, bumpTimer,
      adjustTimer,
      startTimer, stopTimer, resetTimer,
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
