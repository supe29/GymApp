import { StyleSheet, Text, View } from 'react-native';

export interface OnboardingProgressIndicatorProps {
  step: number;
  total: number;
  label: string;
}

/** UX-1: visible step-progress indicator for the guided onboarding flow. */
export default function OnboardingProgressIndicator({
  step,
  total,
  label,
}: OnboardingProgressIndicatorProps) {
  const fraction = total > 0 ? Math.min(Math.max(step / total, 0), 1) : 0;
  return (
    <View style={styles.container}>
      <Text testID="onboarding-progress-text" style={styles.text}>
        Step {step} of {total}: {label}
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: step }}
      >
        <View
          testID="onboarding-progress-fill"
          style={[styles.fill, { width: `${fraction * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  text: { fontSize: 13, color: '#555', marginBottom: 6 },
  track: { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#111' },
});
