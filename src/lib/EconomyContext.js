import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { supabase } from './supabase';

const EconomyContext = createContext();

const INITIAL_ECONOMY = {
  level: 1,
  xp: 0,
  xpReq: 100,
  points: 0,
  freeRolls: 0,
  activeStreak: 0,
  missedStreak: 0,
  bankedRewards: [], // Array of { minutes, xp, points, title, taskId, parentTaskId, etc }
};

export function EconomyProvider({ children }) {
  const { storagePrefix, user } = useProfile();
  const [economy, setEconomy] = useState(INITIAL_ECONOMY);
  const [loaded, setLoaded] = useState(false);
  
  const lastLocalChangeRef = useRef(0);
  const isRemoteUpdateRef  = useRef(false);
  const broadcastRef       = useRef(null);

  // BroadcastChannel for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
      const channelName = `economy_sync_${user?.id || 'anon'}`;
      broadcastRef.current = new BroadcastChannel(channelName);
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'ECONOMY_UPDATE' && event.data.storagePrefix === storagePrefix) {
          isRemoteUpdateRef.current = true;
          setEconomy(event.data.economy);
        }
      };
    }
    return () => { if (broadcastRef.current) broadcastRef.current.close(); };
  }, [user?.id, storagePrefix]);

  // 1. Initial Load
  useEffect(() => {
    async function loadData() {
      setLoaded(false);
      try {
        const stored = await AsyncStorage.getItem(`${storagePrefix}economy`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') {
            setEconomy({ ...INITIAL_ECONOMY, ...parsed });
          }
        }
      } catch (e) {
        console.error('Failed to load local economy', e);
      }

      if (user) {
        try {
          const { data } = await supabase
            .from('user_economy')
            .select('data, updated_at')
            .eq('user_id', user.id)
            .single();

          if (data?.data) {
            isRemoteUpdateRef.current = true;
            setEconomy(data.data);
          }
        } catch (e) {
          console.log('Economy sync skipped', e);
        }
      }
      setLoaded(true);
    }
    loadData();
  }, [storagePrefix, user]);

  // 1b. Real-time
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt:user_economy:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_economy', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new?.data) {
            const remoteTime = new Date(payload.new.updated_at).getTime();
            if (remoteTime > lastLocalChangeRef.current + 1000) {
              isRemoteUpdateRef.current = true;
              setEconomy(payload.new.data);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // 2. Save
  useEffect(() => {
    if (!loaded || !user) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    lastLocalChangeRef.current = Date.now();

    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ type: 'ECONOMY_UPDATE', economy, storagePrefix });
    }

    const saveData = async () => {
      const dataToSave = economy;
      await AsyncStorage.setItem(`${storagePrefix}economy`, JSON.stringify(dataToSave));

      try {
        const { error } = await supabase
          .from('user_economy')
          .upsert({ user_id: user.id, data: dataToSave, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (e) {
        console.error('Economy cloud save failed', e);
      }
    };

    const timeoutId = setTimeout(saveData, 1500);
    // pagehide is BFCache-compatible (beforeunload disables BFCache in Safari)
    const handleUnload = () => saveData();
    if (Platform.OS === 'web') window.addEventListener('pagehide', handleUnload);

    return () => {
      clearTimeout(timeoutId);
      if (Platform.OS === 'web') window.removeEventListener('pagehide', handleUnload);
    };
  }, [economy, loaded, user, storagePrefix]);

  const addReward = (gainedPoints, gainedXp) => {
    setEconomy(prev => {
      let newXp = prev.xp + gainedXp;
      let newLevel = prev.level;
      let newReq = prev.xpReq;
      let newRolls = prev.freeRolls;

      while (newXp >= newReq) {
        newXp -= newReq;
        newLevel++;
        newRolls++;
        newReq = Math.floor(newReq * 1.5);
      }

      return {
        ...prev,
        points: prev.points + gainedPoints,
        xp: newXp,
        level: newLevel,
        xpReq: newReq,
        freeRolls: newRolls,
      };
    });
  };

  const removeReward = (lostPoints, lostXp) => {
    setEconomy(prev => {
      let newXp = prev.xp - lostXp;
      let newPoints = prev.points - lostPoints;
      let newLevel = prev.level;
      let newReq = prev.xpReq;
      let newRolls = prev.freeRolls;
      
      while (newXp < 0 && newLevel > 1) {
        newLevel--;
        newRolls = Math.max(0, newRolls - 1);
        newReq = Math.ceil(newReq / 1.5);
        newXp += newReq;
      }
      
      if (newXp < 0) newXp = 0;
      if (newPoints < 0) newPoints = 0;

      return { ...prev, points: newPoints, xp: newXp, level: newLevel, xpReq: newReq, freeRolls: newRolls };
    });
  };

  const spendPoints = (cost) => {
    if (economy.freeRolls > 0) {
      setEconomy(prev => ({ ...prev, freeRolls: prev.freeRolls - 1 }));
      return true;
    }
    if (economy.points >= cost) {
      setEconomy(prev => ({ ...prev, points: prev.points - cost }));
      return true;
    }
    return false;
  };

  const resetEconomy = () => setEconomy(INITIAL_ECONOMY);

  const cheatEconomy = () => {
    setEconomy(prev => ({ ...prev, points: prev.points + 1000, freeRolls: prev.freeRolls + 10 }));
  };

  const incrementActiveStreak = () => {
    setEconomy(prev => ({ ...prev, activeStreak: (prev.activeStreak || 0) + 1, missedStreak: 0 }));
  };

  const incrementMissedStreak = () => {
    setEconomy(prev => ({ ...prev, missedStreak: (prev.missedStreak || 0) + 1, activeStreak: 0 }));
  };

  const addXP = (amount) => {
    setEconomy(prev => ({ ...prev, xp: prev.xp + amount }));
  };

  const addBankedReward = (reward) => {
    setEconomy(prev => ({
      ...prev,
      bankedRewards: [...(prev.bankedRewards || []), { ...reward, id: Date.now() + Math.random() }]
    }));
  };

  const claimBankedRewards = () => {
    const rewards = economy.bankedRewards || [];
    if (rewards.length === 0) return [];
    
    setEconomy(prev => ({ ...prev, bankedRewards: [] }));
    return rewards;
  };

  return (
    <EconomyContext.Provider value={{ 
      economy, addReward, spendPoints, removeReward, resetEconomy, 
      cheatEconomy, incrementActiveStreak, incrementMissedStreak, 
      addXP, addFreeRoll, bulkConsumeFreeRolls,
      addBankedReward, claimBankedRewards
    }}>
      {children}
    </EconomyContext.Provider>
  );
}

export function useEconomy() {
  const context = useContext(EconomyContext);
  if (!context) throw new Error('useEconomy must be used within EconomyProvider');
  return context;
}

