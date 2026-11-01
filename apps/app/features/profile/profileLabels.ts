import type { BiologicalSex, FitnessLevel, Goal } from 'core';

// Display labels for the profile enums, shared by onboarding
// (ProfileSetupFlow) and EditProfileScreen so neither shows raw values
// like "fat_loss" or "prefer_not_to_say".

export const SEX_DISPLAY_LABELS: Record<BiologicalSex, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};

export const GOAL_DISPLAY_LABELS: Record<Goal, string> = {
  fat_loss: 'Fat loss',
  muscle_gain: 'Muscle gain',
  strength: 'Strength',
  general_fitness: 'General fitness',
};

export const FITNESS_LEVEL_DISPLAY_LABELS: Record<FitnessLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
