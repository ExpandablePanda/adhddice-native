import React, { useRef, useMemo } from 'react';
import { Linking } from 'react-native';
import { useFrame, useLoader } from '@react-three/fiber/native';
import { useGLTF, useTexture } from '@react-three/drei/native';
import * as THREE from 'three';
import { STATUSES, calculateTaskStreak, calculateTaskMissedStreak } from '../lib/TasksContext';
import { useEconomy } from '../lib/EconomyContext';

const ENERGY = {
  low:    { label: 'Low',    color: '#10b981', bg: '#d1fae5' },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7' },
  high:   { label: 'High',   color: '#ef4444', bg: '#fee2e2' },
};

function lightenColor(hex, amount = 0.85) {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color('#ffffff'), amount);
}

const ICON_MAP = {
  'footsteps-outline': '👣',
  'calendar-outline':  '📅',
  'time-outline':      '⏳',
  'play-outline':      '▶️',
  'star-outline':      '⭐',
  'close-circle-outline': '❌',
  'checkmark-circle-outline': '✅',
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x, y + radius);
  shape.lineTo(x, y + height - radius);
  shape.quadraticCurveTo(x, y + height, x + radius, y + height);
  shape.lineTo(x + width - radius, y + height);
  shape.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
  shape.lineTo(x + width, y + radius);
  shape.quadraticCurveTo(x + width, y, x + width - radius, y);
  shape.lineTo(x + radius, y);
  shape.quadraticCurveTo(x, y, x, y + radius);
  return shape;
}

const maskUrl = (text, w, h) =>
  `https://placehold.co/${w}x${h}/000000/FFFFFF.png?text=${encodeURIComponent(text)}&font=montserrat`;

const DUMMY_URL = 'https://placehold.co/10x10/000000/000000.png';

const chipW = (text, pad = 0.2) => Math.max(0.28, text.length * 0.045 + pad);

// ── Chip component ────────────────────────────────────────────────────────────

function Chip({ position, width, height, color, maskTexture, onPress, textColor, backgroundColor, borderColor }) {
  const radius = 0.03; // Rectangular look
  const shape = useMemo(
    () => createRoundedRectShape(width, height, radius),
    [width, height]
  );
  
  const borderSize = 0.015;
  const borderShape = useMemo(
    () => createRoundedRectShape(width + borderSize, height + borderSize, radius + borderSize/2),
    [width, height]
  );

  const handlePress = onPress
    ? (e) => { e.stopPropagation(); onPress(); }
    : undefined;

  // Ensure colors are linear for Three.js
  const finalBorderColor = useMemo(() => new THREE.Color(borderColor || color).convertSRGBToLinear(), [borderColor, color]);
  const finalBgColor = useMemo(() => new THREE.Color(backgroundColor || '#ffffff').convertSRGBToLinear(), [backgroundColor]);
  const finalTextColor = useMemo(() => new THREE.Color(textColor || color).convertSRGBToLinear(), [textColor, color]);

  return (
    <group position={position}>
      {/* Border mesh */}
      <mesh onClick={handlePress}>
        <shapeGeometry args={[borderShape]} />
        <meshBasicMaterial color={finalBorderColor} />
      </mesh>
      {/* Background mesh */}
      <mesh position={[0, 0, 0.005]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial 
          color={finalBgColor} 
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      {/* Text mesh */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color={finalTextColor}
          alphaMap={maskTexture}
          transparent={false}
          alphaTest={0.5}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskCard3D({
  task,
  position = [0, 0, 0],
  cardScale = 1,
  isFlipped = false,
  spinning = false,
  interactive = true,
  skipInternalAnimation = false,
  onPress,
  onFlip,
  onHistoryPress,
  onConfirmStatus,
  onPrizePress,
  glbUri,
  logoUri,
}) {
  const groupRef  = useRef();
  const flipRef   = useRef(isFlipped ? Math.PI : 0);
  const spinRef   = useRef(0);

  const { scene }    = useGLTF(glbUri  ?? require('../../assets/playing_cards.glb'));
  const iconTexture  = useTexture(logoUri ?? require('../../assets/logo.png'));
  const { economy }  = useEconomy();

  // ── Task data ─────────────────────────────────────────────────────────────
  const rawTitle      = (task?.title || 'Untitled').toUpperCase();
  const titleWords    = rawTitle.split(' ');
  const isMultiLine   = titleWords.length > 3 || rawTitle.length > 12;
  
  let line1 = rawTitle;
  let line2 = '';

  if (isMultiLine) {
    const mid = Math.ceil(titleWords.length / 2);
    line1 = titleWords.slice(0, mid).join(' ');
    line2 = titleWords.slice(mid).join(' ');
  }
  const taskId      = task?.id     || '—';
  const status      = task?.status || 'pending';
  const energy      = task?.energy ?? null;
  const tags        = task?.tags   || [];
  const dueDate     = task?.dueDate || null;
  const link        = task?.link    || null;
  const linkTitle   = task?.linkTitle || null;
  const statusHist  = task?.statusHistory || {};

  const statusInfo   = STATUSES[status] || STATUSES.pending;
  const statusLabel  = `${ICON_MAP[statusInfo.icon] || ''} ${statusInfo.label}`.toUpperCase();
  const nextStatus   = statusInfo.next;

  // Convert sRGB hex → linear so colors match React Native UI in legacy canvas mode
  const statusColor  = useMemo(
    () => new THREE.Color(statusInfo.color).convertSRGBToLinear(),
    [statusInfo.color]
  );
  const streakColorLinear  = useMemo(() => new THREE.Color('#f59e0b').convertSRGBToLinear(), []);
  const missedColorLinear  = useMemo(() => new THREE.Color('#ef4444').convertSRGBToLinear(), []);

  const streak       = calculateTaskStreak(statusHist);
  const missedStreak = calculateTaskMissedStreak(statusHist);

  const dueDateLabel = dueDate
    ? `DUE ${dueDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3')}`
    : null;

  const energyInfo   = energy != null ? (ENERGY[energy] || null) : null;
  const energyLabel  = energyInfo ? energyInfo.label.toUpperCase() : null;

  const streakLabel = streak > 0
    ? `🔥 HOT STREAK ${streak}`
    : missedStreak > 0 ? `💀 MISSED STREAK ${missedStreak}` : null;
  const streakColor = streak > 0 ? streakColorLinear : missedColorLinear;

  const vault = economy.vaultPrizes || [];
  const lockedPrize = vault.find(p => (p.linkedTaskIds || []).includes(String(task?.id)) && p.status === 'locked');
  const unlockedPrize = vault.find(p => (p.linkedTaskIds || []).includes(String(task?.id)) && p.status === 'unlocked');
  
  const prizeLabel = lockedPrize ? '🔒 PRIZE LOCKED' : (unlockedPrize ? '🎁 PRIZE UNLOCKED!' : null);
  const prizeColor = lockedPrize ? '#ef4444' : '#059669';
  const prizeBg    = lockedPrize ? '#fee2e2' : '#d1fae5';

  // ── Textures (all unconditional — no conditional hooks) ───────────────────
  const statusMaskTex  = useLoader(THREE.TextureLoader, maskUrl(statusLabel.toUpperCase(), 400, 100));
  const title1MaskTex  = useLoader(THREE.TextureLoader, maskUrl(line1, 800, 200));
  const title2MaskTex  = useLoader(THREE.TextureLoader, line2 ? maskUrl(line2, 800, 200) : DUMMY_URL);
  const historyMaskTex = useLoader(THREE.TextureLoader, maskUrl('HISTORY', 300, 100));
  const dueMaskTex     = useLoader(THREE.TextureLoader, dueDateLabel  ? maskUrl(dueDateLabel, 500, 100)  : DUMMY_URL);
  const energyMaskTex  = useLoader(THREE.TextureLoader, energyLabel   ? maskUrl(energyLabel, 300, 100)   : DUMMY_URL);
  const streakMaskTex  = useLoader(THREE.TextureLoader, streakLabel   ? maskUrl(streakLabel, 300, 100)   : DUMMY_URL);
  const prizeMaskTex   = useLoader(THREE.TextureLoader, prizeLabel    ? maskUrl(prizeLabel, 400, 100)    : DUMMY_URL);
  const linkLabel      = `${linkTitle || 'LINK'} 🔗`.toUpperCase();
  const linkMaskTex    = useLoader(THREE.TextureLoader, link          ? maskUrl(linkLabel, 400, 100)     : DUMMY_URL);

  const tagUrls         = tags.length > 0 ? tags.map(t => maskUrl(t.toUpperCase(), 300, 100)) : [DUMMY_URL];
  const tagMaskTextures = useLoader(THREE.TextureLoader, tagUrls);

  useMemo(() => {
    const all = [statusMaskTex, title1MaskTex, title2MaskTex, historyMaskTex,
                 dueMaskTex, energyMaskTex, streakMaskTex, prizeMaskTex, linkMaskTex, ...tagMaskTextures];
    all.forEach(t => {
      if (t) { t.premultiplyAlpha = false; t.generateMipmaps = false; t.needsUpdate = true; }
    });
  }, [statusMaskTex, title1MaskTex, title2MaskTex, historyMaskTex,
      dueMaskTex, energyMaskTex, streakMaskTex, prizeMaskTex, linkMaskTex, tagMaskTextures]);

  // ── Clone card meshes from shared GLB ────────────────────────────────────
  const { frontCard, backCard } = useMemo(() => {
    if (!scene) return { frontCard: null, backCard: null };
    let front = null, back = null;
    scene.traverse(child => {
      if (!child.isMesh) return;
      if (child.name === 'base_card1_Guzma_0')    front = child.clone();
      if (child.name === 'base_card2_Lusamine_0') back  = child.clone();
    });
    if (front) front.material = new THREE.MeshPhysicalMaterial({ 
      color: statusColor,
      metalness: 0,
      roughness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.5
    });
    if (back)  back.material  = new THREE.MeshPhysicalMaterial({ 
      color: '#ffffff',
      metalness: 0,
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2
    });
    return { frontCard: front, backCard: back };
  }, [scene]); // clone once; color updated below

  // Keep front card color in sync with status (handles status changes without re-cloning)
  if (frontCard) frontCard.material.color.set(statusColor);

  // ── Flip animation ────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!groupRef.current || skipInternalAnimation) return;
    if (spinning) spinRef.current += delta * 0.4;
    const flipTarget = isFlipped ? Math.PI : 0;
    flipRef.current = THREE.MathUtils.lerp(flipRef.current, flipTarget, Math.min(1, delta * 6));
    groupRef.current.rotation.y = spinRef.current + flipRef.current;
  });

  if (!frontCard || !backCard) return null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const sW = chipW(statusLabel);
  const dW = dueDateLabel  ? chipW(dueDateLabel, 0.25)  : 0;
  const eW = energyLabel   ? chipW(energyLabel, 0.25)   : 0;
  const stW = streakLabel  ? chipW(streakLabel, 0.25)   : 0;
  const hW = chipW('HISTORY', 0.25);
  const prW = prizeLabel ? chipW(prizeLabel, 0.25) : 0;
  const lW = link ? chipW(linkLabel, 0.25) : 0;

  const tagsData = tags.length > 0
    ? tags.map((t, i) => ({ text: t, width: chipW(t), mask: tagMaskTextures[i] }))
    : [];
  const tagRowW = tagsData.length > 0
    ? tagsData.reduce((a, t) => a + t.width + 0.08, 0) - 0.08
    : 0;

  return (
    <group ref={groupRef} position={position} scale={[cardScale, cardScale, cardScale]}>

      {/* ── FRONT FACE ───────────────────────────────────────────────────── */}
      <group position={[0, 0, 0.01]}>

        {/* Card base — click anywhere on card body opens detail */}
        <primitive object={frontCard} scale={1.4} onClick={interactive ? onPress : undefined} />

        {/* Scaled front face content with corner spacing */}
        <group scale={[1.6, 1.6, 1]}>
          {/* ROW 1: Status (left, tappable) | Energy (right) */}
          <Chip
            position={[-0.9 + sW / 2, 1.1, 0.12]}
            width={sW} height={0.2}
            borderColor={statusInfo.color}
            backgroundColor={lightenColor(statusInfo.color, 0.9)}
            textColor={statusInfo.color}
            maskTexture={statusMaskTex}
            onPress={interactive ? () => onConfirmStatus && onConfirmStatus(task.id, nextStatus) : undefined}
          />
          {energyLabel && (
            <Chip
              position={[0.9 - eW / 2, 1.1, 0.12]}
              width={eW} height={0.2} 
              borderColor={energyInfo?.color || '#cbd5e1'}
              backgroundColor={energyInfo?.bg || '#f8fafc'}
              textColor={energyInfo?.color || '#64748b'}
              maskTexture={energyMaskTex}
            />
          )}

          {/* ROW 2: Due date (left) | Streak / missed streak (right) */}
          {dueDateLabel && (
            <Chip
              position={[-0.9 + dW / 2, 0.8, 0.12]}
              width={dW} height={0.2} 
              borderColor="#7dd3fc"
              backgroundColor="#e0f2fe"
              textColor="#0369a1"
              maskTexture={dueMaskTex}
            />
          )}
          {streakLabel && (
            <Chip
              position={[0.9 - stW / 2, 0.8, 0.12]}
              width={stW} height={0.2}
              borderColor={streak > 0 ? '#f59e0b' : '#ef4444'}
              backgroundColor={streak > 0 ? '#fef3c7' : '#fee2e2'}
              textColor={streak > 0 ? '#b45309' : '#b91c1c'}
              maskTexture={streakMaskTex}
            />
          )}

          {/* ROW 3: Prize (Center) */}
          {prizeLabel && (
            <Chip
              position={[0, 0.53, 0.12]}
              width={prW} height={0.2}
              borderColor={prizeColor}
              backgroundColor={prizeBg}
              textColor={prizeColor}
              maskTexture={prizeMaskTex}
              onPress={interactive ? onPrizePress : undefined}
            />
          )}

          {/* CENTER: Task title (multi-line support) */}
          <group position={[0, 0.2, 0.12]}>
            <mesh position={[0, line2 ? 0.2 : 0, 0]}>
              <planeGeometry args={[2.0, 0.5]} />
              <meshStandardMaterial color="#ffffff" alphaMap={title1MaskTex} transparent={false} alphaTest={0.5} roughness={0.3} />
            </mesh>
            {line2 && (
              <mesh position={[0, -0.2, 0]}>
                <planeGeometry args={[2.0, 0.5]} />
                <meshStandardMaterial color="#ffffff" alphaMap={title2MaskTex} transparent={false} alphaTest={0.5} roughness={0.3} />
              </mesh>
            )}
          </group>

          {/* History chip — tappable, opens history modal */}
          <Chip
            position={[0, -0.8, 0.12]}
            width={hW} height={0.2}
            borderColor="#94a3b8"
            backgroundColor="#f1f5f9"
            textColor="#475569"
            maskTexture={historyMaskTex}
            onPress={interactive ? onHistoryPress : undefined}
          />

          {link && (
            <Chip
              position={[0.9 - lW / 2, -0.8, 0.12]}
              width={lW} height={0.2}
              borderColor="#8b5cf6"
              backgroundColor="#f5f3ff"
              textColor="#8b5cf6"
              maskTexture={linkMaskTex}
              onPress={() => {
                try {
                  let url = link;
                  if (!url.startsWith('http')) url = 'https://' + url;
                  Linking.openURL(url);
                } catch (e) {}
              }}
            />
          )}

          {/* FOOTER: Tags row */}
          {tagsData.length > 0 && (
            <group position={[0, -1.1, 0.12]}>
              {tagsData.map((tag, i) => {
                let xOffset = -tagRowW / 2;
                for (let j = 0; j < i; j++) xOffset += tagsData[j].width + 0.08;
                return (
                  <Chip
                    key={i}
                    position={[xOffset + tag.width / 2, 0, 0]}
                    width={tag.width} height={0.2} 
                    borderColor="#cbd5e1"
                    backgroundColor="#f8fafc"
                    textColor="#64748b"
                    maskTexture={tag.mask}
                  />
                );
              })}
            </group>
          )}
        </group>
      </group>

      {/* ── BACK FACE ────────────────────────────────────────────────────── */}
      <group position={[0, 0, -0.01]} rotation={[0, Math.PI, 0]}
        onClick={(e) => { e.stopPropagation(); onFlip && onFlip(); }}
      >
        <primitive object={backCard} scale={1.4} />
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[1.1, 0.712]} />
          <meshBasicMaterial map={iconTexture} transparent alphaTest={0.05} color="#ffffff" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[3.2, 2.07]} />
          <meshBasicMaterial map={iconTexture} transparent alphaTest={0.05} color="#ffffff" />
        </mesh>
      </group>

    </group>
  );
}
