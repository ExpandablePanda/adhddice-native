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

// High-res mask textures via placehold.co with Montserrat font
const maskUrl = (text, w, h) =>
  `https://placehold.co/${w}x${h}/000000/FFFFFF.png?text=${encodeURIComponent(text)}`;

const DUMMY_URL = 'https://placehold.co/10x10/000000/000000.png';

const chipW = (text, pad = 0.22) => Math.max(0.3, text.length * 0.048 + pad);

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ position, width, height, maskTexture, onPress, textColor, backgroundColor, borderColor }) {
  const radius = 0.04;
  const shape = useMemo(() => createRoundedRectShape(width, height, radius), [width, height]);
  const borderShape = useMemo(() => createRoundedRectShape(width + 0.018, height + 0.018, radius + 0.009), [width, height]);

  const handlePress = onPress ? (e) => { e.stopPropagation(); onPress(); } : undefined;

  const fBorder = useMemo(() => new THREE.Color(borderColor).convertSRGBToLinear(), [borderColor]);
  const fBg     = useMemo(() => new THREE.Color(backgroundColor).convertSRGBToLinear(), [backgroundColor]);
  const fText   = useMemo(() => new THREE.Color(textColor).convertSRGBToLinear(), [textColor]);

  return (
    <group position={position}>
      <mesh onClick={handlePress}>
        <shapeGeometry args={[borderShape]} />
        <meshBasicMaterial color={fBorder} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={fBg} />
      </mesh>
      <mesh position={[0, 0, 0.009]}>
        <planeGeometry args={[width * 0.92, height * 0.75]} />
        <meshBasicMaterial
          color={fText}
          alphaMap={maskTexture}
          transparent={false}
          alphaTest={0.45}
        />
      </mesh>
    </group>
  );
}

// ── Divider line ──────────────────────────────────────────────────────────────

function Divider({ y, width = 1.7, opacity = 0.15 }) {
  return (
    <mesh position={[0, y, 0.01]}>
      <planeGeometry args={[width, 0.008]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
    </mesh>
  );
}

// ── MTG Mana Pip ─────────────────────────────────────────────────────────────
// iconType: 'flame' | 'skull' | null

function FlameIcon({ r, color }) {
  const fColor = useMemo(() => new THREE.Color(color).convertSRGBToLinear(), [color]);

  // Simple clean flame: pointed tip at TOP, wide lower body, rounded base
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, r);                                          // single tip at top
    s.bezierCurveTo( r*0.55,  r*0.4,  r*0.78, -r*0.2,  r*0.35, -r);  // right side
    s.quadraticCurveTo(0, -r*1.18, -r*0.35, -r);           // rounded base
    s.bezierCurveTo(-r*0.78, -r*0.2, -r*0.55,  r*0.4,  0, r);        // left side
    return s;
  }, [r]);

  return (
    <mesh position={[0, 0, 0.005]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color={fColor} />
    </mesh>
  );
}

function SkullIcon({ r, color, bgColor }) {
  const fColor = useMemo(() => new THREE.Color(color).convertSRGBToLinear(), [color]);
  const fBg    = useMemo(() => new THREE.Color(bgColor).convertSRGBToLinear(), [bgColor]);
  const SEGS   = 24;
  const cr     = r * 0.72; // cranium radius
  return (
    <group position={[0, r * 0.06, 0.005]}>
      {/* Cranium */}
      <mesh position={[0, cr * 0.18, 0]}>
        <circleGeometry args={[cr, SEGS]} />
        <meshBasicMaterial color={fColor} />
      </mesh>
      {/* Jaw block */}
      <mesh position={[0, -cr * 0.44, 0]}>
        <planeGeometry args={[cr * 1.45, cr * 0.65]} />
        <meshBasicMaterial color={fColor} />
      </mesh>
      {/* Left eye */}
      <mesh position={[-cr * 0.32, cr * 0.22, 0.004]}>
        <circleGeometry args={[cr * 0.22, 16]} />
        <meshBasicMaterial color={fBg} />
      </mesh>
      {/* Right eye */}
      <mesh position={[cr * 0.32, cr * 0.22, 0.004]}>
        <circleGeometry args={[cr * 0.22, 16]} />
        <meshBasicMaterial color={fBg} />
      </mesh>
      {/* Nose */}
      <mesh position={[0, -cr * 0.06, 0.004]}>
        <circleGeometry args={[cr * 0.11, 16]} />
        <meshBasicMaterial color={fBg} />
      </mesh>
      {/* Teeth gaps */}
      {[-0.3, 0, 0.3].map(ox => (
        <mesh key={ox} position={[cr * ox, -cr * 0.62, 0.004]}>
          <planeGeometry args={[cr * 0.22, cr * 0.22]} />
          <meshBasicMaterial color={fBg} />
        </mesh>
      ))}
    </group>
  );
}

function ManaPip({ position, radius = 0.13, bgColor, borderColor, numTexture, textColor = '#000000', iconType }) {
  const fBg     = useMemo(() => new THREE.Color(bgColor).convertSRGBToLinear(), [bgColor]);
  const fBorder = useMemo(() => new THREE.Color(borderColor || '#000000').convertSRGBToLinear(), [borderColor]);
  const fText   = useMemo(() => new THREE.Color(textColor).convertSRGBToLinear(), [textColor]);
  const SEGS = 32;
  return (
    <group position={position}>
      {/* Border ring */}
      <mesh position={[0, 0, -0.002]}>
        <circleGeometry args={[radius + 0.018, SEGS]} />
        <meshBasicMaterial color={fBorder} />
      </mesh>
      {/* Filled circle */}
      <mesh>
        <circleGeometry args={[radius, SEGS]} />
        <meshBasicMaterial color={fBg} />
      </mesh>
      {/* Number texture */}
      {numTexture && (
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[radius * 1.55, radius * 1.55]} />
          <meshBasicMaterial color={fText} alphaMap={numTexture} transparent={false} alphaTest={0.4} />
        </mesh>
      )}
      {/* Geometry icon */}
      {iconType === 'flame' && <FlameIcon r={radius * 0.72} color={textColor} />}
      {iconType === 'skull' && <SkullIcon r={radius * 0.72} color={textColor} bgColor={bgColor} />}
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
  onOsaat,
  glbUri,
  logoUri,
}) {
  const groupRef = useRef();
  const flipRef  = useRef(isFlipped ? Math.PI : 0);
  const spinRef  = useRef(0);

  const { scene }   = useGLTF(glbUri  ?? require('../../assets/playing_cards.glb'));
  const iconTexture = useTexture(logoUri ?? require('../../assets/logo.png'));
  const { economy } = useEconomy();

  // ── Task data ──────────────────────────────────────────────────────────────
  const rawTitle    = (task?.title || 'Untitled').toUpperCase();
  const words       = rawTitle.split(' ');
  const isMulti     = words.length > 3 || rawTitle.length > 12;
  let line1 = rawTitle, line2 = '';
  if (isMulti) {
    const mid = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(' ');
    line2 = words.slice(mid).join(' ');
  }

  const status      = task?.status || 'pending';
  const energy      = task?.energy ?? null;
  const tags        = task?.tags   || [];
  const dueDate     = task?.dueDate || null;
  const link        = task?.link    || null;
  const linkTitle   = task?.linkTitle || null;
  const statusHist  = task?.statusHistory || {};

  const statusInfo  = STATUSES[status] || STATUSES.pending;
  const statusLabel = statusInfo.label.toUpperCase();
  const nextStatus  = statusInfo.next;

  const statusColor = useMemo(() => new THREE.Color(statusInfo.color).convertSRGBToLinear(), [statusInfo.color]);

  const streak      = useMemo(() => calculateTaskStreak(statusHist, 6, !!task?.frequency, task?.frequency), [statusHist, task?.frequency]);
  const missedStreak= useMemo(() => calculateTaskMissedStreak(statusHist), [statusHist]);

  const streakLabel = streak >= 2
    ? `${streak} STREAK`
    : missedStreak >= 2 ? `${missedStreak} MISSED` : null;

  const dueDateLabel = dueDate
    ? `DUE ${dueDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3')}`
    : null;

  const energyInfo  = energy != null ? (ENERGY[energy] || null) : null;
  const energyLabel = energyInfo ? energyInfo.label.toUpperCase() : null;

  const vault        = economy.vaultPrizes || [];
  const lockedPrize  = vault.find(p => (p.linkedTaskIds || []).includes(String(task?.id)) && p.status === 'locked');
  const unlockedPrize= vault.find(p => (p.linkedTaskIds || []).includes(String(task?.id)) && p.status === 'unlocked');
  const prizeLabel   = lockedPrize ? 'PRIZE LOCKED' : (unlockedPrize ? 'PRIZE READY!' : null);
  const prizeColor   = lockedPrize ? '#ef4444' : '#059669';
  const prizeBg      = lockedPrize ? '#fee2e2' : '#d1fae5';
  const linkLabel    = link ? (linkTitle || 'LINK').toUpperCase() : null;

  // ── Textures — all at 2× resolution for sharpness ─────────────────────────
  const statusTex    = useLoader(THREE.TextureLoader, maskUrl(statusLabel, 800, 160));
  // Combined title — single texture so both lines share the same font size
  const titleText = line2 ? `${line1}\n${line2}` : line1;
  const titleTex  = useLoader(THREE.TextureLoader, maskUrl(titleText, 1200, line2 ? 480 : 280));
  const histTex      = useLoader(THREE.TextureLoader, maskUrl('HISTORY', 600, 160));
  const osaatTex     = useLoader(THREE.TextureLoader, maskUrl('1 STEP', 600, 160));
  const dueTex       = useLoader(THREE.TextureLoader, dueDateLabel  ? maskUrl(dueDateLabel, 800, 160)  : DUMMY_URL);
  const energyTex    = useLoader(THREE.TextureLoader, energyLabel   ? maskUrl(energyLabel, 600, 160)   : DUMMY_URL);
  const streakNumTex = useLoader(THREE.TextureLoader, (streak >= 2 || missedStreak >= 2)
    ? maskUrl(String(streak >= 2 ? streak : missedStreak), 300, 300)
    : DUMMY_URL);
  const prizeTex     = useLoader(THREE.TextureLoader, prizeLabel    ? maskUrl(prizeLabel, 800, 160)    : DUMMY_URL);
  const linkTex      = useLoader(THREE.TextureLoader, linkLabel      ? maskUrl(linkLabel, 700, 160)     : DUMMY_URL);

  useMemo(() => {
    const all = [statusTex, titleTex, histTex, osaatTex, dueTex, energyTex, streakNumTex, prizeTex, linkTex];
    all.forEach(t => {
      if (t) { t.premultiplyAlpha = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; }
    });
  }, [statusTex, titleTex, histTex, osaatTex, dueTex, energyTex, streakNumTex, prizeTex, linkTex]);

  // ── Clone card meshes ──────────────────────────────────────────────────────
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
      metalness: 0.05,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 0.6,
      emissive: statusColor,
      emissiveIntensity: 0.35,
    });
    if (back) back.material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });
    return { frontCard: front, backCard: back };
  }, [scene]);

  if (frontCard) { frontCard.material.color.set(statusColor); frontCard.material.emissive.set(statusColor); }

  React.useEffect(() => {
    return () => {
      [frontCard, backCard].forEach(card => {
        if (!card) return;
        card.traverse(child => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material?.dispose();
          }
        });
      });
      [statusTex, titleTex, histTex, osaatTex, dueTex, energyTex, streakNumTex, prizeTex, linkTex]
        .forEach(t => t?.dispose?.());
    };
  }, [frontCard, backCard]);

  // ── Animation ──────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!groupRef.current || skipInternalAnimation) return;
    if (spinning) spinRef.current += delta * 0.4;
    const target = isFlipped ? Math.PI : 0;
    // damp = lerp(curr, target, 1 - exp(-lambda * dt)) — smooth at any frame rate
    flipRef.current = THREE.MathUtils.damp(flipRef.current, target, 6, delta);
    groupRef.current.rotation.y = spinRef.current + flipRef.current;
  });

  if (!frontCard || !backCard) return null;

  // ── Layout values ──────────────────────────────────────────────────────────
  const sW  = chipW(statusLabel);
  const hW  = chipW('HISTORY', 0.22);
  const oW  = chipW('1 STEP', 0.22);
  const dW  = dueDateLabel ? chipW(dueDateLabel, 0.22) : 0;
  const eW  = energyLabel  ? chipW(energyLabel, 0.22)  : 0;
  const prW = prizeLabel   ? chipW(prizeLabel, 0.22)   : 0;
  const lW  = linkLabel    ? chipW(linkLabel, 0.22)    : 0;
  const showStreak  = streak >= 2;
  const showMissed  = !showStreak && missedStreak >= 2;
  const showPips    = showStreak || showMissed;
  const PIP_R       = 0.12; // radius of each pip
  const PIP_GAP     = 0.05; // gap between pips

  return (
    <group ref={groupRef} position={position} scale={[cardScale, cardScale, cardScale]}>

      {/* ── FRONT ──────────────────────────────────────────────────────────── */}
      <group position={[0, 0, 0.01]}>
        <primitive object={frontCard} scale={1.4} onClick={interactive ? onPress : undefined} />

        <group scale={[1.55, 1.55, 1]}>

          {/* ── TOP ROW: Status (left) | Streak Pips (right) ── */}
          <group position={[0, 1.15, 0.12]}>
            <Chip
              position={[-0.82 + sW / 2, 0, 0]}
              width={sW} height={0.22}
              borderColor={statusInfo.color}
              backgroundColor={lightenColor(statusInfo.color, 0.88)}
              textColor={statusInfo.color}
              maskTexture={statusTex}
              onPress={interactive ? () => onConfirmStatus?.(task.id, nextStatus) : undefined}
            />
            {/* MTG-style mana pips for streak — right-anchored */}
            {showPips && (
              <group>
                {/* Icon pip — pinned to right edge */}
                <ManaPip
                  position={[0.88 - PIP_R, 0, 0]}
                  radius={PIP_R}
                  bgColor={showStreak ? '#f97316' : '#1f2937'}
                  borderColor={showStreak ? '#c2410c' : '#ffffff'}
                  iconType={showStreak ? 'flame' : 'skull'}
                  textColor="#ffffff"
                />
                {/* Number pip — immediately left of icon pip */}
                <ManaPip
                  position={[0.88 - PIP_R - 2 * PIP_R - PIP_GAP, 0, 0]}
                  radius={PIP_R}
                  bgColor="#ffffff"
                  borderColor="#94a3b8"
                  numTexture={streakNumTex}
                  textColor={showStreak ? '#b45309' : '#b91c1c'}
                />
              </group>
            )}
          </group>

          <Divider y={0.88} />

          {/* ── TITLE (center, single combined texture) ── */}
          <group position={[0, 0.28, 0.12]}>
            <mesh>
              <planeGeometry args={[2.1, line2 ? 0.9 : 0.52]} />
              <meshBasicMaterial color="#ffffff" alphaMap={titleTex} transparent={false} alphaTest={0.38} />
            </mesh>
          </group>

          <Divider y={-0.05} />

          {/* ── BELOW TITLE: History (left) | 1 STEP (right) ── */}
          <group position={[0, -0.28, 0.12]}>
            <Chip
              position={[-0.82 + hW / 2, 0, 0]}
              width={hW} height={0.2}
              borderColor="#94a3b8" backgroundColor="#f1f5f9" textColor="#475569"
              maskTexture={histTex}
              onPress={interactive ? onHistoryPress : undefined}
            />
            <Chip
              position={[0.82 - oW / 2, 0, 0]}
              width={oW} height={0.2}
              borderColor="#6366f1" backgroundColor="#e0e7ff" textColor="#4338ca"
              maskTexture={osaatTex}
              onPress={interactive ? onOsaat : undefined}
            />
          </group>

          {/* ── METADATA ROW: Due | Energy ── */}
          {(dueDateLabel || energyLabel) && (
            <group position={[0, -0.56, 0.12]}>
              {dueDateLabel && (
                <Chip
                  position={[-0.82 + dW / 2, 0, 0]}
                  width={dW} height={0.2}
                  borderColor="#7dd3fc" backgroundColor="#e0f2fe" textColor="#0369a1"
                  maskTexture={dueTex}
                />
              )}
              {energyLabel && (
                <Chip
                  position={[0.82 - eW / 2, 0, 0]}
                  width={eW} height={0.2}
                  borderColor={energyInfo?.color || '#94a3b8'}
                  backgroundColor={energyInfo?.bg || '#f8fafc'}
                  textColor={energyInfo?.color || '#64748b'}
                  maskTexture={energyTex}
                />
              )}
            </group>
          )}

          {/* ── PRIZE & LINK ── */}
          {(prizeLabel || link) && (
            <group position={[0, -0.82, 0.12]}>
              {prizeLabel && (
                <Chip
                  position={[link ? -0.82 + prW / 2 : 0, 0, 0]}
                  width={prW} height={0.2}
                  borderColor={prizeColor} backgroundColor={prizeBg} textColor={prizeColor}
                  maskTexture={prizeTex}
                  onPress={interactive ? onPrizePress : undefined}
                />
              )}
              {link && (
                <Chip
                  position={[0.82 - lW / 2, 0, 0]}
                  width={lW} height={0.2}
                  borderColor="#8b5cf6" backgroundColor="#f5f3ff" textColor="#7c3aed"
                  maskTexture={linkTex}
                  onPress={() => {
                    try {
                      let url = link;
                      if (!url.startsWith('http')) url = 'https://' + url;
                      Linking.openURL(url);
                    } catch (e) {}
                  }}
                />
              )}
            </group>
          )}

        </group>
      </group>

      {/* ── BACK ───────────────────────────────────────────────────────────── */}
      <group position={[0, 0, -0.01]} rotation={[0, Math.PI, 0]}
        onClick={(e) => { e.stopPropagation(); onFlip?.(); }}
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
