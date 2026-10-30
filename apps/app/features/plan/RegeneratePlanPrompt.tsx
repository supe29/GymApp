import type { NutritionTargetDiffSummary, PlanDiffSummary } from 'core';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface RegeneratePlanPromptProps {
  /** Omit when this regeneration decision does not affect the workout plan. */
  diffSummary?: PlanDiffSummary | null;
  /** Omit when this regeneration decision does not affect nutrition targets. */
  nutritionDiffSummary?: NutritionTargetDiffSummary | null;
  onAccept: () => void;
  onDecline: () => void;
  accepting?: boolean;
}

function hasPlanChanges(diffSummary: PlanDiffSummary): boolean {
  const { summaryCounts } = diffSummary;
  return (
    diffSummary.splitTypeChanged ||
    summaryCounts.sessionsAdded > 0 ||
    summaryCounts.sessionsRemoved > 0 ||
    summaryCounts.exercisesAdded > 0 ||
    summaryCounts.exercisesRemoved > 0 ||
    summaryCounts.prescriptionsChanged > 0
  );
}

/**
 * FR-2.4/Flow 2.7: shows a preview of what a plan and/or nutrition-target
 * regeneration would change before the user accepts or declines it
 * (diff-before-accept, not accept-then-explain) — a single combined
 * accept/decline decision, matching Flow 2.7's "regenerates workout plan
 * and/or nutrition targets" wording. Shared by the profile-edit-triggered
 * prompt (FR-1.4, EditProfileScreen.tsx — may pass either or both diffs
 * depending on which fields changed), the on-demand workout-plan
 * regenerate action (WorkoutPlanScreen.tsx — plan-only), and the on-demand
 * nutrition regenerate action (NutritionTargetsScreen.tsx — nutrition-only).
 * Pure presentational — no data fetching. Reuses the
 * regenerate-accept/regenerate-decline testIDs that predate this
 * component, so existing test assertions against those testIDs keep
 * passing unchanged.
 */
export default function RegeneratePlanPrompt({
  diffSummary,
  nutritionDiffSummary,
  onAccept,
  onDecline,
  accepting = false,
}: RegeneratePlanPromptProps) {
  const planChanged = Boolean(diffSummary) && hasPlanChanges(diffSummary!);
  const nutritionChanged = Boolean(nutritionDiffSummary) && nutritionDiffSummary!.changed;
  const anyDiffProvided = Boolean(diffSummary) || Boolean(nutritionDiffSummary);
  const hasChanges = planChanged || nutritionChanged;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Update your plan?</Text>
      <Text style={styles.body}>
        This affects your plan — regenerate your workout and nutrition targets now?
      </Text>

      <ScrollView testID="regenerate-plan-diff" style={styles.diffContainer}>
        {anyDiffProvided && !hasChanges ? (
          <Text testID="regenerate-plan-diff-empty" style={styles.diffLine}>
            No structural changes — the regenerated values look the same.
          </Text>
        ) : null}

        {diffSummary && planChanged ? (
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
        ) : null}

        {nutritionDiffSummary && nutritionChanged ? (
          <View testID="regenerate-nutrition-diff">
            <Text style={styles.sessionLine}>Nutrition targets</Text>
            {nutritionDiffSummary.deltas.dailyCalories !== 0 ? (
              <Text testID="regenerate-nutrition-diff-calories" style={styles.diffLine}>
                Calories: {nutritionDiffSummary.previous?.dailyCalories ?? '—'} →{' '}
                {nutritionDiffSummary.next.dailyCalories}
              </Text>
            ) : null}
            {nutritionDiffSummary.deltas.proteinG !== 0 ? (
              <Text testID="regenerate-nutrition-diff-protein" style={styles.diffLine}>
                Protein: {nutritionDiffSummary.previous?.proteinG ?? '—'}g → {nutritionDiffSummary.next.proteinG}g
              </Text>
            ) : null}
            {nutritionDiffSummary.deltas.carbsG !== 0 ? (
              <Text testID="regenerate-nutrition-diff-carbs" style={styles.diffLine}>
                Carbs: {nutritionDiffSummary.previous?.carbsG ?? '—'}g → {nutritionDiffSummary.next.carbsG}g
              </Text>
            ) : null}
            {nutritionDiffSummary.deltas.fatG !== 0 ? (
              <Text testID="regenerate-nutrition-diff-fat" style={styles.diffLine}>
                Fat: {nutritionDiffSummary.previous?.fatG ?? '—'}g → {nutritionDiffSummary.next.fatG}g
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        testID="regenerate-accept"
        style={styles.button}
        disabled={accepting}
        onPress={onAccept}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{accepting ? 'Regenerating…' : 'Regenerate now'}</Text>
      </Pressable>
      <Pressable
        testID="regenerate-decline"
        style={[styles.button, styles.buttonSecondary]}
        onPress={onDecline}
        accessibilityRole="button"
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
