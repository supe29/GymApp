import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface ManualBarcodeEntryProps {
  notice?: string | null;
  onSubmit: (barcode: string) => void;
  onCancel: () => void;
}

/** FR-7.4/AC-10: the required fallback when a scanned barcode isn't found, or scanning is unavailable/denied — never a dead end. */
export default function ManualBarcodeEntry({ notice, onSubmit, onCancel }: ManualBarcodeEntryProps) {
  const [barcode, setBarcode] = useState('');

  function handleSubmit() {
    if (!barcode.trim()) return;
    onSubmit(barcode.trim());
  }

  return (
    <View style={styles.container} testID="manual-barcode-entry">
      <Text style={styles.title}>Enter barcode manually</Text>
      {notice ? (
        <Text testID="manual-barcode-notice" style={styles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <TextInput
        testID="manual-barcode-input"
        style={styles.input}
        value={barcode}
        onChangeText={setBarcode}
        placeholder="e.g. 012345678905"
        accessibilityLabel="Barcode digits"
        keyboardType="numeric"
        onSubmitEditing={handleSubmit}
      />
      <Pressable
        testID="manual-barcode-submit"
        style={styles.submitButton}
        disabled={!barcode.trim()}
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.submitButtonText}>Look up</Text>
      </Pressable>
      <Pressable testID="manual-barcode-cancel" style={styles.cancelButton} onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  notice: { color: '#8a5a00', backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12 },
  submitButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
