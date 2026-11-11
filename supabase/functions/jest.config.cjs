/** @type {import('jest').Config} */
// Tests the edge functions' pure helpers (_shared/). The Deno handlers
// themselves (*/index.ts) are not runnable here; see
// docs/deferred-production-checks.md.
module.exports = {
  displayName: 'edge-functions',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/_shared/**/*.test.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, types: ['jest'] } }] },
};
