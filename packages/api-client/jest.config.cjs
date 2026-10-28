/** @type {import('jest').Config} */
module.exports = {
  displayName: 'api-client',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
