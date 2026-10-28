import type { PlanDiffSummary } from 'core';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface RegeneratePlanPromptProps {
  diffSummary: PlanDiffSummary;
  onAccept: () => void;
  onDecline: () => void;
  accepting?: boolean;
}

/**
 * FR-2.4/Flow 2.7: shows a preview of what a plan regeneration would
 * change before the user accepts or declines it (diff-before-accept, not
 * accept-then-explain). Shared by both the profile-edit-triggered prompt
 * (FR-1.4, EditProfileScreen.tsx) and the on-demand regenerate action
 * (WorkoutPlanScreen.tsx). Pure presentational — no data fetching.
 * Reuses the regenerate-accept/regenerate-decline testIDs that predate
 * this component (they were originally inline markup in
 * EditProfileScreen.tsx), so existing test assertions against those
 * testIDs keep passing unchanged.
 */
export default function RegeneratePlanPrompt({
  diffSummary,
  onAccept,
  onDecline,
  accepting = false,
}: RegeneratePlanPromptProps) {
  const { summaryCounts } = diffSummary;
  const hasChanges =
    diffSummary.splitTypeChanged ||
    summaryCounts.sessionsAdded > 0 ||
    summaryCounts.sessionsRemoved > 0 ||
    summaryCounts.exercisesAdded > 0 ||
    summaryCounts.exercisesRemoved > 0 ||
    summaryCounts.prescriptionsChanged > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Update your plan?</Text>
      <Text style={styles.body}>
        This affects your plan — regenerate your workout and nutrition targets now?
      </Text>

      <ScrollView testID="regenerate-plan-diff" style={styles.diffContainer}>
        {!hasChanges ? (
          <Text testID="regenerate-plan-diff-empty" style={styles.diffLine}>
            No structural changes — the regenerated plan looks the same.
          </Text>
        ) : (
          <>
            {diffSummary.splitTypeChanged ? (
              <Text testID="regenerate-plan-diff-split" style={styles.diffLine}>
                Split: {diffSummary.previousSplitType} → {diffSummary.nextSplitType}
              </Text>
            ) : null}
            {diffSummary.sessionDiffs
              .filter((s) => s.changeType !== 'unchanged')
              .map((session) => (
                <View key={session.dayOrder} testID={`regenerate-plan-diff-session-${session.dayOrder}`}>
                  <Text style={styles.sessionLine}>
                    {session.name} ({session.changeType})
                  </Text>
                  {session.exerciseChanges
                    .filter((c) => c.changeType !== 'unchanged')
                    .map((change) => (
                      <Text key={change.exerciseId} style={styles.diffLine}>
                        {change.changeType === 'added' && `+ ${change.exerciseName}`}
                        {change.changeType === 'removed' && `− ${change.exerciseName}`}
                        {change.changeType === 'prescription_changed' &&
                          `${change.exerciseName}: ${change.previous?.targetSets}×${change.previous?.targetRepsMin}-${change.previous?.targetRepsMax} → ${change.next?.targetSets}×${change.next?.targetRepsMin}-${change.next?.targetRepsMax}`}
                      </Text>
                    ))}
                </View>
              ))}
          </>
        )}
      </ScrollView>

      <Pressable
        testID="regenerate-accept"
        style={styles.button}
        disabled={accepting}
        onPress={onAccept}
      >
        <Text style={styles.buttonText}>{accepting ? 'Regenerating…' : 'Regenerate now'}</Text>
      </Pressable>
      <Pressable
        testID="regenerate-decline"
        style={[styles.button, styles.buttonSecondary]}
        onPress={onDecline}
      >
        <Text style={styles.buttonText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 15, marginBottom: 16 },
  diffContainer: { maxHeight: 280, marginBottom: 16 },
  sessionLine: { fontSize: 14, fontWeight: '600', marginTop: 10 },
  diffLine: { fontSize: 13, marginTop: 4 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonSecondary: { backgroundColor: '#666' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
