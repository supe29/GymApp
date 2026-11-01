-- Exercise type + mechanic, carried over from the source dataset
-- (data/exercises/source/exercises.json `category` / `mechanic`). The plan
-- generator (packages/core/src/planning/planGenerator.ts) needs these to
-- keep stretching/SMR, cardio, plyometric, olympic and strongman movements
-- out of resistance-training sessions, and to order compound lifts before
-- isolation work. Nullable so rows seeded before this migration stay valid
-- until the seed is re-applied.

alter table public.exercises
  add column category text
    check (category in (
      'strength', 'powerlifting', 'olympic_weightlifting', 'strongman',
      'plyometrics', 'stretching', 'cardio'
    )),
  add column mechanic text
    check (mechanic in ('compound', 'isolation'));

comment on column public.exercises.category is
  'Source-dataset exercise type; the plan generator only prescribes strength/powerlifting.';
comment on column public.exercises.mechanic is
  'compound | isolation (null when the source dataset does not say).';
