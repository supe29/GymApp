import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** UX-9: a shared empty-state shape — guides the user to the first action rather than showing a blank screen. */
export default function EmptyState({ title, message, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View testID={testID ?? 'empty-state'} style={styles.container}>
      <Text testID={testID ? `${testID}-title` : 'empty-state-title'} style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable testID={testID ? `${testID}-action` : 'empty-state-action'} style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
