"""
Mercat ad — Blender PREVIS (grey-box) for the "studio flies out of the phone" film.

Why: the hero shot (gear bursting out of a phone and assembling a studio around a
sleeping owner) is exactly what video models morph and melt. Pros block it in 3D
first: the clay render fixes layout, timing and camera; it then goes to Seedance 2.5
as @Clay Render, and its key frames go to Nano Banana Pro for a photoreal restyle
that becomes the start/end frames (docs/video/ad/runbook.md).

Timeline (24 fps, one continuous scene; each shot renders its own range + camera):
  A1   1– 96  night wide: owner asleep, phone on the nightstand lights up
  A2  97–168  close: the phone glows on the nightstand
  A4 169–288  burst: softboxes, camera, tripod, product pedestal and 10 AI orbs fly
              out of the phone and assemble a studio around the bed (pull-out reveal)
  A5 289–384  studio ON: softboxes light up, camera orbits the product, orbs circle
  A7 385–480  everything flies back INTO the phone
  A8 481–576  morning: the room is a bedroom again, sun through the window, phone glows

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python docs/video/ad/build_previs.py -- <out_dir> [shots=A1,A2,A4,A5,A7,A8] [stills] [preview]
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ARGV = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = os.path.abspath(ARGV[0] if ARGV else "./previs")
OPTS = ARGV[1:]
SHOTS = next((o.split("=", 1)[1].split(",") for o in OPTS if o.startswith("shots=")), ["A1", "A2", "A4", "A5", "A7", "A8"])
STILLS = "stills" in OPTS
PREVIEW = "preview" in OPTS
os.makedirs(OUT, exist_ok=True)

FPS = 24
RANGES = {"A1": (1, 96), "A2": (97, 168), "A4": (169, 288), "A5": (289, 384), "A7": (385, 480), "A8": (481, 576)}
BURST, ASSEMBLED, STUDIO_ON, RETURN_START, RETURN_END, MORNING = 175, 262, 300, 392, 470, 481

GRAD = [  # signature orb colours, = GRAD in src/components/uslub/agents.ts
    ("#FBE3C2", "#E98A5E"), ("#D7FF3A", "#16B364"), ("#5B7CFF", "#7C3AED"), ("#FF7A5C", "#FFB98A"),
    ("#FF2D55", "#C026D3"), ("#38E1FF", "#2F6BFF"), ("#FF7AC6", "#9D4EDD"), ("#FF9F1C", "#FF2D55"),
    ("#3B82F6", "#22D3EE"), ("#B4F43A", "#0FB5A6"),
]


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ------------------------------------------------------------------ setup
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.fps = FPS
sc.eevee.taa_render_samples = 8 if PREVIEW else 24
sc.render.resolution_x, sc.render.resolution_y = (1280, 720)
sc.view_settings.view_transform = "AgX"
world = bpy.data.worlds.new("w")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
sc.world = world


def mat(name, color, rough=0.6, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = lin(emit)
        b.inputs["Emission Strength"].default_value = strength
    return m


CLAY = mat("clay", "#9C9A96")
LINEN = mat("linen", "#B9B2A8", 0.8)
WOOD = mat("wood", "#6E6259", 0.5)
GEAR = mat("gear", "#7E848C", 0.35)
DARK = mat("gear_dark", "#2B2E33", 0.3)
SCREEN = mat("phone_screen", "#111111", 0.2, "#00FF00", 0.0)  # green screen, animated glow
SOFT = mat("softbox_face", "#EDEDED", 0.9, "#FFFFFF", 0.0)  # animated on at STUDIO_ON
WINDOW = mat("window", "#202A3A", 0.9, "#9FB6E6", 0.6)


def box(name, size, loc, material, bevel=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
    o.data.materials.append(material)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def cyl(name, r, depth, loc, material, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(material)
    return o


def sphere(name, r, loc, material, seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(material)
    return o


def empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    sc.collection.objects.link(o)
    o.location = loc
    return o


def parent(children, p):
    for c in children:
        c.parent = p
        c.matrix_parent_inverse = p.matrix_world.inverted()


# ------------------------------------------------------------------ room
box("floor", (8, 8, 0.02), (0, 0, -0.01), CLAY, 0)
box("wall_back", (8, 0.1, 3), (0, 2.2, 1.5), CLAY, 0)
box("wall_left", (0.1, 8, 3), (-2.6, 0, 1.5), CLAY, 0)
box("window", (0.02, 1.2, 1.3), (-2.54, 0.6, 1.6), WINDOW, 0)

# bed (head against the back wall), sleeping owner = head + body lump under the blanket
box("bed_base", (1.7, 2.1, 0.32), (0, 1.05, 0.16), WOOD, 0.02)
box("headboard", (1.8, 0.08, 0.9), (0, 2.12, 0.6), WOOD, 0.02)
box("mattress", (1.6, 2.0, 0.22), (0, 1.05, 0.43), LINEN, 0.05)
box("pillow", (0.62, 0.38, 0.14), (-0.35, 1.78, 0.6), LINEN, 0.06)
sphere("owner_head", 0.11, (-0.35, 1.72, 0.72), CLAY)
lump = sphere("owner_body", 0.3, (-0.3, 1.0, 0.6), LINEN)
lump.scale = (0.85, 2.0, 0.45)
box("blanket", (1.62, 1.45, 0.1), (0, 0.78, 0.58), LINEN, 0.05)

# nightstand + phone (the phone is the portal)
box("nightstand", (0.48, 0.42, 0.55), (1.15, 1.85, 0.275), WOOD, 0.015)
PHONE_POS = Vector((1.12, 1.78, 0.56))
phone = box("phone", (0.075, 0.155, 0.009), PHONE_POS, DARK, 0.004, rot=(0, 0, math.radians(-12)))
screen = box("phone_screen", (0.068, 0.145, 0.002), PHONE_POS + Vector((0, 0, 0.0055)), SCREEN, 0, rot=(0, 0, math.radians(-12)))
pl = bpy.data.lights.new("phone_glow", "POINT")
pl.color = (0.75, 1.0, 0.55)
pl.shadow_soft_size = 0.05
phone_light = bpy.data.objects.new("phone_glow", pl)
sc.collection.objects.link(phone_light)
phone_light.location = PHONE_POS + Vector((0, 0, 0.12))


# ------------------------------------------------------------------ studio gear (built at final pose, then animated)
def softbox(name, loc, yaw):
    root = empty(name, loc)
    parts = [
        cyl(name + "_pole", 0.015, 1.5, Vector(loc) + Vector((0, 0, 0.75)), DARK),
        box(name + "_box", (0.55, 0.22, 0.55), Vector(loc) + Vector((0, 0, 1.55)), GEAR, 0.02),
        box(name + "_face", (0.5, 0.01, 0.5), Vector(loc) + Vector((0, -0.115, 1.55)), SOFT, 0),
    ]
    for i in range(3):
        a = 2 * math.pi * i / 3
        parts.append(cyl(name + f"_leg{i}", 0.01, 0.5, Vector(loc) + Vector((0.18 * math.cos(a), 0.18 * math.sin(a), 0.2)), DARK,
                         rot=(math.radians(22) * math.sin(a), -math.radians(22) * math.cos(a), 0)))
    parent(parts, root)
    al = bpy.data.lights.new(name + "_light", "AREA")
    al.shape = "SQUARE"
    al.size = 0.5
    al.energy = 0
    lo = bpy.data.objects.new(name + "_light", al)
    sc.collection.objects.link(lo)
    lo.location = Vector(loc) + Vector((0, -0.14, 1.55))
    lo.rotation_euler = (math.radians(-90), 0, 0)  # area lights emit along local -Z -> rotate to face -Y (front)
    lo.parent = root
    lo.matrix_parent_inverse = root.matrix_world.inverted()
    root.rotation_euler = (0, 0, yaw)
    return root, al


def cine_camera(name, loc, yaw):
    root = empty(name, loc)
    parts = [
        box(name + "_body", (0.16, 0.26, 0.16), Vector(loc) + Vector((0, 0, 1.25)), DARK, 0.015),
        cyl(name + "_lens", 0.05, 0.16, Vector(loc) + Vector((0, -0.2, 1.25)), GEAR, rot=(math.radians(90), 0, 0)),
        box(name + "_handle", (0.04, 0.16, 0.04), Vector(loc) + Vector((0, 0.02, 1.36)), DARK, 0.01),
    ]
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.5
        parts.append(cyl(name + f"_leg{i}", 0.012, 1.25, Vector(loc) + Vector((0.2 * math.cos(a), 0.2 * math.sin(a), 0.6)), GEAR,
                         rot=(math.radians(14) * math.sin(a), -math.radians(14) * math.cos(a), 0)))
    parent(parts, root)
    root.rotation_euler = (0, 0, yaw)
    return root


def pedestal(name, loc):
    root = empty(name, loc)
    parts = [
        cyl(name + "_base", 0.28, 0.6, Vector(loc) + Vector((0, 0, 0.3)), mat("pedestal", "#D8D4CC", 0.5)),
        box(name + "_product", (0.14, 0.14, 0.24), Vector(loc) + Vector((0, 0, 0.72)), mat("product", "#C8553D", 0.3), 0.02),
    ]
    parent(parts, root)
    return root


PEDESTAL = (0.4, -0.35, 0)


def yaw_to(src, dst=PEDESTAL):
    """Yaw that turns a prop's local -Y (its front) towards dst."""
    dx, dy = dst[0] - src[0], dst[1] - src[1]
    return math.atan2(dx, -dy)


SB1, SB2, CAMP = (-1.25, -1.35, 0), (1.85, -1.0, 0), (-0.55, -1.25, 0)  # CAMP off the A5 camera path
sb1, sb1_light = softbox("softbox_L", SB1, yaw_to(SB1))
sb2, sb2_light = softbox("softbox_R", SB2, yaw_to(SB2))
cam_prop = cine_camera("cinecam", CAMP, yaw_to(CAMP))
ped = pedestal("pedestal", PEDESTAL)

orbs = []
for i, (a, b) in enumerate(GRAD):
    m = mat(f"orb{i}", b, 0.25, a, 0.6)
    o = sphere(f"orb{i}", 0.09, (0, 0, 0), m, 24)
    orbs.append(o)

# ------------------------------------------------------------------ animation helpers
def key(o, frame, loc=None, scale=None, rot=None, interp="BEZIER"):
    if loc is not None:
        o.location = loc
        o.keyframe_insert("location", frame=frame)
    if scale is not None:
        o.scale = (scale, scale, scale)
        o.keyframe_insert("scale", frame=frame)
    if rot is not None:
        o.rotation_euler = rot
        o.keyframe_insert("rotation_euler", frame=frame)


def fly(o, final_loc, final_rot, start, dur, back_start, back_dur, lift=0.9):
    """Phone -> arc -> final pose (eased), hold, then the same arc back into the phone."""
    p0 = PHONE_POS.copy()
    p1 = Vector(final_loc)
    mid = (p0 + p1) / 2 + Vector((0, 0, lift))
    spin = (final_rot[0], final_rot[1], final_rot[2] + math.radians(200))
    key(o, 1, p0, 0.001, spin)
    key(o, start, p0, 0.001, spin)
    key(o, start + int(dur * 0.45), mid, 0.55, (final_rot[0], final_rot[1], final_rot[2] + math.radians(80)))
    key(o, start + dur, p1, 1.0, final_rot)
    key(o, back_start, p1, 1.0, final_rot)
    key(o, back_start + int(back_dur * 0.55), mid, 0.5, (final_rot[0], final_rot[1], final_rot[2] - math.radians(80)))
    key(o, back_start + back_dur, p0, 0.001, spin)


items = [(sb1, 0), (sb2, 6), (cam_prop, 12), (ped, 18)]
for o, delay in items:
    fly(o, o.location.copy(), tuple(o.rotation_euler), BURST + delay, 60, RETURN_START + (18 - delay), 52)

# orbs: spill out last, then orbit the pedestal while the studio works
center = Vector((0.4, -0.35, 1.25))
for i, o in enumerate(orbs):
    ang0 = 2 * math.pi * i / len(orbs)
    def ring(frame, r=0.75):
        a = ang0 + 2 * math.pi * (frame - ASSEMBLED) / 220
        return center + Vector((r * math.cos(a), r * math.sin(a), 0.12 * math.sin(a * 2)))
    key(o, 1, PHONE_POS, 0.001)
    key(o, BURST + 24 + i * 2, PHONE_POS, 0.001)
    key(o, BURST + 50 + i * 2, (PHONE_POS + ring(ASSEMBLED)) / 2 + Vector((0, 0, 0.7)), 0.7)
    for f in range(ASSEMBLED, RETURN_START + 1, 8):
        key(o, f, ring(f), 1.0)
    key(o, RETURN_START + 20 + i * 2, (PHONE_POS + ring(RETURN_START)) / 2 + Vector((0, 0, 0.6)), 0.6)
    key(o, RETURN_START + 40 + i * 2, PHONE_POS, 0.001)

# phone screen + glow
scr = SCREEN.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
for f, v in [(1, 0), (55, 0), (62, 4), (BURST - 2, 6), (BURST + 4, 40), (BURST + 30, 4), (RETURN_END - 6, 4), (RETURN_END, 30), (RETURN_END + 8, 3), (MORNING + 30, 3), (MORNING + 40, 8), (576, 8)]:
    scr.default_value = v
    scr.keyframe_insert("default_value", frame=f)
for f, v in [(1, 0), (55, 0), (62, 8), (BURST - 2, 10), (BURST + 4, 260), (BURST + 30, 25), (RETURN_END - 6, 20), (RETURN_END, 200), (RETURN_END + 8, 6), (576, 10)]:
    pl.energy = v
    pl.keyframe_insert("energy", frame=f)

# studio lights on / off; softbox faces glow
face = SOFT.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
for f, v in [(1, 0), (STUDIO_ON, 0), (STUDIO_ON + 6, 6), (RETURN_START, 6), (RETURN_START + 6, 0), (576, 0)]:
    face.default_value = v
    face.keyframe_insert("default_value", frame=f)
    for L in (sb1_light, sb2_light):
        L.energy = v * 45
        L.keyframe_insert("energy", frame=f)

# night -> morning: moonlight vs sun, world tint
moon = bpy.data.lights.new("moon", "AREA")
moon.size = 1.4
moon.color = (0.55, 0.65, 1.0)
moon_o = bpy.data.objects.new("moon", moon)
sc.collection.objects.link(moon_o)
moon_o.location = (-3.4, 0.6, 1.7)
moon_o.rotation_euler = (0, math.radians(-90), 0)
sun = bpy.data.lights.new("sun", "SUN")
sun.color = (1.0, 0.82, 0.6)
sun.angle = math.radians(3)
sun_o = bpy.data.objects.new("sun", sun)
sc.collection.objects.link(sun_o)
sun_o.rotation_euler = (math.radians(70), 0, math.radians(-75))
# warm morning light through the (painted) window: a second area light at the window
dawn = bpy.data.lights.new("dawn", "AREA")
dawn.size = 1.6
dawn.color = (1.0, 0.78, 0.52)
dawn_o = bpy.data.objects.new("dawn", dawn)
sc.collection.objects.link(dawn_o)
dawn_o.location = (-2.3, 0.6, 1.7)
dawn_o.rotation_euler = (0, math.radians(-75), 0)
win = WINDOW.node_tree.nodes["Principled BSDF"].inputs
for f, d_, wc in [(1, 0, "#9FB6E6"), (MORNING - 1, 0, "#9FB6E6"), (MORNING + 12, 420, "#FFD8A8"), (576, 420, "#FFD8A8")]:
    dawn.energy = d_
    dawn.keyframe_insert("energy", frame=f)
    win["Emission Color"].default_value = lin(wc)
    win["Emission Color"].keyframe_insert("default_value", frame=f)
for f, m_, s_, w in [(1, 120, 0, "#05070C"), (MORNING - 1, 120, 0, "#05070C"), (MORNING + 12, 0, 0, "#40372E"), (576, 0, 0, "#40372E")]:
    moon.energy = m_
    moon.keyframe_insert("energy", frame=f)
    sun.energy = s_
    sun.keyframe_insert("energy", frame=f)
    bg.inputs["Color"].default_value = lin(w)
    bg.inputs["Color"].keyframe_insert("default_value", frame=f)
    bg.inputs["Strength"].default_value = 1.0


# ------------------------------------------------------------------ cameras (one per shot)
def camera(name, lens, keys, target, target_keys=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 2.8
    co = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(co)
    tgt = empty(name + "_target", target)
    tr = co.constraints.new("TRACK_TO")
    tr.target = tgt
    cd.dof.focus_object = tgt
    for f, loc in keys:
        co.location = loc
        co.keyframe_insert("location", frame=f)
    for f, loc in target_keys or []:
        tgt.location = loc
        tgt.keyframe_insert("location", frame=f)
    return co


CAMS = {
    "A1": camera("cam_A1", 28, [(1, (1.9, -2.6, 1.15)), (96, (1.6, -2.0, 1.1))], (0.0, 1.2, 0.6)),
    "A2": camera("cam_A2", 50, [(97, (1.55, 1.05, 0.95)), (168, (1.45, 1.25, 0.88))], tuple(PHONE_POS)),
    # starts tight on the phone as it bursts, pulls back to reveal the assembled studio
    "A4": camera("cam_A4", 24, [(169, (1.5, 1.2, 0.78)), (200, (1.7, 0.6, 0.95)), (288, (2.6, -3.2, 1.7))], tuple(PHONE_POS),
                 target_keys=[(169, tuple(PHONE_POS)), (200, tuple(PHONE_POS + Vector((-0.2, -0.3, 0.2)))), (288, (0.3, 0.2, 0.8))]),
    "A5": camera("cam_A5", 35, [(289, (-1.2, -2.4, 1.35)), (384, (1.7, -2.5, 1.45))], (0.4, -0.35, 0.8)),
    "A7": camera("cam_A7", 26, [(385, (2.6, -3.2, 1.7)), (480, (1.55, 1.15, 0.85))], (0.3, 0.2, 0.8),
                 target_keys=[(385, (0.3, 0.2, 0.8)), (470, tuple(PHONE_POS))]),
    "A8": camera("cam_A8", 28, [(481, (1.9, -2.6, 1.15)), (576, (1.7, -2.2, 1.1))], (0.0, 1.2, 0.6)),
}

# ------------------------------------------------------------------ render
for shot in SHOTS:
    a, b = RANGES[shot]
    sc.camera = CAMS[shot]
    sc.frame_start, sc.frame_end = a, b
    if STILLS:
        sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
        sc.render.image_settings.file_format = "JPEG"
        frames = [("start", a), ("end", b)]
        if shot in ("A4", "A7"):  # the hero VFX shots are generated in two halves: start -> mid -> end
            frames.insert(1, ("mid", (a + b) // 2))
        for tag, f in frames:
            sc.frame_set(f)
            sc.render.filepath = os.path.join(OUT, "stills", f"{shot}_{tag}.jpg")
            bpy.ops.render.render(write_still=True)
        sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    else:
        sc.render.image_settings.file_format = "PNG"
        sc.render.filepath = os.path.join(OUT, "frames", shot, "f_")
        os.makedirs(os.path.dirname(sc.render.filepath), exist_ok=True)
        bpy.ops.render.render(animation=True)
    print(f"[previs] {shot} done")
