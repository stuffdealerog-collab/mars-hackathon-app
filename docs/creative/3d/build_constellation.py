"""
Uslub AI — "AI employee constellation" 3D scene, built from code (reproducible).

Ten glossy orbs (one signature gradient per AI employee, the same hex pairs as
GRAD in src/components/uslub/agents.ts) orbit a lime core ("Bir havola" — the
owner's one link). Thin light lines connect the core to each employee and small
pulses travel along them; a dotted HUD ring frames the constellation.

Run headless (no GUI, no MCP add-on needed):

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python docs/creative/3d/build_constellation.py -- <out_dir> <modes> [preview|final]

modes (comma-separated): hero16x9, hero9x16, orbs, loop, glb, blend
  hero16x9  1920x1080 still           -> <out>/constellation-16x9.png
  hero9x16  1080x1920 still           -> <out>/constellation-9x16.png
  orbs      10+1 transparent orbs     -> <out>/orbs/orb-<role>.png (1024x1024)
  loop      seamless 12 s orbit loop  -> <out>/frames/loop_####.png (encode with ffmpeg)
  glb       web model (vertex colours, animated) -> <out>/uslub-constellation.glb
  blend     save the .blend           -> <out>/uslub-constellation.blend

Tested with Blender 5.3 (EEVEE). The shading uses world-space normals, so the
gradient stays lit from the top-left like the CSS <Orb/> while orbs move.
"""

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

ARGV = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = os.path.abspath(ARGV[0] if ARGV else "./out3d")
MODES = set((ARGV[1] if len(ARGV) > 1 else "hero16x9").split(","))
QUALITY = ARGV[2] if len(ARGV) > 2 else "final"
os.makedirs(OUT, exist_ok=True)

# (role, glow, deep) — must match GRAD in src/components/uslub/agents.ts
ROLES = [
    ("brand", "#FBE3C2", "#E98A5E"),
    ("analyst", "#D7FF3A", "#16B364"),
    ("strategist", "#5B7CFF", "#7C3AED"),
    ("copywriter", "#FF7A5C", "#FFB98A"),
    ("editor", "#FF2D55", "#C026D3"),
    ("translator", "#38E1FF", "#2F6BFF"),
    ("designer", "#FF7AC6", "#9D4EDD"),
    ("video", "#FF9F1C", "#FF2D55"),
    ("publisher", "#3B82F6", "#22D3EE"),
    ("radar", "#B4F43A", "#0FB5A6"),
]
CORE = ("core", "#D7FF3A", "#9BCB00")
LIME = "#D7FF3A"
INK = "#0B0B0E"

FPS = 24
LOOP_FRAMES = 288  # 12 s: one full revolution, seamless (frame 289 == frame 1)
RING_R = 3.35
ORB_R = 0.44
CORE_R = 0.62
KEY_DIR = Vector((-0.38, -0.72, 0.58)).normalized()  # top-left, towards camera


# ------------------------------------------------------------------ helpers
def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h: str, a: float = 1.0):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


def mix(c1, c2, t):
    return tuple(c1[i] * (1 - t) + c2[i] * t for i in range(4))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.fps = FPS
    sc.frame_start = 1
    sc.frame_end = LOOP_FRAMES
    ee = sc.eevee
    ee.taa_render_samples = {"preview": 16, "loop": 48}.get(QUALITY, 96)
    for attr, val in (("use_raytracing", True), ("use_shadows", True)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)
    # Standard keeps the neon gradients as saturated as the CSS orbs in the UI
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    world = bpy.data.worlds.new("Void")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = hex_rgba("#050507")
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world
    return sc


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def new_collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def principled(mat):
    mat.use_nodes = True
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def set_in(node, names, value):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


# ---------------------------------------------------------------- materials
def orb_material(name, glow_hex, deep_hex, emission=0.55):
    """Procedural glossy orb: world-normal gradient ink -> deep -> glow -> highlight,
    a clear coat, and a fresnel rim in the deep colour (the CSS Orb, in 3D)."""
    mat = bpy.data.materials.new(f"orb_{name}")
    bsdf = principled(mat)
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    geo = nodes.new("ShaderNodeNewGeometry")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = KEY_DIR
    links.new(geo.outputs["Normal"], dot.inputs[0])
    remap = nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    links.new(dot.outputs["Value"], remap.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    glow, deep, ink = hex_rgba(glow_hex), hex_rgba(deep_hex), hex_rgba(INK)
    els[0].position, els[0].color = 0.0, ink
    els[1].position, els[1].color = 1.0, mix(glow, (1, 1, 1, 1), 0.35)
    e = els.new(0.5)
    e.color = deep
    e = els.new(0.86)
    e.color = glow
    links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    lw = nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.62
    rim = nodes.new("ShaderNodeMix")
    rim.data_type = "RGBA"
    rim.blend_type = "MIX"
    links.new(lw.outputs["Fresnel"], rim.inputs["Factor"])
    links.new(ramp.outputs["Color"], rim.inputs["A"])
    # limb darkening (CSS: inset shadow, fade to #0b0b0e at the edge) — not a bright rim
    rim.inputs["B"].default_value = mix(ink, deep, 0.18)
    links.new(rim.outputs["Result"], bsdf.inputs["Emission Color"])
    set_in(bsdf, "Emission Strength", emission)
    set_in(bsdf, "Roughness", 0.42)
    set_in(bsdf, ["Coat Weight", "Coat"], 1.0)
    set_in(bsdf, "Coat Roughness", 0.03)
    set_in(bsdf, "Coat IOR", 1.5)
    set_in(bsdf, ["Specular IOR Level", "Specular"], 0.6)
    return mat


def emit_material(name, hex_color, strength):
    mat = bpy.data.materials.new(name)
    bsdf = principled(mat)
    set_in(bsdf, "Base Color", hex_rgba(INK))
    set_in(bsdf, "Emission Color", hex_rgba(hex_color))
    set_in(bsdf, "Emission Strength", strength)
    set_in(bsdf, "Roughness", 0.5)
    return mat


def floor_material():
    mat = bpy.data.materials.new("floor_gloss")
    bsdf = principled(mat)
    set_in(bsdf, "Base Color", hex_rgba("#040405"))
    set_in(bsdf, "Roughness", 0.16)
    set_in(bsdf, ["Specular IOR Level", "Specular"], 0.5)
    return mat


def backdrop_material():
    """Soft mesh-gradient glow behind the constellation (violet + lime haze)."""
    mat = bpy.data.materials.new("backdrop_glow")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    for n in list(nodes):
        nodes.remove(n)
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    tc = nodes.new("ShaderNodeTexCoord")
    # two radial blobs in object space, added together
    def blob(center, scale, color_hex, power):
        mp = nodes.new("ShaderNodeMapping")
        # Mapping (Point): v' = v * scale + location  ->  centre the blob on `center`
        mp.inputs["Scale"].default_value = (scale[0], scale[1], 1)
        mp.inputs["Location"].default_value = (-center[0] * scale[0], -center[1] * scale[1], 0)
        links.new(tc.outputs["Object"], mp.inputs["Vector"])
        # mapping does scale after translate; good enough for a soft blob
        grad = nodes.new("ShaderNodeTexGradient")
        grad.gradient_type = "SPHERICAL"
        links.new(mp.outputs["Vector"], grad.inputs["Vector"])
        pw = nodes.new("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = power
        links.new(grad.outputs["Fac"], pw.inputs[0])
        col = nodes.new("ShaderNodeMix")
        col.data_type = "RGBA"
        col.inputs["A"].default_value = (0, 0, 0, 1)
        col.inputs["B"].default_value = hex_rgba(color_hex)
        links.new(pw.outputs["Value"], col.inputs["Factor"])
        return col.outputs["Result"]

    a = blob((0.08, 0.12), (2.2, 3.4), "#24195C", 1.6)
    b = blob((-0.3, -0.25), (3.2, 5.0), "#1E2A00", 1.8)
    add = nodes.new("ShaderNodeMix")
    add.data_type = "RGBA"
    add.blend_type = "ADD"
    add.inputs["Factor"].default_value = 1.0
    links.new(a, add.inputs["A"])
    links.new(b, add.inputs["B"])
    links.new(add.outputs["Result"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# ----------------------------------------------------------------- geometry
def uv_sphere(name, radius, mat, coll, segments=48, rings=24, subsurf=1):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me), coll)
    ob.data.materials.append(mat)
    if subsurf:
        m = ob.modifiers.new("smooth", "SUBSURF")
        m.levels = m.render_levels = subsurf
    return ob


def dots_ring(name, radius, count, dot_r, mat_a, mat_b, every, coll, z=0.0):
    """One mesh of many tiny spheres along a circle (dot-matrix HUD ring)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(count):
        ang = 2 * math.pi * i / count
        big = every and i % every == 0
        r = dot_r * (1.9 if big else 1.0)
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in res["verts"]:
            v.co += Vector((math.cos(ang) * radius, math.sin(ang) * radius, z))
        if big:
            for f in {f for v in res["verts"] for f in v.link_faces}:
                f.material_index = 1
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), coll)
    ob.data.materials.append(mat_a)
    ob.data.materials.append(mat_b)
    return ob


def beam(name, start, end, radius, mat, coll):
    """Thin cylinder between two points."""
    d = end - start
    length = d.length
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=radius, radius2=radius, depth=length)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), coll)
    ob.data.materials.append(mat)
    ob.location = (start + end) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob


def keyframes(ob, path, index, values, interpolation="LINEAR"):
    """Write one value per frame (frame 1..N) straight into an F-curve (fast)."""
    ob.keyframe_insert(data_path=path, index=index, frame=1)
    fc = None
    anim = ob.animation_data
    action = anim.action
    # Blender 4.4+ layered actions: find the F-curve through the channelbag
    try:
        fcurves = action.fcurves
    except AttributeError:
        fcurves = None
    if fcurves is None or len(fcurves) == 0:
        from bpy_extras import anim_utils

        cb = anim_utils.action_get_channelbag_for_slot(action, anim.action_slot)
        fcurves = cb.fcurves
    for f in fcurves:
        if f.data_path == path and f.array_index == index:
            fc = f
    fc.keyframe_points.clear()
    fc.keyframe_points.add(len(values))
    co = []
    for i, v in enumerate(values):
        co += [i + 1, v]
    fc.keyframe_points.foreach_set("co", co)
    for kp in fc.keyframe_points:
        kp.interpolation = interpolation
    fc.update()


# -------------------------------------------------------------------- scene
def build(scene_kind="full"):
    sc = reset_scene()
    main = new_collection("Constellation")
    env = new_collection("Environment")

    rig = link(bpy.data.objects.new("ConstellationRig", None), main)
    rig.empty_display_size = 0.5

    core = uv_sphere("orb_core", CORE_R, orb_material("core", CORE[1], CORE[2], emission=0.6), main)
    core.parent = rig

    beam_mat = emit_material("beam", "#DADCE6", 0.45)
    pulse_mat = emit_material("pulse", LIME, 22.0)
    orbs, pulses = [], []
    for i, (role, a, b) in enumerate(ROLES):
        ang = math.pi / 2 + 2 * math.pi * i / len(ROLES)
        pos = Vector((math.cos(ang) * RING_R, math.sin(ang) * RING_R, 0))
        ob = uv_sphere(f"orb_{role}", ORB_R, orb_material(role, a, b), main)
        ob.parent = rig
        ob.location = pos
        ob["role"] = role
        orbs.append(ob)
        d = pos.normalized()
        bm_ = beam(f"beam_{role}", d * (CORE_R * 1.05), d * (RING_R - ORB_R * 1.08), 0.0045, beam_mat, main)
        bm_.parent = rig
        p = uv_sphere(f"pulse_{role}", 0.035, pulse_mat, main, segments=12, rings=6, subsurf=0)
        p.parent = rig
        p.location = d * (CORE_R + 0.2)
        pulses.append((p, d, i))

    ring_mat = emit_material("ring_dots", "#FFFFFF", 1.1)
    ring_lime = emit_material("ring_lime", LIME, 9.0)
    r1 = dots_ring("hud_ring_outer", RING_R * 1.24, 216, 0.0105, ring_mat, ring_lime, 18, main)
    r1.parent = rig
    r2 = dots_ring("hud_ring_inner", CORE_R * 1.75, 72, 0.008, ring_mat, ring_lime, 9, main)
    r2.parent = rig

    # pure void: no floor, no backdrop plane (both read as cheap CG in tests)

    # lights: big soft key top-left, cool rim from behind, lime kicker under the core
    def area(name, loc, power, size, color="#FFFFFF"):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "DISK"  # round speculars, like the CSS orb highlight
        ld.energy = power
        ld.size = size
        ld.color = hex_rgba(color)[:3]
        lo = link(bpy.data.objects.new(name, ld), env)
        lo.location = loc
        tr = lo.constraints.new("TRACK_TO")
        tr.target = rig
        return lo

    area("key", (-5.0, -6.0, 7.5), 520, 4.5, "#FFF6EE")
    area("rim", (2.0, 8.0, 4.0), 650, 5.0, "#C9D6FF")

    # animation: one revolution + gentle bob + pulses travelling core -> employee
    n = LOOP_FRAMES
    keyframes(rig, "rotation_euler", 2, [2 * math.pi * (f / n) * -1 for f in range(n)])
    for i, ob in enumerate(orbs):
        ph = 2 * math.pi * i / len(orbs)
        keyframes(ob, "location", 2, [0.09 * math.sin(2 * math.pi * 2 * f / n + ph) for f in range(n)], "BEZIER")
    for p, d, i in pulses:
        start, end = CORE_R * 1.1, RING_R - ORB_R * 1.15
        xs, ys, zs = [], [], []
        for f in range(n):
            t = ((f / (n / 4)) + i / len(pulses)) % 1.0  # 4 trips per loop
            r = start + (end - start) * t
            xs.append(d.x * r)
            ys.append(d.y * r)
        keyframes(p, "location", 0, xs)
        keyframes(p, "location", 1, ys)
        # fade in/out by scaling near the ends
        sc_vals = []
        for f in range(n):
            t = ((f / (n / 4)) + i / len(pulses)) % 1.0
            sc_vals.append(max(0.0, min(1.0, t / 0.12, (1 - t) / 0.12)))
        for axis in range(3):
            keyframes(p, "scale", axis, sc_vals)

    # camera
    cam_d = bpy.data.cameras.new("cam")
    cam = link(bpy.data.objects.new("cam", cam_d), env)
    sc.camera = cam
    target = link(bpy.data.objects.new("cam_target", None), env)
    target.location = (0, 0, 0.05)
    tr = cam.constraints.new("TRACK_TO")
    tr.target = target
    cam_d.dof.use_dof = True
    cam_d.dof.focus_object = target
    cam_d.dof.aperture_fstop = 3.2

    # compositor: soft bloom (Fog Glow) for the luminous "AI OS" look
    tree = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
    rl = tree.nodes.new("CompositorNodeRLayers")
    glare = tree.nodes.new("CompositorNodeGlare")
    for name, val in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", 0.65), ("Strength", 0.55), ("Size", 0.6)):
        try:
            glare.inputs[name].default_value = val
        except Exception:
            pass
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    go = tree.nodes.new("NodeGroupOutput")
    tree.links.new(rl.outputs["Image"], glare.inputs["Image"])
    tree.links.new(glare.outputs["Image"], go.inputs[0])
    sc.compositing_node_group = tree
    return sc, cam, cam_d, orbs, core, rig


def frame_16x9(sc, cam, cam_d):
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    cam.location = (0.0, -11.0, 4.6)
    cam_d.lens = 46


def frame_9x16(sc, cam, cam_d):
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
    cam.location = (0.0, -6.4, 8.4)
    cam_d.lens = 31
    cam_d.sensor_fit = "HORIZONTAL"


def render_still(sc, path, frame=1):
    sc.frame_set(frame)
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if sc.render.film_transparent else "RGB"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[uslub3d] wrote {path}")


def render_orbs(sc, cam, cam_d, orbs, core):
    os.makedirs(os.path.join(OUT, "orbs"), exist_ok=True)
    sc.render.resolution_x = sc.render.resolution_y = 1024
    sc.render.film_transparent = True
    sc.compositing_node_group = None
    hide = [o for o in bpy.data.objects if o.type in {"MESH"} and o not in orbs + [core]]
    for o in hide:
        o.hide_render = True
    for ob in orbs + [core]:
        for o in orbs + [core]:
            o.hide_render = o is not ob
        sc.frame_set(1)
        bpy.context.view_layer.update()
        wpos = ob.matrix_world.translation.copy()
        r = CORE_R if ob is core else ORB_R
        cam.constraints.clear()
        view = Vector((-0.05, -1.0, 0.18)).normalized()
        cam.location = wpos + view * (r * 7.5)
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (-view).to_track_quat("-Z", "Y")
        cam_d.lens = 85
        cam_d.dof.use_dof = False
        role = "core" if ob is core else ob["role"]
        render_still(sc, os.path.join(OUT, "orbs", f"orb-{role}.png"))


def export_glb(orbs, core):
    """Bake the world-normal gradient into vertex colours so the web model looks
    like the render without custom shaders (glTF has no procedural nodes)."""
    sc = bpy.context.scene
    sc.frame_set(1)
    bpy.context.view_layer.update()
    for ob, (role, a, b) in list(zip(orbs, ROLES)) + [(core, CORE)]:
        me = ob.data
        glow, deep, ink = hex_rgba(a), hex_rgba(b), hex_rgba(INK)
        hi = mix(glow, (1, 1, 1, 1), 0.35)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        rot = ob.matrix_world.to_3x3()
        for v in me.vertices:
            n = (rot @ v.normal).normalized()
            t = (n.dot(KEY_DIR) + 1) / 2
            if t < 0.5:
                c = mix(ink, deep, t / 0.5)
            elif t < 0.86:
                c = mix(deep, glow, (t - 0.5) / 0.36)
            else:
                c = mix(glow, hi, (t - 0.86) / 0.14)
            attr.data[v.index].color = c
        mat = bpy.data.materials.new(f"web_{role}")
        bsdf = principled(mat)
        ca = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        ca.layer_name = "Col"
        mat.node_tree.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
        set_in(bsdf, "Roughness", 0.3)
        set_in(bsdf, ["Coat Weight", "Coat"], 1.0)
        set_in(bsdf, "Coat Roughness", 0.04)
        set_in(bsdf, "Emission Color", glow)
        set_in(bsdf, "Emission Strength", 0.25 if ob is not core else 0.6)
        me.materials.clear()
        me.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.collections["Constellation"].all_objects:
        o.select_set(True)
    path = os.path.join(OUT, "uslub-constellation.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"[uslub3d] wrote {path}")


def main():
    if "hero16x9" in MODES:
        sc, cam, cam_d, *_ = build()
        frame_16x9(sc, cam, cam_d)
        render_still(sc, os.path.join(OUT, "constellation-16x9.png"), frame=1)
    if "hero9x16" in MODES:
        sc, cam, cam_d, *_ = build()
        frame_9x16(sc, cam, cam_d)
        render_still(sc, os.path.join(OUT, "constellation-9x16.png"), frame=1)
    if "loop" in MODES:
        sc, cam, cam_d, *_ = build()
        frame_16x9(sc, cam, cam_d)
        os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGB"
        sc.render.filepath = os.path.join(OUT, "frames", "loop_")
        if QUALITY == "preview":
            sc.render.resolution_percentage = 50
        bpy.ops.render.render(animation=True)
    if "orbs" in MODES:
        sc, cam, cam_d, orbs, core, rig = build()
        render_orbs(sc, cam, cam_d, orbs, core)
    if "glb" in MODES or "blend" in MODES:
        sc, cam, cam_d, orbs, core, rig = build()
        frame_16x9(sc, cam, cam_d)
        if "blend" in MODES:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "uslub-constellation.blend"))
        if "glb" in MODES:
            export_glb(orbs, core)


main()
