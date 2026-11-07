# Measures every clip in buildDemoMesh.py and fails when one gets worse. Run
# headless with Blender 4.x/5.x, after rebuilding body-demo.glb:
#
#   blender -b --factory-startup --python-exit-code 2 --python packages/three-model/scripts/auditDemoClips.py -- \
#     [--update-baseline] [--clips a,b] [--metrics <out.json>] [--source <buildDemoMesh.py>]
#
# Exit code 0 is a pass, 1 a failed check, 2 an error in the script. Two kinds of
# check run:
#
# - EXPECTATIONS are what an exercise must look like (a press locks out, a curl
#   keeps the elbow still). They always fail, and no baseline can excuse them.
# - Flags are general faults (joint limits, a prop through the body or apart from
#   it, a hand short of its target). Some are known and harmless, so each is compared with
#   demoClipAudit.baseline.tsv: a new flag, or one worse than it was, fails.
#
# --update-baseline accepts the current flags and stamps the baseline with hashes
# of this script, buildDemoMesh.py and body-demo.glb. CI has no Blender, so
# prototypeDemoClips.test.ts checks those hashes instead: changing any of the
# three without re-running this audit fails the tests. A baseline change is a
# claim that the new flags are fine, so read its diff.
#
# This shows a clip is physically consistent, not that it is good coaching. New
# or changed clips still need watching against the exercise's instructions.

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser(prog='auditDemoClips.py')
parser.add_argument('--update-baseline', action='store_true')
parser.add_argument('--clips', help='comma-separated clip names; default all')
parser.add_argument('--metrics', help='write the measurements of each clip to this JSON file')
parser.add_argument('--source', help='audit this copy of buildDemoMesh.py instead')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

SCRIPTS = Path(__file__).resolve().parent
BUILD_SCRIPT = SCRIPTS / 'buildDemoMesh.py'
BASELINE = SCRIPTS / 'demoClipAudit.baseline.tsv'
ASSET = SCRIPTS.parent / 'assets' / 'body-demo.glb'

if args.update_baseline and (args.clips or args.source):
    sys.exit('--update-baseline audits the real script over every clip; drop --clips and --source.')

# Everything before the final main() call defines the clips without building the asset.
source = Path(args.source or BUILD_SCRIPT).read_text(encoding='utf8')
build = {'__name__': 'auditDemoClips'}
exec(compile(source[:source.rindex('\nmain()')], str(BUILD_SCRIPT), 'exec'), build)
CLIPS, REST, REPS_LONG, REP_SAMPLES = (build[name] for name in ('CLIPS', 'REST', 'REPS_LONG', 'REP_SAMPLES'))
CYCLE_SECONDS, DIGIT_BONES, GRIP_ALONG = (build[name] for name in ('CYCLE_SECONDS', 'DIGIT_BONES', 'GRIP_ALONG'))

# Props that bear the body, and how far from one it may be (metres, for the capsules in BODY_CAPSULES).
# Held or thrown props are left out, as are racks, which hold the bar and not the body.
SUPPORT_PROPS = ('prop_back_pad', 'prop_bench_decline', 'prop_bench_flat', 'prop_bench_high', 'prop_bench_hyperextension', 'prop_bench_incline', 'prop_bike',
                 'prop_box', 'prop_dip_bars', 'prop_foam_roller', 'prop_leg_pad', 'prop_platform', 'prop_preacher', 'prop_pulldown_seat', 'prop_row_seat',
                 'prop_rower', 'prop_seat', 'prop_seat_pad', 'prop_stability_ball', 'prop_stool', 'prop_wall')
SUPPORT_FLOATS = 0.04
SUPPORT_SINKS = -0.06
BODY_CAPSULES = (('thigh', 0.06), ('shin', 0.04), ('foot', 0.035), ('upper_arm', 0.04), ('forearm', 0.03), ('hand', 0.025))
ALL_SIDES = tuple(Vector(direction) for direction in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)))
# How much worse than its baseline a flag may measure before failing, by unit.
TOLERANCE_DEGREES = 1.0
TOLERANCE_METRES = 0.005
FLAG_IN_DEGREES = {'loop_gap', 'pop', 'elbow_limit', 'knee_limit', 'wrist_limit', 'hip_limit', 'ankle_limit', 'spine_bend', 'spine_twist', 'neck_bend'}

LOCKOUT = ('overhead_press', 'shoulder_press_dumbbell', 'barbell_press_seated', 'barbell_press_behind_neck', 'push_press',
           'machine_overhead_press', 'kettlebell_press', 'kettlebell_jerk', 'jerk_balance', 'clean_and_press', 'clean_and_jerk',
           'power_jerk', 'split_jerk', 'squat_jerk', 'snatch', 'power_snatch', 'split_snatch', 'muscle_snatch', 'hang_snatch',
           'hang_snatch_low', 'snatch_blocks', 'power_snatch_blocks', 'snatch_balance', 'kettlebell_snatch', 'dumbbell_press_seated', 'arnold_press')
BAR_CURLS = ('curl_barbell', 'curl_barbell_close', 'curl_barbell_wide', 'curl_reverse', 'curl_cable', 'curl_cable_reverse', 'curl_cable_hammer')
ARM_CURLS = ('curl_dumbbell', 'curl_hammer', 'curl_preacher', 'curl_preacher_dumbbell', 'curl_incline', 'curl_spider')
TRICEPS = ('triceps_pushdown', 'triceps_pushdown_reverse', 'triceps_pushdown_rope', 'triceps_pushdown_close')
UPRIGHT_ROWS = ('upright_row', 'upright_row_dumbbell', 'upright_row_cable')
STRAIGHT_LEG_RAISES = ('hanging_leg_raise', 'leg_raise_bench', 'jackknife')
DIPS = ('dips', 'dips_upright', 'dips_rings', 'bench_dip')

# (clips, measurement, statistic, lowest allowed, highest allowed, what it protects).
# A * in the measurement is checked on both sides of the body.
EXPECTATIONS = (
    # At the hands' highest point, because the arms of a low catch are straight too.
    (LOCKOUT, 'elbow*', 'at_top', None, 15, 'the arms straighten at the top'),
    (LOCKOUT, 'hand_rel_z*', 'at_top', 0.55, None, 'the hands finish overhead'),
    (DIPS + ('handstand_pushup',), 'elbow*', 'min', None, 16, 'the arms straighten at the top'),
    (BAR_CURLS + ARM_CURLS + TRICEPS, 'elev*', 'range', None, 3, 'the upper arms stay still'),
    (BAR_CURLS + ARM_CURLS + TRICEPS, 'elbow*', 'range', 90, None, 'the elbows do the work'),
    (UPRIGHT_ROWS, 'elev*', 'max', 85, 105, 'the elbows rise to about shoulder height'),
    (STRAIGHT_LEG_RAISES, 'knee*', 'max', None, 20, 'the legs stay straight'),
    (('hanging_leg_raise', 'leg_raise_bench'), 'legs_to_torso*', 'min', None, 105, 'the legs rise to about 90 degrees from the torso'),
    (('handstand_pushup',), 'chest_y', 'min', 0.8, None, 'the back is to the wall'),
    (('stretch_side_quad',), 'hand_to_foot_near', 'min', None, 0.05, 'the hand reaches the foot'),
    (('stretch_knee_to_chest', 'stretch_90_90', 'stretch_ankle_on_knee'), 'hands_to_held_leg', 'max', None, 0.1, 'both hands hold the raised leg'),
)
# Rolling clips: the part being rolled rests on the roller, neither above it nor sunk into it,
# and the roller travels along that part. Limits are for the capsules in ROLLER_PARTS.
for clips, part, travel, why in ((('smr_hamstring', 'smr_quad', 'smr_side'), 'thigh_l', 0.2, 'the roller runs from below the hip to above the knee'),
                                 (('smr_calf', 'smr_peroneal'), 'shin_l', 0.2, 'the roller runs from below the knee to above the ankle'),
                                 (('foam_roll_lower_back',), 'torso', 0.08, 'the roller runs over the lower back')):
    EXPECTATIONS += ((clips, f'roller_gap_{part}', 'max', None, 0.03, f'the {part} rests on the roller'),
                     (clips, f'roller_gap_{part}', 'min', -0.045, None, f'the roller does not pass through the {part}'),
                     (clips, f'roller_along_{part}', 'range', travel, None, why))
EXPECTATIONS += ((('foam_roll_lower_back',), 'roller_along_torso', 'max', None, 0.3, 'the roller stays under the lower back, not the upper'),)
# Clips whose whole rep rests on a prop: never above it, nor sunk into it. Clips that step or jump onto one only must not pass through it.
EXPECTATIONS += (
    (('ball_leg_curl', 'ball_pull_in'), 'support_gap_prop_stability_ball', 'max', None, SUPPORT_FLOATS, 'the legs rest on the ball'),
    (('ball_leg_curl', 'ball_pull_in', 'hyperextension_ball', 'stretch_ball_pyramid'), 'support_gap_prop_stability_ball', 'min', SUPPORT_SINKS, None, 'the body does not pass through the ball'),
    (('step_up_bar', 'step_up_dumbbell', 'step_up_knee', 'box_jump', 'box_jump_seated', 'box_jump_side', 'box_over', 'depth_jump', 'bench_dip'), 'support_gap_prop_box', 'min', SUPPORT_SINKS, None, 'the body does not pass through the box'),
)
# The torso turns towards the hands. Measured as a correlation over the rep.
TURN_WITH_HANDS = ('wood_chop_down', 'wood_chop_up', 'spell_caster', 'landmine_180')
TURN_CORRELATION = 0.8


def bone_dir(pose, name):
    head, tail, _ = REST[name]
    return pose.rotation[name] @ (tail - head)


def tail_of(pose, name):
    return pose.head[name] + bone_dir(pose, name)


def angle(a, b):
    return math.degrees(a.angle(b)) if a.length > 1e-6 and b.length > 1e-6 else 0.0


def segment_distance(point, a, b):
    along = b - a
    t = max(0.0, min(1.0, (point - a).dot(along) / max(along.length_squared, 1e-9)))
    return (point - (a + along * t)).length


def segments_distance(a0, a1, b0, b1, steps=8):
    return min(segment_distance(a0.lerp(a1, i / steps), b0, b1) for i in range(steps + 1))


def grip_of(pose, side):
    grip = pose.grips.get(side)
    if grip is not None:
        return grip
    return tail_of(pose, f'forearm_twist{side}') + bone_dir(pose, f'hand{side}').normalized() * GRIP_ALONG


# Part -> (first bone, last bone, radius). A roller is long with vertices only at its ends, so props' vertices can't test it.
ROLLER_PARTS = {'torso': ('hips', 'spine2', 0.09), 'thigh_l': ('thigh_l', 'thigh_l', 0.06), 'shin_l': ('shin_l', 'shin_l', 0.04)}


def measure_roller(pose, m):
    at, rotation = pose.props['prop_foam_roller']
    axis = rotation @ Vector((1, 0, 0))
    for part, (first, last, radius) in ROLLER_PARTS.items():
        a, b = pose.head[first], tail_of(pose, last)
        gaps = []
        for i in range(41):
            rel = a.lerp(b, i / 40) - at
            gaps.append(((rel - axis * rel.dot(axis)).length - build['ROLLER_RADIUS'] - radius, i / 40 * (b - a).length))
        m[f'roller_gap_{part}'], m[f'roller_along_{part}'] = min(gaps)


def support_gap(pose, bone):
    """Signed distance from the body to a prop's true surface. A point is inside only if the prop surrounds it on all sides: normals on joined parts can't be trusted."""
    tree = SUPPORT_TREES[bone]
    at, rotation = pose.props[bone]
    inverse = rotation.inverted()
    head_mid = pose.head['head'].lerp(tail_of(pose, 'head'), 0.5)
    capsules = [(pose.head['hips'], tail_of(pose, 'spine2'), 0.09), (head_mid, head_mid, 0.085)]
    for side in ('_l', '_r'):
        capsules += [(pose.head[part + side], tail_of(pose, part + side), radius) for part, radius in BODY_CAPSULES]
    nearest = math.inf
    for a, b, radius in capsules:
        for i in range(9):
            point = inverse @ (a.lerp(b, i / 8) - at)
            distance = (point - tree.find_nearest(point)[0]).length
            inside = all(tree.ray_cast(point, direction)[0] is not None for direction in ALL_SIDES)
            nearest = min(nearest, (-distance if inside else distance) - radius)
    return nearest


def measure(pose):
    m = {}
    if 'prop_foam_roller' in pose.props:
        measure_roller(pose, m)
    for bone in SUPPORT_TREES.keys() & pose.props.keys():
        m[f'support_gap_{bone}'] = support_gap(pose, bone)
    trunk = pose.rotation['spine2']
    up = trunk @ Vector((0, 0, 1))
    chest = trunk @ Vector((0, -1, 0))
    m['hips_z'] = pose.head['hips'].z
    m['chest_y'] = chest.y
    # Positive turns to the figure's left, towards +x.
    m['turn'] = math.degrees(math.atan2(chest.x, -chest.y))
    m['hands_x'] = (grip_of(pose, '_l').x + grip_of(pose, '_r').x) / 2
    m['spine_bend'] = angle(pose.rotation['hips'] @ Vector((0, 0, 1)), up)
    m['spine_twist'] = angle(pose.rotation['hips'] @ Vector((1, 0, 0)), trunk @ Vector((1, 0, 0)))
    m['neck_bend'] = angle(up, pose.rotation['head'] @ Vector((0, 0, 1)))
    m['lowest'] = min(min(pose.head[name].z, tail_of(pose, name).z) for name in REST)
    for side, letter in (('_l', 'L'), ('_r', 'R')):
        upper, fore, twist, hand = (f'{bone}{side}' for bone in ('upper_arm', 'forearm', 'forearm_twist', 'hand'))
        m[f'elbow{letter}'] = angle(bone_dir(pose, upper), bone_dir(pose, fore))
        m[f'elev{letter}'] = angle(trunk.inverted() @ bone_dir(pose, upper), Vector((0, 0, -1)))
        m[f'wrist{letter}'] = angle(bone_dir(pose, twist), bone_dir(pose, hand))
        m[f'hand_z{letter}'] = grip_of(pose, side).z
        m[f'hand_rel_z{letter}'] = (trunk.inverted() @ (grip_of(pose, side) - pose.head[upper])).z
        thigh, shin, foot = f'thigh{side}', f'shin{side}', f'foot{side}'
        thigh_dir, shin_dir = bone_dir(pose, thigh), bone_dir(pose, shin)
        m[f'knee{letter}'] = angle(thigh_dir, shin_dir)
        m[f'knee_back{letter}'] = shin_dir.normalized().dot(pose.rotation[thigh] @ Vector((0, 1, 0)))
        m[f'hip{letter}'] = angle(pose.rotation['hips'].inverted() @ thigh_dir, Vector((0, 0, -1)))
        # 180 is the leg in line with the torso, 90 a right angle. Measured against the torso
        # rather than the pelvis, which rolls during a raise.
        m[f'legs_to_torso{letter}'] = 180 - angle(thigh_dir, up * -1)
        foot_rest, shin_rest = REST[foot][1] - REST[foot][0], REST[shin][1] - REST[shin][0]
        m[f'foot_shin{letter}'] = abs(angle(bone_dir(pose, foot), shin_dir) - angle(foot_rest, shin_rest))
    for hand_side, hand_letter in (('_l', 'L'), ('_r', 'R')):
        grip = grip_of(pose, hand_side)
        for leg_side, leg_letter in (('_l', 'L'), ('_r', 'R')):
            thigh, shin, foot = f'thigh{leg_side}', f'shin{leg_side}', f'foot{leg_side}'
            m[f'hand{hand_letter}_to_leg{leg_letter}'] = min(segment_distance(grip, pose.head[thigh], tail_of(pose, thigh)),
                                                             segment_distance(grip, pose.head[shin], tail_of(pose, shin)))
            m[f'hand{hand_letter}_to_foot{leg_letter}'] = segment_distance(grip, pose.head[foot], tail_of(pose, foot))
    m['hand_to_foot_near'] = min(m[f'hand{h}_to_foot{l}'] for h in 'LR' for l in 'LR')
    # Whichever leg both hands are on: wrong-leg holds leave one hand far from it.
    m['hands_to_held_leg'] = min(max(m[f'handL_to_leg{l}'], m[f'handR_to_leg{l}']) for l in 'LR')
    return m


def bar_gap(pose):
    gaps = []
    for bone in ('prop_barbell', 'prop_pole', 'prop_bar_loaded', 'prop_pullup_bar'):
        if bone not in pose.props:
            continue
        at, rotation = pose.props[bone]
        axis = rotation @ Vector((1, 0, 0))
        for side in ('_l', '_r'):
            grip = pose.grips.get(side)
            if grip is not None:
                rel = grip - at
                gaps.append((rel - axis * rel.dot(axis)).length)
    return max(gaps) if gaps else None


def body_capsules(pose):
    head_mid = pose.head['head'] + (tail_of(pose, 'head') - pose.head['head']) * 0.5
    capsules = [('torso', pose.head['hips'], tail_of(pose, 'spine2'), 0.09), ('head', head_mid, head_mid, 0.085)]
    for side in ('_l', '_r'):
        capsules.append((f'thigh{side}', pose.head[f'thigh{side}'], tail_of(pose, f'thigh{side}'), 0.055))
        capsules.append((f'shin{side}', pose.head[f'shin{side}'], tail_of(pose, f'shin{side}'), 0.035))
    return capsules


def prop_points(pose, bone, at, rotation, count):
    verts = PROP_VERTS[bone]
    stretch = pose.prop_stretch.get(bone, 1)
    return [at + rotation @ Vector((v.x * stretch, v.y, v.z)) for v in verts[::max(1, len(verts) // count)]]


def prop_hits(pose):
    worst = {}
    for bone, (at, rotation) in pose.props.items():
        points = prop_points(pose, bone, at, rotation, 60)
        for part, a, b, radius in body_capsules(pose):
            nearest = min(segment_distance(point, a, b) for point in points)
            if nearest < radius:
                worst[f'{bone}/{part}'] = max(worst.get(f'{bone}/{part}', 0.0), radius - nearest)
    return worst


def prop_lowest(pose):
    return min((point.z for bone, (at, rotation) in pose.props.items() for point in prop_points(pose, bone, at, rotation, 80)), default=1.0)


def arm_in_torso(pose):
    worst = 0.0
    for side in ('_l', '_r'):
        worst = max(worst, 0.075 - segments_distance(pose.head[f'forearm{side}'], tail_of(pose, f'forearm_twist{side}'),
                                                     pose.head['hips'], tail_of(pose, 'spine2')))
    return worst


def rotation_jump(a, b):
    worst = 0.0
    for name in REST:
        if name[:-2] not in DIGIT_BONES:
            turned = math.degrees(a.rotation[name].rotation_difference(b.rotation[name]).angle)
            worst = max(worst, min(turned, 360 - turned))
    return worst


def correlation(xs, ys):
    mean_x, mean_y = sum(xs) / len(xs), sum(ys) / len(ys)
    spread = math.sqrt(sum((x - mean_x) ** 2 for x in xs) * sum((y - mean_y) ** 2 for y in ys))
    return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / spread if spread > 1e-9 else 0.0


def flags_for(poses, measures, is_cycle, limb_gaps):
    flags = {}

    def flag(kind, subject, value, threshold):
        if value > threshold:
            flags[(kind, subject)] = round(value, 3)

    def peak(key):
        return max(m[key] for m in measures)

    flag('loop_gap', '', rotation_jump(poses[0], poses[-1]), 3)
    if not is_cycle:
        flag('pop', '', max(rotation_jump(a, b) for a, b in zip(poses, poses[1:])), 45)
    flag('below_floor', '', -min(m['lowest'] for m in measures), 0.01)
    flag('prop_below_floor', '', -min(prop_lowest(pose) for pose in poses), 0.02)
    flag('hand_off_bar', '', max((gap for gap in map(bar_gap, poses) if gap is not None), default=0.0), 0.02)
    for letter in 'LR':
        flag('elbow_limit', letter, peak(f'elbow{letter}'), 160)
        flag('knee_limit', letter, peak(f'knee{letter}'), 160)
        flag('wrist_limit', letter, peak(f'wrist{letter}'), 95)
        flag('hip_limit', letter, peak(f'hip{letter}'), 135)
        flag('ankle_limit', letter, peak(f'foot_shin{letter}'), 65)
        backwards = [-m[f'knee_back{letter}'] for m in measures if m[f'knee{letter}'] > 15]
        flag('knee_backwards', letter, max(backwards, default=0.0), 0.1)
    flag('spine_bend', '', peak('spine_bend'), 75)
    flag('spine_twist', '', peak('spine_twist'), 70)
    flag('neck_bend', '', peak('neck_bend'), 70)
    hits = {}
    for pose in poses:
        for subject, depth in prop_hits(pose).items():
            hits[subject] = max(hits.get(subject, 0.0), depth)
    for subject, depth in hits.items():
        flag('prop_through_body', subject, depth, 0.02)
    flag('arm_through_torso', '', max(arm_in_torso(pose) for pose in poses), 0.03)
    for bone in SUPPORT_TREES.keys() & poses[0].props.keys():
        flag('prop_floating', bone, peak(f'support_gap_{bone}'), SUPPORT_FLOATS)
        flag('prop_sinking', bone, -min(m[f'support_gap_{bone}'] for m in measures), -SUPPORT_SINKS)
    for subject, gap in limb_gaps.items():
        flag('limb_short', subject, gap, 0.025)
    return flags


def expectation_failures(name, measures):
    failures = []
    for clips, metric, statistic, low, high, why in EXPECTATIONS:
        if name not in clips:
            continue
        for key in ([metric.replace('*', 'L'), metric.replace('*', 'R')] if '*' in metric else [metric]):
            values = [m[key] for m in measures]
            top = max(measures, key=lambda m: m['hand_zL'] + m['hand_zR'])
            value = {'min': min(values), 'max': max(values), 'range': max(values) - min(values), 'at_top': top[key]}[statistic]
            if (low is not None and value < low) or (high is not None and value > high):
                failures.append(f'{name}: {why}: {statistic} {key} is {value:.2f}, allowed {low} to {high}')
    if name in TURN_WITH_HANDS:
        value = correlation([m['turn'] for m in measures], [m['hands_x'] for m in measures])
        if value < TURN_CORRELATION:
            failures.append(f'{name}: the torso turns towards the hands: correlation is {value:.2f}, needs {TURN_CORRELATION}')
    return failures


def file_hash(path):
    data = path.read_bytes()
    # Git may check text out with CRLF; the asset is compared byte for byte.
    if path.suffix != '.glb':
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def read_baseline():
    baseline = {}
    if BASELINE.exists():
        for row in BASELINE.read_text(encoding='utf8').splitlines():
            if row and not row.startswith('#'):
                clip, kind, subject, value = row.split('\t')
                baseline[(clip, kind, subject)] = float(value)
    return baseline


def write_baseline(found):
    lines = [f'# sha256 {path.name} {file_hash(path)}' for path in (Path(__file__).resolve(), BUILD_SCRIPT, ASSET)]
    lines += ['\t'.join((*key, f'{value:.3f}')) for key, value in sorted(found.items())]
    with BASELINE.open('w', encoding='utf8', newline='\n') as output:
        output.write('\n'.join(lines) + '\n')


def worse_than(kind, value, known):
    return value > known + (TOLERANCE_DEGREES if kind in FLAG_IN_DEGREES else TOLERANCE_METRES)


# Props have to exist as meshes to know their shape; the scene is otherwise untouched.
bpy.ops.wm.read_factory_settings(use_empty=True)
PROP_VERTS, SUPPORT_TREES = {}, {}
for mesh_name in build['PROP_MESHES']:
    prop = build['add_prop'](mesh_name)
    bone = mesh_name.replace('-', '_')
    PROP_VERTS[bone] = [v.co.copy() for v in prop.data.vertices]
    if bone in SUPPORT_PROPS:
        SUPPORT_TREES[bone] = BVHTree.FromPolygons(PROP_VERTS[bone], [list(polygon.vertices) for polygon in prop.data.polygons])
    bpy.data.objects.remove(prop)

# Limbs that stop short of their target are only visible inside the solvers, so wrap them.
limb_gaps = {}
solve_arm, solve_leg = build['apply_arm'], build['apply_leg']


def note_gap(subject, gap):
    limb_gaps[subject] = max(limb_gaps.get(subject, 0.0), gap)


def apply_arm(pose, side, clavicle, grip, pole, palm, *rest, **options):
    solved = solve_arm(pose, side, clavicle, grip, pole, palm, *rest, **options)
    note_gap(f'arm{side}', (Vector(grip) - solved[1]).length)
    return solved


def apply_leg(pose, side, ankle, foot_rotation, pole):
    solve_leg(pose, side, ankle, foot_rotation, pole)
    note_gap(f'leg{side}', (Vector(ankle) - pose.head[f'foot{side}']).length)


build['apply_arm'], build['apply_leg'] = apply_arm, apply_leg

names = args.clips.split(',') if args.clips else list(CLIPS)
unknown = [name for name in names if name not in CLIPS]
if unknown:
    sys.exit(f'Unknown clips: {unknown}')
missing = sorted({clip for clips, *_ in EXPECTATIONS for clip in clips}.union(TURN_WITH_HANDS) - set(CLIPS))
if missing:
    sys.exit(f'EXPECTATIONS names clips that no longer exist: {missing}')

found, failures, metrics = {}, [], {}
for name in names:
    limb_gaps.clear()
    samples = REP_SAMPLES * REPS_LONG.get(name, 1)
    poses = [CLIPS[name][0](i / samples) for i in range(samples + 1)]
    measures = [measure(pose) for pose in poses]
    for (kind, subject), value in flags_for(poses, measures, name in CYCLE_SECONDS, limb_gaps).items():
        found[(name, kind, subject)] = value
    failures += expectation_failures(name, measures)
    if args.metrics:
        metrics[name] = {key: {'start': round(measures[0][key], 3), 'mid': round(measures[samples // 2][key], 3),
                               'min': round(min(m[key] for m in measures), 3), 'max': round(max(m[key] for m in measures), 3)}
                         for key in measures[0]}

if args.metrics:
    Path(args.metrics).write_text(json.dumps(metrics), encoding='utf8')

baseline = read_baseline()
regressions = [f'{clip}: new or worse {kind} {subject}: {value:.3f} (baseline {baseline.get((clip, kind, subject), "none")})'
               for (clip, kind, subject), value in sorted(found.items())
               if (clip, kind, subject) not in baseline or worse_than(kind, value, baseline[(clip, kind, subject)])]
cleared = [key for key in baseline if key[0] in names and key not in found]

print(f'AUDIT {len(names)} clips, {len(found)} flags, {len(failures)} expectations failed, {len(regressions)} regressions, {len(cleared)} flags cleared')
for line in failures + regressions:
    print(f'  {line}')
if failures:
    print('Expectations cannot be accepted into the baseline: fix the clip, or the expectation if it is wrong.')
    sys.exit(1)
if args.update_baseline:
    write_baseline(found)
    print(f'Baseline updated: {BASELINE.name}')
elif regressions:
    print('Fix the clip, or if the flag is harmless accept it with --update-baseline.')
    sys.exit(1)
