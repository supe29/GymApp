import { signUpWithEmail, type GymSupabaseClient } from 'api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
import { performOAuthSignIn } from '../../lib/oauthFlow';

export interface SignUpScreenProps {
  client?: GymSupabaseClient;
  onSignedUp?: () => void;
  onNavigateToSignIn?: () => void;
}

/** FR-9.1: create an account via email/password, Google, or Apple. */
export default function SignUpScreen({
  client = getSupabaseClient(),
  onSignedUp,
  onNavigateToSignIn,
}: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailSignUp() {
    setError(null);
    if (!email || !password) {
      setError('Enter an email and password.');
      return;
    }
    setSubmitting(true);
    const result = await signUpWithEmail(client, email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSignedUp?.();
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError(null);
    setSubmitting(true);
    const result = await performOAuthSignIn(client, provider);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.session) {
      onSignedUp?.();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput
        testID="signup-email"
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="signup-password"
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <Text testID="signup-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="signup-submit"
        style={styles.button}
        disabled={submitting}
        onPress={handleEmailSignUp}
      >
        <Text style={styles.buttonText}>Sign up</Text>
      </Pressable>

      <Pressable
        testID="signup-google"
        style={styles.button}
        disabled={submitting}
        onPress={() => handleOAuth('google')}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>

      <Pressable
        testID="signup-apple"
        style={styles.button}
        disabled={submitting}
        onPress={() => handleOAuth('apple')}
      >
        <Text style={styles.buttonText}>Continue with Apple</Text>
      </Pressable>

      <Pressable testID="signup-goto-signin" onPress={onNavigateToSignIn}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
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
