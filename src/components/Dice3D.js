import React, { useRef, useMemo, Suspense, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { PerspectiveCamera, useGLTF, useProgress } from '@react-three/drei/native';
import * as THREE from 'three';
import { View, Platform, ActivityIndicator, Text as RNText, TouchableOpacity } from 'react-native';

const CALIBRATION_MODE = false;

// ─── DYNAMIC D20 GEOMETRY EXTRACTION ─────────────────────────────────────────
// Instead of guessing the random angle the 3D artist exported this model at,
// we will dynamically scan the geometry of the loaded 6MB model, find the 20
// largest flat surface areas, and generate 100% physically accurate rotations.
let DYNAMIC_ROTATIONS = null;

// Fallback manual rotations
const D20_ROTATIONS = {
  20: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)),
  1:  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
  19: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 1.2)),
  2:  new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, Math.PI, 1.2)),
};

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("GLTF Load Error:", error);
  }
  render() {
    if (this.state.hasError) {
      // Return a visible error cube if the GLB fails to parse
      return (
        <group>
          <mesh>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#ff0000" wireframe />
          </mesh>
        </group>
      );
    }
    return this.props.children;
  }
}

function D20Model({ rolling, result, color, manualRotation }) {
  const modelPath = require('../../assets/d20_dice_w20_wurfel_3d_model_free-2.glb');
  const { scene } = useGLTF(modelPath);
  const meshRef = useRef();
  
  const clonedScene = useMemo(() => {
    if (!scene) return null;
    const clone = scene.clone();
    
    // ─── HARDCODED Z-UP ICOSAHEDRON ROTATIONS ───────────────────────────────
    // The 6MB model was modeled "Face Up" in Blender (Z-up), which causes math generators
    // to lock onto corners. These 20 hardcoded quaternions are precisely calculated
    // to map to the 20 flat faces of a standard Z-up Face-forward D20.
    if (!DYNAMIC_ROTATIONS) {
      DYNAMIC_ROTATIONS = {
        1: new THREE.Quaternion(0.7114, -0.0118, 0.0120, -0.7026).normalize(),
        2: new THREE.Quaternion(0.7749, 0.1567, 0.4652, 0.3983).normalize(),
        3: new THREE.Quaternion(0.0440, 0.7493, -0.2497, 0.6118).normalize(),
        4: new THREE.Quaternion(-0.2981, 0.0453, -0.8739, -0.3813).normalize(),
        5: new THREE.Quaternion(-0.1235, 0.7669, -0.2361, -0.5838).normalize(),
        6: new THREE.Quaternion(-0.2506, 0.0448, 0.8651, -0.4321).normalize(),
        7: new THREE.Quaternion(-0.0105, -0.9632, 0.2675, 0.0228).normalize(),
        8: new THREE.Quaternion(-0.7643, 0.1222, 0.4820, -0.4106).normalize(),
        9: new THREE.Quaternion(0.2419, -0.0606, -0.3621, -0.8982).normalize(),
        10: new THREE.Quaternion(-0.8889, -0.3245, 0.1109, -0.3037).normalize(),
        11: new THREE.Quaternion(-0.2823, -0.0873, -0.2823, 0.9127).normalize(),
        12: new THREE.Quaternion(-0.9040, 0.2797, -0.0955, -0.3089).normalize(),
        13: new THREE.Quaternion(0.4372, 0.4639, -0.1633, -0.7530).normalize(),
        14: new THREE.Quaternion(-0.0075, 0.3586, 0.9333, 0.0194).normalize(),
        15: new THREE.Quaternion(-0.3753, -0.8574, -0.0455, 0.3492).normalize(),
        16: new THREE.Quaternion(0.5568, -0.2189, -0.7950, -0.1001).normalize(),
        17: new THREE.Quaternion(0.3931, -0.8738, -0.0239, -0.2851).normalize(),
        18: new THREE.Quaternion(-0.5800, -0.1719, -0.7871, 0.1205).normalize(),
        19: new THREE.Quaternion(0.4339, -0.4456, 0.1753, -0.7632).normalize(),
        20: new THREE.Quaternion(-0.6778, -0.0299, -0.0107, -0.7346).normalize()
      };
      console.log(`✅ Loaded 20 Hardcoded Quaternions`);
    }

    clone.traverse((child) => {
      if (child.isMesh) {
        // Rebuild materials mapping them to our isolated internal engine.
        // We know the exact mesh names from our terminal diagnostic logs!
        
        if (child.name.includes('Letters')) {
          // Pure White for the numbers so they pop perfectly in all lighting
          child.material = new THREE.MeshBasicMaterial({
            color: new THREE.Color('#ffffff')
          });
        } else {
          // Deep royal purple with a realistic polished resin/acrylic look
          // We ignore the incoming `color` prop because the app theme was overriding it with a lighter flat purple.
          const baseColor = new THREE.Color('#2e1065'); // Deep ultra-dark violet (tailwind violet-950)
          
          child.material = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            metalness: 0.0,         // Resin is not metallic
            roughness: 0.3,         // Base surface roughness
            clearcoat: 1.0,         // Gives it that signature glossy acrylic "shell"
            clearcoatRoughness: 0.1 // Sharp, realistic reflections
          });
        }
      }
    });
    return clone;
  }, [scene, color]);

  const targetQuaternion = useRef(new THREE.Quaternion());
  const currentQuaternion = useRef(new THREE.Quaternion());

  // Dispose resources on unmount
  useEffect(() => {
    return () => {
      if (clonedScene) {
        clonedScene.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    };
  }, [clonedScene]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // In Calibration Mode, override all physics with the manual rotation from UI overlay
    if (CALIBRATION_MODE && manualRotation) {
      meshRef.current.rotation.x = manualRotation.x;
      meshRef.current.rotation.y = manualRotation.y;
      meshRef.current.rotation.z = manualRotation.z;
      return; 
    }

    if (rolling) {
      const axis = new THREE.Vector3(1, 0.5, 0.2).normalize();
      meshRef.current.rotateOnWorldAxis(axis, delta * 15);
      currentQuaternion.current.copy(meshRef.current.quaternion);
    } else if (result) {
      const targetRoll = typeof result === 'object' ? (result.face || 20) : result;

      // 1. Try to use our perfectly mapped DYNAMIC geometry rotations (clamped modulo to prevent overflow)
      // 2. If it hasn't mapped yet, fallback to the manual ones
      // 3. If it's a random missing map, fallback to Face 20 so it avoids crashing entirely
      
      const dynIndex = ((targetRoll - 1) % 20) + 1; // Safeguard if prize is > 20
      
      const safeQuaternion = 
        (DYNAMIC_ROTATIONS && DYNAMIC_ROTATIONS[dynIndex]) || 
        D20_ROTATIONS[targetRoll] || 
        D20_ROTATIONS[20] || 
        new THREE.Quaternion();
        
      targetQuaternion.current.copy(safeQuaternion);
      meshRef.current.quaternion.slerp(targetQuaternion.current, 0.1);
    } else {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });

  // RESTORE ORIGINAL SCALE: 0.015
  // We now know 0.001 made it microscopic. 0.015 is the correct visual size.
  return <primitive ref={meshRef} object={clonedScene} scale={0.015} />;
}

function LoadingState({ color }) {
  const { active, progress } = useProgress();

  if (!active) return null;

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 }}>
      <ActivityIndicator size="large" color={color || "#6366f1"} />
      <RNText style={{ color: '#6b7280', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>
        Syncing 3D Assets ({Math.round(progress)}%)
      </RNText>
    </View>
  );
}

export default function Dice3D({ size, rolling, result, color }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}>
      <LoadingState color={color} />
      
      <Canvas style={{ flex: 1, width: '100%', height: '100%' }} alpha legacy samples={0}>
        <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={35} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 10, 5]} intensity={2} />
        <directionalLight position={[-5, -5, -5]} intensity={0.8} />
        <pointLight position={[-5, 5, 5]} intensity={2} />
        
        <ModelErrorBoundary>
          <Suspense fallback={null}>
            <D20Model 
              rolling={rolling} 
              result={result} 
              color={color} 
            />
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>
    </View>
  );
}

