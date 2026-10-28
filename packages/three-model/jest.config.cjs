/** @type {import('jest').Config} */
module.exports = {
  displayName: 'three-model',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
