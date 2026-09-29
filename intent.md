# Intent: AI Fitness Coach

## Problem
People pursuing fitness and diet goals today have to piece together multiple disconnected apps — one for workout planning, another for tracking sets and reps, another for calorie/macro tracking, and separate resources entirely to understand which muscles a given exercise or routine actually trains. This fragmentation makes it hard to see the full picture of training and nutrition together, and makes it hard for a beginner to understand *why* a plan is structured the way it is or *what* they're actually working when they train.

## Proposed Outcome
A single application where a user can get a personalized workout and nutrition plan based on who they are and what they want, follow and log that plan day to day, see their progress over time, and visually understand which muscles their training is targeting — without needing to juggle separate gym, calorie-tracking, and diet apps.

## Target Users
People who want to train and manage their diet toward a specific goal (fat loss, muscle gain, strength, or general fitness) and want one platform to plan, execute, and track that journey — from beginners who want guidance and don't know which exercises target which muscles, to more experienced users who want a single place to log workouts and nutrition and see their progress consolidated.

## Core User Experience
- Create a profile with age, height, weight, fitness level, available equipment, and a goal (fat loss, muscle gain, strength, or general fitness).
- Receive a personalized workout plan and daily nutrition targets (calories and macros) generated from that profile.
- Explore an interactive 3D body model to understand which muscles are trained by a given exercise, and use it to discover exercises for a given muscle group.
- Log workouts (sets, reps, weight) against the plan or freeform, with the plan adapting over time based on logged performance (progressive overload).
- Log food eaten and track it against daily calorie/macro targets.
- Track progress over time via weight trend and automatically-derived strength personal records (PRs).

## In Scope
- User profile creation (age, height, weight, fitness level, equipment, goal).
- Personalized workout plan generation based on profile, goal, and available equipment.
- Personalized daily nutrition targets (calories, macros) based on profile and goal.
- Interactive 3D body model with selectable muscle groups, used to browse exercises by muscle.
- Workout logging (sets/reps/weight), freeform or attached to a planned session.
- Automatic, rule-based progressive overload suggestions based on logged workout performance.
- Food logging against nutrition targets, including barcode scanning for packaged foods.
- Progress tracking: weight trend over time and automatically-derived strength PRs.
- Account creation and sign-in (email/password and social login).
- Available on both web and mobile.

## Out of Scope (V1)
- AI/LLM-generated workout or nutrition plans — the actual plan numbers come from deterministic rules/formulas, not a model. An LLM-based coaching/chat layer may be added later strictly as an assistive layer on top, not as the source of plan numbers.
- Prescriptive meal plans or recipes — V1 only sets nutrition targets for the user to log against.
- Muscle-recovery / training-volume heatmap visualization on the 3D model — V1 only supports browsing exercises by muscle.
- Body measurements and progress photos — only weight trend and PRs are tracked in V1.
- Push notifications and reminders of any kind.
- Monetization, subscriptions, or in-app payments — V1 is free with no payment infrastructure.
- Offline-first support — the app requires connectivity, with only best-effort resilience to brief connection drops during workout logging.
- Guest/anonymous usage — an account is required since the experience is inherently personalized.
- Social or community features (sharing, following, leaderboards, etc.).

## Constraints
- **Product**: The app must work as a single coherent product across web and mobile, not two divergent experiences.
- **Safety**: Nutrition targets and workout prescriptions must come from established, deterministic formulas and templates, not free-form AI generation, to avoid unsafe or incoherent recommendations.
- **Scope discipline**: V1 favors a simple, trustworthy core loop (profile → plan → log → track) over breadth of features; anything not essential to that loop is deferred.
- **Privacy**: User health-adjacent data (age, weight, body stats, goals) must be handled with care even though this is not a medical/regulated product; target market and the resulting compliance posture (e.g., GDPR) are still to be determined.
- **Equipment realism**: Generated workout plans must only include exercises the user can actually perform given their declared available equipment.
- **Content dependency**: The exercise library and food database rely on external/open data sources that must be curated for quality and correctly mapped to the app's own muscle-group taxonomy.

## Success Criteria
- A new user can complete profile creation and receive a workout plan and nutrition targets in one sitting.
- Users can log a workout and a day of food intake without confusion or missing data.
- The 3D muscle model correctly reflects which muscles a browsed exercise targets, and users can find exercises by tapping a muscle group.
- Returning users see their plan adapt (progression) and their progress (weight trend, PRs) reflected accurately over time.
- Users engage with the app as their single tool for workout and diet tracking, rather than needing separate apps alongside it.

## Open Questions
- Primary target market/region, and the default unit system (metric vs. imperial) that follows from it.
- Data-privacy/compliance posture required once a target market is chosen (e.g., GDPR obligations for EU users).
- Long-term notification/reminder strategy (deferred entirely for V1, but likely needed for engagement later).
- Future monetization model, once core usage is validated.
- Whether and how an LLM-based coaching/chat layer gets introduced on top of the deterministic plan engine.
