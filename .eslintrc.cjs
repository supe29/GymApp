module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  env: {
    es2020: true,
    node: true,
  },
  ignorePatterns: ['node_modules', 'dist', '.expo', 'web-build', 'android', 'ios', '*.config.js'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
  overrides: [
    {
      // @react-three/fiber's JSX intrinsics (mesh, boxGeometry,
      // ambientLight, ...) are Three.js object props, not DOM/React
      // Native ones; eslint-plugin-react's no-unknown-property rule
      // doesn't know about them and flags every one as a false positive.
      files: ['packages/three-model/src/**/*.tsx'],
      rules: {
        'react/no-unknown-property': 'off',
      },
    },
  ],
};
