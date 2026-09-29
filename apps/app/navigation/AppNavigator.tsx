import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder for the app's navigation tree.
 * Phase 0 only needs a single trivial screen to prove the shared
 * web/iOS/Android codebase boots; real screen routing (auth, onboarding,
 * dashboard, etc.) is wired in by the phases that build those screens,
 * and a real navigation library is introduced in Phase 11.
 */
export default function AppNavigator() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Fitness Coach</Text>
      <Text>Phase 0 scaffold — navigation tree not yet built.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
});
