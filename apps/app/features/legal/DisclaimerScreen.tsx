import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface DisclaimerScreenProps {
  onAcknowledge: () => void;
}

/**
 * SR-5: a clear, visible disclaimer that this is a fitness/wellness tool,
 * not a medical device, shown during onboarding (not buried in terms of
 * service) and gating onboarding completion (AC-14) until acknowledged.
 */
export default function DisclaimerScreen({ onAcknowledge }: DisclaimerScreenProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.body}>
          This app is a fitness and wellness tool. It is not a medical device, and it does not
          provide medical advice, diagnosis, or treatment.
        </Text>
        <Text style={styles.body}>
          If you have a pre-existing health condition or injury, or are unsure whether exercise or
          a change in diet is safe for you, consult a qualified healthcare professional before
          starting this or any fitness program.
        </Text>
      </ScrollView>

      <Pressable
        testID="disclaimer-checkbox"
        style={styles.checkboxRow}
        onPress={() => setAcknowledged((prev) => !prev)}
      >
        <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>
          I understand this is not medical advice and I should consult a professional if needed.
        </Text>
      </Pressable>

      <Pressable
        testID="disclaimer-continue"
        style={[styles.button, !acknowledged && styles.buttonDisabled]}
        disabled={!acknowledged}
        onPress={onAcknowledge}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  scroll: { flex: 1, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#111',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#111' },
  checkboxLabel: { flex: 1, fontSize: 14 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#999' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
