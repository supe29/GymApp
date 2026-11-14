/** @type {import('jest').Config} */
module.exports = {
  // A global option: Jest ignores it inside a project config. The first test
  // in an app screen file pays the one-time cost of loading and transforming
  // React Native and the screen's modules (~2 s locally with a cold cache),
  // which on CI's small runners, with files in parallel, can pass the 5 s
  // default even though the test itself takes milliseconds.
  testTimeout: 20000,
  projects: [
    '<rootDir>/packages/core/jest.config.cjs',
    '<rootDir>/packages/api-client/jest.config.cjs',
    '<rootDir>/packages/three-model/jest.config.cjs',
    '<rootDir>/apps/app/jest.config.cjs',
    '<rootDir>/supabase/functions/jest.config.cjs',
  ],
};
