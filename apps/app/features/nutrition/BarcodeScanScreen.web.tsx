import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface BarcodeScanScreenProps {
  onBarcodeScanned: (barcode: string) => void;
  onManualEntry: () => void;
}

type ScanStatus = 'checking' | 'unsupported' | 'permission-denied' | 'scanning' | 'error';

const DETECT_INTERVAL_MS = 300;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: unknown): Promise<DetectedBarcode[]>;
}

/**
 * FR-7.1/UX-7/FR-7.4/AC-10: barcode scanning on web, using the browser's
 * native `BarcodeDetector` API (not universally supported — Safari/Firefox
 * lack it at time of writing) behind a `getUserMedia` camera stream. Per
 * CLAUDE.md's architecture notes, browser camera/barcode APIs are
 * materially less reliable than native ones, so unsupported browsers and
 * denied camera permission both surface a manual-entry affordance
 * immediately rather than leaving the user on a dead scanning screen.
 */
export default function BarcodeScanScreen({ onBarcodeScanned, onManualEntry }: BarcodeScanScreenProps) {
  const [status, setStatus] = useState<ScanStatus>('checking');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const globalWindow = globalThis as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
      navigator?: { mediaDevices?: { getUserMedia: (constraints: { video: boolean }) => Promise<MediaStream> } };
    };

    if (typeof globalWindow.BarcodeDetector === 'undefined') {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const detector = new globalWindow.BarcodeDetector({ formats: ['ean_13', 'upc_a', 'upc_e', 'code_128'] });

    async function start() {
      try {
        const mediaDevices = globalWindow.navigator?.mediaDevices;
        if (!mediaDevices) {
          if (!cancelled) setStatus('unsupported');
          return;
        }
        const stream = await mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('scanning');

        intervalId = setInterval(async () => {
          if (!videoRef.current) return;
          const detected = await detector.detect(videoRef.current);
          if (detected.length > 0 && !cancelled) {
            onBarcodeScanned(detected[0].rawValue);
          }
        }, DETECT_INTERVAL_MS);
      } catch {
        if (!cancelled) setStatus('permission-denied');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'checking') {
    return (
      <View style={styles.container} testID="barcode-scan-screen-web">
        <Text testID="barcode-scan-checking">Checking camera availability…</Text>
      </View>
    );
  }

  if (status === 'unsupported' || status === 'permission-denied') {
    return (
      <View style={styles.container} testID="barcode-scan-screen-web">
        <Text testID="barcode-scan-unavailable-message" style={styles.message}>
          {status === 'unsupported'
            ? "Barcode scanning isn't supported in this browser."
            : 'Camera access was denied.'}{' '}
          You can still log this food by entering the barcode manually.
        </Text>
        <Pressable testID="barcode-scan-manual-entry-button" style={styles.button} onPress={onManualEntry} accessibilityRole="button">
          <Text style={styles.buttonText}>Enter barcode manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="barcode-scan-screen-web">
      <video ref={videoRef} autoPlay muted playsInline style={webVideoStyle} data-testid="barcode-scan-video" />
      <Text testID="barcode-scan-scanning-message">Point your camera at a barcode…</Text>
      <Pressable testID="barcode-scan-manual-entry-button" style={styles.button} onPress={onManualEntry} accessibilityRole="button">
        <Text style={styles.buttonText}>Enter barcode manually instead</Text>
      </Pressable>
    </View>
  );
}

const webVideoStyle = { width: '100%', maxWidth: 360, borderRadius: 8 } as const;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center' },
  message: { textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
