# Builds packages/three-model/assets/body-model.glb from the Z-Anatomy
# Blender atlas (CC BY-SA 4.0, see docs/licensing/anatomical-mesh-license.md).
# Run headless with Blender 4.x/5.x against Z-Anatomy.zip's Startup.blend:
#
#   blender -b --factory-startup --disable-autoexec <Startup.blend> \
#     --python packages/three-model/scripts/buildAnatomyMesh.py -- <out.glb>
#
# Output: one mesh per selectable region, named `region-<muscle group key>`
# (both sides joined), plus `muscle-context` (every other visible muscle)
# and `bone` (visible skeleton: skull, hands, feet, shins...). The app reads
# a vertex's region from its mesh name, so muscle boundaries are exact.
# Objects nothing outside the body can see are dropped (ray-cast test), and
# each group is decimated to stay within the asset's vertex budget.

import math
import re
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Z-Anatomy object name (minus `.l`/`.r` and parentheses) -> muscle group key
# from data/exercises/mapping/muscleTaxonomy.json.
REGION_MUSCLES = {
    'neck': [
        'Sternocleidomastoid muscle', 'Scalenus anterior muscle', 'Scalenus medius muscle',
        'Scalenus posterior muscle', 'Splenius capitis muscle', 'Splenius colli muscle', 'Levator scapulae',
    ],
    # Z-Anatomy's trapezius part names are swapped relative to their
    # geometry: its "Ascending part" mesh is the upper (neck-to-shoulder)
    # band and its "Descending part" the lower triangle. Mapped by geometry.
    'traps': ['Ascending part of trapezius muscle'],
    'middle_back': [
        'Transverse part of trapezius muscle', 'Descending part of trapezius muscle', 'Rhomboid major muscle',
        'Rhomboid minor muscle', 'Infraspinatus muscle', 'Teres minor muscle',
    ],
    'shoulders': [
        'Clavicular part of deltoid muscle', 'Acromial part of deltoid muscle',
        'Scapular spinal part of deltoid muscle', 'Supraspinatus muscle',
    ],
    'chest': [
        'Clavicular head of pectoralis major muscle', 'Sternocostal head of pectoralis major muscle',
        'Abdominal part of pectoralis major muscle', 'Pectoralis minor muscle',
    ],
    'lats': ['Latissimus dorsi muscle', 'Teres major muscle'],
    'biceps': ['Long head of biceps brachii', 'Short head of biceps brachii', 'Brachialis muscle',
               'Coracobrachialis muscle'],
    'triceps': ['Long head of triceps brachii', 'Lateral head of triceps brachii', 'Medial head of triceps brachii',
                'Anconeus muscle'],
    'forearms': [
        'Brachioradialis muscle', 'Extensor carpi radialis longus', 'Extensor carpi radialis brevis',
        'Extensor digitorum', 'Extensor digiti minimi', 'Humeral head of extensor carpi ulnaris',
        'Ulnar head of extensor carpi ulnaris', 'Abductor pollicis longus', 'Extensor pollicis brevis',
        'Extensor pollicis longus', 'Extensor indicis', 'Supinator', 'Flexor carpi radialis', 'Palmaris longus muscle',
        'Humeral head of flexor carpi ulnaris', 'Ulnar head of flexor carpi ulnaris',
        'Humero-ulnar head of flexor digitorum superficialis', 'Radial head of flexor digitorum superficialis',
        'Flexor digitorum profundus', 'Flexor pollicis longus', 'Pronator quadratus',
        'Superficial head of pronator teres', 'Deep head of pronator teres',
    ],
    'abdominals': ['Rectus abdominis muscle', 'External abdominal oblique muscle', 'Internal abdominal oblique muscle',
                   'Transversus abdominis muscle', 'Pyramidalis muscle'],
    'lower_back': [
        'Iliocostalis lumborum muscle', 'Iliocostalis thoracis muscle', 'Longissimus thoracis muscle',
        'Spinalis thoracis muscle', 'Quadratus lumborum muscle', 'Multifidus lumborum muscle',
        'Posterior layer of thoracolumbar fascia',
    ],
    'glutes': ['Gluteus maximus muscle'],
    'abductors': ['Gluteus medius muscle', 'Gluteus minimus muscle', 'Tensor fasciae latae'],
    'adductors': ['Adductor longus', 'Adductor brevis', 'Adductor magnus', 'Adductor minimus', 'Gracilis muscle',
                  'Pectineus muscle'],
    'quadriceps': ['Rectus femoris muscle', 'Vastus lateralis muscle', 'Vastus medialis muscle',
                   'Vastus intermedius muscle'],
    'hamstrings': ['Long head of biceps femoris', 'Short head of biceps femoris', 'Semitendinosus muscle',
                   'Semimembranosus muscle'],
    'calves': ['Medial head of gastrocnemius', 'Lateral head of gastrocnemius', 'Soleus muscle', 'Plantaris muscle'],
}
REGION_OF = {name: region for region, names in REGION_MUSCLES.items() for name in names}

# Unmapped muscular-system objects that are sheets or sacs rather than
# muscle (they would cover the muscles beneath, e.g. the iliotibial tract
# over vastus lateralis).
EXCLUDE = re.compile(r'bursa|sheath|septum|retinacul|fascia|ligament|tarsus|trochlea|tendinous|aponeurosis|'
                     r'iliotibial|linea alba|diaphragm|platysma', re.IGNORECASE)
# Skeleton parts the model never needs (inside the skull or mouth).
EXCLUDE_BONE = re.compile(r'ossicle|malleus|incus|stapes|tooth|teeth|incisor|canine|premolar|molar|hyoid|'
                          r'cartilage', re.IGNORECASE)

# Triangle budget per output group (after decimation), roughly 200k in
# total. A region keeps REGION_KEEP of its triangles, within these bounds.
REGION_KEEP = 0.15
REGION_MIN_TRIANGLES = 3000
REGION_MAX_TRIANGLES = 9000
CONTEXT_TRIANGLES = 60000
BONE_TRIANGLES = 30000
# An object is kept only if at least this many outside rays hit it first.
MIN_VISIBLE_HITS = 6

MUSCLE_COLLECTION = '4: Muscular system'
BONE_COLLECTION = '1: Skeletal system'


def base_name(name):
    name = re.sub(r'\.[lr]$', '', name)
    return name.strip('()')


def world_triangles(obj, depsgraph):
    """Triangulated world-space copy of `obj` with its modifiers applied."""
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(obj.matrix_world)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    verts = [v.co.copy() for v in bm.verts]
    tris = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    evaluated.to_mesh_clear()
    return verts, tris


def collect(collection_name, depsgraph, keep):
    out = []
    for obj in bpy.data.collections[collection_name].all_objects:
        if obj.type != 'MESH' or len(obj.data.vertices) < 20 or not re.search(r'\.[lr]$|^[^.]*$', obj.name):
            continue
        group = keep(base_name(obj.name))
        if group is None:
            continue
        verts, tris = world_triangles(obj, depsgraph)
        if tris:
            out.append((obj.name, group, verts, tris))
    return out


# The latissimus dorsi mesh includes its lumbar aponeurosis, which covers
# the erector spinae: its triangles over the lumbar spine (model space,
# metres, z up) are given to lower_back so that area stays selectable.
LUMBAR_MAX_ABS_X = 0.095
LUMBAR_MAX_Z = 1.12


def split_lumbar_lats(parts):
    out = []
    for name, group, verts, tris in parts:
        if not name.startswith('Latissimus dorsi muscle'):
            out.append((name, group, verts, tris))
            continue
        lumbar, rest = [], []
        for tri in tris:
            centroid = (verts[tri[0]] + verts[tri[1]] + verts[tri[2]]) / 3
            is_lumbar = abs(centroid.x) < LUMBAR_MAX_ABS_X and centroid.z < LUMBAR_MAX_Z
            (lumbar if is_lumbar else rest).append(tri)
        out.append((name, group, verts, rest))
        out.append((name + ' (lumbar)', 'region-lower_back', verts, lumbar))
    return out


def visible_objects(parts):
    """Names of parts an outside viewer can see: rays cast inward from a cylinder and caps around the body."""
    all_verts, all_tris, owner = [], [], []
    for index, (_, _, verts, tris) in enumerate(parts):
        offset = len(all_verts)
        all_verts.extend(verts)
        all_tris.extend((a + offset, b + offset, c + offset) for a, b, c in tris)
        owner.extend([index] * len(tris))
    tree = BVHTree.FromPolygons(all_verts, all_tris, epsilon=0.0)
    lo = Vector((min(v.x for v in all_verts), min(v.y for v in all_verts), min(v.z for v in all_verts)))
    hi = Vector((max(v.x for v in all_verts), max(v.y for v in all_verts), max(v.z for v in all_verts)))
    center = (lo + hi) / 2
    radius = (hi - lo).length

    hits = [0] * len(parts)
    angles, heights = 360, 600
    for e in (-0.6, -0.3, 0.0, 0.3, 0.6):  # ray elevation (radians) so overhangs are reached
        for i in range(angles):
            a = 2 * math.pi * i / angles
            direction = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)))
            for j in range(heights):
                target = Vector((center.x, center.y, lo.z + (hi.z - lo.z) * (j + 0.5) / heights))
                for lateral in (-0.12, 0.0, 0.12):  # offset sideways so the gap between the legs is reached
                    side = Vector((-direction.y, direction.x, 0)) * lateral
                    origin = target + side + direction * radius
                    _, _, face, _ = tree.ray_cast(origin, -direction, radius * 2)
                    if face is not None:
                        hits[owner[face]] += 1
    return {parts[i][0] for i, count in enumerate(hits) if count >= MIN_VISIBLE_HITS}


def build_object(name, parts, material, max_triangles):
    bm = bmesh.new()
    for _, _, verts, tris in parts:
        bm_verts = [bm.verts.new(v) for v in verts]
        for a, b, c in tris:
            try:
                bm.faces.new((bm_verts[a], bm_verts[b], bm_verts[c]))
            except ValueError:  # duplicate face
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    # Split objects (split_lumbar_lats) carry the whole source vertex list.
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material)
    triangles = len(mesh.polygons)
    if triangles > max_triangles:
        decimate = obj.modifiers.new('decimate', 'DECIMATE')
        decimate.ratio = max_triangles / triangles
        decimate.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        with bpy.context.temp_override(object=obj):
            bpy.ops.object.modifier_apply(modifier='decimate')
    mesh.validate()  # decimation can leave degenerate faces
    mesh.shade_smooth()
    print(f'{name}: {triangles} -> {len(mesh.polygons)} triangles, {len(mesh.vertices)} vertices')
    return obj


def main():
    out_path = sys.argv[sys.argv.index('--') + 1]
    # Subdivision would multiply vertex counts only to be decimated away.
    for obj in bpy.data.objects:
        for modifier in obj.modifiers:
            if modifier.type == 'SUBSURF':
                modifier.show_viewport = False
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()

    def muscle_group(name):
        if name in REGION_OF:
            return 'region-' + REGION_OF[name]
        return None if EXCLUDE.search(name) else 'muscle-context'

    muscles = collect(MUSCLE_COLLECTION, depsgraph, muscle_group)
    bones = collect(BONE_COLLECTION, depsgraph, lambda name: None if EXCLUDE_BONE.search(name) else 'bone')
    parts = muscles + bones
    visible = visible_objects(parts)
    for name, group, _, _ in parts:
        if group.startswith('region-') and name not in visible:
            print(f'note: dropping {name} ({group}), not visible from outside')
    kept = split_lumbar_lats([p for p in parts if p[0] in visible])
    print(f'{len(kept)} of {len(parts)} objects kept')

    # Start an empty scene holding only the output meshes.
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj)
    muscle_material = bpy.data.materials.new('muscle')
    bone_material = bpy.data.materials.new('bone')

    groups = sorted({p[1] for p in kept})
    for group in groups:
        members = [p for p in kept if p[1] == group]
        if group == 'bone':
            build_object(group, members, bone_material, BONE_TRIANGLES)
        elif group == 'muscle-context':
            build_object(group, members, muscle_material, CONTEXT_TRIANGLES)
        else:
            triangles = sum(len(p[3]) for p in members)
            budget = min(max(int(triangles * REGION_KEEP), REGION_MIN_TRIANGLES), REGION_MAX_TRIANGLES)
            build_object(group, members, muscle_material, budget)
    missing = set(REGION_MUSCLES) - {g[len('region-'):] for g in groups if g.startswith('region-')}
    if missing:
        raise SystemExit(f'regions with no muscles: {sorted(missing)}')

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials='EXPORT',
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )


main()
