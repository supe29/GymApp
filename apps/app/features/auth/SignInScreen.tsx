import { signInWithEmail, type GymSupabaseClient } from 'api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { performOAuthSignIn } from '../../lib/oauthFlow';
import { getSupabaseClient } from '../../lib/supabaseClient';

export interface SignInScreenProps {
  client?: GymSupabaseClient;
  onSignedIn?: () => void;
  onNavigateToSignUp?: () => void;
  onNavigateToForgotPassword?: () => void;
}

/** FR-9.1: sign in via email/password, Google, or Apple. */
export default function SignInScreen({
  client = getSupabaseClient(),
  onSignedIn,
  onNavigateToSignUp,
  onNavigateToForgotPassword,
}: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailSignIn() {
    setError(null);
    if (!email || !password) {
      setError('Enter an email and password.');
      return;
    }
    setSubmitting(true);
    const result = await signInWithEmail(client, email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSignedIn?.();
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
      onSignedIn?.();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>

      <TextInput
        testID="signin-email"
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="signin-password"
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <Text testID="signin-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="signin-submit"
        style={styles.button}
        disabled={submitting}
        onPress={handleEmailSignIn}
      >
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>

      <Pressable
        testID="signin-google"
        style={styles.button}
        disabled={submitting}
        onPress={() => handleOAuth('google')}
      >
        <Text style={styles.buttonText}>Continue with Google</Text>
      </Pressable>

      <Pressable
        testID="signin-apple"
        style={styles.button}
        disabled={submitting}
        onPress={() => handleOAuth('apple')}
      >
        <Text style={styles.buttonText}>Continue with Apple</Text>
      </Pressable>

      <Pressable testID="signin-goto-forgot-password" onPress={onNavigateToForgotPassword}>
        <Text style={styles.link}>Forgot password?</Text>
      </Pressable>

      <Pressable testID="signin-goto-signup" onPress={onNavigateToSignUp}>
        <Text style={styles.link}>New here? Create an account</Text>
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
