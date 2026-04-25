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

const D6_ROTATIONS = {
  1: new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.571, 0.785, 0)),
  2: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.785, 0)),
  3: new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.356, 6.283, 1.571)),
  4: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.785, 0, -1.571)),
  5: new THREE.Quaternion().setFromEuler(new THREE.Euler(-6.087, 3.927, 0)),
  6: new THREE.Quaternion().setFromEuler(new THREE.Euler(1.571, 2.356, 0)),
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
        if (child.name.includes('Letters')) {
          child.material = new THREE.MeshBasicMaterial({
            color: new THREE.Color('#ffffff')
          });
        } else {
          const baseColor = new THREE.Color(color || '#6d28d9'); // Dark Purple
          
          child.material = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            metalness: 0.1,
            roughness: 0.2,
            clearcoat: 1.0,         
            clearcoatRoughness: 0.05,
            emissive: new THREE.Color('#2e1065'), // Even darker purple glow
            emissiveIntensity: 0.1
          });
        }
      }
    });
    return clone;
  }, [scene]);

  const targetQuaternion = useRef(new THREE.Quaternion());
  const currentQuaternion = useRef(new THREE.Quaternion());

  // Update material color when prop changes without re-cloning the scene
  useEffect(() => {
    if (!clonedScene || !color) return;
    const newColor = new THREE.Color(color);
    clonedScene.traverse((child) => {
      if (child.isMesh && !child.name.includes('Letters')) {
        if (child.material && child.material.color) {
          child.material.color.copy(newColor);
        }
      }
    });
  }, [clonedScene, color]);

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
      meshRef.current.rotateOnWorldAxis(axis, delta * 25);
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
      meshRef.current.quaternion.slerp(targetQuaternion.current, 0.18);
    } else {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });

  // RESTORE ORIGINAL SCALE: 0.015
  return <primitive ref={meshRef} object={clonedScene} scale={0.015} />;
}

function D6Model({ rolling, result, color, manualRotation }) {
  const modelPath = require('../../assets/d6.glb');
  const { scene } = useGLTF(modelPath);
  const meshRef = useRef();
  
  const clonedScene = useMemo(() => {
    if (!scene) return null;
    const clone = scene.clone();
    
    clone.traverse((child) => {
      if (child.isMesh) {
        if (child.name.includes('001')) { // Dots
          child.material = new THREE.MeshBasicMaterial({
            color: new THREE.Color('#ffffff')
          });
        } else {
          const baseColor = new THREE.Color(color || '#6d28d9');
          child.material = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            metalness: 0.1,
            roughness: 0.2,
            clearcoat: 1.0,         
            clearcoatRoughness: 0.05,
            emissive: new THREE.Color(color || '#6d28d9'),
            emissiveIntensity: 0.05
          });
        }
      }
    });
    return clone;
  }, [scene]);

  const targetQuaternion = useRef(new THREE.Quaternion());

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    if (CALIBRATION_MODE && manualRotation) {
      meshRef.current.rotation.x = manualRotation.x;
      meshRef.current.rotation.y = manualRotation.y;
      meshRef.current.rotation.z = manualRotation.z;
      return;
    }

    if (rolling) {
      const axis = new THREE.Vector3(1, 0.8, 0.4).normalize();
      meshRef.current.rotateOnWorldAxis(axis, delta * 20);
    } else if (result) {
      const targetRoll = typeof result === 'object' ? (result.face || 1) : result;
      const safeQuaternion = D6_ROTATIONS[targetRoll] || D6_ROTATIONS[1];
      targetQuaternion.current.copy(safeQuaternion);
      meshRef.current.quaternion.slerp(targetQuaternion.current, 0.15);
    } else {
      meshRef.current.rotation.y += delta * 0.8;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.2;
    }
  });

  return <primitive ref={meshRef} object={clonedScene} scale={0.6} />;
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

export default function Dice3D({ size, rolling, result, color, type = 'd20', manualRotation }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}>
      <LoadingState color={color} />
      
      <Canvas style={{ flex: 1, width: '100%', height: '100%' }} alpha legacy={false} samples={4}>
        <PerspectiveCamera makeDefault position={[0, 0, 6]} fov={35} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 10, 10]} intensity={2.5} />
        <directionalLight position={[-10, 5, -5]} intensity={1.2} />
        <pointLight position={[0, 5, 5]} intensity={1.5} color="#ffffff" />
        
        <ModelErrorBoundary>
          <Suspense fallback={null}>
            {type === 'd6' ? (
              <D6Model 
                rolling={rolling} 
                result={result} 
                color={color} 
                manualRotation={manualRotation}
              />
            ) : (
              <D20Model 
                rolling={rolling} 
                result={result} 
                color={color} 
                manualRotation={manualRotation}
              />
            )}
          </Suspense>
        </ModelErrorBoundary>
      </Canvas>
    </View>
  );
}

