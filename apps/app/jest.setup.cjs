jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The real 3D renderers pull in ESM-only three.js modules jest can't parse.
// Screens that embed a demo figure or body model get this inert stand-in;
// a test file's own jest.mock('three-model', ...) still takes precedence.
jest.mock('three-model', () => {
  const react = require('react');
  const rn = require('react-native');
  return {
    DemoFigure: (props) =>
      react.createElement(rn.View, { testID: 'mock-demo-figure', clip: props.clip, paused: props.paused, muscles: props.muscles }),
    BodyModel: react.forwardRef((_props, ref) => {
      react.useImperativeHandle(ref, () => ({ reset: () => {}, showSide: () => {} }));
      return react.createElement(rn.View, { testID: 'mock-body-model' });
    }),
  };
});
