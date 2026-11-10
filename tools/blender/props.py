# Scriptorium Memorialium - hand-made hero props, authored as a script (Blender 5.2 LTS, bpy from PyPI, headless).
#
#   python3 -m venv ~/.venvs/bpy && ~/.venvs/bpy/bin/pip install bpy==5.2.3      (Python 3.13; ~1 GB installed)
#   ~/.venvs/bpy/bin/python tools/blender/props.py -- <out-dir> [names...]          (default: every prop)
#   then tools/blender/build.sh compresses each <out-dir>/<name>.raw.glb into assets/kit/<name>.glb (meshopt + WebP)
#
# Every prop is one mesh object with one material slot per finish (the slot names are what js/hub/kit.js maps to
# three.js materials: 'brass', 'wax', 'wick', 'ink', 'quill', 'walnut', 'gilt', ...). Modelling: lathe profiles with
# gadroons and beads (real bevels on every turned edge, no flat-shaded steps), swept mouldings, bevel modifiers on
# everything boxy, auto-smooth by angle. One UV atlas per prop (smart project), one Cycles ambient-occlusion bake
# (CPU, a ground plane under the prop so its foot gets contact shade), stored as the glTF occlusion texture.
# Units: metres, Blender Z up (the glTF exporter turns it into three.js Y up; Blender -Y becomes three.js +Z, the front).
# The origin of every prop is the centre of its foot, on the surface it stands on.
import bpy, bmesh, math, os, sys, json, time
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
ONLY = set(ARGS[1:])
os.makedirs(OUT, exist_ok=True)
TAU = math.tau
LOG = {}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.unit_settings.system = 'METRIC'
    return sc

# ------------------------------------------------------------------ materials (glTF PBR values; kit.js may refine them)
FINISH = {
    'brass':  dict(color=(0.80, 0.56, 0.26), metal=1.0, rough=0.30),   # polished, slightly warm cast brass
    'gilt':   dict(color=(0.86, 0.64, 0.30), metal=1.0, rough=0.36),
    'silver': dict(color=(0.86, 0.85, 0.82), metal=1.0, rough=0.24),
    'wax':    dict(color=(0.93, 0.88, 0.76), metal=0.0, rough=0.55),
    'wick':   dict(color=(0.05, 0.04, 0.035), metal=0.0, rough=0.9),
    'ink':    dict(color=(0.012, 0.010, 0.016), metal=0.0, rough=0.06),
    'quill':  dict(color=(0.92, 0.89, 0.82), metal=0.0, rough=0.7),
    'shaft':  dict(color=(0.86, 0.80, 0.66), metal=0.0, rough=0.4),
    'walnut': dict(color=(0.23, 0.12, 0.06), metal=0.0, rough=0.45),
    'paper':  dict(color=(0.80, 0.72, 0.56), metal=0.0, rough=0.85),   # the printed paper band of the horizon ring
    'occluder': dict(color=(0.5, 0.5, 0.5), metal=0.0, rough=0.5),
}
def material(name):
    if name in bpy.data.materials: return bpy.data.materials[name]
    f = FINISH[name]; m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*f['color'], 1); b.inputs['Metallic'].default_value = f['metal']; b.inputs['Roughness'].default_value = f['rough']
    m.use_backface_culling = name != 'quill'   # glTF doubleSided only for the thin feather vane
    return m

# ------------------------------------------------------------------ geometry helpers
def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material(mat))
    return o

def lathe(name, prof, mat, seg=72, gad=None, z0=0.0, cap_bottom=True, cap_top=True):
    """prof: [(r, z), ...] bottom to top. gad(j, a) -> radius factor (gadroons, flutes); None for a plain turning."""
    bm = bmesh.new(); rings = []
    for j, (r, z) in enumerate(prof):
        ring = []
        for i in range(seg):
            a = TAU * i / seg; k = gad(j, a) if gad else 1.0
            ring.append(bm.verts.new((r * k * math.cos(a), r * k * math.sin(a), z + z0)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(seg):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % seg], rings[j + 1][(i + 1) % seg], rings[j + 1][i]))
    if cap_bottom and prof[0][0] > 1e-5: bm.faces.new(list(reversed(rings[0])))
    if cap_top and prof[-1][0] > 1e-5: bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat)

def round_profile(pts, r=0.002, n=3):
    """Rounds every interior corner of a profile polyline [(r, z)] with a small fillet (a turned edge is never sharp)."""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1])
        d0, d1 = (p0 - p1), (p2 - p1)
        if d0.length < 1e-6 or d1.length < 1e-6: continue
        rr = min(r, d0.length * .45, d1.length * .45)
        a, b = p1 + d0.normalized() * rr, p1 + d1.normalized() * rr
        for k in range(n + 1):   # quadratic Bezier a -> p1 -> b
            t = k / n; q = a * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + b * t * t
            out.append((max(0.0, q.x), q.y))
    out.append(pts[-1]); return out

def arc(cx, cz, rad, a0, a1, n=8):
    """points of an arc in the (r, z) profile plane, angles in degrees (0 = +r, 90 = +z)"""
    return [(cx + rad * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cz + rad * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

def tube(name, pts, radius, mat, seg=12, taper=None):
    """a tube along a polyline of 3-D points (radius per point via taper(t) -> factor)"""
    bm = bmesh.new(); rings = []; P = [Vector(p) for p in pts]
    for j, p in enumerate(P):
        t = P[min(j + 1, len(P) - 1)] - P[max(j - 1, 0)]; t.normalize()
        up = Vector((0, 0, 1)) if abs(t.z) < .95 else Vector((1, 0, 0)); u = t.cross(up).normalized(); v = t.cross(u).normalized()
        rr = radius * (taper(j / (len(P) - 1)) if taper else 1)
        rings.append([bm.verts.new(p + (u * math.cos(TAU * i / seg) + v * math.sin(TAU * i / seg)) * rr) for i in range(seg)])
    for j in range(len(rings) - 1):
        for i in range(seg): bm.faces.new((rings[j][i], rings[j][(i + 1) % seg], rings[j + 1][(i + 1) % seg], rings[j + 1][i]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat)

def box(name, size, loc, mat, bevel=0.002, seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(loc)
    o = mesh_obj(name, bm, mat)
    if bevel: m = o.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
    return o

def sphere(name, r, loc, mat, scale=(1, 1, 1), seg=24, rings=12):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts: v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(loc)
    return mesh_obj(name, bm, mat)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')   # applies the modifiers
    bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name
    return o

def finish(o, smooth_deg=40):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-6)
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_auto_smooth(angle=math.radians(smooth_deg))
    bpy.ops.object.convert(target='MESH')   # bake the smooth-by-angle modifier into split normals
    return o

def uv_and_bake(o, res, occluders=(), spp=96):
    """one UV atlas, then Cycles AO (all slots write the same image) with a ground plane for contact shade"""
    t0 = time.time(); sc = bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.006, area_weight=0.3)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new(o.name + '_ao', res, res, alpha=False); img.generated_color = (1, 1, 1, 1)
    for m in o.data.materials:
        nt = m.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.name = 'AO_BAKE'; tex.image = img; nt.nodes.active = tex
    ground = box('ground_tmp', (2, 2, .01), (0, 0, -.005), 'occluder', bevel=0)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = spp
    sc.render.bake.margin = 6; sc.world = sc.world or bpy.data.worlds.new('w')
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', margin=6)
    bpy.data.objects.remove(ground, do_unlink=True)
    for x in occluders: bpy.data.objects.remove(x, do_unlink=True)
    # the AO image becomes the glTF occlusion texture (the exporter reads a 'glTF Material Output' group's Occlusion input)
    grp = bpy.data.node_groups.get('glTF Material Output')
    if not grp:
        grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    for m in o.data.materials:
        nt = m.node_tree; tex = nt.nodes['AO_BAKE']; g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(tex.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    img.filepath_raw = os.path.join(OUT, o.name + '_ao.png'); img.file_format = 'PNG'; img.save()
    img.pack()
    return round(time.time() - t0, 2)

def export(o, name):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    p = os.path.join(OUT, name + '.raw.glb')
    bpy.ops.export_scene.gltf(filepath=p, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='AUTO')
    tris = sum(len(p_.vertices) - 2 for p_ in o.data.polygons)
    return p, tris

# ================================================================== the props
# 1. Candlestick: a baroque cast-brass candlestick, 0.26 m to the rim of its drip pan (the desk's old lathe was the same
#    height, so the candle and the flame sit where hub props expect them: candle top 0.40 m above the foot).
def candlestick():
    reset(); parts = []
    # foot: a stepped, domed base with 16 gadroons, a bead and a fillet; stem: knopped baluster; vase socket
    P = [(0, 0), (.071, 0), (.072, .004), (.0725, .009), (.069, .0115), (.066, .0125)]
    P += arc(.052, .0125, .014, 0, 90, 8)              # ovolo of the foot (gadrooned)
    gad0, gad1 = len(P) - 9, len(P)
    P += [(.040, .03), (.036, .034), (.037, .038), (.033, .041)]   # bead + fillet
    P += arc(.020, .041, .013, 0, 70, 6)               # dome shoulder
    P += [(.016, .062), (.0135, .066), (.017, .070), (.0175, .074), (.014, .078), (.011, .085)]   # collar, neck
    P += [(.012, .095), (.018, .108), (.0225, .118), (.023, .124), (.020, .132), (.013, .14)]     # lower baluster knop
    P += [(.010, .15), (.0095, .165), (.011, .172), (.016, .176), (.0165, .181), (.012, .185)]    # waist + ring knop
    P += [(.010, .192), (.012, .2), (.017, .214), (.021, .226), (.022, .232)]                    # vase socket
    P += [(.042, .236), (.045, .240), (.0445, .244), (.041, .246), (.024, .248), (.0205, .252)]   # drip pan (bobeche)
    P += [(.0205, .26), (.0183, .26), (.0183, .236)]   # socket lip, bore (the candle stands in it)
    prof = round_profile(P, .0016, 2)
    # gadroons: lobes on the foot's ovolo (the rows that came from that arc keep their index after rounding only
    # approximately, so the lobe strength follows the height instead)
    def gad(j, a):
        r, z = prof[j]
        if .012 < z < .03: w = math.sin(math.pi * (z - .012) / .018); return 1 + .055 * w * (abs(math.cos(8 * a)) ** .6 - .5)
        if .233 < z < .247: return 1 + .012 * math.cos(24 * a)   # a beaded rim on the drip pan
        return 1.0
    parts.append(lathe('stick', prof, 'brass', seg=96, gad=gad, cap_top=False))
    # the candle: slightly irregular, with two wax runs down its side and a cupped, melted top
    C = [(0, .238), (.0178, .238), (.0178, .385), (.0174, .393), (.016, .397), (.012, .3985), (.006, .396), (0, .3955)]
    parts.append(lathe('candle', round_profile(C, .0012, 3), 'wax', seg=48, gad=lambda j, a: 1 + .015 * math.sin(3 * a + .7) + .008 * math.sin(7 * a)))
    for k, (a, l) in enumerate([(.6, .05), (2.9, .03)]):
        x, y = math.cos(a) * .0178, math.sin(a) * .0178
        parts.append(tube('drip%d' % k, [(x, y, .397 - t * l) for t in [0, .3, .6, .85, 1]], .0028, 'wax', seg=10, taper=lambda t: 1.15 - .45 * t))
        parts.append(sphere('dripend%d' % k, .0032, (x * 1.03, y * 1.03, .397 - l), 'wax', scale=(1, 1, 1.4), seg=12, rings=8))
    parts.append(tube('wick', [(0, 0, .394), (0, .0004, .403), (.001, .0012, .409), (.0024, .002, .413)], .0011, 'wick', seg=8, taper=lambda t: 1 - .4 * t))
    o = finish(join(parts, 'candlestick'), 38)
    LOG['candlestick'] = {'bake_s': uv_and_bake(o, 512)}
    return export(o, 'candlestick')

# 2. Inkstand: a silver tray on four bun feet, with a turned inkwell (glossy ink surface), a pounce pot with a pierced
#    top and a goose-feather quill standing in the ink. Footprint 0.24 × 0.15 m, origin at the tray's underside centre.
def inkstand():
    reset(); parts = []
    W_, D_, R_ = .24, .15, .022    # tray width, depth, corner radius
    # the tray: a rounded-rectangle moulding swept along the outline (bezier with a profile curve as its bevel)
    def rrect(w, d, r, n=6):
        pts = []
        for cx, cy, a0 in [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]:
            for k in range(n + 1): a = math.radians(a0 + 90 * k / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts
    def slab(name, w, d, r, z0, z1, mat, bevel=.0012):
        bm = bmesh.new(); vb = [bm.verts.new((x, y, z0)) for x, y in rrect(w, d, r)]; vt = [bm.verts.new((x, y, z1)) for x, y in rrect(w, d, r)]
        n = len(vb); bm.faces.new(list(reversed(vb))); bm.faces.new(vt)
        for i in range(n): bm.faces.new((vb[i], vb[(i + 1) % n], vt[(i + 1) % n], vt[i]))
        o = mesh_obj(name, bm, mat); m = o.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(50)
        return o
    feetZ = .008
    parts.append(slab('tray', W_ - .01, D_ - .01, R_ - .005, feetZ, feetZ + .005, 'silver'))
    # the raised rim: a profile (ogee) swept round the outline
    prof = [(0, 0), (.0035, 0), (.0042, .002), (.0036, .0045), (.0042, .0075), (.0028, .0095), (.0012, .0098), (0, .0085)]
    outline = rrect(W_ - .008, D_ - .008, R_ - .004, 8)
    bm = bmesh.new(); rings = []
    n = len(outline)
    for i, (x, y) in enumerate(outline):
        xp, yp = outline[(i - 1) % n]; xn, yn = outline[(i + 1) % n]
        tx, ty = xn - xp, yn - yp; L = math.hypot(tx, ty); nx, ny = ty / L, -tx / L   # outward normal (counter-clockwise outline)
        rings.append([bm.verts.new((x + nx * (pr - .0018), y + ny * (pr - .0018), feetZ + .004 + pz)) for pr, pz in prof])
    for i in range(n):
        for j in range(len(prof) - 1):
            bm.faces.new((rings[i][j], rings[(i + 1) % n][j], rings[(i + 1) % n][j + 1], rings[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); parts.append(mesh_obj('rim', bm, 'silver'))
    for sx in (-1, 1):
        for sy in (-1, 1): parts.append(sphere('foot', .0085, (sx * (W_ / 2 - .03), sy * (D_ / 2 - .025), feetZ * .55), 'silver', scale=(1, 1, .7), seg=20, rings=10))
    top = feetZ + .009
    # the inkwell (right) and the pounce pot (left), both turned, both on a low collar
    ix, px = .055, -.055
    INK = [(0, 0), (.036, 0), (.037, .003), (.034, .006)] + arc(.022, .006, .014, -10, 80, 8) + [(.018, .024), (.0195, .027), (.0205, .031), (.018, .034), (.0135, .034), (.0135, .028), (0, .028)]
    ip = round_profile(INK, .0012, 3)   # six soft lobes on the well's belly
    o = lathe('inkwell', ip, 'silver', seg=72, gad=lambda j, a: 1 + (.035 * math.sin(math.pi * (ip[j][1] - .007) / .016) * (abs(math.cos(3 * a)) - .5) if .007 < ip[j][1] < .023 and ip[j][0] > .02 else 0)); o.location = (ix, 0, top); parts.append(o)
    disc = lathe('ink', [(0, 0), (.0134, 0), (.0134, .0004), (0, .0004)], 'ink', seg=40); disc.location = (ix, 0, top + .0276); parts.append(disc)
    PP = [(0, 0), (.03, 0), (.031, .003), (.028, .006), (.022, .012), (.020, .03), (.0215, .034), (.022, .037)] + arc(0, .037, .022, 0, 90, 10)
    o = lathe('pounce', round_profile(PP, .0012, 3), 'silver', seg=64); o.location = (px, 0, top); parts.append(o)
    for ring, cnt in [(0, 1), (.007, 6), (.014, 12)]:   # the pierced top: little dark holes (sand comes out of them)
        for k in range(cnt):
            a = TAU * k / cnt; x, y = math.cos(a) * ring, math.sin(a) * ring; zz = math.sqrt(max(0, .022 ** 2 - ring ** 2))
            nrm = Vector((x, y, zz)).normalized(); c = Vector((px + x, y, top + .037 + zz)) + nrm * .0002
            h = sphere('hole', .0016, c, 'ink', scale=(1, 1, .35), seg=10, rings=6)
            h.rotation_mode = 'QUATERNION'; h.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(nrm); parts.append(h)
    # the quill: a hollow barrel (calamus) into a tapering rachis, with a vane of barbs on both sides; it leans out of
    # the inkwell towards the back-left, its nib in the ink
    base = Vector((ix + .004, .002, top + .012)); d = Vector((-.34, .5, .8)).normalized(); side = d.cross(Vector((0, 0, 1))).normalized(); bend = d.cross(side).normalized()
    L = .27; spine = [base + d * (L * t) + bend * (.025 * t * t) for t in [k / 24 for k in range(25)]]
    parts.append(tube('shaft', spine, .0024, 'shaft', seg=10, taper=lambda t: 1.0 if t < .3 else max(.18, 1 - (t - .3) * 1.15)))
    bm = bmesh.new()
    for s in (-1, 1):   # each vane: a strip of barbs (alternating ragged edge), cupped and curling at the tip
        rows = []
        for k in range(8, 25):
            t = k / 24; p = spine[k]
            w = (.026 if s > 0 else .014) * math.sin(math.pi * min(1, (t - .3) / .72)) ** .8 * (1 + .06 * ((k % 3) - 1))
            sweep = -d * (w * .55)   # barbs slant towards the tip
            row = [bm.verts.new(p + (side * s) * (w * f) + sweep * f + bend * (.004 * f * f)) for f in (0, .35, .7, 1)]
            rows.append(row)
        for a, b in zip(rows, rows[1:]):
            for j in range(3): bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]) if s > 0 else (a[j + 1], b[j + 1], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    vane = mesh_obj('vane', bm, 'quill'); sol = vane.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = .0006; parts.append(vane)
    o = finish(join(parts, 'inkstand'), 40)
    LOG['inkstand'] = {'bake_s': uv_and_bake(o, 512)}
    return export(o, 'inkstand')

# 3. Globe stand: four turned walnut legs with a cross stretcher and a turned finial, a broad horizon ring with gilt
#    edges, and a brass meridian ring with engraved degree marks; the globe itself stays procedural (its terrestrial or
#    celestial map is drawn by the app). R = 0.30 m globe centred 0.90 m up, as js/hub/props.js globeStand().
def globestand():
    reset(); parts = []; R, yc = .3, .9
    leg = [(0, 0), (.032, 0), (.034, .012), (.028, .03), (.022, .06), (.03, .11), (.036, .2), (.034, .28), (.024, .36), (.018, .40),
           (.026, .42), (.026, .44), (.019, .46), (.017, .55), (.022, .64), (.026, .72), (.021, .78), (.025, .80), (.03, .82), (.03, .84), (0, .84)]
    for i in range(4):
        a = i * TAU / 4 + TAU / 8; o = lathe('leg%d' % i, round_profile([(r * 1.25, z) for r, z in leg], .003, 3), 'walnut', seg=28); o.location = (math.cos(a) * .3, math.sin(a) * .3, 0); parts.append(o)
    for a in (TAU / 8, -TAU / 8):   # cross stretcher (bevelled boards), its centre under the finial
        b = box('str', (.62, .045, .03), (0, 0, .16), 'walnut', bevel=.004); b.rotation_euler = (0, 0, a); parts.append(b)
    fin = [(0, 0), (.05, 0), (.052, .01), (.04, .02), (.02, .05), (.014, .08), (.024, .11), (.02, .13), (.008, .15), (.012, .165), (0, .175)]
    o = lathe('finial', round_profile(fin, .002, 3), 'gilt', seg=40); o.location = (0, 0, .175); parts.append(o)
    # horizon ring: flat walnut band, gilt beads on both edges
    HR = [(R + .03, -.012), (R + .115, -.012), (R + .118, -.006), (R + .118, .006), (R + .115, .012), (R + .03, .012), (R + .027, .006), (R + .027, -.006)]
    o = lathe('horizon', round_profile(HR + [HR[0]], .002, 2), 'walnut', seg=144, cap_bottom=False, cap_top=False); o.location = (0, 0, yc); parts.append(o)
    # its top: a printed paper band (matte, not lacquer: a glossy top mirrored the windows' sky as lavender), with the
    # printed scale as fine inked circles and degree ticks (every 5 deg, longer every 10 deg)
    bm = bmesh.new(); segs = 144; ri, ro = R + .036, R + .109
    vi = [bm.verts.new((ri * math.cos(TAU * i / segs), ri * math.sin(TAU * i / segs), yc + .0122)) for i in range(segs)]
    vo = [bm.verts.new((ro * math.cos(TAU * i / segs), ro * math.sin(TAU * i / segs), yc + .0122)) for i in range(segs)]
    for i in range(segs): bm.faces.new((vi[i], vi[(i + 1) % segs], vo[(i + 1) % segs], vo[i]))
    parts.append(mesh_obj('paperband', bm, 'paper'))
    def annulus(r0, r1, z, mat, n=144):
        bm = bmesh.new(); a = [bm.verts.new((r0 * math.cos(TAU * i / n), r0 * math.sin(TAU * i / n), z)) for i in range(n)]; b = [bm.verts.new((r1 * math.cos(TAU * i / n), r1 * math.sin(TAU * i / n), z)) for i in range(n)]
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        return mesh_obj('line', bm, mat)
    for r_ in (R + .045, R + .052, R + .084, R + .1):
        parts.append(annulus(r_, r_ + .0011, yc + .0124, 'wick'))
    bm = bmesh.new()
    for k in range(72):
        a = TAU * k / 72; l = .032 if k % 2 == 0 else .016; r0 = R + .052; c, s_ = math.cos(a), math.sin(a); t = Vector((-s_, c, 0)) * .0007
        p0, p1 = Vector((c * r0, s_ * r0, yc + .0124)), Vector((c * (r0 + l), s_ * (r0 + l), yc + .0124))
        bm.faces.new([bm.verts.new(q) for q in (p0 - t, p1 - t, p1 + t, p0 + t)])
    parts.append(mesh_obj('ticks', bm, 'wick'))
    for rr in (R + .029, R + .117):   # a gilt bead (a thin torus) on the ring's top edges
        bm = bmesh.new()
        segs, ms = 144, 10
        ring = []
        for i in range(segs):
            a = TAU * i / segs; cx, cy = math.cos(a) * rr, math.sin(a) * rr
            ring.append([bm.verts.new((cx + math.cos(a) * .004 * math.cos(TAU * k / ms), cy + math.sin(a) * .004 * math.cos(TAU * k / ms), yc + .012 + .004 * math.sin(TAU * k / ms))) for k in range(ms)])
        for i in range(segs):
            for k in range(ms): bm.faces.new((ring[i][k], ring[(i + 1) % segs][k], ring[(i + 1) % segs][(k + 1) % ms], ring[i][(k + 1) % ms]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); parts.append(mesh_obj('bead', bm, 'gilt'))
    # four posts from the legs' tops to the horizon ring
    for i in range(4):
        a = i * TAU / 4 + TAU / 8; parts.append(box('post', (.03, .03, yc - .84 - .012), (math.cos(a) * (R + .07), math.sin(a) * (R + .07), (yc + .84 - .012) / 2), 'walnut', bevel=.003))
    # meridian ring: a brass band (rectangular section, bevelled), tilted with the globe's axis, with degree ticks cut in
    tilt = .41; bm = bmesh.new(); segs = 240; r0, r1, hw = R + .012, R + .032, .006
    rings = []
    for i in range(segs + 1):
        a = -math.pi * .8 + 1.6 * math.pi * i / segs; ca, sa = math.cos(a), math.sin(a)
        tick = (.0018 if i % 10 == 0 else .0009) if i % 2 == 0 else 0
        sec = [(r0, -hw), (r1 - tick, -hw), (r1 - tick, hw), (r0, hw)]
        rings.append([bm.verts.new((rr * ca, w, rr * sa)) for rr, w in sec])
    for i in range(segs):
        for k in range(4): bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % 4], rings[i][(k + 1) % 4]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mer = mesh_obj('meridian', bm, 'brass'); m = mer.modifiers.new('bevel', 'BEVEL'); m.width = .0008; m.segments = 2; m.limit_method = 'ANGLE'
    mer.rotation_euler = (0, -tilt, 0); mer.location = (0, 0, yc); parts.append(mer)
    ax = tube('axis', [(0, 0, -(R + .05)), (0, 0, R + .05)], .005, 'brass', seg=12); ax.rotation_euler = (0, -tilt, 0); ax.location = (0, 0, yc); parts.append(ax)
    o = finish(join(parts, 'globestand'), 42)
    occ = sphere('globe_tmp', R, (0, 0, yc), 'occluder', seg=48, rings=24)   # the globe shades the rings in the bake
    LOG['globestand'] = {'bake_s': uv_and_bake(o, 1024, occluders=[occ])}
    return export(o, 'globestand')

PROPS = {'candlestick': candlestick, 'inkstand': inkstand, 'globestand': globestand}
for name, fn in PROPS.items():
    if ONLY and name not in ONLY: continue
    t0 = time.time(); path, tris = fn()
    LOG.setdefault(name, {}).update({'tris': tris, 'raw_bytes': os.path.getsize(path), 'total_s': round(time.time() - t0, 2)})
    print(name, json.dumps(LOG[name]), flush=True)
json.dump(LOG, open(os.path.join(OUT, 'props-log.json'), 'w'), indent=1)
