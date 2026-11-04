import { demoForExercise } from './prototypeDemoClips';

// This project's types leave out node, so the file access is typed here.
declare const __dirname: string;
type FileBytes = { toString(encoding: 'utf8', start?: number, end?: number): string; readUInt32LE(offset: number): number };
const { readFileSync } = jest.requireActual('fs') as { readFileSync(path: string): FileBytes };
const { join } = jest.requireActual('path') as { join(...parts: string[]): string };
const { createHash } = jest.requireActual('crypto') as {
  createHash(algorithm: 'sha256'): { update(data: FileBytes | string): { digest(encoding: 'hex'): string } };
};

const ROOT = join(__dirname, '..', '..', '..', '..');

/** Animation names from the GLB's JSON chunk, which follows the 12-byte header and chunk length/type. */
function clipsInAsset(): Set<string> {
  const glb = readFileSync(join(ROOT, 'packages/three-model/assets/body-demo.glb'));
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))) as { animations: { name: string }[] };
  return new Set(json.animations.map((animation) => animation.name));
}

// CI has no Blender to run auditDemoClips.py, so it checks the audit ran against these exact files.
describe('demo clip audit', () => {
  const scripts = 'packages/three-model/scripts';
  const stamped = (readFileSync(join(ROOT, scripts, 'demoClipAudit.baseline.tsv')).toString('utf8').match(/^# sha256 .+$/gm) ?? []).map((line) => line.split(' '));

  test.each([
    ['auditDemoClips.py', join(scripts, 'auditDemoClips.py')],
    ['buildDemoMesh.py', join(scripts, 'buildDemoMesh.py')],
    ['body-demo.glb', 'packages/three-model/assets/body-demo.glb'],
  ])('%s has not changed since the last audit (re-run auditDemoClips.py --update-baseline)', (name, path) => {
    const file = readFileSync(join(ROOT, path));
    // The hash ignores CRLF checkouts of the scripts, as the audit does.
    const contents = name.endsWith('.glb') ? file : file.toString('utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(contents).digest('hex')).toBe(stamped.find((line) => line[2] === name)?.[3]);
  });
});

describe('demoForExercise', () => {
  const exercises = JSON.parse(readFileSync(join(ROOT, 'data/exercises/source/exercises.json')).toString('utf8')) as {
    name: string;
    primaryMuscles: string[];
    equipment: string | null;
  }[];
  const chest = exercises.filter((exercise) => exercise.primaryMuscles.includes('chest'));

  test('every chest exercise has a demo', () => {
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.filter((exercise) => !demoForExercise(exercise.name)).map((exercise) => exercise.name)).toEqual([]);
  });

  test('every back exercise has a demo', () => {
    const back = exercises.filter((exercise) =>
      exercise.primaryMuscles.some((muscle) => ['lats', 'middle back', 'lower back', 'traps'].includes(muscle)),
    );
    expect(back.length).toBeGreaterThan(0);
    expect(back.filter((exercise) => !demoForExercise(exercise.name)).map((exercise) => exercise.name)).toEqual([]);
  });

  test('every shoulder exercise has a demo', () => {
    const shoulders = exercises.filter((exercise) => exercise.primaryMuscles.includes('shoulders'));
    expect(shoulders.length).toBeGreaterThan(0);
    expect(shoulders.filter((exercise) => !demoForExercise(exercise.name)).map((exercise) => exercise.name)).toEqual([]);
  });

  test('every leg exercise has a demo', () => {
    const legs = exercises.filter((exercise) =>
      exercise.primaryMuscles.some((muscle) => ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'].includes(muscle)),
    );
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.filter((exercise) => !demoForExercise(exercise.name)).map((exercise) => exercise.name)).toEqual([]);
  });

  test('every exercise in the dataset has a demo', () => {
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.filter((exercise) => !demoForExercise(exercise.name)).map((exercise) => exercise.name)).toEqual([]);
  });

  test('a cable exercise with a demo shows its cables', () => {
    const cable = exercises.filter((exercise) => exercise.equipment === 'cable' && demoForExercise(exercise.name));
    expect(cable.length).toBeGreaterThan(0);
    expect(cable.filter((exercise) => /cables? (and rope )?not shown|uses cables/i.test(demoForExercise(exercise.name)?.note ?? '')).map((exercise) => exercise.name)).toEqual([]);
  });

  test('every demo plays a clip that exists in body-demo.glb', () => {
    const clips = clipsInAsset();
    const missing = exercises
      .map((exercise) => demoForExercise(exercise.name)?.clip)
      .filter((clip) => clip && !clips.has(clip));
    expect(missing).toEqual([]);
  });

  test('an exercise outside the dataset has no demo', () => {
    expect(demoForExercise('Not A Real Exercise')).toBeNull();
  });

  test('a demo that differs from the exercise says how', () => {
    expect(demoForExercise('Butterfly')?.note).toBe('Machine not shown.');
    expect(demoForExercise('Pushups')?.note).toBeUndefined();
    expect(demoForExercise('Lying Supine Dumbbell Curl')?.note).toMatch(/not shown/);
    expect(demoForExercise('All Fours Quad Stretch')?.note).toMatch(/short of the foot/);
  });

  test('an exercise with its own motion is not mapped to a similar one', () => {
    expect(demoForExercise('Reverse Flyes With External Rotation')?.clip).toBe('reverse_fly_incline_rotate');
  });
});
