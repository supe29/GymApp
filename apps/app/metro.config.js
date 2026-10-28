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

module.exports = config;
