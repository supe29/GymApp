import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface RestTimerProps {
  durationSeconds?: number;
  onComplete?: () => void;
}

const DEFAULT_DURATION_SECONDS = 90;

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** FR-5.4/UX-4: a rest timer between logged sets, with a large glanceable countdown display. */
export default function RestTimer({ durationSeconds = DEFAULT_DURATION_SECONDS, onComplete }: RestTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  useEffect(() => {
    if (running && remainingSeconds === 0) {
      setRunning(false);
      onComplete?.();
    }
  }, [running, remainingSeconds, onComplete]);

  function handleStart() {
    if (remainingSeconds === 0) {
      setRemainingSeconds(durationSeconds);
    }
    setRunning(true);
  }
  function handlePause() {
    setRunning(false);
  }
  function handleReset() {
    setRunning(false);
    setRemainingSeconds(durationSeconds);
  }

  return (
    <View style={styles.container}>
      <Text testID="rest-timer-display" style={styles.display}>
        {formatTime(remainingSeconds)}
      </Text>
      <View style={styles.controls}>
        <Pressable testID="rest-timer-start" style={styles.button} onPress={handleStart} accessibilityRole="button" accessibilityState={{ disabled: running }}>
          <Text style={styles.buttonText}>{running ? 'Running' : 'Start'}</Text>
        </Pressable>
        <Pressable testID="rest-timer-pause" style={[styles.button, styles.buttonSecondary]} onPress={handlePause} accessibilityRole="button">
          <Text style={styles.buttonText}>Pause</Text>
        </Pressable>
        <Pressable testID="rest-timer-reset" style={[styles.button, styles.buttonSecondary]} onPress={handleReset} accessibilityRole="button">
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 16 },
  display: { fontSize: 48, fontWeight: '700', marginBottom: 12 },
  controls: { flexDirection: 'row', gap: 10 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  buttonSecondary: { backgroundColor: '#666' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
