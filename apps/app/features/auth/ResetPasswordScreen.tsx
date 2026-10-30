import { updatePassword, type GymSupabaseClient } from 'api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';

export interface ResetPasswordScreenProps {
  client?: GymSupabaseClient;
  onPasswordUpdated?: () => void;
}

/**
 * FR-9.2, second half: sets a new password once the user has followed the
 * reset-email link from ForgotPasswordScreen (Supabase exchanges that link
 * for a recovery session before this screen is reachable).
 */
export default function ResetPasswordScreen({
  client = getSupabaseClient(),
  onPasswordUpdated,
}: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!password) {
      setError('Enter a new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(client, password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    onPasswordUpdated?.();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>

      <TextInput
        testID="reset-password-new"
        style={styles.input}
        placeholder="New password"
        accessibilityLabel="New password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        testID="reset-password-confirm"
        style={styles.input}
        placeholder="Confirm new password"
        accessibilityLabel="Confirm new password"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error ? (
        <Text testID="reset-password-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="reset-password-submit"
        style={styles.button}
        disabled={submitting}
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Update password</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginBottom: 12 },
});
