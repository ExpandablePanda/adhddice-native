const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// three.js ships two entry points: three.cjs (require) and three.module.js (import).
// Expo Metro's package exports support causes some callers to get the ESM build while
// others get the CJS build — two separate files, each registering globalThis.__THREE__,
// producing the "Multiple instances" warning and breaking cross-instance material rendering.
// Force every import of 'three' to the same CJS file via resolveRequest.
const THREE_CJS = path.resolve(__dirname, 'node_modules/three/build/three.cjs');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three' || moduleName.startsWith('three/')) {
    return { filePath: THREE_CJS, type: 'sourceFile' };
  }
  return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

const { assetExts, sourceExts } = config.resolver;
config.resolver.assetExts = [...assetExts, 'glb', 'gltf'];

module.exports = config;
