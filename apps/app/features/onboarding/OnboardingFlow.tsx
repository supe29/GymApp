import type { GymSupabaseClient } from 'api-client';
import { useState } from 'react';

import NutritionTargetsScreen from '../plan/NutritionTargetsScreen';
import WorkoutPlanScreen from '../plan/WorkoutPlanScreen';
import ProfileSetupFlow from '../profile/ProfileSetupFlow';

export interface OnboardingFlowProps {
  client?: GymSupabaseClient;
  userId: string;
  onComplete?: () => void;
}

type OnboardingStep = 'profile' | 'plan' | 'targets';

/**
 * Phase 11/UX-1: the end-to-end onboarding sequence (spec.md flow 2.1),
 * composing already-built screens verbatim — no screen is modified to make
 * this work. `ProfileSetupFlow` already includes the mandatory disclaimer
 * acknowledgment as its own final internal step before the profile is even
 * persisted (AC-14), so this flow never renders `DisclaimerScreen` itself.
 * One-time: gated by `AppNavigator.tsx`'s profile-existence check, never
 * re-entered — later edits go through `EditProfileScreen`/
 * `RegeneratePlanPrompt` (FR-1.3).
 */
export default function OnboardingFlow({ client, userId, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('profile');

  if (step === 'profile') {
    return <ProfileSetupFlow client={client} userId={userId} onComplete={() => setStep('plan')} />;
  }

  if (step === 'plan') {
    return <WorkoutPlanScreen client={client} userId={userId} onPlanRegenerated={() => setStep('targets')} />;
  }

  return <NutritionTargetsScreen client={client} userId={userId} onTargetsRegenerated={() => onComplete?.()} />;
}
