// Monorepo-aware Metro config: workspace packages (core, api-client, ...)
// live outside apps/app and are consumed as raw TypeScript source (their
// package.json "main"/"types" point at src/index.ts), so Metro needs to
// watch the repo root and resolve hoisted node_modules there too.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// The 3D muscle model (packages/three-model) loads a vendored glTF binary
// asset — not in Expo's default assetExts, so GLTFLoader's require() of it
// would otherwise be treated as a JS module and fail to bundle.
config.resolver.assetExts = [...config.resolver.assetExts, 'glb', 'gltf'];

module.exports = config;
