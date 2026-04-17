import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, Animated, Easing, Alert,
  ScrollView, KeyboardAvoidingView, Platform,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useEconomy } from '../lib/EconomyContext';
import { useTheme } from '../lib/ThemeContext';
import { useProfile } from '../lib/ProfileContext';
import { supabase } from '../lib/supabase';
import { useTasks } from '../lib/TasksContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScrollToTop from '../components/ScrollToTop';
import ModalScreen from '../components/ModalScreen';
import EfficiencyRollModal from '../components/EfficiencyRollModal';

const SCREEN_W = Dimensions.get('window').width;

const DEFAULT_POOLS = {
  master: ['Bank a free roll', 'Bank 2 free rolls', 'Bank 3 free rolls', 'If Next Roll is Over 17 - Bank 5 rolls', 'Choose Any Small Prize'],
  small: ['☕ Coffee break', '🎵 Pick a song', '🍫 Snack time', '📱 5 min phone break', '🚶 Take a walk', '🧘 Quick meditation', '🎨 Doodle break', '🎉 Dance break'],
  big: ['🎮 1 hour gaming', '📺 Watch an episode', '🍕 Order takeout tonight', '💤 Power nap', '🛒 Buy something small', '📖 Read a chapter', '🧊 Ice cream reward', '💪 Skip a chore today', '🌿 Go outside for 30 min'],
};

function shuffle(arr) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function generateDailyPool(pools) {
  let master = shuffle(pools.master || []);
  let small = shuffle(pools.small || []);
  let big = shuffle(pools.big || []);

  const getS = (arr, max) => {
     let res = [];
     for(let i=0; i<max; i++) {
        res.push(arr[i % arr.length] || 'Fallback Prize'); 
     }
     return res;
  };

  const chosenMaster = getS(master, 2);
  const chosenSmall = getS(small, 7);
  const chosenBig = getS(big, 7);

  return {
     1: "No Prize",
     2: chosenMaster[0],
     3: chosenMaster[1],
     4: chosenSmall[0],
     5: chosenSmall[1],
     6: chosenSmall[2],
     7: chosenSmall[3],
     8: chosenSmall[4],
     9: chosenSmall[5],
     10: chosenSmall[6],
     11: chosenBig[0],
     12: chosenBig[1],
     13: chosenBig[2],
     14: chosenBig[3],
     15: chosenBig[4],
     16: chosenBig[5],
     17: chosenBig[6],
     18: "[Swap] Replace a prize with an unselected prize",
     19: "[Multiplier] Double Next Prize!",
     20: "Any Prize! Choose anything from the global pool",
  };
}

// ── D20 SVG-like shape drawn with View transforms ───────────────────────────
function D20Shape({ size, color, glowColor }) {
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer diamond — rotated square */}
      <View style={{
        width: size * 0.82,
        height: size * 0.82,
        transform: [{ rotate: '45deg' }],
        backgroundColor: color,
        borderRadius: size * 0.08,
        position: 'absolute',
        shadowColor: glowColor,
        shadowOpacity: 0.6,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 0 },
        elevation: 20,
      }} />
      {/* Inner top triangle illusion */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: half * 0.55,
        borderRightWidth: half * 0.55,
        borderBottomWidth: half * 0.65,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: 'rgba(255,255,255,0.08)',
        position: 'absolute',
        top: size * 0.18,
      }} />
      {/* Bottom inverted triangle */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: half * 0.55,
        borderRightWidth: half * 0.55,
        borderTopWidth: half * 0.65,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'rgba(255,255,255,0.04)',
        position: 'absolute',
        bottom: size * 0.18,
      }} />
      {/* Diagonal lines */}
      <View style={{
        position: 'absolute', width: size * 0.6, height: 1.5,
        backgroundColor: 'rgba(255,255,255,0.12)',
        transform: [{ rotate: '30deg' }],
      }} />
      <View style={{
        position: 'absolute', width: size * 0.6, height: 1.5,
        backgroundColor: 'rgba(255,255,255,0.12)',
        transform: [{ rotate: '-30deg' }],
      }} />
      <View style={{
        position: 'absolute', width: 1.5, height: size * 0.45,
        backgroundColor: 'rgba(255,255,255,0.1)',
      }} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIZE MANAGER MODAL
// ═════════════════════════════════════════════════════════════════════════════

function PrizeManagerModal({ visible, pools, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState({ master: [], small: [], big: [] });
  const [activeTab, setActiveTab] = useState('small'); // 'master', 'small', 'big'
  const [newPrize, setNewPrize] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft({
        master: [...(pools.master || [])],
        small: [...(pools.small || [])],
        big: [...(pools.big || [])],
      });
      setNewPrize('');
      setBulkMode(false);
      setBulkText('');
    }
  }, [visible, pools]);

  function addPrize() {
    const trimmed = newPrize.trim();
    if (!trimmed) return;
    setDraft(d => ({ ...d, [activeTab]: [...Math.max(d[activeTab]||[]), trimmed] }));
    setNewPrize('');
  }

  function removePrize(index) {
    setDraft(d => ({ ...d, [activeTab]: d[activeTab].filter((_, i) => i !== index) }));
  }

  function handleBulkImport() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setDraft(d => ({ ...d, [activeTab]: [...(d[activeTab]||[]), ...lines] }));
    setBulkText('');
    setBulkMode(false);
  }

  function clearTab() {
    if (Platform.OS === 'web') {
      setDraft(d => ({ ...d, [activeTab]: [] }));
      return;
    }
    Alert.alert(`Clear ${activeTab} Prizes`, 'Remove all prizes in this list?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setDraft(d => ({ ...d, [activeTab]: [] })) },
    ]);
  }

  function resetDefaults() {
    if (Platform.OS === 'web') {
      setDraft(JSON.parse(JSON.stringify(DEFAULT_POOLS)));
      return;
    }
    Alert.alert('Reset to Defaults', 'Replace all global pools with defaults?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => setDraft(JSON.parse(JSON.stringify(DEFAULT_POOLS))) },
    ]);
  }

  const currentList = draft[activeTab] || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.managerScreen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.managerHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.managerTitle}>Manage Prizes</Text>
          <TouchableOpacity onPress={() => onSave(draft)} style={styles.savePrizesBtn}>
            <Text style={styles.savePrizesText}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }}>
          {['master', 'small', 'big'].map(t => (
            <TouchableOpacity 
              key={t}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderColor: activeTab === t ? colors.primary : 'transparent' }}
              onPress={() => { setActiveTab(t); setBulkMode(false); }}
            >
              <Text style={{ fontWeight: '600', color: activeTab === t ? colors.primary : colors.textMuted, textTransform: 'capitalize' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.managerBody} keyboardShouldPersistTaps="handled">
          
          {activeTab === 'master' && (
            <View style={{backgroundColor: '#e0e7ff', padding: 12, borderRadius: 8, marginBottom: 16}}>
              <Text style={{color: '#4338ca', fontSize: 13, textAlign: 'center'}}>
                Master prizes contain specialized gameplay logic mechanics and cannot be deleted or modified.
              </Text>
            </View>
          )}

          {activeTab !== 'master' && (
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickBtn} onPress={() => setBulkMode(b => !b)}>
                <Ionicons name="list-outline" size={16} color={colors.primary} />
                <Text style={styles.quickBtnText}>Bulk Import</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={resetDefaults}>
                <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                <Text style={styles.quickBtnText}>Defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { borderColor: '#ef4444' }]} onPress={clearTab}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={[styles.quickBtnText, { color: '#ef4444' }]}>Clear List</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab !== 'master' && bulkMode && (
            <View style={styles.bulkArea}>
              <Text style={styles.bulkHint}>One prize per line:</Text>
              <TextInput style={styles.bulkInput} value={bulkText} onChangeText={setBulkText} multiline textAlignVertical="top" />
              <TouchableOpacity style={styles.bulkImportBtn} onPress={handleBulkImport}>
                <Text style={styles.bulkImportText}>Import {bulkText.split('\n').filter(l => l.trim()).length} Prizes attached to {activeTab.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab !== 'master' && (
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                placeholder={`Add a ${activeTab} prize...`}
                placeholderTextColor="#555"
                value={newPrize}
                onChangeText={setNewPrize}
                onSubmitEditing={addPrize}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.addPrizeBtn} onPress={addPrize}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.prizeCount}>{currentList.length} prize{currentList.length !== 1 ? 's' : ''}</Text>

          {currentList.map((prize, idx) => (
            <View key={`${idx}-${prize}`} style={styles.prizeRow}>
              <View style={styles.prizeNumber}>
                <Text style={styles.prizeNumberText}>{idx + 1}</Text>
              </View>
              <Text style={styles.prizeText} numberOfLines={2}>{prize}</Text>
              {activeTab !== 'master' && (
                <TouchableOpacity onPress={() => removePrize(idx)} style={styles.prizeRemove}>
                  <Ionicons name="close-circle" size={20} color="#555" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function DiceScreen() {
  const { economy, spendPoints, addFreeRoll } = useEconomy();
  const { user, storagePrefix } = useProfile();

  const [pools, setPools]           = useState(DEFAULT_POOLS);
  const [dailyBoard, setDailyBoard] = useState(null); // the generated faceMap
  const [multiplier, setMultiplier] = useState(1);
  const [bank5IfOver17, setBank5IfOver17] = useState(0);
  const [rolling, setRolling]       = useState(false);
  const [result, setResult]         = useState(null); // { face, prize }
  const [showManager, setShowManager] = useState(false);
  const { startBreak, breakTimer, setBreakTimer, adjustBreakTime, linkPrizeToBreak } = useTasks();
  const [breakInput, setBreakInput] = useState('10');
  const [showPrizeLinker, setShowPrizeLinker] = useState(false);
  const [pendingPrize, setPendingPrize] = useState(null); // { name, count }
  const [modalSelection, setModalSelection] = useState(null); // { name, count }
  const [showEfficiencyRoll, setShowEfficiencyRoll] = useState(false);
  
  const rollSoundRef = useRef(null);
  const alarmSoundRef = useRef(null);
  const broadcastRef = useRef(null);

  useEffect(() => {
    async function loadSounds() {
      try {
        const { sound: rollSound } = await Audio.Sound.createAsync(require('../../assets/dice-roll.wav'));
        rollSoundRef.current = rollSound;
        
        const { sound: alarmSound } = await Audio.Sound.createAsync(require('../../assets/calm-alarm.wav'));
        alarmSoundRef.current = alarmSound;
      } catch (e) {
        console.log('Failed to load focus sounds', e);
      }
    }
    loadSounds();

    // Initialize BroadcastChannel for D20 Board sync across tabs
    if (Platform.OS === 'web' && typeof BroadcastChannel !== 'undefined') {
      const channelName = `dice_sync_${user?.id || 'anon'}`;
      broadcastRef.current = new BroadcastChannel(channelName);
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'DICE_UPDATE' && event.data.storagePrefix === storagePrefix) {
          // Update local state from other tab's broadcast
          if (event.data.pools) setPools(event.data.pools);
          if (event.data.history) setHistory(event.data.history);
          if (event.data.rewardPool) setRewardPool(event.data.rewardPool);
          if (event.data.dailyBoard) setDailyBoard(event.data.dailyBoard);
          if (event.data.multiplier) setMultiplier(event.data.multiplier);
          if (event.data.bank5IfOver17) setBank5IfOver17(event.data.bank5IfOver17);
        }
      };
    }

    return () => {
      if (rollSoundRef.current) rollSoundRef.current.unloadAsync();
      if (alarmSoundRef.current) alarmSoundRef.current.unloadAsync();
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, [user?.id, storagePrefix]);

  async function playAlarmSound() {
    try {
      if (alarmSoundRef.current) {
        await alarmSoundRef.current.replayAsync();
      }
    } catch (e) {}
  }

  async function playRollSound() {
    try {
      if (rollSoundRef.current) {
        await rollSoundRef.current.replayAsync();
      }
    } catch (e) {}
  }
  
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const handleScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 300);
  };
  
  const [showSwapUI, setShowSwapUI]     = useState(null); // stores multiplier count when active
  const [showAnyPicker, setShowAnyPicker] = useState(null); // { type: 'all' | 'small', count: int } 
  const [history, setHistory]       = useState([]);
  const [rewardPool, setRewardPool] = useState({});
  const [loaded, setLoaded]         = useState(false);

  // Local state for smooth countdown ticking and alarm timing
  const [localRemaining, setLocalRemaining] = useState(0);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    async function loadDice() {
      const localKey = `${storagePrefix}dice_data`;
      let currentPools = DEFAULT_POOLS;
      let boardData = null;

      // Load from local storage (try new prefixed key, fall back to legacy key)
      const stored = await AsyncStorage.getItem(localKey) || await AsyncStorage.getItem('@ADHD_dice_data');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.pools) currentPools = data.pools;
          if (data.history) setHistory(data.history);
          if (data.rewardPool) setRewardPool(data.rewardPool);
          if (data.dailyBoard) boardData = data.dailyBoard;
          if (data.multiplier) setMultiplier(data.multiplier);
          if (data.bank5IfOver17) setBank5IfOver17(data.bank5IfOver17);
        } catch (e) { console.error('Failed to parse dice data', e); }
      }
      // Cloud is source of truth
      if (user) {
        try {
          const { data: row } = await supabase.from('user_dice').select('data').eq('user_id', user.id).single();
          if (row?.data) {
            const cloud = row.data;
            if (cloud.pools) currentPools = cloud.pools;
            if (cloud.history) setHistory(cloud.history);
            if (cloud.rewardPool) setRewardPool(cloud.rewardPool);
            if (cloud.dailyBoard) boardData = cloud.dailyBoard;
            if (cloud.multiplier) setMultiplier(cloud.multiplier);
            if (cloud.bank5IfOver17) setBank5IfOver17(cloud.bank5IfOver17);
          }
        } catch (e) { console.log('Dice cloud sync skipped', e); }
      }
      if (currentPools) setPools(currentPools);
      
      const today = new Date().toDateString();
      if (!boardData || boardData.date !== today) {
        boardData = { date: today, map: generateDailyPool(currentPools) };
      }
      setDailyBoard(boardData);
      setLoaded(true);
    }
    loadDice();
  }, [storagePrefix, user]);

  // AUTO-CLAIM LOGIC: Watch the break timer and claim the reward if it finishes
  const lastTimerState = useRef(null);
  // EFFECT: Handle smooth ticking and Alarm/Reward trigger
  useEffect(() => {
    let interval;
    if (breakTimer && breakTimer.endTime) {
      wasActiveRef.current = true;
      const update = () => {
        const rem = Math.max(0, Math.floor((breakTimer.endTime - Date.now()) / 1000));
        setLocalRemaining(rem);
        
        if (rem <= 0 && wasActiveRef.current) {
          wasActiveRef.current = false;
          playAlarmSound();
          if (breakTimer.linkedPrize) {
            const { name, count } = breakTimer.linkedPrize;
            claimReward(name, count);
          }
          // The context itself will eventually clear breakTimer via its own useEffect
          // but we can help it by clearing it locally if needed.
          setBreakTimer(null);
        }
      };
      update();
      interval = setInterval(update, 1000);
    } else {
      setLocalRemaining(0);
      wasActiveRef.current = false;
    }
    return () => clearInterval(interval);
  }, [breakTimer?.endTime]);

  useEffect(() => {
    if (!loaded || !dailyBoard) return;
    const localKey = `${storagePrefix}dice_data`;
    const data = { pools, history, rewardPool, dailyBoard, multiplier, bank5IfOver17 };
    AsyncStorage.setItem(localKey, JSON.stringify(data)).catch(e => console.error('Failed to save dice data', e));
    if (user) {
      supabase.from('user_dice')
        .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('Dice cloud save failed', error); });
    }

    // Broadcast to other tabs
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        type: 'DICE_UPDATE',
        ...data,
        storagePrefix
      });
    }
  }, [pools, history, rewardPool, dailyBoard, multiplier, bank5IfOver17, loaded, storagePrefix, user]);

  // Animations
  const spin     = useRef(new Animated.Value(0)).current;
  const bounce   = useRef(new Animated.Value(1)).current;
  const glow     = useRef(new Animated.Value(0)).current;
  const resultFade = useRef(new Animated.Value(0)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  // Idle floating animation
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Pulse animation for result
  useEffect(() => {
    if (result) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [result]);

  function grantPrizeMechanics(basePrize, count, logFace) {
      // Internal execution parser for special mechanics
      let finalPrize = basePrize;

      if (basePrize.includes('Bank a free roll')) addFreeRoll(1 * count);
      else if (basePrize.includes('Bank 2 free rolls')) addFreeRoll(2 * count);
      else if (basePrize.includes('Bank 3 free rolls')) addFreeRoll(3 * count);
      else if (basePrize.includes('If Next Roll is Over 17 - Bank 5 rolls')) setBank5IfOver17(c => c + count);
      else if (basePrize.includes('Choose Any Small Prize')) setShowAnyPicker({ type: 'small', count });
      else {
         setRewardPool(pool => ({ ...pool, [finalPrize]: (pool[finalPrize] || 0) + count }));
      }
      
      setHistory(h => [{ face: logFace, prize: finalPrize, time: Date.now() }, ...h].slice(0, 20));
  }
  
  // Daily 8 AM Reshuffle Prompt
  useEffect(() => {
    if (!loaded || !dailyBoard) return;
    
    async function checkDailyPrompt() {
      const now = new Date();
      if (now.getHours() < 8) return; // Only prompt at or after 8 AM
      
      const today = now.toDateString();
      const promptKey = `${storagePrefix}last_daily_reshuffle_prompt`;
      const lastPrompt = await AsyncStorage.getItem(promptKey);
      
      if (lastPrompt !== today) {
        // Mark as prompted today immediately to avoid multiple alerts
        await AsyncStorage.setItem(promptKey, today);
        
        Alert.alert(
          'Daily Board Refresh 🎲',
          'It is past 8:00 AM! Would you like to perform a free manual reshuffle of your D20 rewards board for the day?',
          [
            { text: 'Maybe Later', style: 'cancel' },
            { 
              text: 'Reshuffle Now', 
              onPress: () => {
                const newBoard = { date: today, map: generateDailyPool(pools) };
                setDailyBoard(newBoard);
                Alert.alert('Success!', 'Board has been reshuffled for free.');
              }
            }
          ]
        );
      }
    }
    checkDailyPrompt();
  }, [loaded, dailyBoard, storagePrefix, pools]);

  const submitRollResult = (face) => {
    let basePrize = dailyBoard.map[face] || 'Fallback Prize';
    let currentMultiplier = multiplier;

    let triggeredBank5 = 0;
    if (bank5IfOver17 > 0 && face > 17) {
       triggeredBank5 = 5 * bank5IfOver17;
       addFreeRoll(triggeredBank5);
    }
    if (bank5IfOver17 > 0) setBank5IfOver17(0);

    let displayPrize = basePrize;

    let resultText = displayPrize;
    if (triggeredBank5 > 0) resultText += ` 🎯(+${triggeredBank5} Free Rolls!)`;
    setResult({ face, prize: resultText });

    if (face === 18) {
       setShowSwapUI(currentMultiplier); 
    } else if (face === 20) {
       setShowAnyPicker({ type: 'all', count: currentMultiplier });
    } else if (face === 19) {
       setHistory(h => [{ face, prize: resultText, time: Date.now() }, ...h].slice(0, 20));
       setMultiplier(m => m * 2);
       addFreeRoll(1);
    } else if (face !== 1) {
       grantPrizeMechanics(basePrize, currentMultiplier, face);
    }

    if (face !== 19 && face !== 18 && face !== 20 && face !== 1 && currentMultiplier > 1) {
       setMultiplier(1);
    }
  };

  const handlePhysicalRoll = () => {
    if (rolling || !dailyBoard || !dailyBoard.map) return;
    
    Alert.prompt(
      'Physical Roll Result',
      'Roll your real D20 and enter exactly what you rolled (1-20):',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          onPress: (val) => {
             const face = parseInt(val);
             if (isNaN(face) || face < 1 || face > 20) {
                Alert.alert('Invalid Roll', 'Must be a number between 1 and 20.');
                return;
             }
             if (!spendPoints(100)) {
               Alert.alert('Not enough Points', 'You need 100 Points or a Free Roll to roll for rewards.');
               return;
             }
             setResult(null);
             submitRollResult(face);
          }
        }
      ],
      'plain-text',
      '',
      'number-pad'
    );
  };

  function rollDice() {
    if (rolling || !dailyBoard || !dailyBoard.map) return;

    if (!spendPoints(100)) {
      Alert.alert('Not enough Points', 'You need 100 Points or a Free Roll to roll for rewards.');
      return;
    }

    setRolling(true);
    setResult(null);
    playRollSound();
    resultFade.setValue(0);
    spin.setValue(0);
    bounce.setValue(1);
    glow.setValue(0);

    const face = Math.floor(Math.random() * 20) + 1;

    Animated.sequence([
      Animated.timing(spin, { toValue: 6, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(bounce, { toValue: 1.15, friction: 3, tension: 200, useNativeDriver: true }),
      Animated.spring(bounce, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      submitRollResult(face);
      setRolling(false);
      Animated.spring(resultFade, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    });
  }

  function savePrizes(newPools) {
    setPools(newPools);
    setDailyBoard({ date: new Date().toDateString(), map: generateDailyPool(newPools) });
    setShowManager(false);
  }

  function claimReward(prize, count = 1) {
    setRewardPool(pool => {
      const newPool = { ...pool };
      if (newPool[prize] > count) {
        newPool[prize] -= count;
      } else {
        delete newPool[prize];
      }
      return newPool;
    });
  }

  function claimAnyPrize(prize) {
    if (!showAnyPicker) return;
    const count = showAnyPicker.count || 1;
    let finalPrize = prize;
    if (count > 1) finalPrize = `[x${count}] ${prize}`;
    
    setResult({ face: 20, prize: finalPrize });
    grantPrizeMechanics(prize, count, 20);
    setMultiplier(1);
    setShowAnyPicker(null);
  }

  function executeSwap(targetFace, newPrize) {
    if (!showSwapUI) return;
    const count = showSwapUI || 1;
    
    setDailyBoard(b => ({ ...b, map: { ...b.map, [targetFace]: newPrize } }));
    
    let finalPrize = newPrize;
    if (count > 1) finalPrize = `[x${count}] ${newPrize}`;
    
    setResult(r => ({ ...r, prize: `Swapped: ${finalPrize}` }));
    grantPrizeMechanics(newPrize, count, 18);
    setMultiplier(1);
    setShowSwapUI(null);
  }

  const poolEntries = Object.entries(rewardPool)
    .filter(([, count]) => typeof count === 'number' && !isNaN(count))
    .sort((a, b) => {
      const aName = a[0];
      const bName = b[0];
      const aStartsNum = /^\d/.test(aName);
      const bStartsNum = /^\d/.test(bName);

      if (aStartsNum && !bStartsNum) return -1;
      if (!aStartsNum && bStartsNum) return 1;
      
      // If both are numbers or both are text, sort naturally (handles "5" vs "10")
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
    });
  const totalUnclaimed = poolEntries.reduce((acc, [, count]) => acc + count, 0);

  function handleManualShuffle() {
    const msg = 'Would you like to manually randomize the entire custom D20 Board? This costs 200 Points.';
    
    const performShuffle = () => {
      const success = spendPoints(200);
      if (success) {
        const newBoard = { date: new Date().toDateString(), map: generateDailyPool(pools) };
        setDailyBoard(newBoard);
        // Sync to other tabs
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({ type: 'BOARD_SYNC', board: newBoard });
        }
      } else {
        if (Platform.OS === 'web') window.alert('Not Enough Points: You need 200 points to forcefully reshuffle the board.');
        else Alert.alert('Not Enough Points', 'You need 200 points to forcefully reshuffle the board.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        performShuffle();
      }
    } else {
      Alert.alert(
        'Reshuffle Board',
        msg,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Shuffle (200 pts)', onPress: performShuffle }
        ]
      );
    }
  }

  const renderGridBoard = (isModal = false) => {
    if (!dailyBoard || !dailyBoard.map) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
        {[...Array(20)].map((_, i) => {
           const face = i + 1;
           let prize = dailyBoard.map[face] || 'No Prize';
           if (face === 18) prize = '[Swap] Replace Board Item';
           if (face === 19) prize = '[Instant] Double Next Reward';
           if (face === 20) prize = '[Omni] Choose Any Action';

           const isActive = !isModal && result && result.face === face;
           const isMaster = face === 2 || face === 3;
           const isSmall = face >= 4 && face <= 10;
           const isBig = face >= 11 && face <= 17;

           let bg = '#374151'; 
           if (isMaster) bg = '#fbbf24'; 
           if (isSmall) bg = '#34d399'; 
           if (isBig) bg = '#a78bfa'; 
           if (face >= 18) bg = '#6366f1'; 
           
           if (isActive) bg = colors.primary;

           return (
             <TouchableOpacity 
                key={face} 
                style={{ 
                  width: '18%', 
                  height: 64, 
                  backgroundColor: bg, 
                  borderRadius: 8, 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderWidth: isActive ? 3 : 0,
                  borderColor: '#fff',
                  opacity: (!isModal && rolling) ? 0.5 : 1,
                  padding: 2
                }}
                onPress={() => {
                   Alert.alert(`Face ${face}`, prize);
                }}
             >
               <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{face}</Text>
               <Text style={{ color: '#ffffffcc', fontSize: 9, textAlign: 'center', marginTop: 1 }} numberOfLines={2}>
                 {prize}
               </Text>
             </TouchableOpacity>
           );
        })}
      </View>
    );
  };

  const spinRotation = spin.interpolate({
    inputRange: [0, 6],
    outputRange: ['0deg', '2160deg'],
  });

  const floatTranslate = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && { maxWidth: 600, alignSelf: 'center', width: '100%' }]} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="dice-outline" size={24} color={colors.primary} />
            <View>
              <Text style={styles.headerTitle}>Roll Rewards</Text>
              <Text style={styles.headerSub}>
                {Object.values(pools).reduce((acc, p) => acc + (p || []).length, 0)} prizes loaded
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.manageBtn} onPress={() => setShowManager(true)}>
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
              <Text style={styles.manageBtnText}>Prizes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reward Cost Bar */}
        <View style={styles.costBar}>
          <Text style={styles.costText}>Cost: 100 Points or 1 Free Roll</Text>
          <Text style={styles.bankText}>{economy.freeRolls > 0 ? `${economy.freeRolls} Free Rolls` : `${economy.points} Points`}</Text>
        </View>

        {/* Main interactive area */}
        <View style={styles.gameArea}>
          {/* Ambient glow behind dice */}
          <Animated.View style={[styles.ambientGlow, { opacity: glowOpacity }]} />

          <Animated.View style={{
            transform: [
              { translateY: floatTranslate },
              { rotate: spinRotation },
              { scale: bounce },
            ],
          }}>
            <TouchableOpacity
              onPress={rollDice}
              activeOpacity={0.8}
              disabled={rolling}
            >
              <D20Shape size={Platform.OS === 'web' ? Math.min(SCREEN_W * 0.48, 180) : SCREEN_W * 0.48} color={colors.primary} glowColor={colors.primary} />
              {/* Number on the face */}
              <View style={styles.diceNumberWrap}>
                <Text style={styles.diceNumber}>
                  {rolling ? '?' : (result ? result.face : '20')}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Tap hint — between dice and button for equal spacing */}
        <View style={styles.tapHintRow}>
          {!rolling && !result && (
            <Text style={styles.tapHint}>Tap the dice to roll!</Text>
          )}
          {rolling && (
            <Text style={styles.tapHint}>Rolling...</Text>
          )}
        </View>

        {!rolling && (
          <View style={{ alignItems: 'center', marginBottom: 32, gap: 12 }}>
            <TouchableOpacity 
              style={styles.rollAgainBtn} 
              onPress={rollDice}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.rollAgainText}>Roll {multiplier > 1 ? `x${multiplier}` : 'Dice'}</Text>
            </TouchableOpacity>

            {economy.freeRolls > 1 && (
              <TouchableOpacity 
                style={[styles.rollAgainBtn, { backgroundColor: '#8b5cf6' }]} 
                onPress={() => setShowEfficiencyRoll(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="flash-outline" size={20} color="#fff" />
                <Text style={styles.rollAgainText}>Efficiency Roll ({economy.freeRolls})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Result card — moved above board */}
        {result && (
          <Animated.View style={[styles.resultCard, {
            opacity: resultFade,
            transform: [
              { scale: Animated.multiply(resultFade, pulseAnim) },
            ],
            marginBottom: 24, // spacing
          }]}>
            <View style={styles.resultFaceBadge}>
              <Text style={styles.resultFaceText}>{result.face}</Text>
            </View>
            <Text style={styles.resultPrize}>{result.prize}</Text>
            {result.face === 18 && (!result.prize.startsWith('Swapped')) && (
              <TouchableOpacity style={[styles.rollAgainBtn, { backgroundColor: '#6366f1' }]} onPress={() => setShowSwapUI({ count: multiplier })}>
                <Ionicons name="swap-horizontal" size={18} color="#fff" />
                <Text style={styles.rollAgainText}>Execute Swap</Text>
              </TouchableOpacity>
            )}
            {result.face === 20 && (
              <TouchableOpacity style={[styles.rollAgainBtn, { backgroundColor: '#6366f1' }]} onPress={() => setShowAnyPicker({ type: 'all', count: multiplier })}>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.rollAgainText}>Pick Any Prize</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.rollAgainBtn} onPress={rollDice}>
              <Ionicons name="dice-outline" size={18} color="#fff" />
              <Text style={styles.rollAgainText}>Roll Again</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* 5x4 Persistent Grid Board */}
        {dailyBoard && dailyBoard.map && (
           <View style={{ marginBottom: 24, paddingHorizontal: 16 }}>
             <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Active D20 Board</Text>
                <TouchableOpacity onPress={handleManualShuffle}>
                   <Ionicons name="shuffle" size={20} color={colors.primary} />
                </TouchableOpacity>
             </View>
             {renderGridBoard(false)}
           </View>
        )}

        {/* Permanent Break Timer UI */}
        <View style={styles.breakSection}>
          <Text style={styles.breakTitle}>Time for a break?</Text>
          
          <TouchableOpacity 
            onPress={() => {
              setModalSelection(breakTimer?.linkedPrize || pendingPrize || null);
              setShowPrizeLinker(true);
            }}
            style={[styles.breakClock, (breakTimer || pendingPrize) && { borderColor: colors.primary }]} 
          >
            <View style={styles.breakClockInner}>
              {breakTimer?.linkedPrize ? (
                <>
                  <Text style={styles.linkedPrizeLabel}>TRACKING</Text>
                  <Text style={styles.linkedPrizeText} numberOfLines={2} adjustFontSizeToFit>
                    {breakTimer.linkedPrize.count > 1 ? `${breakTimer.linkedPrize.count}x ` : ''}{breakTimer.linkedPrize.name}
                  </Text>
                  <Text style={styles.clockTime}>{Math.floor(localRemaining / 60)}:{String(localRemaining % 60).padStart(2, '0')}</Text>
                </>
              ) : pendingPrize ? (
                <>
                  <Text style={styles.linkedPrizeLabel}>LINKED</Text>
                  <Text style={styles.linkedPrizeText} numberOfLines={2} adjustFontSizeToFit>
                    {pendingPrize.count > 1 ? `${pendingPrize.count}x ` : ''}{pendingPrize.name}
                  </Text>
                  <Text style={[styles.clockSub, { fontSize: 11 }]} numberOfLines={2} adjustFontSizeToFit>Select Time Below</Text>
                </>
              ) : (
                <>
                  <Ionicons name="time-outline" size={32} color="#d1d5db" style={{ marginBottom: 4 }} />
                  <Text style={styles.clockSub}>Tap to Link Reward</Text>
                </>
              )}
            </View>
          </TouchableOpacity>

          {/* Adjustment Controls (Only if running) */}
          {breakTimer && (
            <>
              <View style={styles.timerAdjustRow}>
                {[-5, -1, 1, 5].map(m => (
                  <TouchableOpacity 
                    key={m} 
                    style={[styles.smallAdjustBtn, { backgroundColor: m > 0 ? colors.primary + '15' : '#fee2e2' }]} 
                    onPress={() => adjustBreakTime(m * 60)}
                  >
                    <Text style={[styles.adjustBtnText, { color: m > 0 ? colors.primary : '#ef4444' }]}>{m > 0 ? '+' : ''}{m}m</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TouchableOpacity 
                style={styles.cancelBreakBtn} 
                onPress={() => setBreakTimer(null)}
              >
                <Ionicons name="stop-circle-outline" size={16} color="#ef4444" />
                <Text style={styles.cancelBreakText}>STOP TIMER</Text>
              </TouchableOpacity>
            </>
          )}

          {(breakTimer || pendingPrize) && (
            <View style={styles.breakRow}>
              {['5', '10', '15', '20'].map(m => (
                <TouchableOpacity 
                  key={m}
                  style={[styles.breakOpt, breakInput === m && styles.breakOptActive]} 
                  onPress={() => {
                    setBreakInput(m);
                    if (pendingPrize && !breakTimer) {
                      startBreak(parseInt(m), pendingPrize);
                      setPendingPrize(null);
                    }
                  }}
                >
                  <Text style={[styles.breakOptText, breakInput === m && styles.breakOptTextActive]}>{m}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {breakTimer && (
            <TouchableOpacity 
              style={[styles.linkPrizeBtn, breakTimer.linkedPrize && { borderColor: colors.primary, backgroundColor: colors.primary + '08' }]} 
              onPress={() => {
                setModalSelection(breakTimer.linkedPrize);
                setShowPrizeLinker(true);
              }}
            >
              <Ionicons name="link-outline" size={16} color={colors.primary} />
              <Text style={styles.linkPrizeText}>{breakTimer.linkedPrize ? 'Change Linked Reward' : 'Link Reward to Timer'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Empty state */}
        {!pools && (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No prizes yet!</Text>
            <Text style={styles.emptySub}>Add prizes to start rolling for rewards.</Text>
            <TouchableOpacity style={styles.addPrizesEmptyBtn} onPress={() => setShowManager(true)}>
              <Text style={styles.addPrizesEmptyText}>Add Prizes</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reward Pool */}
        {poolEntries.length > 0 && (
          <View style={styles.poolSection}>
            <View style={styles.poolHeader}>
              <View style={styles.poolTitleRow}>
                <Ionicons name="gift" size={18} color={colors.primary} />
                <Text style={styles.poolTitle}>Reward Pool</Text>
              </View>
              <View style={styles.poolBadge}>
                <Text style={styles.poolBadgeText}>{totalUnclaimed}</Text>
              </View>
            </View>
            <Text style={styles.poolHint}>Claim rewards once you've taken them!</Text>
            {poolEntries.map(([prize, count]) => (
              <View key={prize} style={styles.poolRow}>
                <View style={styles.poolPrizeInfo}>
                  <Text style={styles.poolPrize} numberOfLines={2}>{prize}</Text>
                  {count > 1 && (
                    <View style={styles.poolCountBadge}>
                      <Text style={styles.poolCountText}>x{count}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.claimBtn} onPress={() => claimReward(prize)}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.claimBtnText}>Claim</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={styles.historyTitle}>Recent Rolls</Text>
              <TouchableOpacity onPress={() => setHistory([])} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ef4444' }}>
                <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {history.map((h, i) => (
              <View key={`${h.time}-${i}`} style={styles.historyRow}>
                <View style={styles.historyFace}>
                  <Text style={styles.historyFaceText}>{h.face}</Text>
                </View>
                <Text style={styles.historyPrize} numberOfLines={1}>{h.prize}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Prize manager modal */}
      <PrizeManagerModal
        visible={showManager}
        pools={pools}
        onSave={savePrizes}
        onClose={() => setShowManager(false)}
      />

      {/* Any Prize Picker Modal */}
      <Modal visible={!!showAnyPicker} animationType="slide">
        <ModalScreen style={styles.managerScreen}>
          <View style={styles.managerHeader}>
             <TouchableOpacity onPress={() => setShowAnyPicker(null)} style={styles.iconBtn}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
             <Text style={styles.managerTitle}>Pick a Prize</Text>
             <View style={{ width: 38 }} />
          </View>
          <ScrollView contentContainerStyle={styles.managerBody}>
             <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>Choose a prize from your global pools to claim immediately.</Text>
             {(showAnyPicker && showAnyPicker.type === 'small' ? ['small'] : ['master', 'small', 'big']).map(category => (
               <View key={category} style={{ marginBottom: 20 }}>
                 <Text style={{ fontSize: 16, fontWeight: '700', textTransform: 'capitalize', color: colors.primary, marginBottom: 8 }}>{category} Prizes</Text>
                 {(pools[category] || []).map((p, idx) => (
                   <TouchableOpacity key={idx} style={styles.prizeRow} onPress={() => claimAnyPrize(p)}>
                     <Text style={styles.prizeText}>{p}</Text>
                     <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                   </TouchableOpacity>
                 ))}
               </View>
             ))}
          </ScrollView>
        </ModalScreen>
      </Modal>

      {/* Swap UI Modal */}
      <Modal visible={!!showSwapUI} animationType="slide">
        <ModalScreen style={styles.managerScreen}>
          <View style={styles.managerHeader}>
             <TouchableOpacity onPress={() => setShowSwapUI(null)} style={styles.iconBtn}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
             <Text style={styles.managerTitle}>Swap Board Item</Text>
             <View style={{ width: 38 }} />
          </View>
          <ScrollView contentContainerStyle={styles.managerBody}>
             <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>You rolled Face 18! Review the board below, then choose an item from your pools to securely swap into its place.</Text>
             
             <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Reference Board</Text>
                {renderGridBoard(true)}
             </View>

             {['master', 'small', 'big'].map(category => (
               <View key={category} style={{ marginBottom: 20 }}>
                 <Text style={{ fontSize: 16, fontWeight: '700', textTransform: 'capitalize', color: colors.primary, marginBottom: 8 }}>{category} Prizes</Text>
                 {(pools[category] || []).map((p, idx) => {
                   const isAlreadyOnBoard = dailyBoard && Object.values(dailyBoard.map).includes(p);
                   if (isAlreadyOnBoard) return null;
                   return (
                     <TouchableOpacity key={idx} style={styles.prizeRow} onPress={() => {
                        Alert.prompt(
                          'Swap with Face Number',
                          `Enter the Face Number (2-17) to replace with "${p}"`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Swap', onPress: (faceStr) => {
                               const face = parseInt(faceStr);
                               if (face >= 2 && face <= 17) executeSwap(face, p);
                               else Alert.alert('Invalid Face', 'Must be between 2 and 17');
                            }}
                          ],
                          'plain-text',
                          '',
                          'number-pad'
                        );
                     }}>
                       <Text style={styles.prizeText}>{p}</Text>
                       <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                     </TouchableOpacity>
                   );
                 })}
               </View>
             ))}
          </ScrollView>
        </ModalScreen>
      </Modal>

      {/* Reward Picker Modal (for linking break) */}
      <Modal visible={showPrizeLinker} animationType="slide">
        <ModalScreen style={styles.managerScreen}>
          <View style={styles.managerHeader}>
             <TouchableOpacity onPress={() => setShowPrizeLinker(false)} style={styles.iconBtn}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
             <Text style={styles.managerTitle}>Link Reward to Timer</Text>
             {(breakTimer?.linkedPrize || pendingPrize) ? (
               <TouchableOpacity onPress={() => { 
                 if (breakTimer) linkPrizeToBreak(null); 
                 else setPendingPrize(null);
                 setModalSelection(null);
                 setShowPrizeLinker(false); 
               }} style={styles.iconBtn}>
                 <Ionicons name="trash-outline" size={20} color="#ef4444" />
               </TouchableOpacity>
             ) : <View style={{ width: 38 }} />}
          </View>
          <ScrollView contentContainerStyle={styles.managerBody}>
             <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>Which reward are you tracking for this break?</Text>
             
             {poolEntries.length === 0 ? (
               <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                 <Ionicons name="gift-outline" size={48} color="#d1d5db" />
                 <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: 12 }}>No unclaimed rewards found.</Text>
               </View>
              ) : (
                poolEntries.map(([prize, count]) => {
                  const isSelected = modalSelection?.name === prize;
                  return (
                    <TouchableOpacity 
                      key={prize} 
                      style={[styles.prizeRow, isSelected && { backgroundColor: colors.primary + '08', borderColor: colors.primary }]} 
                      onPress={() => {
                        setModalSelection({ name: prize, count: 1 });
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.prizeText, isSelected && { fontWeight: '700', color: colors.primary }]}>{prize}</Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>{count} available</Text>
                      </View>
                      
                      {isSelected ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity 
                            onPress={() => {
                              if (modalSelection.count <= 1) {
                                setModalSelection(null);
                              } else {
                                setModalSelection(prev => ({ ...prev, count: prev.count - 1 }));
                              }
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="remove-circle-outline" size={24} color={colors.primary} />
                          </TouchableOpacity>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, minWidth: 20, textAlign: 'center' }}>
                            {modalSelection.count}
                          </Text>
                          <TouchableOpacity 
                            onPress={() => setModalSelection(prev => ({ ...prev, count: Math.min(count, prev.count + 1) }))}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="add-circle" size={24} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color="#d1d5db" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
          </ScrollView>

          {modalSelection && (
            <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
              <TouchableOpacity 
                style={[styles.rollAgainBtn, { marginTop: 0 }]} 
                onPress={() => {
                  if (breakTimer) {
                    linkPrizeToBreak(modalSelection);
                  } else {
                    setPendingPrize(modalSelection);
                  }
                  setShowPrizeLinker(false);
                }}
              >
                <Ionicons name="link-outline" size={18} color="#fff" />
                <Text style={styles.rollAgainText}>
                  Link {modalSelection.count > 1 ? `${modalSelection.count}x ` : ''}Selection
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ModalScreen>
      </Modal>

      {/* Efficiency Roll Modal */}
      <EfficiencyRollModal
        visible={showEfficiencyRoll}
        freeRolls={economy.freeRolls}
        onClose={() => setShowEfficiencyRoll(false)}
        onFinish={(payout) => {
          bulkConsumeFreeRolls();
          addReward(payout.points, payout.xp);
          setShowEfficiencyRoll(false);
          // Show a quick alert with results
          Alert.alert('Consolidated Rewards!', `You banked ${payout.points} Points and ${payout.xp} XP!`);
        }}
        colors={colors}
      />

      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6366f1',
  },
  manageBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  headerBadgeText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  
  costBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  costText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  bankText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Game Area
  gameArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  ambientGlow: {
    position: 'absolute',
    width: Platform.OS === 'web' ? Math.min(SCREEN_W * 0.6, 200) : SCREEN_W * 0.6,
    height: Platform.OS === 'web' ? Math.min(SCREEN_W * 0.6, 200) : SCREEN_W * 0.6,
    borderRadius: Platform.OS === 'web' ? Math.min(SCREEN_W * 0.3, 100) : SCREEN_W * 0.3,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },
  diceNumberWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diceNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tapHintRow: {
    alignItems: 'center',
    paddingVertical: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  tapHint: {
    color: colors.textMuted,
    fontSize: 14,
  },

  // Result card
  resultCard: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  resultFaceBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultFaceText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  resultPrize: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  rollAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  rollAgainText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.textMuted,
  },
  addPrizesEmptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  addPrizesEmptyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // History
  historySection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  historyTitle: { marginBottom: 0,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyFace: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyFaceText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  historyPrize: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
  },

  // Manager modal
  managerScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  managerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  managerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  savePrizesBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  savePrizesText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  managerBody: {
    padding: 20,
    paddingBottom: 60,
    gap: 12,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  quickBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },

  // Bulk import
  bulkArea: {
    gap: 8,
  },
  bulkHint: {
    fontSize: 13,
    color: colors.textMuted,
  },
  bulkInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    height: 140,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  bulkImportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  bulkImportText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Add single prize
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  addPrizeBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Prize list
  prizeCount: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  prizeWarning: {
    fontSize: 12,
    color: colors.amber,
  },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prizeNumber: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  prizeNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  prizeText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  prizeRemove: {
    padding: 4,
  },

  // Reward Pool
  cancelBreakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#fee2e2',
    marginTop: 12,
  },
  cancelBreakText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 1,
  },
  poolSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fafbff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
  },
  poolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  poolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poolTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  poolBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  poolBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  poolHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  poolPrizeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poolPrize: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
    flexShrink: 1,
  },
  poolCountBadge: {
    backgroundColor: colors.primary + '18',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  poolCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  claimBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  breakSection: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  breakTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  breakClock: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },
  breakClockInner: {
    width: '100%',
    paddingHorizontal: 25, // HEAVY padding to force text into the center safe-zone
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedPrizeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  linkedPrizeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    alignSelf: 'center',
    marginBottom: 6,
    width: '100%',
    maxHeight: 52, 
  },
  clockTime: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  clockSub: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  timerAdjustRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  smallAdjustBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  adjustBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  breakRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  breakOpt: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  breakOptActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  breakOptText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  breakOptTextActive: {
    color: '#fff',
  },
  linkPrizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  linkPrizeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },

});

