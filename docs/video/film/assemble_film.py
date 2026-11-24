"""
«Слишком хороший» — черновой монтаж из выбранных дублей Higgsfield.

Берёт аниматик (animatic/build_animatic.py: тайминг, титры, временный звук) и подменяет в нём:
  - 3D-черновики сгенерированных кадров на выбранные видео Seedance 2.5 (footage/gen/selected.json);
  - пиалу 4.6 (в аниматике карточка) на сгенерированное видео;
  - черновой голос Windows TTS на голоса Higgsfield: PromptX, агентства, гость в теге, черновой голос героя.
Живые кадры, которых ещё нет в footage/live, остаются подписанными карточками.

Запуск: двойной щелчок по run_roughcut.cmd (или py -3 docs/video/film/assemble_film.py).
Пишет: mercat-film-roughcut.mp4, roughcut.srt, roughcut-log.txt рядом с этим файлом.
"""

import glob
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "footage", "gen")
SEL_PATH = os.path.join(GEN, "selected.json")
OUT_MP4 = os.path.join(HERE, "mercat-film-roughcut.mp4")
OUT_SRT = os.path.join(HERE, "roughcut.srt")
OUT_TIMING = os.path.join(HERE, "roughcut-timing.md")
LOG = os.path.join(HERE, "roughcut-log.txt")
GRADE = "eq=saturation=0.92:contrast=1.02,noise=alls=5:allf=t+u"  # GEN: чуть меньше цвета, то же зерно


def log(*a):
    line = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def find_ffmpeg():
    hit = shutil.which("ffmpeg")
    if hit:
        return hit
    home = os.path.expanduser("~")
    pats = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages", "*", "**", "ffmpeg.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
        r"C:\ffmpeg\**\ffmpeg.exe", r"C:\Program Files\ffmpeg\**\ffmpeg.exe", r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        os.path.join(home, "scoop", "shims", "ffmpeg.exe"), os.path.join(home, "Shutter Encoder", "**", "ffmpeg.exe"),
        r"C:\Program Files\Shutter Encoder\**\ffmpeg.exe", r"C:\Program Files\*\**\ffmpeg.exe", r"D:\**\ffmpeg.exe",
    ]
    for p in pats:
        for f in glob.glob(p, recursive=True):
            if os.path.isfile(f):
                return f
    return None


CURL = shutil.which("curl.exe") or shutil.which("curl")


def fetch(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 100:
        return dst
    log("скачиваю", os.path.basename(dst))
    for attempt in range(3):
        if CURL:  # curl.exe from Windows itself: no system proxy surprises, hard timeouts
            r = subprocess.run([CURL, "-sSfL", "--connect-timeout", "20", "--max-time", "300", "--retry", "2", "-o", dst + ".part", url],
                               capture_output=True, text=True)
            if r.returncode == 0 and os.path.exists(dst + ".part"):
                os.replace(dst + ".part", dst)
                return dst
            log("curl", r.returncode, r.stderr.strip()[:200])
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # no system proxy
            with opener.open(req, timeout=60) as r, open(dst + ".part", "wb") as fh:
                shutil.copyfileobj(r, fh)
            os.replace(dst + ".part", dst)
            return dst
        except Exception as e:  # noqa: BLE001
            log("retry", os.path.basename(dst), e)
            time.sleep(3 + attempt * 3)
    raise RuntimeError("download failed: " + url)


def main():
    open(LOG, "w").close()
    os.makedirs(GEN, exist_ok=True)
    url_file = os.path.join(GEN, "selected-url.txt")
    if os.path.exists(url_file):  # the chat puts the list of selected takes on Higgsfield and leaves its link here
        url = open(url_file, encoding="utf-8").read().strip()
        if os.path.exists(SEL_PATH):
            os.remove(SEL_PATH)
        fetch(url, SEL_PATH)
        log("список дублей:", url)
    sel = json.load(open(SEL_PATH, encoding="utf-8"))
    ff = find_ffmpeg()
    log("python", sys.version.split()[0], "ffmpeg", ff)
    if not ff:
        log("ОШИБКА: ffmpeg не найден")
        return 1
    os.makedirs(os.path.join(GEN, "video"), exist_ok=True)
    os.makedirs(os.path.join(GEN, "audio"), exist_ok=True)
    os.makedirs(os.path.join(GEN, "stills"), exist_ok=True)

    clips = {}
    for key, url in sel.get("shots", {}).items():  # "V3.3": url
        sid = key[1:] if key.startswith("V") else key
        clips[sid] = fetch(url, os.path.join(GEN, "video", f"{key}_{os.path.basename(url.split('?')[0])}"))
    voices = {}
    for key, url in sel.get("voice", {}).items():  # tts key of the animatic: "L8", "S6_6_2", "TAG_G"
        voices[key] = fetch(url, os.path.join(GEN, "audio", f"{key}_{os.path.basename(url.split('?')[0])}"))
    for key, url in sel.get("audio", {}).items():  # all voice takes, for the edit
        fetch(url, os.path.join(GEN, "audio", f"{key}_{os.path.basename(url.split('?')[0])}"))
    for key, url in sel.get("stills", {}).items():
        fetch(url, os.path.join(GEN, "stills", f"{key}_{os.path.basename(url.split('?')[0])}"))
    log("скачано: видео", len(clips), "голоса", len(voices))
    if sel.get("download_only"):
        return 0

    # ---- the animatic builder, patched
    path = os.path.join(HERE, "animatic", "build_animatic.py")
    src = open(path, encoding="utf-8").read()
    patches = [
        ('if __name__ == "__main__":\n    main()', ""),
        ('src = os.path.join(CLAY, f"{s[\'clay\']}_clay.mp4")', 'src = GENCLIPS.get(sid) or os.path.join(CLAY, f"{s[\'clay\']}_clay.mp4")'),
        ('vf = f"setpts=PTS/{SPEED.get(sid, 1.0)},fps={FPS},scale={W}:{H},setsar=1,tpad=stop_mode=clone:stop_duration=3,{corner}"',
         'vf = f"setpts=PTS/{SPEED.get(sid, 1.0)},fps={FPS},scale={W}:{H}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=3," + (GRADE if sid in GENCLIPS else corner)'),
        ("    tts_all(items)\n", "    tts_all(items)\n    VOICE_OVERRIDES()\n"),
        ('out_mp4 = os.path.join(HERE, "mercat-film-animatic.mp4")', "out_mp4 = OUT_MP4"),
        ('os.path.join(HERE, "animatic.srt")', "OUT_SRT"),
        ('os.path.join(HERE, "timing-report.md")', "OUT_TIMING"),
        ("АНИМАТИК · черновой голос и временный звук", "ЧЕРНОВОЙ МОНТАЖ · временный звук, черновой голос героя"),
        ('"gen": "GEN · 3D-черновик"', '"gen": "GEN · 3D-черновик (дубля нет)"'),
    ]
    for old, new in patches:
        if old not in src:
            log("ОШИБКА: не нашёл в build_animatic.py:", old[:80])
            return 1
        src = src.replace(old, new)
    work = os.path.join(os.environ.get("TEMP", HERE), "mercat_roughcut")
    sys.argv = [path, "--ffmpeg", ff, "--work", work]
    ns = {"__file__": path, "__name__": "mercat_animatic"}
    exec(compile(src, path, "exec"), ns)

    def voice_overrides():
        for key, f in voices.items():
            subprocess.run([ff, "-y", "-loglevel", "error", "-i", f, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le",
                            os.path.join(ns["WORK"], f"tts_{key}.wav")], check=True)
        log("голоса Higgsfield подставлены:", len(voices))

    if "4.6" in clips:  # пиала: карточка -> видео
        ns["SHOTS"] = [(sid, "gen", dur, "PIALA", 0.6, "") if sid == "4.6" else (sid, kind, dur, clay, cin, label)
                       for sid, kind, dur, clay, cin, label in ns["SHOTS"]]
    ns.update(GENCLIPS=clips, GRADE=GRADE, VOICE_OVERRIDES=voice_overrides, OUT_MP4=OUT_MP4, OUT_SRT=OUT_SRT, OUT_TIMING=OUT_TIMING)
    log("сборка…")
    ns["main"]()
    log("готово:", OUT_MP4, os.path.getsize(OUT_MP4) // 1024 // 1024, "МБ")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception as e:  # noqa: BLE001
        import traceback
        log("ОШИБКА:", e)
        log(traceback.format_exc())
        code = 1
    sys.exit(code)
