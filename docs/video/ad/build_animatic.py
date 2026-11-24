#!/usr/bin/env python3
"""
Mercat ad — animatic / rough-cut builder (no AI credits, no network).

Assembles the 41 s ad from:
  - Blender previs shots  docs/video/ad/previs/<A#>.mp4         (always available)
  - final shots, if present docs/video/ad/shots/<A#>.mp4         (Higgsfield selects:
    drop a file there and re-run -> the animatic turns into a rough cut)
  - screen recordings, if present docs/video/ad/shots/<SR#>.mp4 (placed inside the glass card)
  - supers, glass UI cards and the end card rendered here with PIL (this ffmpeg has no
    drawtext/libass, so all text is rendered to PNG and overlaid)

  python3 docs/video/ad/build_animatic.py            -> docs/video/ad/animatic/mercat-ad-animatic.mp4

Text is Uzbek first (big) with Russian below (small). Font: SF Pro as a stand-in on
macOS — set FONT=/path/Inter.ttf (OFL) for the final cards.
"""

import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
AD = ROOT / "docs/video/ad"
PREVIS, SHOTS, OUT = AD / "previs", AD / "shots", AD / "animatic"
CARDS = OUT / "cards"
ORBS = ROOT / "public/media/3d/orbs"
LOOP = ROOT / "public/media/3d/constellation-loop-720p.mp4"
W, H, FPS = 1280, 720, 24
FONT = os.environ.get("FONT", "/System/Library/Fonts/SFNS.ttf")
LIME = (215, 255, 58)
INK = (11, 11, 14)
CARDS.mkdir(parents=True, exist_ok=True)


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def text_layer(lines, anchor_y, big=64, small=30, glow=True, align="center", x=None):
    """Transparent 1280x720 PNG with UZ line(s) big + RU line small and a soft shadow."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = anchor_y
    for i, (txt, size, color, weight) in enumerate(lines):
        f = font(size, weight)
        bbox = d.textbbox((0, 0), txt, font=f)
        tw = bbox[2] - bbox[0]
        tx = (W - tw) // 2 if align == "center" else (x or 80)
        d.text((tx, y), txt, font=f, fill=color)
        y += int(size * 1.25)
    if glow:
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(14)).point(lambda a: int(a * 0.7)))
        base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        base.alpha_composite(shadow)
        base.alpha_composite(img)
        img = base
    return img


def super_card(name, uz, ru, y=470, strike=False):
    img = text_layer([(uz, 62, (255, 255, 255, 255), "Bold"), (ru, 28, (220, 220, 228, 230), "Medium")], y)
    if strike:  # lime strike-through across the UZ line
        d = ImageDraw.Draw(img)
        f = font(62, "Bold")
        tw = d.textbbox((0, 0), uz, font=f)[2]
        x0 = (W - tw) // 2
        d.line([(x0 - 10, y + 40), (x0 + tw + 10, y + 34)], fill=LIME + (255,), width=6)
    p = CARDS / f"{name}.png"
    img.save(p)
    return p


def gradient_bg(top=(20, 24, 70), bottom=(6, 7, 18), glow=(70, 60, 200)):
    """Deep blue/violet mesh-like gradient (the Lovio/Mercat 'AI world')."""
    img = Image.new("RGB", (W, H), bottom)
    px = img.load()
    for yy in range(H):
        t = yy / H
        for xx in range(0, W, 2):
            r = top[0] * (1 - t) + bottom[0] * t
            g = top[1] * (1 - t) + bottom[1] * t
            b = top[2] * (1 - t) + bottom[2] * t
            dx, dy = (xx - W * 0.62) / W, (yy - H * 0.35) / H
            k = max(0.0, 1 - (dx * dx * 3 + dy * dy * 5)) ** 2
            c = (int(r + glow[0] * k * 0.6), int(g + glow[1] * k * 0.6), int(b + glow[2] * k * 0.6))
            px[xx, yy] = c
            if xx + 1 < W:
                px[xx + 1, yy] = c
    return img.filter(ImageFilter.GaussianBlur(6))


def glass_card(name, sr_id, label_uz, label_ru, word, orb=None, has_video=False):
    """Full-frame design for a product beat: blue gradient, frosted glass card (the real
    screen recording goes inside), the employee's orb + name, one kinetic word."""
    img = gradient_bg().convert("RGBA")
    card = (360, 110, 1200, 582)  # 840x472 ~ 16:9 slot for the recording
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if not has_video:
        d.rounded_rectangle(card, 26, fill=(255, 255, 255, 22), outline=(255, 255, 255, 70), width=2)
        f = font(26, "Semibold")
        d.text((card[0] + 34, card[1] + 30), f"{sr_id} · real screen recording", font=f, fill=(255, 255, 255, 200))
        d.text((card[0] + 34, card[1] + 66), label_ru, font=font(22, "Regular"), fill=(255, 255, 255, 150))
        d.text((card[0] + 34, card[3] - 52), f"drop shots/{sr_id}.mp4 to place it here", font=font(18, "Regular"), fill=(215, 255, 58, 200))
    else:
        d.rounded_rectangle(card, 26, outline=(215, 255, 58, 150), width=2)
    img.alpha_composite(layer)
    if orb and (ORBS / f"orb-{orb}.png").exists():
        o = Image.open(ORBS / f"orb-{orb}.png").convert("RGBA").resize((210, 210), Image.LANCZOS)
        img.alpha_composite(o, (95, 210))
    t = ImageDraw.Draw(img)
    t.text((200 - t.textbbox((0, 0), label_uz, font=font(30))[2] // 2, 432), label_uz, font=font(30), fill=(255, 255, 255, 255))
    fw = font(84, "Bold")
    ww = t.textbbox((0, 0), word, font=fw)[2]
    t.text(((W - ww) // 2, 600), word, font=fw, fill=LIME + (255,))
    p = CARDS / f"{name}.png"
    img.convert("RGB").save(p)
    return p, card


def end_card():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # legibility: a soft ink panel behind the type and the QR (the constellation stays visible around it)
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle((120, 150, 1160, 560), 40, fill=(8, 8, 12, 205))
    img.alpha_composite(panel.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(img)
    fw = font(118, "Bold")
    word = "Mercat"
    ww = d.textbbox((0, 0), word, font=fw)[2]
    x0 = 170
    d.text((x0, 180), word, font=fw, fill=(255, 255, 255, 255))
    d.ellipse((x0 + ww + 14, 270, x0 + ww + 40, 296), fill=LIME + (255,))
    d.text((x0, 330), "Butun marketing boʻlimi — bir havolada.", font=font(34, "Semibold"), fill=(255, 255, 255, 235))
    d.text((x0, 380), "Целый отдел маркетинга — по одной ссылке.", font=font(24, "Regular"), fill=(220, 220, 228, 200))
    d.text((x0, 470), "mercat-ai.vercel.app", font=font(30, "Semibold"), fill=LIME + (255,))
    d.text((x0, 512), "Telegram: Mercat · @hackathonproj1_bot", font=font(22, "Regular"), fill=(220, 220, 228, 200))
    d.text((x0, 640), "MARS AI Hackathon · Techstars Startup Week Tashkent", font=font(18, "Regular"), fill=(200, 200, 210, 170))
    qr = Image.open(CARDS / "qr-bot.png").convert("RGBA").resize((230, 230), Image.NEAREST)
    mask = Image.new("L", qr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 229, 229), 22, fill=255)
    qr.putalpha(mask)
    img.alpha_composite(qr, (900, 240))
    p = CARDS / "end-card.png"
    img.save(p)
    return p


def badge():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 18, 300, 52), 10, fill=(0, 0, 0, 150))
    d.text((32, 22), "ANIMATIC · previs, not final", font=font(18, "Semibold"), fill=LIME + (255,))
    p = CARDS / "badge.png"
    img.save(p)
    return p


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def source(shot):
    final = SHOTS / f"{shot}.mp4"
    if not final.exists() and (SHOTS / f"{shot}a.mp4").exists() and (SHOTS / f"{shot}b.mp4").exists():
        # hero shot generated in two halves (A4a burst + A4b assembly): join the middle 2.5 s of each
        joined = Path(tempfile.mkdtemp(prefix="mercat_join_")) / f"{shot}.mp4"
        fc = "".join(f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},trim=duration=2.5,setpts=PTS-STARTPTS[p{i}];" for i in range(2))
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(SHOTS / f"{shot}a.mp4"), "-i", str(SHOTS / f"{shot}b.mp4"),
             "-filter_complex", fc + "[p0][p1]concat=n=2:v=1[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(joined)])
        return joined, True
    return (final, True) if final.exists() else (PREVIS / f"{shot}.mp4", False)


def clip_segment(out, src, dur, overlays, speed=1.0, dim=0.0):
    """src video (scaled/cropped to 1280x720, trimmed to dur) + PNG overlays [(png, t0, t1)]."""
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    for png, _, _ in overlays:
        cmd += ["-loop", "1", "-t", f"{dur}", "-i", str(png)]
    fc = f"[0:v]setpts=PTS/{speed},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},trim=duration={dur},setpts=PTS-STARTPTS" + (f",eq=brightness={-dim}:saturation={1 - dim}" if dim else "") + "[v0]"
    last = "v0"
    for i, (_, t0, t1) in enumerate(overlays, start=1):
        fc += f";[{i}:v]format=rgba,fade=in:st={t0}:d=0.35:alpha=1,fade=out:st={max(t0, t1 - 0.3)}:d=0.3:alpha=1[o{i}]"
        fc += f";[{last}][o{i}]overlay=0:0:enable='between(t,{t0},{t1})'[v{i}]"
        last = f"v{i}"
    cmd += ["-filter_complex", fc, "-map", f"[{last}]", "-an", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)]
    run(cmd)


def still_segment(out, png, dur, video=None, box=None):
    """A designed full-frame PNG; if a screen recording exists, it plays inside `box`."""
    if video:
        x0, y0, x1, y1 = box
        fc = (f"[0:v]scale={W}:{H},fps={FPS}[bg];[1:v]scale={x1 - x0}:{y1 - y0}:force_original_aspect_ratio=increase,"
              f"crop={x1 - x0}:{y1 - y0},trim=duration={dur},setpts=PTS-STARTPTS[sr];[bg][sr]overlay={x0}:{y0}[v]")
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur}", "-i", str(png), "-i", str(video),
               "-filter_complex", fc, "-map", "[v]"]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-t", f"{dur}", "-i", str(png), "-vf", f"scale={W}:{H},fps={FPS},fade=in:d=0.25"]
    cmd += ["-an", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), "-t", f"{dur}", str(out)]
    run(cmd)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="mercat_animatic_"))
    segs = []
    s = lambda name: tmp / f"{len(segs):02d}_{name}.mp4"

    # A1 night wide — "Why isn't it selling?"
    src, _ = source("A1")
    p = s("A1"); clip_segment(p, src, 4.0, [(super_card("A1", "Nega sotilmayapti?", "Почему не покупают?"), 1.4, 4.0)]); segs.append(p)
    # A2 phone glows — agency price (needs a source) -> one link
    src, _ = source("A2")
    p = s("A2")
    clip_segment(p, src, 3.0, [
        (super_card("A2a", "Agentlik — $3 000 dan", "Агентство — от $3 000  [нужен источник]", strike=True), 0.0, 1.6),
        (super_card("A2b", "Yoki — bir havola.", "Или — одна ссылка."), 1.6, 3.0)])
    segs.append(p)
    # A3 glass UI: paste the link
    sr = SHOTS / "SR-A3.mp4"
    png, box = glass_card("A3", "SR-A3", "Mercat", "Вставляем ссылку на Telegram-канал → Enter", "bir havola", "core", sr.exists())
    p = s("A3"); still_segment(p, png, 2.0, sr if sr.exists() else None, box); segs.append(p)
    # A4 burst — the studio flies out of the phone
    src, _ = source("A4")
    p = s("A4"); clip_segment(p, src, 5.0, [(super_card("A4", "Butun studiya — telefoningizda.", "Целая студия — в вашем телефоне.", y=560), 3.3, 5.0)]); segs.append(p)
    # A5 studio on
    src, _ = source("A5")
    p = s("A5"); clip_segment(p, src, 4.0, []); segs.append(p)
    # A6 work montage (Lovio-style glass cards, real UI inside)
    beats = [
        ("SR3", "Analitik", "Канал: охваты, лучшие часы, что работает", "tahlil", "analyst"),
        ("SR4", "Strateg", "План на неделю", "reja", "strategist"),
        ("SR5", "Muharrir", "Пост + вычёркиваем нейро-слова", "post", "editor"),
        ("SR6", "Tarjimon", "Lotin · Кирилл · RU · EN", "4 til", "translator"),
        ("SR7", "Videograf", "Фото товара → ролик с субтитрами", "video", "video"),
    ]
    for sr_id, uz, ru, word, orb in beats:
        sr = SHOTS / f"{sr_id}.mp4"
        png, box = glass_card(f"A6-{sr_id}", sr_id, uz, ru, word, orb, sr.exists())
        p = s(f"A6_{sr_id}"); still_segment(p, png, 2.0, sr if sr.exists() else None, box); segs.append(p)
    # A7 everything flies back in
    src, _ = source("A7")
    p = s("A7"); clip_segment(p, src, 4.0, [(super_card("A7", "Hammasi — bitta telefonda.", "Всё — в одном телефоне."), 2.0, 4.0)]); segs.append(p)
    # A8 morning — posts are ready (real Telegram posts are composited on the phone)
    src, _ = source("A8")
    p = s("A8"); clip_segment(p, src, 4.0, [(super_card("A8", "Ertalab — postlar tayyor.", "Утром — посты готовы."), 1.4, 4.0)]); segs.append(p)
    # A9 end card over the constellation loop
    p = s("A9"); clip_segment(p, LOOP, 5.0, [(end_card(), 0.4, 5.0)], dim=0.32); segs.append(p)

    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{x}'\n" for x in segs))
    joined = tmp / "joined.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
    out = OUT / "mercat-ad-animatic.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-loop", "1", "-i", str(badge()),
         "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1[v]", "-map", "[v]", "-c:v", "libx264", "-crf", "23",
         "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)])
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
