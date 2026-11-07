# Builds packages/three-model/assets/body-demo.glb, the rigged figure that
# demonstrates exercises, from body-model.glb (CC BY-SA 4.0, see
# docs/licensing/anatomical-mesh-license.md). Run headless with Blender 4.x/5.x:
#
#   blender -b --factory-startup --python packages/three-model/scripts/buildDemoMesh.py -- \
#     packages/three-model/assets/body-model.glb <out.glb> [<preview dir> [<clip,clip> [<preview px>]]]
#
# The body stays one mesh per `region-<muscle group key>` so highlighting
# works as on the main model. Every clip is one rep of a movement pattern,
# named after the pattern; a clip is computed with inverse kinematics at each
# sample, so feet stay planted and hands stay on the bar. Authoring space is
# that of the Z-Anatomy file: metres, z up, the figure faces -y, its left is +x.

import math
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 24
REP_SECONDS = 3
REP_SAMPLES = 16
# Triangle share kept from body-model.glb (the demo is drawn smaller and animated).
KEEP = 0.42
HIDDEN_SCALE = 1e-4

# Bone -> (head, tail, parent), left side only for limbs; right copies are mirrored.
CENTER_BONES = {
    'hips': ((0, 0.03, 0.90), (0, 0.035, 0.98), None),
    'spine1': ((0, 0.035, 0.98), (0, 0.04, 1.14), 'hips'),
    'spine2': ((0, 0.04, 1.14), (0, 0.03, 1.45), 'spine1'),
    'neck': ((0, 0.03, 1.45), (0, 0.025, 1.55), 'spine2'),
    'head': ((0, 0.025, 1.55), (0, 0.0, 1.68), 'neck'),
}
SIDE_BONES = {
    'clavicle': ((0.02, -0.03, 1.405), (0.165, 0.025, 1.40), 'spine2'),
    'upper_arm': ((0.165, 0.025, 1.40), (0.225, 0.035, 1.095), 'clavicle'),
    'forearm': ((0.225, 0.035, 1.095), (0.245, 0.012, 0.975), 'upper_arm'),
    'forearm_twist': ((0.245, 0.012, 0.975), (0.263, -0.013, 0.858), 'forearm'),
    'hand': ((0.263, -0.013, 0.858), (0.285, -0.03, 0.775), 'forearm_twist'),
    # Digits run along the Z-Anatomy finger bones; every joint is where two of them meet.
    'index1': ((0.298, -0.038, 0.769), (0.308, -0.053, 0.733), 'hand'),
    'index2': ((0.308, -0.053, 0.733), (0.314, -0.072, 0.720), 'index1'),
    'index3': ((0.314, -0.072, 0.720), (0.317, -0.088, 0.708), 'index2'),
    'middle1': ((0.281, -0.039, 0.772), (0.278, -0.060, 0.731), 'hand'),
    'middle2': ((0.278, -0.060, 0.731), (0.283, -0.081, 0.710), 'middle1'),
    'middle3': ((0.283, -0.081, 0.710), (0.287, -0.095, 0.698), 'middle2'),
    'ring1': ((0.256, -0.036, 0.773), (0.259, -0.058, 0.737), 'hand'),
    'ring2': ((0.259, -0.058, 0.737), (0.259, -0.080, 0.717), 'ring1'),
    'ring3': ((0.259, -0.080, 0.717), (0.261, -0.095, 0.712), 'ring2'),
    'pinky1': ((0.236, -0.038, 0.781), (0.235, -0.055, 0.750), 'hand'),
    'pinky2': ((0.235, -0.055, 0.750), (0.228, -0.070, 0.734), 'pinky1'),
    'pinky3': ((0.228, -0.070, 0.734), (0.229, -0.081, 0.723), 'pinky2'),
    'thumb1': ((0.286, -0.024, 0.843), (0.319, -0.051, 0.817), 'hand'),
    'thumb2': ((0.319, -0.051, 0.817), (0.3215, -0.060, 0.787), 'thumb1'),
    'thumb3': ((0.3215, -0.060, 0.787), (0.333, -0.071, 0.767), 'thumb2'),
    'thigh': ((0.09, 0.012, 0.86), (0.075, 0.03, 0.435), 'hips'),
    'shin': ((0.075, 0.03, 0.435), (0.073, 0.037, 0.078), 'thigh'),
    'foot': ((0.073, 0.037, 0.078), (0.071, -0.08, 0.02), 'shin'),
}
FINGERS = ('index', 'middle', 'ring', 'pinky')
THUMB = ('thumb1', 'thumb2', 'thumb3')
DIGIT_BONES = tuple(f'{finger}{joint}' for finger in FINGERS for joint in (1, 2, 3)) + THUMB
ARM_CHAIN = ('clavicle', 'upper_arm', 'forearm', 'forearm_twist', 'hand', *DIGIT_BONES)
LEG_CHAIN = ('thigh', 'shin', 'foot')
TORSO = ('hips', 'spine1', 'spine2')

# Which bones may move each named mesh (keeps a muscle from following a limb
# that merely passes close to it, such as the hand beside the thigh).
LEG_REGIONS = {'quadriceps', 'hamstrings', 'adductors', 'abductors', 'glutes', 'calves'}
ARM_REGIONS = {'biceps', 'triceps', 'forearms'}
# Below the armpit, only tissue this far out from the midline can be arm (metres).
ARM_GATE_MIN_Z = 1.18
ARM_BESIDE_HIP_MIN_X = 0.175
# The rest-pose box the hands lie in (metres).
HAND_MIN_X = 0.2
HAND_MAX_Z = 0.88
# A handle sits this far from the wrist: along the hand and out from the palm (metres).
GRIP_ALONG = 0.085
GRIP_PALM = 0.03
GRIP_OFFSET = math.hypot(GRIP_ALONG, GRIP_PALM)
# The wrist cocks back by this much, which stacks the handle over the forearm.
WRIST_TILT = math.atan2(GRIP_PALM, GRIP_ALONG)
# Each finger joint's bend, as a share of `curl`: knuckle, middle, end. At 75 they wrap a bar.
FINGER_CURL_SHARE = (0.93, 1.2, 0.93)
# The thumb at full grip (degrees): swung across the palm, then each joint folded towards the fingers.
THUMB_OPPOSE = 50
THUMB_FOLD = (0, 25, 60)
FULL_GRIP_CURL = 75
TWIST_FADE = math.radians(30)


def in_hand(point):
    return abs(point.x) > HAND_MIN_X and point.z < HAND_MAX_Z


def mirrored(point):
    return Vector((-point[0], point[1], point[2]))


def rest_bones():
    bones = {}
    for name, (head, tail, parent) in CENTER_BONES.items():
        bones[name] = (Vector(head), Vector(tail), parent)
    for name, (head, tail, parent) in SIDE_BONES.items():
        center = parent in CENTER_BONES
        bones[f'{name}_l'] = (Vector(head), Vector(tail), parent if center else f'{parent}_l')
        bones[f'{name}_r'] = (mirrored(head), mirrored(tail), parent if center else f'{parent}_r')
    return bones


REST = rest_bones()


def bone_length(name):
    head, tail, _ = REST[name]
    return (tail - head).length


def segment_distance(point, head, tail):
    axis = tail - head
    t = max(0.0, min(1.0, (point - head).dot(axis) / axis.length_squared))
    return (point - (head + axis * t)).length


def neighbours(name):
    parent = REST[name][2]
    out = {name}
    if parent:
        out.add(parent)
    out.update(child for child, (_, _, p) in REST.items() if p == name)
    return out


def candidate_bones(mesh_name, x):
    side = '_l' if x >= 0 else '_r'
    legs = [f'{b}{side}' for b in LEG_CHAIN]
    arms = [f'{b}{side}' for b in ARM_CHAIN]
    region = mesh_name[len('region-'):] if mesh_name.startswith('region-') else None
    if region in LEG_REGIONS:
        return ['hips', *legs]
    if region in ARM_REGIONS:
        return arms[1:]
    if region == 'traps' or region == 'neck':
        return ['spine2', 'neck', 'head', arms[0]]
    if region is not None:
        return [*TORSO, 'neck', *arms[:2]]
    return [*TORSO, 'neck', 'head', *legs, *arms]


def smoothstep(low, high, value):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def arm_gate(mesh_name, point):
    """How far a vertex may follow the arm bones: torso tissue only near the shoulder and humerus.

    Without this, the lats and ribs beside the hanging arm rise with it. Arm
    muscles are exempt. The result fades to 0 medial of the humerus.
    """
    region = mesh_name[len('region-'):] if mesh_name.startswith('region-') else None
    if region in ARM_REGIONS or region == 'shoulders':
        return 1.0
    x, z = abs(point.x), point.z
    if z < ARM_GATE_MIN_Z:
        return 1.0 if x >= ARM_BESIDE_HIP_MIN_X else 0.0
    head, tail, _ = REST['upper_arm_l']
    humerus_x = head.x + (tail.x - head.x) * max(0.0, min(1.0, (head.z - z) / (head.z - tail.z)))
    return smoothstep(-0.05, -0.012, x - humerus_x)


def is_digit(name):
    return name[:-2] in DIGIT_BONES


def past_knuckle(name, point):
    """Whether a vertex can belong to this finger bone: the back of the hand stays rigid as fingers curl."""
    finger, side = name[:-3], name[-2:]
    if finger not in FINGERS:
        return True
    head, tail, _ = REST[f'{finger}1{side}']
    return (point - head).dot(tail - head) > -0.002


def add_weights(obj):
    is_bone = obj.name == 'bone'
    groups = {name: obj.vertex_groups.new(name=name) for name in REST}
    matrix = obj.matrix_world
    arm_bones = {f'{b}{side}' for b in ARM_CHAIN[1:] for side in ('_l', '_r')}
    for vertex in obj.data.vertices:
        point = matrix @ vertex.co
        gate = arm_gate(obj.name, point)
        distances = {
            name: segment_distance(point, REST[name][0], REST[name][1])
            for name in candidate_bones(obj.name, point.x)
            if (gate > 0.01 or name not in arm_bones) and (not is_digit(name) or past_knuckle(name, point))
        }
        nearest = min(distances, key=distances.get)
        allowed = neighbours(nearest)
        power = 14 if is_bone or is_digit(nearest) else 4
        weights = {
            name: (gate if name in arm_bones else 1) / (distance + 0.004) ** power
            for name, distance in distances.items()
            if name in allowed
        }
        top = sorted(weights.items(), key=lambda item: -item[1])[:4]
        total = sum(weight for _, weight in top)
        for name, weight in top:
            groups[name].add([vertex.index], weight / total, 'REPLACE')


def build_armature():
    data = bpy.data.armatures.new('rig')
    armature = bpy.data.objects.new('rig', data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = {}
    for name, (head, tail, _) in REST.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        edit_bones[name] = bone
    for name in PROP_MESHES:
        bone = data.edit_bones.new(name.replace('-', '_'))
        bone.head, bone.tail = (0, 0, 0), (0, 0, 0.1)
    # Deforms nothing: its position in each clip describes the framing (see write_pose).
    bone = data.edit_bones.new('frame')
    bone.head = FRAMES['tall']
    bone.tail = bone.head + Vector((0, 0, 0.1))
    for name, (_, _, parent) in REST.items():
        if parent:
            edit_bones[name].parent = edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return armature


def box(center, size, tilt=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center, rotation=(math.radians(tilt), 0, 0))
    bpy.context.object.scale = size
    return bpy.context.object


def rod(center, radius, depth, vertices=12):
    """A cylinder along x."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center,
                                        rotation=(0, math.pi / 2, 0))
    return bpy.context.object


def post(x, y, top):
    return box((x, y, top / 2), (0.05, 0.05, top))


def barbell_parts():
    return [rod((0, 0, 0), 0.014, 1.5), rod((-0.6, 0, 0), 0.11, 0.05, 24), rod((0.6, 0, 0), 0.11, 0.05, 24)]


def pole_parts():
    return [rod((0, 0, 0), 0.014, 1.3)]


def dumbbell_parts():
    return [rod((0, 0, 0), 0.015, 0.2), rod((-0.09, 0, 0), 0.05, 0.07, 16), rod((0.09, 0, 0), 0.05, 0.07, 16)]


def kettlebell_parts():
    # Local z is the way the palm faces; the bell sits behind the wrist, as in a rack hold.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.075, location=(0, -0.05, -0.08))
    bell = bpy.context.object
    return [rod((0, 0, 0), 0.013, 0.13), bell]


def bench_pad(bench, length, behind=0.0):
    """The padded board a body lies on, running from `behind` the pivot for `length`."""
    tilt = math.radians(bench['tilt'])
    along = Vector((0, math.cos(tilt), math.sin(tilt)))
    return box(Vector(bench['pivot']) + along * (length / 2 - behind), (0.3, length, 0.04), bench['tilt'])


def flat_bench_parts():
    return [bench_pad(BENCHES[FLAT], 1.22, 0.34), post(0, -0.5, 0.42), post(0, 0.48, 0.42)]


def incline_bench_parts():
    return [bench_pad(BENCHES[INCLINE], 0.85), box((0, -0.31, 0.44), (0.3, 0.38, 0.04)), post(0, -0.3, 0.44),
            post(0, 0.1, 0.62)]


def decline_bench_parts():
    return [bench_pad(BENCHES[DECLINE], 1.05, 0.2), post(0, -0.3, 0.66), post(0, 0.3, 0.42), post(0, -0.8, 0.5),
            box((0, -0.55, 0.05), (0.05, 0.5, 0.05)), rod((0, -0.8, 0.5), 0.04, 0.4)]


def seat_parts():
    return [box((0, 0, 0.45), (0.36, 0.36, 0.05)), box((0, 0.19, 0.85), (0.3, 0.04, 0.75)), post(0, 0, 0.45),
            box((0, 0.19, 0.25), (0.05, 0.05, 0.5))]


def box_parts():
    return [box((0, 0, 0.225), (0.9, 0.4, 0.45))]


def ball_parts():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=0.11)
    return [bpy.context.object]


def stability_ball_parts():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=0.3)
    return [bpy.context.object]


def dip_bars_parts():
    parts = []
    for x in (-0.3, 0.3):
        parts += [box((x, -0.05, 1.25), (0.04, 0.8, 0.04)), post(x, -0.4, 1.25), post(x, 0.3, 1.25)]
    return parts


def along_y(center, radius, depth, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center,
                                        rotation=(math.pi / 2, 0, 0))
    return bpy.context.object


def loaded_bar_parts():
    # Full-size plates: the bar sits at deadlift height when they stand on the floor.
    return [rod((0, 0, 0), 0.014, 1.8), rod((-0.72, 0, 0), BAR_ON_FLOOR, 0.05, 32), rod((0.72, 0, 0), BAR_ON_FLOOR, 0.05, 32)]


def pullup_bar_parts():
    return [rod((0, 0, 0), 0.016, 1.5), box((-0.75, 0, -BAR_Z / 2), (0.05, 0.05, BAR_Z)), box((0.75, 0, -BAR_Z / 2), (0.05, 0.05, BAR_Z))]


def rings_parts():
    # Local origin is between the two points the hands hold, at the bottom of each ring.
    parts = []
    for x in (-RING_X, RING_X):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.09, minor_radius=0.014, major_segments=24, minor_segments=8,
                                         location=(x, 0, 0.09), rotation=(0, math.pi / 2, 0))
        parts += [bpy.context.object, box((x, 0, 1.2), (0.02, 0.02, 2.04))]
    return parts


def rope_parts():
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.016, depth=ROPE_LENGTH)
    return [bpy.context.object]


def long_bar_parts():
    # Local origin is the end anchored on the floor; local y runs up the bar to the plates.
    return [along_y((0, LONG_BAR_LENGTH / 2, 0), 0.014, LONG_BAR_LENGTH), along_y((0, LONG_BAR_PLATE, 0), BAR_ON_FLOOR, 0.05, 32)]


def v_handle_parts():
    # Two grips along local y, one per hand.
    return [along_y((-V_HANDLE_HALF, 0, 0), 0.012, 0.13), along_y((V_HANDLE_HALF, 0, 0), 0.012, 0.13), rod((0, 0, 0), 0.01, 0.11)]


def hanging_kettlebell_parts():
    # Local y runs along the forearm, so the bell hangs from the handle (see held).
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.075, location=(0, 0.11, 0))
    bell = bpy.context.object
    return [rod((0, 0, 0), 0.013, 0.13), bell]


def stool_parts():
    return [box((0, 0, 0.45), (0.36, 0.36, 0.05)), post(0, 0, 0.45)]


def pulldown_seat_parts():
    return [*stool_parts(), rod((0, -0.26, 0.77), 0.04, 0.42), box((0, -0.3, 0.38), (0.05, 0.05, 0.76))]


def row_seat_parts():
    return [box((0, 0.05, 0.12), (0.3, 0.5, 0.24)), box((0, -0.78, 0.18), (0.5, 0.04, 0.3)), box((0, -0.36, 0.03), (0.08, 0.8, 0.05))]


def high_bench_parts():
    return [box((0, 0.27, HIGH_BENCH_TOP - 0.02), (0.3, 1.2, 0.04)), post(0, 0.15, HIGH_BENCH_TOP - 0.04), post(0, 0.75, HIGH_BENCH_TOP - 0.04)]


def hyperextension_bench_parts():
    return [box((0, 0.1, 0.9), (0.3, 0.3, 0.05)), post(0, 0.1, 0.88), rod((0, 0.76, 1.1), 0.04, 0.35), post(0, 0.76, 1.08),
            box((0, 0.43, 0.03), (0.05, 0.7, 0.05))]


def rack_parts():
    parts = []
    for x in (-0.55, 0.55):
        parts += [post(x, -0.09, 0.95), box((x, -0.09, RACK_PIN_Z - 0.015), (0.05, 0.4, 0.03))]
    return parts


def platform_parts():
    return [box((0, 0, PLATFORM / 2), (0.7, 0.5, PLATFORM))]


def atlas_stone_parts():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=STONE_RADIUS)
    return [bpy.context.object]


def foam_roller_parts():
    return [rod((0, 0, 0), ROLLER_RADIUS, 0.9, 20)]


def wall_parts():
    return [box((0, 0, 1.1), (1.4, 0.06, 2.2))]


def band_parts():
    # One metre long at rest; a clip stretches it along local x to span the hands (see Pose.prop_stretch).
    return [rod((0, 0, 0), 0.016, 1.0)]


def plate_parts():
    return [along_y((0, 0, 0), PLATE_RADIUS, 0.03, 24)]


def preacher_parts():
    # A stool, with a pad in front sloping down and away for the upper arms.
    return [*stool_parts(), box((0, -0.27, 0.78), (0.42, 0.28, 0.04), 46), post(0, -0.34, 0.72)]


def sledgehammer_parts():
    # Local z runs along the handle from the hands towards the head.
    return [box((0, 0, 0.3), (0.025, 0.025, 0.85)), box((0, 0, 0.72), (0.08, 0.2, 0.09))]


def cable_parts():
    # One metre long at rest, like the band; see cabled.
    return [rod((0, 0, 0), 0.008, 1.0)]


def cable_column_parts():
    return [rod((0, 0, 0), 0.03, 1.0)]


def pulley_parts():
    return [along_y((0, 0, 0), 0.045, 0.03, 16)]


def leg_pad_parts():
    return [rod((0, 0, 0), 0.05, 0.36, 16)]


def foot_plate_parts():
    # Its local y is the way it faces the feet.
    return [box((0, 0, 0), (0.62, 0.03, 0.45))]


def back_pad_parts():
    # Runs up its local z from the hips.
    return [box((0, 0, 0.36), (0.36, 0.05, 0.85))]


def seat_pad_parts():
    return [box((0, 0, 0), (0.3, 0.3, 0.05))]


def rower_parts():
    return [box((0, -0.2, 0.235), (0.08, 1.75, 0.03)), box((0, -0.82, 0.33), (0.4, 0.03, 0.26)), rod((0, -0.98, 0.42), 0.2, 0.06, 24),
            post(0, -0.98, 0.42), box((0, 0.65, 0.11), (0.08, 0.05, 0.22))]


def bike_parts():
    return [box((0, 0.1, 0.83), (0.22, 0.3, 0.05)), box((0, 0.05, 0.42), (0.05, 0.05, 0.82)), box((0, -0.52, 0.56), (0.05, 0.05, 1.12)),
            rod((0, -0.52, 1.13), 0.02, 0.5), rod((0, -0.17, 0.46), 0.02, 0.3), box((0, -0.25, 0.03), (0.1, 1.05, 0.05))]


def trap_bar_parts():
    parts = []
    for x in (-TRAP_HANDLE_X - 0.06, TRAP_HANDLE_X + 0.06):
        parts.append(along_y((x, 0, 0), 0.014, 0.7))
    for y in (-0.35, 0.35):
        parts.append(rod((0, y, 0), 0.014, 2 * TRAP_HANDLE_X + 0.13))
    for x, sign in ((TRAP_HANDLE_X, 1), (-TRAP_HANDLE_X, -1)):
        parts += [along_y((x, 0, 0), 0.016, 0.16), rod((x + 0.03 * sign, 0, 0), 0.01, 0.06)]
        parts += [rod((sign * 0.46, 0, 0), 0.014, 0.28), rod((sign * 0.56, 0, 0), BAR_ON_FLOOR, 0.05, 32)]
    return parts


def cone_parts():
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.1, radius2=0.012, depth=0.3, location=(0, 0, 0.15))
    return [bpy.context.object]


def tire_parts():
    bpy.ops.mesh.primitive_torus_add(major_radius=0.45, minor_radius=0.14, major_segments=28, minor_segments=8)
    return [bpy.context.object]


def sled_parts():
    # Its local +y is the side a body pushes from.
    return [box((0, 0, 0.07), (0.62, 0.8, 0.08)), box((-0.22, 0.3, 0.55), (0.04, 0.04, 0.95)), box((0.22, 0.3, 0.55), (0.04, 0.04, 0.95)), rod((0, 0.3, 1.02), 0.02, 0.5)]


# Every prop is a mesh named prop-<x> skinned rigidly to a bone prop_<x>.
PROP_MESHES = {
    'prop-bar-loaded': loaded_bar_parts,
    'prop-pullup-bar': pullup_bar_parts,
    'prop-rings': rings_parts,
    'prop-rope': rope_parts,
    'prop-long-bar': long_bar_parts,
    'prop-v-handle': v_handle_parts,
    'prop-hanging-kettlebell-l': hanging_kettlebell_parts,
    'prop-hanging-kettlebell-r': hanging_kettlebell_parts,
    'prop-stool': stool_parts,
    'prop-pulldown-seat': pulldown_seat_parts,
    'prop-row-seat': row_seat_parts,
    'prop-bench-high': high_bench_parts,
    'prop-bench-hyperextension': hyperextension_bench_parts,
    'prop-rack': rack_parts,
    'prop-platform': platform_parts,
    'prop-atlas-stone': atlas_stone_parts,
    'prop-foam-roller': foam_roller_parts,
    'prop-wall': wall_parts,
    'prop-band': band_parts,
    'prop-band-r': band_parts,
    'prop-leg-pad': leg_pad_parts,
    'prop-foot-plate': foot_plate_parts,
    'prop-back-pad': back_pad_parts,
    'prop-seat-pad': seat_pad_parts,
    'prop-rower': rower_parts,
    'prop-bike': bike_parts,
    'prop-trap-bar': trap_bar_parts,
    'prop-cone': cone_parts,
    'prop-tire': tire_parts,
    'prop-sled': sled_parts,
    'prop-plate': plate_parts,
    'prop-plate-r': plate_parts,
    'prop-preacher': preacher_parts,
    'prop-sledgehammer': sledgehammer_parts,
    'prop-cable-l': cable_parts,
    'prop-cable-r': cable_parts,
    'prop-cable-column-l': cable_column_parts,
    'prop-cable-column-r': cable_column_parts,
    'prop-cable-beam': cable_column_parts,
    'prop-pulley-l': pulley_parts,
    'prop-pulley-r': pulley_parts,
    'prop-barbell': barbell_parts,
    'prop-pole': pole_parts,
    'prop-dumbbell-l': dumbbell_parts,
    'prop-dumbbell-r': dumbbell_parts,
    'prop-kettlebell-l': kettlebell_parts,
    'prop-kettlebell-r': kettlebell_parts,
    'prop-bench-flat': flat_bench_parts,
    'prop-bench-incline': incline_bench_parts,
    'prop-bench-decline': decline_bench_parts,
    'prop-seat': seat_parts,
    'prop-box': box_parts,
    'prop-ball': ball_parts,
    'prop-stability-ball': stability_ball_parts,
    'prop-dip-bars': dip_bars_parts,
}


def add_prop(name):
    parts = PROP_MESHES[name]()
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts):
        bpy.ops.object.join()
    prop = parts[0]
    with bpy.context.temp_override(active_object=prop, object=prop, selected_editable_objects=[prop]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    prop.name = name
    prop.data.materials.append(bpy.data.materials.new('prop'))
    group = prop.vertex_groups.new(name=name.replace('-', '_'))
    group.add(list(range(len(prop.data.vertices))), 1.0, 'REPLACE')
    return prop


def frame_of(direction, hint):
    """Rotation whose y axis is `direction` and whose x axis is as close to `hint` as possible."""
    y = direction.normalized()
    x = (hint - y * hint.dot(y)).normalized()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()


def rotation_between_frames(rest_direction, rest_hint, new_direction, new_hint):
    return (frame_of(new_direction, new_hint) @ frame_of(rest_direction, rest_hint).inverted()).to_quaternion()


def rest_dir(name):
    head, tail, _ = REST[name]
    return tail - head


def rot_x(degrees):
    return Quaternion((1, 0, 0), math.radians(degrees))


def rot_y(degrees):
    return Quaternion((0, 1, 0), math.radians(degrees))


def rot_z(degrees):
    return Quaternion((0, 0, 1), math.radians(degrees))


def solve_two_bone(root, target, upper, lower, pole):
    """Elbow/knee and reached end for a chain from `root` towards `target`, bending towards `pole`."""
    to_target = target - root
    distance = min(to_target.length, (upper + lower) * 0.999)
    axis = to_target.normalized()
    along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance)
    height = math.sqrt(max(upper ** 2 - along ** 2, 0.0))
    side = (pole - axis * pole.dot(axis)).normalized()
    return root + axis * along + side * height, root + axis * distance


class Pose:
    """World-space (armature-space) rotation and head position of each bone."""

    def __init__(self):
        self.rotation = {name: Quaternion() for name in REST}
        self.head = {name: REST[name][0].copy() for name in REST}
        # Bones of the props in use -> (position, rotation).
        self.props = {}
        # Props in use that stretch along their local x -> how far.
        self.prop_stretch = {}
        # Side -> where that hand holds, for attaching a cable.
        self.grips = {}
        # Share of the rep this pose is at, for arms that keep their own time.
        self.phase = 0.0

    def place(self, name, rotation):
        self.rotation[name] = rotation
        parent = REST[name][2]
        if parent:
            offset = REST[name][0] - REST[parent][0]
            self.head[name] = self.head[parent] + self.rotation[parent] @ offset

    def point_on(self, name, rest_point):
        return self.head[name] + self.rotation[name] @ (Vector(rest_point) - REST[name][0])


def apply_spine(pose, hips_at, hips, spine1, spine2, neck, head):
    pose.head['hips'] = Vector(hips_at)
    pose.rotation['hips'] = hips
    pose.place('spine1', spine1)
    pose.place('spine2', spine2)
    pose.place('neck', neck)
    pose.place('head', head)


def apply_leg(pose, side, ankle, foot_rotation, pole):
    thigh, shin, foot = f'thigh{side}', f'shin{side}', f'foot{side}'
    pose.place(thigh, Quaternion())
    hip = pose.head[thigh]
    knee, ankle_reached = solve_two_bone(hip, Vector(ankle), bone_length(thigh), bone_length(shin), pole)
    thigh_dir, shin_dir = knee - hip, ankle_reached - knee
    hinge = thigh_dir.cross(shin_dir)
    if hinge.length < 1e-4 or hinge.x < 0:  # a straight leg still hinges side to side
        hinge = Vector((1, 0, 0))
    pose.place(thigh, rotation_between_frames(rest_dir(thigh), Vector((1, 0, 0)), thigh_dir, hinge))
    pose.place(shin, rotation_between_frames(rest_dir(shin), Vector((1, 0, 0)), shin_dir, hinge))
    pose.place(foot, foot_rotation)


def rest_flexion(name):
    """How far a digit bone already bends towards the palm in the rest pose (degrees)."""
    axis = rest_dir('hand_l').normalized()
    palm = (Vector((0, -1, 0)) - axis * Vector((0, -1, 0)).dot(axis)).normalized()
    direction = rest_dir(f'{name}_l')
    return math.degrees(math.atan2(direction.dot(palm), direction.dot(axis)))


def gripping_hand(fore_dir, palm, handle):
    """Hand axis and palm that hold `handle` (default: square to the forearm) on the forearm's line."""
    across = (handle or fore_dir.cross(palm)).normalized()
    axis = (fore_dir - across * fore_dir.dot(across)).normalized()
    facing = across.cross(axis)
    if facing.dot(palm) < 0:
        facing = -facing
    return (axis * math.cos(WRIST_TILT) - facing * math.sin(WRIST_TILT),
            axis * math.sin(WRIST_TILT) + facing * math.cos(WRIST_TILT))


def apply_digits(pose, side, hand_rotation, hand_axis, palm, curl, thumb_closed=True):
    """Fingers curl from the hand's axis towards the palm, one joint at a time; the thumb closes over them."""
    curl_axis = hand_axis.normalized().cross(palm.normalized())
    for finger in FINGERS:
        bent = 0
        for joint, share in enumerate(FINGER_CURL_SHARE, 1):
            bent += curl * share
            name = f'{finger}{joint}'
            pose.place(f'{name}{side}', Quaternion(curl_axis, math.radians(bent - rest_flexion(name))) @ hand_rotation)
    grip = max(0.0, min(1.0, curl / FULL_GRIP_CURL)) if thumb_closed else 0.0
    sign = 1 if side == '_l' else -1
    axis, facing = hand_axis.normalized(), palm.normalized()
    oppose = Quaternion(axis, math.radians(sign * THUMB_OPPOSE * grip))
    fold_axis = oppose @ facing
    for name, fold in zip(THUMB, THUMB_FOLD):
        pose.place(f'{name}{side}', Quaternion(fold_axis, math.radians(-sign * fold * grip)) @ oppose @ hand_rotation)


def apply_arm(pose, side, clavicle, grip, pole, palm, hand_dir=None, curl=FULL_GRIP_CURL, handle=None, thumb_closed=True, fade_twist=False):
    """Holds a handle centred on `grip`, or with `hand_dir` puts the wrist there and lays the hand along that direction.

    `handle` is the handle's direction when the arm is not square to it, as on a wide barbell grip.
    `fade_twist` is for a hand that passes through a half turn from the forearm during the clip.
    Returns the forearm's direction and the reached point, for holding a prop.
    """
    clav, upper, fore, twist, hand = (f'{b}{side}' for b in ARM_CHAIN[:5])
    pose.place(clav, clavicle)
    pose.place(upper, Quaternion())
    shoulder = pose.head[upper]
    upper_len = bone_length(upper)
    forearm_len = bone_length(fore) + bone_length(twist) + (0 if hand_dir else GRIP_OFFSET)
    elbow, reached = solve_two_bone(shoulder, Vector(grip), upper_len, forearm_len, pole)
    upper_dir, fore_dir = elbow - shoulder, reached - elbow
    hinge = upper_dir.cross(fore_dir)
    if hinge.length < 1e-4:
        hinge = pole.cross(upper_dir)
    rest_hinge = Vector((-1, 0, 0))
    pose.place(upper, rotation_between_frames(rest_dir(upper), rest_hinge, upper_dir, hinge))
    fore_rotation = rotation_between_frames(rest_dir(fore), rest_hinge, fore_dir, hinge)
    pose.place(fore, fore_rotation)
    # The palm faces forward at rest; the lower forearm takes half the turn to the gripping palm.
    rest_palm = Vector((0, -1, 0))
    hand_axis, palm = (hand_dir, palm) if hand_dir else gripping_hand(fore_dir, palm, handle)
    hand_rotation = rotation_between_frames(rest_dir(hand), rest_palm, hand_axis, palm)
    straight_palm = hand_axis.rotation_difference(fore_dir) @ palm  # the palm with the wrist unbent
    straight_hand = rotation_between_frames(rest_dir(hand), rest_palm, fore_dir, straight_palm)
    twist_share = 0.5
    if fade_twist:
        # A half turn has no shorter way round, so the twist fades out there rather than snapping to the other way.
        turn = fore_rotation.rotation_difference(straight_hand).angle
        twist_share *= min(1.0, (math.pi - min(turn, 2 * math.pi - turn)) / TWIST_FADE)
    pose.place(twist, fore_rotation.slerp(straight_hand, twist_share))
    pose.place(hand, hand_rotation)
    apply_digits(pose, side, hand_rotation, hand_axis, palm, curl, thumb_closed)
    pose.grips[side] = reached.copy()
    return fore_dir, reached


def ease(phase):
    """0 -> 1 -> 0 over one rep, with slow turnarounds."""
    return 0.5 - 0.5 * math.cos(2 * math.pi * phase)


SIDES = (('_l', 1), ('_r', -1))

# Stance shared by the barbell lifts: feet just outside the hips, toes turned out.
ANKLE_X = 0.15
ANKLE_Y = 0.045
ANKLE_Z = 0.078


def planted_legs(pose, toe_out=14, knee_out=0.25):
    for side, sign in SIDES:
        rotation = rot_z(sign * toe_out)
        ankle = (sign * ANKLE_X, ANKLE_Y, ANKLE_Z)
        pole = Vector((sign * knee_out, -1, 0))
        apply_leg(pose, side, ankle, rotation, pole)


def squat(phase):
    depth = ease(phase)
    pose = Pose()
    # Hips travel down and back; the trunk leans so the bar stays over mid-foot.
    hips_at = (0, 0.03 + 0.2 * depth, 0.885 - 0.37 * depth)
    lean = 36 * depth
    apply_spine(pose, hips_at, rot_x(lean * 0.65), rot_x(lean * 0.9), rot_x(lean), rot_x(lean * 0.55),
                rot_x(lean * 0.25))
    planted_legs(pose)
    # High-bar: the bar rests on the upper traps behind the neck.
    bar = pose.point_on('spine2', (0, 0.105, 1.445))
    pose.props['prop_barbell'] = (bar, Quaternion())
    for side, sign in SIDES:
        grip = bar + Vector((sign * 0.3, 0, 0))
        clavicle = rot_y(-sign * 6) @ pose.rotation['spine2']
        apply_arm(pose, side, clavicle, grip, Vector((sign * 0.5, 0.35, -1)), Vector((0, -1, 0.15)), handle=ACROSS)
    return pose


def overhead_press(phase):
    press = ease(phase)
    pose = Pose()
    apply_spine(pose, (0, 0.03, 0.885), rot_x(0), rot_x(-1), rot_x(-2), rot_x(0), rot_x(0))
    planted_legs(pose, toe_out=8, knee_out=0.1)
    # The bar starts at the collarbones, clears the chin, then locks out over mid-foot.
    z = 1.44 + 0.64 * press
    clear_face = max(0.0, 1 - abs(z - 1.56) / 0.2)
    y = -0.12 + 0.13 * press - 0.035 * clear_face
    bar = Vector((0, y, z))
    pose.props['prop_barbell'] = (bar, Quaternion())
    for side, sign in SIDES:
        grip = bar + Vector((sign * 0.25, 0, 0))
        # The shoulder blade rotates up as the arm rises.
        clavicle = rot_y(-sign * (4 + 20 * press)) @ pose.rotation['spine2']
        apply_arm(pose, side, clavicle, grip, Vector((sign * 0.8, -0.15, -1)), Vector((0, -1, 0)), handle=ACROSS)
    return pose



# What to keep in view: (half width, half height, height of the centre), in metres.
FRAMES = {
    'tall': (1.0, 1.35, 1.2),
    'standing': (0.95, 1.05, 0.95),
    'bench': (1.2, 0.85, 0.62),
    'floor': (1.2, 0.65, 0.4),
    'hanging': (1.05, 1.5, 1.4),
    'climbing': (1.1, 1.8, 1.65),
}
# Turn floor and bench clips side-on (degrees), a little off square so depth reads.
SIDE_ON = -72
# The same for an upright figure pushing forward.
SIDE_TURN = 60
# Back exercises open showing the back: from behind and to one side, or nearly square on.
BACK_TURN = 130
REAR_TURN = 165
# Clips that work the left arm alone open the other way round, with that arm nearest.
LEFT_ARM_TURN = -130
FLAT, INCLINE, DECLINE = 'flat', 'incline', 'decline'
# Board of each bench: pivot is the top face under the hips' end, tilt is head-up degrees.
BENCHES = {
    FLAT: {'tilt': 0, 'pivot': (0, -0.28, 0.44), 'prop': 'prop_bench_flat', 'feet': (0.22, -0.72, ANKLE_Z)},
    INCLINE: {'tilt': 35, 'pivot': (0, -0.12, 0.46), 'prop': 'prop_bench_incline', 'feet': (0.22, -0.68, ANKLE_Z)},
    DECLINE: {'tilt': -20, 'pivot': (0, -0.34, 0.65), 'prop': 'prop_bench_decline', 'feet': (0.12, -0.8, 0.42)},
}
# Distance from spine to the back of the body, which rests on the board.
BACK_DEPTH = 0.11
UPPER_ARM = bone_length('upper_arm_l')
TO_WRIST = bone_length('forearm_l') + bone_length('forearm_twist_l')
TO_GRIP = TO_WRIST + GRIP_OFFSET
REACH = UPPER_ARM + TO_GRIP
WRIST_REACH = UPPER_ARM + TO_WRIST
# Front of the chest and of the throat on the rest pose (where a bar comes down to).
CHEST = (0, -0.135, 1.33)
THROAT = (0, -0.09, 1.49)
NOTHING_HELD = Quaternion()
# Elbow bend, from straight, of an exercise done with soft elbows (degrees).
SOFT_ELBOW = 20
# Where each wrist sits on a dumbbell held under its plate: out to the side, and back from the plate's centre.
PLATE_WRIST_OUT = 0.035
PLATE_WRIST_BACK = 0.045
PLATE_ABOVE_WRIST = 0.02
# From the middle of a dumbbell to the inner face of its plate (see dumbbell_parts).
PLATE_FROM_CENTER = 0.055
PLATE_CURL = 60
ORIGIN = Vector()
UP = Vector((0, 0, 1))
ACROSS = Vector((1, 0, 0))
PALM_TO_FEET = Vector((0, -1, 0))
PRESS_POLE = Vector((0.9, -0.45, -0.5))
# Height of a bar whose full-size plates stand on the floor, and of the pull-up bar and rings (metres).
BAR_ON_FLOOR = 0.225
BAR_Z = 2.3
RING_X = 0.24
ROPE_LENGTH = 5
LONG_BAR_LENGTH = 1.7
LONG_BAR_PLATE = 1.62
# How far up the long bar the hands hold it, from the end on the floor.
LONG_BAR_GRIP = 1.45
JAMMER_GRIP = 1.68
V_HANDLE_HALF = 0.055
HIGH_BENCH_TOP = 0.77
RACK_PIN_Z = 0.5
PLATFORM = 0.07
STONE_RADIUS = 0.24
ROLLER_RADIUS = 0.075
PLATE_RADIUS = 0.11
TRAP_HANDLE_X = 0.24
BOX_TOP = 0.45
FOOT_ON_BOX = BOX_TOP + ANKLE_Z
# From the ankle to the ball of the foot on the rest pose.
BALL_FROM_ANKLE = Vector((0, -0.1, -0.06))
SHOULDER_X = REST['upper_arm_l'][0].x
# From the hips to the middle of the shoulders on the rest pose, and from the ankles to there.
HIPS_TO_SHOULDERS = Vector((0, -0.005, 0.5))
ANKLES_TO_SHOULDERS = 1.322
# A foot lying flat with its toes pointing back, as when kneeling or face down.
FOOT_POINTED_BACK = rot_x(150)
# How far the torso tips forward in a bent-over row (degrees): almost parallel to the floor.
ROW_LEAN = 72


def side_pole(pole, sign):
    return Vector((pole.x * sign, pole.y, pole.z))


def shoulder_of(pose, side, clavicle):
    pose.place(f'clavicle{side}', clavicle)
    pose.place(f'upper_arm{side}', Quaternion())
    return pose.head[f'upper_arm{side}'].copy()


def held(pose, bone, fore_dir, reached, palm):
    """Places a one-hand prop: its x along the handle, its y along the forearm, its z the way the palm faces."""
    y = fore_dir.normalized()
    x = y.cross(palm).normalized()
    pose.props[bone] = (reached.copy(), Matrix((x, y, x.cross(y))).transposed().to_quaternion())


def lie_down(pose, tilt_key):
    """On the back along +y on a bench, feet planted (or hooked, on the decline)."""
    bench = BENCHES[tilt_key]
    pose.props[bench['prop']] = (ORIGIN, NOTHING_HELD)
    tilt = bench['tilt']
    radians = math.radians(tilt)
    normal = Vector((0, -math.sin(radians), math.cos(radians)))
    hips_at = Vector(bench['pivot']) + normal * BACK_DEPTH
    body = rot_x(-90 + tilt)
    apply_spine(pose, hips_at, body, body, body, body @ rot_x(8), body @ rot_x(8))
    feet_x, feet_y, feet_z = bench['feet']
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * feet_x, feet_y, feet_z), rot_z(sign * 10), Vector((sign * 0.35, -0.5, 1)))
    return body


def lie_on_floor(pose):
    body = rot_x(-90)
    apply_spine(pose, (0, -0.28, BACK_DEPTH), body, body, body, body @ rot_x(8), body @ rot_x(8))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.16, -0.72, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.25, -0.3, 1)))
    return body


def arm_at_side(pose, side, sign, body):
    """The arm that is not working: the hand rests by the hip."""
    apply_arm(pose, side, body, pose.point_on('hips', (sign * 0.27, 0.03, 0.86)), Vector((sign, 0.1, 0.2)),
              body @ PALM_TO_FEET, curl=25)


def barbell_press(tilt_key, half=0.28, target=CHEST, palm=PALM_TO_FEET, depth=1.0):
    def clip(phase):
        pose = Pose()
        body = lie_down(pose, tilt_key)
        shoulder = shoulder_of(pose, '_l', body)
        reach = math.sqrt(REACH ** 2 - max(half - shoulder.x, 0) ** 2) * 0.985
        top = Vector((0, shoulder.y, shoulder.z + reach))
        bottom = pose.point_on('spine2', target) + UP * 0.03
        bar = top.lerp(bottom, depth * ease(phase))
        pose.props['prop_barbell'] = (bar, Quaternion())
        for side, sign in SIDES:
            apply_arm(pose, side, body, bar + Vector((sign * half, 0, 0)), side_pole(PRESS_POLE, sign), Vector(palm),
                      handle=ACROSS)
        return pose
    return clip


def dumbbell_press(tilt_key, neutral=False, arms=SIDES):
    def clip(phase):
        pose = Pose()
        body = lie_down(pose, tilt_key)
        depth = ease(phase)
        for side, sign in SIDES:
            if (side, sign) not in arms:
                arm_at_side(pose, side, sign, body)
                continue
            shoulder = shoulder_of(pose, side, body)
            top = shoulder + Vector((-sign * 0.05, 0, REACH * 0.97))
            bottom = shoulder + (Vector((sign * 0.05, -0.13, 0.13)) if neutral else Vector((sign * 0.13, -0.05, 0.14)))
            palm = Vector((-sign, 0, 0)) if neutral else PALM_TO_FEET
            pole = Vector((sign * 0.35, -0.75, -0.6)) if neutral else side_pole(PRESS_POLE, sign)
            fore_dir, reached = apply_arm(pose, side, body, top.lerp(bottom, depth), pole, palm)
            held(pose, f'prop_dumbbell{side}', fore_dir, reached, palm)
        return pose
    return clip


def dumbbell_fly(tilt_key, arms=SIDES, twist=False):
    def clip(phase):
        pose = Pose()
        body = lie_down(pose, tilt_key)
        depth = ease(phase)
        # Arms sweep from over the shoulders to level with the bench, elbows held soft.
        angle = math.radians(74 * depth)
        span = arm_span(SOFT_ELBOW, TO_GRIP)
        for side, sign in SIDES:
            if (side, sign) not in arms:
                arm_at_side(pose, side, sign, body)
                continue
            shoulder = shoulder_of(pose, side, body)
            out = Vector((sign * math.sin(angle), 0, math.cos(angle)))
            palm = Vector((-sign * math.cos(angle), 0, math.sin(angle)))
            if twist:  # little fingers meet at the top, palms facing the head
                palm = Vector((0, 1, 0)).lerp(palm, depth).normalized()
            fore_dir, reached = apply_arm(pose, side, body, shoulder + out * span,
                                          Vector((sign * 0.5, -0.2, -0.6)), palm)
            held(pose, f'prop_dumbbell{side}', fore_dir, reached, palm)
        return pose
    return clip


def around_the_world(phase):
    pose = Pose()
    body = lie_down(pose, FLAT)
    sweep = math.pi * ease(phase)
    for side, sign in SIDES:
        shoulder = shoulder_of(pose, side, body)
        # A half circle at shoulder height, from beside the thighs to past the head.
        out = Vector((sign * (math.sin(sweep) + 0.15), -math.cos(sweep), -0.05)).normalized()
        palm = UP.copy()
        fore_dir, reached = apply_arm(pose, side, body, shoulder + out * arm_span(SOFT_ELBOW, TO_GRIP),
                                      Vector((sign * 0.1, 0.1, -1)), palm)
        held(pose, f'prop_dumbbell{side}', fore_dir, reached, palm)
    return pose


def arm_span(elbow_bend, lower):
    """Shoulder to the end of the forearm (of length `lower`) with the elbow bent this far from straight (degrees)."""
    return math.sqrt(UPPER_ARM ** 2 + lower ** 2 + 2 * UPPER_ARM * lower * math.cos(math.radians(elbow_bend)))


def barbell_pullover(tilt_key, half, start, end, elbow_bend=14, prop='prop_barbell'):
    """Arms arc from `start` to `end` degrees (0 is above the shoulders, + is towards behind the head), elbows locked."""
    def clip(phase):
        pose = Pose()
        body = lie_down(pose, tilt_key)
        angle = math.radians(start + (end - start) * ease(phase))
        out = Vector((0, math.sin(angle), math.cos(angle)))
        towards_feet = Vector((0, -math.cos(angle), math.sin(angle)))
        left, right = shoulder_of(pose, '_l', body), shoulder_of(pose, '_r', body)
        along = math.sqrt(arm_span(elbow_bend, TO_GRIP) ** 2 - (half - left.x) ** 2)
        bar = (left + right) / 2 + out * along
        pose.props[prop] = (bar, Quaternion())
        for side, sign in SIDES:
            apply_arm(pose, side, body, bar + Vector((sign * half, 0, 0)), Vector((sign * 0.5, 0, 0)) + towards_feet * 0.8,
                      towards_feet, handle=ACROSS)
        return pose
    return clip


def dumbbell_pullover(elbow_bend, start, end):
    """Both palms press up under one plate, thumbs around the handle; the rest hangs between the forearms."""
    def clip(phase):
        pose = Pose()
        body = lie_down(pose, FLAT)
        angle = math.radians(start + (end - start) * ease(phase))
        out = Vector((0, math.sin(angle), math.cos(angle)))
        near = Vector((0, -math.cos(angle), math.sin(angle)))
        left, right = shoulder_of(pose, '_l', body), shoulder_of(pose, '_r', body)
        span = arm_span(elbow_bend, TO_WRIST)
        # The elbow sits on the near side of the line from shoulder to wrist, so the forearm leans away from it.
        lean = math.acos((TO_WRIST ** 2 + span ** 2 - UPPER_ARM ** 2) / (2 * TO_WRIST * span))
        handle = out * math.cos(lean) - near * math.sin(lean)
        away = near * -math.cos(lean) - out * math.sin(lean)
        wrist_near = PLATE_WRIST_BACK * math.cos(lean)
        along = math.sqrt(span ** 2 - (left.x - PLATE_WRIST_OUT) ** 2 - wrist_near ** 2)
        wrists = (left + right) / 2 + out * along + near * wrist_near
        under_plate = wrists + away * PLATE_WRIST_BACK
        # Hands side by side, each index finger and thumb beside the handle, fingers hooked over the far rim.
        hand_dir = (away + handle * 0.2).normalized()
        for side, sign in SIDES:
            apply_arm(pose, side, body, wrists + Vector((sign * PLATE_WRIST_OUT, 0, 0)), Vector((sign * 0.5, 0, 0)) + near * 0.8,
                      handle, hand_dir=hand_dir, curl=PLATE_CURL, thumb_closed=False)
        rotation = Matrix((handle, ACROSS, handle.cross(ACROSS))).transposed().to_quaternion()
        pose.props['prop_dumbbell_l'] = (under_plate + handle * PLATE_ABOVE_WRIST - handle * PLATE_FROM_CENTER, rotation)
        return pose
    return clip


def floor_press(phase_of_side, arms=SIDES):
    def clip(phase):
        pose = Pose()
        body = lie_on_floor(pose)
        for side, sign in SIDES:
            if (side, sign) not in arms:
                arm_at_side(pose, side, sign, body)
                continue
            shoulder = shoulder_of(pose, side, body)
            top = shoulder + Vector((-sign * 0.03, 0, REACH * 0.97))
            # The upper arm comes down until the elbow meets the floor.
            bottom = shoulder + Vector((sign * 0.22, -0.1, 0.27))
            palm = PALM_TO_FEET
            fore_dir, reached = apply_arm(pose, side, body, top.lerp(bottom, ease(phase + phase_of_side[side])),
                                          side_pole(PRESS_POLE, sign), palm)
            held(pose, f'prop_kettlebell{side}', fore_dir, reached, palm)
        return pose
    return clip


# Rest-pose distances the plank turns on: the ball of the foot, and from there to the shoulders.
TOE_REST = Vector((0, -0.09, 0.02))
TOE_TO_SHOULDER = 1.38
SHOULDER_BACK_OF_TOE = 0.115
HANDS_Y = -0.55
# How far the side plank rolls (degrees), and how far its stacked feet lift the toes' pivot off the floor (metres).
SIDE_PLANK_ROLL = 72
SIDE_PLANK_FEET_RISE = 0.05


def rise_of(shoulder_z, toe_z):
    return max(-0.9, min(0.9, (shoulder_z - toe_z - SHOULDER_BACK_OF_TOE) / TOE_TO_SHOULDER))


def plank(pose, shoulder_z, hand_z, toe_z, half=0.26, roll=0.0, feet_out=0.0, shift=0.0):
    """Straight body on hands and toes, shoulders at `shoulder_z`, pivoting at the toes. Head towards -y.

    `shift` moves the whole body along x, as when it rolls over one hand.
    """
    pitch = math.asin(rise_of(shoulder_z, toe_z))
    body = rot_x(90 - math.degrees(pitch))
    if roll:
        body = Quaternion(body @ UP, math.radians(roll)) @ body
    # Hands are fixed, with the shoulders over them about two thirds of the way down.
    settled = rise_of(shoulder_height(half, hand_z, 0.66), toe_z)
    toes = Vector((shift, HANDS_Y + TOE_TO_SHOULDER * math.sqrt(1 - settled ** 2), toe_z))
    hips_at = toes + body @ (Vector(REST['hips'][0]) - TOE_REST)
    apply_spine(pose, hips_at, body, body, body, body @ rot_x(-15), body @ rot_x(-25))
    for side, sign in SIDES:
        ankle = toes + body @ (Vector((sign * (0.073 + feet_out), 0.037, 0.078)) - TOE_REST)
        apply_leg(pose, side, ankle, body, body @ Vector((sign * 0.1, -1, 0)))
    return body, toes


def plank_hand(pose, side, sign, body, wrist):
    apply_arm(pose, side, body, wrist, Vector((sign * 0.9, 0.55, 0.5)), Vector((0, 0, -1)),
              hand_dir=Vector((sign * 0.2, -1, 0)), curl=0, fade_twist=True)


def shoulder_height(half, hand_z, depth, lowest=0.17):
    top = math.sqrt(WRIST_REACH ** 2 - max(half - 0.18, 0) ** 2) * 0.97
    return hand_z + top + (lowest - top) * depth


def pushup(half=0.26, hand_z=0.07, toe_z=0.02, prop=None):
    """`prop` holds up the hands or the feet: None, 'hands' on the box, 'feet' on the box, or 'ball' under the feet."""
    def clip(phase):
        pose = Pose()
        depth = ease(phase)
        body, toes = plank(pose, shoulder_height(half, hand_z, depth), hand_z, toe_z, half)
        for side, sign in SIDES:
            plank_hand(pose, side, sign, body, (sign * half, HANDS_Y, hand_z))
        if prop == 'hands':
            pose.props['prop_box'] = (Vector((0, HANDS_Y, 0)), Quaternion())
        elif prop == 'feet':
            pose.props['prop_box'] = (Vector((0, toes.y, 0)), Quaternion())
        elif prop == 'ball':
            pose.props['prop_stability_ball'] = (Vector((0, toes.y, 0.3)), Quaternion())
        return pose
    return clip


def one_arm_pushup(phase):
    pose = Pose()
    depth = ease(phase)
    body, _ = plank(pose, shoulder_height(0.18, 0.07, depth, lowest=0.24), 0.07, 0.02, 0.18, roll=8 * depth + 4, feet_out=0.2)
    plank_hand(pose, '_l', 1, body, (0.16, HANDS_Y, 0.07))
    apply_arm(pose, '_r', body, pose.point_on('hips', (-0.05, 0.14, 0.98)), Vector((-1, 0.3, -0.25)), body @ Vector((0, 1, 0)),
              curl=20)
    return pose


def pushup_to_side_plank(phase):
    pose = Pose()
    half = 0.3
    # First half of the rep is the push-up, second half the turn with the top arm raised.
    down = ease(min(phase * 2, 1))
    turn = ease(max(phase * 2 - 1, 0))
    roll = SIDE_PLANK_ROLL * turn
    tipped, level = math.sin(math.radians(roll)), math.cos(math.radians(roll))
    shoulder_x = REST['upper_arm_l'][0].x
    # The roll pivots at the toes, which lie in front of the spine, so that offset swings aside and down too.
    # The body shifts over the supporting hand and rises so that arm ends straight, with the feet stacked on their sides.
    rise = shoulder_x * tipped + SHOULDER_BACK_OF_TOE * (1 - level)
    full = math.radians(SIDE_PLANK_ROLL)
    over_hand = half - shoulder_x * math.cos(full) - SHOULDER_BACK_OF_TOE * math.sin(full)
    body, _ = plank(pose, shoulder_height(half, 0.07, down) + rise, 0.07, 0.02 + SIDE_PLANK_FEET_RISE * tipped,
                    half, roll=-roll, feet_out=0.03 - 0.055 * turn, shift=turn * over_hand)
    plank_hand(pose, '_l', 1, body, (half, HANDS_Y, 0.07))
    shoulder = shoulder_of(pose, '_r', body)
    floor_hand = Vector((-half, HANDS_Y, 0.07))
    # Relative to the chest the top arm only turns from straight ahead to straight out; the roll does the rest.
    chest, right = body @ Vector((0, -1, 0)), body @ Vector((-1, 0, 0))
    opening = math.radians(90 * turn)
    swing = chest * math.cos(opening) + right * math.sin(opening)
    raised = shoulder + swing * WRIST_REACH * 0.97
    apply_arm(pose, '_r', body, floor_hand.lerp(raised, smoothstep(0, 0.25, turn)),
              Quaternion(body @ UP, math.radians(-roll)) @ Vector((-0.9, 0.55, 0.5)), chest,
              hand_dir=Vector((-0.2, -1, 0)).lerp(swing, turn).normalized(), curl=0)
    return pose


def pushup_wipers(phase):
    pose = Pose()
    half = 0.36
    body, _ = plank(pose, shoulder_height(half, 0.07, 0.45), 0.07, 0.02, half, roll=16 * math.sin(2 * math.pi * phase))
    for side, sign in SIDES:
        plank_hand(pose, side, sign, body, (sign * half, HANDS_Y, 0.07))
    return pose


def plyo_pushup(phase):
    pose = Pose()
    half = 0.26
    depth = ease(phase)
    # The hands leave the floor around the top of the rep.
    air = max(0.0, 1 - depth / 0.3)
    hand_z = 0.07 + 0.09 * air
    body, _ = plank(pose, shoulder_height(half, hand_z, depth), hand_z, 0.02, half)
    for side, sign in SIDES:
        plank_hand(pose, side, sign, body, (sign * half, HANDS_Y, hand_z))
    return pose


def plank_fly(phase):
    pose = Pose()
    half = 0.2 + 0.36 * ease(phase)
    body, _ = plank(pose, shoulder_height(half, 0.07, 0.0), 0.07, 0.02, half)
    for side, sign in SIDES:
        plank_hand(pose, side, sign, body, (sign * half, HANDS_Y, 0.07))
    return pose


def dips(phase):
    pose = Pose()
    pose.props['prop_dip_bars'] = (ORIGIN, NOTHING_HELD)
    depth = ease(phase)
    body = rot_x(26)
    grip_z = 1.27
    # Arms locked at the top, upper arms about level at the bottom.
    shoulder_z = grip_z + REACH * 0.985 - 0.27 * depth
    # Place the hips so the shoulders end up above the grips.
    shoulder_rest = Vector((0, REST['upper_arm_l'][0].y, REST['upper_arm_l'][0].z)) - Vector(REST['hips'][0])
    hips_at = Vector((0, -0.05 + 0.1 * depth, shoulder_z)) - body @ shoulder_rest
    apply_spine(pose, hips_at, rot_x(14), rot_x(20), body, rot_x(10), rot_x(0))
    for side, sign in SIDES:
        ankle = hips_at + Vector((sign * 0.07, 0.5, -0.5))
        apply_leg(pose, side, ankle, rot_x(130), Vector((sign * 0.1, -1, -0.1)))
        palm = Vector((-sign, 0, 0))
        apply_arm(pose, side, body, (sign * 0.3, -0.05, grip_z + 0.02), Vector((sign * 0.3, 1, 0.3)), palm)
    return pose


def stand(pose, lean=0, toe_out=10):
    hips = rot_x(lean * 0.5)
    trunk = rot_x(lean)
    apply_spine(pose, (0, 0.03 + 0.003 * lean, 0.885 - 0.001 * lean), hips, trunk, trunk, rot_x(lean * 0.5), rot_x(0))
    planted_legs(pose, toe_out=toe_out, knee_out=0.15)
    return trunk


def sit(pose, lean=-6):
    pose.props['prop_seat'] = (ORIGIN, NOTHING_HELD)
    trunk = rot_x(lean)
    apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.18, -0.4, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.2, -1, 0.2)))
    return trunk


def hand_path(base, start, end, pole, palm, hand_dir=None, curl=60, cycle=ease):
    """Both hands travel between offsets from their own shoulder, given for the left side and mirrored."""
    def clip(phase):
        pose = Pose()
        trunk = base(pose)
        for side, sign in SIDES:
            shoulder = shoulder_of(pose, side, trunk)
            offset = Vector(start).lerp(Vector(end), cycle(phase))
            grip = shoulder + Vector((sign * offset.x, offset.y, offset.z))
            mirrored_dir = Vector((sign * hand_dir[0], hand_dir[1], hand_dir[2])) if hand_dir else None
            apply_arm(pose, side, trunk, grip, side_pole(Vector(pole), sign),
                      Vector((sign * palm[0], palm[1], palm[2])), hand_dir=mirrored_dir, curl=curl)
        return pose
    return clip


def on_seat(pose):
    return sit(pose)


def standing_lean(lean):
    return lambda pose: stand(pose, lean=lean)


def sweep_arc(base, center_start, center_end, pole, palm, radius=REACH * 0.92):
    """Straight-armed sweep, the hand staying at `radius` from the shoulder."""
    def clip(phase):
        pose = Pose()
        trunk = base(pose)
        for side, sign in SIDES:
            shoulder = shoulder_of(pose, side, trunk)
            direction = Vector(center_start).normalized().lerp(Vector(center_end).normalized(), ease(phase)).normalized()
            grip = shoulder + Vector((sign * direction.x, direction.y, direction.z)) * radius
            apply_arm(pose, side, trunk, grip, side_pole(Vector(pole), sign), Vector((sign * palm[0], palm[1], palm[2])),
                      curl=45)
        return pose
    return clip


def chest_pass(phase):
    pose = Pose()
    trunk = stand(pose, lean=3)
    ball = Vector((0, -0.27, 1.27)).lerp(Vector((0, -0.66, 1.3)), ease(phase))
    pose.props['prop_ball'] = (ball, Quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, ball + Vector((sign * 0.11, 0.01, 0)), Vector((sign * 0.8, 0.3, -0.7)),
                  Vector((-sign, 0, 0)), curl=30)
    return pose


def elbows_back(phase):
    pose = Pose()
    trunk = stand(pose)
    squeeze = ease(phase)
    for side, sign in SIDES:
        wrist = pose.point_on('hips', (sign * 0.13, 0.17, 1.03))
        pole = Vector((sign * (1 - 0.45 * squeeze), 0.35 + 0.8 * squeeze, 0.05))
        apply_arm(pose, side, trunk, wrist, pole, Vector((0, -1, 0)), hand_dir=Vector((sign * -0.2, 0.15, -1)), curl=0)
    return pose


def sit_on_floor(pose):
    trunk = rot_x(0)
    apply_spine(pose, (0, 0.03, 0.14), trunk, trunk, trunk, rot_x(0), rot_x(0))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.14, -0.72, 0.09), rot_x(-90) @ rot_z(sign * 6), Vector((sign * 0.2, -0.2, 1)))
    return trunk


def behind_head(phase):
    pose = Pose()
    trunk = sit_on_floor(pose)
    back = ease(phase)
    for side, sign in SIDES:
        wrist = pose.point_on('head', (sign * 0.05, 0.13, 1.63))
        pole = Vector((sign, -0.35 + 0.75 * back, 0.35))
        apply_arm(pose, side, trunk, wrist, pole, Vector((-sign * 0.3, -1, 0)), hand_dir=Vector((-sign, 0.2, 0)), curl=15)
    return pose


def overhead_pole(phase):
    pose = Pose()
    trunk = stand(pose)
    shoulder = shoulder_of(pose, '_l', trunk)
    center = Vector((0, shoulder.y, shoulder.z))
    half = 0.45
    reach = math.sqrt(REACH ** 2 - (half - shoulder.x) ** 2) * 0.97
    # From hanging in front of the hips, up and over to behind the head.
    angle = math.radians(-65 + 195 * ease(phase))
    bar = center + Vector((0, -math.cos(angle), math.sin(angle))) * reach
    pose.props['prop_pole'] = (bar, Quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bar + Vector((sign * half, 0, 0)), Vector((sign * 0.9, 0.3, -0.3)),
                  Vector((0, math.sin(angle), math.cos(angle))), handle=ACROSS)
    return pose


def ball_stretch(phase):
    pose = Pose()
    low = ease(phase)
    body = rot_x(68 + 6 * low)
    hips_at = (0, 0.1, 0.52 - 0.04 * low)
    apply_spine(pose, hips_at, rot_x(45), body, body, rot_x(55), rot_x(45))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.09, 0.42, 0.1), rot_x(165), Vector((0, -1, 0)))
    # Supporting hand under the shoulder; the other forearm stands on the ball, out to the side.
    plank_hand(pose, '_r', -1, body, (-0.22, -0.42, 0.07))
    pose.props['prop_stability_ball'] = (Vector((0.62, -0.42, 0.3)), Quaternion())
    apply_arm(pose, '_l', body, (0.62, -0.47, 0.84), Vector((0.5, 0.1, -1)), Vector((-1, 0, 0)), curl=30)
    return pose


def lerp(start, end, t):
    return start + (end - start) * t


def through(t, keys):
    """The value at `t` of a path through (time, values) keys, easing in and out of each key."""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            share = smoothstep(t0, t1, t)
            return tuple(lerp(a, b, share) for a, b in zip(v0, v1))
    return keys[-1][1]


def scapula(trunk, sign, raised=0, drawn=0):
    """Clavicle with the shoulder raised and drawn back (degrees); negatives lower it and push it forward."""
    return trunk @ rot_y(-sign * raised) @ rot_z(sign * drawn)


def arm_out(direction, elbow=10):
    """An end of a hand's path: as far along `direction` as the arm reaches, the elbow bent this far from straight."""
    def offset(half=SHOULDER_X):
        return Vector(direction).normalized() * math.sqrt(arm_span(elbow, TO_GRIP) ** 2 - (half - SHOULDER_X) ** 2)
    return offset


def near(x, y, z):
    """An end of a hand's path: this far from the shoulder."""
    return lambda half=SHOULDER_X: Vector((x, y, z))


def flat_back(pose, hips_at, lean):
    """The torso tipped forward from the hips with the spine straight and the head up."""
    apply_spine(pose, hips_at, rot_x(lean * 0.9), rot_x(lean * 0.97), rot_x(lean), rot_x(lean * 0.55), rot_x(lean * 0.3))
    return rot_x(lean)


def hinge(lean=ROW_LEAN, knee=150, ankle_x=ANKLE_X, hips_back=0.38):
    """A hip hinge: hips back (by `hips_back` at a level torso) and only as low as a leg with this knee angle (degrees) reaches, feet planted."""
    thigh, shin = bone_length('thigh_l'), bone_length('shin_l')
    leg = math.sqrt(thigh ** 2 + shin ** 2 - 2 * thigh * shin * math.cos(math.radians(knee)))
    hip_rest = REST['thigh_l'][0] - REST['hips'][0]

    def base(pose, _t=0):
        hip_offset = rot_x(lean * 0.9) @ hip_rest
        hips_y = 0.03 + hips_back * lean / 90
        hip_y = hips_y + hip_offset.y
        hip_z = ANKLE_Z + math.sqrt(leg ** 2 - (hip_y - ANKLE_Y) ** 2 - (ankle_x - hip_rest.x) ** 2)
        trunk = flat_back(pose, (0, hips_y, hip_z - hip_offset.z), lean)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * ankle_x, ANKLE_Y, ANKLE_Z), rot_z(sign * 10), Vector((sign * 0.15, -1, 0)))
        return trunk
    return base


def hinging(lean, knee=150, hips_back=0.38):
    """A hinge that deepens from upright as the rep goes on."""
    return lambda pose, t=0: hinge(lean * t, knee, hips_back=hips_back)(pose, t)


def standing(lean=0):
    return lambda pose, _t=0: stand(pose, lean=lean)


def stool_seat(prop, lean_start, lean_end):
    def base(pose, t=0):
        pose.props[prop] = (ORIGIN, NOTHING_HELD)
        lean = lerp(lean_start, lean_end, t)
        trunk = rot_x(lean)
        apply_spine(pose, (0, 0.03, 0.59), rot_x(lean * 0.8), trunk, trunk, rot_x(lean * 0.5), rot_x(lean * 0.2))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.18, -0.4, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.2, -1, 0.2)))
        return trunk
    return base


def row_seat(lean_start=14, lean_end=-4):
    """Low seat, legs out with soft knees, feet flat on the plate."""
    def base(pose, t=0):
        pose.props['prop_row_seat'] = (ORIGIN, NOTHING_HELD)
        lean = lerp(lean_start, lean_end, t)
        trunk = rot_x(lean)
        apply_spine(pose, (0, 0.03, 0.355), rot_x(lean * 0.7), trunk, trunk, rot_x(lean * 0.4), rot_x(lean * 0.2))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.13, -0.7, 0.18), rot_x(-70), Vector((sign * 0.15, -0.2, 1)))
        return trunk
    return base


def kneel(lean=0):
    def base(pose, _t=0):
        trunk = rot_x(lean)
        apply_spine(pose, (0, 0.1, 0.53), trunk, trunk, trunk, rot_x(lean * 0.5), rot_x(lean * 0.2))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.12, 0.46, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.1, -1, 0)))
        return trunk
    return base


def split_stance(lean=14, forward_sign=-1):
    """Wide split stance, the back heel lifted. `forward_sign` says which foot is in front."""
    def base(pose, _t=0):
        trunk = flat_back(pose, (0, 0.1, 0.8), lean)
        for side, sign in SIDES:
            front = sign == forward_sign
            ankle = (sign * 0.13, -0.3 if front else 0.52, ANKLE_Z + (0 if front else 0.07))
            apply_leg(pose, side, ankle, rot_z(sign * 6) if front else rot_x(35), Vector((sign * 0.1, -1, 0)))
        return trunk
    return base


def prone_incline(pose, _t=0):
    """Chest on an incline bench that rises towards -y, feet planted either side of its seat."""
    pose.props[BENCHES[INCLINE]['prop']] = (ORIGIN, rot_z(180))
    tilt = math.radians(BENCHES[INCLINE]['tilt'])
    along = Vector((0, -math.cos(tilt), math.sin(tilt)))
    normal = Vector((0, math.sin(tilt), math.cos(tilt)))
    lean = 90 - BENCHES[INCLINE]['tilt']
    trunk = rot_x(lean)
    hips_at = Vector((0, 0.12, 0.46)) + along * 0.12 + normal * 0.15
    apply_spine(pose, hips_at, trunk, trunk, trunk, rot_x(lean * 0.6), rot_x(lean * 0.3))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.27, 0.6, ANKLE_Z), rot_z(sign * 12), Vector((sign * 0.6, -0.6, -0.2)))
    return trunk


def prone_high_bench(pose, _t=0):
    pose.props['prop_bench_high'] = (ORIGIN, NOTHING_HELD)
    trunk = rot_x(90)
    hips_at = (0, 0.28, HIGH_BENCH_TOP + 0.12)
    apply_spine(pose, hips_at, trunk, trunk, trunk, rot_x(60), rot_x(35))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.09, 1.04, HIGH_BENCH_TOP + 0.08), FOOT_POINTED_BACK, Vector((sign * 0.1, 0, -1)))
    return trunk


def bench_row_stance(pose, _t=0):
    """One knee and one hand on the bench, the other foot on the floor, torso nearly level."""
    pose.props['prop_bench_flat'] = (Vector((-0.2, 0.05, 0)), NOTHING_HELD)
    trunk = flat_back(pose, (0, 0.32, 0.8), 78)
    apply_leg(pose, '_l', (0.2, 0.34, ANKLE_Z), rot_z(10), Vector((0.2, -1, 0)))
    apply_leg(pose, '_r', (-0.15, 0.42, 0.53), FOOT_POINTED_BACK, Vector((-0.05, -1, -0.1)))
    apply_arm(pose, '_r', trunk, (-0.21, -0.2, 0.53), Vector((-0.7, 0.3, 0)), Vector((0, 0, -1)), hand_dir=Vector((0, -1, 0)), curl=0)
    return trunk


def bar_clip(base, half, start, end, palm, pole, raised=(0, 0), drawn=(0, 0), prop='prop_bar_loaded', handle=ACROSS,
             prop_turn=NOTHING_HELD, curl=FULL_GRIP_CURL):
    """Two hands on one bar, travelling from `start` to `end` relative to the middle of the shoulders.

    `palm` and `pole` are given for the left arm and mirrored for the right.
    """
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        trunk = base(pose, t)
        clavicles = {side: scapula(trunk, sign, lerp(*raised, t), lerp(*drawn, t)) for side, sign in SIDES}
        left = shoulder_of(pose, '_l', clavicles['_l'])
        center = (left + shoulder_of(pose, '_r', clavicles['_r'])) / 2
        # The hand's offset sideways from a shoulder that may have moved in as it rose.
        reach_half = half + SHOULDER_X - left.x
        bar = center + start(reach_half).lerp(end(reach_half), t)
        if prop:
            pose.props[prop] = (bar, prop_turn)
        for side, sign in SIDES:
            apply_arm(pose, side, clavicles[side], bar + Vector((sign * half, 0, 0)), side_pole(Vector(pole), sign),
                      side_pole(Vector(palm), sign), handle=handle, curl=curl)
        return pose
    return clip


def rows(base, start, end, palm, pole, arms=SIDES, rest=arm_at_side, raised=(0, 0), drawn=(0, 0), prop=None, end_palm=None,
         palm_via=None, alternate=False, curl=FULL_GRIP_CURL, arc=False, thumb_closed=True):
    """Each hand travels on its own from `start` to `end` relative to its shoulder, given for the left and mirrored.

    `prop` is the name of the bones that hold a one-hand weight, without the side. With `alternate`,
    the arms take turns and the clip's rep is the pair of them. With `arc`, the hand swings around the
    shoulder rather than cutting straight past it. `palm_via` is the way the palm faces halfway when
    `end_palm` is opposite `palm`.
    """
    def clip(phase):
        pose = Pose()
        trunk = base(pose, ease(2 * phase) if alternate else ease(phase))
        for side, sign in SIDES:
            if (side, sign) not in arms:
                rest(pose, side, sign, trunk)
                continue
            if alternate:
                t = ease(2 * phase) if (phase < 0.5) == (side == '_l') else 0.0
            else:
                t = ease(phase)
            clavicle = scapula(trunk, sign, lerp(*raised, t), lerp(*drawn, t))
            shoulder = shoulder_of(pose, side, clavicle)
            offset = start().lerp(end(), t)
            if arc:
                offset = offset.normalized() * lerp(start().length, end().length, t)
            hand = shoulder + side_pole(offset, sign)
            facing = Vector(palm).lerp(Vector(end_palm or palm), t)
            if palm_via:
                facing += Vector(palm_via) * math.sin(math.pi * t)
            facing = side_pole(facing.normalized(), sign)
            fore_dir, reached = apply_arm(pose, side, clavicle, hand, side_pole(Vector(pole), sign), facing, curl=curl, thumb_closed=thumb_closed)
            if prop:
                held(pose, f'{prop}{side}', fore_dir, reached, facing)
        return pose
    return clip


def straight_arm(base, half, start, end, prop='prop_pole', elbow=12, inward=False, curl=FULL_GRIP_CURL):
    """Both arms sweep in an arc, elbows locked. Angles (degrees) are from straight ahead, + up."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        trunk = base(pose, t)
        angle = math.radians(lerp(start, end, t))
        out = Vector((0, -math.cos(angle), math.sin(angle)))
        # Hanging, the elbow points back and the palm faces it; both turn with the arm.
        behind = Vector((0, -math.sin(angle), -math.cos(angle)))
        center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
        bar = center + out * arm_out((0, 0, 1), elbow)(half).length
        if prop:
            pose.props[prop] = (bar, NOTHING_HELD)
        for side, sign in SIDES:
            pole = Vector((sign * 0.25, 0, 0)) + behind
            palm = Vector((-sign, 0, 0)) if inward else behind
            apply_arm(pose, side, trunk, bar + Vector((sign * half, 0, 0)), pole, palm, handle=None if inward else ACROSS, curl=curl)
        return pose
    return clip


def hand_on_knee(pose, side, sign, trunk):
    wrist = pose.point_on(f'shin{side}', (sign * 0.09, -0.04, 0.54))
    apply_arm(pose, side, trunk, wrist, Vector((sign * 0.8, 0.2, 0.3)), Vector((0, 1, 0)), hand_dir=Vector((-sign * 0.2, -0.3, -1)), curl=25)


def hand_on_thigh(pose, side, sign, trunk):
    wrist = pose.point_on(f'thigh{side}', (sign * 0.1, -0.05, 0.8))
    apply_arm(pose, side, trunk, wrist, Vector((sign * 0.8, 0.4, 0)), Vector((0, 0, -1)), hand_dir=Vector((-sign * 0.1, -1, -0.1)), curl=25)


def hands_on_hips(pose, side, sign, trunk):
    wrist = pose.point_on('hips', (sign * 0.21, 0.02, 0.99))
    apply_arm(pose, side, trunk, wrist, Vector((sign, 0.4, -0.2)), Vector((-sign, 0, 0)), hand_dir=Vector((-sign * 0.4, -0.2, -1)), curl=20)


def crossed_on_chest(pose, side, sign, trunk):
    """Forearms crossed over the chest, each hand towards the other shoulder."""
    wrist = pose.point_on('spine2', (-sign * 0.09, -0.16, 1.32 + sign * 0.025))
    apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign * 0.8, -0.4, -0.7)), trunk @ Vector((0, 1, 0)),
              hand_dir=trunk @ Vector((-sign, 0, 0.3)), curl=25)


def behind_the_neck(pose, side, sign, trunk):
    """Fingertips behind the head, elbows out."""
    wrist = pose.point_on('head', (sign * 0.09, 0.12, 1.6))
    apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign, -0.1, 0.1)), trunk @ Vector((0, -1, 0)),
              hand_dir=trunk @ Vector((-sign, 0, 0)), curl=20)


def long_bar_row(arms):
    """The bar's far end stays on the floor, so the hands travel in an arc around it."""
    def clip(phase):
        pose = Pose()
        trunk = hinge()(pose)
        one_arm = len(arms) == 1
        x = arms[0][1] * 0.22 if one_arm else 0.0
        lowest = 0.36
        anchor_y = -0.2 + math.sqrt(LONG_BAR_GRIP ** 2 - lowest ** 2)
        z = lerp(lowest, 0.68, ease(phase))
        grip = Vector((x, anchor_y - math.sqrt(LONG_BAR_GRIP ** 2 - z ** 2), z))
        direction = (grip - Vector((x, anchor_y, 0))).normalized()
        rotation = Matrix((ACROSS, direction, ACROSS.cross(direction))).transposed().to_quaternion()
        pose.props['prop_long_bar'] = (Vector((x, anchor_y, 0)), rotation)
        if not one_arm:
            pose.props['prop_v_handle'] = (grip + Vector((0, 0, -0.02)), rotation)
        for side, sign in SIDES:
            if (side, sign) not in arms:
                hand_on_knee(pose, side, sign, trunk)
                continue
            clavicle = scapula(trunk, sign, 0, lerp(-6, 14, ease(phase)))
            hand = grip if one_arm else grip + Vector((sign * V_HANDLE_HALF, 0, -0.02))
            apply_arm(pose, side, clavicle, hand, Vector((sign * 0.3, 0.8, 0.5)), Vector((-sign, 0, 0)), handle=direction)
        return pose
    return clip


def renegade_row(phase):
    pose = Pose()
    half = 0.2
    grip_z = 0.19
    left_turn = phase < 0.5
    pull = ease(2 * phase)
    # The hips roll a little away from the arm that lifts.
    body, _ = plank(pose, grip_z + REACH * 0.93, grip_z, 0.02, half, roll=(1 if left_turn else -1) * 7 * pull, feet_out=0.12)
    for side, sign in SIDES:
        t = pull if left_turn == (side == '_l') else 0.0
        floor = Vector((sign * half, HANDS_Y, grip_z))
        shoulder = shoulder_of(pose, side, body)
        hand = floor.lerp(shoulder + Vector((sign * 0.03, 0.2, -0.2)), t)
        palm = Vector((-sign, 0, 0))
        fore_dir, reached = apply_arm(pose, side, body, hand, Vector((sign * 0.3, 0.8, 0.5)), palm)
        held(pose, f'prop_hanging_kettlebell{side}', fore_dir, reached, palm)
    return pose


def inverted_row(half, palm, handle=ACROSS, prop='prop_barbell', bar=Vector((0, 0.2, 0.95))):
    """Hanging under a waist-high bar, heels on the floor, the straight body pivoting at the ankles."""
    def clip(phase):
        pose = Pose()
        tilt = math.radians(lerp(11, 33, ease(phase)))
        ankle_y = -1.0
        shoulders = Vector((0, ankle_y + ANKLES_TO_SHOULDERS * math.cos(tilt), ANKLE_Z + ANKLES_TO_SHOULDERS * math.sin(tilt)))
        body = rot_x(-90 + math.degrees(tilt))
        hips_at = shoulders - body @ HIPS_TO_SHOULDERS
        apply_spine(pose, hips_at, body, body, body, body @ rot_x(14), body @ rot_x(14))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.1, ankle_y, ANKLE_Z), body, Vector((sign * 0.1, 0.2, 1)))
        if prop:
            pose.props[prop] = (bar, NOTHING_HELD)
        for side, sign in SIDES:
            clavicle = scapula(body, sign, 0, lerp(-8, 12, ease(phase)))
            apply_arm(pose, side, clavicle, bar + Vector((sign * half, 0, 0)), Vector((sign * 0.5, -0.6, -0.7)),
                      side_pole(Vector(palm), sign), handle=handle)
        return pose
    return clip


def hang_legs(pose, hips_at, tilt):
    """Legs hang under the hips, knees a little bent and toes pointed; `tilt` swings them like the torso."""
    swing = rot_x(tilt)
    for side, sign in SIDES:
        ankle = Vector(hips_at) + swing @ Vector((sign * 0.09, 0.09, -0.74))
        apply_leg(pose, side, ankle, rot_x(tilt + 35), swing @ Vector((sign * 0.1, -1, 0)))


def hanging_pull(half, palm, pole, top, lean=(-12, -28), raised=(18, -6), drawn=(-5, 14), handle=ACROSS, handle_prop=None,
                 prop='prop_pullup_bar', sideways=0.0):
    """Hands fixed on a bar, the body rises to `top`: the shoulders' (y, z) from the bar, or None to rise on the shoulder blades alone.

    `palm` and `pole` are for the left arm and mirrored; `palm` may also be a pair of (left, right).
    With `sideways`, reps go to the left then the right, that far over the hand.
    """
    grip_z = BAR_Z - (0.1 if handle_prop else 0.0)
    rest_y = 0.02

    def clip(phase):
        pose = Pose()
        t = ease(2 * phase) if sideways else ease(phase)
        tilt = lerp(*lean, t)
        body = rot_x(tilt)
        hanging = arm_out((0, 0, -1), 14)(half).length
        low = Vector((0, rest_y, grip_z - hanging))
        high = low if top is None else Vector((0, top[0], grip_z + top[1]))
        shoulders = low.lerp(high, t)
        if sideways:
            shoulders.x = sideways * t * (1 if phase < 0.5 else -1)
        clavicles = {side: scapula(body, sign, lerp(*raised, t), lerp(*drawn, t)) for side, sign in SIDES}
        apply_spine(pose, ORIGIN, body, body, body, rot_x(tilt * 0.4), rot_x(tilt * 0.1))
        now = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
        hips_at = shoulders - now
        apply_spine(pose, hips_at, body, body, body, rot_x(tilt * 0.4), rot_x(tilt * 0.1))
        hang_legs(pose, hips_at, tilt * 0.8)
        pose.props[prop] = (Vector((0, 0, BAR_Z)), NOTHING_HELD)
        if handle_prop:
            pose.props[handle_prop] = (Vector((0, 0, grip_z)), NOTHING_HELD)
        for side, sign in SIDES:
            facing = palm[0 if sign > 0 else 1] if isinstance(palm[0], tuple) else palm
            apply_arm(pose, side, clavicles[side], Vector((sign * half, 0, grip_z)), side_pole(Vector(pole), sign),
                      side_pole(Vector(facing), sign), handle=handle)
        return pose
    return clip


def one_handed_hang(phase):
    pose = Pose()
    sink = ease(phase)
    pose.props['prop_pullup_bar'] = (Vector((0, 0, BAR_Z)), NOTHING_HELD)
    pose.props['prop_box'] = (Vector((0, 0.03, 0)), NOTHING_HELD)
    trunk = rot_x(0)
    hips_at = (0, 0.04, 1.26 - 0.1 * sink)
    apply_spine(pose, hips_at, trunk, trunk, rot_y(-4 * sink), rot_x(0), rot_x(0))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.13, ANKLE_Y, 0.45 + ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.15, -1, 0)))
    clavicle = scapula(pose.rotation['spine2'], 1, 14 + 12 * sink, 0)
    apply_arm(pose, '_l', clavicle, (0.2, 0, BAR_Z), Vector((0.8, -0.1, -0.6)), Vector((0, -1, 0)), handle=ACROSS)
    hanging = shoulder_of(pose, '_r', trunk) + Vector((-0.06, 0.02, -arm_span(20, TO_WRIST)))
    apply_arm(pose, '_r', trunk, hanging, Vector((-0.3, 0.9, 0)), Vector((1, 0, 0)), hand_dir=Vector((0, 0, -1)), curl=20)
    return pose


def muscle_up(phase):
    pose = Pose()
    grip = Vector((0, 0, BAR_Z))
    pose.props['prop_rings'] = (grip, NOTHING_HELD)
    # Shoulders from the rings (y, z), torso lean, and shoulder lift: the hang, the top of the pull, over the rings, lockout.
    t = ease(phase)
    y, z, tilt, raised = through(t, (
        (0.0, (0.02, -0.6, -6, 18)),
        (0.38, (0.2, -0.1, -20, -4)),
        (0.7, (0.0, 0.23, 24, -8)),
        (1.0, (0.02, 0.56, 4, -6)),
    ))
    body = rot_x(tilt)
    clavicles = {side: scapula(body, sign, raised, 0) for side, sign in SIDES}
    apply_spine(pose, ORIGIN, body, body, body, rot_x(tilt * 0.4), rot_x(tilt * 0.1))
    now = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
    hips_at = grip + Vector((0, y, z)) - now
    apply_spine(pose, hips_at, body, body, body, rot_x(tilt * 0.4), rot_x(tilt * 0.1))
    hang_legs(pose, hips_at, tilt * 0.4)
    # The elbows point out and down on the pull, then turn behind the hands for the dip.
    behind = smoothstep(0.2, 0.75, t)
    for side, sign in SIDES:
        pole = Vector((sign * 0.8, 0.3, -0.5)).lerp(Vector((sign * 0.25, 1, 0.05)), behind)
        apply_arm(pose, side, clavicles[side], grip + Vector((sign * RING_X, 0, 0)), pole, Vector((-sign, 0, 0)))
    return pose


def rope_climb(phase):
    """Climbing in place: each hand pulls down while it holds the rope, then lets go and reaches up again."""
    pose = Pose()
    trunk = rot_x(-6)
    rope_y = -0.19
    shoulders_z = 1.95 + 0.05 * math.sin(4 * math.pi * phase)
    pose.props['prop_rope'] = (Vector((0, rope_y, ROPE_LENGTH / 2)), NOTHING_HELD)
    hips_at = Vector((0, 0.03, shoulders_z - 0.5))
    apply_spine(pose, hips_at, trunk, trunk, trunk, rot_x(-8), rot_x(-4))
    tuck = 0.5 + 0.5 * math.cos(4 * math.pi * phase)
    for side, sign in SIDES:
        ankle = hips_at + Vector((sign * 0.05, lerp(0.02, -0.12, tuck), lerp(-0.75, -0.48, tuck)))
        apply_leg(pose, side, ankle, rot_x(30), Vector((sign * 0.25, -1, 0)))
        own = (phase + (0 if side == '_l' else 0.5)) % 1
        if own < 0.7:
            height, out = lerp(0.5, -0.05, smoothstep(0, 0.7, own)), 0.0
        else:
            back = smoothstep(0.7, 1, own)
            height, out = lerp(-0.05, 0.5, back), 0.1 * math.sin(math.pi * back)
        clavicle = scapula(trunk, sign, 8 + 12 * max(height, 0), 0)
        hand = Vector((sign * (0.02 + out), rope_y, shoulders_z + height))
        apply_arm(pose, side, clavicle, hand, Vector((sign * 0.8, -0.1, -0.6)), Vector((0, -1, 0)), handle=UP, fade_twist=True)
    return pose


def london_bridge(phase):
    pose = Pose()
    lean = 90 * ease(phase)
    pose.props['prop_box'] = (Vector((0, 0, 0)), NOTHING_HELD)
    ankle = Vector((0, ANKLE_Y, 0.45 + ANKLE_Z))
    body = rot_x(-lean)
    shoulders = ankle + body @ Vector((0, 0, ANKLES_TO_SHOULDERS))
    hips_at = shoulders - body @ HIPS_TO_SHOULDERS
    neck = body @ rot_x(min(lean * 0.4, 25))
    apply_spine(pose, hips_at, body, body, body, neck, neck)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.1, ANKLE_Y, ankle.z), rot_x(-lean * 0.75), body @ Vector((sign * 0.1, -1, 0)))
    anchor = Vector((0, 0.75, 3.7))
    direction = (anchor - shoulders).normalized()
    hands = shoulders + direction * 0.5
    x = direction.cross(ACROSS).cross(direction).normalized()
    rotation = Matrix((x, direction.cross(x) * -1, direction)).transposed().to_quaternion()
    # The rope runs up from just past the hands.
    pose.props['prop_rope'] = (hands + direction * (ROPE_LENGTH / 2 - 0.12), rotation)
    for side, sign in SIDES:
        apply_arm(pose, side, body, hands + direction * (sign * 0.06), Vector((sign * 0.8, 0, 0)) + body @ Vector((0, 0.3, -0.5)),
                  Vector((0, -1, 0)), handle=direction)
    return pose


def deadlift(start_z=BAR_ON_FLOOR, floor=0.0, shin_tilt=13, half=0.24, prop=None):
    """The bar rises in front of the shins on straight arms; the hips go where the thigh and torso then meet.

    `shin_tilt` is how far (degrees) the knees start ahead of the ankles; they come back as the bar nears them.
    """
    ankle_y, ankle_z = ANKLE_Y, ANKLE_Z + floor
    shin = bone_length('shin_l')
    thigh = bone_length('thigh_l')
    hip_rest = REST['thigh_l'][0] - REST['hips'][0]
    hip_to_shoulder = (REST['upper_arm_l'][0] - REST['thigh_l'][0]) * Vector((0, 1, 1))
    arm = arm_out((0, 0, 1), 6)(half).length

    def clip(phase):
        pose = Pose()
        t = ease(phase)
        bar = Vector((0, lerp(-0.065, -0.095, t), lerp(start_z, 0.77 + floor, t)))
        tilt = math.radians(lerp(shin_tilt, 3, smoothstep(0, 0.55, t)))
        knee = Vector((0, ankle_y - shin * math.sin(tilt), ankle_z + shin * math.cos(tilt)))
        # The shoulders stay just ahead of the bar until it has passed the knees.
        behind_bar = lerp(-0.03, 0.115, smoothstep(0.35, 1, t))
        shoulder = bar + Vector((0, behind_bar, math.sqrt(arm ** 2 - behind_bar ** 2)))
        hip, _ = solve_two_bone(knee, shoulder, thigh, hip_to_shoulder.length, Vector((0, 1, 0)))
        lean = max(0.0, math.degrees(math.atan2(hip.y - shoulder.y, shoulder.z - hip.z)))
        hips_at = hip - rot_x(lean * 0.9) @ (hip_rest * Vector((0, 1, 1)))
        trunk = flat_back(pose, hips_at, lean)
        clavicles = {side: scapula(trunk, sign, 0, lerp(-6, 8, t)) for side, sign in SIDES}
        # The spine is not one straight bone, so the shoulder lands a little off: move the hips to put it back.
        missed = shoulder - shoulder_of(pose, '_l', clavicles['_l'])
        missed.x = 0
        trunk = flat_back(pose, hips_at + missed, lean)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.12, ankle_y, ankle_z), rot_z(sign * 10), Vector((sign * 0.2, -1, 0)))
        pose.props['prop_bar_loaded'] = (bar, NOTHING_HELD)
        if prop:
            pose.props[prop] = (ORIGIN, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, clavicles[side], bar + Vector((sign * half, 0, 0)), Vector((sign * 0.15, 0.9, 0)), Vector((0, 1, 0)), handle=ACROSS)
        return pose
    return clip


def good_morning(base):
    """The bar stays on the back of the shoulders while the torso hinges."""
    def clip(phase):
        pose = Pose()
        trunk = base(pose, ease(phase))
        bar = pose.point_on('spine2', (0, 0.105, 1.445))
        pose.props['prop_bar_loaded'] = (bar, NOTHING_HELD)
        across = trunk @ ACROSS
        for side, sign in SIDES:
            apply_arm(pose, side, scapula(trunk, sign, 6, 0), bar + across * (sign * 0.3), trunk @ Vector((sign * 0.5, 0.35, -1)),
                      trunk @ Vector((0, -1, 0.15)), handle=across)
        return pose
    return clip


def hyperextension(phase):
    pose = Pose()
    pose.props['prop_bench_hyperextension'] = (ORIGIN, NOTHING_HELD)
    bend = ease(phase)
    level = rot_x(90)
    hips_at = (0, -0.08, 1.03)
    lean = 90 + 75 * bend
    apply_spine(pose, hips_at, rot_x(90 + 66 * bend), rot_x(90 + 72 * bend), rot_x(lean), rot_x(lean - 30), rot_x(lean - 50))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.09, 0.73, 1.04), FOOT_POINTED_BACK, level @ Vector((sign * 0.1, -1, 0)))
    trunk = rot_x(lean)
    for side, sign in SIDES:
        crossed_on_chest(pose, side, sign, trunk)
    return pose


def ball_hyperextension(phase):
    pose = Pose()
    pose.props['prop_stability_ball'] = (Vector((0, -0.05, 0.3)), NOTHING_HELD)
    rise = ease(phase)
    lean = 100 - 35 * rise
    hips_at = (0, 0.15, 0.68)
    apply_spine(pose, hips_at, rot_x(95 - 15 * rise), rot_x(97 - 25 * rise), rot_x(lean), rot_x(lean - 40), rot_x(lean - 60))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.14, 0.78, ANKLE_Z + 0.04), rot_x(50), Vector((sign * 0.1, -1, 0)))
    trunk = rot_x(lean)
    for side, sign in SIDES:
        behind_the_neck(pose, side, sign, trunk)
    return pose


def superman(phase):
    pose = Pose()
    lift = ease(phase)
    hips_at = (0, 0.32, 0.14)
    apply_spine(pose, hips_at, rot_x(90), rot_x(90 - 8 * lift), rot_x(90 - 22 * lift), rot_x(70 - 30 * lift), rot_x(55 - 30 * lift))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.1, 1.13, 0.1 + 0.2 * lift), FOOT_POINTED_BACK, Vector((sign * 0.1, 0, -1)))
    trunk = pose.rotation['spine2']
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 15, 0)
        shoulder = shoulder_of(pose, side, clavicle)
        wrist = shoulder + Vector((sign * 0.1, -1, 0.02 + 0.02 * lift)).normalized() * WRIST_REACH * 0.97
        apply_arm(pose, side, clavicle, wrist, Vector((sign * 0.8, 0, 0.5)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.1, -1, 0)), curl=10)
    return pose


def on_all_fours(pose, hips_at, hips, spine1, spine2, neck, head, knee_y=0.35):
    apply_spine(pose, hips_at, hips, spine1, spine2, neck, head)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.11, knee_y + 0.35, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.1, -1, 0)))


def all_fours_hands(pose, wrist_y, trunk):
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, (sign * 0.22, wrist_y, 0.07), Vector((sign * 0.9, 0.3, 0.3)), Vector((0, 0, -1)),
                  hand_dir=Vector((sign * 0.15, -1, 0)), curl=0)


def cat_stretch(phase):
    pose = Pose()
    arch = ease(phase)
    on_all_fours(pose, (0, 0.36, 0.52), rot_x(80 - 26 * arch), rot_x(80 + 4 * arch), rot_x(80 + 34 * arch), rot_x(70 + 62 * arch), rot_x(60 + 80 * arch))
    all_fours_hands(pose, -0.13, pose.rotation['spine2'])
    return pose


def childs_pose(phase):
    pose = Pose()
    t = ease(phase)
    hips_at = (0, lerp(0.36, 0.62, t), lerp(0.52, 0.3, t))
    lean = lerp(80, 92, t)
    on_all_fours(pose, hips_at, rot_x(lean - 14 * t), rot_x(lean - 4 * t), rot_x(lean), rot_x(lean - 10 + 28 * t), rot_x(lean - 20 + 62 * t), knee_y=0.28)
    all_fours_hands(pose, lerp(-0.15, -0.37, t), rot_x(lean))
    return pose


def supine_hips(pose, shoulders, angle, ankle_y=-0.72):
    """Lying on the back with the shoulders here and the torso raised `angle` at the hips' end. Knees up, feet on the floor."""
    body = rot_x(-90 - angle)
    hips_at = Vector(shoulders) - body @ HIPS_TO_SHOULDERS
    flat = rot_x(-90)
    apply_spine(pose, hips_at, body, body, body, flat @ rot_x(8), flat @ rot_x(8))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.16, ankle_y, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.25, -0.3, 1)))
    return body


def arms_on_floor(pose, shoulder_y):
    for side, sign in SIDES:
        wrist = (sign * 0.32, shoulder_y - 0.48, 0.05)
        apply_arm(pose, side, pose.rotation['spine2'], wrist, Vector((sign, 0, 0.3)), Vector((0, 0, -1)),
                  hand_dir=Vector((sign * 0.1, -1, 0)), curl=5)


def pelvic_bridge(phase):
    pose = Pose()
    shoulder_y = 0.24
    lift = through(ease(phase), ((0, (0,)), (0.35, (6,)), (1, (30,))))[0]
    supine_hips(pose, (0, shoulder_y, BACK_DEPTH), lift)
    arms_on_floor(pose, shoulder_y)
    return pose


def standing_pelvic_tilt(phase):
    pose = Pose()
    tilt = ease(phase)
    apply_spine(pose, (0, 0.03 - 0.02 * tilt, 0.865), rot_x(-13 * tilt), rot_x(-6 * tilt), rot_x(0), rot_x(0), rot_x(0))
    planted_legs(pose, toe_out=8, knee_out=0.12)
    trunk = rot_x(0)
    for side, sign in SIDES:
        hands_on_hips(pose, side, sign, trunk)
    return pose


def hug_knees(phase):
    pose = Pose()
    t = ease(phase)
    body = rot_x(-90 - 14 * t)
    flat = rot_x(-90)
    hips_at = Vector((0, -0.28, BACK_DEPTH + 0.02 * t))
    apply_spine(pose, hips_at, body, flat, flat, flat @ rot_x(20 * t + 8), flat @ rot_x(30 * t + 8))
    for side, sign in SIDES:
        ankle = Vector((sign * 0.16, -0.72, ANKLE_Z)).lerp(hips_at + Vector((sign * 0.12, -0.06, 0.42)), t)
        foot = rot_z(sign * 8).slerp(rot_x(-110), t)
        apply_leg(pose, side, ankle, foot, Vector((sign * 0.15, 0.5 + 0.5 * t, 1)))
    for side, sign in SIDES:
        rest = Vector((sign * 0.3, -0.25, 0.05))
        under_knee = pose.point_on(f'shin{side}', (sign * 0.075, -0.03, 0.39))
        wrist = rest.lerp(under_knee, smoothstep(0, 0.45, t))
        apply_arm(pose, side, flat, wrist, Vector((sign, -0.2, 0.3)), Vector((-sign, 0, 0)),
                  hand_dir=Vector((-sign * 0.6, -0.2, 0.5)), curl=40)
    return pose


def foam_roll(shoulders_y, shoulders_z, angle, roller_y, travel=0.07):
    """Lying back over a roller with the hips off the floor, arms crossed, rolling along it."""
    def clip(phase):
        pose = Pose()
        shift = travel * math.sin(2 * math.pi * phase)
        pose.props['prop_foam_roller'] = (Vector((0, roller_y, ROLLER_RADIUS)), NOTHING_HELD)
        body = supine_hips(pose, (0, shoulders_y + shift, shoulders_z), angle)
        for side, sign in SIDES:
            crossed_on_chest(pose, side, sign, body)
        return pose
    return clip


def lie_on_side(pose, hips_at):
    """On the left side, head towards +y, facing +x. The lower knee bends forward; the upper leg lies behind it."""
    body = rot_y(90) @ rot_x(-90)
    apply_spine(pose, hips_at, body, body, body, body @ rot_x(6), body @ rot_x(6))
    hips = Vector(hips_at)
    apply_leg(pose, '_l', hips + Vector((0.34, -0.56, -0.06)), body, Vector((0.9, 0, 0.1)))
    apply_leg(pose, '_r', hips + Vector((-0.1, -0.76, -0.05)), body, Vector((0.6, 0, 0.6)))
    return body


def foam_roll_lat(phase):
    pose = Pose()
    shift = 0.05 * math.sin(2 * math.pi * phase)
    pose.props['prop_foam_roller'] = (Vector((0, 0.32, ROLLER_RADIUS)), NOTHING_HELD)
    body = lie_on_side(pose, (0, -0.1 + shift, 0.2))
    shoulder = shoulder_of(pose, '_l', scapula(body, 1, 20, 0))
    # The lower arm reaches past the head over the roller; the upper hand steadies the body on the floor.
    apply_arm(pose, '_l', scapula(body, 1, 20, 0), shoulder + Vector((0.08, 1, 0.1)).normalized() * WRIST_REACH * 0.9,
              Vector((0.1, 0, 1)), Vector((0, 0, -1)), hand_dir=Vector((0, 1, 0)), curl=15)
    apply_arm(pose, '_r', body, (0.42, 0.05 + shift, 0.05), Vector((0.2, 0.4, 1)), Vector((0, 0, -1)), hand_dir=Vector((0.5, 0.5, 0)), curl=5)
    return pose


def side_lying_stretch(phase):
    pose = Pose()
    t = ease(phase)
    body = lie_on_side(pose, (0, -0.1, 0.17))
    clavicle = scapula(body, -1, 12 + 12 * t, 0)
    shoulder = shoulder_of(pose, '_r', clavicle)
    apply_arm(pose, '_r', clavicle, shoulder + Vector((0.02, 1, 0.1 - 0.1 * t)).normalized() * WRIST_REACH * (0.9 + 0.08 * t),
              Vector((0, -0.2, 1)), Vector((0, 0, -1)), hand_dir=Vector((0, 1, 0)), curl=10)
    apply_arm(pose, '_l', body, (0.3, 0.1, 0.05), Vector((0.1, 0.5, 1)), Vector((0, 0, -1)), hand_dir=Vector((0.8, 0.5, 0)), curl=5)
    return pose


def atlas_stone(phase):
    """Off the floor and into the lap, then up to the chest as the hips finish."""
    pose = Pose()
    hips_y, hips_z, lean, stone_y, stone_z = through(ease(phase), (
        (0.0, (0.22, 0.5, 62, -0.1, STONE_RADIUS)),
        (0.5, (0.27, 0.5, 18, -0.27, 0.72)),
        (1.0, (0.04, 0.88, -5, -0.27, 1.2)),
    ))
    trunk = flat_back(pose, (0, hips_y, hips_z), lean)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.27, ANKLE_Y, ANKLE_Z), rot_z(sign * 22), Vector((sign * 0.6, -1, 0)))
    stone = Vector((0, stone_y, stone_z))
    pose.props['prop_atlas_stone'] = (stone, NOTHING_HELD)
    for side, sign in SIDES:
        grip = stone + Vector((sign * (STONE_RADIUS + 0.01) * 0.93, 0.03, -0.09))
        apply_arm(pose, side, trunk, grip, Vector((sign, 0.5, 0.1)), Vector((-sign, 0, 0.3)), curl=35)
    return pose


def kettlebell_sumo_high_pull(phase):
    pose = Pose()
    t = ease(phase)
    hips_y, hips_z, lean = through(t, ((0.0, (0.15, 0.47, 50)), (1.0, (0.04, 0.87, 0))))
    trunk = flat_back(pose, (0, hips_y, hips_z), lean)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.31, ANKLE_Y, ANKLE_Z), rot_z(sign * 28), Vector((sign * 0.8, -0.6, 0)))
    # The arms stay long while the legs drive, then the elbows lift the bell to the shoulders.
    y, z = through(t, ((0.0, (-0.14, 0.23)), (0.55, (-0.17, 0.72)), (1.0, (-0.26, 1.38))))
    handle = Vector((0, y, z))
    pose.props['prop_hanging_kettlebell_l'] = (handle, Matrix((ACROSS, -UP, Vector((0, 1, 0)))).transposed().to_quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, scapula(trunk, sign, 8 * t, 0), handle + Vector((sign * 0.045, 0, 0)), Vector((sign, 0.25, 0.15)),
                  Vector((0, 1, 0)), handle=ACROSS)
    return pose


def overhead_throw(phase):
    """Ball behind the head, then both arms drive it up and forward."""
    def base(pose, t=0):
        return stand(pose, lean=-8 + 16 * t)
    return bar_clip(base, 0.12, near(0, 0.14, 0.33), arm_out((0, -0.86, 0.5), 14), (-1, 0, 0), (1, 0, 0.25), prop='prop_ball',
                    handle=None, curl=30)(phase)


def stretch_arm_over(phase):
    """Seated, leaning to the left with the right arm over the head; the left hand holds the chair."""
    pose = Pose()
    t = ease(phase)
    pose.props['prop_seat'] = (ORIGIN, NOTHING_HELD)
    apply_spine(pose, (0, 0.03, 0.59), rot_y(4 * t), rot_y(14 * t), rot_y(28 * t), rot_y(30 * t), rot_y(32 * t))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.18, -0.4, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.2, -1, 0.2)))
    trunk = pose.rotation['spine2']
    apply_arm(pose, '_l', trunk, (0.21, -0.03, 0.57), Vector((0.8, 0.5, 0)), Vector((-1, 0, 0)), hand_dir=Vector((0, -0.3, -1)), curl=45)
    clavicle = scapula(trunk, -1, 8 + 18 * t, 0)
    shoulder = shoulder_of(pose, '_r', clavicle)
    # From hanging by the side, out and up over the head: 0 is straight down, measured towards the right.
    swing = math.radians(lerp(14, 150, t))
    out = trunk @ Vector((-math.sin(swing), -0.08, -math.cos(swing))).normalized()
    wrist = shoulder + out * WRIST_REACH * 0.92
    apply_arm(pose, '_r', clavicle, wrist, trunk @ Vector((0, 0.9, -0.3)), trunk @ Vector((math.cos(swing), 0, -math.sin(swing))),
              hand_dir=out, curl=15)
    return pose


def waist_twist(phase):
    pose = Pose()
    turn = math.sin(2 * math.pi * phase)
    apply_spine(pose, (0, 0.03, 0.885), rot_z(5 * turn), rot_z(18 * turn), rot_z(40 * turn), rot_z(46 * turn), rot_z(52 * turn))
    planted_legs(pose, toe_out=10, knee_out=0.15)
    trunk = pose.rotation['spine2']
    for side, sign in SIDES:
        hands_on_hips(pose, side, sign, trunk)
    return pose


def spinal_stretch(phase):
    """Twists in the chair, hands behind the head, then leans to bring the elbow down inside the knee."""
    pose = Pose()
    pose.props['prop_seat'] = (ORIGIN, NOTHING_HELD)
    t = ease(phase)
    twist, lean = through(t, ((0, (0, 0)), (0.5, (-34, 0)), (1, (-38, 38))))
    hips, trunk = rot_x(lean * 0.5), rot_z(twist) @ rot_x(lean)
    apply_spine(pose, (0, 0.03, 0.59), hips, rot_z(twist * 0.5) @ rot_x(lean * 0.8), trunk, trunk @ rot_z(twist * 0.1), trunk @ rot_x(10))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.18, -0.4, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.2, -1, 0.2)))
        behind_the_neck(pose, side, sign, trunk)
    return pose


def dancers_stretch(phase):
    pose = Pose()
    twist = -44 * ease(phase)
    trunk = rot_z(twist)
    apply_spine(pose, (0, 0.03, 0.14), rot_z(twist * 0.1), rot_z(twist * 0.45), trunk, rot_z(twist * 1.1), rot_z(twist * 1.2))
    # Left leg straight on the floor; the right foot crosses over it with the knee up.
    apply_leg(pose, '_l', (0.1, -0.72, 0.09), rot_x(-90), Vector((0.1, -0.2, 1)))
    apply_leg(pose, '_r', (0.12, -0.34, 0.08), rot_z(4), Vector((-0.25, -0.5, 1)))
    knee = pose.head['shin_r']
    apply_arm(pose, '_l', trunk, knee + Vector((0.08, 0.02, 0.0)), Vector((0.9, -0.1, 0.1)), Vector((-1, 0, 0)), curl=30)
    apply_arm(pose, '_r', trunk, (-0.24, 0.14, 0.11), Vector((-0.9, 0.4, 0.2)), Vector((0, 0, -1)), hand_dir=Vector((-0.5, 0.5, 0)), curl=0)
    return pose


def crossover_lunge(phase):
    """A step back with one leg as the torso turns across the front leg; the clip's rep is both sides."""
    pose = Pose()
    t = ease(2 * phase)
    sign_back = 1 if phase < 0.5 else -1
    hips_at = (0, 0.03 + 0.2 * t, 0.885 - 0.33 * t)
    trunk = rot_z(sign_back * 38 * t) @ rot_x(14 * t)
    apply_spine(pose, hips_at, rot_z(sign_back * 8 * t) @ rot_x(8 * t), rot_z(sign_back * 22 * t) @ rot_x(12 * t), trunk, trunk, trunk)
    for side, sign in SIDES:
        if sign == sign_back:
            ankle = (sign * 0.13, lerp(ANKLE_Y, 0.74, t), lerp(ANKLE_Z, 0.16, t))
            apply_leg(pose, side, ankle, rot_x(50 * t) @ rot_z(sign * 8 * (1 - t)), Vector((sign * 0.1, -1, -0.2)))
        else:
            apply_leg(pose, side, (sign * 0.13, lerp(ANKLE_Y, -0.1, t), ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.1, -1, 0)))
    for side, sign in SIDES:
        hands_on_hips(pose, side, sign, trunk)
    return pose


def wall_lat_stretch(phase):
    pose = Pose()
    t = ease(phase)
    pose.props['prop_wall'] = (Vector((0.1, -0.56, 0)), NOTHING_HELD)
    lean = 8 + 16 * t
    trunk = flat_back(pose, (0, 0.03 + 0.03 * t, 0.885), lean)
    planted_legs(pose, toe_out=8, knee_out=0.12)
    clavicle = scapula(trunk, 1, 24, 0)
    # Forearm up the wall, the elbow on it too.
    apply_arm(pose, '_l', clavicle, (0.25, -0.5, 1.72), Vector((0.2, -1, -1)), Vector((0, -1, 0)), hand_dir=Vector((0, 0, 1)), curl=5)
    arm_at_side(pose, '_r', -1, trunk)
    return pose


def overhead_lat_stretch(phase):
    pose = Pose()
    t = ease(phase)
    trunk = sit_on_floor(pose)
    clavicle = scapula(trunk, -1, 22 + 6 * t, 0)
    wrist = pose.point_on('spine2', (-0.04, 0.17, lerp(1.42, 1.34, t)))
    apply_arm(pose, '_r', clavicle, wrist, Vector((-0.3, -0.2, 1)), Vector((0, -1, 0)), hand_dir=Vector((0.15, 0.1, -1)), curl=15)
    apply_arm(pose, '_l', trunk, pose.point_on('thigh_l', (0.1, -0.03, 0.65)), Vector((1, 0.3, 0)), Vector((0, 0, -1)), hand_dir=Vector((0, -1, -0.1)), curl=15)
    return pose


def upper_back_stretch(phase):
    pose = Pose()
    t = ease(phase)
    lean = 16 * t
    apply_spine(pose, (0, 0.03 + 0.03 * t, 0.885), rot_x(0), rot_x(lean * 0.5), rot_x(lean), rot_x(lean + 8 * t), rot_x(lean + 14 * t))
    planted_legs(pose, toe_out=8, knee_out=0.12)
    trunk = pose.rotation['spine2']
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 0, -16 * t)
        shoulder = shoulder_of(pose, side, clavicle)
        wrist = Vector((sign * 0.03, shoulder.y - WRIST_REACH * lerp(0.74, 0.96, t), shoulder.z - 0.08))
        # Fingers laced, palms turned away, thumbs down.
        apply_arm(pose, side, clavicle, wrist, Vector((sign * 0.8, 0.3, -0.5)), Vector((0, -1, 0)), hand_dir=Vector((-sign * 0.2, -0.5, -0.2)), curl=50)
    return pose


def hug_a_ball(phase):
    pose = Pose()
    sway = 0.02 * math.sin(2 * math.pi * phase)
    pose.props['prop_stability_ball'] = (Vector((0, -0.3, 0.3)), NOTHING_HELD)
    trunk = flat_back(pose, (0, 0.14 + sway, 0.34 + sway), 34)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.36, -0.1, ANKLE_Z), rot_z(sign * 24), Vector((sign * 0.8, -0.5, 0.3)))
    for side, sign in SIDES:
        wrist = (sign * 0.26, -0.5, 0.42)
        apply_arm(pose, side, trunk, wrist, Vector((sign, 0.2, 0.2)), Vector((-sign, 0, 0)), hand_dir=Vector((-sign * 0.5, -0.8, 0)), curl=15)
    return pose


def ball_pyramid(phase):
    pose = Pose()
    sway = 0.02 * math.sin(2 * math.pi * phase)
    pose.props['prop_stability_ball'] = (Vector((0, 0.02, 0.3)), NOTHING_HELD)
    lean = 128
    apply_spine(pose, (0, 0.12 + sway, 0.76 + sway), rot_x(lean - 25), rot_x(lean - 8), rot_x(lean), rot_x(lean - 18), rot_x(lean - 18))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.14, 0.66, ANKLE_Z + 0.05), rot_x(35), Vector((sign * 0.1, -1, 0)))
    trunk = rot_x(lean)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, (sign * 0.22, -0.56, 0.07), Vector((sign * 0.3, 0.6, 0.7)), Vector((0, 0, -1)),
                  hand_dir=Vector((sign * 0.15, -1, 0)), curl=0)
    return pose


def on_bench_back(tilt_key):
    return lambda pose, _t=0: lie_down(pose, tilt_key)


def seated(lean=0):
    return stool_seat('prop_stool', lean, lean)


def dip_and_drive(pose, t=0, catch=0.0, split=0.0):
    """Upright, knees dipping to drive the weight up, and with `catch` or `split` dropping under it at the top."""
    hips_z = 0.885 - 0.08 * math.sin(math.pi * min(t * 2.5, 1)) - catch * smoothstep(0.7, 1, t)
    trunk = rot_x(0)
    apply_spine(pose, (0, 0.03, hips_z), trunk, trunk, trunk, trunk, trunk)
    forward = split * smoothstep(0.55, 1, t)
    for side, sign in SIDES:
        y = ANKLE_Y - 0.3 * forward if sign > 0 else ANKLE_Y + 0.42 * forward
        z = ANKLE_Z + (0 if sign > 0 else 0.05 * forward)
        foot = rot_z(sign * 10) if sign > 0 else rot_x(35 * forward) @ rot_z(sign * 10)
        apply_leg(pose, side, (sign * 0.13, y, z), foot, Vector((sign * 0.15, -1, 0)))
    return trunk


def with_catch(catch=0.0, split=0.0):
    return lambda pose, t=0: dip_and_drive(pose, t, catch, split)


def thruster_base(pose, t=0):
    """Deep in a squat with the weight racked (t = 0), standing tall with it overhead (t = 1)."""
    depth = 1 - smoothstep(0, 0.6, t)
    lean = 26 * depth
    trunk = flat_back(pose, (0, 0.03 + 0.18 * depth, 0.885 - 0.33 * depth), lean)
    planted_legs(pose)
    return trunk


def hang_at_side(pose, side, sign, trunk):
    """The arm that is not working hangs straight down, as beside a bench."""
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((sign * 0.03, 0, -WRIST_REACH * 0.97)), Vector((sign * 0.3, 0.8, 0)), Vector((-sign, 0, 0)),
              hand_dir=Vector((0, 0, -1)), curl=25)


def hand_keys(base, keys, pole, prop=None, arms=SIDES, rest=arm_at_side, shift=0.0, curl=FULL_GRIP_CURL):
    """Each hand follows (time, offset from its shoulder, palm) keys over the rep, given for the left and mirrored.

    The hand keeps the distance interpolated between keys, so a sweep swings around the shoulder.
    `shift` starts the right hand this share of a rep later. The shoulder rises as the arm does.
    """
    table = [(time, (*offset, *palm, Vector(offset).length)) for time, offset, palm in keys]

    def clip(phase):
        pose = Pose()
        trunk = base(pose, ease(phase))
        for side, sign in SIDES:
            if (side, sign) not in arms:
                rest(pose, side, sign, trunk)
                continue
            *values, length = through((phase + (shift if side == '_r' else 0)) % 1, table)
            offset = Vector(values[:3]).normalized() * length
            clavicle = scapula(trunk, sign, 22 * max(0.0, offset.z / REACH), 0)
            facing = side_pole(Vector(values[3:]).normalized(), sign)
            fore_dir, reached = apply_arm(pose, side, clavicle, shoulder_of(pose, side, clavicle) + side_pole(offset, sign),
                                          side_pole(Vector(pole), sign), facing, curl=curl)
            if prop:
                held(pose, f'{prop}{side}', fore_dir, reached, facing)
        return pose
    return clip


def bar_keys(base, half, keys, pole, prop='prop_barbell'):
    """A two-handed bar held overhand, following (time, offset from the middle of the shoulders) keys over the rep."""
    def clip(phase):
        pose = Pose()
        trunk = base(pose, ease(phase))
        y, z = through(phase, keys)
        rise = max(0.0, z / REACH)
        clavicles = {side: scapula(trunk, sign, 24 * rise, 0) for side, sign in SIDES}
        center = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
        bar = center + Vector((0, y, z))
        pose.props[prop] = (bar, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, clavicles[side], bar + Vector((sign * half, 0, 0)), side_pole(Vector(pole), sign), Vector((0, -1, 0)), handle=ACROSS)
        return pose
    return clip


def lift(keys, half=0.25, prop='prop_bar_loaded', arms=SIDES, rest=hands_on_hips):
    """A whole-body lift: (time, (hips y, hips z, lean, split, hand y, hand z)) keys in the world, over the rep.

    Arms hang long while the hands are low and fold under the weight as it reaches the shoulders.
    A hand that would be out of reach between two keys rides closer, so it never leaves the weight.
    With a kettlebell, the bell hangs from the hand when low and lies behind the wrist when racked.
    """
    def clip(phase):
        pose = Pose()
        hips_y, hips_z, lean, split, hand_y, hand_z = through(phase, keys)
        trunk = flat_back(pose, (0, hips_y, hips_z), lean)
        for side, sign in SIDES:
            y = ANKLE_Y - 0.3 * split if sign > 0 else ANKLE_Y + 0.42 * split
            z = ANKLE_Z + (0 if sign > 0 else 0.05 * split)
            foot = rot_z(sign * 10) if sign > 0 else rot_x(35 * split) @ rot_z(sign * 10)
            apply_leg(pose, side, (sign * 0.13, y, z), foot, Vector((sign * 0.2, -1, 0)))
        two_handed = prop.startswith('prop_bar')
        center = None
        for side, sign in SIDES:
            if (side, sign) not in arms:
                rest(pose, side, sign, trunk)
                continue
            racked = smoothstep(0.3, 0.72, hand_z - (hips_z - 0.885) - 0.75)
            overhead = smoothstep(1.5, 1.85, hand_z - (hips_z - 0.885))
            clavicle = scapula(trunk, sign, 24 * overhead, 0)
            shoulder = shoulder_of(pose, side, clavicle)
            hand = Vector((sign * half, hand_y, hand_z))
            across = hand.x - shoulder.x
            flat = Vector((0, hand.y - shoulder.y, hand.z - shoulder.z))
            longest = math.sqrt((REACH * 0.995) ** 2 - across ** 2)
            if flat.length > longest:
                flat = flat.normalized() * longest
                hand = Vector((hand.x, shoulder.y + flat.y, shoulder.z + flat.z))
            pole = Vector((sign * 0.15, 0.9, 0)).lerp(Vector((sign * 0.4, -0.25, -1)), racked).lerp(Vector((sign * 0.85, -0.1, -1)), overhead)
            if two_handed:
                # Back of the hand forward when hanging; over the top of the bar into the rack.
                turn = math.pi * racked
                palm = Vector((0, math.cos(turn), -math.sin(turn)))
                if center is None:
                    center = Vector((0, hand.y, hand.z))
                    pose.props[prop] = (center, NOTHING_HELD)
                apply_arm(pose, side, clavicle, center + Vector((sign * half, 0, 0)), pole, palm, handle=ACROSS)
            else:
                palm = Vector((-sign, 0, 0)).lerp(Vector((-sign * 0.3, -1, 0)), racked).normalized()
                fore_dir, reached = apply_arm(pose, side, clavicle, hand, pole, palm)
                bell = fore_dir.normalized().lerp((-fore_dir.normalized() * 0.5 - palm * 0.85).normalized(), racked).normalized()
                x = fore_dir.cross(palm).normalized()
                x = (x - bell * x.dot(bell)).normalized()
                pose.props[f'{prop}{side}'] = (reached.copy(), Matrix((x, bell, x.cross(bell))).transposed().to_quaternion())
        return pose
    return clip


def band_pull_apart(phase):
    """Straight arms sweep from in front to out wide, stretching the band across the chest."""
    pose = Pose()
    trunk = stand(pose)
    t = ease(phase)
    drawn = lerp(-4, 16, t)
    hands = []
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 0, drawn)
        shoulder = shoulder_of(pose, side, clavicle)
        # At the chest the hands finish a little ahead of the shoulders, the band across the front of the body.
        offset = Vector((0.14, -1, -0.03)).normalized().lerp(Vector((1, -0.28, -0.03)).normalized(), t).normalized() * arm_span(8, TO_GRIP)
        hand = shoulder + side_pole(offset, sign)
        apply_arm(pose, side, clavicle, hand, Vector((sign * 0.1, 0.5, -0.8)), Vector((0, 0, -1)))
        hands.append(hand)
    pose.props['prop_band'] = ((hands[0] + hands[1]) / 2, NOTHING_HELD)
    pose.prop_stretch['prop_band'] = (hands[0] - hands[1]).length
    return pose


def plate_twist(phase):
    """Car drivers: arms out in front, the plate turned from side to side like a steering wheel."""
    pose = Pose()
    trunk = stand(pose)
    angle = math.radians(38) * math.sin(2 * math.pi * phase)
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2 + Vector((0, -0.57, -0.05))
    pose.props['prop_plate'] = (center, rot_y(math.degrees(angle)))
    for side, sign in SIDES:
        rim = Vector((sign * PLATE_RADIUS * math.cos(angle), 0, -sign * PLATE_RADIUS * math.sin(angle)))
        apply_arm(pose, side, trunk, center + rim, Vector((sign * 0.5, 0.2, -0.8)), Vector((-sign, 0, 0)), curl=40)
    return pose


def arm_circles(phase):
    pose = Pose()
    trunk = stand(pose)
    angle = 2 * math.pi * phase
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 6, 0)
        offset = (Vector((1, 0, 0.03)) + Vector((0, 0.28 * math.cos(angle), 0.28 * math.sin(angle)))).normalized() * arm_span(8, TO_WRIST)
        apply_arm(pose, side, clavicle, shoulder_of(pose, side, clavicle) + side_pole(offset, sign), Vector((sign * 0.1, 0.5, -0.8)), Vector((0, 0, -1)),
                  hand_dir=side_pole(offset.normalized(), sign), curl=15)
    return pose


def elbow_circles(phase):
    """Fingertips stay on the shoulders while the elbows draw circles."""
    pose = Pose()
    trunk = stand(pose)
    angle = 2 * math.pi * phase
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 8 + 6 * math.sin(angle), 8 * math.cos(angle))
        shoulder = shoulder_of(pose, side, clavicle)
        apply_arm(pose, side, clavicle, shoulder + Vector((sign * 0.02, -0.03, 0.09)), Vector((sign, 0.75 * math.cos(angle), 0.75 * math.sin(angle) - 0.1)),
                  Vector((-sign, 0, 0)), hand_dir=Vector((-sign * 0.5, 0.1, -0.5)), curl=30, fade_twist=True)
    return pose


def shoulder_circles(phase):
    pose = Pose()
    trunk = stand(pose)
    angle = 2 * math.pi * phase
    for side, sign in SIDES:
        clavicle = scapula(trunk, sign, 13 + 13 * math.sin(angle), 12 * math.cos(angle))
        shoulder = shoulder_of(pose, side, clavicle)
        apply_arm(pose, side, clavicle, shoulder + Vector((sign * 0.04, -0.02, -WRIST_REACH * 0.97)), Vector((sign * 0.3, 0.9, 0)), Vector((-sign * 0.8, 0.5, 0)),
                  hand_dir=Vector((0, 0, -1)), curl=25)
    return pose


def hold_other_arm(bone, point):
    """A resting hand that holds the other arm at this point on `bone`, for arm-across stretches."""
    def rest(pose, side, sign, trunk):
        apply_arm(pose, side, trunk, pose.point_on(bone, point), Vector((sign, 0.2, -0.5)), Vector((0, 1, 0)), hand_dir=Vector((-sign * 0.5, -0.6, 0.2)), curl=40)
    return rest


def kettlebell_halo(phase):
    """Both hands carry the bell in a circle around the head."""
    pose = Pose()
    trunk = stand(pose)
    angle = 2 * math.pi * phase
    clavicles = {side: scapula(trunk, sign, 14, 0) for side, sign in SIDES}
    center = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
    handle = center + Vector((0.2 * math.sin(angle), -0.2 * math.cos(angle) + 0.02, 0.22))
    # Upside down by the horns: the bell above the hands.
    pose.props['prop_hanging_kettlebell_l'] = (handle, Matrix((ACROSS, UP, ACROSS.cross(UP))).transposed().to_quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, clavicles[side], handle + Vector((sign * 0.05, 0, 0)), Vector((sign, 0.1, -0.5)), Vector((-sign, 0, 0)), curl=60, fade_twist=True)
    return pose


def pirate_ship(phase):
    """Wide stance, the bell swung from hanging at the waist up to head height on each side as the torso turns."""
    pose = Pose()
    swing = math.sin(2 * math.pi * phase)
    turn = rot_z(34 * swing)
    trunk = turn
    apply_spine(pose, (0, 0.03, 0.87), rot_z(12 * swing), rot_z(24 * swing), trunk, trunk, trunk)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.27, ANKLE_Y, ANKLE_Z), rot_z(sign * 18), Vector((sign * 0.5, -1, 0)))
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    handle = center + Vector((-0.55 * swing, -0.2 - 0.26 * math.cos(math.pi * swing / 2), lerp(-0.56, 0.08, swing * swing)))
    pose.props['prop_hanging_kettlebell_l'] = (handle, Matrix((ACROSS, -UP, Vector((0, 1, 0)))).transposed().to_quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, handle + Vector((sign * 0.045, 0, 0)), Vector((sign * 0.6, 0.4, -0.5)), Vector((-sign, 0, 0)), curl=60, fade_twist=True)
    return pose


def handstand_pushup(phase):
    """Upside down with the back to the wall and the heels on it; the head comes down towards the floor between the hands."""
    pose = Pose()
    t = ease(phase)
    pose.props['prop_wall'] = (Vector((0, -0.13, 0)), NOTHING_HELD)
    body = rot_x(180)
    shoulder_z = lerp(0.66, 0.36, t)
    hips_at = Vector((0, 0.03, shoulder_z + 0.5))
    apply_spine(pose, hips_at, body, body, body, body @ rot_x(-16), body @ rot_x(-22))
    for side, sign in SIDES:
        apply_leg(pose, side, hips_at + Vector((sign * 0.08, 0.02, 0.8)), body @ rot_x(-70), Vector((sign * 0.1, 1, 0)))
    for side, sign in SIDES:
        apply_arm(pose, side, body, Vector((sign * 0.27, 0.04, 0.03)), Vector((sign * 0.8, -0.5, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.1, 1, 0)), curl=5)
    return pose


def jammer(arms):
    """A long bar anchored on the floor in front, its end pressed up and forward from the shoulder as the legs drive."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        one_arm = len(arms) == 1
        x = arms[0][1] * 0.2 if one_arm else 0.0
        depth = 1 - smoothstep(0, 0.5, t)
        trunk = flat_back(pose, (0, 0.03 + 0.1 * depth, 0.885 - 0.13 * depth), 18)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.2, ANKLE_Y, ANKLE_Z), rot_z(sign * 14), Vector((sign * 0.35, -1, 0)))
        # The hands hold the end of the bar past its plates, so they travel on a circle around the fixed anchor.
        anchor = Vector((x, -1.38, 0.02))
        z = lerp(1.2, 1.42, t)
        grip = Vector((x, anchor.y + math.sqrt(JAMMER_GRIP ** 2 - (z - anchor.z) ** 2), z))
        direction = (grip - anchor).normalized()
        pose.props['prop_long_bar'] = (anchor, Matrix((ACROSS, direction, ACROSS.cross(direction))).transposed().to_quaternion())
        for side, sign in SIDES:
            if (side, sign) not in arms:
                hands_on_hips(pose, side, sign, trunk)
                continue
            hand = grip if one_arm else grip + Vector((sign * 0.06, 0, -0.03))
            apply_arm(pose, side, trunk, hand, Vector((sign * 0.5, 0.3, -0.8)), Vector((-sign, 0, 0)), handle=direction, curl=60)
        return pose
    return clip


def march_overhead(phase):
    """Arms straight up, the feet stepping in place; the sled and the walk backwards are not shown."""
    pose = Pose()
    trunk = stand(pose, lean=4)
    for side, sign in SIDES:
        step = max(0.0, math.sin(2 * math.pi * (phase + (0 if sign > 0 else 0.5))))
        apply_leg(pose, side, (sign * 0.13, ANKLE_Y + 0.04 * step, ANKLE_Z + 0.12 * step), rot_x(20 * step) @ rot_z(sign * 8), Vector((sign * 0.1, -1, 0)))
        clavicle = scapula(trunk, sign, 22, 0)
        offset = arm_out((0.02, -0.03, 1), 6)()
        apply_arm(pose, side, clavicle, shoulder_of(pose, side, clavicle) + side_pole(offset, sign), Vector((sign * 0.7, 0, -0.6)), Vector((0, -1, 0)), curl=60)
    return pose


def turkish_get_up(phase):
    """From lying with the bell pressed up, through sitting and a lunge, to standing; then back down. The bell stays locked out."""
    pose = Pose()
    t = ease(phase)
    # Hips (y, z), lean, right hand on the floor, left ankle (y, z), right ankle (y, z), right knee down.
    hips_y, hips_z, lean, braced, left_y, left_z, right_y, right_z, knee_down = through(t, (
        (0.0, (0.28, 0.11, -90, 0.0, -0.1, ANKLE_Z, -0.5, 0.07, 0.0)),
        (0.22, (0.28, 0.12, -36, 1.0, -0.1, ANKLE_Z, -0.5, 0.07, 0.0)),
        (0.42, (0.28, 0.44, -22, 1.0, -0.1, ANKLE_Z, -0.42, 0.07, 0.0)),
        (0.66, (0.22, 0.56, 0, 0.0, -0.22, ANKLE_Z, 0.62, 0.1, 1.0)),
        (1.0, (-0.1, 0.885, 0, 0.0, -0.08, ANKLE_Z, -0.1, ANKLE_Z, 0.0)),
    ))
    lying = -min(lean, 0) / 90
    trunk = flat_back(pose, (0, hips_y, hips_z), lean)
    apply_leg(pose, '_l', (0.14, left_y, left_z), rot_z(8), Vector((0.2, -0.8, 0.5)))
    foot = rot_x(150 * knee_down) @ rot_z(-6)
    apply_leg(pose, '_r', (-0.14, right_y, right_z), foot, Vector((-0.1, -0.7 - 0.3 * knee_down, 0.9 - 1.1 * knee_down)))
    clavicle = scapula(trunk, 1, 20, 0)
    shoulder = shoulder_of(pose, '_l', clavicle)
    facing = Vector((0, lerp(-1, 0, lying), lerp(0, 1, lying))).normalized() if lying < 1 else Vector((0, 0, 1))
    fore_dir, reached = apply_arm(pose, '_l', clavicle, shoulder + Vector((0.02, 0, arm_span(5, TO_GRIP))), Vector((0.8, 0, -0.3)), facing)
    held(pose, 'prop_kettlebell_l', fore_dir, reached, facing)
    right_shoulder = shoulder_of(pose, '_r', trunk)
    # The free arm hangs when upright and lies along the body when flat on the floor.
    hanging = right_shoulder + Vector((-0.08, 0, -WRIST_REACH * 0.96)).lerp(Vector((-0.1, -WRIST_REACH * 0.94, -0.05)), lying)
    on_floor = Vector((-0.42, hips_y + 0.28, 0.05))
    apply_arm(pose, '_r', trunk, hanging.lerp(on_floor, braced), Vector((-0.8, 0.5, 0)), Vector((1, 0, 0)).lerp(Vector((0, 0, -1)), braced).normalized(),
              hand_dir=Vector((0, 0, -1)).lerp(Vector((0, -1, 0)), lying).lerp(Vector((-0.2, 0.9, 0)), braced).normalized(), curl=lerp(25, 5, braced))
    return pose


def span(pose, prop, start, end):
    """Stretches a one-metre prop to run from `start` to `end`."""
    along = end - start
    pose.props[prop] = ((start + end) / 2, ACROSS.rotation_difference(along.normalized()))
    pose.prop_stretch[prop] = along.length


def cabled(pose_at, left=None, right=None, bar=None, tower=None, remove=(), swap=None):
    """Adds cables to a clip: from each pulley to the hand it serves, or with `bar` (its prop, its pulley) to that prop's middle.

    A column rises from the floor under each pulley; with `tower` (x, y), one column stands there and a beam
    reaches over to the pulley, as on a pulldown machine. `remove` and `swap` take away or replace what the clip holds.
    """
    def clip(phase):
        pose = pose_at(phase)
        for prop in remove:
            pose.props.pop(prop, None)
        if swap:
            pose.props[swap[1]] = pose.props.pop(swap[0])
        lines = []
        if bar:
            lines.append((Vector(bar[1]), pose.props[bar[0]][0].copy()))
        if left:
            lines.append((Vector(left), pose.grips['_l']))
        if right:
            lines.append((Vector(right), pose.grips['_r']))
        pulleys = []
        for suffix, (pulley, end) in zip(('l', 'r'), lines):
            span(pose, f'prop_cable_{suffix}', pulley, end)
            if pulley not in pulleys:
                pulleys.append(pulley)
        for suffix, pulley in zip(('l', 'r'), pulleys):
            pose.props[f'prop_pulley_{suffix}'] = (pulley.copy(), NOTHING_HELD)
            foot = Vector((*(tower or pulley.xy), 0))
            top = Vector((foot.x, foot.y, pulley.z + 0.08))
            span(pose, f'prop_cable_column_{suffix}', foot, top)
            if tower:
                span(pose, 'prop_cable_beam', top, pulley + Vector((0, 0, 0.08)))
        return pose
    return clip


def key(t, hips, lean, left, right=None, curl=0, shift=0.0):
    """A key for `moves`: hips (y, z) or (x, y, z), and each ankle (x out from the middle, y, z, toe-down tilt)."""
    hips = hips if len(hips) == 3 else (0, *hips)
    return (t, (shift, *hips, lean, curl, *left, *(right or left)))


def stood(t, y=0.0, floor=0.0, dip=0.0, lean=None, air=0.0, left=None, right=None, shift=0.0, width=0.13, tilt=0):
    """A key for `moves` on two feet: `dip` lowers the hips, which go back and tip forward with it, as in a squat."""
    foot = (width, y + ANKLE_Y, floor + air + ANKLE_Z, tilt)
    hips = (y + 0.03 + 0.55 * dip, floor + air + 0.885 - dip)
    return key(t, hips, 100 * dip if lean is None else lean, left or foot, right or left or foot, shift=shift)


def moves(keys, arms=hang_at_side, right_arm=None, hold=None, pole=(0.12, -1, 0), right_pole=None, toe_out=8, roll=0, extra=None):
    """The whole body follows `keys` over the rep. `arms` place each arm, or `hold` both; `extra` adds props."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        shift, hips_x, hips_y, hips_z, lean, curl, *ankles = through(phase, keys)
        turn = rot_y(roll)
        trunk = turn @ rot_x(lean)
        settled = smoothstep(30, 90, abs(lean))
        neck = lean * (0.55 + (0.4 if lean < 0 else 0.2) * settled)
        head = lean * lerp(0.3, 0.95 if lean < 0 else 0.6, settled)
        apply_spine(pose, (shift + hips_x, hips_y, hips_z), turn @ rot_x(lean * 0.92 - curl), turn @ rot_x(lean * 0.97 - curl * 0.3), turn @ rot_x(lean + curl * 0.5),
                    turn @ rot_x(neck), turn @ rot_x(head))
        for (side, sign), ankle, knee in zip(SIDES, (ankles[:4], ankles[4:]), (pole, right_pole or pole)):
            apply_leg(pose, side, (shift + sign * ankle[0], ankle[1], ankle[2]), turn @ rot_x(ankle[3]) @ rot_z(sign * toe_out), side_pole(Vector(knee), sign))
        if hold:
            hold(pose, trunk)
        else:
            for side, sign in SIDES:
                (arms if sign > 0 or not right_arm else right_arm)(pose, side, sign, trunk)
        if extra:
            extra(pose, trunk)
        return pose
    return clip


def held_in(base, hold):
    """A `base` that goes on (t = 0 to 1 and back) with the hands placed by `hold`."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        hold(pose, base(pose, ease(phase)))
        return pose
    return clip


def both_arms(arm):
    def hold(pose, trunk):
        for side, sign in SIDES:
            arm(pose, side, sign, trunk)
    return hold


def with_props(pose_at, **props):
    """The clip with props standing still: name -> position, or (position, rotation)."""
    def clip(phase):
        pose = pose_at(phase)
        for prop, place in props.items():
            pose.props[prop] = (Vector(place[0]), place[1]) if isinstance(place[1], Quaternion) else (Vector(place), NOTHING_HELD)
        return pose
    return clip


def on_back(prop='prop_barbell', half=0.3):
    def hold(pose, trunk):
        bar = pose.point_on('spine2', (0, 0.105, 1.445))
        # The bar turns and tilts with the shoulders it rests on.
        pose.props[prop] = (bar, trunk)
        across = trunk @ ACROSS
        for side, sign in SIDES:
            apply_arm(pose, side, scapula(trunk, sign, 6, 0), bar + across * (sign * half), trunk @ Vector((sign * 0.5, 0.35, -1)),
                      trunk @ Vector((0, -1, 0.15)), handle=across)
    return hold


def on_front(prop='prop_barbell', half=0.22, arms_out=False):
    """Racked on the front of the shoulders, gripped, or balanced there with the arms straight out."""
    def hold(pose, trunk):
        bar = pose.point_on('spine2', (0, -0.15, 1.445))
        pose.props[prop] = (bar, NOTHING_HELD)
        across = trunk @ ACROSS
        for side, sign in SIDES:
            clavicle = scapula(trunk, sign, 6, -6)
            if arms_out:
                wrist = shoulder_of(pose, side, clavicle) + Vector((-sign * 0.03, -WRIST_REACH * 0.98, 0.03))
                apply_arm(pose, side, clavicle, wrist, Vector((sign, 0.2, -0.4)), Vector((0, 0, -1)), hand_dir=Vector((0, -1, 0)), curl=8)
            else:
                apply_arm(pose, side, clavicle, bar + across * (sign * half), trunk @ Vector((sign * 0.35, -1, -0.5)), trunk @ Vector((0, -1, 0.25)), handle=across)
    return hold


def overhead_bar(prop='prop_barbell', half=0.42):
    def hold(pose, trunk):
        clavicles = {side: scapula(trunk, sign, 24, 0) for side, sign in SIDES}
        center = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
        reach = math.sqrt(arm_span(5, TO_GRIP) ** 2 - (half - abs(shoulder_of(pose, '_l', clavicles['_l']).x)) ** 2)
        ahead = max(-reach * 0.5, min(reach * 0.5, 0.03 - center.y))
        bar = center + Vector((0, ahead, math.sqrt(reach ** 2 - ahead ** 2)))
        pose.props[prop] = (bar, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, clavicles[side], bar + Vector((sign * half, 0, 0)), Vector((sign * 0.85, 0.05, -1)), Vector((0, -1, 0)), handle=ACROSS)
    return hold


def goblet(pose, trunk):
    bell = pose.point_on('spine2', (0, -0.25, 1.27))
    down = Vector((0, 0, -1))
    pose.props['prop_hanging_kettlebell_l'] = (bell, Matrix((ACROSS, down, ACROSS.cross(down))).transposed().to_quaternion())
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bell + Vector((sign * 0.05, 0, 0)), Vector((sign * 0.6, -0.1, -1)), Vector((-sign, 0, 0)), curl=60)


def plate_on_chest(pose, side, sign, trunk):
    plate = pose.point_on('spine2', (0, -0.2, 1.27))
    pose.props['prop_plate'] = (plate, trunk)
    apply_arm(pose, side, trunk, plate + trunk @ Vector((sign * 0.03, -0.02, 0)), trunk @ Vector((sign * 0.7, 0, -0.7)), trunk @ Vector((-sign, 0.5, 0)), curl=30)


def dumbbell_in_front(pose, trunk):
    """One dumbbell held on end by its upper plate, hanging between the legs."""
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    handle = center + Vector((0, -0.08, -arm_span(6, TO_GRIP)))
    pose.props['prop_dumbbell_l'] = (handle + Vector((0, 0, -0.12)), rot_y(90))
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, handle + Vector((sign * 0.05, 0, 0)), Vector((sign * 0.25, 0.9, 0)), Vector((-sign, 0, 0)), curl=50)


def dumbbells_down(prop='prop_dumbbell', elbow=8):
    def arm(pose, side, sign, trunk):
        palm = Vector((-sign, 0, 0))
        shoulder = shoulder_of(pose, side, trunk)
        fore_dir, reached = apply_arm(pose, side, trunk, shoulder + Vector((sign * 0.05, 0.02, -arm_span(elbow, TO_GRIP))), Vector((sign * 0.25, 0.9, 0)), palm)
        if prop:
            held(pose, f'{prop}{side}', fore_dir, reached, palm)
    return arm


def bells_at_shoulders(pose, side, sign, trunk):
    palm = Vector((-sign * 0.3, -1, 0)).normalized()
    fore_dir, reached = apply_arm(pose, side, trunk, shoulder_of(pose, side, trunk) + trunk @ Vector((sign * 0.02, -0.1, 0.06)), trunk @ Vector((sign * 0.3, -0.7, -0.6)), palm)
    held(pose, f'prop_kettlebell{side}', fore_dir, reached, palm)


def bell_pressed_up(pose, side, sign, trunk):
    clavicle = scapula(trunk, sign, 22, 0)
    palm = Vector((0, -1, 0))
    fore_dir, reached = apply_arm(pose, side, clavicle, shoulder_of(pose, side, clavicle) + Vector((-sign * 0.02, 0.02, arm_span(5, TO_GRIP))), Vector((sign * 0.8, 0, -0.5)), palm)
    held(pose, f'prop_kettlebell{side}', fore_dir, reached, palm)


def hanging_bar(half=0.24, prop='prop_bar_loaded', elbow=4, ahead=0.0, lowest=BAR_ON_FLOOR):
    """Straight arms hang to a bar; it stops at `lowest` and the elbows give."""
    def hold(pose, trunk):
        center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
        bar = center + Vector((0, ahead, -arm_out((0, 0, 1), elbow)(half).length))
        bar.z = max(bar.z, lowest)
        pose.props[prop] = (bar, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, bar + Vector((sign * half, 0, 0)), Vector((sign * 0.15, 0.9, 0)), Vector((0, 1, 0)), handle=ACROSS)
    return hold


def trap_bar(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    bar = center + Vector((0, 0, -arm_span(4, TO_GRIP)))
    bar.z = max(bar.z, BAR_ON_FLOOR)
    pose.props['prop_trap_bar'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bar + Vector((sign * TRAP_HANDLE_X, 0, 0)), Vector((sign * 0.2, 0.9, 0)), Vector((-sign, 0, 0)))


def bar_behind_legs(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    bar = center + Vector((0, 0.16, -arm_out((0, 0, 1), 5)(0.22).length * 0.96))
    pose.props['prop_barbell'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bar + Vector((sign * 0.22, 0, 0)), Vector((sign * 0.2, 0.7, 0.3)), Vector((0, 1, 0)), handle=ACROSS)


def zercher(pose, trunk):
    """The bar in the crooks of the elbows, hands closed in front of the chest."""
    for side, sign in SIDES:
        wrist = pose.point_on('spine2', (sign * 0.05, -0.3, 1.44))
        apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign * 0.25, -0.5, -1)), trunk @ Vector((-sign, 0, 0.3)), hand_dir=trunk @ Vector((-sign * 0.3, -0.3, 0.9)), curl=55)
    elbow = (pose.head['forearm_l'] + pose.head['forearm_r']) / 2
    pose.props['prop_barbell'] = (elbow + Vector((0, 0, 0.03)), NOTHING_HELD)


def swinging(keys, pole=(0.25, 0.8, -0.3), curl=25, later=0.0, palm_out=False):
    """Each arm follows (time, offset from its shoulder) keys, given for the left; `later` delays the right."""
    def arm(pose, side, sign, trunk):
        x, y, z = through((pose.phase + (later if sign < 0 else 0)) % 1, keys)
        clavicle = scapula(trunk, sign, 22 * max(0.0, z / REACH), 0)
        facing = Vector((sign * z, 0, -x)) if palm_out else Vector((-sign, 0, 0))
        apply_arm(pose, side, clavicle, shoulder_of(pose, side, clavicle) + Vector((sign * x, y, z)), side_pole(Vector(pole), sign), facing.normalized(), curl=curl, fade_twist=palm_out)
    return arm


def pumping(front=(0.03, -0.24, -0.26), back=(0.09, 0.1, -0.38), curl=55):
    """Bent arms drive opposite the legs, as in running."""
    def arm(pose, side, sign, trunk):
        share = 0.5 + 0.5 * math.cos(2 * math.pi * (pose.phase + (0 if sign > 0 else 0.5)))
        offset = Vector(front).lerp(Vector(back), share)
        apply_arm(pose, side, trunk, shoulder_of(pose, side, trunk) + side_pole(offset, sign), Vector((sign * 0.2, 0.6, -1)), Vector((-sign, 0, 0)), curl=curl, fade_twist=True)
    return arm


def grab(bone, point, pole=(1, 0, 0.2), palm=(0, 0, -1), curl=45, other=False):
    """The hand holds a point of a leg's bone, given as on the left leg; `other` takes the opposite leg."""
    def arm(pose, side, sign, trunk):
        leg_sign = -sign if other else sign
        at = pose.point_on(f'{bone}{"_l" if leg_sign > 0 else "_r"}', (leg_sign * point[0], point[1], point[2]))
        apply_arm(pose, side, trunk, at, side_pole(Vector(pole), sign), side_pole(Vector(palm), sign), curl=curl)
    return arm


def wrist_at(point, pole=(1, 0.2, 0.3), hand_dir=(0.1, -1, 0), palm=(0, 0, -1), curl=5):
    """The wrist stays at this place, given for the left and mirrored."""
    def arm(pose, side, sign, trunk):
        apply_arm(pose, side, trunk, side_pole(Vector(point), sign), side_pole(Vector(pole), sign), side_pole(Vector(palm), sign), hand_dir=side_pole(Vector(hand_dir), sign), curl=curl)
    return arm


def belt_hands(reach=(0.0, -0.28, 0.3)):
    """The hands hold a belt out from the shoulders, closed in towards the middle."""
    def arm(pose, side, sign, trunk):
        shoulder = shoulder_of(pose, side, trunk)
        apply_arm(pose, side, trunk, shoulder + Vector((-sign * 0.1, reach[1], reach[2])), Vector((sign * 0.7, 0.4, -0.6)), Vector((-sign, 0, 0)), curl=70)
    return arm


def belts_to_foot(side='_l'):
    """A belt from both hands to the ball of one foot."""
    def extra(pose, trunk):
        foot = pose.point_on(f'foot{side}', (0.072 if side == '_l' else -0.072, -0.08, 0.03))
        span(pose, 'prop_band', pose.grips['_l'], foot)
        span(pose, 'prop_band_r', pose.grips['_r'], foot)
    return extra


def belt_to_foot(side='_l', hand='_l'):
    """A belt or band from the hand to the foot."""
    def extra(pose, trunk):
        span(pose, 'prop_band', pose.grips[hand], pose.point_on(f'foot{side}', (0.072 if side == '_l' else -0.072, -0.06, 0.03)))
    return extra


def bands_to_feet(pose, trunk):
    span(pose, 'prop_band', pose.grips['_l'], pose.point_on('foot_l', (0.072, -0.05, 0.02)))
    span(pose, 'prop_band_r', pose.grips['_r'], pose.point_on('foot_r', (-0.072, -0.05, 0.02)))


def squatting(depth=0.37, lean=36, back=0.2, width=ANKLE_X, toe_out=14, knee_out=0.25, top=0.0):
    def base(pose, t=0):
        trunk = flat_back(pose, (0, 0.03 + back * t, 0.885 - top - depth * t), lean * t)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * width, ANKLE_Y, ANKLE_Z), rot_z(sign * toe_out), Vector((sign * knee_out, -1, 0)))
        return trunk
    return base


def lunge_keys(step=-0.6, floor=0.0, back_step=False):
    """Two reps, one each side: `step` is where the moving foot lands. Forward, the back foot stays; with `back_step`, the front one does."""
    keys = []
    hips_y = 0.03 + step * 0.48
    for start, leading in ((0.0, True), (0.5, False)):
        planted = (0.12, ANKLE_Y, floor + ANKLE_Z, 0)
        rise = 0.09 if not back_step else 0.1
        lifted = (0.12, ANKLE_Y + step * 0.5, floor + ANKLE_Z + rise, -8 if not back_step else 25)
        landed = (0.12, ANKLE_Y + step, (floor if not back_step else 0.0) + ANKLE_Z + (0.05 if back_step else 0), 0 if not back_step else 40)
        # When stepping forward, the foot left behind rolls onto its toes.
        planted_low = (0.12, ANKLE_Y, floor + ANKLE_Z + (0.05 if not back_step else 0), 40 if not back_step else 0)
        low = (hips_y, floor + 0.53 if not back_step else 0.53 + floor * 0.6)
        mid = (0.03 + step * 0.2, floor + 0.84)
        lean = 8
        pair = lambda moving, still: (moving, still) if leading else (still, moving)
        keys += [
            stood(start, floor=floor, width=0.12, lean=0),
            key(start + 0.12, mid, 2, *pair(lifted, planted)),
            key(start + 0.25, low, lean, *pair(landed, planted_low)),
            key(start + 0.38, mid, 2, *pair(lifted, planted)),
        ]
    keys.append(stood(1.0, floor=floor, width=0.12, lean=0))
    return tuple(keys)


def split_on_bench(hold=None, arms=hang_at_side, extra=None):
    """Front foot planted, the rear foot behind on a bench (the bench itself is added by the clip)."""
    front = (0.12, -0.3, ANKLE_Z, 0)
    rear = (0.08, 0.5, 0.52, 112)
    return moves((key(0.0, (0.08, 0.86), 6, front, rear), key(0.5, (0.14, 0.54), 12, front, rear), key(1.0, (0.08, 0.86), 6, front, rear)),
                 arms=arms, hold=hold, right_pole=(0.05, -1, -0.5), extra=extra)


ARM_DOWN = (0.06, -0.02, -0.6)
ARM_BACK = (0.07, 0.36, -0.48)
ARM_FRONT = (0.06, -0.6, -0.08)
ARM_UP = (0.08, -0.08, 0.62)
ARM_SIDE = (0.62, -0.02, 0.05)
ARM_SIDE_UP = (0.42, -0.02, 0.48)
JUMP_ARMS = swinging(((0.0, ARM_DOWN), (0.2, ARM_BACK), (0.36, ARM_FRONT), (0.5, ARM_UP), (0.66, ARM_FRONT), (0.8, ARM_DOWN), (1.0, ARM_DOWN)))


def jump_up(air_left=None, air_right=None, height=0.3, dip=0.17, **options):
    """Dip, drive, up with the feet where `air_*` say (as fixed points), land soft, stand."""
    return moves((
        stood(0.0),
        stood(0.2, dip=dip),
        stood(0.34, air=0.05, tilt=30, lean=0),
        stood(0.5, air=height, left=air_left, right=air_right or air_left, tilt=25, lean=2),
        stood(0.66, air=0.05, tilt=20, lean=0),
        stood(0.8, dip=dip),
        stood(1.0),
    ), **{'arms': JUMP_ARMS, **options})


def hop_chain(points, dip=0.14, height=0.3, axis='y', width=0.13, one_leg=False, steep=False):
    """Hops from point to point along y or x, dipping on each landing. With `one_leg`, on the left, the right foot held up behind. With `steep`, each hop rises before it travels, to clear something tall."""
    def stance(t, at, air=0.0, dip=0.0):
        y = at if axis == 'y' else 0.0
        shift = at if axis == 'x' else 0.0
        lean = 2 if air else None
        if one_leg:
            left = (0.1, y + ANKLE_Y, ANKLE_Z + air, 20 if air else 0)
            right = (0.1, y + ANKLE_Y + 0.2, 0.42 + air, 75)
            return stood(t, y=y, air=air, dip=dip, lean=lean, shift=shift, left=left, right=right)
        return stood(t, y=y, air=air, dip=dip, lean=lean, shift=shift, width=width, tilt=20 if air else 0)
    keys = []
    count = len(points) - 1
    for i, (start, end) in enumerate(zip(points, points[1:])):
        keys.append(stance(i / count, start, dip=dip))
        if steep:
            keys.append(stance((i + 0.2) / count, lerp(start, end, 0.12), air=height * 0.75))
        keys.append(stance((i + 0.5) / count, (start + end) / 2, air=height))
        if steep:
            keys.append(stance((i + 0.8) / count, lerp(start, end, 0.88), air=height * 0.75))
    keys.append(stance(1.0, points[-1], dip=dip))
    return tuple(keys)


def foot_stride(p, stride, lift, duty, kick, width, center=ANKLE_Y):
    """Where a foot is at share `p` of its cycle: on the floor from front to back, then swung through."""
    push_tilt = 32
    toe_off = ANKLE_Z + 0.1 * math.sin(math.radians(push_tilt))
    if p < duty:
        s = p / duty
        tilt = lerp(-10, push_tilt, s ** 2.5)
        return (width, center - stride + 2 * stride * s, ANKLE_Z + 0.1 * max(0.0, math.sin(math.radians(tilt))), tilt)
    s = (p - duty) / (1 - duty)
    swing = math.sin(math.pi * s)
    return (width, lerp(center + stride, center - stride, smoothstep(0, 1, s)) + kick * swing, lerp(toe_off, ANKLE_Z, s) + lift * swing, lerp(push_tilt, -10, s) + 70 * (kick > 0) * swing)


def gait(stride=0.2, lift=0.07, duty=0.62, kick=0.0, lean=3, height=0.865, bounce=0.012, arms=None, hold=None, backward=False, width=0.11, floor=0.0, extra=None, y=0.03):
    """Walking or running on the spot: each foot takes its turn through a full cycle over the rep."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        bob = bounce * math.cos(4 * math.pi * phase)
        trunk = flat_back(pose, (0, y + lean * 0.003, floor + height + bob), lean)
        for side, sign in SIDES:
            p = (phase + (0 if sign > 0 else 0.5)) % 1
            x, foot_y, z, tilt = foot_stride(1 - p if backward else p, stride, lift, duty, kick, width)
            apply_leg(pose, side, (sign * x, foot_y + y - 0.03, floor + z), rot_x(tilt) @ rot_z(sign * 8), Vector((sign * 0.1, -1, 0.05)))
        if hold:
            hold(pose, trunk)
        else:
            for side, sign in SIDES:
                (arms or pumping())(pose, side, sign, trunk)
        if extra:
            extra(pose, trunk)
        return pose
    return clip


def circle(center, radius, phase, squash=1.0):
    return center[0] + radius * math.cos(2 * math.pi * phase), center[1] + radius * squash * math.sin(2 * math.pi * phase)


def pedalling(hips, lean, crank, radius, arms, prop=None, pole=(0.06, -1, 0.1)):
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        if prop:
            pose.props[prop] = (ORIGIN, NOTHING_HELD)
        trunk = flat_back(pose, hips, lean)
        for side, sign in SIDES:
            y, z = circle(crank, radius, phase + (0 if sign > 0 else 0.5))
            tilt = 10 + 20 * math.sin(2 * math.pi * (phase + (0 if sign > 0 else 0.5)))
            apply_leg(pose, side, (sign * 0.13, y, z), rot_x(tilt), side_pole(Vector(pole), sign))
        for side, sign in SIDES:
            arms(pose, side, sign, trunk)
        return pose
    return clip


def elliptical(phase):
    pose = Pose()
    pose.phase = phase
    trunk = flat_back(pose, (0, 0.03, 1.04), 3)
    for side, sign in SIDES:
        p = phase + (0 if sign > 0 else 0.5)
        y, z = circle((0.0, 0.26), 0.2, p, squash=0.35)
        apply_leg(pose, side, (sign * 0.13, y, z), rot_x(12 * math.sin(2 * math.pi * p)), Vector((sign * 0.1, -1, 0.05)))
        share = 0.5 + 0.5 * math.cos(2 * math.pi * p)
        hand = shoulder_of(pose, side, trunk) + Vector((sign * 0.02, lerp(-0.2, -0.46, share), -0.28))
        apply_arm(pose, side, trunk, hand, Vector((sign * 0.3, 0.9, -0.2)), Vector((-sign, 0, 0)), handle=UP)
    return pose


def rowing(phase):
    """The seat runs along the rail: legs drive first, then the back swings and the arms pull."""
    pose = Pose()
    y, lean, offset_y, offset_z = through(ease(phase), (
        (0.0, (-0.22, 22, -0.62, -0.1)),
        (0.55, (0.2, 2, -0.6, -0.25)),
        (1.0, (0.22, -16, -0.2, -0.3)),
    ))
    pose.props['prop_rower'] = (ORIGIN, NOTHING_HELD)
    pose.props['prop_seat_pad'] = (Vector((0, y, 0.285)), NOTHING_HELD)
    trunk = flat_back(pose, (0, y, 0.43), lean)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.12, -0.72, 0.31), rot_x(-62), Vector((sign * 0.15, -0.2, 1)))
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    handle = center + Vector((0, offset_y, offset_z))
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, handle + Vector((sign * 0.1, 0, 0)), Vector((sign * 0.45, 0.85, -0.2)), Vector((0, 0, -1)), handle=ACROSS)
    span(pose, 'prop_cable_l', Vector((0, -0.95, 0.42)), handle)
    return pose


def leg_press(half=0.16, pressed=0.46, calf=False):
    """Reclined on the seat, the plate running up and away along the rail as the legs straighten (or, with `calf`, only as the ankles do)."""
    along = Vector((0, -0.71, 0.71))
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        body = lie_down(pose, INCLINE)
        hips_at = pose.head['hips'].copy()
        hip = hips_at + body @ (REST['thigh_l'][0] - REST['hips'][0])
        ankle_at = hip.y * Vector((0, 1, 0)) + hip.z * UP + along * (0.735 if calf else lerp(0.3 + 0.03, 0.3 + pressed, t))
        tilt = (lerp(-155, -110, t) if calf else -130)
        foot_rot = rot_x(tilt)
        sole = foot_rot @ Vector((0, -0.075, -0.04))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * half, ankle_at.y, ankle_at.z), foot_rot @ rot_z(sign * 8), Vector((sign * 0.35, 0.1, 1)))
        plate = ankle_at + sole + along * 0.03 if not calf else ankle_at + foot_rot @ Vector((0, -0.09, -0.06)) + along * 0.02
        pose.props['prop_foot_plate'] = (plate, rot_x(-45))
        span(pose, 'prop_cable_beam', Vector((0, plate.y + 0.6, plate.z - 0.6)), plate + along * 0.5)
        for side, sign in SIDES:
            apply_arm(pose, side, body, hips_at + Vector((sign * 0.3, -0.1, -0.05)), Vector((sign, 0.2, 0.3)), Vector((-sign, 0, 0)), handle=Vector((0, 1, 0)), curl=60)
        return pose
    return clip


def hack_squat(half=0.15, recline=-34):
    """The back rides up and down a slide on its pad; feet stay on the plate."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        slope = Vector((0, 0.42, 0.91))
        ankle = Vector((0, -0.2, 0.17))
        hips_at = ankle + slope * lerp(0.76, 0.3, t) + Vector((0, 0.1, 0.04))
        trunk = rot_x(recline)
        apply_spine(pose, hips_at, trunk, trunk, trunk, rot_x(recline * 0.5), rot_x(recline * 0.3))
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * half, ankle.y, ankle.z), rot_x(-24) @ rot_z(sign * 10), Vector((sign * 0.25, -1, 0.1)))
        pose.props['prop_foot_plate'] = (ankle + Vector((0, -0.05, -0.1)), rot_x(-90 - 24))
        pose.props['prop_back_pad'] = (hips_at + trunk @ Vector((0, 0.13, -0.08)), trunk)
        span(pose, 'prop_cable_beam', Vector((0, 0.1, 0.1)), Vector((0, 0.1, 0.1)) + slope * 1.9)
        for side, sign in SIDES:
            shoulder = shoulder_of(pose, side, trunk)
            apply_arm(pose, side, trunk, shoulder + trunk @ Vector((sign * 0.1, -0.17, 0.12)), trunk @ Vector((sign * 0.8, 0.1, -0.7)), trunk @ Vector((0, -1, 0)), handle=trunk @ Vector((1, 0, 0)), curl=60)
        return pose
    return clip


def shin_angle(knee, angle):
    """Where the ankle is when the shin hangs from the knee, turned this far (degrees) from straight down towards -y."""
    shin = bone_length('shin_l')
    a = math.radians(angle)
    return knee[0] - shin * math.sin(a), knee[1] - shin * math.cos(a)


def leg_extension(arms=SIDES):
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = ease(phase)
        pose.props['prop_seat'] = (Vector((0, 0.02, 0)), NOTHING_HELD)
        trunk = rot_x(-6)
        apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
        knee = (-0.41, 0.54)
        worked = shin_angle(knee, lerp(8, 84, t))
        still = shin_angle(knee, 8)
        pad_at = None
        for side, sign in SIDES:
            y, z = worked if (side, sign) in arms else still
            angle = lerp(8, 84, t) if (side, sign) in arms else 8
            apply_leg(pose, side, (sign * 0.1, y, z), rot_x(-angle) @ rot_z(sign * 6), Vector((sign * 0.05, -1, 0.3)))
            if (side, sign) in arms and pad_at is None:
                a = math.radians(angle)
                pad_at = Vector((0, y - 0.06 * math.cos(a), z + 0.06 * math.sin(a)))
                if len(arms) == 1:
                    pad_at.x = sign * 0.1
        pose.props['prop_leg_pad'] = (pad_at, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, (sign * 0.27, -0.06, 0.5), Vector((sign, 0.3, 0)), Vector((-sign, 0, 0)), handle=Vector((0, 1, 0)))
        return pose
    return clip


def seated_curl(band=False):
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        pose.props['prop_seat'] = (Vector((0, 0.02, 0)), NOTHING_HELD)
        trunk = rot_x(-6)
        apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
        knee = (-0.41, 0.54)
        angle = lerp(72, -18, t)
        y, z = shin_angle(knee, angle)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.1, y, z), rot_x(-angle) @ rot_z(sign * 6), Vector((sign * 0.05, -1, 0.3)))
        a = math.radians(angle)
        pad = Vector((0, y + 0.06 * math.cos(a), z - 0.06 * math.sin(a)))
        if band:
            span(pose, 'prop_band', Vector((0.08, -1.05, 0.12)), pose.head['foot_l'])
            span(pose, 'prop_band_r', Vector((-0.08, -1.05, 0.12)), pose.head['foot_r'])
        else:
            pose.props['prop_leg_pad'] = (pad, NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, (sign * 0.27, -0.06, 0.5), Vector((sign, 0.3, 0)), Vector((-sign, 0, 0)), handle=Vector((0, 1, 0)))
        return pose
    return clip


def lying_curl(on_bench=True, sides=SIDES, pad=True):
    """Face down, knees just past the bench's end, the shin swinging up from the knee."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = ease(phase)
        if on_bench:
            pose.props['prop_bench_flat'] = (ORIGIN, NOTHING_HELD)
        top = 0.44 if on_bench else 0.0
        hips = (0, 0.12, top + 0.13)
        trunk = rot_x(90)
        apply_spine(pose, hips, trunk, trunk, trunk, rot_x(70), rot_x(50))
        knee = (0.12 + 0.45, top + 0.085)
        for side, sign in SIDES:
            angle = lerp(4, 112, t) if (side, sign) in sides else 2
            shin = bone_length('shin_l')
            a = math.radians(angle)
            y, z = knee[0] + shin * math.cos(a), knee[1] + shin * math.sin(a)
            apply_leg(pose, side, (sign * 0.1, y, z), rot_x(90 + angle + 55), Vector((sign * 0.03, 0.05, -1)))
            if pad and (side, sign) == sides[0]:
                x = 0 if len(sides) == 2 else sign * 0.1
                pose.props['prop_leg_pad'] = (Vector((x, y - 0.06 * math.sin(a) + 0.01, z + 0.06 * math.cos(a))), NOTHING_HELD)
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, (sign * 0.2, -0.6, top + 0.05), Vector((sign, 0.2, 0.4)), Vector((0, 0, -1)), hand_dir=Vector((-sign * 0.1, -1, 0)), curl=45)
        return pose
    return clip


def standing_curl(phase):
    """Hinged over a pad on one leg, the other curling behind."""
    pose = Pose()
    t = ease(phase)
    lean = 40
    trunk = flat_back(pose, (0, 0.12, 0.85), lean)
    apply_leg(pose, '_l', (0.1, 0.11, ANKLE_Z), rot_z(8), Vector((0.1, -1, 0)))
    hip = pose.point_on('thigh_l', (-0.09, 0.012, 0.86)) * Vector((0, 1, 1))
    knee = (0.17, 0.46)
    shin = bone_length('shin_l')
    angle = lerp(8, 108, t)
    a = math.radians(angle)
    y, z = knee[0] + shin * math.sin(a), knee[1] - shin * math.cos(a)
    apply_leg(pose, '_r', (-0.1, y, z), rot_x(angle + 40), Vector((-0.05, -1, -0.2)))
    pose.props['prop_leg_pad'] = (Vector((-0.1, y + 0.06 * math.cos(a), z + 0.06 * math.sin(a))), NOTHING_HELD)
    for side, sign in SIDES:
        wrist = shoulder_of(pose, side, trunk) + Vector((sign * 0.03, -0.25, -0.42))
        apply_arm(pose, side, trunk, wrist, Vector((sign * 0.4, 0.7, -0.3)), Vector((-sign, 0, 0)), handle=Vector((0, 1, 0)))
    return pose


def seated_spread(start, end):
    """On the machine's seat with the knees opening or closing."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        pose.props['prop_seat'] = (Vector((0, 0.02, 0)), NOTHING_HELD)
        trunk = rot_x(-6)
        apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
        x = lerp(start, end, t)
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * x, -0.36, 0.19), rot_z(sign * (6 + 60 * x)), Vector((sign * (0.1 + x * 1.6), -1, 0.1)))
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, (sign * 0.27, -0.03, 0.54), Vector((sign, 0.3, 0)), Vector((-sign, 0, 0)), handle=Vector((0, 1, 0)))
        return pose
    return clip


def on_toes(y, floor, tilt, x=0.13):
    """An ankle whose ball of the foot stays at (y, floor) as the heel rises by `tilt` (degrees)."""
    ankle = Vector((0, y, floor)) - rot_x(tilt) @ BALL_FROM_ANKLE
    return (x, ankle.y, ankle.z, tilt)


def calf_raise(block=PLATFORM, low=-14, high=32, lean=0, knee=0.0, **options):
    """The ball of the foot stays put; the body rides up on it. `knee` holds the knees this far off straight (metres of hip drop)."""
    def at(t, tilt):
        foot = on_toes(-0.06, block, tilt)
        return key(t, (foot[1] - 0.015 + lean * 0.004, foot[2] + 0.807 - knee), lean, foot)
    return moves((at(0.0, low), at(0.5, high), at(1.0, low)), **options)


def seated_calf(prop='prop_stool', load=None, sides=SIDES):
    """Sitting, shins upright: the heel lifts and the knee rides up with it."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        pose.props[prop] = (ORIGIN, NOTHING_HELD)
        pose.props['prop_platform'] = (Vector((0, -0.42, 0)), NOTHING_HELD)
        trunk = rot_x(2)
        apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
        for side, sign in SIDES:
            tilt = lerp(-12, 30, t) if (side, sign) in sides else 0
            _, y, z, _ = on_toes(-0.44, PLATFORM, tilt)
            apply_leg(pose, side, (sign * 0.13, y, z), rot_x(tilt), Vector((sign * 0.05, -1, 0.3)))
        thigh = pose.point_on('thigh_l', (0.075, -0.0, 0.5))
        if load == 'bar':
            pose.props['prop_barbell'] = (Vector((0, thigh.y, thigh.z + 0.09)), NOTHING_HELD)
            for side, sign in SIDES:
                apply_arm(pose, side, trunk, (sign * 0.22, thigh.y, thigh.z + 0.09), Vector((sign * 0.9, 0.4, -0.2)), Vector((0, -0.5, -1)), handle=ACROSS)
        elif load == 'bell':
            palm = Vector((0, 0, -1))
            fore_dir, reached = apply_arm(pose, '_l', trunk, thigh + Vector((0, 0, 0.11)), Vector((0.9, 0.4, -0.2)), palm)
            held(pose, 'prop_dumbbell_l', fore_dir, reached, palm)
            hand_on_thigh(pose, '_r', -1, trunk)
        else:
            for side, sign in SIDES:
                hand_on_thigh(pose, side, sign, trunk)
        return pose
    return clip


def ankle_circles(phase):
    pose = Pose()
    trunk = stand(pose)
    a = 2 * math.pi * phase
    apply_leg(pose, '_r', (-0.15, -0.03, 0.17), rot_y(14 * math.cos(a)) @ rot_x(16 * math.sin(a)) @ rot_z(-10), Vector((-0.1, -1, 0)))
    apply_leg(pose, '_l', (0.15, ANKLE_Y, ANKLE_Z), rot_z(10), Vector((0.05, -1, 0)))
    hands_on_hips(pose, '_l', 1, trunk)
    hands_on_hips(pose, '_r', -1, trunk)
    return pose


def knee_circles(phase):
    pose = Pose()
    a = 2 * math.pi * phase
    lean = 18
    trunk = flat_back(pose, (0.05 * math.cos(a), 0.09 + 0.03 * math.sin(a), 0.82 + 0.01 * math.sin(a)), lean)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.09, ANKLE_Y, ANKLE_Z), rot_z(sign * 6), Vector((0.55 * math.cos(a), -1, 0)))
        hands_on_hips(pose, side, sign, trunk)
    return pose


def hip_circle_standing(phase):
    pose = Pose()
    trunk = stand(pose)
    a = 2 * math.pi * phase
    out = 0.5 + 0.5 * math.cos(a)
    knee_out = 0.05 + 0.42 * out
    ankle = Vector((-0.09 - knee_out * 0.9, -0.33 + 0.26 * out + 0.1 * math.sin(a), 0.5 - 0.1 * out))
    apply_leg(pose, '_r', ankle, rot_x(-10) @ rot_z(-10 - 30 * out), Vector((-knee_out, -1, 0.5)))
    apply_leg(pose, '_l', (0.13, ANKLE_Y, ANKLE_Z), rot_z(8), Vector((0.1, -1, 0)))
    wrist_at((0.48, -0.05, 1.12), pole=(1, 0.3, -0.5), hand_dir=(0.5, 0, -0.2), palm=(0, 0, -1), curl=45)(pose, '_l', 1, trunk)
    hands_on_hips(pose, '_r', -1, trunk)
    return pose


def leg_swing(forward=0.0, sideways=0.0, back=0.0, support=True):
    """Standing on the left leg, the right swings straight: forward and back, or out and across."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        trunk = stand(pose)
        t = ease(phase)
        leg = 0.78
        fore = lerp(-back, forward, t) if forward or back else 0
        side_angle = math.radians(lerp(-10, sideways, t)) if sideways else 0
        angle = math.radians(fore)
        direction = Vector((-math.sin(side_angle), -math.sin(angle), -math.cos(angle) * math.cos(side_angle)))
        hip = Vector((-0.09, 0.03, 0.85))
        ankle = hip + direction * leg * 0.995
        apply_leg(pose, '_r', ankle, rot_x(-fore * 0.8 + 8) @ rot_y(-math.degrees(side_angle) * 0.9) @ rot_z(-8), Vector((-0.1, -1, 0.1)))
        apply_leg(pose, '_l', (0.1, ANKLE_Y, ANKLE_Z), rot_z(8), Vector((0.05, -1, 0)))
        if support:
            wrist_at((0.5, -0.05, 1.08), pole=(1, 0.3, -0.5), hand_dir=(0.5, 0, -0.2), palm=(0, 0, -1), curl=45)(pose, '_l', 1, trunk)
        else:
            hands_on_hips(pose, '_l', 1, trunk)
        hands_on_hips(pose, '_r', -1, trunk)
        return pose
    return clip


def kneeling_leg(ankle_start, ankle_end, pole=(0.05, -0.2, -1), tilt=(150, 150), wrist_y=-0.15, lean=84, extra=None):
    """On hands and knees, the right leg moving between two ankle points. The left leg stays on the floor."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = ease(phase)
        trunk = rot_x(lean)
        apply_spine(pose, (0, 0.34, 0.52), rot_x(lean - 6), trunk, trunk, rot_x(60), rot_x(40))
        apply_leg(pose, '_l', (0.11, 0.7, 0.09), FOOT_POINTED_BACK, Vector((0.1, -1, 0)))
        ankle = Vector(ankle_start).lerp(Vector(ankle_end), t)
        apply_leg(pose, '_r', ankle, rot_x(lerp(*tilt, t)), Vector(pole))
        all_fours_hands(pose, wrist_y, trunk)
        if extra:
            extra(pose, trunk)
        return pose
    return clip


def kneeling_kick(phase):
    """On hands and knees, each leg in turn lifts until the thigh is level, the knee staying at a right angle."""
    pose = Pose()
    pose.phase = phase
    trunk = rot_x(84)
    apply_spine(pose, (0, 0.34, 0.52), rot_x(78), trunk, trunk, rot_x(60), rot_x(40))
    for index, (side, sign) in enumerate(SIDES):
        lift = ease(phase * 2) if index == int(phase >= 0.5) else 0.0
        # From the kneeling thigh's angle, not straight between two ankle points, which would fold the knee on the way up.
        pose.place(f'thigh{side}', Quaternion())
        hip = pose.head[f'thigh{side}']
        kneeling = math.acos((hip.z - 0.09) / bone_length(f'thigh{side}'))
        swing = lerp(kneeling, math.radians(92), lift)
        rise = math.radians(92) * lift
        thigh = Vector((0, math.sin(swing), -math.cos(swing)))
        shin = Vector((0, math.cos(rise), math.sin(rise)))
        ankle = hip + thigh * bone_length(f'thigh{side}') + shin * bone_length(f'shin{side}')
        apply_leg(pose, side, ankle, rot_x(150 + math.degrees(rise)), Vector((sign * 0.03, 0, -1)))
    all_fours_hands(pose, -0.15, trunk)
    return pose


def plank_legs(left_at, right_at=None, keep_toes=False):
    """A plank on the hands while each leg follows its own function of the phase."""
    def clip(phase):
        pose = Pose()
        body, toes = plank(pose, shoulder_height(0.26, 0.07, 0), 0.07, 0.02)
        for (side, sign), at in zip(SIDES, (left_at, right_at or left_at)):
            ankle, foot, pole = at(phase, sign, toes)
            if ankle is not None:
                apply_leg(pose, side, ankle, foot, pole)
        for side, sign in SIDES:
            plank_hand(pose, side, sign, body, (sign * 0.26, HANDS_Y, 0.07))
        return pose
    return clip


def climbing_leg(phase, sign, toes):
    p = (phase + (0 if sign > 0 else 0.5)) % 1
    drive = ease(p)
    plank_ankle = Vector((sign * 0.1, toes.y + 0.08, 0.12))
    tucked = Vector((sign * 0.1, toes.y - 0.62, 0.22))
    return plank_ankle.lerp(tucked, drive), rot_x(lerp(100, 80, drive)), Vector((sign * 0.1, -1, -0.3))


def groiner_leg(phase, sign, toes):
    drive = ease(phase)
    plank_ankle = Vector((sign * 0.1, toes.y + 0.08, 0.12))
    tucked = Vector((sign * 0.36, HANDS_Y + 0.18, ANKLE_Z))
    return plank_ankle.lerp(tucked, drive), rot_x(lerp(100, 8, drive)), Vector((sign * 0.1, -1, -0.3)).lerp(Vector((sign * 0.6, -0.7, 0.1)), drive)


def bear_crawl(phase):
    """Hands and feet walking on the spot, knees just off the floor."""
    pose = Pose()
    pose.phase = phase
    lean = 80
    trunk = rot_x(lean)
    apply_spine(pose, (0, 0.28, 0.6), rot_x(lean - 8), trunk, trunk, rot_x(45), rot_x(30))
    for side, sign in SIDES:
        p = (phase + (0 if sign > 0 else 0.5)) % 1
        x, y, z, tilt = foot_stride(p, 0.11, 0.07, 0.6, 0.0, 0.14, center=0.62)
        apply_leg(pose, side, (sign * x, y, z - 0.02), rot_x(tilt + 20), Vector((sign * 0.1, -1, -0.2)))
        q = (phase + (0.5 if sign > 0 else 0)) % 1
        _, hy, hz, _ = foot_stride(q, 0.11, 0.06, 0.6, 0.0, 0.2, center=-0.3)
        apply_arm(pose, side, trunk, (sign * 0.22, hy, hz), Vector((sign * 0.9, 0.3, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.15, -1, 0)), curl=0)
    return pose


def wrist_low(y, x=0.2, z=0.05):
    return wrist_at((x, y, z), pole=(0.9, 0.35, 0.3), hand_dir=(0.15, -1, 0), palm=(0, 0, -1), curl=0)


def inchworm(phase):
    """Hands walk out to a plank and back while the feet stay; the hips fall as they go."""
    pose = Pose()
    y_hand, hips_y, hips_z, lean = through(ease(phase), (
        (0.0, (-0.02, 0.42, 0.79, 112)),
        (0.45, (-0.36, 0.18, 0.54, 95)),
        (1.0, (-0.66, -0.06, 0.27, 76)),
    ))
    trunk = rot_x(lean)
    apply_spine(pose, (0, hips_y, hips_z), rot_x(lean - 8), trunk, trunk, rot_x(lean - 10), rot_x(lean - 20))
    tilt = lerp(0, 50, ease(phase))
    toes = 0.57
    for side, sign in SIDES:
        foot = on_toes(toes, 0.02, tilt, x=0.1)
        apply_leg(pose, side, (sign * 0.1, foot[1], foot[2]), rot_x(tilt) @ rot_z(sign * 6), Vector((sign * 0.05, -1, 0)))
        apply_arm(pose, side, trunk, (sign * 0.22, y_hand, 0.06), Vector((sign * 0.9, 0.3, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.15, -1, 0)), curl=0)
    return pose


def tire_flip(phase):
    """Drive the tire up from flat through its far edge, a knee behind it at 45 degrees, and shove it over."""
    pose = Pose()
    hips_y, hips_z, lean, grip_y, grip_z, angle, right_y, right_z, right_tilt = through(ease(phase), (
        (0.0, (0.5, 0.56, 62, 0.28, 0.14, 0, 0.59, ANKLE_Z, 0)),
        (0.45, (0.2, 0.8, 25, -0.08, 0.72, 40, 0.59, ANKLE_Z, 0)),
        (0.72, (-0.1, 0.87, 12, -0.5, 1.0, 62, 0.25, 0.25, 0)),
        (1.0, (-0.3, 0.88, 24, -0.72, 1.12, 80, 0.05, ANKLE_Z, 0)),
    ))
    far = Vector((0, -0.59 - 0.1, 0.14))
    a = math.radians(angle)
    center = far + Vector((0, math.cos(a), math.sin(a))) * 0.59
    pose.props['prop_tire'] = (center, rot_x(-angle))
    trunk = flat_back(pose, (0, hips_y, hips_z), lean)
    apply_leg(pose, '_l', (0.14, lerp(0.6, 0.0, smoothstep(0.4, 0.9, ease(phase))), ANKLE_Z), rot_z(10), Vector((0.2, -1, 0)))
    apply_leg(pose, '_r', (-0.14, right_y, right_z), rot_x(right_tilt) @ rot_z(-10), Vector((-0.2, -1, 0)))
    for side, sign in SIDES:
        grip = Vector((sign * 0.24, grip_y, grip_z))
        # The palm stays square to the arm, so it turns from under the tread to pushing without flipping over.
        apply_arm(pose, side, trunk, grip, Vector((sign * 0.35, 0.7, -0.5)), ACROSS.cross(grip - shoulder_of(pose, side, trunk)).normalized(), handle=ACROSS)
    return pose


def on_wall_lean(phase):
    """Leaning into a wall on straight arms, a knee driving up and back down."""
    pose = Pose()
    pose.phase = phase
    pose.props['prop_wall'] = (Vector((0, -0.72, 0)), NOTHING_HELD)
    lean = 45
    trunk = rot_x(lean)
    apply_spine(pose, (0, 0.2, 0.74), trunk, trunk, trunk, rot_x(25), rot_x(12))
    for side, sign in SIDES:
        drive = ease(phase) if sign > 0 else 0.0
        toe = on_toes(0.92, 0.02, 40, x=0.1)
        ankle = Vector((sign * 0.1, toe[1], toe[2])).lerp(Vector((sign * 0.1, 0.05, 0.42)), drive)
        apply_leg(pose, side, ankle, rot_x(lerp(40, 15, drive)), Vector((sign * 0.05, -1, 0)))
        shoulder = shoulder_of(pose, side, trunk)
        wall = Vector((sign * 0.24, -0.68, shoulder.z + 0.02))
        apply_arm(pose, side, trunk, wall, Vector((sign * 0.8, 0.3, -0.3)), Vector((0, -1, 0)), hand_dir=Vector((0, 0, 1)), curl=0)
    return pose


def standing_toe_touch(pose, side, sign, trunk):
    grab('foot', (0.072, -0.07, 0.03), pole=(0.3, 0.8, 0), palm=(0, 1, 0), curl=30)(pose, side, sign, trunk)


def calf_against_wall(forearms=False, stagger=0.0):
    """Leaning into the wall; the heels stay down while the hips ease towards it."""
    def clip(phase):
        pose = Pose()
        t = ease(phase)
        lean = lerp(18, 28, t) if forearms else lerp(14, 24, t)
        hip_y = lerp(0.02, -0.08, t)
        pose.props['prop_wall'] = (Vector((0, -0.72 if forearms else -0.68, 0)), NOTHING_HELD)
        trunk = rot_x(lean)
        apply_spine(pose, (0, hip_y, 0.87 - 0.01 * t), trunk, trunk, trunk, rot_x(lean * 0.5), rot_x(lean * 0.2))
        for side, sign in SIDES:
            forward = sign > 0 and stagger
            y = 0.27 - stagger if forward else 0.27
            apply_leg(pose, side, (sign * 0.12, y, ANKLE_Z), rot_z(sign * 6), Vector((sign * 0.05, -1, 0)))
            wall_y = (-0.69 if forearms else -0.65)
            shoulder = shoulder_of(pose, side, trunk)
            if forearms:
                apply_arm(pose, side, trunk, (sign * 0.08, wall_y, shoulder.z + 0.3), Vector((sign * 0.8, 0.2, -1)), Vector((0, -1, 0)), hand_dir=Vector((-sign * 0.2, 0, 1)), curl=0)
            else:
                apply_arm(pose, side, trunk, (sign * 0.24, wall_y, shoulder.z + 0.02), Vector((sign * 0.8, 0.3, -0.3)), Vector((0, -1, 0)), hand_dir=Vector((0, 0, 1)), curl=0)
        return pose
    return clip


def belt_plate(pose, trunk):
    both_arms(ARMS_OUT_SIDE)(pose, trunk)
    plate = pose.head['hips'] + Vector((0, -0.02, -0.5))
    pose.props['prop_plate'] = (plate, NOTHING_HELD)
    span(pose, 'prop_cable_l', pose.head['hips'] + Vector((0, -0.1, -0.05)), plate)


def strap_to_foot(pose, trunk):
    span(pose, 'prop_cable_r', Vector((-0.08, 0.72, 1.15)), pose.point_on('foot_r', (-0.072, -0.06, 0.03)))


def ankle_strap(side='_l', anchor=(0.72, 0.02, 0.12), prop='prop_band'):
    def extra(pose, trunk):
        span(pose, prop, Vector(anchor), pose.head[f'foot{side}'])
    return extra


def add_pulley(pose, pulley):
    pose.props['prop_pulley_l'] = (Vector(pulley), NOTHING_HELD)
    span(pose, 'prop_cable_column_l', Vector((pulley[0], pulley[1], 0)), Vector((pulley[0], pulley[1], pulley[2] + 0.08)))


def cable_to_ankle(side, pulley):
    def extra(pose, trunk):
        add_pulley(pose, pulley)
        span(pose, 'prop_cable_l', Vector(pulley), pose.head[f'foot{side}'])
    return extra


def cables_to_hands(pulley_y=0.05, x=0.45):
    def extra(pose, trunk):
        for suffix, side, sign in (('l', '_l', 1), ('r', '_r', -1)):
            pulley = Vector((sign * x, pulley_y, 0.12))
            pose.props[f'prop_pulley_{suffix}'] = (pulley, NOTHING_HELD)
            span(pose, f'prop_cable_{suffix}', pulley, pose.grips[side])
            span(pose, f'prop_cable_column_{suffix}', Vector((sign * x, pulley_y, 0)), Vector((sign * x, pulley_y, 1.0)))
    return extra


def pull_through_cable(pose, trunk):
    pose.props['prop_pulley_l'] = (Vector((0, 1.05, 0.12)), NOTHING_HELD)
    span(pose, 'prop_cable_column_l', Vector((0, 1.05, 0)), Vector((0, 1.05, 1.0)))
    span(pose, 'prop_cable_l', Vector((0, 1.05, 0.12)), pose.grips['_l'])


def sled_ahead(y=-0.95, handle=False):
    def extra(pose, trunk):
        pose.props['prop_sled'] = (Vector((0, y, 0)), NOTHING_HELD)
    return extra


def harnessed(pose, trunk):
    pose.props['prop_sled'] = (Vector((0, 1.05, 0)), rot_z(180))
    span(pose, 'prop_cable_l', pose.point_on('hips', (0, 0.1, 0.95)), Vector((0, 0.9, 0.18)))


def rope_ahead(pose, trunk):
    pose.props['prop_sled'] = (Vector((0, -1.25, 0)), NOTHING_HELD)
    hand = (pose.grips['_l'] + pose.grips['_r']) / 2
    span(pose, 'prop_cable_l', hand, Vector((0, -1.08, 0.18)))


def pushing_sled(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, (sign * 0.22, center.y - 0.56, center.z - 0.14), Vector((sign * 0.3, 0.6, -0.8)), Vector((0, 1, -0.2)).normalized(), handle=ACROSS)


def rope_in_hands(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((-sign * 0.08, -0.5, -0.28)), Vector((sign * 0.3, 0.6, -0.6)), Vector((-sign, 0, 0)))


def harness_arms(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((sign * 0.04, -0.25, -0.5)), Vector((sign * 0.25, 0.9, 0)), Vector((-sign, 0, 0)))


def rope_turning(pose, side, sign, trunk):
    a = 2 * math.pi * pose.phase
    shoulder = shoulder_of(pose, side, trunk)
    hand = shoulder + Vector((sign * 0.18, -0.1 + 0.03 * math.cos(a), -0.42 + 0.03 * math.sin(a)))
    apply_arm(pose, side, trunk, hand, Vector((sign * 0.3, 0.9, -0.2)), Vector((-sign, 0, 0)), curl=70)


def skating(phase):
    """Weight goes side to side, each leg pushing out long while the other bends under the body."""
    pose = Pose()
    pose.phase = phase
    a = math.sin(2 * math.pi * phase)
    trunk = flat_back(pose, (0.17 * a, 0.14, 0.73), 32)
    for side, sign in SIDES:
        push = 0.5 - 0.5 * sign * a
        y = 0.05
        x = lerp(0.2, 0.55, push) - 0
        lifted = 0.03 * push
        apply_leg(pose, side, (sign * x, y + 0.2 * push, ANKLE_Z + lifted), rot_z(sign * (8 + 25 * push)), Vector((sign * 0.3, -1, 0)))
        swing = 0.5 + 0.5 * sign * a
        shoulder = shoulder_of(pose, side, trunk)
        apply_arm(pose, side, trunk, shoulder + Vector((sign * 0.1, lerp(0.22, -0.28, swing), -0.34)), Vector((sign * 0.3, 0.9, -0.2)), Vector((-sign, 0, 0)), curl=45)
    return pose


def sprint_start(phase):
    """Low over the front foot, a hand on the line, then the first hard strides out and back in."""
    pose = Pose()
    pose.phase = phase
    hips_y, hips_z, lean, ly, lz, lt, ry, rz, rt = through(ease(phase), (
        (0.0, (0.28, 0.6, 82, -0.03, ANKLE_Z, 0, 0.28, ANKLE_Z + 0.05, 45)),
        (0.5, (0.12, 0.74, 52, -0.03, ANKLE_Z, 15, 0.0, 0.42, 25)),
        (1.0, (-0.1, 0.84, 30, 0.2, ANKLE_Z + 0.05, 45, -0.48, ANKLE_Z, -5)),
    ))
    trunk = flat_back(pose, (0, hips_y, hips_z), lean)
    apply_leg(pose, '_l', (0.12, ly, lz), rot_x(lt) @ rot_z(8), Vector((0.1, -1, 0)))
    apply_leg(pose, '_r', (-0.12, ry, rz), rot_x(rt) @ rot_z(-8), Vector((-0.1, -1, 0)))
    t = ease(phase)
    down = smoothstep(0.0, 0.35, t)
    shoulder = shoulder_of(pose, '_r', trunk)
    on_line = Vector((-0.24, -0.48, 0.07))
    driven = shoulder + Vector((-0.03, -0.26, -0.28))
    apply_arm(pose, '_r', trunk, on_line.lerp(driven, down), Vector((-0.4, 0.8, -0.1)), Vector((1, 0, 0)), curl=lerp(5, 55, down))
    shoulder = shoulder_of(pose, '_l', trunk)
    apply_arm(pose, '_l', trunk, shoulder + Vector((0.08, lerp(0.28, 0.2, t), lerp(-0.2, -0.32, t))), Vector((0.3, 0.9, -0.2)), Vector((-1, 0, 0)), curl=55)
    return pose


def worlds_greatest(phase):
    """Deep lunge, hand and elbow down by the front foot, then the free arm reaches for the ceiling."""
    pose = Pose()
    t = ease(phase)
    lean, reach = through(t, ((0.0, (10, 0)), (0.5, (62, 0)), (1.0, (62, 1))))
    hips = (0, 0.27, lerp(0.52, 0.5, t))
    trunk = flat_back(pose, hips, lean)
    front = (0.15, -0.32, ANKLE_Z, 0)
    apply_leg(pose, '_l', front[:3], rot_z(8), Vector((0.2, -1, 0)))
    rear = on_toes(0.95, 0.02, 45, x=0.12)
    apply_leg(pose, '_r', (-0.12, rear[1], rear[2]), rot_x(45), Vector((-0.05, -1, 0)))
    down = smoothstep(10, 62, lean)
    left_rest = shoulder_of(pose, '_l', trunk) + Vector((0.08, 0.05, -0.55))
    apply_arm(pose, '_l', trunk, left_rest.lerp(Vector((0.03, -0.3, 0.07)), down), Vector((0.8, 0.1, -0.2)), Vector((0, 0, -1)), hand_dir=Vector((0, -1, 0)).lerp(Vector((0, -1, 0)), down), curl=lerp(25, 2, down))
    right = shoulder_of(pose, '_r', trunk)
    on_floor = Vector((-0.3, -0.3, 0.07))
    pointing = right + Vector((-0.14, 0.02, WRIST_REACH * 0.97))
    target = (right + Vector((-0.08, 0.05, -0.55))).lerp(on_floor, down).lerp(pointing, reach)
    apply_arm(pose, '_r', trunk, target, Vector((-0.2, 0.8, 0)), Vector((0, -1, 0)).lerp(Vector((0, 0, -1)), 1 - reach).normalized(),
              hand_dir=Vector((0, -1, 0)).lerp(UP, reach).normalized(), curl=lerp(2, 8, reach))
    return pose


def low_kneel_keys(lean_a, lean_b):
    """Half kneeling, left foot ahead, the right knee down, the hips easing forward."""
    front = (0.14, -0.3, ANKLE_Z, 0)
    rear = (0.1, 0.62, 0.09, 150)
    return (key(0.0, (0.2, 0.55), lean_a, front, rear), key(0.5, (0.09, 0.5), lean_b, front, rear), key(1.0, (0.2, 0.55), lean_a, front, rear))


SUPINE_Y = 0.2
SUPINE_Z = BACK_DEPTH
FLAT_FOOT = (0.1, SUPINE_Y - 0.82, 0.09, -90)
BENT_FOOT = (0.15, SUPINE_Y - 0.44, ANKLE_Z, 0)
UP_KNEE = (0.2, -0.2, 1)


def supine(t, left=FLAT_FOOT, right=None, lift=0.0, curl=0, angle=0, y=SUPINE_Y):
    return key(t, (y, SUPINE_Z + lift), -90 - angle, left, right or left, curl=curl)


SIT_Y = 0.28
SIT_Z = 0.14
SIT_FOOT = (0.11, SIT_Y - 0.79, 0.09, -80)


def seated_key(t, lean=-4, left=SIT_FOOT, right=None, curl=0, y=SIT_Y, z=SIT_Z):
    return key(t, (y, z), lean, left, right or left, curl=curl)


def prone(t, left=None, right=None, y=0.08, z=0.14, lean=90, curl=0):
    straight = (0.1, y + 0.82, 0.1, 150)
    return key(t, (y, z), lean, left or straight, right or left or straight, curl=curl)


def prone_bent(y=0.08, angle=90, x=0.1, z_knee=0.09):
    """A foot of a leg lying face down with the knee bent this far from straight."""
    a = math.radians(angle)
    shin = bone_length('shin_l')
    return (x, y + 0.46 + shin * math.cos(a), z_knee + shin * math.sin(a), 90 + angle + 55)


SIDE_LYING = 90


def side_key(t, left, right, y=0.25, z=0.17, x=0.0, lean=-90):
    return key(t, (x, y, z), lean, left, right)


def floor_hands_back(pose, side, sign, trunk):
    hips = pose.head['hips']
    apply_arm(pose, side, trunk, (sign * 0.27, hips.y + 0.26, 0.06), Vector((sign * 0.9, 0.35, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.3, 1, 0)), curl=5)


def forearm_on_floor(pose, side, sign, trunk):
    """Face down, propped on the forearms."""
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, (sign * 0.2, shoulder.y - 0.24, 0.08), Vector((sign * 0.25, 0.15, -1)), Vector((0, 0, -1)), hand_dir=Vector((-sign * 0.1, -1, 0)), curl=15)


def arms_out_on_floor(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, (sign * (abs(shoulder.x) + WRIST_REACH * 0.96), shoulder.y, 0.06), Vector((sign * 0.1, 0.1, 1)), Vector((0, 0, -1)), hand_dir=Vector((sign, 0, 0)), curl=3)


def arms_by_side_supine(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, (sign * 0.3, shoulder.y - 0.48, 0.05), Vector((sign, 0, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.1, -1, 0)), curl=5)


def floor_hand_side(pose, side, sign, trunk):
    hips = pose.head['hips']
    apply_arm(pose, side, trunk, (sign * 0.3, hips.y + 0.05, 0.06), Vector((sign, 0.2, 0.1)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.3, -0.2, 0)), curl=5)


def jefferson_grip(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    bar = Vector((0, center.y, max(center.z - arm_span(6, TO_GRIP), BAR_ON_FLOOR)))
    pose.props['prop_bar_loaded'] = (bar, rot_z(90))
    # One hand ahead of the body and one behind, on a bar that runs front to back between the legs.
    along = Vector((0, 1, 0))
    apply_arm(pose, '_l', trunk, bar + Vector((0.03, 0.22, 0)), Vector((0.8, 0.5, 0)), Vector((1, 0, 0)), handle=along)
    apply_arm(pose, '_r', trunk, bar + Vector((-0.03, -0.22, 0)), Vector((-0.8, -0.2, 0)), Vector((1, 0, 0)), handle=along)


def one_arm_side_bar(pose, trunk):
    """A barbell held at its middle in one hand, beside the body and running front to back."""
    hands_on_hips(pose, '_r', -1, trunk)
    shoulder = shoulder_of(pose, '_l', trunk)
    bar = Vector((0.27, 0.03, max(shoulder.z - arm_span(5, TO_GRIP), 0.225)))
    pose.props['prop_barbell'] = (bar, rot_z(90))
    apply_arm(pose, '_l', trunk, bar, Vector((0.3, 0.9, 0)), Vector((-1, 0, 0)), handle=Vector((0, 1, 0)))


def balance_grip(pose, trunk):
    """On the back of the shoulders at the start of the rep, locked out overhead from the bottom until fully stood up."""
    t = smoothstep(0.15, 0.42, pose.phase) * (1 - smoothstep(0.78, 0.97, pose.phase))
    clavicles = {side: scapula(trunk, sign, 24 * t, 0) for side, sign in SIDES}
    left = shoulder_of(pose, '_l', clavicles['_l'])
    center = (left + shoulder_of(pose, '_r', clavicles['_r'])) / 2
    half = 0.42
    reach = math.sqrt(arm_span(5, TO_GRIP) ** 2 - (half - abs(left.x)) ** 2)
    high = center + Vector((0, 0.03, reach * 0.99))
    low = pose.point_on('spine2', (0, 0.105, 1.445))
    bar = low.lerp(high, t)
    pose.props['prop_barbell'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, clavicles[side], bar + Vector((sign * half, 0, 0)), Vector((sign * 0.8, lerp(0.35, 0.05, t), -1)), Vector((0, -1, 0.15 * (1 - t))), handle=ACROSS)


def pulled_between_legs(pose, side, sign, trunk):
    t = ease(pose.phase)
    shoulder = shoulder_of(pose, side, trunk)
    low = Vector((sign * 0.04, shoulder.y + 0.25, shoulder.z - 0.55))
    high = shoulder + Vector((-sign * 0.13, -0.12, -0.56))
    apply_arm(pose, side, trunk, low.lerp(high, 1 - abs(2 * pose.phase - 1)), Vector((sign * 0.2, 0.6, -0.1)), Vector((-sign, 0, 0)))


def good_morning_loop(pose, trunk):
    """A band from under the feet to the back of the neck, on both sides."""
    neck = pose.point_on('spine2', (0, 0.09, 1.44))
    span(pose, 'prop_band', pose.point_on('foot_l', (0.05, -0.04, 0.02)), neck + trunk @ Vector((0.08, 0, 0)))
    span(pose, 'prop_band_r', pose.point_on('foot_r', (-0.05, -0.04, 0.02)), neck + trunk @ Vector((-0.08, 0, 0)))


def one_leg_key(t, air, dip):
    """Hopping on the left leg, the right knee up in front, its heel kicking to the seat in the air."""
    left = (0.1, ANKLE_Y, ANKLE_Z + air, 20 if air else 0)
    right = (0.1, 0.3, 0.74 + air, 150) if air else (0.1, 0.24, 0.42, 60)
    return stood(t, air=air, dip=dip, lean=2 if air else None, left=left, right=right)


def kneeling_sit(pose, t=0):
    """Knees on the floor: the hips sink back to the heels."""
    trunk = flat_back(pose, (0, lerp(0.1, 0.47, t), lerp(0.55, 0.34, t)), lerp(0, 24, t))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.12, 0.46, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.1, -1, 0)))
    return trunk


def rocking_key(t, tilt):
    foot = on_toes(-0.06, 0.02, tilt) if tilt >= 0 else (0.13, ANKLE_Y, ANKLE_Z, tilt)
    return key(t, (foot[1] - 0.015, foot[2] + 0.807), 0, foot)


def donkey_key(t, tilt):
    foot = on_toes(-0.06, PLATFORM, tilt)
    return key(t, (foot[1] + 0.04, foot[2] + 0.79), 84, foot)


def hip_bridge(bench=False, bar=False, band=False, one_leg=False):
    """Shoulders on the floor (or a bench), the hips driving up from the heels."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = ease(phase)
        if bench:
            shoulders = Vector((0, 0.36, 0.5))
            pose.props['prop_bench_flat'] = (Vector((0, 0.9, 0)), NOTHING_HELD)
            angle = lerp(-22, 14, t)
            ankle_y = -0.34
        else:
            shoulders = Vector((0, 0.34, BACK_DEPTH))
            angle = lerp(1, 32, t)
            ankle_y = -0.42
        body = rot_x(-90 - angle)
        hips_at = shoulders - body @ HIPS_TO_SHOULDERS
        flat = rot_x(-90)
        apply_spine(pose, hips_at, body, body, body, flat @ rot_x(8), flat @ rot_x(8))
        for side, sign in SIDES:
            if one_leg and sign < 0:
                apply_leg(pose, side, hips_at + Vector((sign * 0.1, -0.2, 0.42)), rot_x(-140), Vector((sign * 0.1, 0.4, 1)))
            else:
                apply_leg(pose, side, (sign * 0.16, ankle_y, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.25, -0.3, 1)))
        lap = hips_at + body @ Vector((0, -0.14, -0.03))
        if bar:
            pose.props['prop_bar_loaded'] = (lap + Vector((0, 0, 0.03)), NOTHING_HELD)
            for side, sign in SIDES:
                apply_arm(pose, side, body, lap + Vector((sign * 0.3, 0, 0.05)), Vector((sign * 0.9, 0.2, 0.2)), Vector((0, -0.4, -1)), handle=ACROSS)
        else:
            for side, sign in SIDES:
                arms_by_side_supine(pose, side, sign, body)
        if band:
            for prop, x in (('prop_band', 0.55), ('prop_band_r', -0.55)):
                span(pose, prop, Vector((x, lap.y, 0.03)), lap + Vector((x * 0.3, 0, 0.06)))
        return pose
    return clip


def ball_bridge(phase):
    pose = Pose()
    t = ease(phase)
    pose.props['prop_stability_ball'] = (Vector((0, 0.48, 0.3)), NOTHING_HELD)
    shoulders = Vector((0, 0.44, 0.68))
    angle = lerp(-30, 6, t)
    body = rot_x(-90 - angle)
    hips_at = shoulders - body @ HIPS_TO_SHOULDERS
    flat = rot_x(-90)
    apply_spine(pose, hips_at, body, body, body, flat @ rot_x(14), flat @ rot_x(14))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.17, -0.42, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.25, -0.3, 1)))
        crossed_on_chest(pose, side, sign, body)
    return pose


def ball_leg_curl(phase):
    """Heels on the ball, hips up: the knees bend and the ball rolls in."""
    pose = Pose()
    t = ease(phase)
    ball_y = lerp(-0.74, -0.36, t)
    pose.props['prop_stability_ball'] = (Vector((0, ball_y, 0.3)), NOTHING_HELD)
    shoulders = Vector((0, 0.4, BACK_DEPTH))
    ankle = Vector((0, ball_y + 0.02, 0.635))
    hip_y, hip_z = lerp(-0.12, -0.08, t), lerp(0.5, 0.62, t)
    angle = math.degrees(math.atan2(hip_z - shoulders.z, shoulders.y - hip_y))
    body = rot_x(-90 - angle)
    hips_at = shoulders - body @ HIPS_TO_SHOULDERS
    flat = rot_x(-90)
    apply_spine(pose, hips_at, body, body, body, flat @ rot_x(8), flat @ rot_x(8))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.11, ankle.y, ankle.z), rot_x(lerp(-90, -30, t)), Vector((sign * 0.1, 0.3, 1)))
        arms_by_side_supine(pose, side, sign, body)
    return pose


def ball_balance(phase):
    """Face down over the ball: it rolls towards the feet as the hands walk out and the legs lift."""
    pose = Pose()
    t = ease(phase)
    ball_y = lerp(0.1, 0.32, t)
    pose.props['prop_stability_ball'] = (Vector((0, ball_y, 0.3)), NOTHING_HELD)
    # Head down over the ball, so the hands reach the floor.
    trunk = rot_x(lerp(98, 102, t))
    lean = lerp(98, 102, t)
    apply_spine(pose, (0, ball_y + 0.06, 0.64), trunk, trunk, trunk, rot_x(lean - 20), rot_x(lean - 40))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.1, ball_y + 0.84, lerp(0.14, 0.72, t)), FOOT_POINTED_BACK, Vector((sign * 0.03, 0, -1)))
        apply_arm(pose, side, trunk, (sign * 0.22, lerp(-0.1, -0.2, t), 0.07), Vector((sign * 0.9, 0.3, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.15, -1, 0)), curl=0)
    return pose


def glute_ham_raise(phase):
    """Knees on the pad, ankles held: the straight body lowers from upright towards the floor and is pulled back up by the hamstrings."""
    pose = Pose()
    t = ease(phase)
    lean = lerp(0, 72, t)
    knee = Vector((0, 0.1, 0.1))
    thigh = bone_length('thigh_l') + 0.03
    a = math.radians(lean)
    hip = knee + Vector((0, -thigh * math.sin(a), thigh * math.cos(a)))
    hip_rest = REST['thigh_l'][0] - REST['hips'][0]
    hips_at = hip - rot_x(lean) @ (hip_rest * Vector((0, 1, 1)))
    trunk = rot_x(lean)
    apply_spine(pose, hips_at, trunk, trunk, trunk, rot_x(lean * 0.6), rot_x(lean * 0.35))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.1, 0.46, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.05, -1, -0.1)))
        crossed_on_chest(pose, side, sign, trunk)
    pose.props['prop_leg_pad'] = (Vector((0, 0.5, 0.17)), NOTHING_HELD)
    return pose


def reverse_hyper(phase):
    pose = Pose()
    pose.phase = phase
    t = ease(phase)
    pose.props['prop_bench_high'] = (Vector((0, -0.45, 0)), NOTHING_HELD)
    trunk = rot_x(90)
    apply_spine(pose, (0, 0.32, HIGH_BENCH_TOP + 0.13), rot_x(lerp(40, 92, t)), trunk, trunk, rot_x(70), rot_x(50))
    for side, sign in SIDES:
        angle = lerp(40, 98, t)
        direction = Vector((0, math.sin(math.radians(angle)), -math.cos(math.radians(angle))))
        hip = Vector((0, 0.34, HIGH_BENCH_TOP + 0.09))
        apply_leg(pose, side, hip + Vector((sign * 0.1, 0, 0)) + direction * 0.77, rot_x(angle + 40), Vector((sign * 0.03, -0.4, -1)))
        apply_arm(pose, side, trunk, (sign * 0.2, -0.65, HIGH_BENCH_TOP), Vector((sign, 0.2, 0.4)), Vector((0, 0, -1)), handle=ACROSS)
    return pose


def hip_circle_prone(phase):
    a = 2 * math.pi * phase
    pose = Pose()
    pose.phase = phase
    trunk = rot_x(84)
    apply_spine(pose, (0, 0.34, 0.52), rot_x(78), trunk, trunk, rot_x(60), rot_x(40))
    apply_leg(pose, '_l', (0.11, 0.7, 0.09), FOOT_POINTED_BACK, Vector((0.1, -1, 0)))
    out = 0.5 + 0.5 * math.cos(a)
    ankle = Vector((-0.2 - 0.32 * out, 0.6 + 0.14 * math.sin(a), 0.32 + 0.08 * out))
    apply_leg(pose, '_r', ankle, rot_x(170), Vector((-0.15 - 0.8 * out, -0.2 + 0.25 * math.sin(a), -0.7)))
    all_fours_hands(pose, -0.15, trunk)
    return pose


def stair_climb(phase):
    """Each foot rises a step and presses it down; the body stays level."""
    pose = Pose()
    pose.phase = phase
    trunk = flat_back(pose, (0, 0.05, 1.0 + 0.012 * math.cos(4 * math.pi * phase)), 8)
    for side, sign in SIDES:
        p = (phase + (0 if sign > 0 else 0.5)) % 1
        if p < 0.5:
            s = p / 0.5
            y, z = lerp(-0.12, 0.05, s), lerp(0.42, 0.17, s)
        else:
            s = (p - 0.5) / 0.5
            y, z = lerp(0.05, -0.12, smoothstep(0, 1, s)), lerp(0.17, 0.42, smoothstep(0, 1, s)) + 0.05 * math.sin(math.pi * s)
        apply_leg(pose, side, (sign * 0.12, y, z), rot_x(6) @ rot_z(sign * 6), Vector((sign * 0.1, -1, 0)))
    for side, sign in SIDES:
        (pumping((0.05, -0.2, -0.28), (0.08, 0.08, -0.34), curl=50))(pose, side, sign, trunk)
    return pose


# Where the hips stay on average in the rolling clips, wherever along the leg the roller is, to keep the figure in view.
SMR_HIPS_Y = 0.23


def smr_seated(near, far, thick_near, thick_far):
    """Hips held up on planted hands, the straight legs resting on a roller that runs from `near` to `far` along them (metres from the hip)."""
    slope = math.radians(6)
    pelvis = -38
    trunk = rot_x(-50)
    roller_y = SMR_HIPS_Y - (near + far) / 2

    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = 0.5 - 0.5 * math.cos(2 * math.pi * phase)
        along = lerp(near, far, t)
        # The leg's underside rests on top of the roller, wherever along it the roller is.
        on_roller = ROLLER_RADIUS * 2 + lerp(thick_near, thick_far, t)
        hip_y, hip_z = roller_y + along * math.cos(slope), on_roller + along * math.sin(slope)
        joint_y, joint_z = hip_joint(0, 0, pelvis)
        pose.props['prop_foam_roller'] = (Vector((0, roller_y, ROLLER_RADIUS)), NOTHING_HELD)
        apply_spine(pose, (0, hip_y - joint_y, hip_z - joint_z), rot_x(pelvis), trunk, trunk, rot_x(-30), rot_x(-8))
        hand_y = SMR_HIPS_Y + 0.46
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.1, hip_y - STRAIGHT_LEG * math.cos(slope), hip_z - STRAIGHT_LEG * math.sin(slope)), rot_x(-84), Vector((sign * 0.03, 0, 1)))
            apply_arm(pose, side, trunk, (sign * 0.27, hand_y, 0.06), Vector((sign * 0.9, 0.35, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((sign, 0.5, 0)), curl=5)
        return pose
    return clip


def smr_piriformis(phase):
    pose = Pose()
    pose.phase = phase
    shift = 0.06 * math.sin(2 * math.pi * phase)
    trunk = rot_x(-20)
    pose.props['prop_foam_roller'] = (Vector((0, 0.3, ROLLER_RADIUS)), NOTHING_HELD)
    apply_spine(pose, (0, 0.28 + shift, 0.26), rot_x(-18), trunk, trunk, rot_x(-6), rot_x(0))
    apply_leg(pose, '_r', (-0.16, -0.22 + shift, ANKLE_Z), rot_z(-8), Vector((-0.15, -0.3, 1)))
    knee = pose.head['shin_r']
    apply_leg(pose, '_l', (knee.x + 0.08, knee.y - 0.02, knee.z + 0.1), rot_x(-70) @ rot_z(60), Vector((0.9, 0.1, 0.5)))
    for side, sign in SIDES:
        floor_hands_back(pose, side, sign, trunk)
    return pose


def smr_prone(near, far, thick_near, thick_far):
    """Face down on planted forearms, the straight legs resting on a roller that runs from `near` to `far` along them (metres from the hip)."""
    slope = math.radians(6)
    trunk = rot_x(82)

    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = 0.5 - 0.5 * math.cos(2 * math.pi * phase)
        along = lerp(near, far, t)
        # The front of the thigh rests on top of the roller, wherever along it the roller is.
        hip_y, hip_z = -along * math.cos(slope), ROLLER_RADIUS * 2 + lerp(thick_near, thick_far, t) + along * math.sin(slope)
        joint_y, joint_z = hip_joint(0, 0, 82)
        pose.props['prop_foam_roller'] = (Vector((0, 0, ROLLER_RADIUS)), NOTHING_HELD)
        apply_spine(pose, (0, hip_y - joint_y, hip_z - joint_z), trunk, trunk, trunk, rot_x(58), rot_x(35))
        elbow_y = -(near + far) / 2 - 0.74
        for side, sign in SIDES:
            apply_leg(pose, side, (sign * 0.1, hip_y + STRAIGHT_LEG * math.cos(slope), hip_z - STRAIGHT_LEG * math.sin(slope)), FOOT_POINTED_BACK, Vector((sign * 0.03, 0, -1)))
            apply_arm(pose, side, trunk, (sign * 0.2, elbow_y, 0.08), Vector((sign * 0.25, 0.15, -1)), Vector((0, 0, -1)), hand_dir=Vector((-sign * 0.1, -1, 0)), curl=15)
        return pose
    return clip


def smr_adductor(phase):
    pose = Pose()
    pose.phase = phase
    shift = 0.08 * math.sin(2 * math.pi * phase)
    trunk = rot_x(84)
    pose.props['prop_foam_roller'] = (Vector((0.42 + shift, 0.45, ROLLER_RADIUS)), rot_z(90))
    apply_spine(pose, (shift, 0.05, 0.2), trunk, trunk, trunk, rot_x(58), rot_x(35))
    apply_leg(pose, '_l', (0.72 + shift, 0.38, 0.12), rot_x(120) @ rot_z(60), Vector((0.9, -0.3, -0.1)))
    apply_leg(pose, '_r', (-0.1 + shift, 0.85, 0.1), FOOT_POINTED_BACK, Vector((-0.03, 0, -1)))
    for side, sign in SIDES:
        forearm_on_floor(pose, side, sign, trunk)
    return pose


def smr_side(near, far, thick_near, thick_far):
    """On the left side with hands and top foot planted, the straight lower leg on a roller that runs from `near` to `far` along it (metres from the hip)."""
    slope = math.radians(6)
    body = rot_y(90) @ rot_x(-90)
    joint = body @ (Vector(REST['thigh_l'][0]) - Vector(REST['hips'][0]))
    roller_y = SMR_HIPS_Y - (near + far) / 2

    def clip(phase):
        pose = Pose()
        pose.phase = phase
        t = 0.5 - 0.5 * math.cos(2 * math.pi * phase)
        along = lerp(near, far, t)
        # The side of the leg rests on top of the roller, wherever along it the roller is.
        hip_y, hip_z = roller_y + along * math.cos(slope), ROLLER_RADIUS * 2 + lerp(thick_near, thick_far, t) + along * math.sin(slope)
        hips = Vector((-joint.x, hip_y - joint.y, hip_z - joint.z))
        # The roller sits to the back, so the top foot can plant in front of it.
        pose.props['prop_foam_roller'] = (Vector((-0.2, roller_y, ROLLER_RADIUS)), NOTHING_HELD)
        apply_spine(pose, hips, body, body, body, body @ rot_x(6), body @ rot_x(6))
        apply_leg(pose, '_l', (0, hip_y - STRAIGHT_LEG * math.cos(slope), hip_z - STRAIGHT_LEG * math.sin(slope)), body, Vector((0.6, 0, 0.1)))
        apply_leg(pose, '_r', (0.34, SMR_HIPS_Y - 0.42, ANKLE_Z), rot_z(50), Vector((0.8, -0.4, 0.5)))
        apply_arm(pose, '_l', body, (0.3, SMR_HIPS_Y + 0.6, 0.06), Vector((-0.2, 0.6, -0.4)), Vector((0, 0, -1)), hand_dir=Vector((1, 0.2, 0)), curl=8)
        apply_arm(pose, '_r', body, (0.3, SMR_HIPS_Y + 0.48, 0.06), Vector((0.3, 0.5, 1)), Vector((0, 0, -1)), hand_dir=Vector((1, 0, 0)), curl=5)
        return pose
    return clip


def smr_shin(phase):
    """Sitting with the knees up, both hands rolling along the outside of one shin."""
    pose = Pose()
    pose.phase = phase
    trunk = rot_x(14)
    apply_spine(pose, (0, 0.2, 0.14), rot_x(4), trunk, trunk, rot_x(8), rot_x(4))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.15, -0.26, ANKLE_Z), rot_z(sign * 8), Vector((sign * 0.2, -0.3, 1)))
    z = lerp(0.15, 0.35, ease(phase))
    point = pose.point_on('shin_l', (0.11, -0.03, z))
    apply_arm(pose, '_l', trunk, point + Vector((0.03, 0, 0)), Vector((1, 0.1, 0)), Vector((-1, 0, 0)), curl=60)
    apply_arm(pose, '_r', trunk, point + Vector((-0.1, -0.05, 0)), Vector((-0.3, -0.5, -0.6)), Vector((1, 0, 0)), curl=60)
    return pose


def smr_foot(phase):
    pose = Pose()
    pose.phase = phase
    pose.props['prop_stool'] = (ORIGIN, NOTHING_HELD)
    trunk = rot_x(2)
    apply_spine(pose, (0, 0.03, 0.59), trunk, trunk, trunk, rot_x(0), rot_x(0))
    roll = 0.06 * math.sin(2 * math.pi * phase)
    apply_leg(pose, '_l', (0.13, -0.32 + roll, 0.11 + ROLLER_RADIUS * 0.6), rot_z(8), Vector((0.1, -1, 0.3)))
    apply_leg(pose, '_r', (-0.15, -0.3, ANKLE_Z), rot_z(-8), Vector((-0.1, -1, 0.3)))
    pose.props['prop_foam_roller'] = (Vector((0.13, -0.37, ROLLER_RADIUS * 0.6)), NOTHING_HELD)
    for side, sign in SIDES:
        hand_on_thigh(pose, side, sign, trunk)
    return pose


STEP_FOOT = (0.12, -0.42, FOOT_ON_BOX, 0)
# A foot rises in front of the box, with its toes clear of it, before it travels over the top.
FOOT_OVER_BOX = (0.12, -0.08, 0.62, 20)
FOOT_BEFORE_BOX = (0.12, -0.03, 0.28, 25)
STEP_UP_KEYS = (
    stood(0.0, width=0.12),
    key(0.09, (-0.02, 0.86), 6, FOOT_OVER_BOX, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.18, (-0.03, 0.85), 8, STEP_FOOT, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.32, (-0.25, 1.1), 12, STEP_FOOT, FOOT_BEFORE_BOX),
    key(0.39, (-0.34, 1.22), 8, STEP_FOOT, FOOT_OVER_BOX),
    stood(0.46, y=-0.46, floor=BOX_TOP, width=0.12),
    stood(0.54, y=-0.46, floor=BOX_TOP, width=0.12),
    key(0.61, (-0.34, 1.22), 8, STEP_FOOT, FOOT_OVER_BOX),
    key(0.68, (-0.25, 1.1), 12, STEP_FOOT, FOOT_BEFORE_BOX),
    key(0.82, (-0.03, 0.85), 8, STEP_FOOT, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.91, (-0.02, 0.86), 6, FOOT_OVER_BOX, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    stood(1.0, width=0.12),
)
KNEE_UP = (0.12, -0.72, FOOT_ON_BOX + 0.3, -5)
STEP_UP_KNEE_KEYS = (
    stood(0.0, width=0.12),
    key(0.09, (-0.02, 0.86), 6, FOOT_OVER_BOX, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.18, (-0.03, 0.85), 8, STEP_FOOT, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.32, (-0.25, 1.1), 12, STEP_FOOT, FOOT_BEFORE_BOX),
    key(0.4, (-0.34, 1.24), 6, STEP_FOOT, FOOT_OVER_BOX),
    key(0.48, (-0.42, 1.33), 0, STEP_FOOT, KNEE_UP),
    key(0.56, (-0.42, 1.33), 0, STEP_FOOT, KNEE_UP),
    key(0.63, (-0.34, 1.24), 6, STEP_FOOT, FOOT_OVER_BOX),
    key(0.7, (-0.25, 1.1), 12, STEP_FOOT, FOOT_BEFORE_BOX),
    key(0.82, (-0.03, 0.85), 8, STEP_FOOT, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    key(0.91, (-0.02, 0.86), 6, FOOT_OVER_BOX, (0.12, ANKLE_Y, ANKLE_Z, 0)),
    stood(1.0, width=0.12),
)
HIP_ADDUCT_KEYS = (
    key(0.0, (0.02, 0.03, 0.87), 0, (0.38, ANKLE_Y, ANKLE_Z + 0.03, 3), (0.1, ANKLE_Y, ANKLE_Z, 0)),
    key(0.5, (0.02, 0.03, 0.87), 0, (-0.14, ANKLE_Y - 0.1, ANKLE_Z + 0.05, 3), (0.1, ANKLE_Y, ANKLE_Z, 0)),
    key(1.0, (0.02, 0.03, 0.87), 0, (0.38, ANKLE_Y, ANKLE_Z + 0.03, 3), (0.1, ANKLE_Y, ANKLE_Z, 0)),
)
_STANCE = (0.2, ANKLE_Y, ANKLE_Z, 0)
MONSTER_KEYS = (
    key(0.0, (0.1, 0.77), 16, _STANCE),
    key(0.25, (0.1, 0.77), 16, (0.2, ANKLE_Y - 0.16, ANKLE_Z + 0.06, -4), (0.2, ANKLE_Y + 0.08, ANKLE_Z, 0)),
    key(0.5, (0.1, 0.77), 16, _STANCE),
    key(0.75, (0.1, 0.77), 16, (0.2, ANKLE_Y + 0.08, ANKLE_Z, 0), (0.2, ANKLE_Y - 0.16, ANKLE_Z + 0.06, -4)),
    key(1.0, (0.1, 0.77), 16, _STANCE),
)
SKIP_KEYS = (
    key(0.0, (0.03, 0.87), 4, (0.11, ANKLE_Y, ANKLE_Z, 0), (0.11, 0.2, 0.2, 40)),
    key(0.12, (0.03, 0.98), 4, (0.11, 0.1, ANKLE_Z + 0.1, 25), (0.11, -0.3, 0.55, 0)),
    key(0.25, (0.03, 0.87), 4, (0.11, ANKLE_Y, ANKLE_Z, 0), (0.11, -0.05, 0.28, 10)),
    key(0.5, (0.03, 0.87), 4, (0.11, 0.2, 0.2, 40), (0.11, ANKLE_Y, ANKLE_Z, 0)),
    key(0.62, (0.03, 0.98), 4, (0.11, -0.3, 0.55, 0), (0.11, 0.1, ANKLE_Z + 0.1, 25)),
    key(0.75, (0.03, 0.87), 4, (0.11, -0.05, 0.28, 10), (0.11, ANKLE_Y, ANKLE_Z, 0)),
    key(1.0, (0.03, 0.87), 4, (0.11, ANKLE_Y, ANKLE_Z, 0), (0.11, 0.2, 0.2, 40)),
)
_FRONT_LOW = (0.13, -0.42, ANKLE_Z, 0)
_REAR_LOW = (0.11, 0.42, ANKLE_Z + 0.05, 40)
SPLIT_JUMP_KEYS = (
    key(0.0, (0.03, 0.52), 8, _FRONT_LOW, _REAR_LOW),
    key(0.14, (0.03, 0.8), 2, (0.13, -0.25, ANKLE_Z, 10), (0.11, 0.3, ANKLE_Z + 0.05, 40)),
    key(0.25, (0.03, 1.05), 0, (0.13, -0.05, 0.3, 20), (0.11, 0.0, 0.3, 20)),
    key(0.36, (0.03, 0.8), 2, (0.11, 0.3, ANKLE_Z + 0.05, 40), (0.13, -0.25, ANKLE_Z, 10)),
    key(0.5, (0.03, 0.52), 8, _REAR_LOW, _FRONT_LOW),
    key(0.64, (0.03, 0.8), 2, (0.11, 0.3, ANKLE_Z + 0.05, 40), (0.13, -0.25, ANKLE_Z, 10)),
    key(0.75, (0.03, 1.05), 0, (0.11, 0.0, 0.3, 20), (0.13, -0.05, 0.3, 20)),
    key(0.86, (0.03, 0.8), 2, (0.13, -0.25, ANKLE_Z, 10), (0.11, 0.3, ANKLE_Z + 0.05, 40)),
    key(1.0, (0.03, 0.52), 8, _FRONT_LOW, _REAR_LOW),
)
_BOX_Y = -0.46
_STEP_DOWN_L = (0.13, _BOX_Y + 0.04, FOOT_ON_BOX, 0)
BOX_JUMP_KEYS = (
    stood(0.0),
    stood(0.12, dip=0.2),
    stood(0.22, y=-0.06, air=0.25, tilt=30, lean=2),
    stood(0.32, y=-0.18, air=0.55, lean=8),
    stood(0.42, y=_BOX_Y, floor=BOX_TOP, dip=0.22),
    stood(0.54, y=_BOX_Y, floor=BOX_TOP),
    stood(0.6, y=_BOX_Y, floor=BOX_TOP),
    key(0.67, (-0.36, 1.22), 6, _STEP_DOWN_L, FOOT_OVER_BOX),
    key(0.74, (-0.25, 1.1), 6, _STEP_DOWN_L, FOOT_BEFORE_BOX),
    key(0.86, (-0.03, 0.84), 4, _STEP_DOWN_L, (0.13, ANKLE_Y, ANKLE_Z, 0)),
    key(0.93, (-0.02, 0.86), 6, FOOT_OVER_BOX, (0.13, ANKLE_Y, ANKLE_Z, 0)),
    stood(1.0),
)
_ON_STOOL = (0.32, 0.59)
SEATED_BOX_JUMP_KEYS = (
    key(0.0, _ON_STOOL, 0, (0.15, -0.06, ANKLE_Z, 0)),
    key(0.12, (0.24, 0.62), 28, (0.15, 0.04, ANKLE_Z, 0)),
    key(0.24, (0.02, 0.98), 4, (0.13, -0.02, 0.28, 25)),
    key(0.34, (-0.2, 1.18), 6, (0.13, -0.13, 0.68, 10)),
    stood(0.44, y=_BOX_Y, floor=BOX_TOP, dip=0.2),
    stood(0.58, y=_BOX_Y, floor=BOX_TOP),
    key(0.65, (-0.36, 1.22), 6, _STEP_DOWN_L, FOOT_OVER_BOX),
    key(0.72, (-0.25, 1.1), 6, _STEP_DOWN_L, FOOT_BEFORE_BOX),
    key(0.79, (-0.02, 0.95), 8, FOOT_OVER_BOX, (0.15, 0.02, ANKLE_Z, 0)),
    key(0.86, (0.24, 0.8), 8, (0.15, -0.04, ANKLE_Z, 0)),
    key(1.0, _ON_STOOL, 0, (0.15, -0.06, ANKLE_Z, 0)),
)
_HIGH_Y = 0.42
DEPTH_JUMP_KEYS = (
    stood(0.0, y=_HIGH_Y, floor=BOX_TOP),
    stood(0.1, y=_HIGH_Y - 0.1, floor=BOX_TOP, air=0.05, tilt=20, lean=0),
    stood(0.2, y=0.12, floor=0.0, air=0.28, lean=2, tilt=10),
    stood(0.3, y=0.0, dip=0.22),
    stood(0.42, y=-0.06, air=0.05, tilt=30, lean=0),
    stood(0.52, y=-0.14, air=0.42, tilt=20, lean=0),
    stood(0.62, y=-0.2, dip=0.18),
    stood(0.72, y=-0.1),
    key(0.78, (0.0, 0.92), 8, (0.13, 0.12, 0.62, 55), (0.13, -0.05, ANKLE_Z, 0)),
    key(0.84, (0.3, 0.98), 14, (0.13, _HIGH_Y, FOOT_ON_BOX, 0), (0.13, 0.1, ANKLE_Z, 30)),
    key(0.92, (0.34, 1.22), 8, (0.13, _HIGH_Y, FOOT_ON_BOX, 0), (0.13, 0.3, 0.62, 55)),
    stood(1.0, y=_HIGH_Y, floor=BOX_TOP),
)
_LEFT_ON = (0.12, -0.38, FOOT_ON_BOX, 0)
_RIGHT_DOWN = (0.12, 0.06, ANKLE_Z, 0)
BOX_SWITCH_KEYS = (
    key(0.0, (-0.1, 0.92), 8, _LEFT_ON, _RIGHT_DOWN),
    key(0.13, (-0.14, 1.18), 3, (0.12, -0.38, FOOT_ON_BOX + 0.02, 25), (0.12, -0.05, 0.28, 30)),
    key(0.25, (-0.14, 1.28), 0, (0.12, -0.2, 0.62, 15), (0.12, -0.2, 0.62, 15)),
    key(0.37, (-0.14, 1.18), 3, (0.12, -0.05, 0.28, 30), (0.12, -0.38, FOOT_ON_BOX + 0.02, 25)),
    key(0.5, (-0.1, 0.92), 8, _RIGHT_DOWN, _LEFT_ON),
    key(0.63, (-0.14, 1.18), 3, (0.12, -0.05, 0.28, 30), (0.12, -0.38, FOOT_ON_BOX + 0.02, 25)),
    key(0.75, (-0.14, 1.28), 0, (0.12, -0.2, 0.62, 15), (0.12, -0.2, 0.62, 15)),
    key(0.87, (-0.14, 1.18), 3, (0.12, -0.38, FOOT_ON_BOX + 0.02, 25), (0.12, -0.05, 0.28, 30)),
    key(1.0, (-0.1, 0.92), 8, _LEFT_ON, _RIGHT_DOWN),
)
BOX_PUSH_KEYS = (
    key(0.0, (-0.1, 0.92), 8, _LEFT_ON, _RIGHT_DOWN),
    key(0.15, (-0.14, 1.25), 3, (0.12, -0.38, FOOT_ON_BOX + 0.02, 25), (0.12, -0.05, 0.3, 30)),
    key(0.32, (-0.3, 1.55), 0, (0.12, -0.3, 0.75, 20), (0.12, -0.45, 0.8, 0)),
    key(0.5, (-0.14, 1.25), 3, (0.12, -0.38, FOOT_ON_BOX + 0.02, 25), (0.12, -0.05, 0.3, 30)),
    key(0.7, (-0.1, 0.92), 8, _LEFT_ON, _RIGHT_DOWN),
    key(1.0, (-0.1, 0.92), 8, _LEFT_ON, _RIGHT_DOWN),
)
_SHUFFLE_ON = (0.26, 0.04, FOOT_ON_BOX, 0)
_SHUFFLE_OFF = (0.18, 0.04, ANKLE_Z, 0)
BOX_SHUFFLE_KEYS = (
    key(0.0, (0.06, 0.04, 0.96), 4, _SHUFFLE_ON, _SHUFFLE_OFF, shift=-0.26),
    key(0.13, (0.03, 0.04, 1.2), 2, (0.22, 0.04, FOOT_ON_BOX + 0.02, 25), (0.18, 0.04, 0.3, 25), shift=-0.16),
    key(0.25, (0.0, 0.04, 1.38), 0, (0.2, 0.04, 0.68, 20), (0.2, 0.04, 0.68, 20), shift=0.0),
    key(0.37, (-0.03, 0.04, 1.2), 2, (0.18, 0.04, 0.3, 25), (0.22, 0.04, FOOT_ON_BOX + 0.02, 25), shift=0.16),
    key(0.5, (-0.06, 0.04, 0.96), 4, _SHUFFLE_OFF, _SHUFFLE_ON, shift=0.26),
    key(0.63, (-0.03, 0.04, 1.2), 2, (0.18, 0.04, 0.3, 25), (0.22, 0.04, FOOT_ON_BOX + 0.02, 25), shift=0.16),
    key(0.75, (0.0, 0.04, 1.38), 0, (0.2, 0.04, 0.68, 20), (0.2, 0.04, 0.68, 20), shift=0.0),
    key(0.87, (0.03, 0.04, 1.2), 2, (0.22, 0.04, FOOT_ON_BOX + 0.02, 25), (0.18, 0.04, 0.3, 25), shift=-0.16),
    key(1.0, (0.06, 0.04, 0.96), 4, _SHUFFLE_ON, _SHUFFLE_OFF, shift=-0.26),
)
BOX_SIDE_KEYS = (
    stood(0.0, shift=-0.1),
    stood(0.12, dip=0.2, shift=-0.1),
    stood(0.22, air=0.3, tilt=30, lean=2, shift=-0.08),
    stood(0.32, air=0.58, lean=6, shift=0.12),
    stood(0.42, floor=BOX_TOP, dip=0.22, shift=0.42),
    stood(0.56, floor=BOX_TOP, shift=0.42),
    stood(0.62, floor=BOX_TOP, shift=0.42),
    key(0.76, (0.0, 0.03, 1.1), 6, (0.13, ANKLE_Y, FOOT_ON_BOX, 0), (0.13, ANKLE_Y, 0.16, 25), shift=0.2),
    key(0.88, (0.0, 0.03, 0.86), 2, (0.13, ANKLE_Y, 0.52, 40), (0.13, ANKLE_Y, ANKLE_Z, 0), shift=0.0),
    stood(1.0, shift=-0.1),
)
LONG_JUMP_KEYS = (
    stood(0.0, y=0.5),
    stood(0.14, y=0.5, dip=0.22),
    stood(0.25, y=0.28, air=0.12, tilt=30, lean=14),
    stood(0.36, y=0.0, air=0.44, left=(0.13, -0.05, 0.62, 5), lean=18),
    stood(0.46, y=-0.42, dip=0.26),
    stood(0.58, y=-0.42),
    stood(0.64, y=-0.42),
    key(0.76, (-0.12, 0.86), 2, (0.13, -0.38, ANKLE_Z, 0), (0.13, -0.06, 0.15, 25)),
    key(0.88, (0.24, 0.86), 2, (0.13, 0.18, 0.15, 25), (0.13, 0.26, ANKLE_Z, 0)),
    stood(1.0, y=0.5),
)
SIDE_JUMP_KEYS = (
    stood(0.0, shift=-0.5),
    stood(0.14, dip=0.2, shift=-0.5),
    stood(0.25, air=0.1, tilt=30, lean=4, shift=-0.3),
    stood(0.36, air=0.4, left=(0.13, ANKLE_Y, 0.56, 10), lean=6, shift=0.05),
    stood(0.46, dip=0.24, shift=0.45),
    stood(0.58, shift=0.45),
    stood(0.64, shift=0.45),
    stood(0.76, shift=0.2, dip=0.03, left=(0.13, ANKLE_Y, ANKLE_Z + 0.09, 15), right=(0.13, ANKLE_Y, ANKLE_Z, 0)),
    stood(0.88, shift=-0.2, dip=0.03, left=(0.13, ANKLE_Y, ANKLE_Z, 0), right=(0.13, ANKLE_Y, ANKLE_Z + 0.09, 15)),
    stood(1.0, shift=-0.5),
)
FROG_KEYS = (
    stood(0.0, y=0.35, dip=0.42, lean=18, width=0.2),
    stood(0.14, y=0.25, air=0.05, tilt=30, lean=8, width=0.17),
    stood(0.26, y=0.0, air=0.28, tilt=20, lean=8, width=0.17),
    stood(0.4, y=-0.35, dip=0.42, lean=18, width=0.2),
    stood(0.5, y=-0.35, dip=0.42, lean=18, width=0.2),
    stood(0.64, y=-0.25, air=0.05, tilt=30, lean=8, width=0.17),
    stood(0.76, y=0.0, air=0.28, tilt=20, lean=8, width=0.17),
    stood(0.9, y=0.35, dip=0.42, lean=18, width=0.2),
    stood(1.0, y=0.35, dip=0.42, lean=18, width=0.2),
)
_LAND_R = (0.12, ANKLE_Y, ANKLE_Z, 0)
_TRAIL = (0.02, ANKLE_Y + 0.14, 0.2, 40)
BOUND_KEYS = (
    key(0.0, (0.1, 0.1, 0.72), 22, (0.12, ANKLE_Y, ANKLE_Z, 0), _TRAIL, shift=0.42),
    key(0.15, (0.04, 0.05, 0.92), 8, (0.12, ANKLE_Y, ANKLE_Z + 0.08, 30), (0.12, ANKLE_Y + 0.05, 0.28, 30), shift=0.3),
    key(0.25, (0.0, 0.03, 1.12), 4, (0.12, ANKLE_Y, 0.34, 20), (0.12, ANKLE_Y, 0.34, 20), shift=0.0),
    key(0.36, (-0.04, 0.05, 0.92), 8, (0.12, ANKLE_Y + 0.05, 0.28, 30), (0.12, ANKLE_Y, ANKLE_Z + 0.08, 30), shift=-0.3),
    key(0.5, (-0.1, 0.1, 0.72), 22, _TRAIL, (0.12, ANKLE_Y, ANKLE_Z, 0), shift=-0.42),
    key(0.65, (-0.04, 0.05, 0.92), 8, (0.12, ANKLE_Y + 0.05, 0.28, 30), (0.12, ANKLE_Y, ANKLE_Z + 0.08, 30), shift=-0.3),
    key(0.75, (0.0, 0.03, 1.12), 4, (0.12, ANKLE_Y, 0.34, 20), (0.12, ANKLE_Y, 0.34, 20), shift=0.0),
    key(0.86, (0.04, 0.05, 0.92), 8, (0.12, ANKLE_Y, ANKLE_Z + 0.08, 30), (0.12, ANKLE_Y + 0.05, 0.28, 30), shift=0.3),
    key(1.0, (0.1, 0.1, 0.72), 22, (0.12, ANKLE_Y, ANKLE_Z, 0), _TRAIL, shift=0.42),
)
BOUND_DIAGONAL_KEYS = (
    key(0.0, (0.1, 0.32, 0.74), 20, (0.12, 0.3, ANKLE_Z, 0), (0.05, 0.5, 0.22, 45), shift=0.3),
    key(0.15, (0.04, 0.2, 0.92), 10, (0.12, 0.25, ANKLE_Z + 0.08, 30), (0.1, 0.02, 0.48, 10), shift=0.2),
    key(0.25, (0.0, 0.03, 1.16), 8, (0.12, 0.28, 0.52, 45), (0.12, -0.28, 0.72, 0), shift=0.0),
    key(0.36, (-0.04, -0.14, 0.92), 10, (0.1, 0.1, 0.22, 30), (0.12, -0.2, ANKLE_Z + 0.08, 0), shift=-0.2),
    key(0.5, (-0.1, -0.3, 0.74), 20, (0.05, -0.12, 0.22, 45), (0.12, -0.3, ANKLE_Z, 0), shift=-0.3),
    key(0.65, (-0.04, -0.14, 0.92), 10, (0.1, -0.02, 0.48, 10), (0.12, -0.2, ANKLE_Z + 0.08, 30), shift=-0.2),
    key(0.75, (0.0, 0.03, 1.16), 8, (0.12, -0.28, 0.72, 0), (0.12, 0.28, 0.52, 45), shift=0.0),
    key(0.86, (0.04, 0.2, 0.92), 10, (0.12, 0.25, ANKLE_Z + 0.08, 0), (0.1, 0.1, 0.22, 30), shift=0.2),
    key(1.0, (0.1, 0.32, 0.74), 20, (0.12, 0.3, ANKLE_Z, 0), (0.05, 0.5, 0.22, 45), shift=0.3),
)
_CROSS_BEHIND = (-0.1, ANKLE_Y + 0.18, ANKLE_Z, 15)
_CROSS_FRONT = (-0.1, ANKLE_Y - 0.18, ANKLE_Z, 0)
CARIOCA_KEYS = (
    key(0.0, (0.03, 0.82), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), shift=-0.32),
    key(0.2, (0.03, 0.81), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), _CROSS_BEHIND, shift=-0.18),
    key(0.4, (0.03, 0.82), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), shift=-0.04),
    key(0.6, (0.03, 0.81), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), (-0.1, ANKLE_Y - 0.25, 0.4, -5), shift=0.1),
    key(0.8, (0.03, 0.82), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), shift=0.32),
    key(0.9, (0.03, 0.84), 6, (0.15, ANKLE_Y, ANKLE_Z + 0.06, 10), (0.15, ANKLE_Y, ANKLE_Z, 0), shift=0.0),
    key(1.0, (0.03, 0.82), 8, (0.15, ANKLE_Y, ANKLE_Z, 0), shift=-0.32),
)
SNATCH_BALANCE_KEYS = (
    stood(0.0, width=0.17),
    stood(0.15, dip=0.08, lean=2, width=0.17),
    stood(0.27, air=0.04, tilt=25, lean=0, width=0.17),
    stood(0.5, dip=0.36, lean=12, width=0.2),
    stood(0.56, dip=0.36, lean=12, width=0.2),
    stood(0.72, lean=0, width=0.17),
    stood(1.0, width=0.17),
)
_SUMO = (0.34, ANKLE_Y, ANKLE_Z, 0)
SUMO_KEYS = (key(0.0, (0.3, 0.52), 44, _SUMO), key(0.5, (0.03, 0.85), 0, _SUMO), key(1.0, (0.3, 0.52), 44, _SUMO))
_TRAP = (0.14, ANKLE_Y, ANKLE_Z, 0)
TRAP_KEYS = (key(0.0, (0.2, 0.5), 30, _TRAP), key(0.5, (0.03, 0.885), 0, _TRAP), key(1.0, (0.2, 0.5), 30, _TRAP))
ONE_SIDE_DEADLIFT_KEYS = (key(0.0, (0.0, 0.14, 0.53), 26, _TRAP), key(0.5, (0, 0.03, 0.885), 0, _TRAP), key(1.0, (0.0, 0.14, 0.53), 26, _TRAP))
_DEFICIT = (0.12, ANKLE_Y, PLATFORM + ANKLE_Z, 0)
RDL_DEFICIT_KEYS = (key(0.0, (0.03, PLATFORM + 0.865), 2, _DEFICIT), key(0.5, (0.3, PLATFORM + 0.79), 72, _DEFICIT), key(1.0, (0.03, PLATFORM + 0.865), 2, _DEFICIT))
_WIDE = (0.32, ANKLE_Y, ANKLE_Z, 0)
WIDE_STIFF_KEYS = (key(0.0, (0.3, 0.76), 74, _WIDE), key(0.5, (0.03, 0.85), 0, _WIDE), key(1.0, (0.3, 0.76), 74, _WIDE))
_ONE_LEG_FOOT = (0.08, ANKLE_Y, ANKLE_Z, 0)
ONE_LEG_DEADLIFT_KEYS = (
    key(0.0, (0.03, 0.87), 0, _ONE_LEG_FOOT, (0.1, 0.1, 0.2, 18)),
    key(0.5, (0.17, 0.82), 78, _ONE_LEG_FOOT, (0.1, 0.92, 0.72, 100)),
    key(1.0, (0.03, 0.87), 0, _ONE_LEG_FOOT, (0.1, 0.1, 0.2, 18)),
)
GOOD_MORNING_BAND_KEYS = (key(0.0, (0.03, 0.87), 0, (0.1, ANKLE_Y, ANKLE_Z, 0)), key(0.5, (0.2, 0.82), 78, (0.1, ANKLE_Y, ANKLE_Z, 0)), key(1.0, (0.03, 0.87), 0, (0.1, ANKLE_Y, ANKLE_Z, 0)))
KNEELING_JUMP_KEYS = (
    key(0.0, (0.47, 0.34), 24, (0.12, 0.46, 0.09, 150)),
    key(0.2, (0.24, 0.62), 22, (0.14, 0.3, 0.2, 80)),
    key(0.34, (0.2, 0.62), 26, (0.14, 0.1, ANKLE_Z, 0)),
    key(0.6, (0.03, 0.885), 0, (0.14, ANKLE_Y, ANKLE_Z, 0)),
    key(0.74, (0.2, 0.62), 26, (0.14, 0.1, ANKLE_Z, 0)),
    key(0.88, (0.36, 0.48), 22, (0.14, 0.34, 0.12, 110)),
    key(1.0, (0.47, 0.34), 24, (0.12, 0.46, 0.09, 150)),
)
_LEG_UP_FROM = (0.1, 0.0, 0.76, -158)
_LEG_UP_TO = (0.1, 0.12, 0.78, -178)
LEG_UP_KEYS = (supine(0.0, left=_LEG_UP_FROM, right=FLAT_FOOT), supine(0.5, left=_LEG_UP_TO, right=FLAT_FOOT), supine(1.0, left=_LEG_UP_FROM, right=FLAT_FOOT))
_NINETY_BENT = (0.1, -0.22, 0.45, -90)
_NINETY_STRAIGHT = (0.1, 0.1, 0.8, -176)
NINETY_KEYS = (supine(0.0, left=_NINETY_BENT, right=FLAT_FOOT), supine(0.5, left=_NINETY_STRAIGHT, right=FLAT_FOOT), supine(1.0, left=_NINETY_BENT, right=FLAT_FOOT))
_KNEE_AT = (0.12, -0.16, 0.55, -110)
_KNEE_IN = (0.12, -0.05, 0.62, -125)
KNEE_CHEST_KEYS = (supine(0.0, left=_KNEE_AT, right=FLAT_FOOT), supine(0.5, left=_KNEE_IN, right=FLAT_FOOT), supine(1.0, left=_KNEE_AT, right=FLAT_FOOT))
_ON_KNEE = (-0.02, -0.12, 0.64, -70)
_UNDER = (0.1, -0.18, 0.6, -110)
_UNDER_IN = (0.1, -0.05, 0.68, -125)
ANKLE_KNEE_KEYS = (supine(0.0, left=(-0.02, -0.15, 0.62, -70), right=_UNDER), supine(0.5, left=(-0.02, -0.03, 0.72, -70), right=_UNDER_IN), supine(1.0, left=(-0.02, -0.15, 0.62, -70), right=_UNDER))
_ACROSS_A = (-0.18, -0.28, 0.2, -75)
_ACROSS_B = (-0.42, -0.32, 0.1, -75)
KNEE_ACROSS_KEYS = (supine(0.0, left=_ACROSS_A, right=FLAT_FOOT), supine(0.5, left=_ACROSS_B, right=FLAT_FOOT), supine(1.0, left=_ACROSS_A, right=FLAT_FOOT))
LEG_ACROSS_KEYS = (supine(0.0, left=(-0.34, -0.42, 0.4, -105), right=FLAT_FOOT), supine(0.5, left=(-0.56, -0.28, 0.2, -105), right=FLAT_FOOT), supine(1.0, left=(-0.34, -0.42, 0.4, -105), right=FLAT_FOOT))
WINDMILL_KEYS = (
    supine(0.0),
    supine(0.25, left=(-0.62, 0.0, 0.2, -130), right=FLAT_FOOT),
    supine(0.5),
    supine(0.75, left=FLAT_FOOT, right=(-0.62, 0.0, 0.2, -130)),
    supine(1.0),
)
GROIN_BELT_KEYS = (supine(0.0, left=(0.5, -0.46, 0.09, -85), right=FLAT_FOOT), supine(0.5, left=(0.7, -0.3, 0.09, -85), right=FLAT_FOOT), supine(1.0, left=(0.5, -0.46, 0.09, -85), right=FLAT_FOOT))
LEGS_V_KEYS = (supine(0.0, left=(0.2, 0.1, 0.8, -175)), supine(0.5, left=(0.6, 0.1, 0.5, -175)), supine(1.0, left=(0.2, 0.1, 0.8, -175)))
_SOLES = (0.06, SUPINE_Y - 0.45, 0.13, -30)
BUTTERFLY_SUPINE_KEYS = (supine(0.0, left=(0.06, SUPINE_Y - 0.42, 0.13, -30)), supine(0.5, left=(0.06, SUPINE_Y - 0.48, 0.12, -30)), supine(1.0, left=(0.06, SUPINE_Y - 0.42, 0.13, -30)))
BENCH_QUAD_KEYS = (
    key(0.0, (0.2, 0.44 + SUPINE_Z), -90, (0.1, -0.18, 0.44 + 0.09, -90 + 40), (0.18, 0.02, 0.32, 110)),
    key(0.5, (0.2, 0.44 + SUPINE_Z), -90, (0.1, -0.18, 0.44 + 0.09, -90 + 40), (0.18, 0.16, 0.32, 135)),
    key(1.0, (0.2, 0.44 + SUPINE_Z), -90, (0.1, -0.18, 0.44 + 0.09, -90 + 40), (0.18, 0.02, 0.32, 110)),
)
_BENT_IN = (0.14, SIT_Y - 0.4, 0.09, -30)
SEATED_ONE_LEG_KEYS = (
    seated_key(0.0, 8, left=SIT_FOOT, right=(-0.1, SIT_Y - 0.44, 0.16, -40), curl=6),
    seated_key(0.5, 50, left=SIT_FOOT, right=(-0.1, SIT_Y - 0.44, 0.16, -40), curl=16),
    seated_key(1.0, 8, left=SIT_FOOT, right=(-0.1, SIT_Y - 0.44, 0.16, -40), curl=6),
)
SEATED_FOLD_KEYS = (seated_key(0.0, 10, curl=6), seated_key(0.5, 56, curl=18), seated_key(1.0, 10, curl=6))
SEATED_LEAN_KEYS = (seated_key(0.0, 4, curl=3), seated_key(0.5, 26, curl=10), seated_key(1.0, 4, curl=3))
SEATED_CALF_KEYS = (
    seated_key(0.0, 22, left=(0.11, SIT_Y - 0.79, 0.09, -86), right=(0.17, SIT_Y - 0.42, ANKLE_Z, 0), curl=8),
    seated_key(0.5, 38, left=(0.11, SIT_Y - 0.79, 0.09, -112), right=(0.17, SIT_Y - 0.42, ANKLE_Z, 0), curl=14),
    seated_key(1.0, 22, left=(0.11, SIT_Y - 0.79, 0.09, -86), right=(0.17, SIT_Y - 0.42, ANKLE_Z, 0), curl=8),
)
_STRADDLE = (0.56, SIT_Y - 0.54, 0.09, -85)
STRADDLE_KEYS = (seated_key(0.0, 10, left=_STRADDLE, curl=5), seated_key(0.5, 46, left=_STRADDLE, curl=14), seated_key(1.0, 10, left=_STRADDLE, curl=5))
_BUTTERFLY = (0.05, SIT_Y - 0.36, 0.12, -28)
GROIN_SEATED_KEYS = (seated_key(0.0, 8, left=_BUTTERFLY, curl=5), seated_key(0.5, 50, left=_BUTTERFLY, curl=22), seated_key(1.0, 8, left=_BUTTERFLY, curl=5))
_GLUTE_SIT_R = (0.15, SIT_Y - 0.42, ANKLE_Z, 0)
_GLUTE_SIT_L = (-0.02, SIT_Y - 0.42, 0.5, -60)
GLUTE_SEATED_KEYS = (key(0.0, (SIT_Y, SIT_Z), -14, _GLUTE_SIT_L, _GLUTE_SIT_R), key(0.5, (SIT_Y, SIT_Z), 8, _GLUTE_SIT_L, _GLUTE_SIT_R), key(1.0, (SIT_Y, SIT_Z), -14, _GLUTE_SIT_L, _GLUTE_SIT_R))
_BENT_SEAT = (0.17, SIT_Y - 0.42, ANKLE_Z, 0)
FOOT_BELT_KEYS_OUT = (seated_key(0.0, 12, left=(0.11, SIT_Y - 0.78, 0.15, -90), right=_BENT_SEAT, curl=6), seated_key(0.5, 16, left=(0.11, SIT_Y - 0.78, 0.15, -105), right=_BENT_SEAT, curl=8), seated_key(1.0, 12, left=(0.11, SIT_Y - 0.78, 0.15, -90), right=_BENT_SEAT, curl=6))
FOOT_BELT_KEYS_IN = (seated_key(0.0, 12, left=(0.09, SIT_Y - 0.78, 0.15, -90), right=_BENT_SEAT, curl=6), seated_key(0.5, 16, left=(0.04, SIT_Y - 0.78, 0.15, -105), right=_BENT_SEAT, curl=8), seated_key(1.0, 12, left=(0.09, SIT_Y - 0.78, 0.15, -90), right=_BENT_SEAT, curl=6))
_CHAIR_DOWN = (0.15, -0.36, ANKLE_Z, 0)
CHAIR_LEG_KEYS = (
    key(0.0, (0.03, 0.59), -3, _CHAIR_DOWN),
    key(0.3, (0.03, 0.59), -3, (0.12, -0.76, 0.5, -82), _CHAIR_DOWN),
    key(0.55, (0.03, 0.59), -3, (0.55, -0.56, 0.5, -82), _CHAIR_DOWN),
    key(0.8, (0.03, 0.59), -3, (0.12, -0.76, 0.5, -82), _CHAIR_DOWN),
    key(1.0, (0.03, 0.59), -3, _CHAIR_DOWN),
)
_PRONE_STRAIGHT = (0.1, 0.9, 0.1, 150)
PRONE_QUAD_KEYS = (prone(0.0, left=prone_bent(angle=95), right=_PRONE_STRAIGHT, lean=72), prone(0.5, left=prone_bent(angle=132), right=_PRONE_STRAIGHT, lean=72), prone(1.0, left=prone_bent(angle=95), right=_PRONE_STRAIGHT, lean=72))
PRONE_QUAD_BELT_KEYS = (prone(0.0, right=prone_bent(angle=95), lean=72), prone(0.5, right=prone_bent(angle=125), lean=72), prone(1.0, right=prone_bent(angle=95), lean=72))
_LOCUST = prone_bent(angle=130)
LOCUST_KEYS = (prone(0.0, right=_LOCUST, lean=72), prone(0.5, right=prone_bent(angle=145, z_knee=0.2), lean=66), prone(1.0, right=_LOCUST, lean=72))
IRON_CROSS_KEYS = (
    prone(0.0),
    prone(0.25, left=(-0.5, 0.08 + 0.3, 0.5, 215)),
    prone(0.5),
    prone(0.75, left=(0.1, 0.9, 0.1, 150), right=(-0.5, 0.38, 0.5, 215)),
    prone(1.0),
)
FLUTTER_KEYS = (
    key(0.0, (0.12, 0.57), 90, (0.1, 0.92, 0.42, 150), (0.1, 0.92, 0.72, 150)),
    key(0.5, (0.12, 0.57), 90, (0.1, 0.92, 0.72, 150), (0.1, 0.92, 0.42, 150)),
    key(1.0, (0.12, 0.57), 90, (0.1, 0.92, 0.42, 150), (0.1, 0.92, 0.72, 150)),
)
_SIDE_DOWN = (0.34, -0.31, 0.09, -90)
SIDE_QUAD_KEYS = (
    side_key(0.0, _SIDE_DOWN, (0.33, 0.2, 0.27, 100)),
    side_key(0.5, _SIDE_DOWN, (0.36, 0.24, 0.3, 125)),
    side_key(1.0, _SIDE_DOWN, (0.33, 0.2, 0.27, 100)),
)
SIDE_GROIN_KEYS = (
    side_key(0.0, _SIDE_DOWN, (-0.05, 0.0, 0.62, -90)),
    side_key(0.5, _SIDE_DOWN, (-0.05, 0.12, 0.86, -90)),
    side_key(1.0, _SIDE_DOWN, (-0.05, 0.0, 0.62, -90)),
)
_KNEES = (0.12, 0.44, 0.09, 150)
KNEELING_ARCH_KEYS = (key(0.0, (0.14, 0.44), -8, _KNEES), key(0.5, (0.03, 0.54), -34, _KNEES), key(1.0, (0.14, 0.44), -8, _KNEES))
_ELEVATED_REAR = (0.08, 0.55, 0.52, 118)
_ELEVATED_FRONT = (0.12, -0.2, ANKLE_Z, 0)
ELEVATED_QUAD_KEYS = (key(0.0, (0.07, 0.8), 2, _ELEVATED_FRONT, _ELEVATED_REAR), key(0.5, (0.03, 0.72), -3, _ELEVATED_FRONT, _ELEVATED_REAR), key(1.0, (0.07, 0.8), 2, _ELEVATED_FRONT, _ELEVATED_REAR))
_HIP_FRONT = (0.11, -0.12, ANKLE_Z, 0)
_HIP_REAR = (0.11, 0.3, ANKLE_Z + 0.05, 40)
STANDING_HIP_KEYS = (key(0.0, (0.1, 0.84), 0, _HIP_FRONT, _HIP_REAR), key(0.5, (0.04, 0.76), -6, _HIP_FRONT, _HIP_REAR), key(1.0, (0.1, 0.84), 0, _HIP_FRONT, _HIP_REAR))
_HAM_FRONT = (0.12, -0.34, ANKLE_Z, -22)
_HAM_REAR = (0.12, 0.12, ANKLE_Z, 0)
STANDING_HAM_KEYS = (key(0.0, (0.13, 0.8), 18, _HAM_FRONT, _HAM_REAR), key(0.5, (0.2, 0.74), 52, _HAM_FRONT, _HAM_REAR), key(1.0, (0.13, 0.8), 18, _HAM_FRONT, _HAM_REAR))
_RUN_FRONT = (0.15, -0.26, ANKLE_Z, 0)
_RUN_REAR = (0.12, 0.72, 0.13, 45)
RUNNER_KEYS = (key(0.0, (0.3, 0.44), 66, _RUN_FRONT, _RUN_REAR), key(0.5, (0.32, 0.58), 86, _RUN_FRONT, _RUN_REAR), key(1.0, (0.3, 0.44), 66, _RUN_FRONT, _RUN_REAR))


FLAT_ONLY_LEFT = (('_l', 1),)
OVERHAND_HANGING = (0, 1, 0)
UNDERHAND_HANGING = (0, -1, 0)
NEUTRAL = (-1, 0, 0)
ROW_POLE = (0.3, 0.8, 0.5)
HANGING_DOWN = (0, 0, -1)
# Row a bent-over barbell to the belly.
BELLY_FROM_SHOULDERS = near(0, 0.14, -0.26)
PULLDOWN_SEAT = stool_seat('prop_pulldown_seat', -10, -22)
# A hand at the side of the ribs, when bent over.
ROWED_TO_RIBS = near(0.03, 0.2, -0.22)
OVER_THE_BAR = (0.18, 0.03)
ELBOWS_OUT_HANGING = (0.85, 0.25, -0.5)
ELBOWS_FORWARD_HANGING = (0.4, -0.75, -0.45)
# Shoulder clips: where a hand starts and ends, from its own shoulder.
SHOULDER_TURN = 28
PALM_DOWN = (0, 0, -1)
FORWARD = (0, -1, 0)
HANGING_BESIDE_DIR = (0.15, -0.02, -1)
HANGING_BESIDE = arm_out(HANGING_BESIDE_DIR, 14)
HANGING_FRONT = arm_out((0.08, -0.22, -1), 14)
RAISED_SIDEWAYS = arm_out((1, -0.08, 0.03), 14)
RAISED_FORWARD = arm_out((0.08, -1, 0.04), 14)
REAR_RAISED = arm_out((1, 0.03, -0.1), 12)
RAISE_POLE = (0.15, 0.75, 0.5)
FRONT_RAISE_POLE = (0.55, 0.2, -0.6)
REAR_RAISE_POLE = (0.75, 0.25, 0.6)
# The same offsets for hand_keys, which takes them as points.
_ARM = arm_span(14, TO_GRIP)
HANG_SIDE = tuple(Vector(HANGING_BESIDE_DIR).normalized() * _ARM)
HANG_FRONT = tuple(Vector((0.08, -0.22, -1)).normalized() * _ARM)
OUT_FRONT = tuple(Vector((0.08, -1, 0.04)).normalized() * _ARM)
OUT_SIDE = tuple(Vector((1, -0.08, 0.03)).normalized() * _ARM)
OUT_OVERHEAD = tuple(Vector((0.05, -0.04, 1)).normalized() * _ARM)
AT_SHOULDER = near(0.13, -0.03, 0.08)
AT_SHOULDER_IN = near(0.02, -0.1, 0.06)
PRESSED_UP = arm_out((0.03, 0.01, 1), 6)
PRESSED_UP_BAR = arm_out((0, 0.02, 1), 6)
PRESS_OUT_POLE = (0.95, -0.1, -0.6)
PRESS_FRONT_POLE = (0.3, -0.7, -0.6)
BY_BELLY = near(-0.24, -0.26, -0.31)
OUT_FROM_ELBOW = near(0.3, -0.2, -0.31)
ELBOW_AT_SIDE_POLE = (0.12, 0.2, -1)
BENCH_UP = (0, -0.574, 0.819)
ALONG_INCLINE = (0, -0.82, 0.57)
BRADFORD_KEYS = (
    (0.0, (-0.15, 0.03)), (0.25, (0.0, 0.2)), (0.5, (0.11, 0.08)), (0.75, (0.0, 0.2)), (1.0, (-0.15, 0.03)),
)
# Keys of whole-body lifts: hips y, hips z, lean, split, hand y, hand z.
BAR_FLOOR = (0.33, 0.6, 56, 0, -0.065, BAR_ON_FLOOR)
BAR_HANG = (0.03, 0.885, 0, 0, -0.095, 0.77)
BAR_CATCH = (0.07, 0.79, 6, 0, -0.17, 1.36)
BAR_RACK = (0.03, 0.885, 0, 0, -0.16, 1.45)
BAR_DIP = (0.05, 0.8, 0, 0, -0.16, 1.365)
# Hands above an arm's reach ride down to it (see lift), so these all finish with the elbows locked.
BAR_OVERHEAD = (0.03, 0.885, 0, 0, 0.02, 2.14)
BAR_SPLIT = (0.03, 0.7, 0, 1, 0.03, 1.96)
BELL_FLOOR = (0.24, 0.66, 58, 0, -0.03, 0.3)
BELL_HANG = (0.03, 0.885, 0, 0, -0.04, 0.76)
BELL_SWING = (0.05, 0.86, 8, 0, -0.42, 1.08)
BELL_RACK = (0.03, 0.885, 0, 0, -0.14, 1.44)
BELL_DIP = (0.05, 0.8, 0, 0, -0.14, 1.355)
BELL_OVERHEAD = (0.03, 0.885, 0, 0, 0.0, 2.14)
BELL_SPLIT = (0.03, 0.72, 0, 1, 0.0, 1.98)
CLIPS = {
    # name: (pose at a phase of the rep, framing, opening turn in degrees)
    'squat': (squat, 'tall', 0),
    'overhead_press': (overhead_press, 'tall', 0),
    'bench_press': (barbell_press(FLAT), 'bench', SIDE_ON),
    'bench_press_wide': (barbell_press(FLAT, half=0.4), 'bench', SIDE_ON),
    'bench_press_neck': (barbell_press(FLAT, target=THROAT), 'bench', SIDE_ON),
    'incline_bench_press': (barbell_press(INCLINE), 'bench', SIDE_ON),
    'decline_bench_press': (barbell_press(DECLINE), 'bench', SIDE_ON),
    'decline_bench_press_wide': (barbell_press(DECLINE, half=0.4), 'bench', SIDE_ON),
    'dumbbell_press': (dumbbell_press(FLAT), 'bench', SIDE_ON),
    'dumbbell_press_neutral': (dumbbell_press(FLAT, neutral=True), 'bench', SIDE_ON),
    'dumbbell_press_one_arm': (dumbbell_press(FLAT, arms=FLAT_ONLY_LEFT), 'bench', SIDE_ON),
    'incline_dumbbell_press': (dumbbell_press(INCLINE), 'bench', SIDE_ON),
    'incline_dumbbell_press_neutral': (dumbbell_press(INCLINE, neutral=True), 'bench', SIDE_ON),
    'decline_dumbbell_press': (dumbbell_press(DECLINE), 'bench', SIDE_ON),
    'dumbbell_fly': (dumbbell_fly(FLAT), 'bench', SIDE_ON),
    'dumbbell_fly_one_arm': (dumbbell_fly(FLAT, arms=FLAT_ONLY_LEFT), 'bench', SIDE_ON),
    'incline_dumbbell_fly': (dumbbell_fly(INCLINE), 'bench', SIDE_ON),
    'incline_dumbbell_fly_twist': (dumbbell_fly(INCLINE, twist=True), 'bench', SIDE_ON),
    'decline_dumbbell_fly': (dumbbell_fly(DECLINE), 'bench', SIDE_ON),
    'around_the_world': (around_the_world, 'bench', SIDE_ON),
    'pullover_straight_arm': (dumbbell_pullover(12, -5, 90), 'bench', SIDE_ON),
    'pullover_bent_arm': (dumbbell_pullover(80, -25, 76), 'bench', SIDE_ON),
    'pullover_barbell': (barbell_pullover(FLAT, 0.19, -80, 90), 'bench', SIDE_ON),
    'pullover_decline_barbell': (barbell_pullover(DECLINE, 0.28, -5, 100), 'bench', SIDE_ON),
    'floor_press': (floor_press({'_l': 0, '_r': 0}), 'floor', SIDE_ON),
    'floor_press_alternating': (floor_press({'_l': 0, '_r': 0.5}), 'floor', SIDE_ON),
    'floor_press_one_arm': (floor_press({'_l': 0, '_r': 0}, arms=FLAT_ONLY_LEFT), 'floor', SIDE_ON),
    'pushup': (pushup(), 'floor', SIDE_ON),
    'pushup_wide': (pushup(half=0.4), 'floor', SIDE_ON),
    'incline_pushup': (pushup(hand_z=0.52, prop='hands'), 'bench', SIDE_ON),
    'incline_pushup_wide': (pushup(half=0.38, hand_z=0.52, prop='hands'), 'bench', SIDE_ON),
    'decline_pushup': (pushup(toe_z=0.47, prop='feet'), 'floor', SIDE_ON),
    'pushup_feet_on_ball': (pushup(toe_z=0.62, prop='ball'), 'bench', SIDE_ON),
    'pushup_one_arm': (one_arm_pushup, 'floor', SIDE_ON),
    'pushup_side_plank': (pushup_to_side_plank, 'bench', SIDE_ON),
    'pushup_wipers': (pushup_wipers, 'floor', SIDE_ON),
    'pushup_plyo': (plyo_pushup, 'floor', SIDE_ON),
    'plank_fly': (plank_fly, 'floor', SIDE_ON),
    'dips': (dips, 'tall', SIDE_TURN),
    'cable_crossover': (hand_path(standing_lean(12), (0.58, -0.05, 0.28), (0.03, -0.42, -0.42), (0.7, 0.3, 0.3), (-1, 0, 0)),
                        'standing', 0),
    'low_cable_crossover': (hand_path(standing_lean(5), (0.5, -0.12, -0.42), (0.03, -0.5, 0.12), (0.7, 0.3, -0.4), (-1, 0, 0)),
                            'standing', 0),
    'cable_iron_cross': (hand_path(standing_lean(0), (0.6, 0, 0.05), (0.2, -0.04, -0.55), (0.1, 0.7, -0.5), (0, -1, 0)),
                         'standing', 0),
    'standing_chest_press': (hand_path(standing_lean(6), (0.08, -0.2, -0.1), (-0.11, -0.56, -0.02), (0.7, 0.3, -0.7), (0, 0, -1)),
                             'standing', SIDE_TURN),
    'svend_press': (hand_path(standing_lean(0), (-0.15, -0.16, -0.1), (-0.15, -0.5, -0.06), (0.8, 0.3, -0.6), (-1, 0, 0),
                              hand_dir=(0, -1, 0.1), curl=0), 'standing', SIDE_TURN),
    'chest_squeeze': (hand_path(standing_lean(0), (-0.16, -0.17, -0.12), (-0.16, -0.2, -0.1), (0.8, 0.3, -0.6), (-1, 0, 0),
                                hand_dir=(0, -1, 0.1), curl=0), 'standing', SIDE_TURN),
    'chest_pass': (chest_pass, 'standing', SIDE_TURN),
    'machine_press': (hand_path(on_seat, (0.08, -0.24, -0.08), (-0.1, -0.58, -0.03), (0.8, 0.35, -0.5), (0, 0, -1)), 'bench', SIDE_TURN),
    'machine_press_incline': (hand_path(on_seat, (0.08, -0.22, -0.02), (-0.1, -0.48, 0.27), (0.8, 0.35, -0.5), (0, 0, -1)), 'bench', SIDE_TURN),
    'machine_press_decline': (hand_path(on_seat, (0.08, -0.22, -0.14), (-0.1, -0.5, -0.28), (0.8, 0.35, -0.5), (0, 0, -1)), 'bench', SIDE_TURN),
    'machine_fly': (hand_path(on_seat, (0.42, -0.26, 0.0), (0.0, -0.46, 0.0), (1, 0.5, 0.0), (-1, 0, 0)), 'bench', SIDE_TURN),
    'stretch_elbows_back': (elbows_back, 'standing', 150),
    'stretch_behind_head': (behind_head, 'floor', 150),
    'stretch_overhead_pole': (overhead_pole, 'tall', 45),
    'stretch_dynamic': (sweep_arc(standing_lean(0), (0.03, -1, -0.05), (1, 0.45, -0.05), (0.2, 0.2, -1), (-1, 0, 0)), 'standing', 0),
    'stretch_ball': (ball_stretch, 'bench', 25),

    # Back: bent-over rows
    'barbell_row': (bar_clip(hinge(), 0.27, arm_out(HANGING_DOWN), BELLY_FROM_SHOULDERS, OVERHAND_HANGING, ROW_POLE, drawn=(-8, 16)), 'standing', BACK_TURN),
    'barbell_row_underhand': (bar_clip(hinge(), 0.23, arm_out(HANGING_DOWN), BELLY_FROM_SHOULDERS, UNDERHAND_HANGING, ROW_POLE, drawn=(-8, 16)), 'standing', BACK_TURN),
    'dumbbell_row': (rows(hinge(), arm_out(HANGING_DOWN), ROWED_TO_RIBS, OVERHAND_HANGING, ROW_POLE, drawn=(-8, 16), prop='prop_dumbbell'), 'standing', BACK_TURN),
    'dumbbell_row_neutral': (rows(hinge(), arm_out(HANGING_DOWN), ROWED_TO_RIBS, NEUTRAL, ROW_POLE, drawn=(-8, 18), prop='prop_dumbbell'), 'standing', BACK_TURN),
    'dumbbell_row_one_arm': (rows(bench_row_stance, arm_out(HANGING_DOWN), ROWED_TO_RIBS, NEUTRAL, ROW_POLE, arms=FLAT_ONLY_LEFT,
                                  rest=lambda *_: None, drawn=(-8, 16), prop='prop_dumbbell'), 'standing', LEFT_ARM_TURN),
    'kettlebell_row': (rows(hinge(), arm_out(HANGING_DOWN), ROWED_TO_RIBS, NEUTRAL, ROW_POLE, drawn=(-8, 16), prop='prop_hanging_kettlebell'), 'standing', BACK_TURN),
    'kettlebell_row_one_arm': (rows(hinge(), arm_out(HANGING_DOWN), ROWED_TO_RIBS, NEUTRAL, ROW_POLE, arms=FLAT_ONLY_LEFT,
                                    rest=hand_on_knee, drawn=(-8, 16), prop='prop_hanging_kettlebell'), 'standing', LEFT_ARM_TURN),
    'kettlebell_row_alternating': (rows(hinge(), arm_out(HANGING_DOWN), ROWED_TO_RIBS, NEUTRAL, ROW_POLE, drawn=(-8, 16),
                                        prop='prop_hanging_kettlebell', alternate=True), 'standing', BACK_TURN),
    'long_bar_row': (long_bar_row(SIDES), 'standing', BACK_TURN),
    'long_bar_row_one_arm': (long_bar_row(FLAT_ONLY_LEFT), 'standing', LEFT_ARM_TURN),
    'sled_row': (rows(hinge(28), arm_out((0, -0.9, -0.45)), near(0.04, -0.14, -0.36), NEUTRAL, (0.2, 0.85, -0.4), drawn=(-10, 16)), 'standing', BACK_TURN),
    'shotgun_row': (rows(split_stance(), arm_out((0, -0.92, -0.4)), near(0.05, -0.08, -0.3), (0, 0, -1), (0.2, 0.85, -0.4), arms=FLAT_ONLY_LEFT,
                         drawn=(-16, 16), end_palm=(0, 0, 1), palm_via=NEUTRAL), 'standing', LEFT_ARM_TURN),
    'renegade_row': (renegade_row, 'floor', SIDE_ON),

    # Back: chest-supported rows
    'incline_dumbbell_row': (rows(prone_incline, arm_out(HANGING_DOWN), near(0.05, 0.2, -0.2), NEUTRAL, (0.25, 0.7, 0.7), drawn=(-6, 18), prop='prop_dumbbell'), 'bench', BACK_TURN),
    'incline_rear_pull': (rows(prone_incline, arm_out((0.03, 0, -1)), near(0.33, 0.02, -0.3), OVERHAND_HANGING, (1, 0.1, 0.6), drawn=(-6, 18), prop='prop_dumbbell'), 'bench', BACK_TURN),
    'incline_blade_squeeze': (rows(prone_incline, arm_out(HANGING_DOWN), arm_out(HANGING_DOWN), NEUTRAL, (0.25, 0.7, 0.2), drawn=(-14, 22), prop='prop_dumbbell'), 'bench', BACK_TURN),
    'prone_bench_row': (bar_clip(prone_high_bench, 0.33, arm_out(HANGING_DOWN), near(0, 0.15, -0.2), OVERHAND_HANGING, ROW_POLE, drawn=(-6, 14), prop='prop_barbell'), 'standing', BACK_TURN),

    # Back: seated and kneeling rows
    'seated_cable_row': (bar_clip(row_seat(), V_HANDLE_HALF, arm_out((0, -1, -0.12), 14), near(0, -0.2, -0.32), NEUTRAL, (0.2, 0.9, -0.4), drawn=(-14, 18),
                                  prop='prop_v_handle', handle=UP, prop_turn=rot_x(90)), 'bench', BACK_TURN),
    'seated_cable_row_one_arm': (rows(row_seat(), arm_out((-0.1, -1, -0.12)), near(0.02, -0.16, -0.3), (0, 0, -1), (0.2, 0.9, -0.4), arms=FLAT_ONLY_LEFT,
                                      rest=hands_on_hips, drawn=(-16, 18)), 'bench', LEFT_ARM_TURN),
    'machine_row': (rows(stool_seat('prop_stool', 4, -4), arm_out((-0.05, -1, -0.05)), near(0.06, -0.12, -0.2), NEUTRAL, (0.25, 0.9, -0.3), drawn=(-10, 16)), 'bench', BACK_TURN),
    'machine_high_row': (rows(stool_seat('prop_stool', 0, -8), arm_out((0.04, -0.75, 0.66)), near(0.12, -0.13, -0.2), (0, -0.6, -0.8), (0.5, 0.6, -0.5), raised=(12, -4), drawn=(-8, 16)), 'tall', BACK_TURN),
    'kneeling_pulley_row': (rows(kneel(-4), arm_out((-0.12, -0.76, 0.62)), near(0.2, -0.13, -0.04), NEUTRAL, (0.9, 0.3, -0.35), raised=(10, -2), drawn=(-8, 18)), 'tall', BACK_TURN),
    'kneeling_pulley_row_one_arm': (rows(kneel(-4), arm_out((-0.05, -0.76, 0.62)), near(0.08, -0.18, -0.2), (0, -1, 0), (0.25, 0.75, -0.6), arms=FLAT_ONLY_LEFT,
                                         rest=hands_on_hips, raised=(12, -4), drawn=(-8, 16), end_palm=(-0.7, 0, 0.7), arc=True), 'tall', LEFT_ARM_TURN),

    # Back: bodyweight rows
    'inverted_row': (inverted_row(0.33, PALM_TO_FEET), 'bench', SIDE_ON),
    'inverted_row_straps': (inverted_row(0.2, NEUTRAL, handle=None, prop=None), 'bench', SIDE_ON),

    # Back: pull-ups
    'pullup': (hanging_pull(0.3, (0, -1, 0), ELBOWS_OUT_HANGING, OVER_THE_BAR), 'hanging', REAR_TURN),
    'pullup_wide': (hanging_pull(0.42, (0, -1, 0), ELBOWS_OUT_HANGING, OVER_THE_BAR), 'hanging', REAR_TURN),
    'pullup_behind_neck': (hanging_pull(0.42, (0, -1, 0), ELBOWS_OUT_HANGING, (-0.1, -0.02), lean=(4, 14)), 'hanging', REAR_TURN),
    'pullup_side_to_side': (hanging_pull(0.42, (0, -1, 0), ELBOWS_OUT_HANGING, (0.16, -0.03), sideways=0.2), 'hanging', REAR_TURN),
    'pullup_v_bar': (hanging_pull(V_HANDLE_HALF, NEUTRAL, ELBOWS_FORWARD_HANGING, (0.14, -0.06), handle=Vector((0, 1, 0)), handle_prop='prop_v_handle'), 'hanging', REAR_TURN),
    'chinup': (hanging_pull(0.17, (0, 1, 0), ELBOWS_FORWARD_HANGING, (0.17, -0.1), lean=(-4, -10)), 'hanging', REAR_TURN),
    'chinup_mixed': (hanging_pull(0.27, ((0, 1, 0), (0, -1, 0)), ELBOWS_OUT_HANGING, (0.17, -0.06)), 'hanging', REAR_TURN),
    'chinup_sternum': (hanging_pull(0.22, (0, 1, 0), ELBOWS_FORWARD_HANGING, (0.25, -0.12), lean=(-14, -48)), 'hanging', REAR_TURN),
    'scapular_pullup': (hanging_pull(0.3, (0, -1, 0), ELBOWS_OUT_HANGING, None, lean=(0, -4), raised=(24, -10), drawn=(-4, 10)), 'hanging', REAR_TURN),
    'one_handed_hang': (one_handed_hang, 'hanging', REAR_TURN),
    'muscle_up': (muscle_up, 'climbing', SIDE_TURN),
    'rope_climb': (rope_climb, 'climbing', SIDE_TURN),
    'london_bridge': (london_bridge, 'climbing', SIDE_ON),

    # Back: pulldowns
    'lat_pulldown_wide': (bar_clip(PULLDOWN_SEAT, 0.42, arm_out((0, -0.2, 1)), near(0, -0.19, -0.02), (0, -1, 0), ELBOWS_OUT_HANGING, raised=(18, -6), drawn=(-5, 14), prop='prop_pole'), 'tall', REAR_TURN),
    'lat_pulldown_close': (bar_clip(PULLDOWN_SEAT, 0.13, arm_out((0, -0.2, 1)), near(0, -0.2, -0.03), (0, -1, 0), (0.6, -0.2, -0.75), raised=(18, -6), drawn=(-5, 14), prop='prop_pole'), 'tall', REAR_TURN),
    'lat_pulldown_underhand': (bar_clip(PULLDOWN_SEAT, 0.15, arm_out((0, -0.2, 1)), near(0, -0.2, -0.03), (0, 1, 0), ELBOWS_FORWARD_HANGING, raised=(18, -6), drawn=(-5, 14), prop='prop_pole'), 'tall', REAR_TURN),
    'lat_pulldown_behind_neck': (bar_clip(stool_seat('prop_pulldown_seat', 4, 12), 0.42, arm_out((0, 0.12, 1)), near(0, 0.15, 0.13), (0, -1, 0), ELBOWS_OUT_HANGING, raised=(18, -2), drawn=(-5, 12), prop='prop_pole'), 'tall', REAR_TURN),
    'lat_pulldown_v_bar': (bar_clip(PULLDOWN_SEAT, V_HANDLE_HALF, arm_out((0, -0.18, 1)), near(0, -0.2, -0.03), NEUTRAL, ELBOWS_FORWARD_HANGING, raised=(18, -6), drawn=(-5, 14),
                                    prop='prop_v_handle', handle=Vector((0, 1, 0))), 'tall', REAR_TURN),
    'lat_pulldown_one_arm': (rows(PULLDOWN_SEAT, arm_out((0.05, -0.15, 1)), near(0.12, -0.2, -0.12), (0, -1, 0), (0.7, 0.3, -0.65), arms=FLAT_ONLY_LEFT,
                                  rest=hand_on_thigh, raised=(22, -6), drawn=(-5, 14), end_palm=(-1, 0, 0), arc=True), 'tall', REAR_TURN),
    'lat_pulldown_crossed': (rows(PULLDOWN_SEAT, near(-0.22, -0.12, 0.56), near(0.2, -0.16, -0.14), (0, -1, 0), (0.8, 0.25, -0.55),
                                  raised=(20, -6), drawn=(-5, 14), end_palm=(-1, 0, 0), arc=True), 'tall', REAR_TURN),

    # Back: straight-arm work and pullovers
    'straight_arm_pulldown': (straight_arm(hinge(26), 0.35, 42, -72), 'standing', BACK_TURN),
    'pullover_barbell_bent': (barbell_pullover(FLAT, 0.21, -8, 72, elbow_bend=65), 'bench', SIDE_ON),
    'incline_cable_pushdown': (barbell_pullover(INCLINE, 0.24, -112, 52, prop='prop_pole'), 'tall', SIDE_ON),

    # Back: deadlifts and hinges
    'deadlift': (deadlift(), 'standing', BACK_TURN),
    'deadlift_deficit': (deadlift(floor=PLATFORM, shin_tilt=16, prop='prop_platform'), 'standing', BACK_TURN),
    'rack_pull': (deadlift(start_z=RACK_PIN_Z + 0.014, shin_tilt=4, prop='prop_rack'), 'standing', BACK_TURN),
    'good_morning': (good_morning(hinging(86, knee=166, hips_back=0.2)), 'standing', BACK_TURN),
    'good_morning_seated': (good_morning(stool_seat('prop_stool', 0, 66)), 'standing', BACK_TURN),
    'hyperextension': (hyperextension, 'standing', BACK_TURN),
    'hyperextension_ball': (ball_hyperextension, 'bench', BACK_TURN),
    'superman': (superman, 'floor', SIDE_ON),
    'atlas_stone': (atlas_stone, 'standing', BACK_TURN),
    'kettlebell_sumo_high_pull': (kettlebell_sumo_high_pull, 'standing', SIDE_TURN),
    'overhead_slam': (straight_arm(hinging(52), 0.12, 105, -72, prop='prop_ball', inward=True, curl=30), 'tall', SIDE_TURN),
    'overhead_throw': (overhead_throw, 'tall', SIDE_TURN),

    # Back: shrugs and upright rows
    'barbell_shrug': (bar_clip(standing(), 0.27, arm_out((0, -0.16, -1), 12), arm_out((0, -0.16, -1), 12), OVERHAND_HANGING, (0.2, 0.9, 0), raised=(0, 27)), 'standing', REAR_TURN),
    'barbell_shrug_behind': (bar_clip(standing(), 0.27, arm_out((0, 0.3, -1), 12), arm_out((0, 0.3, -1), 12), OVERHAND_HANGING, (0.5, 0.8, 0), raised=(0, 27)), 'standing', REAR_TURN),
    'hang_shrug_clean': (bar_clip(standing(16), 0.24, arm_out((0, -0.05, -1), 12), arm_out((0, -0.05, -1), 12), OVERHAND_HANGING, (0.2, 0.9, 0), raised=(0, 27)), 'standing', REAR_TURN),
    'hang_shrug_snatch': (bar_clip(standing(16), 0.46, arm_out((0, -0.05, -1), 12), arm_out((0, -0.05, -1), 12), OVERHAND_HANGING, (0.5, 0.8, 0), raised=(0, 27)), 'standing', REAR_TURN),
    'dumbbell_shrug': (rows(standing(), arm_out((0.04, 0.02, -1), 12), arm_out((0.04, 0.02, -1), 12), (-1, 0, 0), (0.3, 0.9, 0), raised=(0, 27), prop='prop_dumbbell'), 'standing', REAR_TURN),
    'upright_row': (bar_clip(standing(), 0.15, arm_out((0, -0.2, -1)), near(0, -0.15, 0.05), (0, 1, -0.2), (1, 0.25, 0.05), raised=(0, 12), prop='prop_barbell'), 'standing', SIDE_TURN),
    'upright_row_dumbbell': (rows(standing(), arm_out((-0.2, -0.2, -1)), near(-0.05, -0.2, 0.02), (0, 1, -0.2), (1, 0.25, 0.0), raised=(0, 12), prop='prop_dumbbell', arc=True), 'standing', SIDE_TURN),

    # Back: stretches and rolling
    'stretch_cat': (cat_stretch, 'floor', SIDE_ON),
    'stretch_childs_pose': (childs_pose, 'floor', SIDE_ON),
    'stretch_hug_knees': (hug_knees, 'floor', SIDE_ON),
    'stretch_pelvic_bridge': (pelvic_bridge, 'floor', SIDE_ON),
    'stretch_standing_pelvic_tilt': (standing_pelvic_tilt, 'standing', SIDE_TURN),
    'stretch_waist_twist': (waist_twist, 'standing', 0),
    'stretch_spinal': (spinal_stretch, 'tall', 0),
    'stretch_chair_side': (stretch_arm_over, 'tall', 0),
    'stretch_arm_swing': (straight_arm(standing(), 0.22, -82, 100, prop=None, curl=25), 'tall', SIDE_TURN),
    'stretch_wall_lat': (wall_lat_stretch, 'tall', BACK_TURN),
    'stretch_overhead_lat': (overhead_lat_stretch, 'floor', REAR_TURN),
    'stretch_side_lying': (side_lying_stretch, 'floor', SIDE_ON),
    'stretch_upper_back': (upper_back_stretch, 'standing', BACK_TURN),
    'stretch_dancers': (dancers_stretch, 'floor', 20),
    'stretch_hug_ball': (hug_a_ball, 'standing', SIDE_TURN),
    'stretch_ball_pyramid': (ball_pyramid, 'bench', SIDE_ON),
    'lunge_crossover': (crossover_lunge, 'standing', SIDE_TURN),
    'foam_roll_upper_back': (foam_roll(0.15, 0.235, 9, 0.05), 'floor', SIDE_ON),
    'foam_roll_lower_back': (foam_roll(0.34, 0.352, -25, 0.14, travel=0.06), 'floor', SIDE_ON),
    'foam_roll_lat': (foam_roll_lat, 'floor', SIDE_ON),

    # Shoulders: lateral and front raises
    'lateral_raise': (rows(standing(), HANGING_BESIDE, RAISED_SIDEWAYS, NEUTRAL, RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True), 'standing', SHOULDER_TURN),
    'lateral_raise_seated': (rows(seated(), HANGING_BESIDE, RAISED_SIDEWAYS, NEUTRAL, RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True), 'bench', SHOULDER_TURN),
    'lateral_raise_one_arm': (rows(standing(), HANGING_BESIDE, RAISED_SIDEWAYS, NEUTRAL, RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True, arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'standing', SHOULDER_TURN),
    'lateral_partial': (rows(standing(), HANGING_BESIDE, arm_out((0.62, -0.05, -0.78), 14), NEUTRAL, RAISE_POLE, end_palm=(-0.6, 0, -0.8), prop='prop_dumbbell', arc=True, alternate=True), 'standing', SHOULDER_TURN),
    'front_raise': (rows(standing(), HANGING_FRONT, RAISED_FORWARD, OVERHAND_HANGING, FRONT_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True), 'standing', SIDE_TURN),
    'front_raise_alternating': (rows(standing(), HANGING_FRONT, RAISED_FORWARD, OVERHAND_HANGING, FRONT_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True, alternate=True), 'standing', SIDE_TURN),
    'front_raise_one_arm': (rows(standing(), HANGING_FRONT, RAISED_FORWARD, OVERHAND_HANGING, FRONT_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', raised=(0, 8), arc=True, arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'front_raise_incline': (rows(on_bench_back(INCLINE), arm_out((0.05, 0.1, -1), 12), arm_out((0.05, -0.57, 0.82), 12), OVERHAND_HANGING, FRONT_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', arc=True), 'tall', SIDE_ON),
    'scaption': (rows(standing(), arm_out((0.2, -0.1, -1), 8), arm_out((0.6, -0.8, 0.12), 8), NEUTRAL, RAISE_POLE, prop='prop_dumbbell', raised=(0, 12), arc=True), 'standing', SHOULDER_TURN),
    'front_then_side_raise': (hand_keys(standing(), (
        (0.0, HANG_SIDE, NEUTRAL), (0.25, OUT_FRONT, PALM_DOWN), (0.5, HANG_SIDE, NEUTRAL), (0.75, OUT_SIDE, PALM_DOWN), (1.0, HANG_SIDE, NEUTRAL),
    ), RAISE_POLE, prop='prop_dumbbell'), 'standing', SHOULDER_TURN),
    'front_sweep_side_raise': (hand_keys(standing(), (
        (0.0, HANG_SIDE, NEUTRAL), (0.3, OUT_FRONT, PALM_DOWN), (0.6, OUT_SIDE, PALM_DOWN), (1.0, HANG_SIDE, NEUTRAL),
    ), RAISE_POLE, prop='prop_dumbbell'), 'standing', SHOULDER_TURN),
    'crucifix_hold': (rows(standing(), arm_out((1, -0.02, -0.04), 6), arm_out((1, -0.02, 0.04), 6), PALM_DOWN, RAISE_POLE, prop='prop_dumbbell', arc=True), 'standing', SHOULDER_TURN),
    'plate_front_raise': (straight_arm(standing(), PLATE_RADIUS, -68, 8, prop='prop_plate', inward=True, curl=40), 'standing', SIDE_TURN),
    'plate_twist': (plate_twist, 'standing', SHOULDER_TURN),
    'single_dumbbell_raise': (straight_arm(standing(), 0.09, -72, 12, prop='prop_dumbbell_l', inward=True, curl=35), 'standing', SIDE_TURN),
    'raise_overhead_barbell': (straight_arm(standing(), 0.2, -74, 100, prop='prop_barbell'), 'tall', SIDE_TURN),
    'raise_overhead_dumbbell': (hand_keys(standing(), (
        (0.0, HANG_FRONT, OVERHAND_HANGING), (0.25, OUT_FRONT, PALM_DOWN), (0.5, OUT_OVERHEAD, (0, -1, 0)), (0.75, OUT_FRONT, PALM_DOWN), (1.0, HANG_FRONT, OVERHAND_HANGING),
    ), FRONT_RAISE_POLE, prop='prop_dumbbell'), 'tall', SIDE_TURN),
    'battling_ropes': (rows(hinge(16), arm_out((0.08, -0.7, -0.7), 22), arm_out((0.08, -0.97, -0.05), 22), NEUTRAL, (0.3, 0.6, -0.6), arc=True, alternate=True), 'standing', SIDE_TURN),

    # Shoulders: dumbbell, kettlebell and cable presses
    'shoulder_press_dumbbell': (rows(standing(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, prop='prop_dumbbell', raised=(4, 24)), 'tall', SHOULDER_TURN),
    'dumbbell_press_seated': (rows(seated(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, prop='prop_dumbbell', raised=(4, 24)), 'tall', SHOULDER_TURN),
    'shoulder_press_dumbbell_one_arm': (rows(standing(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, prop='prop_dumbbell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SHOULDER_TURN),
    'dumbbell_press_alternating': (rows(standing(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, prop='prop_dumbbell', raised=(4, 24), alternate=True), 'tall', SHOULDER_TURN),
    'dumbbell_press_palms_in': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, NEUTRAL, PRESS_FRONT_POLE, prop='prop_dumbbell', raised=(4, 24)), 'tall', SIDE_TURN),
    'dumbbell_press_palm_in_one_arm': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, NEUTRAL, PRESS_FRONT_POLE, prop='prop_dumbbell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SIDE_TURN),
    'arnold_press': (rows(seated(), near(0.02, -0.13, 0.02), PRESSED_UP, (0, 1, 0), (0.45, -0.55, -0.6), end_palm=FORWARD, palm_via=NEUTRAL, prop='prop_dumbbell', raised=(4, 24)), 'tall', SHOULDER_TURN),
    'cuban_press': (hand_keys(standing(), (
        (0.0, (0.32, 0.0, -0.3), (0, 1, 0)), (0.2, (0.32, -0.32, 0.0), PALM_DOWN), (0.4, (0.32, 0.0, 0.32), FORWARD), (0.6, (0.08, 0.0, 0.6), FORWARD),
        (0.8, (0.32, 0.0, 0.32), FORWARD), (0.9, (0.32, -0.32, 0.0), PALM_DOWN), (1.0, (0.32, 0.0, -0.3), (0, 1, 0)),
    ), (1, 0.1, 0.25), prop='prop_dumbbell'), 'tall', SHOULDER_TURN),
    'machine_overhead_press': (rows(seated(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, raised=(4, 24)), 'tall', SHOULDER_TURN),
    'standing_overhead_press_empty': (rows(standing(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, raised=(4, 24)), 'tall', SHOULDER_TURN),
    'standing_overhead_press_alternating_empty': (rows(standing(), AT_SHOULDER, PRESSED_UP, FORWARD, PRESS_OUT_POLE, raised=(4, 24), alternate=True), 'tall', SHOULDER_TURN),
    'kettlebell_press': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24)), 'tall', SHOULDER_TURN),
    'kettlebell_press_alternating': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), alternate=True), 'tall', SHOULDER_TURN),
    'kettlebell_press_one_arm': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SHOULDER_TURN),
    'kettlebell_press_to_side': (rows(standing(), AT_SHOULDER_IN, arm_out((0.5, -0.02, 0.87), 6), NEUTRAL, PRESS_OUT_POLE, end_palm=FORWARD, prop='prop_kettlebell', raised=(4, 18), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SHOULDER_TURN),
    'kettlebell_arnold_press': (rows(standing(), AT_SHOULDER_IN, PRESSED_UP, NEUTRAL, PRESS_FRONT_POLE, end_palm=FORWARD, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SHOULDER_TURN),
    'kettlebell_press_on_floor': (rows(lambda pose, _t=0: sit_on_floor(pose), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT), 'tall', SIDE_TURN),
    'kettlebell_push_press': (rows(with_catch(), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24)), 'tall', SIDE_TURN),
    'kettlebell_push_press_one_arm': (rows(with_catch(), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SIDE_TURN),
    'kettlebell_jerk': (rows(with_catch(catch=0.1), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24)), 'tall', SIDE_TURN),
    'kettlebell_jerk_one_arm': (rows(with_catch(catch=0.1), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SIDE_TURN),
    'kettlebell_split_jerk_one_arm': (rows(with_catch(catch=0.17, split=1), AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24), arms=FLAT_ONLY_LEFT, rest=hands_on_hips), 'tall', SIDE_TURN),
    'kettlebell_thruster': (rows(thruster_base, AT_SHOULDER_IN, PRESSED_UP, (-0.3, -1, 0), PRESS_FRONT_POLE, prop='prop_kettlebell', raised=(4, 24)), 'tall', SIDE_TURN),
    'kettlebell_halo': (kettlebell_halo, 'tall', SIDE_TURN),
    'kettlebell_pirate_ship': (pirate_ship, 'tall', SHOULDER_TURN),
    'turkish_get_up': (turkish_get_up, 'tall', SIDE_ON),
    # Opens from the side away from the wall, which would otherwise hide the figure.
    'handstand_pushup': (handstand_pushup, 'tall', 180 + SIDE_ON),

    # Shoulders: barbell presses
    'barbell_press_seated': (bar_clip(seated(), 0.27, near(0, -0.15, 0.03), PRESSED_UP_BAR, (0, -1, 0), (0.8, -0.15, -1), raised=(4, 24), prop='prop_barbell'), 'tall', SIDE_TURN),
    'barbell_press_behind_neck': (bar_clip(standing(), 0.34, near(0, 0.11, 0.08), PRESSED_UP_BAR, (0, -1, 0), (0.85, 0.05, -1), raised=(4, 24), prop='prop_barbell'), 'tall', REAR_TURN),
    'barbell_press_behind_neck_seated': (bar_clip(seated(), 0.34, near(0, 0.11, 0.08), PRESSED_UP_BAR, (0, -1, 0), (0.85, 0.05, -1), raised=(4, 24), prop='prop_barbell'), 'tall', REAR_TURN),
    'bradford_press': (bar_keys(standing(), 0.3, BRADFORD_KEYS, (0.85, 0, -1)), 'tall', SIDE_TURN),
    'bradford_press_seated': (bar_keys(seated(), 0.3, BRADFORD_KEYS, (0.85, 0, -1)), 'tall', SIDE_TURN),
    'push_press': (bar_clip(with_catch(), 0.25, near(0, -0.15, 0.03), PRESSED_UP_BAR, (0, -1, 0), (0.8, -0.15, -1), raised=(4, 24), prop='prop_barbell'), 'tall', SIDE_TURN),
    'push_press_behind_neck': (bar_clip(with_catch(), 0.34, near(0, 0.11, 0.08), PRESSED_UP_BAR, (0, -1, 0), (0.85, 0.05, -1), raised=(4, 24), prop='prop_barbell'), 'tall', REAR_TURN),
    'jerk_balance': (bar_clip(with_catch(catch=0.17, split=1), 0.25, near(0, -0.15, 0.03), PRESSED_UP_BAR, (0, -1, 0), (0.8, -0.15, -1), raised=(4, 24), prop='prop_barbell'), 'tall', SIDE_TURN),
    'rack_delivery': (lift(((0.0, (0.03, 0.885, 0, 0, -0.05, 1.2)), (0.5, (0.03, 0.885, 0, 0, -0.16, 1.45)), (1.0, (0.03, 0.885, 0, 0, -0.05, 1.2))), half=0.3, prop='prop_barbell'), 'standing', SIDE_TURN),
    'landmine_jammer': (jammer(SIDES), 'tall', SIDE_TURN),
    'landmine_jammer_one_arm': (jammer(FLAT_ONLY_LEFT), 'tall', SIDE_TURN),

    # Shoulders: lifts from the floor
    'clean_and_press': (lift((
        (0.0, BAR_FLOOR), (0.2, BAR_HANG), (0.34, BAR_CATCH), (0.44, BAR_RACK), (0.6, BAR_OVERHEAD), (0.74, BAR_RACK), (0.86, BAR_HANG), (1.0, BAR_FLOOR),
    )), 'tall', SIDE_TURN),
    'clean_and_jerk': (lift((
        (0.0, BAR_FLOOR), (0.16, BAR_HANG), (0.27, BAR_CATCH), (0.37, BAR_RACK), (0.45, BAR_DIP), (0.55, BAR_SPLIT), (0.68, BAR_OVERHEAD), (0.78, BAR_RACK), (0.88, BAR_HANG), (1.0, BAR_FLOOR),
    )), 'tall', SIDE_TURN),
    'kettlebell_clean': (lift((
        (0.0, BELL_FLOOR), (0.3, BELL_HANG), (0.5, BELL_RACK), (0.7, BELL_HANG), (1.0, BELL_FLOOR),
    ), half=0.2, prop='prop_hanging_kettlebell'), 'standing', SIDE_TURN),
    'kettlebell_snatch': (lift((
        (0.0, BELL_FLOOR), (0.25, BELL_SWING), (0.5, BELL_OVERHEAD), (0.75, BELL_SWING), (1.0, BELL_FLOOR),
    ), half=0.2, prop='prop_hanging_kettlebell'), 'tall', SIDE_TURN),
    'kettlebell_snatch_one_arm': (lift((
        (0.0, BELL_FLOOR), (0.25, BELL_SWING), (0.5, BELL_OVERHEAD), (0.75, BELL_SWING), (1.0, BELL_FLOOR),
    ), half=0.2, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'tall', SIDE_TURN),
    'kettlebell_split_snatch_one_arm': (lift((
        (0.0, BELL_FLOOR), (0.25, BELL_SWING), (0.5, BELL_SPLIT), (0.75, BELL_SWING), (1.0, BELL_FLOOR),
    ), half=0.2, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'tall', SIDE_TURN),
    'kettlebell_clean_and_jerk_one_arm': (lift((
        (0.0, BELL_FLOOR), (0.2, BELL_HANG), (0.36, BELL_RACK), (0.44, BELL_DIP), (0.58, BELL_OVERHEAD), (0.72, BELL_RACK), (0.84, BELL_HANG), (1.0, BELL_FLOOR),
    ), half=0.2, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'tall', SIDE_TURN),
    'scoop_throw': (straight_arm(lambda pose, t=0: hinge(50 * (1 - t), knee=118, hips_back=0.28)(pose, t), 0.12, -72, 108, prop='prop_ball', inward=True, curl=30), 'tall', SIDE_TURN),

    # Shoulders: rear delts and rotator cuff
    'band_pull_apart': (band_pull_apart, 'standing', SHOULDER_TURN),
    'rear_raise_bent': (rows(hinge(84), arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True), 'standing', BACK_TURN),
    'rear_raise_bent_one_arm': (rows(hinge(84), arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True, arms=FLAT_ONLY_LEFT, rest=hand_on_knee), 'standing', LEFT_ARM_TURN),
    'rear_raise_seated': (rows(seated(68), arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True), 'bench', BACK_TURN),
    'rear_raise_prone': (rows(prone_high_bench, arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True), 'standing', BACK_TURN),
    'rear_raise_prone_one_arm': (rows(prone_high_bench, arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True, arms=FLAT_ONLY_LEFT, rest=hang_at_side), 'standing', LEFT_ARM_TURN),
    'reverse_fly_incline': (rows(prone_incline, arm_out(HANGING_DOWN, 12), REAR_RAISED, NEUTRAL, REAR_RAISE_POLE, end_palm=PALM_DOWN, prop='prop_dumbbell', drawn=(-6, 14), arc=True), 'bench', BACK_TURN),
    'reverse_fly_incline_rotate': (rows(prone_incline, arm_out(HANGING_DOWN, 12), REAR_RAISED, PALM_DOWN, REAR_RAISE_POLE, end_palm=NEUTRAL, prop='prop_dumbbell', drawn=(-6, 14), arc=True), 'bench', BACK_TURN),
    'reverse_fly_seated': (rows(seated(), arm_out((0.03, -1, -0.02), 10), arm_out((1, 0.12, -0.02), 10), NEUTRAL, (0.5, 0.65, 0.5), drawn=(-6, 16), arc=True), 'bench', BACK_TURN),
    'reverse_fly_standing': (rows(standing(), arm_out((0.03, -1, -0.02), 10), arm_out((1, 0.12, -0.02), 10), NEUTRAL, (0.5, 0.65, 0.5), drawn=(-6, 16), arc=True), 'standing', BACK_TURN),
    'reverse_fly_crossed': (rows(standing(), arm_out((-0.28, -0.85, 0.32), 10), arm_out((1, 0.12, 0.1), 10), NEUTRAL, (0.5, 0.65, 0.5), drawn=(-6, 16), arc=True), 'standing', BACK_TURN),
    'reverse_fly_low': (rows(hinge(18), arm_out((0.03, -0.85, -0.55), 12), arm_out((1, 0.1, -0.25), 12), NEUTRAL, (0.5, 0.65, 0.3), drawn=(-6, 16), arc=True), 'standing', BACK_TURN),
    'barbell_rear_delt_row': (bar_clip(hinge(84), 0.38, arm_out(HANGING_DOWN), near(0, -0.04, -0.2), OVERHAND_HANGING, (1, 0.1, 0.3), drawn=(-8, 16), prop='prop_barbell'), 'standing', BACK_TURN),
    'rear_delt_row_seated': (rows(row_seat(4, -4), arm_out((0, -1, -0.03), 12), near(0.34, -0.03, 0.02), PALM_DOWN, (1, 0.25, 0.15), drawn=(-10, 18)), 'bench', BACK_TURN),
    'face_pull': (rows(standing(-4), arm_out((0.04, -0.82, 0.56), 12), near(0.26, -0.1, 0.12), NEUTRAL, (1, 0.2, 0.4), drawn=(-8, 18)), 'standing', BACK_TURN),
    'upright_row_one_arm': (rows(standing(), arm_out((-0.2, -0.2, -1)), near(-0.05, -0.2, 0.02), (0, 1, -0.2), (1, 0.25, 0.0), raised=(0, 12), prop='prop_dumbbell', arc=True, arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'external_rotation': (rows(standing(), BY_BELLY, OUT_FROM_ELBOW, NEUTRAL, ELBOW_AT_SIDE_POLE, arms=FLAT_ONLY_LEFT), 'standing', 15),
    'internal_rotation': (rows(standing(), OUT_FROM_ELBOW, BY_BELLY, NEUTRAL, ELBOW_AT_SIDE_POLE, arms=FLAT_ONLY_LEFT), 'standing', 15),
    'shoulder_protraction_barbell': (bar_clip(on_bench_back(INCLINE), 0.27, arm_out(BENCH_UP), arm_out(BENCH_UP), (0, 0.57, -0.82), (0.8, 0, -0.5), drawn=(4, -18), prop='prop_barbell'), 'tall', SIDE_ON),
    'shoulder_protraction_dumbbell': (rows(on_bench_back(INCLINE), arm_out(BENCH_UP), arm_out(BENCH_UP), (0, 0.57, -0.82), (0.8, 0, -0.5), drawn=(4, -18), prop='prop_dumbbell'), 'tall', SIDE_ON),
    'prone_incline_press': (bar_clip(prone_incline, 0.27, near(0, -0.12, -0.14), arm_out(ALONG_INCLINE), PALM_DOWN, (1, 0.35, -0.2), raised=(0, 18), prop='prop_barbell'), 'tall', SIDE_ON),
    'prone_incline_raise': (straight_arm(prone_incline, 0.27, -86, 34, prop='prop_barbell'), 'tall', SIDE_ON),
    'kneeling_arm_drill': (hand_keys(kneel(0), (
        (0.0, (0.06, -0.3, -0.28), NEUTRAL), (0.5, (0.09, 0.25, -0.38), NEUTRAL), (1.0, (0.06, -0.3, -0.28), NEUTRAL),
    ), (0.1, 1, -0.5), shift=0.5, curl=45), 'bench', SIDE_TURN),
    'march_overhead': (march_overhead, 'tall', SIDE_TURN),

    # Shoulders: stretches and mobility
    'stretch_arm_circles': (arm_circles, 'standing', SHOULDER_TURN),
    'stretch_elbow_circles': (elbow_circles, 'standing', SIDE_TURN),
    'stretch_shoulder_circles': (shoulder_circles, 'standing', SIDE_TURN),
    'stretch_shoulder_raise': (rows(standing(), arm_out(HANGING_BESIDE_DIR, 8), arm_out(HANGING_BESIDE_DIR, 8), NEUTRAL, (0.3, 0.9, 0), raised=(0, 27), curl=25), 'standing', SHOULDER_TURN),
    'stretch_arm_across': (rows(standing(), near(-0.28, -0.3, -0.08), near(-0.5, -0.2, -0.08), (0, 1, 0), (0.1, 0.3, -1), arms=FLAT_ONLY_LEFT, rest=hold_other_arm('forearm_l', (0.235, -0.02, 1.03)), curl=15), 'standing', SHOULDER_TURN),
    'stretch_wrist_pull': (rows(standing(), near(-0.3, -0.18, -0.55), near(-0.5, -0.22, -0.08), (0, 1, 0), (0.1, 0.4, -1), arms=FLAT_ONLY_LEFT, rest=hold_other_arm('forearm_twist_l', (0.26, -0.01, 0.87)), curl=15), 'standing', SHOULDER_TURN),
    'stretch_upward': (rows(standing(), arm_out((-0.16, 0, 1), 6), arm_out((-0.2, 0.12, 1), 2), NEUTRAL, (1, 0, 0), raised=(12, 26), curl=10), 'tall', SHOULDER_TURN),
    'stretch_pole_overhead_behind': (straight_arm(standing(), 0.5, 262, 118, elbow=4), 'tall', BACK_TURN),
    'stretch_chair_upper_body': (rows(stool_seat('prop_stool', 2, 16), near(0.03, 0.32, -0.42), near(0.03, 0.36, -0.42), (0, -1, 0), (0.3, 0.9, 0), curl=50, drawn=(10, 22)), 'bench', SIDE_ON),
    'stretch_front_delt_seated': (rows(lambda pose, _t=0: sit_on_floor(pose), arm_out((1, 0.25, -0.02), 8), arm_out((1, 0.62, -0.02), 8), PALM_DOWN, (0.1, 0.3, -1), drawn=(4, 20), curl=25), 'bench', BACK_TURN),
}


DUMBBELLS = ('prop_dumbbell_l', 'prop_dumbbell_r')
HIGH_PULLEY = 2.25
PULLDOWN_TOWER = (0, -0.72)


def with_cables(clip, framing=None, **cables):
    """The clip with its cables, keeping its framing unless a pulley above it needs more."""
    pose_at, own_framing, view = CLIPS[clip]
    return cabled(pose_at, **cables), framing or own_framing, view


CLIPS.update({
    # Cable versions of clips that other equipment also uses.
    'machine_press_cable': with_cables('machine_press', 'tall', left=(0.62, 0.55, 1.05), right=(-0.62, 0.55, 1.05)),
    'machine_press_incline_cable': with_cables('machine_press_incline', 'tall', left=(0.62, 0.5, 0.7), right=(-0.62, 0.5, 0.7)),
    'standing_chest_press_cable': with_cables('standing_chest_press', 'tall', left=(0.65, 0.6, 1.3), right=(-0.65, 0.6, 1.3)),
    'cable_crossover_cable': with_cables('cable_crossover', 'tall', left=(0.92, 0.1, HIGH_PULLEY), right=(-0.92, 0.1, HIGH_PULLEY)),
    'dumbbell_fly_cable': with_cables('dumbbell_fly', left=(0.95, 0.22, 0.1), right=(-0.95, 0.22, 0.1), remove=DUMBBELLS),
    'incline_dumbbell_fly_cable': with_cables('incline_dumbbell_fly', 'tall', left=(0.95, 0.1, 0.1), right=(-0.95, 0.1, 0.1), remove=DUMBBELLS),
    'barbell_shrug_cable': with_cables('barbell_shrug', bar=('prop_pole', (0, -0.5, 0.12)), swap=('prop_bar_loaded', 'prop_pole')),
    'upright_row_cable': with_cables('upright_row', bar=('prop_pole', (0, -0.5, 0.12)), swap=('prop_barbell', 'prop_pole')),
    'rear_raise_seated_cable': with_cables('rear_raise_seated', left=(-0.95, 0, 0.12), right=(0.95, 0, 0.12), remove=DUMBBELLS),
    'machine_overhead_press_cable': with_cables('machine_overhead_press', left=(0.55, 0.32, 0.3), right=(-0.55, 0.32, 0.3)),
    'standing_overhead_press_empty_cable': with_cables('standing_overhead_press_empty', left=(0.65, 0.05, 0.12), right=(-0.65, 0.05, 0.12)),
    'lateral_raise_across_cable': (cabled(rows(standing(), arm_out((-0.2, -0.3, -1), 14), RAISED_SIDEWAYS, OVERHAND_HANGING, RAISE_POLE, end_palm=PALM_DOWN, raised=(0, 8), arc=True, arms=FLAT_ONLY_LEFT, rest=hands_on_hips),
                                          left=(-0.7, -0.3, 0.12)), 'standing', SHOULDER_TURN),
    'front_raise_one_arm_cable': with_cables('front_raise_one_arm', left=(0.2, 0.75, 0.12), remove=DUMBBELLS),
    'external_rotation_cable': with_cables('external_rotation', left=(-0.85, -0.22, 1.08)),
    'internal_rotation_cable': with_cables('internal_rotation', left=(0.85, -0.2, 1.08)),

    # Clips only cable exercises use.
    'low_cable_crossover': with_cables('low_cable_crossover', left=(0.92, 0.1, 0.12), right=(-0.92, 0.1, 0.12)),
    'cable_iron_cross': with_cables('cable_iron_cross', 'tall', left=(0.92, 0, HIGH_PULLEY), right=(-0.92, 0, HIGH_PULLEY)),
    'shotgun_row': with_cables('shotgun_row', left=(0.18, -0.92, 0.2)),
    'seated_cable_row': with_cables('seated_cable_row', bar=('prop_v_handle', (0, -0.84, 0.36))),
    'seated_cable_row_one_arm': with_cables('seated_cable_row_one_arm', left=(0.14, -0.84, 0.36)),
    'kneeling_pulley_row': with_cables('kneeling_pulley_row', left=(0, -0.85, HIGH_PULLEY), right=(0, -0.85, HIGH_PULLEY)),
    'kneeling_pulley_row_one_arm': with_cables('kneeling_pulley_row_one_arm', left=(0.14, -0.85, HIGH_PULLEY)),
    'lat_pulldown_wide': with_cables('lat_pulldown_wide', bar=('prop_pole', (0, -0.2, 2.42)), tower=PULLDOWN_TOWER),
    'lat_pulldown_close': with_cables('lat_pulldown_close', bar=('prop_pole', (0, -0.2, 2.42)), tower=PULLDOWN_TOWER),
    'lat_pulldown_underhand': with_cables('lat_pulldown_underhand', bar=('prop_pole', (0, -0.2, 2.42)), tower=PULLDOWN_TOWER),
    'lat_pulldown_behind_neck': with_cables('lat_pulldown_behind_neck', bar=('prop_pole', (0, 0.1, 2.42)), tower=PULLDOWN_TOWER),
    'lat_pulldown_v_bar': with_cables('lat_pulldown_v_bar', bar=('prop_v_handle', (0, -0.2, 2.42)), tower=PULLDOWN_TOWER),
    'lat_pulldown_one_arm': with_cables('lat_pulldown_one_arm', left=(0.2, -0.2, 2.42), tower=PULLDOWN_TOWER),
    # The hands cross: each holds the cable from the pulley on the other side.
    'lat_pulldown_crossed': with_cables('lat_pulldown_crossed', left=(-0.7, -0.12, 2.42), right=(0.7, -0.12, 2.42)),
    'straight_arm_pulldown': with_cables('straight_arm_pulldown', 'tall', bar=('prop_pole', (0, -0.8, HIGH_PULLEY))),
    'incline_cable_pushdown': with_cables('incline_cable_pushdown', bar=('prop_pole', (0, 0.95, HIGH_PULLEY))),
    'standing_overhead_press_alternating_empty': with_cables('standing_overhead_press_alternating_empty', left=(0.65, 0.05, 0.12), right=(-0.65, 0.05, 0.12)),
    'reverse_fly_crossed': with_cables('reverse_fly_crossed', 'tall', left=(-0.92, -0.5, HIGH_PULLEY), right=(0.92, -0.5, HIGH_PULLEY)),
    'rear_delt_row_seated': with_cables('rear_delt_row_seated', left=(0, -0.84, 0.36), right=(0, -0.84, 0.36)),
    'face_pull': with_cables('face_pull', 'tall', left=(0, -0.9, 1.95), right=(0, -0.9, 1.95)),
    'rear_raise_bent_one_arm_cable': with_cables('rear_raise_bent_one_arm', left=(-0.6, -0.3, 0.1), remove=DUMBBELLS),
})
del CLIPS['rear_raise_bent_one_arm']


BOX_BEHIND = (0, 0.36, 0)
BOX_AHEAD = (0, -0.48, 0)
BENCH_BEHIND = (0, 1.0, 0)
# Keys of whole-body lifts with a wide or a low catch.
BAR_DEEP_RACK = (0.2, 0.55, 20, 0, -0.16, 1.09)
BAR_BELOW_KNEE = (0.2, 0.72, 42, 0, -0.07, 0.42)
BAR_MID_THIGH = (0.1, 0.83, 16, 0, -0.09, 0.62)
BAR_ON_BLOCKS = (0.2, 0.72, 44, 0, -0.09, RACK_PIN_Z + 0.014)
BAR_HIGH_PULL = (0.03, 0.905, -2, 0, -0.1, 1.05)
SNATCH_FLOOR = (0.36, 0.57, 62, 0, -0.065, BAR_ON_FLOOR)
SNATCH_HANG = (0.03, 0.885, 0, 0, -0.095, 0.83)
SNATCH_PULLED = (0.03, 0.9, -2, 0, -0.08, 1.25)
SNATCH_DEEP = (0.17, 0.52, 14, 0, 0.0, 1.78)
SNATCH_POWER = (0.07, 0.76, 6, 0, 0.01, 2.0)
SNATCH_TOP = (0.03, 0.885, 0, 0, 0.02, 2.14)
SNATCH_SPLIT = (0.03, 0.7, 0, 1, 0.02, 1.96)
SNATCH_BELOW_KNEE = (0.22, 0.68, 44, 0, -0.07, 0.42)
SNATCH_MID_THIGH = (0.11, 0.8, 18, 0, -0.09, 0.62)
SNATCH_BLOCKS = (0.22, 0.68, 46, 0, -0.09, RACK_PIN_Z + 0.014)
BELL_LOW_SWING = (0.22, 0.73, 52, 0, 0.14, 0.42)
BELL_CHEST = (0.04, 0.885, -3, 0, -0.56, 1.25)
SPLIT_FRONT = (0.12, -0.3, ANKLE_Z, 0)
FEET_APART = (0.13, ANKLE_Y, ANKLE_Z, 0)
HOLD_HIGH = wrist_at((0.5, -0.05, 1.08), pole=(1, 0.3, -0.5), hand_dir=(0.5, 0, -0.2), palm=(0, 0, -1), curl=45)
ARMS_OUT_SIDE = swinging(((0.0, ARM_SIDE), (1.0, ARM_SIDE)), pole=(0, 0.4, -1), curl=10, palm_out=True)
BIKE_BARS = wrist_at((0.2, -0.52, 1.13), pole=(0.7, 0.4, -0.5), hand_dir=(0, -1, 0), palm=(0, 0, -1), curl=60)
ON_THIGH = hand_on_thigh
BACK_ANKLE = (0.1, 0.45, 0.62, 165)


CLIPS.update({
    # Legs: squats
    'squat_box': (with_props(held_in(squatting(0.32, 30, 0.2, width=0.2, toe_out=20, knee_out=0.4), on_back()), prop_box=BOX_BEHIND), 'tall', SIDE_TURN),
    'squat_narrow': (held_in(squatting(0.36, 32, 0.17, width=0.08, toe_out=6, knee_out=0.1), on_back()), 'tall', SIDE_TURN),
    'squat_wide': (held_in(squatting(0.3, 30, 0.17, width=0.3, toe_out=28, knee_out=0.6, top=0.02), on_back()), 'tall', SIDE_TURN),
    'squat_olympic': (held_in(squatting(0.42, 16, 0.12, width=0.16, toe_out=18, knee_out=0.35), on_back()), 'tall', SIDE_TURN),
    'squat_front': (held_in(squatting(0.38, 18, 0.13, width=0.16, toe_out=16, knee_out=0.3), on_front()), 'tall', SIDE_TURN),
    'squat_front_box': (with_props(held_in(squatting(0.32, 18, 0.16, width=0.2, toe_out=20, knee_out=0.4), on_front()), prop_box=BOX_BEHIND), 'tall', SIDE_TURN),
    'squat_frankenstein': (held_in(squatting(0.38, 14, 0.12, width=0.16, toe_out=16, knee_out=0.3), on_front(arms_out=True)), 'tall', SIDE_TURN),
    'squat_bodyweight': (held_in(squatting(0.38, 28, 0.17), both_arms(behind_the_neck)), 'standing', SIDE_TURN),
    'squat_partial': (held_in(squatting(0.17, 16, 0.08), both_arms(hands_on_hips)), 'standing', SIDE_TURN),
    'squat_dumbbell': (held_in(squatting(0.34, 26, 0.16), both_arms(dumbbells_down())), 'standing', SIDE_TURN),
    'squat_dumbbell_box': (with_props(held_in(squatting(0.32, 26, 0.2, width=0.2, toe_out=20, knee_out=0.4), both_arms(dumbbells_down())), prop_box=BOX_BEHIND), 'standing', SIDE_TURN),
    'squat_goblet': (held_in(squatting(0.42, 14, 0.12, width=0.2, toe_out=20, knee_out=0.45), goblet), 'standing', SIDE_TURN),
    'squat_kettlebell_front': (held_in(squatting(0.38, 16, 0.12, width=0.16, toe_out=16, knee_out=0.3), both_arms(bells_at_shoulders)), 'standing', SIDE_TURN),
    'squat_overhead': (held_in(squatting(0.38, 12, 0.1, width=0.2, toe_out=20, knee_out=0.4), overhead_bar()), 'tall', SIDE_TURN),
    'squat_one_arm_overhead': (held_in(squatting(0.36, 14, 0.12, width=0.18, toe_out=18, knee_out=0.35), lambda pose, trunk: (bell_pressed_up(pose, '_l', 1, trunk), hands_on_hips(pose, '_r', -1, trunk))), 'tall', SIDE_TURN),
    'squat_zercher': (held_in(squatting(0.36, 22, 0.15, width=0.17, toe_out=16, knee_out=0.35), zercher), 'standing', SIDE_TURN),
    'squat_plie': (held_in(squatting(0.25, 4, 0.02, width=0.33, toe_out=38, knee_out=0.9, top=0.03), dumbbell_in_front), 'standing', 15),
    'squat_band': (moves((stood(0.0), stood(0.5, dip=0.36, lean=26), stood(1.0)), arms=swinging(((0.0, (0.1, -0.05, 0.1)), (1.0, (0.1, -0.05, 0.1))), pole=(0.6, -0.1, -1), curl=70), extra=bands_to_feet), 'standing', SIDE_TURN),
    'squat_hack_barbell': (held_in(squatting(0.34, 12, 0.12, width=0.16, toe_out=12, knee_out=0.3), bar_behind_legs), 'standing', SIDE_TURN),
    'squat_belt': (held_in(squatting(0.24, 8, 0.07, width=0.18, toe_out=20, knee_out=0.4), belt_plate), 'standing', 15),
    'squat_jefferson': (moves((key(0.0, (0.1, 0.46), 14, (0.28, ANKLE_Y, ANKLE_Z, 0)), key(0.5, (0.03, 0.87), 0, (0.28, ANKLE_Y, ANKLE_Z, 0)), key(1.0, (0.1, 0.46), 14, (0.28, ANKLE_Y, ANKLE_Z, 0))),
                              hold=lambda pose, trunk: jefferson_grip(pose, trunk), pole=(0.5, -1, 0), toe_out=24), 'standing', 30),
    'squat_sissy': (moves((key(0.0, (0.03, 0.885), 0, FEET_APART), key(0.5, (-0.14, 0.56), -42, (0.13, -0.02, 0.11, 32)), key(1.0, (0.03, 0.885), 0, FEET_APART)),
                          arms=plate_on_chest, right_arm=lambda pose, side, sign, trunk: apply_arm(pose, side, trunk, (-0.52, -0.15, 1.05), Vector((-1, 0.3, -0.5)), Vector((1, 0, 0)), curl=60)), 'standing', SIDE_TURN),
    'pistol_kettlebell': (moves((key(0.0, (0.05, 0.86), 2, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.28, 0.2, -30)), key(0.5, (0.26, 0.42), 30, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.56, 0.3, -75)), key(1.0, (0.05, 0.86), 2, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.28, 0.2, -30))), hold=goblet, pole=(0.1, -1, 0)), 'standing', SIDE_TURN),
    'pistol_bar': (moves((key(0.0, (0.05, 0.86), 2, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.28, 0.2, -30)), key(0.5, (0.26, 0.42), 30, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.56, 0.3, -75)), key(1.0, (0.05, 0.86), 2, (0.07, ANKLE_Y, ANKLE_Z, 0), (0.1, -0.28, 0.2, -30))), hold=on_back(), pole=(0.1, -1, 0)), 'tall', SIDE_TURN),
    'split_bench_bar': (with_props(split_on_bench(hold=on_back()), prop_bench_flat=BENCH_BEHIND), 'tall', SIDE_TURN),
    'split_bench_dumbbell': (with_props(split_on_bench(arms=dumbbells_down()), prop_bench_flat=BENCH_BEHIND), 'standing', SIDE_TURN),
    'split_suspended': (split_on_bench(arms=hands_on_hips, extra=strap_to_foot), 'tall', SIDE_TURN),
    'side_split_bar': (moves((key(0.0, (0, 0.03, 0.83), 0, (0.4, ANKLE_Y, ANKLE_Z, 0)), key(0.5, (0.26, 0.09, 0.6), 18, (0.4, ANKLE_Y, ANKLE_Z, 0)), key(1.0, (0, 0.03, 0.83), 0, (0.4, ANKLE_Y, ANKLE_Z, 0))), hold=on_back(), pole=(0.35, -1, 0), toe_out=26), 'tall', 15),
    'box_one_leg': (with_props(moves((key(0.0, (0.0, 0.67), 22, (0.11, -0.36, FOOT_ON_BOX, 0), (0.13, 0.0, ANKLE_Z, 0)), key(0.5, (-0.3, 1.33), 2, (0.11, -0.36, FOOT_ON_BOX, 0), (0.13, -0.05, 0.44, 25)), key(1.0, (0.0, 0.67), 22, (0.11, -0.36, FOOT_ON_BOX, 0), (0.13, 0.0, ANKLE_Z, 0))), arms=hands_on_hips), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),

    # Legs: lunges and step-ups
    'lunge_bar': (moves(lunge_keys(), hold=on_back()), 'tall', SIDE_TURN),
    'lunge_hips': (moves(lunge_keys(), arms=hands_on_hips), 'standing', SIDE_TURN),
    'lunge_dumbbell': (moves(lunge_keys(), arms=dumbbells_down()), 'standing', SIDE_TURN),
    'lunge_kettlebell': (moves(lunge_keys(), arms=dumbbells_down('prop_hanging_kettlebell')), 'standing', SIDE_TURN),
    'rear_lunge_dumbbell': (moves(lunge_keys(0.62, back_step=True), arms=dumbbells_down()), 'standing', SIDE_TURN),
    'rear_lunge_platform_bar': (with_props(moves(lunge_keys(0.62, floor=PLATFORM, back_step=True), hold=on_back()), prop_platform=(0, ANKLE_Y, 0)), 'tall', SIDE_TURN),
    'step_up_bar': (with_props(moves(STEP_UP_KEYS, hold=on_back()), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),
    'step_up_dumbbell': (with_props(moves(STEP_UP_KEYS, arms=dumbbells_down()), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),
    'step_up_knee': (with_props(moves(STEP_UP_KNEE_KEYS, arms=hands_on_hips), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),

    # Legs: machines
    'leg_press': (leg_press(), 'bench', SIDE_ON),
    'leg_press_narrow': (leg_press(half=0.08), 'bench', SIDE_ON),
    'leg_press_calf': (leg_press(calf=True), 'bench', SIDE_ON),
    'leg_press_floor': (moves((key(0.0, (0.2, SUPINE_Z), -90, (0.14, -0.05, 0.56, -125)), key(0.5, (0.2, SUPINE_Z), -90, (0.14, -0.02, 0.88, -170)), key(1.0, (0.2, SUPINE_Z), -90, (0.14, -0.05, 0.56, -125))), arms=arms_by_side_supine, pole=UP_KNEE,
                              extra=lambda pose, trunk: pose.props.__setitem__('prop_barbell', ((pose.point_on('foot_l', (0.072, -0.06, 0.02)) + pose.point_on('foot_r', (-0.072, -0.06, 0.02))) / 2 + Vector((0, 0, 0.03)), NOTHING_HELD))), 'bench', SIDE_ON),
    'hack_squat': (hack_squat(), 'tall', SIDE_TURN),
    'hack_squat_narrow': (hack_squat(half=0.08), 'tall', SIDE_TURN),
    'hack_squat_lying': (hack_squat(recline=-52), 'tall', SIDE_TURN),
    'leg_extension': (leg_extension(), 'bench', SIDE_TURN),
    'leg_extension_one': (leg_extension(FLAT_ONLY_LEFT), 'bench', SIDE_TURN),
    'leg_curl_lying': (lying_curl(), 'bench', SIDE_ON),
    'leg_curl_seated': (seated_curl(), 'bench', SIDE_TURN),
    'leg_curl_band': (seated_curl(band=True), 'bench', SIDE_TURN),
    'leg_curl_standing': (standing_curl, 'standing', SIDE_TURN),
    'leg_curl_floor': (lying_curl(on_bench=False, pad=False), 'floor', SIDE_ON),
    'thigh_abductor': (seated_spread(0.14, 0.42), 'bench', 15),
    'thigh_adductor': (seated_spread(0.42, 0.14), 'bench', 15),
    'reverse_hyper': (reverse_hyper, 'bench', SIDE_ON),
    'hip_thrust_barbell': (hip_bridge(bench=True, bar=True), 'bench', SIDE_ON),
    'glute_bridge_barbell': (hip_bridge(bar=True), 'floor', SIDE_ON),
    'glute_bridge': (hip_bridge(), 'floor', SIDE_ON),
    'glute_bridge_band': (hip_bridge(band=True), 'floor', SIDE_ON),
    'glute_bridge_one_leg': (hip_bridge(one_leg=True), 'floor', SIDE_ON),
    'hip_bridge_ball': (ball_bridge, 'bench', SIDE_ON),
    'ball_leg_curl': (ball_leg_curl, 'bench', SIDE_ON),
    'floor_ghr': (glute_ham_raise, 'standing', SIDE_ON),
    'kneeling_squat': (held_in(kneeling_sit, on_back()), 'standing', SIDE_TURN),
    'kneeling_jump_squat': (moves(KNEELING_JUMP_KEYS, hold=on_back(), pole=(0.15, -1, 0)), 'tall', SIDE_TURN),
    'glute_kickback': (kneeling_kick, 'floor', SIDE_ON),
    'rear_leg_raise': (kneeling_leg((-0.11, 0.7, 0.09), (-0.1, 1.05, 0.72), pole=(-0.05, 0.1, -1), tilt=(150, 130)), 'floor', SIDE_ON),
    'hip_circle_prone': (hip_circle_prone, 'floor', SIDE_ON),
    'hip_kick_cable': (moves((key(0.0, (0.06, 0.83), 12, (0.13, ANKLE_Y, ANKLE_Z, 0), (0.13, -0.02, 0.16, 8)), key(0.5, (0.06, 0.83), 18, (0.13, ANKLE_Y, ANKLE_Z, 0), (0.13, 0.48, 0.35, 45)), key(1.0, (0.06, 0.83), 12, (0.13, ANKLE_Y, ANKLE_Z, 0), (0.13, -0.02, 0.16, 8))),
                          arms=lambda pose, side, sign, trunk: apply_arm(pose, side, trunk, (sign * 0.24, -0.38, 1.08), Vector((sign * 0.7, 0.3, -0.5)), Vector((-sign, 0, 0)), handle=UP), extra=lambda pose, trunk: (add_pulley(pose, (-0.13, -0.72, 0.12)), span(pose, 'prop_cable_l', Vector((-0.13, -0.72, 0.12)), pose.head['foot_r']))), 'standing', SIDE_TURN),
    'hip_extension_band': (moves((key(0.0, (0.05, 0.84), 8, FEET_APART, (0.13, -0.05, 0.14, 5)), key(0.5, (0.05, 0.84), 12, FEET_APART, (0.13, 0.4, 0.3, 40)), key(1.0, (0.05, 0.84), 8, FEET_APART, (0.13, -0.05, 0.14, 5))),
                              arms=lambda pose, side, sign, trunk: apply_arm(pose, side, trunk, (sign * 0.18, -0.42, 1.06), Vector((sign * 0.7, 0.3, -0.5)), Vector((-sign, 0, 0)), handle=UP), extra=ankle_strap('_r', (-0.13, -0.62, 0.15))), 'standing', SIDE_TURN),
    'hip_flexion_band': (moves((key(0.0, (0.03, 0.86), 2, FEET_APART, (0.13, 0.12, 0.13, 15)), key(0.5, (0.03, 0.86), 2, FEET_APART, (0.13, -0.33, 0.47, 5)), key(1.0, (0.03, 0.86), 2, FEET_APART, (0.13, 0.12, 0.13, 15))), arms=hands_on_hips, extra=ankle_strap('_r', (-0.13, 0.72, 0.15))), 'standing', SIDE_TURN),
    'hip_adduction_band': (moves(HIP_ADDUCT_KEYS, arms=hands_on_hips, pole=(0.05, -1, 0), extra=ankle_strap('_l', (0.95, 0.03, 0.15))), 'standing', 10),
    'hip_adduction_cable': (moves(HIP_ADDUCT_KEYS, arms=hands_on_hips, pole=(0.05, -1, 0), extra=cable_to_ankle('_l', (0.95, 0.03, 0.12))), 'standing', 10),
    'monster_walk': (moves(MONSTER_KEYS, arms=hands_on_hips, pole=(0.3, -1, 0), extra=lambda pose, trunk: span(pose, 'prop_band', pose.head['foot_l'], pose.head['foot_r'])), 'standing', SIDE_TURN),
    'leg_swing_front': (leg_swing(forward=68, back=25), 'tall', SIDE_TURN),
    'leg_swing_back': (leg_swing(forward=0, back=38), 'standing', SIDE_TURN),
    'leg_swing_side': (leg_swing(sideways=62), 'tall', 10),
    'pull_through': (moves((key(0.0, (0.26, 0.77), 72, (0.22, ANKLE_Y, ANKLE_Z, 0)), key(0.5, (0.03, 0.87), 0, (0.22, ANKLE_Y, ANKLE_Z, 0)), key(1.0, (0.26, 0.77), 72, (0.22, ANKLE_Y, ANKLE_Z, 0))),
                        arms=lambda pose, side, sign, trunk: pulled_between_legs(pose, side, sign, trunk), extra=pull_through_cable, toe_out=20, pole=(0.2, -1, 0)), 'standing', SIDE_TURN),

    # Legs: calves
    'calf_raise_bar': (with_props(calf_raise(hold=on_back()), prop_platform=(0, -0.08, 0)), 'tall', SIDE_TURN),
    'calf_raise_dumbbell': (with_props(calf_raise(arms=dumbbells_down()), prop_platform=(0, -0.08, 0)), 'standing', SIDE_TURN),
    'calf_raise_band': (with_props(calf_raise(arms=swinging(((0.0, (0.1, -0.05, 0.1)), (1.0, (0.1, -0.05, 0.1))), pole=(0.6, -0.1, -1), curl=70), extra=bands_to_feet), prop_platform=(0, -0.08, 0)), 'standing', SIDE_TURN),
    'calf_raise_pads': (with_props(calf_raise(arms=lambda pose, side, sign, trunk: apply_arm(pose, side, trunk, shoulder_of(pose, side, trunk) + Vector((sign * 0.1, -0.2, 0.08)), Vector((sign * 0.8, 0.3, -0.6)), Vector((0, -1, 0)), handle=ACROSS, curl=60)), prop_platform=(0, -0.08, 0)), 'standing', SIDE_TURN),
    'calf_raise_on_dumbbell': (with_props(calf_raise(block=0.05, low=-8, high=28, arms=hands_on_hips), prop_dumbbell_l=((0, -0.06, 0.05), rot_z(0))), 'standing', SIDE_TURN),
    'calf_rock': (moves(tuple(rocking_key(*k) for k in ((0.0, 0), (0.25, 30), (0.5, 0), (0.75, -24), (1.0, 0))), hold=on_back()), 'tall', SIDE_TURN),
    'calf_raise_reverse': (with_props(moves((key(0.0, (0.03, 0.885), 0, FEET_APART), key(0.5, (0.03, 0.88), 0, (0.13, ANKLE_Y, ANKLE_Z, -26)), key(1.0, (0.03, 0.885), 0, FEET_APART)), hold=on_back()), prop_platform=(0, 0.1, -PLATFORM * 0.5)), 'tall', SIDE_TURN),
    'calf_donkey': (with_props(moves(tuple(donkey_key(*k) for k in ((0.0, -12), (0.5, 28), (1.0, -12))), arms=lambda pose, side, sign, trunk: apply_arm(pose, side, trunk, (sign * 0.2, -0.72, 0.75), Vector((sign * 0.8, 0.2, -0.3)), Vector((0, 0, -1)), handle=ACROSS)), prop_platform=(0, -0.08, 0), prop_bench_high=(0, -1.3, 0)), 'standing', SIDE_TURN),
    'calf_seated_bar': (seated_calf(load='bar'), 'bench', SIDE_TURN),
    'calf_seated_one': (seated_calf(load='bell', sides=FLAT_ONLY_LEFT), 'bench', SIDE_TURN),
    'calf_seated': (seated_calf(), 'bench', SIDE_TURN),
    'calf_ankle_circles': (ankle_circles, 'standing', 25),
    'calf_knee_circles': (knee_circles, 'standing', 25),
    'balance_board': (with_props(moves(tuple(key(t, (x, 0.03, 0.905), a, (0.13, ANKLE_Y, ANKLE_Z + 0.02, 0), shift=0) for t, x, a in ((0.0, 0, 0), (0.25, 0.025, 1), (0.5, 0, 0), (0.75, -0.025, -1), (1.0, 0, 0))), arms=swinging(((0.0, (0.5, -0.05, -0.25)), (1.0, (0.5, -0.05, -0.25))), pole=(0, 0.4, -1), curl=20)), prop_platform=(0, ANKLE_Y - 0.05, -0.05)), 'standing', 25),
    'stretch_calf_elbows': (calf_against_wall(forearms=True), 'tall', SIDE_TURN),
    'stretch_calf_hands': (calf_against_wall(stagger=0.34), 'tall', SIDE_TURN),
    'stretch_gastroc': (moves((key(0.0, (0.14, 0.76), 72, (0.12, 0.08, ANKLE_Z, 0), (0.12, -0.42, 0.14, -30)), key(0.5, (0.18, 0.7), 85, (0.12, 0.08, ANKLE_Z, 0), (0.12, -0.42, 0.14, -30)), key(1.0, (0.14, 0.76), 72, (0.12, 0.08, ANKLE_Z, 0), (0.12, -0.42, 0.14, -30))),
                          arms=hand_on_knee, right_arm=grab('foot', (0.072, -0.1, 0.03), pole=(0.3, 0.8, 0), palm=(0, 1, 0), curl=35)), 'standing', SIDE_TURN),
    'stretch_soleus': (moves((stood(0.0, left=(0.11, -0.12, ANKLE_Z, 0), right=(0.11, 0.2, ANKLE_Z, 0)), stood(0.5, dip=0.14, lean=8, left=(0.11, -0.12, ANKLE_Z, 0), right=(0.11, 0.2, ANKLE_Z, 0)), stood(1.0, left=(0.11, -0.12, ANKLE_Z, 0), right=(0.11, 0.2, ANKLE_Z, 0))), arms=hands_on_hips), 'standing', SIDE_TURN),
    'smr_calf': (smr_seated(0.5, 0.76, 0.035, 0.035), 'floor', SIDE_ON),
    'smr_hamstring': (smr_seated(0.1, 0.36, 0.075, 0.05), 'floor', SIDE_ON),
    'smr_piriformis': (smr_piriformis, 'floor', SIDE_ON),
    'smr_quad': (smr_prone(0.1, 0.36, 0.075, 0.05), 'floor', SIDE_ON),
    'smr_adductor': (smr_adductor, 'floor', SIDE_ON),
    'smr_side': (smr_side(0.1, 0.36, 0.075, 0.05), 'floor', SIDE_ON),
    'smr_peroneal': (smr_side(0.5, 0.76, 0.05, 0.035), 'floor', SIDE_ON),
    'smr_tibialis': (smr_shin, 'floor', SIDE_ON),
    'smr_foot': (smr_foot, 'bench', SIDE_TURN),

    # Legs: cardio and strongman
    'walk': (gait(arms=pumping((0.05, -0.2, -0.55), (0.06, 0.18, -0.56), curl=25)), 'standing', SIDE_TURN),
    'jog': (gait(0.24, 0.13, 0.42, 0.1, 6, 0.85, 0.022), 'standing', SIDE_TURN),
    'run': (gait(0.28, 0.22, 0.36, 0.22, 10, 0.84, 0.03), 'standing', SIDE_TURN),
    'run_claw': (gait(0.24, 0.3, 0.36, 0.34, 8, 0.84, 0.03, arms=pumping((0.02, -0.28, -0.2))), 'standing', SIDE_TURN),
    'skip': (moves(SKIP_KEYS, arms=pumping()), 'tall', SIDE_TURN),
    'stair_climb': (stair_climb, 'tall', SIDE_TURN),
    'bike': (pedalling((0, 0.14, 1.0), 26, (-0.17, 0.46), 0.16, BIKE_BARS, prop='prop_bike'), 'standing', SIDE_TURN),
    'bike_recumbent': (with_props(pedalling((0, 0.03, 0.59), -6, (-0.62, 0.42), 0.13, ON_THIGH), prop_seat=(0, 0.02, 0)), 'bench', SIDE_TURN),
    'elliptical': (elliptical, 'tall', SIDE_TURN),
    'rowing': (rowing, 'bench', SIDE_ON),
    'skating': (skating, 'standing', 30),
    'rope_jump': (moves(tuple(stood(t, air=a, tilt=20 * (a > 0), lean=0) for t, a in ((0.0, 0), (0.25, 0.1), (0.5, 0), (0.75, 0.1), (1.0, 0))), arms=rope_turning), 'standing', SIDE_TURN),
    'sled_push_run': (gait(0.26, 0.14, 0.45, 0.08, 40, 0.74, 0.012, y=0.22, hold=pushing_sled, extra=sled_ahead(-0.72)), 'standing', SIDE_TURN),
    'sled_drag_forward': (gait(0.22, 0.12, 0.5, 0.05, 24, 0.82, 0.012, arms=pumping(), extra=harnessed), 'standing', SIDE_TURN),
    'sled_drag_backward': (gait(0.18, 0.08, 0.55, 0.0, -14, 0.82, 0.012, backward=True, arms=rope_in_hands, extra=rope_ahead), 'standing', SIDE_TURN),
    'bear_crawl': (bear_crawl, 'floor', SIDE_ON),
    'yoke_walk': (gait(0.14, 0.05, 0.62, 0.0, 2, 0.87, 0.01, hold=on_back()), 'tall', SIDE_TURN),
    'zercher_walk': (gait(0.12, 0.05, 0.62, 0.0, 4, 0.87, 0.01, hold=zercher), 'standing', SIDE_TURN),
    'tire_flip': (tire_flip, 'tall', SIDE_TURN),
    'mountain_climbers': (plank_legs(climbing_leg), 'floor', SIDE_ON),
    'groiners': (plank_legs(groiner_leg), 'floor', SIDE_ON),
    'inchworm': (inchworm, 'standing', SIDE_ON),
    'wall_drill': (on_wall_lean, 'tall', SIDE_TURN),
    'sprint_start': (sprint_start, 'standing', SIDE_TURN),

    # Legs: jumps
    'jump_squat_crossed': (jump_up(dip=0.3, arms=crossed_on_chest), 'tall', SIDE_TURN),
    'jump_squat_bar': (jump_up(dip=0.26, height=0.22, arms=None, hold=on_back()), 'tall', SIDE_TURN),
    'jump_tuck': (jump_up((0.13, -0.18, 0.72, 15)), 'tall', SIDE_TURN),
    'jump_butt_kick': (jump_up((0.13, 0.38, 0.92, 95), height=0.28), 'tall', SIDE_TURN),
    'jump_rocket': (jump_up(height=0.34), 'tall', SIDE_TURN),
    'jump_star': (jump_up((0.48, ANKLE_Y, 0.42, 20), arms=swinging(((0.0, ARM_DOWN), (0.2, ARM_DOWN), (0.36, ARM_SIDE), (0.5, ARM_SIDE_UP), (0.66, ARM_SIDE), (0.8, ARM_DOWN), (1.0, ARM_DOWN)), pole=(0, 0.3, -1), palm_out=True)), 'tall', 10),
    'hop_butt_kick': (moves(tuple(one_leg_key(*k) for k in ((0.0, 0.0, 0), (0.22, 0.0, 0.12), (0.5, 0.28, 0), (0.78, 0.0, 0.12), (1.0, 0.0, 0))), arms=JUMP_ARMS), 'tall', SIDE_TURN),
    'split_jump': (moves(SPLIT_JUMP_KEYS, arms=pumping()), 'tall', SIDE_TURN),
    'split_jump_bar': (moves(SPLIT_JUMP_KEYS, hold=on_back()), 'tall', SIDE_TURN),
    'box_jump': (with_props(moves(BOX_JUMP_KEYS, arms=JUMP_ARMS), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),
    'box_jump_seated': (with_props(moves(SEATED_BOX_JUMP_KEYS, hold=goblet), prop_box=BOX_AHEAD, prop_stool=(0, 0.34, 0)), 'tall', SIDE_TURN),
    'depth_jump': (with_props(moves(DEPTH_JUMP_KEYS, arms=JUMP_ARMS), prop_box=(0, 0.42, 0)), 'tall', SIDE_TURN),
    'box_over': (with_props(moves(hop_chain((0.42, -0.42, 0.42), dip=0.16, height=0.62, steep=True), arms=JUMP_ARMS), prop_box=(0, 0, 0)), 'tall', SIDE_TURN),
    'box_switch': (with_props(moves(BOX_SWITCH_KEYS, arms=pumping()), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),
    'box_push_off': (with_props(moves(BOX_PUSH_KEYS, arms=JUMP_ARMS), prop_box=BOX_AHEAD), 'tall', SIDE_TURN),
    'box_shuffle': (with_props(moves(BOX_SHUFFLE_KEYS, arms=JUMP_ARMS, pole=(0.25, -1, 0)), prop_box=(ORIGIN, rot_z(90))), 'tall', 10),
    'box_jump_side': (with_props(moves(BOX_SIDE_KEYS, arms=JUMP_ARMS), prop_box=(Vector((0.42, 0.04, 0)), rot_z(90))), 'tall', 10),
    'hop_cone': (with_props(moves(hop_chain((0.34, -0.34, 0.34)), arms=JUMP_ARMS), prop_cone=(0, 0.04, 0)), 'tall', SIDE_TURN),
    'hop_cone_one_leg': (with_props(moves(hop_chain((0.34, -0.34, 0.34), one_leg=True), arms=JUMP_ARMS), prop_cone=(0, 0.04, 0)), 'tall', SIDE_TURN),
    'hop_cone_side': (with_props(moves(hop_chain((0.34, -0.34, 0.34), axis='x'), arms=JUMP_ARMS), prop_cone=(0, 0.04, 0)), 'tall', 10),
    'hop_cone_side_one_leg': (with_props(moves(hop_chain((0.34, -0.34, 0.34), axis='x', one_leg=True), arms=JUMP_ARMS), prop_cone=(0, 0.04, 0)), 'tall', 10),
    'long_jump': (moves(LONG_JUMP_KEYS, arms=JUMP_ARMS), 'tall', SIDE_TURN),
    'long_jump_side': (moves(SIDE_JUMP_KEYS, arms=JUMP_ARMS), 'tall', 10),
    'frog_hop': (moves(FROG_KEYS, arms=behind_the_neck), 'standing', SIDE_TURN),
    'bound_side': (moves(BOUND_KEYS, arms=pumping(), pole=(0.2, -1, 0)), 'tall', 10),
    'bound_diagonal': (moves(BOUND_DIAGONAL_KEYS, arms=pumping()), 'tall', 30),
    'carioca': (moves(CARIOCA_KEYS, arms=pumping(), pole=(0.1, -1, 0)), 'standing', 10),

    # Legs: pulls from the floor
    'clean_pull': (lift(((0.0, BAR_FLOOR), (0.3, BAR_HANG), (0.5, BAR_HIGH_PULL), (0.7, BAR_HANG), (1.0, BAR_FLOOR))), 'standing', SIDE_TURN),
    'clean': (lift(((0.0, BAR_FLOOR), (0.2, BAR_HANG), (0.36, BAR_DEEP_RACK), (0.5, BAR_RACK), (0.66, BAR_RACK), (0.82, BAR_HANG), (1.0, BAR_FLOOR))), 'tall', SIDE_TURN),
    'power_clean': (lift(((0.0, BAR_FLOOR), (0.2, BAR_HANG), (0.34, BAR_CATCH), (0.5, BAR_RACK), (0.66, BAR_RACK), (0.82, BAR_HANG), (1.0, BAR_FLOOR))), 'tall', SIDE_TURN),
    'clean_blocks': (with_props(lift(((0.0, BAR_ON_BLOCKS), (0.2, BAR_HANG), (0.36, BAR_DEEP_RACK), (0.5, BAR_RACK), (0.66, BAR_RACK), (0.82, BAR_HANG), (1.0, BAR_ON_BLOCKS))), prop_rack=(0, 0, 0)), 'tall', SIDE_TURN),
    'power_clean_blocks': (with_props(lift(((0.0, BAR_ON_BLOCKS), (0.2, BAR_HANG), (0.34, BAR_CATCH), (0.5, BAR_RACK), (0.66, BAR_RACK), (0.82, BAR_HANG), (1.0, BAR_ON_BLOCKS))), prop_rack=(0, 0, 0)), 'tall', SIDE_TURN),
    'hang_clean': (lift(((0.0, BAR_MID_THIGH), (0.14, BAR_HANG), (0.32, BAR_DEEP_RACK), (0.5, BAR_RACK), (0.72, BAR_RACK), (0.88, BAR_HANG), (1.0, BAR_MID_THIGH))), 'tall', SIDE_TURN),
    'hang_clean_low': (lift(((0.0, BAR_BELOW_KNEE), (0.18, BAR_HANG), (0.34, BAR_DEEP_RACK), (0.5, BAR_RACK), (0.72, BAR_RACK), (0.88, BAR_HANG), (1.0, BAR_BELOW_KNEE))), 'tall', SIDE_TURN),
    'hang_power_clean': (lift(((0.0, BAR_MID_THIGH), (0.14, BAR_HANG), (0.32, BAR_CATCH), (0.5, BAR_RACK), (0.72, BAR_RACK), (0.88, BAR_HANG), (1.0, BAR_MID_THIGH))), 'tall', SIDE_TURN),
    'split_clean': (lift(((0.0, BAR_FLOOR), (0.2, BAR_HANG), (0.36, (0.03, 0.7, 0, 1, -0.16, 1.26)), (0.52, BAR_RACK), (0.68, BAR_RACK), (0.84, BAR_HANG), (1.0, BAR_FLOOR))), 'tall', SIDE_TURN),
    'dumbbell_clean': (lift(((0.0, BELL_FLOOR), (0.25, BELL_HANG), (0.5, BELL_RACK), (0.75, BELL_HANG), (1.0, BELL_FLOOR)), half=0.22, prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'kettlebell_clean_one': (lift(((0.0, BELL_FLOOR), (0.3, BELL_HANG), (0.5, BELL_RACK), (0.7, BELL_HANG), (1.0, BELL_FLOOR)), half=0.16, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'kettlebell_hang_clean_one': (lift(((0.0, BELL_LOW_SWING), (0.25, BELL_HANG), (0.5, BELL_RACK), (0.75, BELL_HANG), (1.0, BELL_LOW_SWING)), half=0.16, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'kettlebell_swing_one': (lift(((0.0, BELL_LOW_SWING), (0.5, BELL_CHEST), (1.0, BELL_LOW_SWING)), half=0.1, prop='prop_hanging_kettlebell', arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'jerk_dip': (lift(((0.0, BAR_RACK), (0.5, BAR_DIP), (1.0, BAR_RACK))), 'standing', SIDE_TURN),
    'power_jerk': (lift(((0.0, BAR_RACK), (0.2, BAR_DIP), (0.42, (0.05, 0.8, 0, 0, 0.0, 2.04)), (0.6, BAR_OVERHEAD), (0.8, BAR_RACK), (1.0, BAR_RACK))), 'tall', SIDE_TURN),
    'split_jerk': (lift(((0.0, BAR_RACK), (0.2, BAR_DIP), (0.42, BAR_SPLIT), (0.6, BAR_OVERHEAD), (0.8, BAR_RACK), (1.0, BAR_RACK))), 'tall', SIDE_TURN),
    'squat_jerk': (lift(((0.0, BAR_RACK), (0.18, BAR_DIP), (0.4, SNATCH_DEEP), (0.6, BAR_OVERHEAD), (0.8, BAR_RACK), (1.0, BAR_RACK))), 'tall', SIDE_TURN),
    'snatch': (lift(((0.0, SNATCH_FLOOR), (0.2, SNATCH_HANG), (0.36, SNATCH_DEEP), (0.52, SNATCH_TOP), (0.68, SNATCH_TOP), (0.84, SNATCH_HANG), (1.0, SNATCH_FLOOR)), half=0.42), 'tall', SIDE_TURN),
    'power_snatch': (lift(((0.0, SNATCH_FLOOR), (0.2, SNATCH_HANG), (0.36, SNATCH_POWER), (0.52, SNATCH_TOP), (0.68, SNATCH_TOP), (0.84, SNATCH_HANG), (1.0, SNATCH_FLOOR)), half=0.42), 'tall', SIDE_TURN),
    'split_snatch': (lift(((0.0, SNATCH_FLOOR), (0.2, SNATCH_HANG), (0.36, SNATCH_SPLIT), (0.52, SNATCH_TOP), (0.68, SNATCH_TOP), (0.84, SNATCH_HANG), (1.0, SNATCH_FLOOR)), half=0.42), 'tall', SIDE_TURN),
    'muscle_snatch': (lift(((0.0, SNATCH_MID_THIGH), (0.2, SNATCH_HANG), (0.36, SNATCH_PULLED), (0.5, SNATCH_TOP), (0.7, SNATCH_PULLED), (0.86, SNATCH_HANG), (1.0, SNATCH_MID_THIGH)), half=0.42), 'tall', SIDE_TURN),
    'hang_snatch': (lift(((0.0, SNATCH_MID_THIGH), (0.14, SNATCH_HANG), (0.34, SNATCH_DEEP), (0.52, SNATCH_TOP), (0.72, SNATCH_TOP), (0.88, SNATCH_HANG), (1.0, SNATCH_MID_THIGH)), half=0.42), 'tall', SIDE_TURN),
    'hang_snatch_low': (lift(((0.0, SNATCH_BELOW_KNEE), (0.18, SNATCH_HANG), (0.36, SNATCH_DEEP), (0.52, SNATCH_TOP), (0.72, SNATCH_TOP), (0.88, SNATCH_HANG), (1.0, SNATCH_BELOW_KNEE)), half=0.42), 'tall', SIDE_TURN),
    'snatch_blocks': (with_props(lift(((0.0, SNATCH_BLOCKS), (0.2, SNATCH_HANG), (0.36, SNATCH_DEEP), (0.52, SNATCH_TOP), (0.68, SNATCH_TOP), (0.84, SNATCH_HANG), (1.0, SNATCH_BLOCKS)), half=0.42), prop_rack=(0, 0, 0)), 'tall', SIDE_TURN),
    'power_snatch_blocks': (with_props(lift(((0.0, SNATCH_BLOCKS), (0.2, SNATCH_HANG), (0.36, SNATCH_POWER), (0.52, SNATCH_TOP), (0.68, SNATCH_TOP), (0.84, SNATCH_HANG), (1.0, SNATCH_BLOCKS)), half=0.42), prop_rack=(0, 0, 0)), 'tall', SIDE_TURN),
    'snatch_pull': (lift(((0.0, SNATCH_FLOOR), (0.3, SNATCH_HANG), (0.5, (0.03, 0.905, -2, 0, -0.1, 1.1)), (0.7, SNATCH_HANG), (1.0, SNATCH_FLOOR)), half=0.42), 'standing', SIDE_TURN),
    'snatch_deadlift': (lift(((0.0, SNATCH_FLOOR), (0.5, SNATCH_HANG), (1.0, SNATCH_FLOOR)), half=0.42), 'standing', SIDE_TURN),
    'snatch_balance': (moves(SNATCH_BALANCE_KEYS, hold=balance_grip), 'tall', SIDE_TURN),
    'deadlift_sumo': (moves(SUMO_KEYS, hold=hanging_bar(half=0.19), pole=(0.6, -1, 0), toe_out=28), 'standing', SIDE_TURN),
    'deadlift_trap': (moves(TRAP_KEYS, hold=trap_bar, pole=(0.2, -1, 0)), 'standing', SIDE_TURN),
    'deadlift_cable': (moves(TRAP_KEYS, arms=dumbbells_down(None), extra=cables_to_hands()), 'tall', SIDE_TURN),
    'deadlift_one_arm_side': (moves(ONE_SIDE_DEADLIFT_KEYS, arms=hands_on_hips, right_arm=None, hold=one_arm_side_bar), 'standing', 10),
    'deadlift_romanian': (bar_clip(hinging(66, knee=160, hips_back=0.3), 0.24, arm_out((0, -0.1, -1), 4), arm_out(HANGING_DOWN, 4), OVERHAND_HANGING, (0.15, 0.9, 0)), 'standing', SIDE_TURN),
    'deadlift_romanian_deficit': (with_props(moves(RDL_DEFICIT_KEYS, hold=hanging_bar(), toe_out=8), prop_platform=(0, ANKLE_Y, 0)), 'standing', SIDE_TURN),
    'deadlift_stiff': (bar_clip(hinging(80, knee=170, hips_back=0.24), 0.24, arm_out((0, -0.1, -1), 4), arm_out(HANGING_DOWN, 4), OVERHAND_HANGING, (0.15, 0.9, 0)), 'standing', SIDE_TURN),
    'deadlift_stiff_wide': (moves(WIDE_STIFF_KEYS, hold=hanging_bar(half=0.2), pole=(0.3, -1, 0), toe_out=16), 'standing', SIDE_TURN),
    'deadlift_stiff_dumbbell': (held_in(hinging(80, knee=170, hips_back=0.24), both_arms(dumbbells_down(elbow=4))), 'standing', SIDE_TURN),
    'deadlift_one_leg': (moves(ONE_LEG_DEADLIFT_KEYS, arms=dumbbells_down('prop_hanging_kettlebell', elbow=4), right_arm=hands_on_hips, right_pole=(0.05, -1, -0.2)), 'standing', SIDE_TURN),
    'good_morning_pins': (good_morning(lambda pose, t=0: hinging(86, knee=166, hips_back=0.2)(pose, 1 - t)), 'standing', SIDE_TURN),
    'good_morning_band': (moves(GOOD_MORNING_BAND_KEYS, arms=swinging(((0.0, (0.02, -0.14, 0.05)), (1.0, (0.02, -0.14, 0.05))), pole=(0.8, 0.1, -0.7), curl=70), extra=good_morning_loop), 'standing', SIDE_TURN),
    'jump_vertical_swing': (straight_arm(lambda pose, t=0: hinge(44 * (1 - t), knee=128, hips_back=0.28)(pose, t), 0.07, -82, 104, prop='prop_dumbbell_l', inward=True, curl=35), 'tall', SIDE_TURN),
    'hamstring_slide': (moves((supine(0.0), supine(0.5, left=(0.13, SUPINE_Y - 0.42, ANKLE_Z, 0), right=FLAT_FOOT, lift=0.12), supine(1.0)), arms=arms_by_side_supine, pole=UP_KNEE), 'floor', SIDE_ON),

    # Legs: stretches, on the back
    'stretch_hamstring_belt': (moves(LEG_UP_KEYS, arms=belt_hands(), pole=(0.05, 1, 0.3), right_pole=UP_KNEE, extra=belts_to_foot()), 'floor', SIDE_ON),
    'stretch_leg_up': (moves(LEG_UP_KEYS, arms=grab('shin', (0.075, -0.03, 0.26), pole=(0.8, 0, -0.5), palm=(0, 1, 0)), right_arm=arms_by_side_supine, pole=(0.05, 1, 0.3), right_pole=UP_KNEE), 'floor', SIDE_ON),
    'stretch_90_90': (moves(NINETY_KEYS, arms=grab('thigh', (0.08, 0.05, 0.56), pole=(0.8, 0, -0.5), palm=(0, 0, 1)), right_arm=grab('thigh', (0.08, 0.05, 0.56), pole=(0.8, 0, -0.5), palm=(0, 0, 1), other=True), pole=(0.05, 0.7, 0.8), right_pole=UP_KNEE), 'floor', SIDE_ON),
    'stretch_knee_to_chest': (moves(KNEE_CHEST_KEYS, arms=grab('shin', (0.075, -0.03, 0.39), pole=(1, -0.2, 0.3), palm=(-1, 0, 0)), right_arm=grab('shin', (0.075, -0.03, 0.39), pole=(1, -0.2, 0.3), palm=(-1, 0, 0), other=True), pole=(0.05, 0.5, 1), right_pole=UP_KNEE), 'floor', SIDE_ON),
    'stretch_ankle_on_knee': (moves(ANKLE_KNEE_KEYS, arms=grab('thigh', (0.08, 0.03, 0.56), pole=(1, -0.2, 0.3), palm=(-1, 0, 0), other=True), right_arm=grab('thigh', (0.08, 0.03, 0.56), pole=(1, -0.2, 0.3), palm=(-1, 0, 0)), pole=(0.9, 0.2, 0.6), right_pole=(0.05, 0.3, 1)), 'floor', SIDE_ON),
    'stretch_knee_across': (moves(KNEE_ACROSS_KEYS, arms=arms_out_on_floor, right_arm=grab('thigh', (0.08, 0.0, 0.5), pole=(-1, -0.2, 0.5), palm=(1, 0, 0), other=True), pole=(-0.8, 0.2, 0.5), right_pole=UP_KNEE), 'floor', SIDE_ON),
    'stretch_it_belt': (moves(LEG_ACROSS_KEYS, arms=arms_out_on_floor, right_arm=grab('foot', (0.072, -0.08, 0.04), pole=(-1, 0, 0.4), palm=(1, 0, 0), other=True), pole=(0.0, 0.8, 0.6), extra=belt_to_foot('_l', '_r')), 'floor', SIDE_ON),
    'stretch_windmills': (moves(WINDMILL_KEYS, arms=arms_out_on_floor, pole=(0.0, 0.7, 0.7)), 'floor', -50),
    'stretch_groin_belt': (moves(GROIN_BELT_KEYS, arms=belt_hands((0, -0.3, 0.26)), pole=(0.5, 0.4, 0.7), extra=belts_to_foot()), 'floor', -50),
    'stretch_legs_v': (moves(LEGS_V_KEYS, arms=arms_by_side_supine, pole=(0.3, 0.8, 0.3)), 'floor', -35),
    'stretch_butterfly_supine': (moves(BUTTERFLY_SUPINE_KEYS, arms=arms_by_side_supine, pole=(1, 0, 0.8), toe_out=0), 'floor', SIDE_ON),
    'stretch_bench_quad': (with_props(moves(BENCH_QUAD_KEYS, arms=arms_by_side_supine, right_arm=grab('foot', (0.072, -0.03, 0.05), pole=(-1, 0.6, -0.5), palm=(1, 0, 0)), pole=UP_KNEE, right_pole=(0.1, -1, -0.5)), prop_bench_flat=(0.06, 0.2, 0)), 'bench', SIDE_ON),

    # Legs: stretches, seated
    'stretch_seated_hamstring': (moves(SEATED_ONE_LEG_KEYS, arms=grab('foot', (0.072, -0.03, 0.05), pole=(0.8, 0, 0.2), palm=(-1, 0, 0)), pole=(0.03, 0.0, 1), right_pole=(0.9, -0.1, 0.5)), 'floor', SIDE_ON),
    'stretch_seated_belt': (moves(SEATED_LEAN_KEYS, arms=belt_hands((0, -0.38, -0.12)), pole=(0.03, 0, 1), extra=belts_to_foot()), 'floor', SIDE_ON),
    'stretch_seated_partner': (moves(SEATED_LEAN_KEYS, arms=hand_on_thigh, pole=(0.03, 0, 1)), 'floor', SIDE_ON),
    'stretch_seated_calf': (moves(SEATED_CALF_KEYS, arms=grab('foot', (0.072, -0.1, 0.03), pole=(0.8, 0, 0.3), palm=(0, 1, 0)), right_arm=hand_on_thigh, pole=(0.03, 0, 1), right_pole=(0.15, -0.3, 1)), 'floor', SIDE_ON),
    'stretch_straddle': (moves(STRADDLE_KEYS, arms=wrist_at((0.2, -0.32, 0.06), pole=(1, 0.3, 0.3), hand_dir=(0.1, -1, 0)), pole=(0.3, 0, 1), toe_out=20), 'floor', 25),
    'stretch_leg_grab': (moves(SEATED_FOLD_KEYS, arms=grab('thigh', (0.075, 0.1, 0.55), pole=(0.8, 0, -0.5), palm=(0, 0, 1)), pole=(0.03, 0, 1)), 'floor', SIDE_ON),
    'stretch_groin_seated': (moves(GROIN_SEATED_KEYS, arms=behind_the_neck, pole=(1, -0.2, 0.7), toe_out=0), 'floor', 25),
    'stretch_glute_seated': (moves(GLUTE_SEATED_KEYS, arms=floor_hands_back, pole=(0.9, 0.2, 0.6), right_pole=UP_KNEE), 'floor', SIDE_ON),
    'stretch_foot_belt_out': (moves(FOOT_BELT_KEYS_OUT, arms=belt_hands((0, -0.38, -0.12)), pole=(0.03, 0, 1), right_pole=UP_KNEE, extra=belts_to_foot()), 'floor', SIDE_ON),
    'stretch_foot_belt_in': (moves(FOOT_BELT_KEYS_IN, arms=belt_hands((0, -0.38, -0.12)), pole=(0.03, 0, 1), right_pole=UP_KNEE, extra=belts_to_foot()), 'floor', SIDE_ON),
    'stretch_chair_leg': (with_props(moves(CHAIR_LEG_KEYS, arms=wrist_at((0.24, 0.0, 0.5), pole=(1, 0.3, 0), hand_dir=(0, -0.3, -1), palm=(-1, 0, 0), curl=50), pole=(0.05, -1, 0.3)), prop_stool=(0, 0.03, 0)), 'bench', 20),

    # Legs: stretches, face down, kneeling and standing
    'stretch_prone_quad': (moves(PRONE_QUAD_KEYS, arms=forearm_on_floor, pole=(0.03, 0.05, -1)), 'floor', SIDE_ON),
    'stretch_prone_quad_belt': (moves(PRONE_QUAD_BELT_KEYS, arms=forearm_on_floor, pole=(0.03, 0.05, -1), right_pole=(0.03, 0.05, -1), extra=belt_to_foot('_r', '_r')), 'floor', SIDE_ON),
    'stretch_locust': (moves(LOCUST_KEYS, arms=forearm_on_floor, right_arm=grab('foot', (0.072, -0.03, 0.05), pole=(-0.8, 0.2, 0.7), palm=(0, -1, 0)), pole=(0.03, 0.05, -1)), 'floor', SIDE_ON),
    'stretch_iron_cross': (moves(IRON_CROSS_KEYS, arms=arms_out_on_floor, pole=(0.1, 0.05, -1)), 'floor', SIDE_ON),
    'stretch_flutter': (with_props(moves(FLUTTER_KEYS, arms=wrist_at((0.16, -0.7, 0.45), pole=(0.9, 0.2, -0.3), hand_dir=(0, -1, -0.2), curl=60), pole=(0.03, 0, -1)), prop_bench_flat=(0, -0.12, 0)), 'bench', SIDE_ON),
    'stretch_side_quad': (moves(SIDE_QUAD_KEYS, arms=floor_hand_side, right_arm=grab('foot', (0.072, -0.03, 0.05), pole=(-0.5, 0.3, 0.8), palm=(0, 1, 0)), roll=SIDE_LYING, pole=(0.9, 0, 0.1), right_pole=(0, -1, 0)), 'floor', -50),
    'stretch_side_quad_belt': (moves(SIDE_QUAD_KEYS, arms=floor_hand_side, right_arm=rope_in_hands, roll=SIDE_LYING, pole=(0.9, 0, 0.1), right_pole=(0, -1, 0), extra=belt_to_foot('_r', '_r')), 'floor', -50),
    'stretch_side_groin': (moves(SIDE_GROIN_KEYS, arms=floor_hand_side, right_arm=grab('shin', (0.075, -0.03, 0.3), pole=(0.3, 0.5, 0.8), palm=(-1, 0, 0)), roll=SIDE_LYING, pole=(0.9, 0, 0.1), right_pole=(0, 0, 1)), 'floor', SIDE_ON),
    'stretch_all_fours_quad': (kneeling_leg((-0.1, 0.56, 0.36), (-0.1, 0.5, 0.46), pole=(-0.05, 0.1, -1), tilt=(150, 200), extra=lambda pose, trunk: grab('foot', (0.072, -0.03, 0.05), pole=(0.8, 0.2, 0.5), palm=(0, 0, 1))(pose, '_r', -1, trunk)), 'floor', SIDE_ON),
    'stretch_hip_flexor_kneel': (moves(low_kneel_keys(4, -4), arms=hands_on_hips, right_pole=(0.05, -1, -0.1)), 'standing', SIDE_TURN),
    'stretch_kneeling_arch': (moves(KNEELING_ARCH_KEYS, arms=grab('foot', (0.072, 0.04, 0.03), pole=(0.8, 0.4, -0.3), palm=(0, -1, -0.3)), pole=(0.1, -1, 0)), 'standing', SIDE_TURN),
    'stretch_elevated_quad': (with_props(moves(ELEVATED_QUAD_KEYS, arms=hands_on_hips, right_pole=(0.03, -1, -0.5)), prop_bench_flat=BENCH_BEHIND), 'standing', SIDE_TURN),
    'stretch_standing_hip': (moves(STANDING_HIP_KEYS, arms=hands_on_hips), 'standing', SIDE_TURN),
    'stretch_standing_hamstring': (moves(STANDING_HAM_KEYS, arms=hand_on_thigh, right_arm=hand_on_thigh, right_pole=(0.1, -1, 0), extra=belt_to_foot('_l', '_l')), 'standing', SIDE_TURN),
    'stretch_toe_touch': (held_in(hinging(104, knee=172, hips_back=0.22), both_arms(standing_toe_touch)), 'standing', SIDE_TURN),
    'stretch_runner': (moves(RUNNER_KEYS, arms=wrist_at((0.24, -0.28, 0.06), pole=(1, 0.3, 0.3), hand_dir=(0.1, -1, 0)), right_pole=(0.05, -1, -0.1)), 'standing', SIDE_TURN),
    'stretch_worlds_greatest': (worlds_greatest, 'standing', SIDE_TURN),
    'stretch_downward_balance': (ball_balance, 'bench', SIDE_ON),
    'stretch_hip_circle_standing': (hip_circle_standing, 'tall', 15),
})


# Arms: the elbow is the only hinge that moves, so the upper arm stays where each clip puts it.
CURL = (14, 138)
ELBOWS_DOWN = (0.04, 0.02, -1)
AHEAD = (0, -1, 0)
BEHIND = (0, 1, 0)
ELBOWS_UP = (0.03, -0.08, 1)
ELBOW_ABOVE_SHOULDER = (0, 0.12, 1)
PRESS_DOWN = (115, 12)
OVERHEAD_EXTEND = (125, 10)
LYING_EXTEND = (10, 112)
PREACHER_ELBOWS = (0.02, -0.72, -0.7)
PREACHER_SWING = (0, -0.7, 0.72)
PREACHER_CURL = (10, 112)
INCLINE_ELBOWS = (0.04, 0.1, -1)
# Chest-up and head-end directions on the incline and decline boards, for arms held square to them.
INCLINE_UP, INCLINE_HEAD = (0, -0.45, 0.89), (0, 0.89, 0.45)
DECLINE_UP, DECLINE_HEAD = (0, 0.4, 0.92), (0, 0.92, -0.4)
LOW_PULLEY_AHEAD = (0, -0.5, 0.12)
HIGH_PULLEY_AHEAD = (0, -0.45, HIGH_PULLEY)
LOW_PULLEY_BEHIND = (0, 0.55, 0.12)
HIGH_PULLEY_BEHIND = (0, 0.5, HIGH_PULLEY)
# The palm's share of the way from underhand to overhand over a Zottman curl's rep.
ZOTTMAN_TURN = ((0.0, (0.0,)), (0.45, (0.0,)), (0.58, (1.0,)), (0.9, (1.0,)), (1.0, (0.0,)))


def bent_elbow(shoulder, upper, swing, bend, lower=TO_GRIP):
    """Where the end of the forearm is with the elbow on the upper arm's line, bent `bend` degrees from straight towards `swing`.

    Also returns the way an underhand palm faces there, the elbow's hinge, and the pole that keeps the elbow in place.
    """
    upper = upper.normalized()
    swing = (swing - upper * swing.dot(upper)).normalized()
    angle = math.radians(bend)
    fore = upper * math.cos(angle) + swing * math.sin(angle)
    return shoulder + upper * UPPER_ARM + fore * lower, swing * math.cos(angle) - upper * math.sin(angle), upper.cross(swing).normalized(), -swing


def elbow_clip(base, upper, swing, bends, palm='up', half=None, prop=None, arms=SIDES, rest=hands_on_hips, alternate=False, upper_end=None, turning=None, on_end=False):
    """Each forearm swings about its elbow: `upper` and `swing` are for the left and mirrored; `bends` run over the rep.

    `palm` is 'up' (underhand), 'down' (overhand) or 'in', and `turning` keys the share of the way from up to down over
    the rep. With `half` both hands hold one bar, `prop`; with `on_end` too, that prop is one weight held on end.
    Otherwise each hand has its own `prop`. With `alternate`, the arms take turns and the clip's rep is the pair of them.
    """
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        trunk = base(pose, ease(2 * phase) if alternate else ease(phase))
        center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
        for side, sign in SIDES:
            if (side, sign) not in arms:
                rest(pose, side, sign, trunk)
                continue
            if alternate:
                t = ease(2 * phase) if (phase < 0.5) == (side == '_l') else 0.0
            else:
                t = ease(phase)
            direction = side_pole(Vector(upper).lerp(Vector(upper_end or upper), t), sign)
            shoulder = shoulder_of(pose, side, trunk)
            if half:
                # The whole arm angles to the bar at full stretch, so the elbow can stay where it is all rep.
                direction = direction.normalized() + ACROSS * ((center.x + sign * half - shoulder.x) / REACH)
            grip, flexing, hinge, pole = bent_elbow(shoulder, direction, side_pole(Vector(swing), sign), lerp(*bends, t))
            if half:
                # The forearm leans out or in to reach the bar.
                elbow = shoulder + direction.normalized() * UPPER_ARM
                fore = (grip - elbow).normalized()
                lean = max(-0.9, min(0.9, (center.x + sign * half - elbow.x) / TO_GRIP))
                level = Vector((0, fore.y, fore.z)).normalized() * math.sqrt(1 - lean ** 2)
                grip = elbow + (level + ACROSS * lean) * TO_GRIP
                pole = elbow - (shoulder + grip) / 2 + pole * 0.001
            inward = hinge * sign
            if turning:
                share = through(phase, turning)[0]
                facing = (flexing * (1 - 2 * share) + inward * math.sin(math.pi * share)).normalized()
            else:
                facing = {'up': flexing, 'down': -flexing, 'in': inward}[palm]
            fore_dir, reached = apply_arm(pose, side, trunk, grip, pole, facing, handle=ACROSS if half and palm != 'in' else None, fade_twist=True)
            if prop and not half:
                held(pose, f'{prop}{side}', fore_dir, reached, facing)
        if prop and half:
            middle = (pose.grips['_l'] + pose.grips['_r']) / 2
            if on_end:
                along = (middle - pose.head['forearm_l']).normalized()
                pose.props[f'{prop}_l'] = (middle + along * 0.1, ACROSS.rotation_difference(along))
            else:
                pose.props[prop] = (middle, NOTHING_HELD)
        return pose
    return clip


def wrist_clip(base, upper, fore, palm, flex=(-40, 45), half=None, prop=None, arms=SIDES, rest=hand_on_thigh, curls=(FULL_GRIP_CURL, FULL_GRIP_CURL), later=0.0, twist=None):
    """The forearm stays still and the hand bends at the wrist, towards the palm when `flex` is positive.

    `upper`, `fore` and `palm` are for the left and mirrored. `curls` closes the fingers over the rep,
    `later` delays the right hand by this share of a rep, `twist` rolls the palm from `palm` to this.
    """
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        trunk = base(pose, ease(phase))
        center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
        for side, sign in SIDES:
            if (side, sign) not in arms:
                rest(pose, side, sign, trunk)
                continue
            t = ease((phase + (later if sign < 0 else 0)) % 1)
            shoulder = shoulder_of(pose, side, trunk)
            along = side_pole(Vector(fore).normalized(), sign)
            face = side_pole(Vector(palm).lerp(Vector(twist or palm), t), sign)
            face = (face - along * face.dot(along)).normalized()
            elbow = shoulder + side_pole(Vector(upper).normalized(), sign) * UPPER_ARM
            wrist = elbow + along * TO_WRIST
            if half:
                wrist.x = center.x + sign * half
            angle = math.radians(lerp(*flex, t))
            hand_axis = along * math.cos(angle) + face * math.sin(angle)
            hand_palm = face * math.cos(angle) - along * math.sin(angle)
            if later:
                # Taking turns on one bar: the bar stays put, so each wrist moves around it.
                wrist += along * GRIP_ALONG + face * GRIP_PALM - hand_axis * GRIP_ALONG - hand_palm * GRIP_PALM
            apply_arm(pose, side, trunk, wrist, elbow - (shoulder + wrist) / 2, hand_palm, hand_dir=hand_axis, curl=lerp(*curls, t), fade_twist=True)
            at = wrist + hand_axis * GRIP_ALONG + hand_palm * GRIP_PALM
            pose.grips[side] = at
            if prop and not half:
                held(pose, f'{prop}{side}', hand_axis, at, hand_palm)
        if prop and half:
            pose.props[prop] = ((pose.grips['_l'] + pose.grips['_r']) / 2, NOTHING_HELD)
        return pose
    return clip


def wrist_circles(phase):
    pose = Pose()
    trunk = stand(pose)
    angle = 2 * math.pi * phase
    for side, sign in SIDES:
        out = Vector((sign, -0.2, 0)).normalized()
        wrist = shoulder_of(pose, side, trunk) + out * WRIST_REACH * 0.97
        axis = (out + Vector((0, -0.5 * math.cos(angle), 0.5 * math.sin(angle)))).normalized()
        apply_arm(pose, side, trunk, wrist, Vector((sign * 0.1, 0.4, -1)), Vector((0, 0, -1)), hand_dir=axis, curl=10)
    return pose


def plate_squeeze(phase):
    pose = Pose()
    trunk = stand(pose)
    curl = lerp(38, 62, ease(phase))
    for (side, sign), bone in zip(SIDES, ('prop_plate', 'prop_plate_r')):
        wrist = shoulder_of(pose, side, trunk) + Vector((sign * 0.05, 0.02, -arm_span(6, TO_WRIST)))
        apply_arm(pose, side, trunk, wrist, Vector((sign * 0.25, 0.9, 0)), Vector((-sign, 0, 0)), hand_dir=Vector((0, 0, -1)), curl=curl)
        pose.props[bone] = (wrist + Vector((-sign * 0.02, -0.03, -0.08 - PLATE_RADIUS)), rot_z(90))
    return pose


def forearm_stretch_kneeling(phase):
    pose = Pose()
    t = ease(phase)
    lean = lerp(76, 66, t)
    trunk = rot_x(lean)
    apply_spine(pose, (0, lerp(0.34, 0.44, t), lerp(0.5, 0.45, t)), rot_x(lean * 0.9), trunk, trunk, rot_x(lean * 0.7), rot_x(lean * 0.4))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.11, 0.8, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.1, -1, 0)))
        # Palms flat, fingers back towards the knees.
        apply_arm(pose, side, trunk, (sign * 0.2, -0.05, 0.07), Vector((sign * 0.9, 0.3, 0.3)), Vector((0, 0, -1)), hand_dir=Vector((-sign * 0.1, 1, 0)), curl=0)
    return pose


def forearms_on_box(pose, t=0):
    pose.props['prop_box'] = (Vector((0, -0.55, 0)), NOTHING_HELD)
    return kneel(55)(pose, t)


def seated_forward(lean):
    return stool_seat('prop_stool', lean, lean)


def preacher_seat(pose, t=0):
    return stool_seat('prop_preacher', 2, 2)(pose, t)


def bench_dip(phase):
    pose = Pose()
    pose.props['prop_box'] = (Vector((0, 0.34, 0)), NOTHING_HELD)
    t = ease(phase)
    trunk = rot_x(4)
    shoulder_z = lerp(1.07, 0.8, t)
    apply_spine(pose, (0, 0.1, shoulder_z - 0.5), rot_x(lerp(4, 16, t)), trunk, trunk, rot_x(4), rot_x(0))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.13, -0.56, 0.09), rot_x(-35), Vector((sign * 0.12, -1, 0.3)))
        apply_arm(pose, side, trunk, (sign * 0.2, 0.2, 0.52), Vector((sign * 0.25, 1, 0)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.05, -1, 0)), curl=30)
    return pose


def dips_upright(rings=False):
    def clip(phase):
        pose = Pose()
        depth = ease(phase)
        half, grip_z = (RING_X, 1.3) if rings else (0.3, 1.27)
        if rings:
            pose.props['prop_rings'] = (Vector((0, -0.02, grip_z)), NOTHING_HELD)
        else:
            pose.props['prop_dip_bars'] = (ORIGIN, NOTHING_HELD)
        lean = 6
        body = rot_x(lean)
        # Arms locked at the top (the hands hold just above the bar), upper arms about level at the bottom.
        shoulder_z = grip_z + 0.02 + REACH * 0.985 - 0.27 * depth
        shoulder_rest = Vector((0, REST['upper_arm_l'][0].y, REST['upper_arm_l'][0].z)) - Vector(REST['hips'][0])
        hips_at = Vector((0, -0.02 + 0.06 * depth, shoulder_z)) - body @ shoulder_rest
        apply_spine(pose, hips_at, body, body, body, rot_x(lean * 0.5), rot_x(0))
        for side, sign in SIDES:
            apply_leg(pose, side, hips_at + Vector((sign * 0.07, 0.45, -0.55)), rot_x(130), Vector((sign * 0.1, -1, -0.1)))
            apply_arm(pose, side, body, (sign * half, -0.02, grip_z + 0.02), Vector((sign * 0.15, 1, 0.3)), Vector((-sign, 0, 0)))
        return pose
    return clip


def body_up(phase):
    """Up from low on the hands to straight arms, the hands staying still."""
    pose = Pose()
    half = 0.17
    body, _ = plank(pose, shoulder_height(half, 0.07, ease(phase), lowest=0.2), 0.07, 0.02, half)
    for side, sign in SIDES:
        plank_hand(pose, side, sign, body, (sign * half, HANDS_Y, 0.07))
    return pose


def bar_floor_press(phase):
    pose = Pose()
    body = lie_on_floor(pose)
    center = (shoulder_of(pose, '_l', body) + shoulder_of(pose, '_r', body)) / 2
    bar = center + Vector((0, 0, REACH * 0.95)).lerp(Vector((0, -0.08, 0.27)), ease(phase))
    pose.props['prop_barbell'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, body, bar + Vector((sign * 0.24, 0, 0)), side_pole(PRESS_POLE, sign), PALM_TO_FEET, handle=ACROSS)
    return pose


def dumbbell_floor_press(phase):
    pose = Pose()
    body = lie_on_floor(pose)
    for side, sign in SIDES:
        shoulder = shoulder_of(pose, side, body)
        top = shoulder + Vector((-sign * 0.03, 0, REACH * 0.97))
        bottom = shoulder + Vector((sign * 0.22, -0.1, 0.27))
        fore_dir, reached = apply_arm(pose, side, body, top.lerp(bottom, ease(phase)), side_pole(PRESS_POLE, sign), PALM_TO_FEET)
        held(pose, f'prop_dumbbell{side}', fore_dir, reached, PALM_TO_FEET)
    return pose


def ball_floor_press(phase):
    pose = Pose()
    body = lie_on_floor(pose)
    center = (shoulder_of(pose, '_l', body) + shoulder_of(pose, '_r', body)) / 2
    ball = center + Vector((0, 0, REACH * 0.9)).lerp(Vector((0, -0.08, 0.25)), ease(phase))
    pose.props['prop_ball'] = (ball, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, body, ball + Vector((sign * 0.11, 0, 0)), side_pole(PRESS_POLE, sign), Vector((-sign, 0, 0)), curl=30)
    return pose


def elbow_held_behind(pose, side, sign, trunk):
    """The other hand holds the raised elbow."""
    apply_arm(pose, side, trunk, pose.head['forearm_l'], Vector((sign, 0.2, -0.3)), Vector((1, 0, 0)), hand_dir=Vector((1, 0, 0.2)), curl=40)


def foam_roll_arm(phase):
    pose = Pose()
    shift = 0.07 * math.sin(2 * math.pi * phase)
    pose.props['prop_foam_roller'] = (Vector((0, 0.58, ROLLER_RADIUS)), NOTHING_HELD)
    body = lie_on_side(pose, (0, -0.2 + shift, 0.2))
    clavicle = scapula(body, 1, 20, 0)
    shoulder = shoulder_of(pose, '_l', clavicle)
    apply_arm(pose, '_l', clavicle, shoulder + Vector((0.06, 1, 0.02)).normalized() * WRIST_REACH * 0.9, Vector((0.1, 0, 1)), Vector((0, 0, -1)), hand_dir=Vector((0, 1, 0)), curl=15)
    apply_arm(pose, '_r', body, (0.42, -0.05 + shift, 0.05), Vector((0.2, 0.4, 1)), Vector((0, 0, -1)), hand_dir=Vector((0.5, 0.5, 0)), curl=5)
    return pose


def biceps_stretch_floor(phase):
    pose = Pose()
    t = ease(phase)
    lean = lerp(0, -14, t)
    trunk = rot_x(lean)
    apply_spine(pose, (0, 0.03, 0.14), trunk, trunk, trunk, rot_x(lean * 0.5), rot_x(0))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.16, -0.5, ANKLE_Z), rot_z(sign * 6), Vector((sign * 0.2, -0.3, 1)))
        wrist = shoulder_of(pose, side, trunk) + Vector((sign * 0.08, lerp(0.42, 0.5, t), lerp(-0.34, -0.2, t)))
        apply_arm(pose, side, trunk, wrist, Vector((sign, 0.1, 0.2)), Vector((0, 0, -1)), hand_dir=Vector((sign * 0.1, 1, -0.1)), curl=10)
    return pose


# Necks: only the head and neck move.
def neck_clip(base, keys, arms=hang_at_side, right_arm=None, extra=None):
    """The head follows (time, (nod, turn, tilt)) keys in degrees: forward, to its left, and over to its left."""
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        trunk = base(pose, ease(phase))
        nod, turn, tilt = through(phase, keys)
        chest = pose.rotation['spine2']
        pose.place('neck', chest @ rot_x(nod * 0.5) @ rot_y(tilt * 0.5) @ rot_z(turn * 0.5))
        pose.place('head', chest @ rot_x(nod) @ rot_y(tilt) @ rot_z(turn))
        for side, sign in SIDES:
            (arms if sign > 0 or not right_arm else right_arm)(pose, side, sign, trunk)
        if extra:
            extra(pose, trunk)
        return pose
    return clip


def forehead_hand(pose, side, sign, trunk):
    wrist = pose.point_on('head', (sign * 0.05, -0.27, 1.68))
    apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign, -0.2, -0.5)), trunk @ Vector((0, 1, 0)), hand_dir=trunk @ Vector((-sign, 0, 0.2)), curl=10)


def side_of_head_hand(pose, side, sign, trunk):
    wrist = pose.point_on('head', (sign * 0.2, -0.03, 1.7))
    apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign, -0.2, -0.5)), trunk @ Vector((-sign, 0, 0)), hand_dir=trunk @ Vector((0, -0.4, 1)), curl=10)


def plate_on_head(y):
    """Both hands hold a plate against the back of the head (y > 0) or the forehead (y < 0)."""
    def arm(pose, side, sign, trunk):
        head = pose.rotation['head']
        plate = pose.point_on('head', (0, y, 1.66))
        pose.props['prop_plate'] = (plate, head)
        apply_arm(pose, side, trunk, plate + head @ Vector((sign * 0.1, 0, -0.02)), trunk @ Vector((sign, 0, -0.3)), head @ Vector((-sign * 0.3, -1 if y > 0 else 1, 0)), hand_dir=head @ Vector((-sign, 0, 0.2)), curl=20)
    return arm


def prone_head_off_bench(pose, _t=0):
    pose.props['prop_bench_high'] = (ORIGIN, NOTHING_HELD)
    trunk = rot_x(90)
    apply_spine(pose, (0, 0.2, HIGH_BENCH_TOP + 0.12), trunk, trunk, trunk, rot_x(60), rot_x(35))
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.09, 0.96, HIGH_BENCH_TOP + 0.08), FOOT_POINTED_BACK, Vector((sign * 0.1, 0, -1)))
    return trunk


def supine_head_off_bench(pose, _t=0):
    bench = BENCHES[FLAT]
    pose.props[bench['prop']] = (ORIGIN, NOTHING_HELD)
    body = rot_x(-90)
    apply_spine(pose, Vector(bench['pivot']) + Vector((0, 0.36, BACK_DEPTH)), body, body, body, body, body)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.22, -0.4, ANKLE_Z), rot_z(sign * 10), Vector((sign * 0.35, -0.5, 1)))
    return body


def head_harness(pose, trunk):
    plate = Vector((0, -0.55, 0.2))
    pose.props['prop_plate'] = (plate, NOTHING_HELD)
    span(pose, 'prop_band', pose.point_on('head', (0, -0.1, 1.72)), plate)


def hands_on_roller(pose, side, sign, trunk):
    """Both hands hold a rolling pin to the back of the neck."""
    roller = pose.point_on('neck', (0, 0.12, 1.5))
    pose.props['prop_pole'] = (roller + UP * 0.05 * math.sin(2 * math.pi * pose.phase), NOTHING_HELD)
    apply_arm(pose, side, trunk, pose.props['prop_pole'][0] + Vector((sign * 0.22, 0, 0)), Vector((sign, -0.2, -0.4)), Vector((0, -1, 0)), handle=ACROSS)


NOD = ((0.0, (-30, 0, 0)), (0.5, (32, 0, 0)), (1.0, (-30, 0, 0)))
NOD_FROM_HANGING = ((0.0, (40, 0, 0)), (0.5, (-40, 0, 0)), (1.0, (40, 0, 0)))
NOD_FROM_BACK = ((0.0, (-30, 0, 0)), (0.5, (30, 0, 0)), (1.0, (-30, 0, 0)))
TILT_LEFT = ((0.0, (0, 0, 0)), (0.5, (0, 0, 36)), (1.0, (0, 0, 0)))
CHIN_DOWN = ((0.0, (0, 0, 0)), (0.5, (44, 0, 0)), (1.0, (0, 0, 0)))
PUSH_BACK = ((0.0, (0, 0, 0)), (0.5, (-7, 0, 0)), (1.0, (0, 0, 0)))
PUSH_SIDE = ((0.0, (0, 0, 0)), (0.5, (0, 0, 7)), (1.0, (0, 0, 0)))


# Abs: the torso bends between the hips and the chest, and the legs follow their own path.
def torso(lean=0, pelvis=None, y=0.03, z=0.885, left=(0.13, ANKLE_Y, ANKLE_Z, 0), right=None, twist=0, side=0, nod=0, x=0):
    """One moment of `torso_moves`: chest and pelvis lean (degrees), twist and side bend to the figure's left, hips at (x, y, z)."""
    return (x, y, z, lean, lean if pelvis is None else pelvis, twist, side, nod, *left, *(right or left))


def on_the_back(lean=-90, pelvis=-90, y=-0.28, z=BACK_DEPTH, left=(0.16, -0.72, ANKLE_Z, 0), right=None, twist=0, side=0, nod=8):
    return torso(lean, pelvis, y, z, left, right, twist, side, nod)


def rep(start, end):
    return ((0.0, start), (0.5, end), (1.0, start))


def torso_moves(keys, arms=None, right_arm=None, hold=None, pole=(0.12, -1, 0), right_pole=None, toe_out=8, extra=None, pelvis_pole=False):
    """The chest bends and twists above the hips, keyed with `torso` over the rep; the arms keep up with it.

    With `pelvis_pole` the knee poles turn with the pelvis, for legs that swing up past the hips.
    """
    def clip(phase):
        pose = Pose()
        pose.phase = phase
        x, y, z, lean, pelvis, twist, bend, nod, *ankles = through(phase, keys)
        chest = rot_x(lean) @ rot_y(bend) @ rot_z(twist)
        waist = rot_x((lean + pelvis) / 2) @ rot_y(bend / 2) @ rot_z(twist / 2)
        apply_spine(pose, (x, y, z), rot_x(pelvis), waist, chest, chest @ rot_x(nod / 2), chest @ rot_x(nod))
        for (side, sign), ankle, knee in zip(SIDES, (ankles[:4], ankles[4:]), (pole, right_pole or pole)):
            knee = rot_x(pelvis) @ Vector(knee) if pelvis_pole else Vector(knee)
            apply_leg(pose, side, (x + sign * ankle[0], ankle[1], ankle[2]), rot_x(ankle[3]) @ rot_z(sign * toe_out), side_pole(knee, sign))
        if hold:
            hold(pose, chest)
        else:
            for side, sign in SIDES:
                (arms if sign > 0 or not right_arm else right_arm)(pose, side, sign, chest)
        if extra:
            extra(pose, chest)
        return pose
    return clip


def arms_along_trunk(pose, side, sign, trunk):
    """Arms straight past the head, in line with the trunk."""
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + trunk @ Vector((sign * 0.03, 0, WRIST_REACH * 0.96)), trunk @ Vector((sign, 0, 0)), trunk @ Vector((0, 1, 0)), hand_dir=trunk @ UP, curl=8)


def arms_towards_feet(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + trunk @ Vector((sign * 0.05, -0.08, -WRIST_REACH * 0.95)), trunk @ Vector((sign, 0.2, 0)), trunk @ Vector((-sign, 0, 0)), hand_dir=trunk @ Vector((0, 0, -1)), curl=15)


def arms_straight_up(pose, side, sign, trunk):
    """Lying on the back, the hands reach for the ceiling."""
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((-sign * 0.02, 0, WRIST_REACH * 0.96)), Vector((sign, 0, 0)), Vector((-sign, 0, 0)), hand_dir=UP, curl=10)


def dead_bug_arm(pose, side, sign, trunk):
    active = pose.phase >= 0.5 if sign > 0 else pose.phase < 0.5
    t = ease(2 * pose.phase) if active else 0.0
    shoulder = shoulder_of(pose, side, trunk)
    up, back = Vector((-sign * 0.02, 0, 1)), Vector((sign * 0.03, 1, 0.1))
    along = up.lerp(back, t).normalized()
    apply_arm(pose, side, trunk, shoulder + along * WRIST_REACH * 0.96, Vector((sign, 0, 0)), Vector((-sign, 0, 0)), hand_dir=along, curl=10)


def beside_head(pose, side, sign, trunk):
    """Hands by the ears, holding a rope or handle."""
    wrist = pose.point_on('head', (sign * 0.12, -0.03, 1.6))
    apply_arm(pose, side, trunk, wrist, trunk @ Vector((sign * 0.45, -1, -0.3)), trunk @ Vector((-sign, 0, 0)), hand_dir=trunk @ Vector((-sign * 0.2, 0.1, 1)), curl=70)


def hold_bench_edge(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, (sign * 0.21, shoulder.y - 0.42, 0.5), Vector((sign, 0, 0.3)), Vector((-sign, 0, 0)), hand_dir=Vector((-sign * 0.1, -0.5, -1)), curl=50)


def hold_stool(pose, side, sign, trunk):
    apply_arm(pose, side, trunk, (sign * 0.21, 0.02, 0.56), Vector((sign, 0.6, 0.2)), Vector((-sign, 0, 0)), hand_dir=Vector((0, -0.2, -1)), curl=50)


def hold_top_of_decline(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((-sign * 0.06, 0.3, -0.03)), Vector((sign, 0, 0.5)), Vector((0, 0, 1)), hand_dir=Vector((0, 1, 0)), curl=50)


def ball_at_arms_length(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    ball = center + trunk @ Vector((0, -0.52, -0.18))
    pose.props['prop_ball'] = (ball, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, ball + trunk @ Vector((sign * 0.11, 0, 0)), trunk @ Vector((sign * 0.6, 0.2, -1)), trunk @ Vector((-sign, 0, 0)), curl=30)


def ball_held_close(pose, trunk):
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    ball = center + trunk @ Vector((0, -0.34, -0.14))
    pose.props['prop_ball'] = (ball, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, ball + trunk @ Vector((sign * 0.11, 0, 0)), trunk @ Vector((sign * 0.8, 0.2, -1)), trunk @ Vector((-sign, 0, 0)), curl=30)


def ball_thrown_from_overhead(pose, trunk):
    t = ease(pose.phase)
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    ball = center + trunk @ Vector((0, -0.5 * t, 0.55 - 0.45 * t))
    pose.props['prop_ball'] = (ball, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, ball + trunk @ Vector((sign * 0.11, 0, 0)), trunk @ Vector((sign, 0, -0.5)), trunk @ Vector((-sign, 0, 0)), curl=30)


def bar_pressed_from_chest(pose, trunk):
    press = smoothstep(0.45, 1, ease(pose.phase))
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    bar = center + trunk @ Vector((0, -0.16, 0.03)).lerp(Vector((0, -0.03, REACH * 0.92)), press)
    pose.props['prop_barbell'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bar + trunk @ Vector((sign * 0.25, 0, 0)), trunk @ Vector((sign * 0.8, -0.1, -0.6)), trunk @ Vector((0, -1, 0)), handle=trunk @ ACROSS)


def bell_held_up(world_arm=True):
    def arm(pose, side, sign, trunk):
        shoulder = shoulder_of(pose, side, trunk)
        palm = Vector((0, -1, 0))
        fore_dir, reached = apply_arm(pose, side, trunk, shoulder + Vector((0, 0.02, arm_span(5, TO_GRIP))), Vector((sign * 0.9, 0, -0.3)), palm)
        held(pose, f'prop_kettlebell{side}', fore_dir, reached, palm)
    return arm


def reach_down_the_leg(pose, side, sign, trunk):
    """The lower hand reaches straight down towards the foot."""
    shoulder = shoulder_of(pose, side, trunk)
    apply_arm(pose, side, trunk, shoulder + Vector((0, -0.04, -WRIST_REACH * 0.96)), Vector((sign, 0.3, 0)), Vector((sign * 0.1, -1, 0)), hand_dir=Vector((0, 0, -1)), curl=15)


def bell_held_down(pose, side, sign, trunk):
    shoulder = shoulder_of(pose, side, trunk)
    palm = Vector((-sign, 0, 0))
    fore_dir, reached = apply_arm(pose, side, trunk, shoulder + Vector((0, -0.04, -arm_span(6, TO_GRIP))), Vector((sign, 0.3, 0)), palm)
    held(pose, f'prop_hanging_kettlebell{side}', fore_dir, reached, palm)


def arm_over_and_hip(pose, side, sign, trunk):
    """For a side stretch: the left arm goes up and over, the right hand steadies the hip."""
    if sign > 0:
        arms_along_trunk(pose, side, sign, trunk)
    else:
        hands_on_hips(pose, side, sign, trunk)


def dumbbell_side_bend(pose, side, sign, trunk):
    if sign > 0:
        dumbbells_down()(pose, side, sign, trunk)
    else:
        hands_on_hips(pose, side, sign, trunk)


def one_arm_up_to_pulley(pose, side, sign, trunk):
    if sign > 0:
        shoulder = shoulder_of(pose, side, trunk)
        apply_arm(pose, side, trunk, shoulder + Vector((0.12, 0, 0.5)), Vector((1, 0, -0.1)), Vector((-1, 0, 0)))
    else:
        hands_on_hips(pose, side, sign, trunk)


def plank_forearms(phase):
    pose = Pose()
    body, _ = plank(pose, 0.31 + 0.006 * ease(phase), 0.08, 0.02, 0.2)
    for side, sign in SIDES:
        forearm_on_floor(pose, side, sign, body)
    return pose


def side_on_elbow(tilt_from, tilt_to, leg_lift=0.0, bend=0.0):
    """On the left side, head towards +y, propped on the left forearm. The straight body pivots up at the feet, by these degrees.

    `leg_lift` raises the upper foot and `bend` curls the chest towards it, as in a side jackknife.
    """
    # The line of the spine: on its side, the body rests on the left shoulder and hip, this far below it.
    feet = Vector((0, -0.62, 0.16))
    lying = rot_y(90) @ rot_x(-90)

    def clip(phase):
        pose = Pose()
        t = ease(phase)
        body = Quaternion((1, 0, 0), math.radians(lerp(tilt_from, tilt_to, t))) @ lying
        chest = body @ rot_y(-bend * t)
        hips_at = feet + body @ Vector((0, 0.0, 0.81))
        apply_spine(pose, hips_at, body, body @ rot_y(-bend * t / 2), chest, chest @ rot_x(6), chest @ rot_x(6))
        apply_leg(pose, '_l', feet - UP * 0.07, body, body @ Vector((0, -1, 0)))
        apply_leg(pose, '_r', feet + Vector((0, 0.03, 0.05 + leg_lift * t)), body, body @ Vector((0, -1, 0)))
        clavicle = scapula(body, 1, 10, 0)
        shoulder = shoulder_of(pose, '_l', clavicle)
        # The elbow stays on the floor, reaching past the shoulder as far as a low shoulder needs; the forearm lies flat.
        drop = min(max(shoulder.z - 0.06, 0.02), UPPER_ARM)
        elbow = Vector((shoulder.x, shoulder.y + math.sqrt(UPPER_ARM ** 2 - drop ** 2), 0.06))
        wrist = elbow + Vector((TO_WRIST, 0, 0))
        apply_arm(pose, '_l', clavicle, wrist, elbow - (shoulder + wrist) / 2, Vector((0, 0, -1)), hand_dir=Vector((1, 0, 0)), curl=15)
        (behind_the_neck if bend else hands_on_hips)(pose, '_r', -1, chest)
        return pose
    return clip


def hanging_moves(keys, half=0.24, palm=(0, 1, 0), grip_z=BAR_Z, grip_y=0.0, prop='prop_pullup_bar', above=False, pole=(0.1, -1, 0), pelvis_pole=False):
    """Hands fixed, the body hangs below them (or with `above`, is held up over them): each key is (lean, pelvis, rise, left ankle, right ankle), ankles (out, y, z, tilt) from the hips.

    With `pelvis_pole` the knee pole turns with the pelvis, for legs that swing up past the hips.
    """
    def clip(phase):
        pose = Pose()
        lean, pelvis, rise, *ankles = through(phase, keys)
        chest, hips = rot_x(lean), rot_x(pelvis)
        waist = rot_x((lean + pelvis) / 2)
        apply_spine(pose, ORIGIN, hips, waist, chest, rot_x(lean * 0.4), rot_x(lean * 0.1))
        clavicles = {side: scapula(chest, sign, 16 * (1 - rise), 0) for side, sign in SIDES}
        now = (shoulder_of(pose, '_l', clavicles['_l']) + shoulder_of(pose, '_r', clavicles['_r'])) / 2
        hanging = arm_out((0, 0, -1), 10)(half).length
        hips_at = Vector((0, grip_y + 0.02, grip_z + (hanging if above else rise * 0.3 - hanging))) - now
        apply_spine(pose, hips_at, hips, waist, chest, rot_x(lean * 0.4), rot_x(lean * 0.1))
        for (side, sign), ankle in zip(SIDES, (ankles[:4], ankles[4:])):
            knee = hips @ Vector(pole) if pelvis_pole else Vector(pole)
            apply_leg(pose, side, hips_at + Vector((sign * ankle[0], ankle[1], ankle[2])), rot_x(ankle[3]), side_pole(knee, sign))
        pose.props[prop] = (ORIGIN, NOTHING_HELD) if prop == 'prop_dip_bars' else (Vector((0, 0, BAR_Z)), NOTHING_HELD)
        for side, sign in SIDES:
            facing = side_pole(Vector(palm), sign)
            apply_arm(pose, side, clavicles[side], Vector((sign * half, grip_y, grip_z)), Vector((sign * 0.25, 0.3, 0.1)), facing, handle=ACROSS if palm[0] == 0 else None)
        return pose
    return clip


HANGING_ANKLE = (0.09, 0.09, -0.74, 35)
KNEES_RAISED_ANKLE = (0.09, -0.26, -0.27, -30)
THIGHS_LEVEL_ANKLE = (0.09, -0.43, -0.33, -10)
PIKED_ANKLE = (0.09, -0.3, 0.74, -150)
# A leg with the knee all but straight, from hip to ankle.
STRAIGHT_LEG = (bone_length('thigh_l') + bone_length('shin_l')) * 0.997
# Knees face the way the pelvis faces when the legs hang, and towards the head when they are raised to it.
LEG_BEND_POLE = (0.15, -0.8, 1)


def hip_joint(y, z, pelvis):
    """Where the hip joint is with the hips at (y, z) and the pelvis leaning this far."""
    joint = rot_x(pelvis) @ (Vector(REST['thigh_l'][0]) - Vector(REST['hips'][0]))
    return y + joint.y, z + joint.z


def rep_along(key_at, steps=6):
    """Keys for a rep whose moment a share s of the way is `key_at(s)`, for a path a straight line between two keys would cut short."""
    out = [(0.5 * i / steps, key_at(i / steps)) for i in range(steps + 1)]
    return (*out, *((1 - t, key) for t, key in reversed(out[:-1])))


def rollout(phase):
    """Kneeling with the hands on a barbell's plates' axle, which rolls out and back along the floor."""
    pose = Pose()
    t = ease(phase)
    y, z, lean = lerp(0.36, 0.04, t), lerp(0.45, 0.2, t), lerp(72, 88, t)
    trunk = flat_back(pose, (0, y, z), lean)
    for side, sign in SIDES:
        apply_leg(pose, side, (sign * 0.11, 0.82, 0.09), FOOT_POINTED_BACK, Vector((sign * 0.1, 0, -1)))
    center = (shoulder_of(pose, '_l', trunk) + shoulder_of(pose, '_r', trunk)) / 2
    # Arms stay straight: the bar is as far ahead of the shoulders as they reach.
    ahead = math.sqrt((REACH * 0.985) ** 2 - (center.z - PLATE_RADIUS) ** 2 - (0.22 - SHOULDER_X) ** 2)
    bar = Vector((0, center.y - ahead, PLATE_RADIUS))
    pose.props['prop_barbell'] = (bar, NOTHING_HELD)
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, bar + Vector((sign * 0.22, 0, 0)), Vector((sign * 0.3, 0.6, 0.6)), Vector((0, 0.3, -1)), handle=ACROSS)
    return pose


def both_hands_on(path, curl=60, prop=None, pole=(0.5, 0.3, -1)):
    """Both hands hold one point that follows `path(phase, pose)`; `prop` is held there, as (name, rotation)."""
    def hold(pose, trunk):
        point = path(pose.phase, pose)
        if prop:
            pose.props[prop[0]] = (point.copy(), prop[1])
        for side, sign in SIDES:
            apply_arm(pose, side, trunk, point + Vector((sign * 0.04, 0, 0)), side_pole(Vector(pole), sign), Vector((-sign, 0, 0)), curl=curl, fade_twist=True)
    return hold


def chop(start, end):
    return lambda phase, pose: Vector(start).lerp(Vector(end), ease(phase))


def pressing_ahead(far=-0.62):
    def path(phase, pose):
        center = (pose.head['clavicle_l'] + pose.head['clavicle_r']) / 2
        return pose.rotation['spine2'] @ Vector((0, lerp(-0.26, far, ease(phase)), -0.12)) + center
    return path


def sledge_swing(phase, pose):
    t = ease(phase)
    return Vector((0, -0.25, 1.86)).lerp(Vector((0, -0.52, 0.8)), t)


def sledge_hold(pose, trunk):
    point = sledge_swing(pose.phase, pose)
    t = ease(pose.phase)
    handle = Vector((0, -0.4 - 0.5 * t, 0.9 - 1.3 * t)).normalized()
    pose.props['prop_sledgehammer'] = (point, UP.rotation_difference(handle))
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, point - handle * (0.06 if sign > 0 else -0.08), Vector((sign * 0.7, 0.3, -0.6)), Vector((-sign, 0, 0)), curl=70)


def landmine_180(pose, trunk):
    # The hands hold the end of the bar past its plates, as on a jammer.
    anchor = Vector((0, -1.55, 0))
    level = math.sqrt(JAMMER_GRIP ** 2 - 1.2 ** 2)
    angle = math.radians(lerp(-20, 20, ease(pose.phase)))
    hand = Vector((level * math.sin(angle), anchor.y + level * math.cos(angle), 1.2))
    along = (hand - anchor).normalized()
    pose.props['prop_long_bar'] = (anchor, Vector((0, 1, 0)).rotation_difference(along))
    for side, sign in SIDES:
        apply_arm(pose, side, trunk, hand + Vector((sign * 0.04, 0, 0)), Vector((sign * 0.8, 0.2, -0.6)), Vector((-sign, 0, 0)), curl=70)


def spell_caster(pose, side, sign, trunk):
    t = ease(pose.phase)
    # A level swing from one hip to the other, the arms straight.
    target = Vector((lerp(0.3, -0.3, t), -0.2, 0.95))
    palm = Vector((0, 0, -1))
    fore_dir, reached = apply_arm(pose, side, trunk, target + Vector((sign * 0.14, 0, 0)), Vector((sign * 0.6, 0.4, -0.5)), palm, fade_twist=True)
    held(pose, f'prop_dumbbell{side}', fore_dir, reached, palm)


def bell_between_legs(pose, side, sign, trunk):
    """The hands take turns passing the kettlebell through the legs: the rep is one pass each way."""
    active = (pose.phase < 0.5) == (sign > 0)
    t = ease(2 * pose.phase) if active else 0.0
    shoulder = shoulder_of(pose, side, trunk)
    if active:
        target = Vector((lerp(sign * 0.3, 0.0, t), lerp(-0.12, 0.02, t), lerp(0.6, 0.62, t)))
        palm = Vector((-sign, 0, 0))
        fore_dir, reached = apply_arm(pose, side, trunk, target, Vector((sign, 0.2, 0.2)), palm)
        held(pose, 'prop_hanging_kettlebell_l', fore_dir, reached, palm)
    else:
        apply_arm(pose, side, trunk, shoulder + Vector((sign * 0.08, -0.03, -WRIST_REACH * 0.95)), Vector((sign, 0.2, 0.2)), Vector((-sign, 0, 0)), hand_dir=Vector((0, 0, -1)), curl=25)


def cable_ankle_strap(pulley):
    def extra(pose, trunk):
        add_pulley(pose, pulley)
        ankle = (pose.point_on('foot_l', (0.072, 0.03, 0.06)) + pose.point_on('foot_r', (-0.072, 0.03, 0.06))) / 2
        span(pose, 'prop_cable_l', Vector(pulley), ankle)
    return extra


def ball_under_back(pose, trunk):
    pose.props['prop_stability_ball'] = (Vector((0, 0.08, 0.3)), NOTHING_HELD)


def ball_under_calves(pose, trunk):
    pose.props['prop_stability_ball'] = (Vector((0, -0.84, 0.3)), NOTHING_HELD)


def ball_under_shins(pose, trunk):
    ankle = (pose.head['foot_l'] + pose.head['foot_r']) / 2
    # Under the lower shins with the legs out, rolling forward under the ankles as the knees come in.
    tucked = (PULL_IN_FEET_OUT[1] - ankle.y) / (PULL_IN_FEET_OUT[1] - PULL_IN_FEET_IN[1])
    pose.props['prop_stability_ball'] = (Vector((0, ankle.y + lerp(-0.08, 0.26, math.sqrt(max(tucked, 0.0))), 0.3)), NOTHING_HELD)


def pull_in_arms(pose, side, sign, trunk):
    plank_hand(pose, side, sign, trunk, (sign * 0.25, HANDS_Y, 0.07))


LEGS_FLAT = (0.1, -0.86, 0.09, -90)
FEET_UP_BENT = (0.12, -0.64, 0.54, -90)
LEGS_UP = (0.1, -0.3, 0.9, -175)
KNEES_OVER_HIPS = (0.1, -0.35, 0.46, -100)
BACK_KNEE_POLE = (0.25, -0.3, 1)


def leg_from_floor(y, z, pelvis, angle, tilt):
    """A straight leg raised this far from level, the hips at (y, z) on the back: an ankle for `torso`."""
    hip_y, hip_z = hip_joint(y, z, pelvis)
    return (0.1, hip_y - STRAIGHT_LEG * math.cos(math.radians(angle)), hip_z + STRAIGHT_LEG * math.sin(math.radians(angle)), tilt)


def leg_from_hanging(pelvis, angle, tilt):
    """A straight leg swung this far forward from hanging, for `hanging_moves`: an ankle from the hips."""
    hip_y, hip_z = hip_joint(0, 0, pelvis)
    return (0.09, hip_y - STRAIGHT_LEG * math.sin(math.radians(angle)), hip_z - STRAIGHT_LEG * math.cos(math.radians(angle)), tilt)


def bench_leg_raise(s):
    pelvis = lerp(-90, -108, s)
    return on_the_back(pelvis=pelvis, left=leg_from_floor(ON_BENCH_END['y'], ON_BENCH_END['z'], pelvis, lerp(-6, 88, s), lerp(-90, -170, s)), **ON_BENCH_END)


def jackknife_key(s):
    pelvis, z = lerp(-90, -68, s), lerp(BACK_DEPTH, 0.13, s)
    return on_the_back(lean=lerp(-90, -36, s), pelvis=pelvis, y=-0.05, z=z, left=leg_from_floor(-0.05, z, pelvis, lerp(0, 42, s), lerp(-90, -125, s)))


def hanging_leg_raise_key(s):
    pelvis = lerp(-2, -30, s)
    ankle = leg_from_hanging(pelvis, lerp(0, 88, s), lerp(35, -70, s))
    return (lerp(0, -8, s), pelvis, 0.0, *ankle, *ankle)


SEAT_POLE = (0.2, -1, 0.2)
ON_DECLINE = dict(lean=-110, pelvis=-110, y=-0.3, z=0.75, left=(0.12, -0.8, 0.42, 0))
ON_BENCH_END = dict(y=-0.35, z=0.57)
KNEELING = dict(y=0.1, z=0.53, left=(0.12, 0.46, 0.09, 150))
SEATED_LEGS = dict(y=0.03, z=0.59, left=(0.18, -0.4, ANKLE_Z, 0))
SEATED_FLOOR_V = dict(y=-0.1, z=0.14, left=(0.14, -0.58, 0.14, -50))
CRUNCH = rep(on_the_back(), on_the_back(lean=-54, nod=26))
TUCK_CRUNCH = rep(on_the_back(left=FEET_UP_BENT), on_the_back(lean=-58, nod=24, left=FEET_UP_BENT))
SIT_UP = rep(on_the_back(), on_the_back(lean=-8, pelvis=-52, z=0.14, nod=0))
THREE_QUARTER_SIT_UP = rep(on_the_back(), on_the_back(lean=-30, pelvis=-68, z=0.13, nod=6))
TWIST_CRUNCH = (
    (0.0, on_the_back()),
    (0.25, on_the_back(lean=-58, twist=-32, nod=24)),
    (0.5, on_the_back()),
    (0.75, on_the_back(lean=-58, twist=32, nod=24)),
    (1.0, on_the_back()),
)
OBLIQUE_CRUNCH_ONE_SIDE = rep(on_the_back(), on_the_back(lean=-58, twist=-32, nod=24))
AIR_BIKE_IN, AIR_BIKE_OUT = (0.13, -0.42, 0.5, -90), (0.13, -0.92, 0.34, -80)
AIR_BIKE = (
    (0.0, on_the_back(lean=-66, twist=-30, nod=20, left=AIR_BIKE_IN, right=AIR_BIKE_OUT)),
    (0.5, on_the_back(lean=-66, twist=30, nod=20, left=AIR_BIKE_OUT, right=AIR_BIKE_IN)),
    (1.0, on_the_back(lean=-66, twist=-30, nod=20, left=AIR_BIKE_IN, right=AIR_BIKE_OUT)),
)
HEEL_TOUCH = (
    (0.0, on_the_back(lean=-72, side=-18, nod=18, left=(0.24, -0.72, ANKLE_Z, 0))),
    (0.5, on_the_back(lean=-72, side=18, nod=18, left=(0.24, -0.72, ANKLE_Z, 0))),
    (1.0, on_the_back(lean=-72, side=-18, nod=18, left=(0.24, -0.72, ANKLE_Z, 0))),
)
REVERSE_CRUNCH = rep(on_the_back(y=-0.05, left=(0.12, -0.47, 0.55, -85)), on_the_back(y=-0.05, pelvis=-132, z=0.16, left=(0.1, -0.1, 0.72, -130)))
BENT_KNEE_RAISE = rep(on_the_back(left=FEET_UP_BENT), on_the_back(pelvis=-130, z=0.15, left=(0.1, -0.2, 0.72, -125)))
BOTTOMS_UP = rep(on_the_back(y=-0.05, left=LEGS_FLAT), on_the_back(y=-0.05, pelvis=-138, z=0.22, left=(0.1, 0.0, 0.98, -175)))
LEG_PULL_IN = rep(on_the_back(lean=-80, y=-0.05, left=(0.1, -0.86, 0.2, -90)), on_the_back(lean=-74, pelvis=-104, y=-0.05, left=(0.1, -0.33, 0.42, -80)))
BENCH_LEG_RAISE = rep_along(bench_leg_raise)
BENCH_PULL_IN = rep(on_the_back(left=(0.1, -1.16, 0.52, -90), **ON_BENCH_END), on_the_back(pelvis=-115, left=(0.1, -0.68, 0.86, -80), **ON_BENCH_END))
DECLINE_CRUNCH = rep(on_the_back(**ON_DECLINE), on_the_back(**{**ON_DECLINE, 'lean': -72}, nod=20))
DECLINE_SIT_UP = rep(on_the_back(**ON_DECLINE), on_the_back(**{**ON_DECLINE, 'lean': -22, 'pelvis': -70}, nod=4))
DECLINE_TWIST = rep(on_the_back(**ON_DECLINE), on_the_back(**{**ON_DECLINE, 'lean': -52, 'pelvis': -86}, twist=-34, nod=10))
DECLINE_REVERSE = rep(on_the_back(**{**ON_DECLINE, 'left': (0.12, -0.92, 0.6, -80)}), on_the_back(**{**ON_DECLINE, 'pelvis': -150, 'left': (0.1, -0.15, 1.27, -125)}))
JACKKNIFE = rep_along(jackknife_key)
COCOON = rep(on_the_back(y=-0.05, left=LEGS_FLAT), on_the_back(lean=-30, pelvis=-55, y=-0.05, z=0.14, left=(0.12, -0.52, 0.28, -60)))
TOE_TOUCH = rep(on_the_back(left=LEGS_UP), on_the_back(lean=-58, nod=22, left=LEGS_UP))
SCISSOR_HIGH, SCISSOR_LOW = (0.1, -0.76, 0.52, -90), (0.1, -0.86, 0.22, -90)
SCISSOR = ((0.0, on_the_back(y=-0.05, left=SCISSOR_HIGH, right=SCISSOR_LOW)), (0.5, on_the_back(y=-0.05, left=SCISSOR_LOW, right=SCISSOR_HIGH)), (1.0, on_the_back(y=-0.05, left=SCISSOR_HIGH, right=SCISSOR_LOW)))
DEAD_BUG_KNEE, DEAD_BUG_OUT = (0.12, -0.64, 0.54, -90), (0.12, -0.88, 0.2, -80)
DEAD_BUG = (
    (0.0, on_the_back(left=DEAD_BUG_KNEE)),
    (0.25, on_the_back(left=DEAD_BUG_OUT, right=DEAD_BUG_KNEE)),
    (0.5, on_the_back(left=DEAD_BUG_KNEE)),
    (0.75, on_the_back(left=DEAD_BUG_KNEE, right=DEAD_BUG_OUT)),
    (1.0, on_the_back(left=DEAD_BUG_KNEE)),
)
FROG_FEET = (0.03, -0.62, ANKLE_Z, 0)
FROG_SIT_UP = rep(on_the_back(left=FROG_FEET), on_the_back(lean=-26, pelvis=-66, z=0.13, nod=6, left=FROG_FEET))
RUSSIAN_TWIST = (
    (0.0, torso(lean=-38, pelvis=-52, twist=-38, **SEATED_FLOOR_V)),
    (0.5, torso(lean=-38, pelvis=-52, twist=38, **SEATED_FLOOR_V)),
    (1.0, torso(lean=-38, pelvis=-52, twist=-38, **SEATED_FLOOR_V)),
)
SEATED_TWIST = ((0.0, torso(twist=-36, **SEATED_LEGS)), (0.5, torso(twist=36, **SEATED_LEGS)), (1.0, torso(twist=-36, **SEATED_LEGS)))
STANDING_TWIST = ((0.0, torso(twist=-42)), (0.5, torso(twist=42)), (1.0, torso(twist=-42)))
# The same, starting turned to the figure's left, for hands that start on that side.
TWIST_FROM_LEFT = ((0.0, torso(twist=42)), (0.5, torso(twist=-42)), (1.0, torso(twist=42)))
SIDE_BEND = ((0.0, torso(side=-22)), (0.5, torso(side=22)), (1.0, torso(side=-22)))
BEND_AWAY = rep(torso(side=4), torso(side=-26))
STANDING_LEAN_OVER = rep(torso(), torso(side=-34, x=0.03))
WINDMILL_STANCE = dict(left=(0.27, ANKLE_Y, ANKLE_Z, 0))
WINDMILL = rep(torso(z=0.875, **WINDMILL_STANCE), torso(lean=20, pelvis=18, side=-72, x=0.14, z=0.83, nod=-16, **WINDMILL_STANCE))
KNEELING_CRUNCH = rep(torso(lean=4, pelvis=4, **KNEELING), torso(lean=62, pelvis=20, nod=14, **KNEELING))
KNEELING_TWIST_CRUNCH = (
    (0.0, torso(lean=4, pelvis=4, **KNEELING)),
    (0.25, torso(lean=52, pelvis=18, twist=-28, nod=14, **KNEELING)),
    (0.5, torso(lean=4, pelvis=4, **KNEELING)),
    (0.75, torso(lean=52, pelvis=18, twist=28, nod=14, **KNEELING)),
    (1.0, torso(lean=4, pelvis=4, **KNEELING)),
)
STANDING_CRUNCH = rep(torso(lean=2), torso(lean=46, pelvis=10, y=0.05, z=0.87, nod=12))
SEATED_CRUNCH = rep(torso(lean=-6, pelvis=-4, **SEATED_LEGS), torso(lean=46, pelvis=8, nod=14, **SEATED_LEGS))
SEAT_TUCK_LEGS = (0.11, -0.72, 0.28, -75)
SEAT_TUCKED = (0.11, -0.34, 0.66, -50)
SEAT_LEG_TUCK = rep(torso(lean=-32, pelvis=-20, y=0.03, z=0.59, left=SEAT_TUCK_LEGS), torso(lean=-8, pelvis=-38, y=0.03, z=0.59, left=SEAT_TUCKED))
BALL_CRUNCH = rep(on_the_back(lean=-82, pelvis=-74, y=-0.12, z=0.62, left=(0.17, -0.72, ANKLE_Z, 0)), on_the_back(lean=-40, pelvis=-68, y=-0.12, z=0.62, nod=18, left=(0.17, -0.72, ANKLE_Z, 0)))
BUTT_UPS = rep(torso(lean=80, y=0.33, z=0.28, left=(0.07, 1.1, 0.1, 40), nod=-20), torso(lean=118, y=0.28, z=0.55, left=(0.07, 0.98, 0.1, 40), nod=-20))
PULL_IN_FEET_OUT, PULL_IN_FEET_IN = (0.09, 0.82, 0.68, 145), (0.09, 0.4, 0.56, 150)
BALL_PULL_IN = rep(torso(lean=78, y=0.06, z=0.48, left=PULL_IN_FEET_OUT, nod=-22), torso(lean=88, pelvis=112, y=-0.06, z=0.58, left=PULL_IN_FEET_IN, nod=-22))
VACUUM = rep(torso(z=0.885), torso(lean=2, pelvis=-5, z=0.885))
SIT_REACH = dict(y=0.03, z=0.14, left=(0.06, -0.26, 0.09, -35))
SEATED_LEAN_OVER = ((0.0, torso(side=-20, **SIT_REACH)), (0.5, torso(side=20, **SIT_REACH)), (1.0, torso(side=-20, **SIT_REACH)))
HANG = (0.0, -2, 0.0, *HANGING_ANKLE, *HANGING_ANKLE)
HANG_KNEES = (-6, -32, 0.0, *KNEES_RAISED_ANKLE, *KNEES_RAISED_ANKLE)
HANG_THIGHS_LEVEL = (-6, -30, 0.0, *THIGHS_LEVEL_ANKLE, *THIGHS_LEVEL_ANKLE)
HANG_PIKE = (-44, -92, 0.0, *PIKED_ANKLE, *PIKED_ANKLE)
HANG_GORILLA = (-26, -48, 1.0, *KNEES_RAISED_ANKLE, *KNEES_RAISED_ANKLE)
SPRINT_LEFT = (-3, -14, 0.0, *KNEES_RAISED_ANKLE, *HANGING_ANKLE)
SPRINT_RIGHT = (-3, -14, 0.0, *HANGING_ANKLE, *KNEES_RAISED_ANKLE)


CLIPS.update({
    # Biceps: standing
    'curl_barbell': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, half=0.24, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_barbell_close': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, half=0.13, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_barbell_wide': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, half=0.36, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_reverse': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='down', half=0.24, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_drag': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, (14, 118), half=0.22, prop='prop_barbell', upper_end=(0.06, 0.62, -0.78)), 'standing', SIDE_TURN),
    'curl_dumbbell': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_dumbbell_alternate': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, prop='prop_dumbbell', alternate=True), 'standing', SIDE_TURN),
    'curl_hammer': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='in', prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_hammer_alternate': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='in', prop='prop_dumbbell', alternate=True), 'standing', SIDE_TURN),
    'curl_hammer_cross': (elbow_clip(standing(), ELBOWS_DOWN, (-0.55, -1, 0), CURL, palm='in', prop='prop_dumbbell', alternate=True), 'standing', 25),
    'curl_inner': (elbow_clip(standing(), ELBOWS_DOWN, (0.55, -1, 0), CURL, prop='prop_dumbbell'), 'standing', 25),
    'curl_reverse_dumbbell': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='down', prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_zottman': (elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, prop='prop_dumbbell', turning=ZOTTMAN_TURN), 'standing', SIDE_TURN),
    'curl_concentration_standing': (elbow_clip(hinge(62, knee=145), (0.02, -0.08, -1), AHEAD, CURL, prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_knee), 'standing', SIDE_TURN),

    # Biceps: seated and lying
    'curl_seated': (elbow_clip(seated(), ELBOWS_DOWN, AHEAD, CURL, prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_seated_inner': (elbow_clip(seated(), ELBOWS_DOWN, (0.55, -1, 0), CURL, prop='prop_dumbbell'), 'standing', 25),
    'curl_incline': (elbow_clip(on_bench_back(INCLINE), INCLINE_ELBOWS, AHEAD, CURL, prop='prop_dumbbell'), 'bench', SIDE_ON),
    'curl_incline_alternate': (elbow_clip(on_bench_back(INCLINE), INCLINE_ELBOWS, AHEAD, CURL, prop='prop_dumbbell', alternate=True), 'bench', SIDE_ON),
    'curl_incline_hammer': (elbow_clip(on_bench_back(INCLINE), INCLINE_ELBOWS, AHEAD, CURL, palm='in', prop='prop_dumbbell'), 'bench', SIDE_ON),
    'curl_incline_inner': (elbow_clip(on_bench_back(INCLINE), INCLINE_ELBOWS, (0.55, -1, 0), CURL, prop='prop_dumbbell'), 'bench', SIDE_ON),
    'curl_incline_bar': (elbow_clip(on_bench_back(INCLINE), INCLINE_ELBOWS, AHEAD, CURL, half=0.24, prop='prop_barbell'), 'bench', SIDE_ON),
    'curl_concentration': (elbow_clip(seated_forward(34), (0.0, -0.1, -1), AHEAD, CURL, prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_thigh), 'standing', SIDE_TURN),
    'curl_concentration_bar': (elbow_clip(seated_forward(34), (0.0, -0.1, -1), AHEAD, CURL, half=0.1, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_prone_incline': (elbow_clip(prone_incline, (0.02, -0.03, -1), AHEAD, CURL, prop='prop_dumbbell'), 'bench', SIDE_ON),
    'curl_spider': (elbow_clip(prone_incline, (0.02, -0.03, -1), AHEAD, CURL, half=0.2, prop='prop_barbell'), 'bench', SIDE_ON),
    'curl_high_bench': (elbow_clip(prone_high_bench, (0.04, -0.03, -1), AHEAD, CURL, half=0.24, prop='prop_barbell'), 'bench', SIDE_ON),
    # The arms start as low as the floor lets them: from a flat bench they cannot straighten all the way.
    'curl_lying': (elbow_clip(on_bench_back(FLAT), (0.14, 0.02, -1), AHEAD, (58, 128), prop='prop_dumbbell'), 'bench', SIDE_ON),
    'curl_lying_cable_floor': (cabled(elbow_clip(lambda pose, _t=0: lie_on_floor(pose), (0.04, -1, 0.03), UP, (14, 122), half=0.2, prop='prop_pole'), bar=('prop_pole', (0, -1.15, 0.12))), 'floor', SIDE_ON),
    'curl_lying_cable_high': (cabled(elbow_clip(on_bench_back(FLAT), (0.03, -0.08, 1), BEHIND, (10, 112), half=0.12, prop='prop_pole'), bar=('prop_pole', (0, 0.1, HIGH_PULLEY))), 'tall', SIDE_ON),

    # Biceps: preacher bench
    'curl_preacher': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, half=0.2, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_preacher_reverse': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, palm='down', half=0.2, prop='prop_barbell'), 'standing', SIDE_TURN),
    'curl_preacher_dumbbell': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_preacher_one_arm': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_thigh), 'standing', SIDE_TURN),
    'curl_preacher_hammer': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, palm='in', prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'curl_preacher_zottman': (elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, prop='prop_dumbbell', turning=ZOTTMAN_TURN), 'standing', SIDE_TURN),
    'curl_preacher_cable': (cabled(elbow_clip(preacher_seat, PREACHER_ELBOWS, PREACHER_SWING, PREACHER_CURL, half=0.2, prop='prop_pole'), bar=('prop_pole', (0, -0.95, 0.12))), 'standing', SIDE_TURN),

    # Biceps: cables
    'curl_cable': (cabled(elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, half=0.24, prop='prop_pole'), bar=('prop_pole', LOW_PULLEY_AHEAD)), 'standing', SIDE_TURN),
    'curl_cable_reverse': (cabled(elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='down', half=0.24, prop='prop_pole'), bar=('prop_pole', LOW_PULLEY_AHEAD)), 'standing', SIDE_TURN),
    'curl_cable_hammer': (cabled(elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, palm='in', half=0.06), left=LOW_PULLEY_AHEAD, right=LOW_PULLEY_AHEAD), 'standing', SIDE_TURN),
    'curl_cable_one_arm': (cabled(elbow_clip(standing(), ELBOWS_DOWN, AHEAD, CURL, arms=FLAT_ONLY_LEFT), left=(0.2, -0.55, 0.12)), 'standing', SIDE_TURN),
    'curl_cable_high': (cabled(elbow_clip(standing(), (1, 0.02, 0.04), UP, (10, 118)), left=(1.05, 0, 1.62), right=(-1.05, 0, 1.62)), 'tall', 20),

    # Biceps and triceps: stretches and rolling
    'smr_brachialis': (foam_roll_arm, 'floor', SIDE_ON),
    'stretch_biceps_floor': (biceps_stretch_floor, 'floor', SIDE_ON),
    'stretch_biceps_standing': (rows(standing(), arm_out((0.02, 0.32, -1), 6), arm_out((0.02, 1, -0.7), 6), (0, 1, 0), (0.2, 0.4, 1), curl=45), 'standing', BACK_TURN),
    'stretch_triceps': (elbow_clip(standing(), (0.1, -0.05, 1), BEHIND, (138, 148), arms=FLAT_ONLY_LEFT, rest=elbow_held_behind), 'tall', SHOULDER_TURN),
    'stretch_triceps_seated': (elbow_clip(lambda pose, _t=0: sit_on_floor(pose), (0.1, -0.05, 1), BEHIND, (138, 148), arms=FLAT_ONLY_LEFT, rest=elbow_held_behind), 'standing', SHOULDER_TURN),

    # Triceps: cables
    'triceps_pushdown': (cabled(elbow_clip(standing(5), ELBOWS_DOWN, AHEAD, PRESS_DOWN, palm='down', half=0.15, prop='prop_pole'), bar=('prop_pole', HIGH_PULLEY_AHEAD)), 'tall', SIDE_TURN),
    'triceps_pushdown_reverse': (cabled(elbow_clip(standing(5), ELBOWS_DOWN, AHEAD, PRESS_DOWN, half=0.15, prop='prop_pole'), bar=('prop_pole', HIGH_PULLEY_AHEAD)), 'tall', SIDE_TURN),
    'triceps_pushdown_rope': (cabled(elbow_clip(standing(5), ELBOWS_DOWN, AHEAD, PRESS_DOWN, palm='in', half=0.07), left=HIGH_PULLEY_AHEAD, right=HIGH_PULLEY_AHEAD), 'tall', SIDE_TURN),
    'triceps_pushdown_close': (cabled(elbow_clip(standing(5), ELBOWS_DOWN, AHEAD, PRESS_DOWN, palm='down', half=0.08, prop='prop_pole'), bar=('prop_pole', HIGH_PULLEY_AHEAD)), 'tall', SIDE_TURN),
    'triceps_pushdown_one_arm': (cabled(elbow_clip(standing(5), ELBOWS_DOWN, AHEAD, PRESS_DOWN, arms=FLAT_ONLY_LEFT), left=(0.2, -0.45, HIGH_PULLEY)), 'tall', SIDE_TURN),
    'triceps_overhead_cable': (cabled(elbow_clip(standing(24), (0.03, -0.62, 0.72), BEHIND, OVERHEAD_EXTEND, palm='in', half=0.07), left=LOW_PULLEY_BEHIND, right=LOW_PULLEY_BEHIND), 'tall', SIDE_TURN),
    'triceps_overhead_cable_one_arm': (cabled(elbow_clip(standing(4), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', arms=FLAT_ONLY_LEFT), left=(0.2, 0.55, 0.12)), 'tall', SIDE_TURN),
    'triceps_kneeling_cable': (cabled(elbow_clip(kneel(30), (0.03, -0.75, 0.62), BEHIND, OVERHEAD_EXTEND, palm='down', half=0.1, prop='prop_pole'), bar=('prop_pole', (0, 0.55, HIGH_PULLEY))), 'tall', SIDE_TURN),
    'triceps_incline_cable': (cabled(elbow_clip(on_bench_back(INCLINE), INCLINE_UP, INCLINE_HEAD, LYING_EXTEND, palm='down', half=0.12, prop='prop_pole'), bar=('prop_pole', (0, 1.0, HIGH_PULLEY))), 'tall', SIDE_ON),
    'triceps_lying_cable': (cabled(elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, palm='down', half=0.1, prop='prop_pole'), bar=('prop_pole', (0, 1.1, 0.12))), 'bench', SIDE_ON),
    'triceps_lying_rope_low': (cabled(elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, palm='in', half=0.06), left=(0, 1.1, 0.12), right=(0, 1.1, 0.12)), 'bench', SIDE_ON),

    # Triceps: overhead
    'triceps_overhead_bar': (elbow_clip(standing(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='down', half=0.12, prop='prop_barbell'), 'tall', SIDE_TURN),
    'triceps_overhead_dumbbell': (elbow_clip(standing(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', half=0.04, prop='prop_dumbbell', on_end=True), 'tall', SIDE_TURN),
    'triceps_overhead_seated': (elbow_clip(seated(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', half=0.04, prop='prop_dumbbell', on_end=True), 'tall', SIDE_TURN),
    'triceps_overhead_one_arm': (elbow_clip(standing(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', prop='prop_dumbbell', arms=FLAT_ONLY_LEFT), 'tall', SIDE_TURN),
    'triceps_overhead_one_arm_seated': (elbow_clip(seated(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_thigh), 'tall', SIDE_TURN),
    'triceps_overhead_kettlebell': (elbow_clip(standing(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', half=0.04, prop='prop_hanging_kettlebell', on_end=True), 'tall', SIDE_TURN),
    'triceps_overhead_empty': (elbow_clip(standing(), ELBOWS_UP, BEHIND, OVERHEAD_EXTEND, palm='in', half=0.05), 'tall', SIDE_TURN),

    # Triceps: lying
    'skull_crusher': (elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, palm='down', half=0.11, prop='prop_barbell'), 'bench', SIDE_ON),
    'skull_crusher_behind_head': (elbow_clip(on_bench_back(FLAT), (0, 0.42, 1), BEHIND, (10, 118), palm='down', half=0.11, prop='prop_barbell'), 'bench', SIDE_ON),
    'skull_crusher_chin': (elbow_clip(on_bench_back(FLAT), (0, -0.05, 1), BEHIND, (10, 92), palm='down', half=0.11, prop='prop_barbell'), 'bench', SIDE_ON),
    'skull_crusher_decline': (elbow_clip(on_bench_back(DECLINE), DECLINE_UP, DECLINE_HEAD, LYING_EXTEND, palm='down', half=0.11, prop='prop_barbell'), 'bench', SIDE_ON),
    'skull_crusher_incline': (elbow_clip(on_bench_back(INCLINE), INCLINE_UP, INCLINE_HEAD, LYING_EXTEND, palm='down', half=0.11, prop='prop_barbell'), 'tall', SIDE_ON),
    'skull_crusher_dumbbell': (elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, palm='in', prop='prop_dumbbell'), 'bench', SIDE_ON),
    'skull_crusher_dumbbell_pronated': (elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, palm='down', prop='prop_dumbbell'), 'bench', SIDE_ON),
    'skull_crusher_decline_dumbbell': (elbow_clip(on_bench_back(DECLINE), DECLINE_UP, DECLINE_HEAD, LYING_EXTEND, palm='in', prop='prop_dumbbell'), 'bench', SIDE_ON),
    'skull_crusher_one_arm_pronated': (elbow_clip(on_bench_back(FLAT), (0.02, 0.05, 1), (-1, 0.3, 0), (10, 104), palm='down', prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=arm_at_side), 'bench', SIDE_ON),
    'skull_crusher_one_arm_supinated': (elbow_clip(on_bench_back(FLAT), ELBOW_ABOVE_SHOULDER, BEHIND, LYING_EXTEND, prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=arm_at_side), 'bench', SIDE_ON),
    'tate_press': (elbow_clip(on_bench_back(FLAT), (0.72, -0.03, 1), (-1, 0, 0), (12, 104), palm='down', prop='prop_dumbbell'), 'bench', 20),
    'jm_press': (elbow_clip(on_bench_back(FLAT), (0, 0.02, 1), BEHIND, (10, 88), palm='down', half=0.13, prop='prop_barbell', upper_end=(0, -0.55, 0.85)), 'bench', SIDE_ON),

    # Triceps: presses
    'bench_press_close': (barbell_press(FLAT, half=0.14), 'bench', SIDE_ON),
    'bench_press_reverse_grip': (barbell_press(FLAT, half=0.2, palm=(0, 1, 0)), 'bench', SIDE_ON),
    'bench_press_partial': (barbell_press(FLAT, depth=0.62), 'bench', SIDE_ON),
    'floor_press_barbell': (bar_floor_press, 'floor', SIDE_ON),
    'floor_press_dumbbell': (dumbbell_floor_press, 'floor', SIDE_ON),
    'supine_chest_throw': (ball_floor_press, 'floor', SIDE_ON),

    # Triceps: bodyweight and machines
    'bench_dip': (bench_dip, 'standing', SIDE_TURN),
    'dips_upright': (dips_upright(), 'tall', SIDE_TURN),
    'dips_rings': (dips_upright(rings=True), 'tall', SIDE_TURN),
    'pushup_close': (pushup(half=0.12), 'floor', SIDE_ON),
    'incline_pushup_close': (pushup(half=0.12, hand_z=0.52, prop='hands'), 'bench', SIDE_ON),
    'body_up': (body_up, 'floor', SIDE_ON),
    'triceps_machine': (elbow_clip(seated(), (0.04, -0.1, -1), AHEAD, (112, 14), palm='in'), 'standing', SIDE_TURN),
    'triceps_dip_machine': (rows(seated(-4), near(0.08, -0.28, -0.05), near(0.08, 0.03, -arm_span(10, TO_GRIP)), NEUTRAL, (0.2, 0.9, 0), curl=FULL_GRIP_CURL), 'standing', SIDE_TURN),

    # Triceps: kickbacks
    'kickback': (elbow_clip(hinge(68, knee=150), (0.03, 1, -0.12), (0, 0, -1), (102, 10), palm='in', prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'kickback_one_arm': (elbow_clip(hinge(68, knee=150), (0.03, 1, -0.12), (0, 0, -1), (102, 10), palm='in', prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_knee), 'standing', SIDE_TURN),
    'kickback_seated': (elbow_clip(seated_forward(55), (0.03, 1, -0.12), (0, 0, -1), (102, 10), palm='in', prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'kickback_seated_one_arm': (elbow_clip(seated_forward(55), (0.03, 1, -0.12), (0, 0, -1), (102, 10), palm='in', prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hand_on_thigh), 'standing', SIDE_TURN),

    # Forearms: wrist curls
    'wrist_curl_bar': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, UP, half=0.2, prop='prop_barbell'), 'standing', SIDE_TURN),
    'wrist_curl_bar_down': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, (0, 0, -1), flex=(40, -50), half=0.2, prop='prop_barbell'), 'standing', SIDE_TURN),
    'wrist_curl_dumbbell': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, UP, prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'wrist_curl_dumbbell_down': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, (0, 0, -1), flex=(40, -50), prop='prop_dumbbell'), 'standing', SIDE_TURN),
    'wrist_curl_one_arm': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, UP, prop='prop_dumbbell', arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'wrist_curl_one_arm_down': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, (0, 0, -1), flex=(40, -50), prop='prop_dumbbell', arms=FLAT_ONLY_LEFT), 'standing', SIDE_TURN),
    'wrist_curl_over_bench': (wrist_clip(forearms_on_box, (0.03, -0.1, -1), AHEAD, UP, half=0.18, prop='prop_barbell', rest=hang_at_side), 'floor', SIDE_ON),
    'wrist_curl_over_bench_down': (wrist_clip(forearms_on_box, (0.03, -0.1, -1), AHEAD, (0, 0, -1), flex=(40, -50), half=0.18, prop='prop_barbell', rest=hang_at_side), 'floor', SIDE_ON),
    'wrist_curl_dumbbell_over_bench': (wrist_clip(forearms_on_box, (0.03, -0.1, -1), AHEAD, UP, prop='prop_dumbbell', rest=hang_at_side), 'floor', SIDE_ON),
    'wrist_curl_dumbbell_over_bench_down': (wrist_clip(forearms_on_box, (0.03, -0.1, -1), AHEAD, (0, 0, -1), flex=(40, -50), prop='prop_dumbbell', rest=hang_at_side), 'floor', SIDE_ON),
    'wrist_curl_cable': (cabled(wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, UP, half=0.2, prop='prop_pole'), bar=('prop_pole', (0, -0.95, 0.12))), 'standing', SIDE_TURN),
    'wrist_curl_behind_back': (wrist_clip(standing(), (0.04, 0.14, -1), (0.02, 0.14, -1), BEHIND, half=0.22, prop='prop_barbell'), 'standing', BACK_TURN),
    'finger_curl': (wrist_clip(seated_forward(26), (0.03, -0.25, -1), AHEAD, UP, flex=(-30, 20), half=0.2, prop='prop_barbell', curls=(38, FULL_GRIP_CURL)), 'standing', SIDE_TURN),
    'wrist_rotation_bar': (wrist_clip(standing(), (0.04, -1, -0.1), (0.02, -1, -0.04), (0, 0, -1), flex=(40, -40), half=0.22, prop='prop_barbell', later=0.5), 'standing', SIDE_TURN),
    'wrist_roller': (wrist_clip(standing(), (0.04, -1, -0.1), (0.02, -1, -0.04), (0, 0, -1), flex=(35, -45), half=0.14, prop='prop_pole', later=0.5), 'standing', SIDE_TURN),
    'forearm_rotation': (wrist_clip(prone_high_bench, (0.04, -0.03, -1), AHEAD, (0, 0, -1), flex=(0, 0), prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hang_at_side, twist=(-1, 0, 0)), 'bench', SIDE_ON),
    'forearm_rotation_supine': (wrist_clip(prone_high_bench, (0.04, -0.03, -1), AHEAD, (0, 0, 1), flex=(0, 0), prop='prop_dumbbell', arms=FLAT_ONLY_LEFT, rest=hang_at_side, twist=(-1, 0, 0)), 'bench', SIDE_ON),
    'wrist_circles': (wrist_circles, 'standing', 15),
    'plate_squeeze': (plate_squeeze, 'standing', SIDE_TURN),
    'stretch_forearm_kneeling': (forearm_stretch_kneeling, 'bench', SIDE_ON),
    'farmers_walk': (gait(0.14, 0.05, 0.62, 0.0, 2, 0.87, 0.01, arms=dumbbells_down()), 'standing', SIDE_TURN),
    'rickshaw_carry': (gait(0.14, 0.05, 0.62, 0.0, 3, 0.87, 0.01, hold=trap_bar), 'standing', SIDE_TURN),

    # Neck
    'stretch_chin_to_chest': (neck_clip(lambda pose, _t=0: sit_on_floor(pose), CHIN_DOWN, arms=behind_the_neck), 'standing', SIDE_TURN),
    'stretch_neck_side': (neck_clip(standing(), TILT_LEFT, arms=hang_at_side, right_arm=hang_at_side), 'standing', 15),
    'neck_isometric_front': (neck_clip(standing(), PUSH_BACK, arms=forehead_hand), 'standing', SIDE_TURN),
    'neck_isometric_side': (neck_clip(standing(), PUSH_SIDE, arms=side_of_head_hand, right_arm=hands_on_hips), 'standing', 15),
    'neck_plate_prone': (neck_clip(prone_head_off_bench, NOD_FROM_HANGING, arms=plate_on_head(0.16)), 'bench', SIDE_ON),
    'neck_plate_supine': (neck_clip(supine_head_off_bench, NOD_FROM_BACK, arms=plate_on_head(-0.14)), 'bench', SIDE_ON),
    'neck_harness': (neck_clip(seated_forward(30), NOD, arms=hand_on_thigh, extra=head_harness), 'standing', SIDE_TURN),
    'smr_neck': (neck_clip(standing(), CHIN_DOWN, arms=hands_on_roller), 'standing', SIDE_TURN),

    # Abs: on the floor
    'crunch': (torso_moves(CRUNCH, arms=behind_the_neck, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'crunch_arms_overhead': (torso_moves(CRUNCH, arms=arms_along_trunk, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'crunch_weighted': (torso_moves(CRUNCH, arms=plate_on_chest, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'crunch_tuck': (torso_moves(TUCK_CRUNCH, arms=crossed_on_chest, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'crunch_legs_on_ball': (torso_moves(TUCK_CRUNCH, arms=behind_the_neck, pole=LEG_BEND_POLE, pelvis_pole=True, extra=ball_under_calves), 'floor', SIDE_ON),
    'crunch_cable': (cabled(torso_moves(CRUNCH, arms=beside_head, pole=BACK_KNEE_POLE), left=(0, 1.05, 0.12), right=(0, 1.05, 0.12)), 'floor', SIDE_ON),
    'crunch_cross_body': (torso_moves(TWIST_CRUNCH, arms=behind_the_neck, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'crunch_oblique': (torso_moves(OBLIQUE_CRUNCH_ONE_SIDE, arms=behind_the_neck, right_arm=arms_by_side_supine, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'sit_up': (torso_moves(SIT_UP, arms=behind_the_neck, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'sit_up_three_quarter': (torso_moves(THREE_QUARTER_SIT_UP, arms=behind_the_neck, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'sit_up_frog': (torso_moves(FROG_SIT_UP, arms=behind_the_neck, pole=(1, -0.2, 0.5), toe_out=30), 'floor', SIDE_ON),
    'sit_up_plate': (torso_moves(THREE_QUARTER_SIT_UP, arms=plate_on_chest, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'sit_up_throw': (torso_moves(SIT_UP, hold=ball_thrown_from_overhead, pole=BACK_KNEE_POLE), 'floor', SIDE_ON),
    'jackknife': (torso_moves(JACKKNIFE, arms=arms_along_trunk, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'cocoon': (torso_moves(COCOON, arms=arms_along_trunk, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'toe_touchers': (torso_moves(TOE_TOUCH, arms=arms_straight_up, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'reverse_crunch': (torso_moves(REVERSE_CRUNCH, arms=arms_by_side_supine, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'hip_raise_bent_knee': (torso_moves(BENT_KNEE_RAISE, arms=arms_by_side_supine, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'bottoms_up': (torso_moves(BOTTOMS_UP, arms=arms_by_side_supine, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'leg_pull_in': (torso_moves(LEG_PULL_IN, arms=floor_hands_back, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'scissor_kick': (torso_moves(SCISSOR, arms=arms_by_side_supine, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'air_bike': (torso_moves(AIR_BIKE, arms=behind_the_neck, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'heel_touchers': (torso_moves(HEEL_TOUCH, arms=arms_towards_feet, pole=(0.5, -0.3, 1)), 'floor', SIDE_ON),
    'dead_bug': (torso_moves(DEAD_BUG, arms=dead_bug_arm, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'russian_twist': (torso_moves(RUSSIAN_TWIST, hold=ball_held_close, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'russian_twist_cable': (cabled(torso_moves(RUSSIAN_TWIST, hold=ball_held_close, pole=LEG_BEND_POLE, pelvis_pole=True), left=(1.0, -0.35, 0.6), right=(1.0, -0.35, 0.6), remove=('prop_ball',)), 'floor', SIDE_ON),
    'plank': (plank_forearms, 'floor', SIDE_ON),
    'butt_ups': (torso_moves(BUTT_UPS, arms=forearm_on_floor, pole=LEG_BEND_POLE, pelvis_pole=True), 'floor', SIDE_ON),
    'side_bridge': (side_on_elbow(4, 13), 'floor', SIDE_ON),
    'side_jackknife': (side_on_elbow(6, 6, leg_lift=0.32, bend=24), 'floor', SIDE_ON),
    'ball_crunch': (torso_moves(BALL_CRUNCH, arms=behind_the_neck, pole=BACK_KNEE_POLE, extra=ball_under_back), 'bench', SIDE_ON),
    'ball_pull_in': (torso_moves(BALL_PULL_IN, arms=pull_in_arms, pole=(0.1, -0.2, -1), extra=ball_under_shins), 'floor', SIDE_ON),
    'ab_rollout': (rollout, 'floor', SIDE_ON),

    # Abs: benches and seats
    'crunch_decline': (with_props(torso_moves(DECLINE_CRUNCH, arms=behind_the_neck, pole=(0.35, -0.5, 1)), prop_bench_decline=ORIGIN), 'bench', SIDE_ON),
    'crunch_decline_twist': (with_props(torso_moves(DECLINE_TWIST, arms=behind_the_neck, pole=(0.35, -0.5, 1)), prop_bench_decline=ORIGIN), 'bench', SIDE_ON),
    'sit_up_decline': (with_props(torso_moves(DECLINE_SIT_UP, arms=behind_the_neck, pole=(0.35, -0.5, 1)), prop_bench_decline=ORIGIN), 'bench', SIDE_ON),
    'sit_up_press': (with_props(torso_moves(DECLINE_SIT_UP, hold=bar_pressed_from_chest, pole=(0.35, -0.5, 1)), prop_bench_decline=ORIGIN), 'tall', SIDE_ON),
    'reverse_crunch_decline': (with_props(torso_moves(DECLINE_REVERSE, arms=hold_top_of_decline, pole=LEG_BEND_POLE, pelvis_pole=True), prop_bench_decline=ORIGIN), 'bench', SIDE_ON),
    'leg_raise_bench': (with_props(torso_moves(BENCH_LEG_RAISE, arms=hold_bench_edge, pole=LEG_BEND_POLE, pelvis_pole=True), prop_bench_flat=ORIGIN), 'tall', SIDE_ON),
    'leg_pull_in_bench': (with_props(torso_moves(BENCH_PULL_IN, arms=hold_bench_edge, pole=LEG_BEND_POLE, pelvis_pole=True), prop_bench_flat=ORIGIN), 'bench', SIDE_ON),
    'seated_leg_tuck': (with_props(torso_moves(SEAT_LEG_TUCK, arms=hold_stool, pole=(0.1, -0.5, 1)), prop_stool=ORIGIN), 'standing', SIDE_TURN),
    'seated_twist': (with_props(torso_moves(SEATED_TWIST, hold=on_back(), pole=SEAT_POLE), prop_stool=ORIGIN), 'standing', 20),
    'cable_seated_crunch': (cabled(with_props(torso_moves(SEATED_CRUNCH, arms=beside_head, pole=SEAT_POLE), prop_stool=ORIGIN), left=HIGH_PULLEY_BEHIND, right=HIGH_PULLEY_BEHIND), 'tall', SIDE_TURN),

    # Abs: standing
    'side_bend_barbell': (torso_moves(SIDE_BEND, hold=on_back()), 'standing', 0),
    'side_bend_dumbbell': (torso_moves(SIDE_BEND, arms=dumbbell_side_bend, right_arm=dumbbell_side_bend), 'standing', 0),
    'side_bend_high_cable': (cabled(torso_moves(BEND_AWAY, arms=one_arm_up_to_pulley, right_arm=one_arm_up_to_pulley), left=(0.65, 0, HIGH_PULLEY)), 'tall', 0),
    'twist_standing': (torso_moves(STANDING_TWIST, hold=ball_at_arms_length), 'standing', 12),
    'landmine_180': (torso_moves(STANDING_TWIST, hold=landmine_180), 'tall', 20),
    'stomach_vacuum': (torso_moves(VACUUM, arms=hands_on_hips), 'standing', SIDE_TURN),
    'stretch_side_lean': (torso_moves(STANDING_LEAN_OVER, arms=arm_over_and_hip, right_arm=arm_over_and_hip), 'tall', 0),
    'stretch_seated_overhead': (torso_moves(SEATED_LEAN_OVER, arms=arms_along_trunk, pole=(1, -0.3, 0.5), toe_out=30), 'standing', 0),
    'windmill': (torso_moves(WINDMILL, arms=bell_held_up(), right_arm=reach_down_the_leg, pole=(0.3, -1, 0), toe_out=20), 'tall', 10),
    'windmill_double': (torso_moves(WINDMILL, arms=bell_held_up(), right_arm=bell_held_down, pole=(0.3, -1, 0), toe_out=20), 'tall', 10),
    'wood_chop_down': (cabled(torso_moves(TWIST_FROM_LEFT, hold=both_hands_on(chop((0.38, -0.38, 1.68), (-0.36, -0.34, 1.03)))), left=(0.95, -0.1, HIGH_PULLEY), right=(0.95, -0.1, HIGH_PULLEY)), 'tall', 12),
    'wood_chop_up': (cabled(torso_moves(TWIST_FROM_LEFT, hold=both_hands_on(chop((0.36, -0.34, 1.03), (-0.38, -0.38, 1.68)))), left=(0.95, -0.1, 0.12), right=(0.95, -0.1, 0.12)), 'tall', 12),
    'judo_flip': (cabled(torso_moves(((0.0, torso(lean=38, pelvis=26, y=0.1, z=0.8, twist=38)), (0.5, torso(lean=2, twist=-36)), (1.0, torso(lean=38, pelvis=26, y=0.1, z=0.8, twist=38))), hold=both_hands_on(chop((0.42, -0.32, 0.65), (-0.16, -0.1, 1.5)))), left=(0.95, -0.1, 0.12), right=(0.95, -0.1, 0.12)), 'tall', 12),
    'pallof_press': (cabled(torso_moves(rep(torso(), torso()), hold=both_hands_on(pressing_ahead())), left=(1.0, -0.25, 1.28), right=(1.0, -0.25, 1.28)), 'tall', 12),
    'pallof_press_rotation': (cabled(torso_moves(rep(torso(), torso(twist=-30)), hold=both_hands_on(pressing_ahead())), left=(1.0, -0.25, 1.28), right=(1.0, -0.25, 1.28)), 'tall', 12),
    'standing_cable_crunch': (cabled(torso_moves(STANDING_CRUNCH, arms=beside_head), left=HIGH_PULLEY_BEHIND, right=HIGH_PULLEY_BEHIND), 'tall', SIDE_TURN),
    'sledgehammer': (torso_moves(rep(torso(lean=-6), torso(lean=38, pelvis=20, y=0.08, z=0.82)), hold=sledge_hold), 'tall', SIDE_TURN),
    'spell_caster': (torso_moves(TWIST_FROM_LEFT, arms=spell_caster), 'tall', 12),
    'kettlebell_pass': (held_in(hinge(46, knee=135), both_arms(bell_between_legs)), 'standing', SIDE_TURN),

    # Abs: kneeling and hanging
    'cable_crunch': (cabled(torso_moves(KNEELING_CRUNCH, arms=beside_head), left=HIGH_PULLEY_BEHIND, right=HIGH_PULLEY_BEHIND), 'tall', SIDE_TURN),
    'cable_crunch_twist': (cabled(torso_moves(KNEELING_TWIST_CRUNCH, arms=beside_head), left=HIGH_PULLEY_BEHIND, right=HIGH_PULLEY_BEHIND), 'tall', SIDE_TURN),
    'cable_reverse_crunch': (torso_moves(REVERSE_CRUNCH, arms=arms_by_side_supine, pole=LEG_BEND_POLE, pelvis_pole=True, extra=cable_ankle_strap((0, -1.15, 0.12))), 'floor', SIDE_ON),
    'hanging_leg_raise': (hanging_moves(rep_along(hanging_leg_raise_key)), 'hanging', SIDE_TURN),
    'hanging_knee_raise_bars': (hanging_moves(rep(HANG, HANG_KNEES), half=0.3, palm=(-1, 0, 0), grip_z=1.27, grip_y=-0.05, prop='prop_dip_bars', above=True), 'hanging', SIDE_TURN),
    'hanging_pike': (hanging_moves(rep(HANG_THIGHS_LEVEL, HANG_PIKE), pole=LEG_BEND_POLE, pelvis_pole=True), 'hanging', SIDE_TURN),
    'hanging_gorilla': (hanging_moves(rep(HANG, HANG_GORILLA), palm=(0, -1, 0)), 'hanging', SIDE_TURN),
    'hanging_wind_sprints': (hanging_moves(((0.0, SPRINT_LEFT), (0.5, SPRINT_RIGHT), (1.0, SPRINT_LEFT))), 'hanging', SIDE_TURN),
})


# Clips with two movements in one rep take this many reps' time, so neither is rushed.
REPS_LONG = {
    'glute_kickback': 2,
    'lateral_partial': 2,
    'front_raise_alternating': 2,
    'front_then_side_raise': 2,
    'front_sweep_side_raise': 2,
    'battling_ropes': 2,
    'dumbbell_press_alternating': 2,
    'cuban_press': 2,
    'standing_overhead_press_alternating_empty': 2,
    'kettlebell_press_alternating': 2,
    'turkish_get_up': 4,
    'bradford_press': 2,
    'bradford_press_seated': 2,
    'clean_and_press': 2,
    'clean_and_jerk': 3,
    'kettlebell_clean': 2,
    'kettlebell_snatch': 2,
    'kettlebell_snatch_one_arm': 2,
    'kettlebell_split_snatch_one_arm': 2,
    'kettlebell_clean_and_jerk_one_arm': 3,
    'kettlebell_halo': 2,
    'kettlebell_pirate_ship': 2,
    'stretch_arm_circles': 2,
    'stretch_elbow_circles': 2,
    'stretch_shoulder_circles': 2,
    'march_overhead': 2,
    'pushup_side_plank': 2,
    'kettlebell_row_alternating': 2,
    'renegade_row': 2,
    'pullup_side_to_side': 2,
    'muscle_up': 2,
    'atlas_stone': 2,
    'lunge_crossover': 2,
    'lat_pulldown_crossed': 2,
    'kettlebell_sumo_high_pull': 2,
    'stretch_arm_swing': 2,
}
REPS_LONG.update({
    'lunge_bar': 2, 'lunge_hips': 2, 'lunge_dumbbell': 2, 'lunge_kettlebell': 2, 'rear_lunge_dumbbell': 2, 'rear_lunge_platform_bar': 2,
    'step_up_bar': 2, 'step_up_dumbbell': 2, 'step_up_knee': 2,
    'tire_flip': 2, 'split_jump': 2, 'split_jump_bar': 2, 'box_jump': 2, 'box_jump_seated': 2, 'depth_jump': 2, 'box_over': 2,
    'box_switch': 2, 'box_push_off': 2, 'box_shuffle': 2, 'box_jump_side': 2, 'hop_cone': 2, 'hop_cone_one_leg': 2, 'hop_cone_side': 2,
    'hop_cone_side_one_leg': 2, 'long_jump': 2, 'long_jump_side': 2, 'frog_hop': 2, 'bound_side': 2, 'bound_diagonal': 2, 'carioca': 2,
    'clean_pull': 2, 'clean': 2, 'power_clean': 2, 'clean_blocks': 2, 'power_clean_blocks': 2, 'hang_clean': 2, 'hang_clean_low': 2, 'hang_power_clean': 2,
    'split_clean': 2, 'dumbbell_clean': 2, 'kettlebell_clean_one': 2, 'kettlebell_hang_clean_one': 2, 'power_jerk': 2, 'split_jerk': 2, 'squat_jerk': 2,
    'snatch': 2, 'power_snatch': 2, 'split_snatch': 2, 'muscle_snatch': 2, 'hang_snatch': 2, 'hang_snatch_low': 2, 'snatch_blocks': 2, 'power_snatch_blocks': 2,
    'snatch_pull': 2, 'snatch_balance': 2, 'skip': 2, 'calf_rock': 2, 'stretch_windmills': 2, 'stretch_iron_cross': 2,
})
REPS_LONG.update({
    'curl_dumbbell_alternate': 2, 'curl_hammer_alternate': 2, 'curl_hammer_cross': 2, 'curl_incline_alternate': 2, 'curl_zottman': 2, 'curl_preacher_zottman': 2,
    'crunch_cross_body': 2, 'air_bike': 2, 'dead_bug': 2, 'cable_crunch_twist': 2, 'kettlebell_pass': 2,
})
# Steady gaits loop at the pace they are done, not at a rep's slow pace (seconds per cycle).
CYCLE_SECONDS = {'walk': 1.4, 'jog': 1.0, 'run': 0.8, 'run_claw': 0.8, 'bike': 1.2, 'bike_recumbent': 1.2, 'elliptical': 1.4, 'stair_climb': 1.5, 'skating': 2.0,
                 'rope_jump': 1.0, 'sled_push_run': 1.2, 'sled_drag_forward': 1.5, 'sled_drag_backward': 1.6, 'yoke_walk': 1.4, 'zercher_walk': 1.4,
                 'bear_crawl': 1.6, 'mountain_climbers': 1.2, 'stretch_flutter': 1.5, 'farmers_walk': 1.4, 'rickshaw_carry': 1.4}


def clip_frames(name):
    if name in CYCLE_SECONDS:
        return round(FPS * CYCLE_SECONDS[name])
    return FPS * REP_SECONDS * REPS_LONG.get(name, 1)


def write_pose(armature, pose, frame, framing, view, every_prop):
    """Keys one sample. Clips are authored facing -y and turned by `view` degrees here.

    The `frame` bone's position tells the scene what to keep in view: x and y
    are half the width and height, z the height of the centre.
    """
    bones = armature.data.bones
    turn = rot_z(view)
    for name, rotation in pose.rotation.items():
        pose_bone = armature.pose.bones[name]
        rest = bones[name].matrix_local.to_quaternion()
        parent = REST[name][2]
        parent_rotation = pose.rotation[parent] if parent else turn.inverted()
        pose_bone.rotation_mode = 'QUATERNION'
        pose_bone.rotation_quaternion = rest.inverted() @ parent_rotation.inverted() @ rotation @ rest
        pose_bone.keyframe_insert('rotation_quaternion', frame=frame)
    root = armature.pose.bones['hips']
    root_rest = bones['hips'].matrix_local
    root.location = root_rest.to_quaternion().inverted() @ (turn @ pose.head['hips'] - root_rest.translation)
    root.keyframe_insert('location', frame=frame)
    for mesh_name in PROP_MESHES:
        name = mesh_name.replace('-', '_')
        used = name in pose.props
        if not used and not every_prop:
            continue
        prop = armature.pose.bones[name]
        prop_rest = bones[name].matrix_local
        # A prop this clip does not use shrinks away, wherever it is.
        prop.scale = (pose.prop_stretch.get(name, 1), 1, 1) if used else (HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE)
        prop.keyframe_insert('scale', frame=frame)
        if not used:
            continue
        position, rotation = pose.props[name]
        rest = prop_rest.to_quaternion()
        prop.rotation_mode = 'QUATERNION'
        prop.location = rest.inverted() @ (turn @ position - prop_rest.translation)
        prop.rotation_quaternion = rest.inverted() @ turn @ rotation @ rest
        prop.keyframe_insert('location', frame=frame)
        prop.keyframe_insert('rotation_quaternion', frame=frame)
    frame_bone = armature.pose.bones['frame']
    frame_rest = bones['frame'].matrix_local
    frame_bone.location = frame_rest.to_quaternion().inverted() @ (Vector(FRAMES[framing]) - frame_rest.translation)
    frame_bone.keyframe_insert('location', frame=frame)


def straighten_keys(action):
    """Straight lines between samples: glTF stores three values per sample for curved keys."""
    for layer in action.layers:
        for strip in layer.strips:
            for channels in strip.channelbags:
                for curve in channels.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'


def add_clips(armature):
    armature.animation_data_create()
    for name, (pose_at, framing, view) in CLIPS.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        armature.animation_data.action = action
        reps = REPS_LONG.get(name, 1)
        frames, samples = clip_frames(name), REP_SAMPLES * reps
        for sample in range(samples + 1):
            write_pose(armature, pose_at(sample / samples), 1 + round(sample * frames / samples), framing,
                       view, sample in (0, samples))
        straighten_keys(action)
    print(f'{len(CLIPS)} clips')


def render_previews(armature, directory, size):
    """Each clip at its start, halfway and three quarters through, from about the angle the app opens at."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = size, size
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.6
    scene.camera = camera
    camera.rotation_euler = (math.pi / 2 - 0.1, 0, -0.1)
    for clip, (_, framing, _) in CLIPS.items():
        armature.animation_data.action = bpy.data.actions[clip]
        center = Vector((0, 0, FRAMES[framing][2]))
        camera.location = center + camera.rotation_euler.to_quaternion() @ Vector((0, 0, 5))
        length = clip_frames(clip)
        for label, frame in (('a', 1), ('b', 1 + length // 2), ('c', 1 + length * 3 // 4)):
            scene.frame_set(frame)
            scene.render.filepath = f'{directory}/{clip}-{label}.png'
            bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    source, out_path = args[0], args[1]
    if len(args) > 3:  # only these clips, for a quick look at a few
        for clip in set(CLIPS) - set(args[3].split(',')):
            del CLIPS[clip]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=source)
    bodies = [o for o in bpy.context.scene.objects if o.type == 'MESH']

    armature = build_armature()
    meshes = []
    for obj in bodies:
        decimate = obj.modifiers.new('decimate', 'DECIMATE')
        decimate.ratio = KEEP
        # Fingers are too thin to survive decimation, and are seen up close on the handle.
        reducible = obj.vertex_groups.new(name='reducible')
        reducible.add([v.index for v in obj.data.vertices if not in_hand(obj.matrix_world @ v.co)], 1.0, 'REPLACE')
        decimate.vertex_group = reducible.name
        bpy.context.view_layer.objects.active = obj
        with bpy.context.temp_override(object=obj):
            bpy.ops.object.modifier_apply(modifier='decimate')
        obj.vertex_groups.remove(obj.vertex_groups['reducible'])
        obj.data.validate()
        add_weights(obj)
        meshes.append(obj)
    meshes.extend(add_prop(name) for name in PROP_MESHES)
    for obj in meshes:
        obj.parent = armature
        obj.modifiers.new('armature', 'ARMATURE').object = armature
    print('vertices', sum(len(o.data.vertices) for o in meshes))

    add_clips(armature)
    if len(args) > 2:
        render_previews(armature, args[2], int(args[4]) if len(args) > 4 else 360)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=False,
        export_materials='EXPORT',
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=False,
        export_optimize_animation_size=True,
    )


main()
