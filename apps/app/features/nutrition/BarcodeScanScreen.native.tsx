// Phase 9 native adapter (expo-camera). Deliberately thin, mirroring
// BarcodeScanScreen.web.tsx's structure: request camera permission, render
// a scanning view, and call onBarcodeScanned once a barcode is detected.
// Permission-denied also routes to manual entry — never a dead end
// (FR-7.4/AC-10).
//
// UNVERIFIED IN THIS ENVIRONMENT: there is no native iOS/Android runtime
// available here (see docs/deferred-production-checks.md, which already
// documents this same gap for three-model's native adapter) — this file's
// actual camera-to-barcode wiring has not been executed on a device.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface BarcodeScanScreenProps {
  onBarcodeScanned: (barcode: string) => void;
  onManualEntry: () => void;
}

export default function BarcodeScanScreen({ onBarcodeScanned, onManualEntry }: BarcodeScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);

  const handleScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (handledRef.current) return;
      handledRef.current = true;
      onBarcodeScanned(result.data);
    },
    [onBarcodeScanned],
  );

  if (!permission) {
    return (
      <View style={styles.container} testID="barcode-scan-screen-native">
        <Text testID="barcode-scan-checking">Checking camera availability…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container} testID="barcode-scan-screen-native">
        <Text testID="barcode-scan-unavailable-message" style={styles.message}>
          Camera access is needed to scan a barcode. You can still log this food by entering the barcode manually.
        </Text>
        {permission.canAskAgain ? (
          <Pressable testID="barcode-scan-request-permission" style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Allow camera access</Text>
          </Pressable>
        ) : null}
        <Pressable testID="barcode-scan-manual-entry-button" style={styles.button} onPress={onManualEntry}>
          <Text style={styles.buttonText}>Enter barcode manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="barcode-scan-screen-native">
      <CameraView
        testID="barcode-scan-camera-view"
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={handleScanned}
      />
      <Text testID="barcode-scan-scanning-message">Point your camera at a barcode…</Text>
      <Pressable testID="barcode-scan-manual-entry-button" style={styles.button} onPress={onManualEntry}>
        <Text style={styles.buttonText}>Enter barcode manually instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center' },
  camera: { width: '100%', height: 300, borderRadius: 8 },
  message: { textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
