import { useState, useRef, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Animated, Easing, Dimensions, Modal, Image, Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../lib/ThemeContext';
import { useEconomy } from '../lib/EconomyContext';
import ScrollToTop from '../components/ScrollToTop';
import { colors } from '../theme';
import { useTasks, getLocalDateKey, getAppDayKey } from '../lib/TasksContext';
import TaskResultModal from '../components/TaskResultModal';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

function fmtTimer(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CARD_W = (SCREEN_W - 80) / 4;
const CARD_H = CARD_W * 1.4;
const BATTLE_W = (SCREEN_W - 50) / 2;
const BATTLE_H = BATTLE_W * 1.4;

// ── Task pool for cards ──────────────────────────────────────────────────────
const STATUSES = {
  first_step: { color: '#8b5cf6' },
  active:   { color: '#eab308' },
  pending:  { color: '#f59e0b' },
  upcoming: { color: '#64748b' },
  done:     { color: '#10b981' },
  did_my_best: { color: '#0ea5e9' },
  missed:   { color: '#ef4444' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let cardId = 0;
function makeCard(task, value) {
  return { id: cardId++, originalId: task.id, title: task.title, status: task.status || 'pending', value };
}

function dealInitialCards(taskPool) {
  const shuffled = shuffle(taskPool).slice(0, 20);
  const cards = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const task = shuffled[row * 4 + col] || { title: 'Unknown Task', status: 'pending' };
      cards.push(makeCard(task, row + 1));
    }
  }
  return cards;
}

function getUnusedTask(currentCards, taskPool) {
  const used = new Set(currentCards.map(c => c.title));
  const available = taskPool.filter(t => !used.has(t.title));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS (CARDS, PHASES)
// ═════════════════════════════════════════════════════════════════════════════

function GameCard({ card, faceDown, small, large, onPress, highlighted, dimmed, flipAnim }) {
  const statusColor = card ? (STATUSES[card.status]?.color || '#6b7280') : '#ffffff';
  const [showFront, setShowFront] = useState(!faceDown);

  useEffect(() => {
    if (flipAnim) {
      const id = flipAnim.addListener(({ value }) => {
        setShowFront(value > 0.5);
      });
      return () => flipAnim.removeListener(id);
    } else {
      setShowFront(!faceDown);
    }
  }, [flipAnim, faceDown]);

  const cardStyle = [
    styles.card,
    small && styles.cardSmall,
    large && styles.cardLarge,
    { backgroundColor: showFront ? statusColor : '#ffffff', borderColor: showFront ? statusColor : '#e5e7eb' },
    highlighted && { borderColor: '#ffffff', borderWidth: 2 },
    dimmed && { opacity: 0.4 },
    flipAnim && {
      transform: [
        { perspective: 1000 },
        { rotateY: flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '0deg'] }) }
      ]
    }
  ];

  const content = (
    <>
      {!showFront ? (
        <View style={[styles.cardBackPattern, { flex: 1, width: '100%', height: '100%' }]}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ 
              width: large ? 175 : (small ? 30 : 60), 
              height: large ? 175 : (small ? 30 : 60)
            }} 
            resizeMode="contain" 
          />
        </View>
      ) : (
        <>
          {card && (
            <>
              <View style={[styles.cardRankTop, large && { top: 8, left: 10 }]}>
                <Text style={[styles.cardRankText, large && { fontSize: 20 }]}>{card.value}</Text>
              </View>
              <View style={styles.cardCenterContent}>
                <Text style={[styles.cardTitle, { color: '#ffffff' }, small && { fontSize: 8 }, large && { fontSize: 16 }]} numberOfLines={large ? 6 : (small ? 2 : 4)}>
                  {card.title}
                </Text>
              </View>
              <View style={[styles.cardRankBottom, large && { bottom: 8, right: 10 }, { transform: [{ rotate: '180deg' }] }]}>
                <Text style={[styles.cardRankText, large && { fontSize: 20 }]}>{card.value}</Text>
              </View>
            </>
          )}
        </>
      )}
    </>
  );

  if (flipAnim) {
    return <Animated.View style={cardStyle}>{content}</Animated.View>;
  }

  return (
    <TouchableOpacity
      style={cardStyle}
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      disabled={!onPress}
    >
      {content}
    </TouchableOpacity>
  );
}

function SetupPhase({ cards, onSwapCard, onShuffle, onFlipSound }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <View style={styles.setupContainer}>
      <Text style={styles.phaseTitle}>Build Your Deck</Text>
      <Text style={styles.phaseHint}>Tap a card to swap it. Press Shuffle when ready!</Text>
      {rows.map(row => (
        <View key={row} style={styles.setupRow}>
          <View style={styles.rowLabel}>
            <Text style={[styles.rowLabelText, { color: '#94a3b8' }]}>{row + 1}</Text>
          </View>
          {[0, 1, 2, 3].map(col => {
            const idx = row * 4 + col;
            const card = cards[idx];
            return <GameCard key={card.id} card={card} small onPress={() => { onFlipSound(); onSwapCard(idx); }} />;
          })}
        </View>
      ))}
      <TouchableOpacity style={styles.shuffleBtn} onPress={onShuffle}>
        <Ionicons name="shuffle" size={20} color="#fff" />
        <Text style={styles.shuffleBtnText}>Shuffle & Start War!</Text>
      </TouchableOpacity>
    </View>
  );
}

function BattlePhase({
  playerDeck, opponentDeck,
  playerCard, opponentCard,
  warStake,
  battleResult, isWar,
  onResolve, onDoTask, onForfeit,
  pFlip, oFlip, waitingForPlayer, hasFlippedOnce, onPlayerFlip, colors
}) {
  const stakeContribution = Math.floor(warStake.length / 2);
  const playerCount = playerDeck.length + (playerCard ? 1 : 0) + stakeContribution;
  const opponentCount = opponentDeck.length + (opponentCard ? 1 : 0) + stakeContribution;

  return (
    <View style={styles.battleContainer}>
      <View style={styles.scoreBar}>
        <View style={styles.scoreItem}>
          <Ionicons name="person" size={18} color={colors.primary} />
          <Text style={[styles.scoreLabel, { color: colors.textPrimary }]}>You</Text>
          <View style={[styles.scoreBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.scoreBadgeText}>{playerCount}</Text>
          </View>
        </View>
        <Text style={[styles.vsText, { color: colors.textSecondary }]}>VS</Text>
        <View style={styles.scoreItem}>
          <Ionicons name="skull" size={18} color={colors.red} />
          <Text style={[styles.scoreLabel, { color: colors.textPrimary }]}>Foe</Text>
          <View style={[styles.scoreBadge, { backgroundColor: colors.red }]}>
            <Text style={styles.scoreBadgeText}>{opponentCount}</Text>
          </View>
        </View>
      </View>

      {warStake.length > 0 && (
        <View style={[styles.warStakeBar, { marginBottom: 10 }]}>
          <Ionicons name="flame" size={16} color="#ef4444" />
          <Text style={styles.warStakeText}>{Math.floor(warStake.length / 2) + 1} cards to steal!</Text>
        </View>
      )}

      <View style={styles.battleField}>
        {/* VS / STAKE INDICATOR - POSITIONED ABSOLUTELY ON THE RIGHT */}
        <View style={[styles.battleCenter, { position: 'absolute', right: 60, top: '50%', marginTop: -30 }]}>
          {warStake.length === 0 ? (
            <Text style={styles.vsText}>VS</Text>
          ) : (
            <View style={styles.warBadge}>
               <Text style={styles.warBadgeText}>WAR</Text>
            </View>
          )}
        </View>

        {/* OPPONENT SIDE */}
        <View style={styles.battleSide}>
          <View style={[styles.sideLabelWrapper, { position: 'absolute', left: 20 }]}>
            <Text style={[styles.sideLabel, battleResult === 'opponent' && { color: '#ef4444', fontWeight: '900' }]}>OPPONENT</Text>
          </View>
          {opponentCard 
            ? <GameCard card={opponentCard} large highlighted={battleResult === 'opponent'} flipAnim={oFlip} /> 
            : (opponentDeck.length > 0 ? <GameCard faceDown large /> : <View style={[styles.card, styles.cardLarge, styles.emptySlot]}><Text style={styles.emptySlotText}>Empty</Text></View>)
          }
        </View>

        {/* YOU SIDE */}
        <View style={styles.battleSide}>
          <View style={[styles.sideLabelWrapper, { position: 'absolute', left: 20 }]}>
            <Text style={[styles.sideLabel, battleResult === 'player' && { color: colors.primary, fontWeight: '900' }]}>YOU</Text>
          </View>
          {playerCard 
            ? <GameCard card={playerCard} large highlighted={battleResult === 'player'} flipAnim={pFlip} /> 
            : (playerDeck.length > 0 ? (
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity onPress={onPlayerFlip} activeOpacity={0.9}>
                    <GameCard faceDown large highlighted={waitingForPlayer} dimmed={!waitingForPlayer} />
                  </TouchableOpacity>
                  {waitingForPlayer && !hasFlippedOnce && (
                    <View style={{ marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>TAP TO FLIP</Text>
                    </View>
                  )}
                </View>
              ) : <View style={[styles.card, styles.cardLarge, styles.emptySlot]}><Text style={styles.emptySlotText}>Empty</Text></View>)
          }
        </View>
      </View>

      {isWar && (
        <View style={styles.warCardsRow}>
          <View style={styles.warCardsStack}>
            {Array.from({ length: isWar.player || 0 }).map((_, i) => (
              <View key={`pw${i}`} style={[styles.warMiniCard, { left: i * 8 }]}>
                <Image source={require('../../assets/logo.png')} style={{ width: 14, height: 14 }} resizeMode="contain" />
              </View>
            ))}
          </View>
          <Text style={styles.warMiddleText}>{isWar.player === isWar.opponent && isWar.player > 0 ? `${isWar.player} cards each` : `${isWar.player || 0} vs ${isWar.opponent || 0} cards`}</Text>
          <View style={styles.warCardsStack}>
            {Array.from({ length: isWar.opponent || 0 }).map((_, i) => (
              <View key={`ow${i}`} style={[styles.warMiniCard, { left: i * 8 }]}>
                <Image source={require('../../assets/logo.png')} style={{ width: 14, height: 14 }} resizeMode="contain" />
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actionArea}>
        {battleResult === 'player' && (
          <View style={styles.resultActions}>
            <Text style={styles.resultText}>🎉 You win this round!</Text>
            <TouchableOpacity style={styles.collectBtn} onPress={onResolve}><Text style={styles.collectBtnText}>Collect Cards</Text></TouchableOpacity>
          </View>
        )}
        {battleResult === 'opponent' && (
          <View style={styles.resultActions}>
            <Text style={styles.resultText}>😤 Opponent wins!</Text>
            <Text style={styles.taskPrompt}>Do this task to steal the card:</Text>
            <View style={styles.taskCard}><Text style={styles.taskCardText}>{opponentCard?.title}</Text></View>
            <View style={styles.stealRow}>
              <TouchableOpacity style={styles.doTaskBtn} onPress={onDoTask}><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.doTaskBtnText}>Did It! Steal Card</Text></TouchableOpacity>
              <TouchableOpacity style={styles.forfeitBtn} onPress={onForfeit}><Text style={styles.forfeitBtnText}>Forfeit</Text></TouchableOpacity>
            </View>
          </View>
        )}
        {battleResult === 'war' && (
          <View style={styles.resultActions}>
            <Text style={styles.warAnnounce}>⚔️ It's a tie — going to WAR!</Text>
            <TouchableOpacity style={styles.collectBtn} onPress={onResolve}><Text style={styles.collectBtnText}>Go to War!</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function WinScreen({ winner, onPlayAgain }) {
  const isPlayer = winner === 'player';
  return (
    <View style={styles.winContainer}>
      <Text style={styles.winEmoji}>{isPlayer ? '🏆' : '💀'}</Text>
      <Text style={styles.winTitle}>{isPlayer ? 'You Win!' : 'You Lost!'}</Text>
      <Text style={styles.winSub}>{isPlayer ? 'You captured all the cards!' : 'Your opponent took all your cards.'}</Text>
      <TouchableOpacity style={styles.playAgainBtn} onPress={onPlayAgain}><Ionicons name="refresh" size={20} color="#fff" /><Text style={styles.playAgainText}>Play Again</Text></TouchableOpacity>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHUFFLING & DEALING ANIMATION
// ═════════════════════════════════════════════════════════════════════════════

function ShufflingStage({ onComplete, playShuffleSound }) {
  const { colors } = useTheme();
  // We'll animate 20 cards
  const cards = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    pos: useRef(new Animated.ValueXY({ x: (i % 4) * (CARD_W + 10) - (SCREEN_W/2 - 40), y: Math.floor(i / 4) * (CARD_H + 10) - 200 })).current,
    rot: useRef(new Animated.Value(0)).current,
    scale: useRef(new Animated.Value(1)).current,
    opacity: useRef(new Animated.Value(1)).current,
  }));

  useEffect(() => {
    // 1. GATHER to center
    const gatherAnims = cards.map(c => 
      Animated.parallel([
        Animated.spring(c.pos, { toValue: { x: 0, y: 0 }, friction: 7, tension: 40, useNativeDriver: true }),
        Animated.timing(c.rot, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );

    Animated.parallel(gatherAnims).start(() => {
      // 2. SHUFFLE WIGGLE
      playShuffleSound();
      const shuffleAnims = cards.map((c, i) => 
        Animated.sequence([
          Animated.timing(c.pos, { toValue: { x: (i%2 === 0 ? 15 : -15), y: 0 }, duration: 100, useNativeDriver: true }),
          Animated.timing(c.pos, { toValue: { x: 0, y: 0 }, duration: 100, useNativeDriver: true }),
          Animated.timing(c.pos, { toValue: { x: (i%2 === 0 ? -10 : 10), y: 0 }, duration: 100, useNativeDriver: true }),
          Animated.timing(c.pos, { toValue: { x: 0, y: 0 }, duration: 100, useNativeDriver: true }),
        ])
      );

      Animated.parallel(shuffleAnims).start(() => {
        // 3. DEAL to top/bottom
        const dealAnims = cards.map((c, i) => {
          const isPlayer = i < 10;
          const targetY = isPlayer ? 400 : -400;
          const targetX = isPlayer ? -50 : 50;
          return Animated.sequence([
            Animated.delay(i * 40),
            Animated.parallel([
              Animated.timing(c.pos, { toValue: { x: targetX, y: targetY }, duration: 400, useNativeDriver: true }),
              Animated.timing(c.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
              Animated.timing(c.scale, { toValue: 0.5, duration: 400, useNativeDriver: true }),
            ])
          ]);
        });
        
        Animated.parallel(dealAnims).start(() => {
          onComplete();
        });
      });
    });
  }, []);

  return (
    <View style={styles.shufflingContainer}>
      <Text style={styles.shufflingTitle}>Shuffling Deck...</Text>
      <View style={styles.shufflingField}>
        {cards.map(c => (
          <Animated.View 
            key={c.id} 
            style={[
              styles.shufflingCard,
              {
                opacity: c.opacity,
                transform: [
                  { translateX: c.pos.x },
                  { translateY: c.pos.y },
                  { rotate: c.rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                  { scale: c.scale }
                ]
              }
            ]}
          >
            <View style={{ width: 240, height: 336 }}>
               <GameCard faceDown large />
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REWARD MODALS
// ═════════════════════════════════════════════════════════════════════════════

function RecordDiceModal({ visible, onReward, colors, title = "NEW RECORD!" }) {
  const [step, setStep] = useState('rollBase'); // rollBase | showBase | rollMulti | result
  const [baseRoll, setBaseRoll] = useState(1);
  const [multiRoll, setMultiRoll] = useState(1);
  const spinVal = useRef(new Animated.Value(0)).current;
  const rollPlayer = useAudioPlayer(require('../../assets/dice-roll.wav'));


  function playRollSound() {
    try {
      rollPlayer.seekTo(0);
      rollPlayer.play();
    } catch (e) {}
  }

  useEffect(() => {
    if (visible) startRoll();
  }, [visible]);

  const startRoll = () => {
    setStep('rollBase');
    playRollSound();
    Animated.timing(spinVal, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      const base = Math.floor(Math.random() * 20) + 1;
      setBaseRoll(base);
      setStep('showBase');
      spinVal.setValue(0);
      
      setTimeout(() => {
        setStep('rollMulti');
        playRollSound();
        Animated.timing(spinVal, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
          const multi = Math.floor(Math.random() * 4) + 1;
          setMultiRoll(multi);
          setStep('result');
        });
      }, 1000);
    });
  };

  const pts = baseRoll * multiRoll;
  const xp = Math.floor(pts / 2);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={diceStyles.overlay}>
        <View style={diceStyles.body}>
          {step === 'rollBase' && (
            <View style={diceStyles.center}>
              <Text style={[diceStyles.title, { color: colors.textPrimary }]}>{title}</Text>
              <Text style={[diceStyles.sub, { color: colors.textSecondary }]}>Rolling d20 Base Reward...</Text>
              <Animated.View style={{ transform: [{ rotate: spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] }) }] }}>
                <Ionicons name="dice" size={80} color={colors.amber} />
              </Animated.View>
            </View>
          )}
          {step === 'showBase' && (
            <View style={diceStyles.center}>
              <Text style={diceStyles.title}>You rolled a {baseRoll}!</Text>
              <Ionicons name="dice" size={80} color={colors.amber} />
            </View>
          )}
          {step === 'rollMulti' && (
            <View style={diceStyles.center}>
              <Text style={diceStyles.title}>Rolling d4 Multiplier...</Text>
              <View style={diceStyles.calcRow}>
                <View style={diceStyles.calcItem}><Text style={diceStyles.calcVal}>{baseRoll}</Text><Text style={diceStyles.calcLbl}>Base</Text></View>
                <Text style={diceStyles.calcOps}>x</Text>
                <Animated.View style={{ transform: [{ rotate: spinVal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] }) }] }}>
                  <Ionicons name="dice" size={60} color={colors.primary} />
                </Animated.View>
              </View>
            </View>
          )}
          {step === 'result' && (
            <View style={diceStyles.center}>
              <Ionicons name="sparkles" size={48} color={colors.amber} />
              <Text style={diceStyles.title}>Legendary Gains!</Text>
              <View style={diceStyles.resultBox}>
                  <Text style={diceStyles.resultBig}>+{pts} Points</Text>
                  <Text style={diceStyles.resultSmall}>+{xp} XP</Text>
              </View>
              <TouchableOpacity style={[diceStyles.doneBtn, { backgroundColor: colors.primary }]} onPress={() => onReward(pts, xp)}>
                <Text style={diceStyles.doneText}>Claim Record Reward</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const diceStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 30 },
  body: { backgroundColor: '#fff', borderRadius: 24, padding: 30, alignItems: 'center' },
  center: { alignItems: 'center', gap: 16, width: '100%' },
  title: { fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'center' },
  sub: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginVertical: 10 },
  calcItem: { alignItems: 'center' },
  calcVal: { fontSize: 32, fontWeight: '800', color: '#111827' },
  calcLbl: { fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' },
  calcOps: { fontSize: 24, fontWeight: '800', color: '#d1d5db' },
  resultBox: { width: '100%', padding: 20, borderRadius: 16, backgroundColor: '#ecfdf5', alignItems: 'center', marginVertical: 10 },
  resultBig: { fontSize: 28, fontWeight: '900', color: '#059669' },
  resultSmall: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  doneBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

// ═════════════════════════════════════════════════════════════════════════════
// GAME SCREENS
// ═════════════════════════════════════════════════════════════════════════════

function WarGame({ onBack, tasks, colors }) {
  const { logTaskEvent, setTasks, completeTask } = useTasks();
  const { addReward } = useEconomy();
  const [completingWarTask, setCompletingWarTask] = useState(null);

  const taskPool = tasks.filter(t => t.status === 'pending' || t.status === 'active' || t.status === 'first_step' || t.status === 'missed');
  const [phase, setPhase] = useState('setup');
  const [setupCards, setSetupCards] = useState(() => taskPool.length >= 20 ? dealInitialCards(taskPool) : []);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [opponentDeck, setOpponentDeck] = useState([]);
  const [playerCard, setPlayerCard]   = useState(null);
  const [opponentCard, setOpponentCard] = useState(null);
  const [battleResult, setBattleResult] = useState(null); 
  const [warStake, setWarStake]       = useState([]); 
  const [isWar, setIsWar]             = useState(false); 
  const [winner, setWinner]           = useState(null);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);

  // Animations
  const pFlip = useRef(new Animated.Value(0)).current;
  const oFlip = useRef(new Animated.Value(0)).current;
  const [waitingForPlayer, setWaitingForPlayer] = useState(false);

  // Audio — use refs to avoid stale-closure unload bug
  const flipPlayer = useAudioPlayer(require('../../assets/card-flip.mp3'));
  const shufflePlayer = useAudioPlayer(require('../../assets/card-shuffle.mp3'));


  function playFlipSound() {
    try {
      flipPlayer.seekTo(0);
      flipPlayer.play();
    } catch (e) {}
  }

  function playShuffleSound() {
    try {
      shufflePlayer.seekTo(0);
      shufflePlayer.play();
    } catch (e) {}
  }

  useEffect(() => {
    if (phase === 'setup' && taskPool.length >= 20 && setupCards.length === 0) setSetupCards(dealInitialCards(taskPool));
  }, [taskPool, phase]);

  // Round Logic
  useEffect(() => {
    if (phase === 'battle' && !playerCard && !opponentCard && playerDeck.length > 0 && opponentDeck.length > 0) {
      startNextRound();
    }
  }, [phase, playerCard, opponentCard, playerDeck.length, opponentDeck.length]);

  function startNextRound() {
    // 1 second delay for suspense before reveal
    setTimeout(() => {
      if (playerCard || opponentCard) return; 
      const oNext = opponentDeck[0];
      if (!oNext) return;

      setOpponentCard(oNext);
      setOpponentDeck(opponentDeck.slice(1));
      oFlip.setValue(0);
      pFlip.setValue(0);
      playFlipSound();
      Animated.timing(oFlip, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(() => {
        setWaitingForPlayer(true);
      });
    }, 1000);
  }

  function handlePlayerFlip() {
    if (!waitingForPlayer) return;
    setHasFlippedOnce(true);
    setWaitingForPlayer(false);
    const pNext = playerDeck[0];
    setPlayerCard(pNext);
    setPlayerDeck(playerDeck.slice(1));
    playFlipSound();
    Animated.timing(pFlip, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(() => {
      // Resolve Result
      if (pNext.value > opponentCard.value) setBattleResult('player');
      else if (opponentCard.value > pNext.value) setBattleResult('opponent');
      else setBattleResult('war');
    });
  }

  function swapCard(idx) {
    const newTask = getUnusedTask(setupCards, taskPool);
    if (!newTask) { Alert.alert('No More Tasks', 'All playable tasks are already in use!'); return; }
    setSetupCards(prev => { const next = [...prev]; next[idx] = makeCard(newTask, next[idx].value); return next; });
  }

  function startGame() {
    setPhase('shuffling');
  }

  function finishShuffling() {
    const shuffledCards = shuffle(setupCards);
    const half = Math.floor(shuffledCards.length / 2);
    setPlayerDeck(shuffledCards.slice(0, half));
    setOpponentDeck(shuffledCards.slice(half));
    setPhase('battle');
  }

  function resolveRound() {
    if (battleResult === 'war') {
      if (playerDeck.length < 2 || opponentDeck.length < 2) { 
        setWinner(playerDeck.length > opponentDeck.length ? 'player' : 'opponent'); 
        setPhase('win'); 
        return; 
      }
      const stake = [...warStake, playerCard, opponentCard];
      const pCount = Math.min(3, playerDeck.length - 1);
      const oCount = Math.min(3, opponentDeck.length - 1);
      setWarStake([...stake, ...playerDeck.slice(0, pCount), ...opponentDeck.slice(0, oCount)]);
      setPlayerDeck(playerDeck.slice(pCount)); setOpponentDeck(opponentDeck.slice(oCount));
      setPlayerCard(null); setOpponentCard(null); setBattleResult(null); setIsWar({ player: pCount, opponent: oCount });
      return;
    }
    const wonCards = [playerCard, opponentCard, ...warStake];
    playShuffleSound();
    setPlayerDeck([...playerDeck, ...shuffle(wonCards)]);
    setPlayerCard(null); setOpponentCard(null); setBattleResult(null); setWarStake([]); setIsWar(false);
    if (opponentDeck.length === 0) { setWinner('player'); setPhase('win'); }
  }

  function doTask() { 
    if (opponentCard) {
      setCompletingWarTask({
        id: opponentCard.originalId,
        title: opponentCard.title,
      });
    }
  }

  function handleWarRewardClaim(taskId, results) {
    if (opponentCard) {
      completeTask(opponentCard.originalId, 'done');
    }
    setCompletingWarTask(null);
    
    // Manually resolve round as a PLAYER win
    const wonCards = [playerCard, opponentCard, ...warStake];
    playShuffleSound();
    setPlayerDeck(prev => [...prev, ...shuffle(wonCards)]);
    setPlayerCard(null); setOpponentCard(null); setBattleResult(null); setWarStake([]); setIsWar(false);
    if (opponentDeck.length === 0) { setWinner('player'); setPhase('win'); }
  }
  function forfeitCards() { 
    const wonCards = [playerCard, opponentCard, ...warStake];
    playShuffleSound();
    setOpponentDeck([...opponentDeck, ...shuffle(wonCards)]);
    setPlayerCard(null); setOpponentCard(null); setBattleResult(null); setWarStake([]); setIsWar(false);
    if (playerDeck.length === 0) { setWinner('opponent'); setPhase('win'); }
  }
  function playAgain() { setSetupCards(dealInitialCards(taskPool)); setWinner(null); setPhase('setup'); }

  if (taskPool.length < 20) {
    return (
      <View style={hubStyles.gameWrapper}>
        <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Task War</Text></View>
        <View style={styles.emptyContainer}><Ionicons name="documents-outline" size={64} color="#ccc"/><Text style={styles.emptyTitle}>Not enough tasks</Text><Text style={styles.emptySub}>At least 20 tasks needed. You have {taskPool.length}.</Text></View>
      </View>
    );
  }

  return (
    <View style={hubStyles.gameWrapper}>
      <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Task War</Text></View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {phase === 'setup' && <SetupPhase cards={setupCards} onSwapCard={swapCard} onShuffle={startGame} onFlipSound={playFlipSound} />}
        {phase === 'shuffling' && <ShufflingStage onComplete={finishShuffling} playShuffleSound={playShuffleSound} />}
        {phase === 'battle' && <BattlePhase playerDeck={playerDeck} opponentDeck={opponentDeck} playerCard={playerCard} opponentCard={opponentCard} warStake={warStake} battleResult={battleResult} isWar={isWar} onResolve={resolveRound} onDoTask={doTask} onForfeit={forfeitCards} pFlip={pFlip} oFlip={oFlip} waitingForPlayer={waitingForPlayer} hasFlippedOnce={hasFlippedOnce} onPlayerFlip={handlePlayerFlip} colors={colors}/>}
      {phase === 'win' && <WinScreen winner={winner} onPlayAgain={playAgain} />}
      </ScrollView>

      <TaskResultModal
        visible={!!completingWarTask}
        task={completingWarTask}
        onClose={() => setCompletingWarTask(null)}
        onComplete={handleWarRewardClaim}
      />
    </View>
  );
}

function FocusBreather({ onBack, colors }) {
  const [phase, setPhase] = useState('inhale');
  const [seconds, setSeconds] = useState(4);
  const breathAnim = useRef(new Animated.Value(1)).current;
  const { addReward } = useEconomy();

  useEffect(() => {
    let timer = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          if (phase === 'inhale') { setPhase('hold'); return 4; }
          if (phase === 'hold') { setPhase('exhale'); return 4; }
          if (phase === 'exhale') { setPhase('inhale'); return 4; }
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === 'inhale') Animated.timing(breathAnim, { toValue: 1.8, duration: 4000, easing: Easing.linear, useNativeDriver: true }).start();
    else if (phase === 'exhale') Animated.timing(breathAnim, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }).start();
  }, [phase]);

  const getLabel = () => phase === 'inhale' ? 'Inhale' : phase === 'hold' ? 'Hold' : 'Exhale';

  return (
    <View style={hubStyles.gameWrapper}>
      <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Breather</Text></View>
      <View style={hubStyles.breatherContainer}>
        <Animated.View style={[hubStyles.breathCircle, { transform: [{ scale: breathAnim }], backgroundColor: colors.primary + '20', borderColor: colors.primary }]} />
        <Text style={[hubStyles.breathPhase, { color: colors.primary }]}>{getLabel()}</Text>
        <Text style={hubStyles.breathSeconds}>{seconds}</Text>
        <TouchableOpacity style={hubStyles.zenDoneBtn} onPress={() => { addReward(10, 5); onBack(); }}><Text style={hubStyles.zenDoneText}>Collect 10 Pts (+5 XP)</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const MATCH_ICONS = ['shield', 'flash', 'flask', 'heart', 'ribbon', 'trophy', 'diamond', 'skull'];
function EnergyRamp({ onBack, colors, tasks }) {
  const { addReward, addFreeRoll } = useEconomy();
  const { logTaskEvent, setTasks, completeTask } = useTasks();
  
  const [phase, setPhase] = useState('setup'); // setup | play | success | late
  const [selectedLow, setSelectedLow] = useState([]);
  const [selectedMed, setSelectedMed] = useState([]);
  const [selectedHigh, setSelectedHigh] = useState([]);
  const [timeEstimate, setTimeEstimate] = useState(60); // minutes
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [completedIds, setCompletedIds] = useState([]);
  const [showPrizePicker, setShowPrizePicker] = useState(false);
  const [showD20Roll, setShowD20Roll] = useState(false);

  const todayKey = getAppDayKey();
  const availableTasks = tasks.filter(t => {
    if (t.status === 'done') return false;
    
    // Include specific statuses
    const isSpecialStatus = ['pending', 'active', 'missed', 'first_step', 'upcoming'].includes(t.status);
    if (isSpecialStatus) return true;

    // Include urgent, priority, or tasks with active streaks
    if (t.isUrgent || t.isPriority || (t.streak > 0)) return true;

    // Include anything due today (App Day)
    if (t.dueDate === todayKey) return true;

    return false;
  });
  const lowTasks = availableTasks.filter(t => t.energy === 'low' || !t.energy);
  const medTasks = availableTasks.filter(t => t.energy === 'medium');
  const highTasks = availableTasks.filter(t => t.energy === 'high');

  useEffect(() => {
    let interval;
    if (phase === 'play' && startTime) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, startTime]);

  const toggleTask = (id, type) => {
    const setters = { low: setSelectedLow, med: setSelectedMed, high: setSelectedHigh };
    const limits = { low: 3, med: 2, high: 1 };
    
    setters[type](prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= limits[type]) return prev;
      return [...prev, id];
    });
  };

  const handleStart = () => {
    if (selectedLow.length < 3 || selectedMed.length < 2 || selectedHigh.length < 1) {
      Alert.alert('Selection Incomplete', 'Please choose 3 Low, 2 Medium, and 1 High energy task.');
      return;
    }
    setStartTime(Date.now());
    setPhase('play');
  };

  const allSelectedIds = [...selectedLow, ...selectedMed, ...selectedHigh];
  const allCompleted = allSelectedIds.every(id => completedIds.includes(id));

  const handleTaskCheck = (taskId) => {
    if (completedIds.includes(taskId)) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      completeTask(taskId, 'done');
    }
    
    setCompletedIds(prev => [...prev, taskId]);
  };

  const handleFinish = () => {
    const limitSec = timeEstimate * 60;
    if (elapsed <= limitSec) {
      setPhase('success');
      setShowPrizePicker(true);
    } else {
      setPhase('late');
      setShowD20Roll(true);
    }
  };

  const renderTaskItem = (task, type) => {
    const isSelected = (type === 'low' ? selectedLow : type === 'med' ? selectedMed : selectedHigh).includes(task.id);
    return (
      <TouchableOpacity 
        key={task.id} 
        style={[rampStyles.taskItem, isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} 
        onPress={() => toggleTask(task.id, type)}
      >
        <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={20} color={isSelected ? colors.primary : colors.textMuted} />
        <Text style={[rampStyles.taskText, isSelected && { color: colors.textPrimary }]}>{task.title}</Text>
      </TouchableOpacity>
    );
  };

  if (phase === 'setup') {
    return (
      <View style={hubStyles.gameWrapper}>
        <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Energy Ramp</Text></View>
        <ScrollView contentContainerStyle={rampStyles.container}>
          <Text style={rampStyles.sectionTitle}>1. Choose 3 Low Energy Tasks</Text>
          <View style={rampStyles.list}>{lowTasks.length ? lowTasks.map(t => renderTaskItem(t, 'low')) : <Text style={rampStyles.empty}>No low energy tasks found.</Text>}</View>
          
          <Text style={rampStyles.sectionTitle}>2. Choose 2 Medium Energy Tasks</Text>
          <View style={rampStyles.list}>{medTasks.length ? medTasks.map(t => renderTaskItem(t, 'med')) : <Text style={rampStyles.empty}>No medium energy tasks found.</Text>}</View>
          
          <Text style={rampStyles.sectionTitle}>3. Choose 1 High Energy Task</Text>
          <View style={rampStyles.list}>{highTasks.length ? highTasks.map(t => renderTaskItem(t, 'high')) : <Text style={rampStyles.empty}>No high energy tasks found.</Text>}</View>

          <Text style={rampStyles.sectionTitle}>4. Estimate Time (Minutes)</Text>
          <View style={rampStyles.timerInputRow}>
            {[30, 60, 90, 120, 180].map(m => (
              <TouchableOpacity key={m} style={[rampStyles.timeBtn, timeEstimate === m && { backgroundColor: colors.primary }]} onPress={() => setTimeEstimate(m)}>
                <Text style={[rampStyles.timeBtnText, timeEstimate === m && { color: '#fff' }]}>{m}m</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[rampStyles.startBtn, { backgroundColor: colors.primary }]} onPress={handleStart}>
            <Text style={rampStyles.startBtnText}>Start Energy Ramp</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (phase === 'play') {
    const limitSec = timeEstimate * 60;
    const isLate = elapsed > limitSec;
    const progress = Math.min(completedIds.length / allSelectedIds.length, 1);

    return (
      <View style={hubStyles.gameWrapper}>
        <View style={styles.header}><TouchableOpacity onPress={() => Alert.alert('Quit Game?', 'Progress will be lost.', [{text: 'Stay'}, {text: 'Quit', onPress: onBack}])}><Ionicons name="close" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Active Ramp</Text></View>
        <View style={rampStyles.playContainer}>
          <View style={rampStyles.timerGlass}>
            <Text style={[rampStyles.timerVal, isLate && { color: '#ef4444' }]}>{fmtTimer(Math.abs(limitSec - elapsed))}</Text>
            <Text style={rampStyles.timerSub}>{isLate ? 'OVERTIME' : 'REMAINING'}</Text>
          </View>

          <View style={rampStyles.progressBar}>
            <View style={[rampStyles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
          </View>

          <ScrollView style={{ flex: 1, marginTop: 20 }}>
            {allSelectedIds.map(id => {
              const task = tasks.find(t => t.id === id);
              const done = completedIds.includes(id);
              return (
                <TouchableOpacity key={id} style={[rampStyles.playTask, done && { opacity: 0.5 }]} onPress={() => handleTaskCheck(id)}>
                  <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={24} color={done ? "#10b981" : colors.textMuted} />
                  <Text style={[rampStyles.playTaskText, done && { textDecorationLine: 'line-through' }]}>{task.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {allCompleted && (
            <TouchableOpacity style={[rampStyles.finishBtn, { backgroundColor: '#10b981' }]} onPress={handleFinish}>
              <Text style={rampStyles.finishBtnText}>Finish & Claim Reward</Text>
            </TouchableOpacity>
          )}
        </View>

        <PrizePickerModal 
          visible={showPrizePicker} 
          onSelect={(prize) => { 
            Alert.alert('Success!', `You won: ${prize}`);
            onBack(); 
          }} 
          onClose={() => setShowPrizePicker(false)}
        />
        
        <RecordDiceModal 
          visible={showD20Roll} 
          colors={colors} 
          title="OVERTIME FINISH"
          onReward={(pts, xp) => { 
            addReward(pts, xp); 
            onBack(); 
          }} 
        />
      </View>
    );
  }

  return null;
}

function PrizePickerModal({ visible, onSelect, onClose }) {
  const prizes = [
     '☕ Coffee break', '🎵 Pick a song', '🍫 Snack time', '📱 5 min phone break',
     '🎮 1 hour gaming', '📺 Watch an episode', '🍕 Order takeout', '💤 Power nap',
     '🛒 Buy something small', '📖 Read a chapter', '🧊 Ice cream', '💪 Skip a chore'
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={rampStyles.modalOverlay}>
        <View style={rampStyles.modalBody}>
          <Text style={rampStyles.modalTitle}>Choose Your Prize!</Text>
          <Text style={rampStyles.modalSub}>You beat the clock!</Text>
          <ScrollView contentContainerStyle={rampStyles.prizeGrid}>
            {prizes.map(p => (
              <TouchableOpacity key={p} style={rampStyles.prizeCard} onPress={() => onSelect(p)}>
                <Text style={rampStyles.prizeText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10 }}><Text style={{ color: '#9ca3af' }}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const rampStyles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 140 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1f2937', marginTop: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { gap: 8 },
  taskItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  taskText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  empty: { fontSize: 14, color: '#9ca3af', fontStyle: 'italic', paddingLeft: 4 },
  timerInputRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  timeBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWeight: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  timeBtnText: { fontWeight: '700', color: '#6b7280' },
  startBtn: { marginTop: 40, paddingVertical: 18, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  playContainer: { flex: 1, padding: 20 },
  timerGlass: { backgroundColor: '#f9fafb', borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  timerVal: { fontSize: 48, fontWeight: '900', color: '#111827', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  timerSub: { fontSize: 12, fontWeight: '800', color: '#9ca3af', letterSpacing: 2, marginTop: 4 },
  progressBar: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, marginTop: 20, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  playTask: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  playTaskText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  finishBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 20 },
  finishBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBody: { width: '90%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
  modalSub: { fontSize: 14, color: '#10b981', fontWeight: '700', marginBottom: 20 },
  prizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  prizeCard: { backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  prizeText: { fontWeight: '600', color: '#1f2937' },
});

function DopamineMatch({ onBack, colors, tasks }) {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [solved, setSolved] = useState([]);
  const [moves, setMoves] = useState(0);
  const [bestMoves, setBestMoves] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const { addReward } = useEconomy();

  useEffect(() => {
    AsyncStorage.getItem('@ADHD_match_best').then(val => {
      if (val) setBestMoves(parseInt(val));
    });
  }, []);

  useEffect(() => {
    const pending = tasks.filter(t => t.status === 'pending');
    let pool = pending.map(t => t.title);
    
    // Shuffle pool and take 8
    let selected = shuffle(pool).slice(0, 8);
    
    // Fill if fewer than 8
    const fallbacks = ['Daily Goal', 'Drink Water', 'Stretch', 'Take a Breath', 'Deep Focus', 'Productivity', 'Brain Reset', 'ADHD Win'];
    let fallbackIdx = 0;
    while (selected.length < 8) {
      const fb = fallbacks[fallbackIdx % fallbacks.length];
      if (!selected.includes(fb)) selected.push(fb);
      fallbackIdx++;
    }

    const doubled = [...selected, ...selected].sort(() => Math.random() - 0.5).map((content, i) => ({ id: i, content }));
    setCards(doubled);
  }, []);

  const handleFlip = (idx) => {
    if (flipped.length === 2 || solved.includes(idx) || flipped.includes(idx)) return;
    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      if (cards[newFlipped[0]].content === cards[newFlipped[1]].content) { setSolved([...solved, ...newFlipped]); setFlipped([]); }
      else setTimeout(() => setFlipped([]), 800);
    }
  };

  useEffect(() => {
    if (solved.length === cards.length && cards.length > 0) {
      if (bestMoves === 0 || moves < bestMoves) {
        AsyncStorage.setItem('@ADHD_match_best', moves.toString());
        setBestMoves(moves);
        setShowReward(true);
      } else {
        Alert.alert('Perfect Match!', `You matched all tasks in ${moves} moves! (+10 XP, +25 Pts)`, [{ text: 'Great!', onPress: () => { addReward(25, 10); onBack(); } }]);
      }
    }
  }, [solved]);

  const handleRewardClaim = (pts, xp) => {
    addReward(pts, xp);
    setShowReward(false);
    onBack();
  };

  return (
    <View style={hubStyles.gameWrapper}>
      <View style={styles.header}><TouchableOpacity onPress={onBack}><Ionicons name="arrow-back" size={24} color={colors.textSecondary}/></TouchableOpacity><Text style={styles.headerTitle}>Match</Text></View>
      <View style={hubStyles.matchGrid}>
        {cards.map((c, i) => {
          const shown = flipped.includes(i) || solved.includes(i);
          return (
            <TouchableOpacity key={i} style={[hubStyles.matchCard, shown && { backgroundColor: colors.primary }]} onPress={() => handleFlip(i)}>
              {shown ? (
                <Text style={hubStyles.matchCardText} numberOfLines={3}>{c.content}</Text>
              ) : (
                <Ionicons name="help" size={24} color="#ccc"/>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={hubStyles.matchFooter}>
        <Text style={hubStyles.matchStats}>Moves: {moves}</Text>
        <Text style={hubStyles.matchBest}>Best: {bestMoves === 0 ? '--' : bestMoves}</Text>
      </View>
      <RecordDiceModal visible={showReward} colors={colors} onReward={handleRewardClaim} />
    </View>
  );
}

function LockedGamesView({ tasks, colors }) {
  const navigation = useNavigation();
  const lowEffortTasks = tasks
    .filter(t => t.energy === 'low' && t.status !== 'done' && t.status !== 'did_my_best')
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="game-controller-outline" size={24} color={colors.primary}/>
          <Text style={styles.headerTitle}>Games Hub</Text>
        </View>
      </View>
      
      <ScrollView contentContainerStyle={[styles.scrollContent, { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }]}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="lock-closed" size={48} color={colors.primary} />
        </View>
        
        <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 }}>
          Games are Locked
        </Text>
        
        <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 30 }}>
          Earn your playtime! Complete any <Text style={{ color: colors.primary, fontWeight: '800' }}>Low Effort</Text> task to unlock all games for 1 hour.
        </Text>

        <View style={{ width: '100%', gap: 12, marginBottom: 40 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 }}>
            Suggested Tasks
          </Text>
          {lowEffortTasks.length > 0 ? (
            lowEffortTasks.map(t => (
              <TouchableOpacity 
                key={t.id} 
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f3f4f6', gap: 12 }}
                onPress={() => navigation.navigate('Tasks')}
              >
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flash" size={16} color="#10b981" />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
                  {t.title}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 14, color: colors.textMuted, fontStyle: 'italic' }}>No low effort tasks available.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={{ backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }}
          onPress={() => navigation.navigate('Tasks')}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Go to Tasks</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default function GamesScreen() {
  const { colors } = useTheme();
  const { tasks, gamesUnlockEndTime } = useTasks();
  const [currentGame, setCurrentGame] = useState('hub');
  const scrollRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const handleScroll = (event) => setShowScrollTop(event.nativeEvent.contentOffset.y > 300);

  // Unlock logic
  const isUnlocked = gamesUnlockEndTime > Date.now();

  useEffect(() => {
    if (!isUnlocked) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = gamesUnlockEndTime - now;
      if (remaining <= 0) {
        setTimeLeft('');
        clearInterval(interval);
      } else {
        const m = Math.floor(remaining / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        setTimeLeft(`${m}:${String(s).padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isUnlocked, gamesUnlockEndTime]);

  if (currentGame === 'war') return <WarGame onBack={() => setCurrentGame('hub')} tasks={tasks} colors={colors} />;
  if (currentGame === 'breather') return <FocusBreather onBack={() => setCurrentGame('hub')} colors={colors} />;
  if (currentGame === 'match') return <DopamineMatch onBack={() => setCurrentGame('hub')} colors={colors} tasks={tasks} />;
  if (currentGame === 'ramp') return <EnergyRamp onBack={() => setCurrentGame('hub')} colors={colors} tasks={tasks} />;

  if (!isUnlocked) {
    return <LockedGamesView tasks={tasks} colors={colors} />;
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="game-controller-outline" size={24} color={colors.primary}/>
            <Text style={styles.headerTitle}>Games Hub</Text>
          </View>
          {isUnlocked && timeLeft && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, gap: 6 }}>
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] }}>{timeLeft}</Text>
            </View>
          )}
        </View>
        <View style={hubStyles.hubGrid}>
          <TouchableOpacity style={hubStyles.hubCard} onPress={() => setCurrentGame('war')}>
            <View style={[hubStyles.hubIcon, { backgroundColor: '#ede9fe' }]}><Ionicons name="flash" size={24} color="#6366f1"/></View>
            <View style={hubStyles.hubInfo}><Text style={hubStyles.hubTitle}>Task War</Text><Text style={hubStyles.hubDesc}>Battle the AI with your tasks. Winner takes the cards!</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#ccc"/>
          </TouchableOpacity>
          <TouchableOpacity style={hubStyles.hubCard} onPress={() => setCurrentGame('breather')}>
            <View style={[hubStyles.hubIcon, { backgroundColor: '#d1fae5' }]}><Ionicons name="leaf" size={24} color="#10b981"/></View>
            <View style={hubStyles.hubInfo}><Text style={hubStyles.hubTitle}>Focus Breather</Text><Text style={hubStyles.hubDesc}>Calm your mind before a big task with guided breathing.</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#ccc"/>
          </TouchableOpacity>
          <TouchableOpacity style={hubStyles.hubCard} onPress={() => setCurrentGame('match')}>
            <View style={[hubStyles.hubIcon, { backgroundColor: '#fef3c7' }]}><Ionicons name="extension-puzzle" size={24} color="#f59e0b"/></View>
            <View style={hubStyles.hubInfo}><Text style={hubStyles.hubTitle}>Dopamine Match</Text><Text style={hubStyles.hubDesc}>Quick memory game for a mental jumpstart.</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#ccc"/>
          </TouchableOpacity>
          <TouchableOpacity style={hubStyles.hubCard} onPress={() => setCurrentGame('ramp')}>
            <View style={[hubStyles.hubIcon, { backgroundColor: '#dcfce7' }]}><Ionicons name="trending-up" size={24} color="#22c55e"/></View>
            <View style={hubStyles.hubInfo}><Text style={hubStyles.hubTitle}>Energy Ramp</Text><Text style={hubStyles.hubDesc}>Overcome time blindness by ramping up task difficulty.</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#ccc"/>
          </TouchableOpacity>
        </View>

        <View style={hubStyles.logoContainer}>
          <Image source={require('../../assets/logo.png')} style={hubStyles.footerLogo} resizeMode="contain" />
        </View>
      </ScrollView>
      {showScrollTop && <ScrollToTop scrollRef={scrollRef} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 12 : 20, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  resetBtnText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  card: { width: CARD_W, height: CARD_H, borderRadius: 10, borderWidth: 1, padding: 6, justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  cardSmall: { width: (SCREEN_W - 80) / 4, height: ((SCREEN_W - 80) / 4) * 1.4, padding: 4 },
  cardLarge: { width: BATTLE_W, height: BATTLE_H, padding: 12 },
  cardBack: { backgroundColor: '#ffffff', borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardBackPattern: { alignItems: 'center', justifyContent: 'center' },
  cardRankTop: { position: 'absolute', top: 4, left: 6 },
  cardRankBottom: { position: 'absolute', bottom: 4, right: 6 },
  cardRankText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  cardCenterContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  cardTitle: { fontSize: 11, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  cardStars: { fontSize: 8, textAlign: 'right' },
  emptySlot: { borderColor: '#e5e7eb', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { color: colors.textMuted, fontSize: 12 },
  setupContainer: { padding: 20, paddingTop: 8 },
  phaseTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  phaseHint: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  setupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  rowLabel: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  rowLabelText: { fontSize: 13, fontWeight: '700' },
  shuffleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, marginTop: 16, elevation: 5 },
  shuffleBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  battleContainer: { padding: 20, paddingTop: 8 },
  scoreBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  scoreItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  scoreBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  scoreBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  vsText: { fontSize: 16, fontWeight: '800', color: colors.textMuted },
  warStakeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 8, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: '#fecaca' },
  warStakeText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  battleField: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10, width: '100%' },
  battleSide: { width: '100%', alignItems: 'center', justifyContent: 'center', height: BATTLE_H + 20 },
  sideLabelWrapper: { width: 85, alignItems: 'flex-start' },
  sideLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  battleCenter: { alignItems: 'center', justifyContent: 'center', height: 40, zIndex: 10 },
  warBadge: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  warBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  warCardsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  warCardsStack: { flexDirection: 'row', width: 40, height: 30 },
  warMiniCard: { position: 'absolute', width: 22, height: 30, backgroundColor: '#ffffff', borderRadius: 4, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  warMiddleText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  actionArea: { alignItems: 'center', minHeight: 120 },
  warButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ef4444', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 14, elevation: 5 },
  warButtonText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  resultActions: { alignItems: 'center', gap: 10, width: '100%' },
  resultText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  collectBtn: { backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  collectBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  taskPrompt: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  taskCard: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, borderWidth: 1.5, borderColor: '#fbbf24', width: '100%' },
  taskCardText: { fontSize: 16, fontWeight: '600', color: '#92400e', textAlign: 'center' },
  stealRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  doTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#059669', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  doTaskBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  forfeitBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  forfeitBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  warAnnounce: { fontSize: 20, fontWeight: '800', color: '#ef4444' },
  winContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  winEmoji: { fontSize: 64 },
  winTitle: { fontSize: 32, fontWeight: '800', color: colors.textPrimary },
  winSub: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  playAgainBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 16 },
  playAgainText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 16, textAlign: 'center' },
  emptySub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 22 },

  // Shuffling
  shufflingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 650 },
  shufflingTitle: { fontSize: 20, fontWeight: '900', color: '#8b5cf6', marginBottom: 60, textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center' },
  shufflingField: { position: 'relative', width: 240, height: 336, alignItems: 'center', justifyContent: 'center' },
  shufflingCard: { position: 'absolute' },
});

const hubStyles = StyleSheet.create({
  gameWrapper: { flex: 1 },
  hubGrid: { padding: 20, gap: 16 },
  hubCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  hubIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hubInfo: { flex: 1, gap: 2 },
  hubTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  hubDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  breatherContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  breathCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, position: 'absolute' },
  breathPhase: { fontSize: 24, fontWeight: '800', letterSpacing: 1, marginTop: 20 },
  breathSeconds: { fontSize: 48, fontWeight: '900', color: colors.textPrimary },
  zenDoneBtn: { position: 'absolute', bottom: 110, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  zenDoneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  matchGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 20, gap: 10, justifyContent: 'center', marginTop: 20 },
  matchCard: { width: (SCREEN_W - 80) / 4, height: (SCREEN_W - 80) / 4, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 4 },
  matchCardText: { fontSize: 8, fontWeight: '700', color: '#fff', textAlign: 'center' },
  matchStats: { fontSize: 16, fontWeight: '700', color: '#111827' },
  matchBest: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  matchFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, marginTop: 20 },
  logoContainer: { alignItems: 'center', marginTop: 40, marginBottom: 80, opacity: 1, transform: [{ translateX: -5 }, { translateY: 60 }] },
  footerLogo: { width: SCREEN_W * 0.8, height: SCREEN_W * 0.4 },
});
