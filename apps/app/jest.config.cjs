/** @type {import('jest').Config} */
module.exports = {
  displayName: 'app',
  preset: 'jest-expo',
  rootDir: __dirname,
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  // The first test in a screen file pays the one-time cost of loading and
  // transforming React Native and the screen's modules (~2 s locally with a
  // cold cache). On CI's small runners, with files running in parallel, that
  // can pass Jest's 5 s default even though the test itself is quick.
  testTimeout: 20000,
};
