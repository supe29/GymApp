// Detox configuration for the native (iOS/Android) e2e suite.
// See README.md: never executed in this environment (no Xcode/Android SDK,
// no Detox CLI, no native build). Binary paths below are Expo bare-workflow
// conventions, not verified against a real `expo prebuild` output in this
// environment — confirm/adjust once that build actually exists.
module.exports = {
  testRunner: {
    args: {
      config: 'e2e/native/jest.config.js',
      _: ['e2e/native/specs'],
    },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: '../../apps/app/ios/build/Build/Products/Debug-iphonesimulator/AIFitnessCoach.app',
      build:
        'cd ../../apps/app && xcodebuild -workspace ios/AIFitnessCoach.xcworkspace -scheme AIFitnessCoach -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: '../../apps/app/android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd ../../apps/app/android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
