#!/usr/bin/env python3
"""
Mercat ad — assembler. One script for the local animatic AND the final cut in the
Higgsfield sandbox (python3 + Pillow + ffmpeg; no drawtext/libass needed).

  # local animatic from the Blender previs (720p, "ANIMATIC" badge):
  python3 docs/video/ad/assemble.py

  # final cut (1080p, no badge) from picked shots / screen recordings / music:
  python3 assemble.py --final --manifest manifest.json --out mercat-ad.mp4

manifest.json (every value: https URL or local path; anything missing falls back):
  {"shots": {"A1": "...", "A2": "...", "A4a": "...", "A4b": "...", "A5": "...", "A7": "...", "A8": "..."},
   "sr":    {"SR-A3": "...", "SR3": "...", "SR4": "...", "SR5": "...", "SR6": "...", "SR7": "...",
             "POSTS": "...png"},              # POSTS = screenshot of the ready posts (floats in A8)
   "music": "...mp3|wav|m4a"}                 # optional; trimmed, faded, loudness -16 LUFS
Missing shots fall back to the Blender previs; missing SR -> designed placeholder card.
Assets (orbs, QR, constellation loop, previs) come from the repo when run inside it,
otherwise from jsDelivr at a pinned commit. Font: $FONT, else Manrope (OFL, downloaded)
off macOS, else SF Pro on macOS.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CDN = "https://cdn.jsdelivr.net/gh/stuffdealerog-collab/mercat@2247420451f7f52c9efabb3c55398efbc26bca6b/"
MANROPE = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/manrope/Manrope%5Bwght%5D.ttf"
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2] if (HERE.parents[2] / "public/media/3d").exists() else None
FPS = 24
LIME = (215, 255, 58)

ap = argparse.ArgumentParser()
ap.add_argument("--manifest")
ap.add_argument("--final", action="store_true")
ap.add_argument("--out")
ap.add_argument("--work", default=None)
ARGS = ap.parse_args() if __name__ == "__main__" else ap.parse_args([])

SC = 1.5 if ARGS.final else 1.0
W, H = int(1280 * SC), int(720 * SC)
WORK = Path(ARGS.work or tempfile.mkdtemp(prefix="mercat_ad_"))
CACHE = WORK / "cache"
CARDS = WORK / "cards"
for d in (CACHE, CARDS):
    d.mkdir(parents=True, exist_ok=True)


def z(v):
    return int(round(v * SC))


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed: {' '.join(map(str, cmd))[:400]}\n{r.stderr[-1500:]}")


def fetch(src, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if str(src).startswith("http"):
        req = urllib.request.Request(str(src), headers={"User-Agent": "mercat-assembler"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    else:
        shutil.copy(src, dest)
    return dest


def asset(rel):
    """Repo file if we're inside the repo, else the pinned CDN copy."""
    if REPO and (REPO / rel).exists():
        return REPO / rel
    dest = CACHE / rel
    return dest if dest.exists() else fetch(CDN + rel, dest)


# ------------------------------------------------------------------ fonts
def font_file():
    if os.environ.get("FONT"):
        return os.environ["FONT"]
    sf = "/System/Library/Fonts/SFNS.ttf"
    if Path(sf).exists() and not os.environ.get("USE_MANROPE"):
        return sf
    dest = CACHE / "Manrope.ttf"
    return str(dest if dest.exists() else fetch(MANROPE, dest))


FONT = font_file()
WEIGHTS = {"Regular": 400, "Medium": 500, "Semibold": 600, "Bold": 700}


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT, z(size))
    try:
        axes = f.get_variation_axes()
        vals = []
        for a in axes:
            name = a.get("name", b"")
            name = name.decode() if isinstance(name, bytes) else str(name)
            vals.append(WEIGHTS[weight] if name.lower().startswith("weight") else a.get("default", 0))
        f.set_variation_by_axes(vals)
    except Exception:
        pass
    return f


# ------------------------------------------------------------------ designed layers
def shadowed(img, blur=14, k=0.7):
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sh.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(z(blur))).point(lambda a: int(a * k)))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.alpha_composite(sh)
    out.alpha_composite(img)
    return out


def super_card(name, uz, ru, y=470, strike=False):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fu, fr = font(62, "Bold"), font(28, "Medium")
    tw = d.textbbox((0, 0), uz, font=fu)[2]
    d.text(((W - tw) // 2, z(y)), uz, font=fu, fill=(255, 255, 255, 255))
    rw = d.textbbox((0, 0), ru, font=fr)[2]
    d.text(((W - rw) // 2, z(y + 78)), ru, font=fr, fill=(220, 220, 228, 230))
    if strike:
        x0 = (W - tw) // 2
        d.line([(x0 - z(10), z(y + 40)), (x0 + tw + z(10), z(y + 34))], fill=LIME + (255,), width=z(6))
    p = CARDS / f"{name}.png"
    shadowed(img).save(p)
    return p


def gradient_bg():
    small = Image.new("RGB", (320, 180))
    px = small.load()
    top, bottom, glow = (20, 24, 70), (6, 7, 18), (70, 60, 200)
    for yy in range(180):
        t = yy / 180
        for xx in range(320):
            dx, dy = (xx - 320 * 0.62) / 320, (yy - 180 * 0.35) / 180
            k = max(0.0, 1 - (dx * dx * 3 + dy * dy * 5)) ** 2
            px[xx, yy] = tuple(int(top[i] * (1 - t) + bottom[i] * t + glow[i] * k * 0.6) for i in range(3))
    return small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(z(4)))


CARD_RECT = (360, 110, 1200, 582)


def card_rect():
    return tuple(z(v) for v in CARD_RECT)


def glass_card(name, sr_id, label_uz, label_ru, word, orb, has_video):
    img = gradient_bg().convert("RGBA")
    x0, y0, x1, y1 = card_rect()
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if has_video:
        d.rounded_rectangle((x0 - z(3), y0 - z(3), x1 + z(3), y1 + z(3)), z(28), outline=LIME + (170,), width=z(2))
    else:
        d.rounded_rectangle((x0, y0, x1, y1), z(26), fill=(255, 255, 255, 22), outline=(255, 255, 255, 70), width=z(2))
        d.text((x0 + z(34), y0 + z(30)), f"{sr_id} · real screen recording", font=font(26, "Semibold"), fill=(255, 255, 255, 200))
        d.text((x0 + z(34), y0 + z(66)), label_ru, font=font(22, "Regular"), fill=(255, 255, 255, 150))
    img.alpha_composite(layer)
    o = Image.open(asset(f"public/media/3d/orbs/orb-{orb}.png")).convert("RGBA").resize((z(210), z(210)), Image.LANCZOS)
    img.alpha_composite(o, (z(95), z(210)))
    t = ImageDraw.Draw(img)
    fl = font(30, "Bold")
    t.text((z(200) - t.textbbox((0, 0), label_uz, font=fl)[2] // 2, z(432)), label_uz, font=fl, fill=(255, 255, 255, 255))
    fw = font(84, "Bold")
    ww = t.textbbox((0, 0), word, font=fw)[2]
    t.text(((W - ww) // 2, z(600)), word, font=fw, fill=LIME + (255,))
    p = CARDS / f"{name}.png"
    img.convert("RGB").save(p)
    return p


def end_card():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle((z(120), z(150), z(1160), z(560)), z(40), fill=(8, 8, 12, 205))
    img.alpha_composite(panel.filter(ImageFilter.GaussianBlur(z(18))))
    d = ImageDraw.Draw(img)
    fw = font(118, "Bold")
    x0 = z(170)
    ww = d.textbbox((0, 0), "Mercat", font=fw)[2]
    d.text((x0, z(180)), "Mercat", font=fw, fill=(255, 255, 255, 255))
    d.ellipse((x0 + ww + z(14), z(270), x0 + ww + z(40), z(296)), fill=LIME + (255,))
    d.text((x0, z(330)), "Butun marketing bo‘limi — bir havolada.", font=font(34, "Semibold"), fill=(255, 255, 255, 235))
    d.text((x0, z(380)), "Целый отдел маркетинга — по одной ссылке.", font=font(24, "Regular"), fill=(220, 220, 228, 200))
    d.text((x0, z(470)), "mercat-ai.vercel.app", font=font(30, "Semibold"), fill=LIME + (255,))
    d.text((x0, z(512)), "Telegram: Mercat · @hackathonproj1_bot", font=font(22, "Regular"), fill=(220, 220, 228, 200))
    d.text((x0, z(640)), "MARS AI Hackathon · Techstars Startup Week Tashkent", font=font(18, "Regular"), fill=(200, 200, 210, 170))
    qr = Image.open(asset("docs/video/ad/animatic/cards/qr-bot.png")).convert("RGBA").resize((z(230), z(230)), Image.NEAREST)
    mask = Image.new("L", qr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, qr.size[0] - 1, qr.size[1] - 1), z(22), fill=255)
    qr.putalpha(mask)
    img.alpha_composite(qr, (z(900), z(240)))
    p = CARDS / "end-card.png"
    img.save(p)
    return p


def posts_panel(shot_path):
    """The ready posts (a screenshot) floating as a glass panel on the right of A8."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shot = Image.open(shot_path).convert("RGBA")
    ph = z(560)
    pw = int(shot.width * ph / shot.height)
    if pw > z(520):
        pw = z(520)
        ph = int(shot.height * pw / shot.width)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), z(22), fill=255)
    shot.putalpha(mask)
    x, y = W - pw - z(70), (H - ph) // 2 - z(20)
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((x - z(8), y - z(8), x + pw + z(8), y + ph + z(8)), z(28), fill=(255, 255, 255, 40), outline=LIME + (160,), width=z(2))
    img.alpha_composite(shadowed(frame, 24, 0.9))
    img.alpha_composite(shot, (x, y))
    p = CARDS / "posts-panel.png"
    img.save(p)
    return p


def badge():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((z(20), z(18), z(300), z(52)), z(10), fill=(0, 0, 0, 150))
    d.text((z(32), z(22)), "ANIMATIC · previs, not final", font=font(18, "Semibold"), fill=LIME + (255,))
    p = CARDS / "badge.png"
    img.save(p)
    return p


# ------------------------------------------------------------------ video segments
def clip_segment(out, src, dur, overlays, dim=0.0):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    for png, _, _ in overlays:
        cmd += ["-loop", "1", "-t", f"{dur}", "-i", str(png)]
    eq = f",eq=brightness={-dim}:saturation={1 - dim}" if dim else ""
    fc = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},trim=duration={dur},setpts=PTS-STARTPTS{eq},tpad=stop_mode=clone:stop_duration={dur}[v0]"
    last = "v0"
    for i, (_, t0, t1) in enumerate(overlays, start=1):
        fc += f";[{i}:v]format=rgba,fade=in:st={t0}:d=0.35:alpha=1,fade=out:st={max(t0, t1 - 0.3)}:d=0.3:alpha=1[o{i}]"
        fc += f";[{last}][o{i}]overlay=0:0:enable='between(t,{t0},{t1})'[v{i}]"
        last = f"v{i}"
    cmd += ["-filter_complex", fc, "-map", f"[{last}]", "-t", f"{dur}", "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)]
    run(cmd)


def card_segment(out, png, dur, video=None):
    if video:
        x0, y0, x1, y1 = card_rect()
        w, h = x1 - x0, y1 - y0
        fc = (f"[0:v]scale={W}:{H},fps={FPS}[bg];[1:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
              f"fps={FPS},trim=duration={dur},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={dur}[sr];[bg][sr]overlay={x0}:{y0}[v]")
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur}", "-i", str(png), "-i", str(video), "-filter_complex", fc, "-map", "[v]"]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur}", "-i", str(png), "-vf", f"scale={W}:{H},fps={FPS},fade=in:d=0.25"]
    cmd += ["-t", f"{dur}", "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)]
    run(cmd)


def main():
    manifest = json.loads(Path(ARGS.manifest).read_text()) if ARGS.manifest else {}
    shots_in, sr_in = manifest.get("shots", {}), manifest.get("sr", {})
    local_shots = (REPO / "docs/video/ad/shots") if REPO else None
    report = {}

    def media(kind, key, ext=".mp4"):
        src = (shots_in if kind == "shot" else sr_in).get(key)
        if src:
            return fetch(src, WORK / "in" / f"{key}{Path(str(src).split('?')[0]).suffix or ext}")
        if local_shots and (local_shots / f"{key}{ext}").exists():
            return local_shots / f"{key}{ext}"
        return None

    def shot(key):
        p = media("shot", key)
        if p is None and key == "A4":
            a, b = media("shot", "A4a"), media("shot", "A4b")
            if a and b:
                p = WORK / "in" / "A4_joined.mp4"
                fc = "".join(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},trim=duration=2.5,setpts=PTS-STARTPTS[p{i}];" for i in range(2))
                run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(a), "-i", str(b), "-filter_complex", fc + "[p0][p1]concat=n=2:v=1[v]",
                     "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(p)])
        report[key] = "final" if p else "previs"
        return p or asset(f"docs/video/ad/previs/{key}.mp4")

    segs = []

    def seg(name):
        p = WORK / "seg" / f"{len(segs):02d}_{name}.mp4"
        p.parent.mkdir(parents=True, exist_ok=True)
        segs.append(p)
        return p

    clip_segment(seg("A1"), shot("A1"), 4.0, [(super_card("A1", "Nega sotilmayapti?", "Почему не покупают?"), 1.4, 4.0)])
    clip_segment(seg("A2"), shot("A2"), 3.0, [
        (super_card("A2a", "Agentlik — $3 000 dan", "Агентство — от $3 000" + ("" if ARGS.final else "  [нужен источник]"), strike=True), 0.0, 1.6),
        (super_card("A2b", "Yoki — bir havola.", "Или — одна ссылка."), 1.6, 3.0)])
    sr = media("sr", "SR-A3")
    card_segment(seg("A3"), glass_card("A3", "SR-A3", "Mercat", "Вставляем ссылку → Enter", "bir havola", "core", bool(sr)), 2.0, sr)
    clip_segment(seg("A4"), shot("A4"), 5.0, [(super_card("A4", "Butun studiya — telefoningizda.", "Целая студия — в вашем телефоне.", y=560), 3.3, 5.0)])
    clip_segment(seg("A5"), shot("A5"), 4.0, [])
    for sr_id, uz, ru, word, orb in [
        ("SR3", "Analitik", "Канал: охваты, лучшие часы, что работает", "tahlil", "analyst"),
        ("SR4", "Strateg", "План на неделю", "reja", "strategist"),
        ("SR5", "Muharrir", "Пост + вычёркиваем нейро-слова", "post", "editor"),
        ("SR6", "Tarjimon", "Lotin · Кирилл · RU · EN", "4 til", "translator"),
        ("SR7", "Videograf", "Фото товара → ролик", "video", "video"),
    ]:
        v = media("sr", sr_id)
        report[sr_id] = "recording" if v else "placeholder"
        card_segment(seg(sr_id), glass_card(f"A6-{sr_id}", sr_id, uz, ru, word, orb, bool(v)), 2.0, v)
    clip_segment(seg("A7"), shot("A7"), 4.0, [(super_card("A7", "Hammasi — bitta telefonda.", "Всё — в одном телефоне."), 2.0, 4.0)])
    a8 = [(super_card("A8", "Ertalab — postlar tayyor.", "Утром — посты готовы."), 1.4, 4.0)]
    posts = media("sr", "POSTS", ".png")
    if posts:
        a8.insert(0, (posts_panel(posts), 0.9, 4.0))
    report["POSTS"] = "screenshot" if posts else "none"
    clip_segment(seg("A8"), shot("A8"), 4.0, a8)
    clip_segment(seg("A9"), asset("public/media/3d/constellation-loop-720p.mp4"), 5.0, [(end_card(), 0.4, 5.0)], dim=0.32)

    lst = WORK / "list.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in segs))
    joined = WORK / "joined.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])

    default_out = (REPO / "docs/video/ad/animatic/mercat-ad-animatic.mp4") if (REPO and not ARGS.final) else (WORK / "mercat-ad.mp4")
    out = Path(ARGS.out) if ARGS.out else default_out
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined)]
    fc = "[0:v]null[v]"
    if not ARGS.final:
        cmd += ["-loop", "1", "-i", str(badge())]
        fc = "[0:v][1:v]overlay=0:0:shortest=1[v]"
    maps = ["-map", "[v]"]
    music = manifest.get("music")
    if music:
        m = fetch(music, WORK / "in" / f"music{Path(str(music).split('?')[0]).suffix or '.mp3'}")
        mi = 1 if ARGS.final else 2
        cmd += ["-i", str(m)]
        fc += f";[{mi}:a]atrim=0:41.3,asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=39.3:d=2,loudnorm=I=-16:TP=-1.5[a]"
        maps += ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-filter_complex", fc, *maps, "-c:v", "libx264", "-crf", "18" if ARGS.final else "23", "-preset", "slow",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
    run(cmd)
    report["out"] = str(out)
    report["resolution"] = f"{W}x{H}"
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
