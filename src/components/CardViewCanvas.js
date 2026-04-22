import React, { useRef, useMemo, Suspense } from 'react';
import { View, PanResponder, useWindowDimensions, Platform } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { PerspectiveCamera } from '@react-three/drei/native';
import { useGLTF } from '@react-three/drei/native';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import TaskCard3D from './TaskCard3D';

const resolveAsset = (mod) => {
  if (Platform.OS === 'web' && typeof mod === 'number') return Asset.fromModule(mod).uri || mod;
  return mod;
};

const CARD_FOV = 60;
const CAMERA_Z = 5;

// ── Inner scene ───────────────────────────────────────────────────────────────

function CardScene({ tasks, rawScrollPx, flippedCards, onOpen, onHistory, onConfirmStatus, onFlipCard }) {
  const worldRef = useRef();
  const { viewport } = useThree();

  // Measure actual card mesh width at scale=1
  const { scene: glbScene } = useGLTF(resolveAsset(require('../../assets/playing_cards.glb')));
  const naturalCardW = useMemo(() => {
    if (!glbScene) return null;
    let mesh = null;
    glbScene.traverse(c => { if (c.isMesh && c.name === 'base_card1_Guzma_0') mesh = c; });
    if (!mesh) return null;
    const box = new THREE.Box3().setFromObject(mesh);
    return box.getSize(new THREE.Vector3()).x;
  }, [glbScene]);

  // Card fills ~65% of viewport height
  const cardH    = viewport.height * 0.65;
  const cardW    = cardH / 1.4;
  const spacing  = cardW * 1.25; // gap between card centers

  const PRIMITIVE_SCALE = 1.4;
  const cardScale = naturalCardW
    ? cardW / (naturalCardW * PRIMITIVE_SCALE)
    : cardW / 1.44;

  // Max horizontal scroll (world units): show last card centered
  const maxScroll = Math.max(0, (tasks.length - 1) * spacing);

  useFrame(() => {
    if (!worldRef.current) return;
    // Swipe left = positive rawScrollPx = world moves left (negative X)
    const scrolled = Math.max(0, Math.min(maxScroll, rawScrollPx.current / viewport.factor));
    worldRef.current.position.x = -scrolled;
  });

  return (
    <group ref={worldRef}>
      {tasks.map((task, i) => (
        <Suspense key={task.id} fallback={null}>
          <TaskCard3D
            task={task}
            position={[i * spacing, 0, 0]}
            cardScale={cardScale}
            spinning
            isFlipped={flippedCards ? flippedCards.has(task.id) : false}
            onPress={() => onOpen && onOpen(task)}
            onFlip={() => onFlipCard && onFlipCard(task.id)}
            onHistoryPress={() => onHistory && onHistory(task)}
            onConfirmStatus={onConfirmStatus}
          />
        </Suspense>
      ))}
    </group>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export default function CardViewCanvas({
  tasks = [],
  flippedCards,
  onOpen,
  onHistory,
  onConfirmStatus,
  onFlipCard,
  style,
}) {
  const { height } = useWindowDimensions();

  const rawScrollPx  = useRef(0);
  const lastScrollPx = useRef(0);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => {
      lastScrollPx.current = rawScrollPx.current;
    },
    onPanResponderMove: (_, gs) => {
      // Swipe left (gs.dx < 0) increases scroll (reveals next cards)
      rawScrollPx.current = Math.max(0, lastScrollPx.current - gs.dx);
    },
  }), []);

  return (
    <View
      style={[{ width: '100%', height: height * 0.78 }, style]}
      {...panResponder.panHandlers}
    >
      <Canvas style={{ flex: 1 }} alpha legacy samples={0}>
        <PerspectiveCamera
          makeDefault
          position={[0, 0, CAMERA_Z]}
          fov={CARD_FOV}
          near={0.1}
          far={100}
        />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 5]} intensity={1} />

        <CardScene
          tasks={tasks}
          rawScrollPx={rawScrollPx}
          flippedCards={flippedCards}
          onOpen={onOpen}
          onHistory={onHistory}
          onConfirmStatus={onConfirmStatus}
          onFlipCard={onFlipCard}
        />
      </Canvas>
    </View>
  );
}
