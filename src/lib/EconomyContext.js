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
  tokens: 0,
  freeRolls: 0,
  activeStreak: 0,
  missedStreak: 0,
  bankedRewards: [],
  vaultPrizes: [],
  lastInflationUpdate: 0,
  dailyRecord: 0,
};

const BASE_ROLL_COST = 100;
const INFLATION_THRESHOLD = 1000;
const INFLATION_STEP = 100;
const INFLATION_RATE = 5;

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
          try {
            const data = JSON.parse(stored);
            if (data && data.tokens === undefined) data.tokens = 0;
            setEconomy({ ...INITIAL_ECONOMY, ...data });
          } catch (e) {
            console.error('Failed to parse economy data', e);
          }
        }
      } catch (e) {
        console.error('Failed to load local economy', e);
      }

      const localUpdated = await AsyncStorage.getItem(`${storagePrefix}economy_last_updated`);
      const localTs = localUpdated ? parseInt(localUpdated) : 0;
      const localEconomy = economy; // Capture what we have so far

      if (user) {
        try {
          const { data } = await supabase
            .from('user_economy')
            .select('data, updated_at')
            .eq('user_id', user.id)
            .single();

          if (data?.data) {
            const cloudTs = new Date(data.updated_at).getTime();
            
            // Only overwrite if cloud is strictly newer than local
            if (cloudTs > localTs) {
              isRemoteUpdateRef.current = true;
              setEconomy(data.data);
            } else if (localTs > cloudTs + 2000) {
              // Local is newer, trigger a sync to cloud soon
              lastLocalChangeRef.current = Date.now();
            }
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
      const now = Date.now();
      await AsyncStorage.setItem(`${storagePrefix}economy`, JSON.stringify(dataToSave));
      await AsyncStorage.setItem(`${storagePrefix}economy_last_updated`, String(now));

      try {
        const { error } = await supabase
          .from('user_economy')
          .upsert({ user_id: user.id, data: dataToSave, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (e) {
        console.error('Economy cloud save failed', e);
      }
    };

    const timeoutId = setTimeout(saveData, 500); // Faster sync (500ms)
    const handleUnload = () => saveData();
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        saveData();
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('pagehide', handleUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearTimeout(timeoutId);
      if (Platform.OS === 'web') {
        window.removeEventListener('pagehide', handleUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [economy, loaded, user, storagePrefix]);

  const addReward = (gainedPoints, gainedXp, gainedTokens = 0) => {
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
        points: (prev.points || 0) + gainedPoints,
        tokens: (prev.tokens || 0) + gainedTokens,
        xp: newXp,
        level: newLevel,
        xpReq: newReq,
        freeRolls: newRolls,
      };
    });
  };

  const removeReward = (lostPoints, lostXp, lostTokens = 0) => {
    setEconomy(prev => {
      let newXp = prev.xp - lostXp;
      let newPoints = (prev.points || 0) - lostPoints;
      let newTokens = (prev.tokens || 0) - lostTokens;
      let newLevel = prev.level;
      let newReq = prev.xpReq;
      let newRolls = prev.freeRolls;
      
      while (newXp < 0 && newLevel > 1) {
        newLevel--;
        newRolls = Math.max(0, newRolls - 1);
        newReq = Math.ceil(newReq / 1.5);
        newXp += newReq;
      }
      
      return {
        ...prev,
        points: Math.max(0, newPoints),
        tokens: Math.max(0, newTokens),
        xp: Math.max(0, newXp),
        level: newLevel,
        xpReq: newReq,
        freeRolls: newRolls
      };
    });
  };

  const spendPoints = (cost) => {
    // We check the condition inside the functional update logic in callers where possible,
    // but here we ensure the logic is sound and respects free rolls first.
    if (economy.freeRolls > 0) {
      setEconomy(prev => ({ ...prev, freeRolls: Math.max(0, prev.freeRolls - 1) }));
      return true;
    }
    if (economy.points >= cost) {
      setEconomy(prev => ({ ...prev, points: Math.max(0, prev.points - cost) }));
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

  const addFreeRoll = (amount = 1) => {
    setEconomy(prev => ({ ...prev, freeRolls: prev.freeRolls + amount }));
  };

  const bulkConsumeFreeRolls = () => {
    const count = economy.freeRolls;
    if (count > 0) {
      setEconomy(prev => ({ ...prev, freeRolls: 0 }));
    }
    return count;
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

  const addVaultPrize = (title, linkedTaskIds, tokenCost = 0) => {
    setEconomy(prev => ({
      ...prev,
      vaultPrizes: [
        ...(prev.vaultPrizes || []),
        {
          id: 'prize_' + Date.now(),
          title,
          linkedTaskIds: Array.isArray(linkedTaskIds) ? linkedTaskIds : [linkedTaskIds],
          completedTaskIds: [], // Track persistent completions for this specific reward
          tokenCost: Number(tokenCost) || 0,
          status: (linkedTaskIds && linkedTaskIds.length === 0) ? 'unlocked' : 'locked',
          createdAt: new Date().toISOString()
        }
      ]
    }));
  };

  const editVaultPrize = (id, title, linkedTaskIds, tokenCost = 0) => {
    setEconomy(prev => ({
      ...prev,
      vaultPrizes: (prev.vaultPrizes || []).map(p => 
        p.id === id ? { 
          ...p, 
          title, 
          linkedTaskIds: Array.isArray(linkedTaskIds) ? linkedTaskIds : [linkedTaskIds],
          tokenCost: Number(tokenCost) || 0,
          // Reset completions if the linked tasks changed to avoid stale data
          completedTaskIds: (p.linkedTaskIds || []).sort().join(',') === (linkedTaskIds || []).sort().join(',') 
            ? p.completedTaskIds 
            : [],
          status: (linkedTaskIds && linkedTaskIds.length === 0) ? 'unlocked' : p.status
        } : p
      )
    }));
  };

  const unlockPrizeByTaskId = (taskId, allTasks = []) => {
    setEconomy(prev => {
      const updated = (prev.vaultPrizes || []).map(p => {
        if (p.status !== 'locked') return p;
        
        const isLinked = (p.linkedTaskIds || []).includes(String(taskId));
        if (!isLinked) return p;

        // Add this task to the prize's persistent completion record
        const currentCompletions = p.completedTaskIds || [];
        const newCompletions = Array.from(new Set([...currentCompletions, String(taskId)]));
        
        // Check if ALL linked tasks have been completed at least once since prize creation
        const allDone = p.linkedTaskIds.every(id => newCompletions.includes(String(id)));
        
        if (allDone) {
          return { ...p, completedTaskIds: newCompletions, status: 'unlocked', unlockedAt: new Date().toISOString() };
        }
        
        return { ...p, completedTaskIds: newCompletions };
      });
      return { ...prev, vaultPrizes: updated };
    });
  };

  const deleteVaultPrize = (prizeId) => {
    setEconomy(prev => ({
      ...prev,
      vaultPrizes: (prev.vaultPrizes || []).filter(p => p.id !== prizeId)
    }));
  };

  const contributeTokensToPrize = (prizeId, amount) => {
    setEconomy(prev => {
      const prize = (prev.vaultPrizes || []).find(p => p.id === prizeId);
      if (!prize) return prev;
      
      const remaining = (prize.tokenCost || 0) - (prize.tokensPaid || 0);
      const actualAmount = Math.min(amount, prev.tokens, remaining);
      if (actualAmount <= 0) return prev;

      const updatedPrizes = (prev.vaultPrizes || []).map(p => 
        p.id === prizeId ? { ...p, tokensPaid: (p.tokensPaid || 0) + actualAmount } : p
      );

      return {
        ...prev,
        tokens: prev.tokens - actualAmount,
        vaultPrizes: updatedPrizes
      };
    });
  };

  const claimVaultPrize = (prizeId) => {
    setEconomy(prev => {
      const prize = (prev.vaultPrizes || []).find(p => p.id === prizeId);
      if (!prize) return prev;
      
      const remainingCost = (prize.tokenCost || 0) - (prize.tokensPaid || 0);
      if (prev.tokens < remainingCost) return prev; 

      return {
        ...prev,
        tokens: prev.tokens - Math.max(0, remainingCost),
        vaultPrizes: (prev.vaultPrizes || []).filter(p => p.id !== prizeId)
      };
    });
  };

  const spendTokens = (amount) => {
    if ((economy.tokens || 0) < amount) return false;
    setEconomy(prev => ({ ...prev, tokens: prev.tokens - amount }));
    return true;
  };

  const addTokens = (amount) => {
    setEconomy(prev => ({ ...prev, tokens: (prev.tokens || 0) + amount }));
  };

  const getRollCost = () => {
    const pts = economy.points || 0;
    if (pts <= INFLATION_THRESHOLD) return BASE_ROLL_COST;
    const inflation = Math.floor((pts - INFLATION_THRESHOLD) / INFLATION_STEP) * INFLATION_RATE;
    return BASE_ROLL_COST + inflation;
  };

  const getReshuffleCost = () => {
    return Math.floor(getRollCost() * 2);
  };

  const getPrizeEditCost = () => {
    return Math.floor(getRollCost() * 3);
  };

  const getFocusDiceCount = (minutes) => {
    if (minutes <= 0) return 0;
    let diceCount = 0;
    
    // Flat 1 d20 per 30 mins
    diceCount = Math.floor(minutes / 30);

    // Minimum 1 die if at least 15 mins
    if (diceCount === 0 && minutes >= 15) diceCount = 1;
    return diceCount;
  };

  const calculateDiminishingPoints = (minutes) => {
    const diceCount = getFocusDiceCount(minutes);
    let pts = 0;
    for (let i = 0; i < diceCount; i++) {
      pts += Math.floor(Math.random() * 20) + 1;
    }
    return pts;
  };

  const updateDailyRecord = (count) => {
    setEconomy(prev => {
      if (count > (prev.dailyRecord || 0)) {
        return { ...prev, dailyRecord: count };
      }
      return prev;
    });
  };

  return (
    <EconomyContext.Provider value={{ 
      economy, addReward, spendPoints, removeReward, resetEconomy, 
      cheatEconomy, incrementActiveStreak, incrementMissedStreak, 
      addXP, addFreeRoll, bulkConsumeFreeRolls,
      addBankedReward, claimBankedRewards,
      addVaultPrize, editVaultPrize, unlockPrizeByTaskId, deleteVaultPrize, claimVaultPrize, contributeTokensToPrize,
      addTokens, spendTokens, getRollCost, getReshuffleCost, getPrizeEditCost, calculateDiminishingPoints, getFocusDiceCount,
      updateDailyRecord
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

