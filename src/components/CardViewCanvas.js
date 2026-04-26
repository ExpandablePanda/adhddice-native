import React, { useRef, useMemo, useState, useCallback, Suspense } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { PerspectiveCamera, ContactShadows, useGLTF } from '@react-three/drei/native';
import { useAssets } from 'expo-asset';
import * as THREE from 'three';
import TaskCard3D from './TaskCard3D';
import { useTheme } from '../lib/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import IconSetStatusMenu from './IconSetStatusMenu';

const CARD_FOV    = 60;
const CAMERA_Z    = 5;
const ANIM_SECS   = 0.5;
const EXPLODE_SECS = 0.45;
const FALL_SECS    = 0.65;
const MAX_STACK   = 5;

const GLB_MODULE  = require('../../assets/playing_cards.glb');
const LOGO_MODULE = require('../../assets/logo.png');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function SceneBackground({ isDark }) {
  const color1 = isDark ? '#020617' : '#f8fafc';
  const color2 = isDark ? '#1e1b4b' : '#e2e8f0';

  return (
    <mesh position={[0, 0, -10]} scale={[50, 50, 1]}>
      <planeGeometry />
      <shaderMaterial
        attach="material"
        uniforms={{
          uColor1: { value: new THREE.Color(color1) },
          uColor2: { value: new THREE.Color(color2) },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          void main() {
            float d = distance(vUv, vec2(0.5));
            gl_FragColor = vec4(mix(uColor2, uColor1, d), 1.0);
          }
        `}
      />
    </mesh>
  );
}

// ── Animates a card between Deck and Active positions ────────────────────────

function MovingCard({ task, state, progress, fromX, toX, cardScale, glbUri, logoUri }) {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;
    const p = Math.max(0, Math.min(1, progress.current));
    
    if (state === 'DRAWING') {
      // Deck -> Active (Slide right + flip)
      groupRef.current.position.x = THREE.MathUtils.lerp(fromX, toX, p);
      groupRef.current.position.z = Math.sin(p * Math.PI) * 1.5 + 0.1; // Arc up
      groupRef.current.rotation.y = THREE.MathUtils.lerp(Math.PI, Math.PI * 2, p);
    } else if (state === 'RETURNING') {
      // Active -> Deck (Flip back + slide left UNDERNEATH)
      // Use a deeper arc (-1.5 instead of -0.8) to clear the deck
      const arcZ = -Math.sin(p * Math.PI) * 1.5 - 0.5;
      groupRef.current.position.x = THREE.MathUtils.lerp(toX, fromX, p);
      groupRef.current.position.z = arcZ;
      // Reverse the rotation direction to 'swing' away and under
      groupRef.current.rotation.y = THREE.MathUtils.lerp(Math.PI * 2, Math.PI * 3, p);
      // Add a slight tilt to make it look like it's diving under
      groupRef.current.rotation.z = Math.sin(p * Math.PI) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      <TaskCard3D
        task={task}
        position={[0, 0, 0]}
        cardScale={cardScale}
        isFlipped={false}
        spinning={false}
        interactive={false}
        skipInternalAnimation
        glbUri={glbUri}
        logoUri={logoUri}
      />
    </group>
  );
}

// ── Cards explode outward from the deck ──────────────────────────────────────

function ExplodingCard({ task, idx, total, cardScale, progress, glbUri, logoUri }) {
  const groupRef = useRef();
  const vec = useMemo(() => {
    const angle = (idx / Math.max(total, 1)) * Math.PI * 2;
    const r = 2.5 + (idx % 3) * 0.6;
    return {
      dx: Math.cos(angle) * r,
      dy: Math.sin(angle) * r * 0.7 + 1.2,
      dz: (idx % 2 === 0 ? 1.0 : -0.4),
      drz: Math.cos(angle + 0.8) * Math.PI,
    };
  }, [idx, total]);

  useFrame(() => {
    if (!groupRef.current) return;
    const p = progress.current;
    const e = p * (2 - p); // ease-in-out
    groupRef.current.position.x = vec.dx * e;
    groupRef.current.position.y = vec.dy * e;
    groupRef.current.position.z = vec.dz * e;
    groupRef.current.rotation.y = Math.PI + Math.PI * p;
    groupRef.current.rotation.z = vec.drz * e;
  });

  return (
    <group ref={groupRef}>
      <TaskCard3D task={task} position={[0,0,0]} cardScale={cardScale}
        isFlipped interactive={false} skipInternalAnimation glbUri={glbUri} logoUri={logoUri} />
    </group>
  );
}

// ── Chosen card falls from above, face-up ────────────────────────────────────

function FallingCard({ task, activeX, cardScale, progress, glbUri, logoUri }) {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;
    const p = progress.current;
    const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
    groupRef.current.position.x = activeX;
    groupRef.current.position.y = THREE.MathUtils.lerp(9, 0, ease);
    groupRef.current.position.z = 0.5;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(Math.PI, Math.PI * 2, p);
    groupRef.current.rotation.z = Math.sin(p * Math.PI) * 0.12;
  });

  return (
    <group ref={groupRef}>
      <TaskCard3D task={task} position={[0,0,0]} cardScale={cardScale}
        isFlipped={false} interactive={false} skipInternalAnimation glbUri={glbUri} logoUri={logoUri} />
    </group>
  );
}

// ── The 3D scene: Single deck + active card ──────────────────────────────────

function DeckScene({
  tasks, activeIdx, animState, progress,
  onDraw, onReturn, onOpen, onHistory, onConfirmStatus, onPrizePress, onOsaat,
  glbUri, logoUri, isDark,
}) {
  const { viewport } = useThree();
  const { scene: glbScene } = useGLTF(glbUri);

  const naturalCardW = useMemo(() => {
    if (!glbScene) return null;
    let mesh = null;
    glbScene.traverse(c => { if (c.isMesh && c.name === 'base_card1_Guzma_0') mesh = c; });
    if (!mesh) return null;
    return new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).x;
  }, [glbScene]);

  const cardH     = viewport.height * 0.75;
  const cardW     = cardH / 1.4;
  const cardScale = naturalCardW ? cardW / (naturalCardW * 1.4) : cardW / 1.44;
  
  const deckX     = -cardW * 0.25; // Adjusted right slightly
  const activeX   = cardW * 0.15;  // Balanced overlap

  useFrame((state, delta) => {
    const durMap = { EXPLODING: EXPLODE_SECS, FALLING: FALL_SECS, RETURNING: ANIM_SECS };
    const dur = durMap[animState];
    if (dur) progress.current = Math.min(1, progress.current + delta / dur);

    // Parallax
    const targetX = state.pointer.x * 0.3;
    const targetY = state.pointer.y * 0.15;
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  // Split tasks into Deck vs Active
  const activeTask = activeIdx !== null ? tasks[activeIdx] : null;

  // During explosion, we want the "drawn" card to be part of the scatter too
  const explosionStack = useMemo(() => {
    if (animState !== 'EXPLODING') return deckStack;
    return [...tasks].slice(0, MAX_STACK).reverse();
  }, [tasks, deckStack, animState]);

  return (
    <>
      <SceneBackground isDark={isDark} />
      <ContactShadows position={[0, -cardH * 0.52, 0]} opacity={0.4} scale={10} blur={2.5} far={2} />

      {/* ── Deck Pile — hidden during explosion/fall ── */}
      {animState !== 'EXPLODING' && animState !== 'FALLING' && (
        <group position={[deckX, 0, 0]}>
          {deckStack.map((task, i) => {
            const depth = i * 0.01;
            const isTop = i === deckStack.length - 1;
            return (
              <TaskCard3D
                key={task.id}
                task={task}
                position={[0, -depth * 0.5, depth]}
                cardScale={cardScale}
                isFlipped
                interactive={false}
                onFlip={isTop && animState === 'IDLE' ? onDraw : undefined}
                glbUri={glbUri}
                logoUri={logoUri}
              />
            );
          })}
        </group>
      )}

      {/* ── Active Card ── */}
      {activeTask && animState === 'IDLE' && (
        <group position={[activeX, 0, 0.5]}>
          <TaskCard3D
            task={activeTask}
            position={[0, 0, 0]}
            cardScale={cardScale}
            isFlipped={false}
            interactive
            onPress={() => onOpen && onOpen(activeTask)}
            onFlip={onReturn}
            onHistoryPress={() => onHistory && onHistory(activeTask)}
            onConfirmStatus={onConfirmStatus}
            onPrizePress={onPrizePress}
            onOsaat={onOsaat ? () => onOsaat(activeTask) : undefined}
            glbUri={glbUri}
            logoUri={logoUri}
          />
        </group>
      )}

      {/* ── Explosion: ALL cards scatter (including the one being drawn) ── */}
      {animState === 'EXPLODING' && (
        <group position={[deckX, 0, 0]}>
          {explosionStack.map((task, i) => (
            <ExplodingCard key={task.id} task={task} idx={i} total={explosionStack.length}
              cardScale={cardScale} progress={progress} glbUri={glbUri} logoUri={logoUri} />
          ))}
        </group>
      )}

      {/* ── Fall: chosen card drops face-up ── */}
      {activeTask && animState === 'FALLING' && (
        <FallingCard task={activeTask} activeX={activeX} cardScale={cardScale}
          progress={progress} glbUri={glbUri} logoUri={logoUri} />
      )}

      {/* ── Return animation ── */}
      {activeTask && animState === 'RETURNING' && (
        <MovingCard task={activeTask} state={animState} progress={progress}
          fromX={deckX} toX={activeX} cardScale={cardScale} glbUri={glbUri} logoUri={logoUri} />
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CardViewCanvas({ tasks = [], onOpen, onHistory, onConfirmStatus, onPrizePress, onOsaat, style }) {
  const { isDark } = useTheme();
  const [assets]   = useAssets(Platform.OS === 'web' ? [GLB_MODULE, LOGO_MODULE] : []);
  const glbUri     = Platform.OS === 'web' ? assets?.[0]?.uri : GLB_MODULE;
  const logoUri    = Platform.OS === 'web' ? assets?.[1]?.uri : LOGO_MODULE;

  const [deck, setDeck]           = useState(() => shuffle(tasks));
  const [activeIdx, setActiveIdx] = useState(null);
  const [animState, setAnimState] = useState('IDLE');
  const animProgress = useRef(0);
  const [pickerTask, setPickerTask] = useState(null);
  const [pendingNext, setPendingNext] = useState(false);
  const tasksRef = useRef(tasks);

  // Sync deck when tasks change externally
  React.useEffect(() => {
    if (tasks !== tasksRef.current) {
      setDeck(prev => {
        // Keep active task if it's still in the new tasks list
        const activeId = activeIdx !== null ? prev[activeIdx]?.id : null;
        const newDeck = shuffle(tasks);
        if (activeId) {
          const newIdx = newDeck.findIndex(t => t.id === activeId);
          if (newIdx !== -1) setActiveIdx(newIdx);
        }
        return newDeck;
      });
      tasksRef.current = tasks;
    }
  }, [tasks, activeIdx]);

  const onReturn = useCallback((andDrawNext = false) => {
    if (animState !== 'IDLE' || activeIdx === null) return;
    if (andDrawNext) setPendingNext(true);
    animProgress.current = 0;
    setAnimState('RETURNING');
    setTimeout(() => {
      setDeck(prev => {
        const next = [...prev];
        const [removed] = next.splice(activeIdx, 1);
        next.push(removed);
        return next;
      });
      setActiveIdx(null);
      setAnimState('IDLE');
    }, ANIM_SECS * 1000 + 50);
  }, [animState, activeIdx]);

  const onDraw = useCallback(() => {
    if (animState !== 'IDLE') return;
    if (activeIdx !== null) { onReturn(true); return; }

    // Phase 1: deck explodes
    animProgress.current = 0;
    setActiveIdx(0);
    setAnimState('EXPLODING');

    // Phase 2: chosen card falls face-up
    setTimeout(() => {
      animProgress.current = 0;
      setAnimState('FALLING');
      // Phase 3: settle into IDLE
      setTimeout(() => {
        setAnimState('IDLE');
      }, FALL_SECS * 1000 + 50);
    }, EXPLODE_SECS * 1000);
  }, [animState, activeIdx, onReturn]);

  // Handle auto-cycle chaining
  React.useEffect(() => {
    if (animState === 'IDLE' && activeIdx === null && pendingNext) {
      setPendingNext(false);
      onDraw();
    }
  }, [animState, activeIdx, pendingNext, onDraw]);

  const onReshuffle = useCallback(() => {
    if (animState !== 'IDLE') return;
    setDeck(shuffle([...tasks]));
    setActiveIdx(null);
  }, [tasks, animState]);

  if (Platform.OS === 'web' && !glbUri) return null;
  if (tasks.length === 0) {
    return (
      <View style={[{ height: 540, paddingVertical: 20, backgroundColor: isDark ? '#020617' : '#f8fafc', alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: 16, fontWeight: '600' }}>No tasks found for this view</Text>
      </View>
    );
  }

  return (
    <View style={[{ height: 540, paddingVertical: 20, backgroundColor: isDark ? '#020617' : '#f8fafc' }, style]}>
      <IconSetStatusMenu 
        visible={!!pickerTask}
        task={pickerTask}
        onClose={() => setPickerTask(null)}
        onConfirm={(task, key) => {
          onConfirmStatus(task.id, key);
        }}
      />
      <Canvas style={{ flex: 1 }} gl={{ clearColor: isDark ? '#020617' : '#f8fafc' }} legacy samples={0}>
        <PerspectiveCamera makeDefault position={[0, 0, CAMERA_Z]} fov={CARD_FOV} />
        <ambientLight intensity={isDark ? 0.6 : 1.0} />
        <spotLight position={[5, 10, 5]} angle={0.25} penumbra={1} intensity={isDark ? 1.5 : 1.0} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        
        <Suspense fallback={null}>
          <DeckScene
            tasks={deck}
            activeIdx={activeIdx}
            animState={animState}
            progress={animProgress}
            onDraw={onDraw}
            onReturn={onReturn}
            onOpen={onOpen}
            onHistory={onHistory}
            onConfirmStatus={(tid, key) => {
              const t = tasks.find(x => x.id === tid);
              if (t) setPickerTask(t);
            }}
            onPrizePress={onPrizePress}
            onOsaat={onOsaat}
            glbUri={glbUri}
            logoUri={logoUri}
            isDark={isDark}
          />
        </Suspense>
      </Canvas>

      <View style={styles.floatingBar}>
        <Text style={styles.progressText}>
          {activeIdx === null ? deck.length : deck.length - 1} LEFT
        </Text>
        <View style={styles.barDivider} />
        <TouchableOpacity style={styles.actionBtn} onPress={onReshuffle} disabled={animState !== 'IDLE'}>
          <Ionicons name="shuffle" size={18} color="#fff" />
          <Text style={styles.actionTxt}>Reshuffle</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    transform: [{ translateX: -100 }],
    width: 200,
    height: 54,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  progressText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 65,
  },
  barDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
