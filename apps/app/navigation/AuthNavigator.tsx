import type { GymSupabaseClient } from 'api-client';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ForgotPasswordScreen from '../features/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../features/auth/ResetPasswordScreen';
import SignInScreen from '../features/auth/SignInScreen';
import SignUpScreen from '../features/auth/SignUpScreen';
import PrivacyPolicyScreen from '../features/legal/PrivacyPolicyScreen';

export interface AuthNavigatorProps {
  client?: GymSupabaseClient;
}

type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
  PrivacyPolicy: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * FR-9.4: the signed-out navigation stack — SignIn, SignUp,
 * ForgotPassword, and ResetPassword. `AuthGate` swaps this whole subtree
 * out reactively the moment a session appears (via its own
 * `onAuthStateChange` subscription), so `onSignedIn`/`onSignedUp` need no
 * explicit navigation of their own here. `ResetPassword` is reached via an
 * emailed deep link in production, not a button in this stack — it's
 * registered so it's a valid route, same as every other screen.
 */
export default function AuthNavigator({ client }: AuthNavigatorProps) {
  return (
    <Stack.Navigator initialRouteName="SignIn" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn">
        {({ navigation }) => (
          <SignInScreen
            client={client}
            onNavigateToSignUp={() => navigation.navigate('SignUp')}
            onNavigateToForgotPassword={() => navigation.navigate('ForgotPassword')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="SignUp">
        {({ navigation }) => (
          <SignUpScreen
            client={client}
            onNavigateToSignIn={() => navigation.navigate('SignIn')}
            onViewPrivacyPolicy={() => navigation.navigate('PrivacyPolicy')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="PrivacyPolicy">
        {({ navigation }) => <PrivacyPolicyScreen onClose={() => navigation.goBack()} />}
      </Stack.Screen>
      <Stack.Screen name="ForgotPassword">
        {({ navigation }) => (
          <ForgotPasswordScreen client={client} onNavigateToSignIn={() => navigation.navigate('SignIn')} />
        )}
      </Stack.Screen>
      <Stack.Screen name="ResetPassword">
        {({ navigation }) => <ResetPasswordScreen client={client} onPasswordUpdated={() => navigation.navigate('SignIn')} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
