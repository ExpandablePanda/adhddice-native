import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, FlatList, Animated, Easing, Alert,
  ScrollView, KeyboardAvoidingView, Platform,
  Dimensions, useWindowDimensions,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { colors } from '../theme';
import { useEconomy } from '../lib/EconomyContext';
import { useTheme } from '../lib/ThemeContext';
import { useProfile } from '../lib/ProfileContext';
import { supabase } from '../lib/supabase';
import { useTasks, getAppDayKey } from '../lib/TasksContext';
import { useSettings } from '../lib/SettingsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScrollToTop from '../components/ScrollToTop';
import ModalScreen from '../components/ModalScreen';
import Dice3D from '../components/Dice3D';



const DEFAULT_POOLS = {
  master: [
    'Bank a free roll', 'Bank 2 free rolls', 'Bank 3 free rolls', 
    'If Next Roll is Over 17 - Bank 5 rolls', 'If Next Roll is Over 17 - 10 Tokens', 
    'Choose Any Small Prize', 'Choose Any Big Prize',
    '1 Token', '2 Tokens', '3 Tokens', '4 Tokens', '5 Tokens'
  ],
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

  const chosenMaster = getS(master, 4);
  const chosenSmall = getS(small, 6);
  const chosenBig = getS(big, 6);

  return {
     1: "No Prize",
     2: chosenMaster[0],
     3: chosenMaster[1],
     4: chosenMaster[2],
     5: chosenMaster[3],
     6: chosenSmall[0],
     7: chosenSmall[1],
     8: chosenSmall[2],
     9: chosenSmall[3],
     10: chosenSmall[4],
     11: chosenSmall[5],
     12: chosenBig[0],
     13: chosenBig[1],
     14: chosenBig[2],
     15: chosenBig[3],
     16: chosenBig[4],
     17: chosenBig[5],
     18: "[Swap] Replace a prize with an unselected prize",
     19: "[Multiplier] Double Next Prize!",
     20: "Any Prize! Choose anything from the global pool",
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// PRIZE MANAGER MODAL
// ═════════════════════════════════════════════════════════════════════════════

function PrizeManagerModal({ visible, pools, onSave, onClose, onDevWipe }) {
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
    setDraft(d => ({ ...d, [activeTab]: [...(d[activeTab]||[]), trimmed] }));
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
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
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
              style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderColor: activeTab === t ? '#6d28d9' : 'transparent' }}
              onPress={() => { setActiveTab(t); setBulkMode(false); }}
            >
              <Text style={{ fontWeight: '600', color: activeTab === t ? '#6d28d9' : colors.textMuted, textTransform: 'capitalize' }}>{t}</Text>
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
                <Ionicons name="list-outline" size={16} color="#6d28d9" />
                <Text style={styles.quickBtnText}>Bulk Import</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={resetDefaults}>
                <Ionicons name="refresh-outline" size={16} color="#6d28d9" />
                <Text style={styles.quickBtnText}>Defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { borderColor: '#ef4444' }]} onPress={clearTab}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={[styles.quickBtnText, { color: '#ef4444' }]}>Clear List</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, { borderColor: '#6d28d9' }]} onPress={onDevWipe}>
                <Ionicons name="flash-outline" size={16} color="#6d28d9" />
                <Text style={[styles.quickBtnText, { color: '#6d28d9' }]}>Dev Wipe & 100 Rolls</Text>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VAULT MODAL
// ═════════════════════════════════════════════════════════════════════════════

function VaultModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { 
    economy, addVaultPrize, editVaultPrize, deleteVaultPrize, 
    claimVaultPrize, spendPoints, contributeTokensToPrize,
    getRollCost, getReshuffleCost, getPrizeEditCost
  } = useEconomy();
  const { tasks } = useTasks();
  const [newTitle, setNewTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPrizeId, setEditingPrizeId] = useState(null);
  const [newTokenCost, setNewTokenCost] = useState('0');
  const [payPrize, setPayPrize] = useState(null);
  const [payInput, setPayInput] = useState('');

  const vault = economy.vaultPrizes || [];

  function renderPrizeCard(prize) {
    const prizeTaskIds = prize.linkedTaskIds || [];
    const completedCount = (prize.completedTaskIds || []).length;
    const totalCount = prizeTaskIds.length;
    const isUnlocked = prize.status === 'unlocked';
    const remaining = (prize.tokenCost || 0) - (prize.tokensPaid || 0);
    const canClaim = remaining <= 0;

    const prizeTasks = prizeTaskIds.map(id => {
      const found = tasks.find(t => String(t.id) === String(id));
      return found || { id, title: 'Unknown Task', status: 'unknown' };
    });

    const isReadyToClaim = isUnlocked && canClaim;
    const isTokenStore = prizeTaskIds.length === 0;

    return (
      <View key={prize.id} style={{ 
        backgroundColor: isReadyToClaim ? '#f0fdf4' : (isTokenStore ? '#eef2ff' : colors.surface),
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1.5,
        borderColor: isReadyToClaim ? '#059669' : (isTokenStore ? '#6d28d9' : colors.border),
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ 
            width: 44, height: 44, borderRadius: 22, 
            backgroundColor: isReadyToClaim ? '#059669' : (isTokenStore ? '#6d28d9' : '#f3f4f6'), 
            alignItems: 'center', justifyContent: 'center', marginRight: 16
          }}>
            <Ionicons name={isReadyToClaim ? "gift" : (isTokenStore ? "wallet" : "lock-closed")} size={22} color={isReadyToClaim || isTokenStore ? "#fff" : "#6b7280"} />
          </View>
          
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>{prize.title}</Text>
            {prizeTaskIds.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="link-outline" size={14} color={isUnlocked ? "#059669" : colors.textMuted} />
                <Text style={{ fontSize: 13, color: isUnlocked ? "#059669" : colors.textMuted, fontWeight: '500' }}>
                  {isUnlocked ? 'Task Goal Met' : `${completedCount}/${totalCount} Tasks`}
                </Text>
              </View>
            )}
            {(prize.tokenCost || 0) > 0 && (
              <View style={{ marginTop: 8, marginRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="wallet" size={10} color="#6d28d9" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6d28d9' }}>
                      {remaining > 0 ? `${remaining} Left` : 'Paid'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 9, color: colors.textMuted }}>{Math.round(((prize.tokensPaid || 0) / (prize.tokenCost || 1)) * 100)}%</Text>
                </View>
                <View style={{ height: 4, width: '100%', backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.min(100, ((prize.tokensPaid || 0) / (prize.tokenCost || 1)) * 100)}%`, backgroundColor: '#6d28d9' }} />
                </View>
              </View>
            )}
          </View>
          
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            {isUnlocked && canClaim ? (
              <TouchableOpacity 
                onPress={() => {
                  Alert.alert('Claim Reward', `Claim your "${prize.title}" reward now?`, [
                    { text: 'Not yet', style: 'cancel' },
                    { text: 'Claim!', onPress: () => claimVaultPrize(prize.id) }
                  ]);
                }}
                style={{ backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Claim</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {remaining > 0 && (
                  <TouchableOpacity 
                    onPress={() => {
                      if (economy.tokens <= 0) {
                        Alert.alert('No Tokens', "You don't have any tokens to contribute yet!");
                        return;
                      }
                      setPayPrize(prize);
                      setPayInput(String(Math.min(economy.tokens, remaining)));
                    }}
                    style={{ backgroundColor: '#6d28d9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Pay</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity 
                    onPress={() => startEditing(prize)} 
                    style={{ padding: 10 }}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  >
                    <Ionicons name="pencil" size={20} color="#6d28d9" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm('Delete this prize from the vault?')) deleteVaultPrize(prize.id);
                      } else {
                        Alert.alert('Delete Prize', 'Remove this prize from the vault?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteVaultPrize(prize.id) }
                        ]);
                      }
                    }} 
                    style={{ padding: 10 }}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {!isUnlocked && prizeTasks.length > 0 && (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            {prizeTasks.map(t => {
              const isFinished = (prize.completedTaskIds || []).includes(String(t.id));
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name={isFinished ? "checkmark-circle" : "ellipse-outline"} size={14} color={isFinished ? "#10b981" : colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 12, color: isFinished ? "#10b981" : colors.textSecondary, textDecorationLine: isFinished ? 'line-through' : 'none' }}>
                    {t.title}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  const linkableTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'did_my_best');
  
  const filteredTasks = searchQuery.trim() 
    ? linkableTasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : linkableTasks;

  function toggleTask(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (!newTitle.trim()) {
      Alert.alert('Missing Title', 'What is the reward?');
      return;
    }
    if (selectedIds.size === 0 && Number(newTokenCost) <= 0) {
      Alert.alert('Missing Cost', 'A prize must either be linked to tasks OR have a token cost.');
      return;
    }

    if (editingPrizeId) {
      editVaultPrize(editingPrizeId, newTitle.trim(), Array.from(selectedIds), Number(newTokenCost));
    } else {
      addVaultPrize(newTitle.trim(), Array.from(selectedIds), Number(newTokenCost));
    }

    setNewTitle('');
    setSelectedIds(new Set());
    setNewTokenCost('0');
    setSearchQuery('');
    setEditingPrizeId(null);
    setShowAddForm(false);
  }

  function startEditing(prize) {
    const editCost = getPrizeEditCost();
    Alert.alert(
      'Unlock Edit Mode',
      `Spend ${editCost} Points to change this locked reward and its tasks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: `Spend ${editCost} Pts`, 
          onPress: () => {
            if (spendPoints(editCost)) {
              setEditingPrizeId(prize.id);
              setNewTitle(prize.title);
              setSelectedIds(new Set(prize.linkedTaskIds || []));
              setNewTokenCost(String(prize.tokenCost || 0));
              setShowAddForm(true);
            }
          } 
        }
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
      <View style={[styles.managerScreen, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.managerHeader}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.managerTitle}>Prize Vault</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="wallet" size={12} color="#6d28d9" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6d28d9' }}>{economy.tokens || 0} Tokens</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => {
            if (showAddForm) {
              setEditingPrizeId(null);
              setNewTitle('');
              setSelectedIds(new Set());
            }
            setShowAddForm(!showAddForm);
          }} style={styles.savePrizesBtn}>
            <Text style={styles.savePrizesText}>{showAddForm ? 'Cancel' : 'Add Prize'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.managerBody, { paddingBottom: 40 }]}>
          {showAddForm && (
            <View style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontWeight: '800', color: colors.textPrimary, fontSize: 16 }}>
                  {editingPrizeId ? 'Edit Locked Reward' : 'Create a Locked Reward'}
                </Text>
                {editingPrizeId && (
                  <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#b45309' }}>EDITING ({getPrizeEditCost()} Pts Spent)</Text>
                  </View>
                )}
              </View>
              
              <Text style={{ fontWeight: '600', color: colors.textSecondary, fontSize: 13, marginBottom: 6, textTransform: 'uppercase' }}>Reward Name</Text>
              <TextInput
                style={[styles.addInput, { marginBottom: 12, width: '100%', height: 50, fontSize: 16 }]}
                placeholder="e.g. $20 Magic Cards"
                placeholderTextColor={colors.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={{ fontWeight: '600', color: colors.textSecondary, fontSize: 13, marginBottom: 6, textTransform: 'uppercase' }}>Token Cost</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12 }}>
                  <Ionicons name="wallet" size={18} color="#6d28d9" />
                  <TextInput
                    style={{ flex: 1, height: 50, paddingHorizontal: 8, color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}
                    keyboardType="numeric"
                    value={newTokenCost}
                    onChangeText={setNewTokenCost}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Tokens required to claim. Set > 0 to skip linking tasks if you prefer.</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600', color: colors.textSecondary, fontSize: 13, textTransform: 'uppercase' }}>Link to Tasks ({selectedIds.size})</Text>
                {selectedIds.size > 0 && (
                  <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
                    <Text style={{ fontSize: 12, color: '#6d28d9', fontWeight: '700' }}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, marginBottom: 10 }}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={{ flex: 1, height: 40, paddingHorizontal: 8, color: colors.textPrimary, fontSize: 14 }}
                  placeholder="Search tasks..."
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {linkableTasks.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20, fontStyle: 'italic' }}>No active tasks. You can still set a Token Cost above!</Text>
              ) : (
                <View style={{ marginBottom: 20, maxHeight: 250, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}>
                  <ScrollView nestedScrollEnabled style={{ backgroundColor: '#f9fafb' }}>
                    {filteredTasks.length === 0 ? (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>No tasks match your search.</Text>
                      </View>
                    ) : (
                      filteredTasks.map(t => {
                        const isSelected = selectedIds.has(t.id);
                        return (
                          <TouchableOpacity 
                            key={t.id} 
                            onPress={() => toggleTask(t.id)}
                            style={{ 
                              padding: 14, 
                              borderBottomWidth: 1, 
                              borderBottomColor: colors.border,
                              backgroundColor: isSelected ? colors.primary + '15' : 'transparent',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <Text style={{ color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? '700' : '500', flex: 1 }}>
                              {t.title}
                            </Text>
                            <Ionicons 
                              name={isSelected ? "checkbox" : "square-outline"} 
                              size={20} 
                              color={isSelected ? colors.primary : colors.textMuted} 
                            />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity 
                style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                onPress={handleSave}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  {editingPrizeId ? 'Update Locked Reward' : 'Lock Reward in Vault'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {vault.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 60, opacity: 0.6 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="lock-closed" size={40} color={colors.textMuted} />
              </View>
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 18 }}>The Vault is Empty</Text>
              <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 }}>
                Give yourself a major incentive for that one task you've been putting off.
              </Text>
            </View>
          ) : (
            <View>
              {vault.filter(p => (p.linkedTaskIds || []).length === 0).length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginBottom: 12 }]}>Token Store</Text>
                  {vault.filter(p => (p.linkedTaskIds || []).length === 0).map(prize => renderPrizeCard(prize))}
                </>
              )}

              {vault.filter(p => (p.linkedTaskIds || []).length > 0).length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 24, marginBottom: 12 }]}>Your Vault</Text>
                  {vault.filter(p => (p.linkedTaskIds || []).length > 0).map(prize => renderPrizeCard(prize))}
                </>
              )}
            </View>
          )}
        </ScrollView>

        <Modal visible={!!payPrize} transparent animationType="fade" onRequestClose={() => setPayPrize(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 }}>Contribute Tokens</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>{payPrize?.title}</Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                <View>
                  <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>Balance</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="wallet" size={14} color="#8b5cf6" />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#8b5cf6' }}>{economy.tokens}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>Goal Remaining</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="wallet" size={14} color={colors.textPrimary} />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
                      {(payPrize?.tokenCost || 0) - (payPrize?.tokensPaid || 0)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <TextInput
                  style={{ flex: 1, height: 50, paddingHorizontal: 16, fontSize: 24, fontWeight: '800', color: '#8b5cf6', textAlign: 'center' }}
                  keyboardType="numeric"
                  autoFocus
                  value={payInput}
                  onChangeText={setPayInput}
                  placeholder="0"
                />
                <TouchableOpacity 
                  onPress={() => setPayInput(String(economy.tokens))}
                  style={{ backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 4 }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>MAX</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center' }}
                  onPress={() => setPayPrize(null)}
                >
                  <Text style={{ fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#8b5cf6', alignItems: 'center' }}
                  onPress={() => {
                    const amt = parseInt(payInput, 10);
                    if (isNaN(amt) || amt <= 0) return;
                    contributeTokensToPrize(payPrize.id, amt);
                    setPayPrize(null);
                  }}
                >
                  <Text style={{ fontWeight: '800', color: '#fff' }}>Confirm Payment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN - Force Metro Refresh
// ═════════════════════════════════════════════════════════════════════════════

export default function DiceScreen({ navigation, route }) {
  const { width: windowWidth } = useWindowDimensions();
  const { dayStartTime } = useSettings();
  const { economy, spendPoints, addFreeRoll, addTokens, getRollCost, getReshuffleCost, getPrizeEditCost } = useEconomy();
  const { user, storagePrefix } = useProfile();
  const isFocused = useIsFocused();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleVisibility = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const [pools, setPools]           = useState(DEFAULT_POOLS);
  const [dailyBoard, setDailyBoard] = useState(null); // the generated faceMap
  const [multiplier, setMultiplier] = useState(1);
  const [bank5IfOver17, setBank5IfOver17] = useState(0);
  const [tokensIfOver17, setTokensIfOver17] = useState(0);
  const [rolling, setRolling]       = useState(false);
  const [result, setResult]         = useState(null); // { face, prize }
  const [showManager, setShowManager] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const { startBreak, breakTimer, setBreakTimer, adjustBreakTime, linkPrizeToBreak } = useTasks();
  const [breakInput, setBreakInput] = useState('10');
  const [showPrizeLinker, setShowPrizeLinker] = useState(false);
  const [pendingPrize, setPendingPrize] = useState(null); // { name, count }
  const [modalSelection, setModalSelection] = useState(null); // { name, count }
  const [showInflationInfo, setShowInflationInfo] = useState(false);

  useEffect(() => {
    if (route.params?.openVault) {
      setShowVault(true);
      navigation.setParams({ openVault: undefined });
    }
  }, [route.params?.openVault]);

  
  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));
  const alarmPlayer = useAudioPlayer(require('../../assets/calm-alarm.wav'));
  const broadcastRef = useRef(null);
  const lastLocalChangeRef = useRef(0);
  const isRemoteUpdateRef = useRef(false);

  useEffect(() => {

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
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, [user?.id, storagePrefix]);

  function playAlarmSound() {
    try {
      alarmPlayer.seekTo(0);
      alarmPlayer.play();
    } catch (e) {}
  }

  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
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
  const [showRealRollModal, setShowRealRollModal] = useState(false);
  const [manualFace, setManualFace] = useState('');
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
          if (data.tokensIfOver17) setTokensIfOver17(data.tokensIfOver17);
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
            if (cloud.rewardPool) {
              // Migration: convert legacy { name: count } to { name: { count, lastWon } }
              const pool = cloud.rewardPool;
              const converted = {};
              Object.keys(pool).forEach(key => {
                if (typeof pool[key] === 'number') {
                  converted[key] = { count: pool[key], lastWon: Date.now() };
                } else {
                  converted[key] = pool[key];
                }
              });
              setRewardPool(converted);
            }
            if (cloud.dailyBoard) boardData = cloud.dailyBoard;
            if (cloud.multiplier) setMultiplier(cloud.multiplier);
            if (cloud.bank5IfOver17) setBank5IfOver17(cloud.bank5IfOver17);
            if (cloud.tokensIfOver17) setTokensIfOver17(cloud.tokensIfOver17);
          }
        } catch (e) { console.log('Dice cloud sync skipped', e); }
      }
      // Migration: Ensure Tokens and Choice prizes are in the Master pool for existing users
      if (currentPools && currentPools.master) {
        const requiredMaster = [
          '1 Token', '2 Tokens', '3 Tokens', '4 Tokens', '5 Tokens', 
          'Choose Any Small Prize', 'Choose Any Big Prize',
          'If Next Roll is Over 17 - Bank 5 rolls', 'If Next Roll is Over 17 - 10 Tokens'
        ];
        let missing = requiredMaster.filter(t => !currentPools.master.includes(t));
        if (missing.length > 0) {
          currentPools = {
            ...currentPools,
            master: [...currentPools.master, ...missing]
          };
        }
      }

      if (currentPools) setPools(currentPools);
      
      const today = new Date().toDateString();
      const BOARD_VERSION = 2; // Incremented for 2-5 Master prizes
      if (!boardData || boardData.date !== today || boardData.v !== BOARD_VERSION) {
        boardData = { date: today, map: generateDailyPool(currentPools), v: BOARD_VERSION };
      }
      setDailyBoard(boardData);
      setLoaded(true);
    }
    loadDice();
  }, [storagePrefix, user]);

  // Realtime subscription for cross-device dice sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rt:user_dice:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_dice', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new?.data) {
            const remoteTime = new Date(payload.new.updated_at).getTime();
            if (remoteTime > lastLocalChangeRef.current + 1000) {
              isRemoteUpdateRef.current = true;
              const cloud = payload.new.data;
              if (cloud.pools) setPools(cloud.pools);
              if (cloud.history) setHistory(cloud.history);
              if (cloud.rewardPool) setRewardPool(cloud.rewardPool);
              if (cloud.dailyBoard) setDailyBoard(cloud.dailyBoard);
              if (cloud.multiplier !== undefined) setMultiplier(cloud.multiplier);
              if (cloud.bank5IfOver17 !== undefined) setBank5IfOver17(cloud.bank5IfOver17);
              if (cloud.tokensIfOver17 !== undefined) setTokensIfOver17(cloud.tokensIfOver17);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

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
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    lastLocalChangeRef.current = Date.now();

    const localKey = `${storagePrefix}dice_data`;
    const data = { pools, history, rewardPool, dailyBoard, multiplier, bank5IfOver17, tokensIfOver17 };
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
      else if (basePrize.includes('If Next Roll is Over 17 - 10 Tokens')) setTokensIfOver17(c => c + count);
      else if (basePrize.includes('Choose Any Small Prize')) setShowAnyPicker({ type: 'small', count });
      else if (basePrize.includes('Choose Any Big Prize')) setShowAnyPicker({ type: 'big', count });
      else if (basePrize.includes('Token')) {
         const amt = parseInt(basePrize);
         if (!isNaN(amt)) addTokens(amt * count);
      }
      else {
         setRewardPool(pool => {
            const current = pool[finalPrize];
            // Handle both new {count, lastWon} structure and legacy numeric values
            const countVal = typeof current === 'object' ? current.count : (current || 0);
            return {
               ...pool,
               [finalPrize]: {
                  count: countVal + count,
                  lastWon: Date.now()
               }
            };
         });
      }
      
      setHistory(h => [{ face: logFace, prize: finalPrize, time: Date.now() }, ...h].slice(0, 20));
  }
  
  // Daily 8 AM Reshuffle Prompt logic
  const hasPromptedRef = useRef(false);
  useEffect(() => {
    if (!loaded || !dailyBoard || hasPromptedRef.current) return;
    
    async function checkDailyPrompt() {
      const now = new Date();
      if (now.getHours() < dayStartTime) return; // Rollover hasn't happened yet
      
      const todayKey = getAppDayKey(dayStartTime);
      const promptKey = `${storagePrefix}last_daily_reshuffle_prompt`;
      
      // If the day has changed since our last prompt, reset the ref
      const lastPrompt = await AsyncStorage.getItem(promptKey);
      if (lastPrompt !== todayKey) {
        hasPromptedRef.current = false;
      }
      if (hasPromptedRef.current) return;

      // If the board is ALREADY from today, we don't need to prompt
      if (dailyBoard.date === todayKey) return;
        
        Alert.alert(
          'Daily Board Refresh 🎲',
          `It is past ${dayStartTime}:00 AM and your rewards board is from yesterday! Would you like to perform a free manual reshuffle for the new day?`,
          [
            { text: 'Maybe Later', style: 'cancel' },
            { 
              text: 'Reshuffle Now', 
              onPress: () => {
                const todayKey = getAppDayKey(dayStartTime);
                const newBoard = { date: todayKey, map: generateDailyPool(pools) };
                setDailyBoard(newBoard);
                AsyncStorage.setItem(promptKey, todayKey);
                Alert.alert('Success!', 'Board has been reshuffled for free.');
              }
            }
          ]
        );
      }
      checkDailyPrompt();
  }, [loaded, dailyBoard?.date, storagePrefix, pools]);

  const submitRollResult = (face) => {
    let basePrize = dailyBoard.map[face] || 'Fallback Prize';
    let currentMultiplier = multiplier;

    // HANDLE RESULT ROLLS (Jackpot Mechanics)
    const isResultRoll = bank5IfOver17 > 0 || tokensIfOver17 > 0;
    if (isResultRoll) {
       let winTitle = "";
       let won = false;
       if (face > 18) {
           won = true;
           if (bank5IfOver17 > 0) {
              const rolls = 5 * bank5IfOver17;
              addFreeRoll(rolls);
              winTitle = `🎯 Jackpot Roll! +${rolls} Free Rolls!`;
           }
           if (tokensIfOver17 > 0) {
              const tks = 10 * tokensIfOver17;
              addTokens(tks);
              winTitle = winTitle ? `${winTitle} & +${tks} Tokens!` : `🎯 Jackpot Roll! +${tks} Tokens!`;
           }
        } else if (face === 18) {
           // Roll 18 should be swap prize even on jackpot rolls
           winTitle = "[Swap] Replace a prize!";
           won = true;
        } else {
           winTitle = "No reward this time. 💀";
        }
       
       setBank5IfOver17(0);
       setTokensIfOver17(0);
       setResult({ face, prize: winTitle, isJackpot: true });
       setHistory(h => [{ face, prize: winTitle, time: Date.now() }, ...h].slice(0, 20));
       
       if (currentMultiplier > 1) setMultiplier(1);
       if (face === 18) {
           setShowSwapUI(currentMultiplier);
        }
        return; // Exit early: Result rolls don't grant the face prize
    }

    let displayPrize = basePrize;
    let triggeredBank5 = 0;
    if (basePrize.includes('Bank a free roll')) triggeredBank5 = 1 * currentMultiplier;
    else if (basePrize.includes('Bank 2 free rolls')) triggeredBank5 = 2 * currentMultiplier;
    else if (basePrize.includes('Bank 3 free rolls')) triggeredBank5 = 3 * currentMultiplier;

    let resultText = displayPrize;
    if (triggeredBank5 > 0) resultText += ` 🎯(+${triggeredBank5} Free Rolls!)`;
    setResult({ face, prize: resultText });

    if (face === 18) {
       setShowSwapUI(currentMultiplier); 
    } else if (face === 20) {
       setShowAnyPicker({ type: 'all', count: currentMultiplier });
    } else if (face === 19) {
       setHistory(h => [{ face, prize: resultText, time: Date.now() }, ...h].slice(0, 20));
       setMultiplier(m => (m === 1 ? 2 : m + 2));
    } else if (face !== 1) {
       grantPrizeMechanics(basePrize, currentMultiplier, face);
    }

    if (face !== 19 && face !== 18 && face !== 20 && face !== 1 && currentMultiplier > 1) {
       setMultiplier(1);
    }
  };

  function startRealRoll() {
    if (rolling || !dailyBoard || !dailyBoard.map) return;
    setManualFace('');
    setShowRealRollModal(true);
  }

  function submitManualRoll() {
    if (rolling) return;
    const val = parseInt(manualFace, 10);
    if (isNaN(val) || val < 1 || val > 20) {
      Alert.alert('Invalid Roll', 'Please enter a number between 1 and 20.');
      return;
    }

    setRolling(true);

    // Deduct points/rolls ONLY if not a bonus multiplier roll
    if (multiplier === 1) {
      const isResultRoll = bank5IfOver17 > 0 || tokensIfOver17 > 0;
      const rollCost = getRollCost();
      if (!isResultRoll && !spendPoints(rollCost)) {
        setRolling(false);
        Alert.alert('Not enough Points', `You need ${rollCost} Points or a Free Roll to roll for rewards.`);
        setShowRealRollModal(false);
        return;
      }
    }

    setResult(null);
    resultFade.setValue(0);
    setShowRealRollModal(false);

    // Trigger a quick pulse/glow on the digital dice to show "something happened"
    Animated.sequence([
      Animated.spring(bounce, { toValue: 1.15, friction: 3, tension: 200, useNativeDriver: true }),
      Animated.spring(bounce, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      submitRollResult(val);
      setRolling(false);
      Animated.spring(resultFade, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    });
  }

  function rollDice() {
    if (rolling || !dailyBoard || !dailyBoard.map) return;

    setRolling(true);

    if (multiplier === 1) {
      const isResultRoll = bank5IfOver17 > 0 || tokensIfOver17 > 0;
      if (!isResultRoll && !spendPoints(getRollCost())) {
        setRolling(false);
        Alert.alert('Not enough Points', `You need ${getRollCost()} Points or a Free Roll to roll for rewards.`);
        return;
      }
    }

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

  const vault = economy.vaultPrizes || [];
  const unlockedCount = vault.filter(p => p.status === 'unlocked').length;

  function claimReward(prize, count = 1) {
    setRewardPool(pool => {
      const current = pool[prize];
      if (!current) return pool;
      
      const newPool = { ...pool };
      const currentCount = typeof current === 'object' ? current.count : current;
      const lastWon = typeof current === 'object' ? current.lastWon : Date.now();

      if (currentCount > count) {
        newPool[prize] = { count: currentCount - count, lastWon };
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
    
    grantPrizeMechanics(prize, count, 20);
    setMultiplier(1);
    setShowAnyPicker(null);
    setResult(null); // Clear congrats card so it can't be reused
  }

  function executeSwap(targetFace, newPrize) {
    if (!showSwapUI) return;
    const count = showSwapUI || 1;
    
    setDailyBoard(b => ({ ...b, map: { ...b.map, [targetFace]: newPrize } }));
    
    let finalPrize = newPrize;
    if (count > 1) finalPrize = `[x${count}] ${newPrize}`;
    
    grantPrizeMechanics(newPrize, count, 18);
    setMultiplier(1);
    setShowSwapUI(null);
    setResult(null); // Clear congrats card so it can't be reused
  }

  const poolEntries = Object.entries(rewardPool)
    .filter(([, val]) => {
      const count = typeof val === 'object' ? val.count : val;
      return typeof count === 'number' && !isNaN(count) && count > 0;
    })
    .sort((a, b) => {
      const aData = a[1];
      const bData = b[1];
      
      const aTime = typeof aData === 'object' ? aData.lastWon : 0;
      const bTime = typeof bData === 'object' ? bData.lastWon : 0;

      // Sort by most recent win on top
      return bTime - aTime;
    });
    const totalUnclaimed = poolEntries.reduce((acc, [, val]) => acc + (typeof val === 'object' ? val.count : val), 0);

  function handleManualShuffle() {
    const shuffleCost = getReshuffleCost();
    const msg = `Would you like to manually randomize the entire custom D20 Board? This costs ${shuffleCost} Points.`;
    
    const performShuffle = () => {
      const success = spendPoints(shuffleCost);
      if (success) {
        const newBoard = { date: new Date().toDateString(), map: generateDailyPool(pools) };
        setDailyBoard(newBoard);
        // Sync to other tabs
        if (broadcastRef.current) {
          broadcastRef.current.postMessage({ type: 'BOARD_SYNC', board: newBoard });
        }
      } else {
        if (Platform.OS === 'web') window.alert(`Not Enough Points: You need ${shuffleCost} points to forcefully reshuffle the board.`);
        else Alert.alert('Not Enough Points', `You need ${shuffleCost} points to forcefully reshuffle the board.`);
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
          { text: `Shuffle (${shuffleCost} pts)`, onPress: performShuffle }
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
           const isMaster = face >= 2 && face <= 5;
           const isSmall = face >= 6 && face <= 11;
           const isBig = face >= 12 && face <= 17;

           let bg = '#374151'; // Dark Grey for default (Master 2-5)
           if (face === 1) bg = '#ef4444'; // Red for Face 1
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
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, Platform.OS === 'web' && { maxWidth: 600, alignSelf: 'center', width: '100%' }]} 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
          <PrizeManagerModal 
            visible={showManager} 
            pools={pools} 
            onSave={savePrizes} 
            onClose={() => setShowManager(false)} 
            onDevWipe={() => {
              cheatEconomy();
              savePrizes(DEFAULT_POOLS);
            }}
          />

          <VaultModal visible={showVault} onClose={() => setShowVault(false)} />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="dice-outline" size={24} color="#6d28d9" />
            <View>
              <Text style={styles.headerTitle}>Roll</Text>
              <Text style={styles.headerSub}>
                {Object.values(pools).reduce((acc, p) => acc + (p || []).length, 0)} prizes loaded
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity 
              style={[styles.manageBtn, unlockedCount > 0 && { backgroundColor: '#d1fae5', borderColor: '#059669' }]} 
              onPress={() => setShowVault(true)}
            >
              <Ionicons name={unlockedCount > 0 ? "gift" : "lock-closed-outline"} size={18} color={unlockedCount > 0 ? "#059669" : "#6d28d9"} />
              <Text style={[styles.manageBtnText, unlockedCount > 0 && { color: '#059669' }]}>Vault</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.manageBtn} onPress={() => setShowManager(true)}>
              <Ionicons name="settings-outline" size={18} color="#6d28d9" />
              <Text style={styles.manageBtnText}>Prizes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reward Cost Bar */}
        <View style={styles.costBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.costText}>Cost: {getRollCost()} Points or 1 Free Roll</Text>
            <TouchableOpacity onPress={() => setShowInflationInfo(true)}>
              <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.bankText}>{economy.freeRolls > 0 ? `${economy.freeRolls} Free Rolls` : `${economy.points} Points`}</Text>
        </View>

        {/* Main interactive area */}
        <View style={styles.gameArea}>
          <Animated.View style={{
            transform: [
              { translateY: floatTranslate },
              { scale: bounce },
            ],
          }}>
            <TouchableOpacity
              onPress={rollDice}
              activeOpacity={0.8}
              disabled={rolling}
              style={{ alignItems: 'center', justifyContent: 'center' }}
            >
              {isFocused && isVisible ? (
                <Dice3D 
                  size={Platform.OS === 'web' ? Math.min(windowWidth * 0.8, 320) : windowWidth * 0.8} 
                  rolling={rolling} 
                  result={result} 
                  color="#6d28d9" 
                  glowColor="#6d28d9" 
                />
              ) : (
                <View style={{ width: 320, height: 320 }} />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Tap hint — between dice and button for equal spacing */}
        <View style={styles.tapHintRow}>
          {bank5IfOver17 > 0 || tokensIfOver17 > 0 ? (
            <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 }}>JACKPOT ROLL ACTIVE!</Text>
            </View>
          ) : (!rolling && !result && (
            <Text style={styles.tapHint}>Tap the dice to roll!</Text>
          ))}
          {rolling && (
            <Text style={styles.tapHint}>Rolling...</Text>
          )}
        </View>

        {!rolling && (
          <View style={{ alignItems: 'center', marginBottom: 32, gap: 12 }}>
            <TouchableOpacity 
              style={[styles.rollAgainBtn, { backgroundColor: '#6d28d9' }]} 
              onPress={rollDice}
              activeOpacity={0.8}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="dice-outline" size={18} color="#fff" />
                  <Text style={[styles.rollAgainText, { color: '#fff' }]}>
                    {(bank5IfOver17 > 0 || tokensIfOver17 > 0) ? 'Jackpot Roll!' : (multiplier > 1 ? `Roll x${multiplier}` : 'Roll Dice')}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
                  {(bank5IfOver17 > 0 || tokensIfOver17 > 0) ? 'This roll is free!' : `Cost: ${getRollCost()} Pts or 1 Free Roll`}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.rollAgainBtn, { backgroundColor: '#4c1d95' }]} 
              onPress={startRealRoll}
              activeOpacity={0.8}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="dice-outline" size={18} color="#fff" />
                  <Text style={[styles.rollAgainText, { color: '#fff' }]}>Real Roll</Text>
                </View>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>I have my own D20 to roll</Text>
              </View>
            </TouchableOpacity>
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
            {result.face === 18 && !result.isJackpot && (!result.prize.startsWith('Swapped')) && (
              <TouchableOpacity style={[styles.rollAgainBtn, { backgroundColor: '#6366f1' }]} onPress={() => setShowSwapUI({ count: multiplier })}>
                <Ionicons name="swap-horizontal" size={18} color="#fff" />
                <Text style={styles.rollAgainText}>Execute Swap</Text>
              </TouchableOpacity>
            )}
            {result.face === 20 && !result.isJackpot && (
              <TouchableOpacity style={[styles.rollAgainBtn, { backgroundColor: '#6366f1' }]} onPress={() => setShowAnyPicker({ type: 'all', count: multiplier })}>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.rollAgainText}>Pick Any Prize</Text>
              </TouchableOpacity>
            )}
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
            {poolEntries.map(([prize, val]) => {
             const count = typeof val === 'object' ? val.count : val;
             return (
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
             );
           })}
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

      {/* Inflation Info Modal */}
      <Modal
        visible={showInflationInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInflationInfo(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 }}>
              <Ionicons name="trending-up" size={32} color="#b45309" />
            </View>
            
            <Text style={{ fontSize: 22, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }}>Point Inflation</Text>
            
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              To maintain a balanced economy, the cost of rewards increases as your point balance grows.
            </Text>

            <View style={{ backgroundColor: '#f9fafb', borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>Base Roll Cost</Text>
                <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '700' }}>100 Pts</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>Inflation Threshold</Text>
                <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '700' }}>1,000 Pts</Text>
              </View>
              <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 4, marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#b45309' }}>Your Current Tax</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#b45309' }}>+{getRollCost() - 100} Pts</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12, marginBottom: 28 }}>
              <Ionicons name="star" size={20} color="#059669" />
              <Text style={{ flex: 1, fontSize: 12, color: '#065f46', fontWeight: '600' }}>
                Free Rolls are unaffected by inflation! They always cost exactly 1 roll.
              </Text>
            </View>

            <TouchableOpacity 
              style={{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
              onPress={() => setShowInflationInfo(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Prize manager modal */}
      <PrizeManagerModal 
        visible={showManager} 
        pools={pools} 
        onSave={savePrizes} 
        onClose={() => setShowManager(false)} 
        onDevWipe={() => {
          setRewardPool({});
          addFreeRoll(100);
          Alert.alert('Dev Reset', 'Pool wiped and 100 rolls added!');
          setShowManager(false);
        }}
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
             {(showAnyPicker && showAnyPicker.type !== 'all' ? [showAnyPicker.type] : ['master', 'small', 'big']).map(category => (
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
                poolEntries.map(([prize, val]) => {
                  const count = typeof val === 'object' ? val.count : val;
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

      {/* Manual Roll Modal */}
      <Modal visible={showRealRollModal} transparent animationType="fade" onRequestClose={() => setShowRealRollModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Ionicons name="dice-outline" size={28} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>Manual D20 Roll</Text>
              <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>Enter the result of your physical roll below.</Text>
            </View>

            <TextInput
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 20, fontSize: 32, fontWeight: '900', color: colors.primary, textAlign: 'center', marginBottom: 20 }}
              placeholder="1-20"
              placeholderTextColor="#d1d5db"
              keyboardType="number-pad"
              maxLength={2}
              value={manualFace}
              onChangeText={setManualFace}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center' }} 
                onPress={() => setShowRealRollModal(false)}
              >
                <Text style={{ color: '#4b5563', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: '#6d28d9', alignItems: 'center' }} 
                onPress={submitManualRoll}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Roll</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    paddingBottom: 100,
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
    borderColor: '#6d28d9',
  },
  manageBtnText: {
    color: '#6d28d9',
    fontWeight: '600',
    fontSize: 14,
  },
  headerBadgeText: {
    color: '#6d28d9',
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
    color: '#6d28d9',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Game Area
  gameArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
    paddingBottom: 24,
  },
  gameArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 12,
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
    paddingVertical: 8,
    minHeight: 40,
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
    backgroundColor: '#6d28d9',
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
    backgroundColor: '#6d28d9',
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
    color: '#6d28d9',
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
  // Top Stats Row
  topStatsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  statChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    backgroundColor: '#6d28d9',
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
    flexGrow: 1,
    padding: 20,
    paddingBottom: 100,
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
    borderColor: '#6d28d9',
  },
  quickBtnText: {
    color: '#6d28d9',
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
    backgroundColor: '#6d28d9',
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
    borderColor: '#6d28d930',
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
    backgroundColor: '#6d28d9',
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
    color: '#6d28d9',
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
    borderColor: '#6d28d9',
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
    color: '#6d28d9',
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
    color: '#6d28d9',
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
    backgroundColor: '#6d28d9',
    borderColor: '#6d28d9',
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
    color: '#6d28d9',
  },

});

