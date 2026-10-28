// Deterministic business logic (planning, nutrition, progression, PRs, units)
// lives here, added phase by phase, independent of UI or the backend.
export * from './validation/profileValidation';
export * from './content/exerciseQueries';
export * from './planning/rules/splitRules';
export * from './planning/rules/splitDayTemplates';
export * from './planning/splitSelector';
export * from './planning/rules/sessionComposition';
export * from './planning/rules/prescriptionRules';
export * from './planning/rules/difficultyGating';
export * from './planning/planGenerator';
export * from './planning/versioning';
