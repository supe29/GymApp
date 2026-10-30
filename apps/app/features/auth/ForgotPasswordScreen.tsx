import { requestPasswordReset, type GymSupabaseClient } from 'api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getAuthRedirectUrl } from '../../lib/authRedirect';
import { getSupabaseClient } from '../../lib/supabaseClient';

export interface ForgotPasswordScreenProps {
  client?: GymSupabaseClient;
  onNavigateToSignIn?: () => void;
}

/** FR-9.2: request a password-reset email. */
export default function ForgotPasswordScreen({
  client = getSupabaseClient(),
  onNavigateToSignIn,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email) {
      setError('Enter your account email.');
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await requestPasswordReset(
      client,
      email,
      getAuthRedirectUrl(),
    );
    setSubmitting(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text testID="forgot-password-sent" style={styles.title}>
          Check your email
        </Text>
        <Text>We sent a password reset link to {email}.</Text>
        <Pressable
          testID="forgot-password-goto-signin"
          onPress={onNavigateToSignIn}
          accessibilityRole="link"
        >
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>

      <TextInput
        testID="forgot-password-email"
        style={styles.input}
        placeholder="Email"
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {error ? (
        <Text testID="forgot-password-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="forgot-password-submit"
        style={styles.button}
        disabled={submitting}
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Send reset link</Text>
      </Pressable>

      <Pressable testID="forgot-password-goto-signin" onPress={onNavigateToSignIn} accessibilityRole="link">
        <Text style={styles.link}>Back to sign in</Text>
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
  link: { color: '#111', textDecorationLine: 'underline', textAlign: 'center', marginTop: 8 },
});
