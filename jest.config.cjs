/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/packages/core/jest.config.cjs',
    '<rootDir>/packages/api-client/jest.config.cjs',
    '<rootDir>/packages/three-model/jest.config.cjs',
    '<rootDir>/apps/app/jest.config.cjs',
    '<rootDir>/supabase/functions/jest.config.cjs',
  ],
};
