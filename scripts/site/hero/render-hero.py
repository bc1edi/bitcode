"""Renders the decorative hero loop of the four Sats from the original transparent PNGs.

Usage: python3 scripts/site/hero/render-hero.py [desktop|mobile|all|stage] [--preview T,T,...]

Each Sat is articulated with smooth 2D warps (joint rotations with a soft falloff),
so no body part is ever invented: limbs bend, antennae sway, bodies lean from the feet.
Every motion has a period dividing LOOP seconds, so the last frame joins the first.
Output: assets/site/hero/sats-team-<variant>.{webm,mp4,webp}, no audio, no text.
`stage` writes assets/site/hero/<id>-stage.webp, the stills of the sticky Sats scene.
"""
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCES = ROOT / "assets" / "sats" / "sources"
OUT = ROOT / "assets" / "site" / "hero"
LOOP = 10.0
FPS = 30
BACKGROUND = np.array([0x0B, 0x0E, 0x11], np.float32) / 255

# Landmarks are pixel coordinates in sources/<id>-original.png (1254 x 1254).
SATS = {
    "node": dict(color=(0x32, 0x97, 0xFF), feet=(577, 1240),
                 antenna=dict(pivot=(468, 300), box=(215, 40, 520, 300), amp=6.0, phase=0.0),
                 arm=dict(pivot=(800, 835), center=(885, 770), radius=95, amp=0.0)),
    "script": dict(color=(0xF7, 0x93, 0x1A), feet=(640, 1220),
                   arm=dict(pivot=(330, 805), center=(255, 690), radius=105, amp=16.0)),
    "hash": dict(color=(0xB6, 0xF5, 0x00), feet=(625, 1195),
                 arm=dict(pivot=(330, 760), center=(225, 655), radius=110, amp=0.0)),
    "merkle": dict(color=(0xC9, 0x6B, 0xFF), feet=(800, 1210),
                   antenna=dict(pivot=(805, 268), box=(740, 50, 990, 268), amp=7.0, phase=0.35),
                   arm=dict(pivot=(430, 805), center=(330, 735), radius=100, amp=16.0)),
}

# Group compositions: centre x and feet y as fractions of the frame, sprite height in px.
LAYOUTS = {
    "desktop": dict(size=(1440, 900), order=["merkle", "node", "script", "hash"], place={
        "merkle": (0.165, 0.80, 440), "script": (0.40, 0.87, 510),
        "hash": (0.635, 0.87, 510), "node": (0.86, 0.80, 440)}),
    "mobile": dict(size=(960, 1040), order=["merkle", "node", "script", "hash"], place={
        "merkle": (0.22, 0.56, 400), "node": (0.78, 0.56, 400),
        "script": (0.31, 0.96, 470), "hash": (0.69, 0.96, 470)}),
}


def window(t, start, end):
    """sin² envelope: 0 outside [start, end], C1-continuous, so the loop never pops."""
    if not start <= t <= end:
        return 0.0
    return math.sin(math.pi * (t - start) / (end - start)) ** 2


def plateau(t, start, end, ramp):
    """Smooth rise, hold, smooth fall; exactly 0 outside [start, end]."""
    rise = min(max((t - start) / ramp, 0), 1)
    fall = min(max((end - t) / ramp, 0), 1)
    return rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall)


def wave(t, cycles, phase=0.0):
    return math.sin(2 * math.pi * (cycles * t / LOOP + phase))


def choreography(t):
    """Per-Sat joint angles (degrees) and light level at time t. Staggered, never in unison."""
    node_lean = plateau(t, 0.4, 3.8, 0.9)
    script_wave = plateau(t, 2.3, 5.7, 0.6)
    hash_sway = plateau(t, 4.4, 8.0, 1.0)
    merkle_wave = plateau(t, 6.5, 9.7, 0.6)
    return {
        "node": dict(lean=3.4 * node_lean + 0.5 * wave(t, 2), arm=0.0,
                     antenna=wave(t, 3) + 0.8 * node_lean * wave(t, 7),
                     light=node_lean),
        "script": dict(lean=-1.0 * script_wave,
                       arm=script_wave * (0.45 + 0.55 * wave(t - 2.3, 9.0, 0.75)),
                       antenna=0.0, light=script_wave),
        "hash": dict(lean=1.2 * wave(t, 2, 0.1) + 2.4 * hash_sway * wave(t, 5), arm=0.0,
                     antenna=0.0, light=hash_sway),
        "merkle": dict(lean=0.6 * wave(t, 1, 0.6) - 1.2 * merkle_wave,
                       arm=merkle_wave * (0.45 + 0.55 * wave(t - 6.5, 9.0, 0.75)),
                       antenna=wave(t, 2, 0.35) + 0.8 * merkle_wave * wave(t, 8),
                       light=merkle_wave),
    }


def smoothstep(edge0, edge1, x):
    k = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return k * k * (3 - 2 * k)


def rotate_about(x, y, px, py, degrees):
    a = np.radians(degrees)
    c, s = np.cos(a), np.sin(a)
    dx, dy = x - px, y - py
    return px + c * dx - s * dy, py + s * dx + c * dy


def bilinear(image, x, y):
    h, w = image.shape[:2]
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    out = np.zeros(x.shape + (image.shape[2],), np.float32)
    for dx, dy, weight in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        inside = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
        out[inside] += image[yi[inside], xi[inside]] * weight[inside]
    return out


class Sat:
    def __init__(self, sat_id, height):
        spec = SATS[sat_id]
        source = Image.open(SOURCES / f"{sat_id}-original.png").convert("RGBA")
        left, top, right, bottom = source.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        scale = height / (bottom - top)
        margin = int(height * 0.12)
        size = (round((right - left) * scale), round((bottom - top) * scale))
        sprite = source.crop((left, top, right, bottom)).resize(size, Image.LANCZOS)
        rgba = np.asarray(sprite, np.float32) / 255
        rgba[..., :3] *= rgba[..., 3:4]
        self.image = np.pad(rgba, ((margin, margin), (margin, margin), (0, 0)))
        to_local = lambda p: ((p[0] - left) * scale + margin, (p[1] - top) * scale + margin)
        self.spec, self.scale = spec, scale
        self.feet = to_local(spec["feet"])
        self.feet = (self.feet[0], min(self.feet[1], self.image.shape[0] - margin))
        self.height = height
        self.joints = {}
        for name in ("antenna", "arm"):
            if name in spec:
                joint = dict(spec[name])
                joint["pivot"] = to_local(joint["pivot"])
                if "box" in joint:
                    x0, y0 = to_local(joint["box"][:2])
                    x1, y1 = to_local(joint["box"][2:])
                    joint["box"] = (x0, y0, x1, y1)
                if "center" in joint:
                    joint["center"] = to_local(joint["center"])
                    joint["radius"] *= scale
                self.joints[name] = joint
        h, w = self.image.shape[:2]
        self.gx, self.gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))

    def pose(self, state, breath):
        """Inverse-maps the output grid through body, then joints, then samples once."""
        x, y = self.gx, self.gy
        fx, fy = self.feet
        # Breathing: a tiny vertical scale anchored on the feet.
        y = fy + (y - fy) / (1 + 0.007 * breath)
        x = fx + (x - fx) / (1 - 0.003 * breath)
        # Lean: rotation about the feet, growing with height so the feet stay planted.
        bend = np.clip((fy - y) / self.height, 0, 1)
        x, y = rotate_about(x, y, fx, fy, -state["lean"] * bend)
        arm = self.joints.get("arm")
        if arm and arm.get("amp"):
            cx, cy = arm["center"]
            reach = np.hypot(x - cx, y - cy)
            weight = 1 - smoothstep(arm["radius"] * 0.55, arm["radius"] * 1.35, reach)
            x, y = rotate_about(x, y, *arm["pivot"], -arm["amp"] * state["arm"] * weight)
        antenna = self.joints.get("antenna")
        if antenna:
            px, py = antenna["pivot"]
            x0, y0, x1, y1 = antenna["box"]
            pad = (x1 - x0) * 0.12
            weight = smoothstep(0, (py - y0) * 0.22, py - y) * smoothstep(x0 - pad, x0 + pad, x) * (1 - smoothstep(x1 - pad, x1 + pad, x))
            x, y = rotate_about(x, y, px, py, -antenna["amp"] * state["antenna"] * weight)
        return bilinear(self.image, x, y)


def radial(size, center, radius):
    w, h = size
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    d2 = ((gx - center[0]) ** 2 + (gy - center[1]) ** 2) / radius ** 2
    return np.exp(-d2 * 2.2)[..., None]


def ellipse_shadow(size, center, rx, ry):
    w, h = size
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    d2 = ((gx - center[0]) / rx) ** 2 + ((gy - center[1]) / ry) ** 2
    return np.exp(-d2 * 2.5)[..., None]


class Scene:
    def __init__(self, variant):
        layout = LAYOUTS[variant]
        self.size = layout["size"]
        w, h = self.size
        self.order = layout["order"]
        self.sats, self.anchor, self.glow, self.shadow = {}, {}, {}, {}
        for sat_id, (fx, fy, height) in layout["place"].items():
            sat = Sat(sat_id, height)
            self.sats[sat_id] = sat
            self.anchor[sat_id] = (round(w * fx - sat.feet[0]), round(h * fy - sat.feet[1]))
            body = (w * fx, h * fy - height * 0.5)
            self.glow[sat_id] = radial(self.size, body, height * 0.95)
            self.shadow[sat_id] = ellipse_shadow(self.size, (w * fx, h * fy), height * 0.36, height * 0.05)
        edge = np.minimum.reduce(np.meshgrid(
            np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * 0.14),
            np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * 0.14)))
        self.edge = smoothstep(0, 1, edge.astype(np.float32))[..., None]

    def frame(self, t):
        w, h = self.size
        states = choreography(t)
        light = np.zeros((h, w, 3), np.float32)
        for index, sat_id in enumerate(self.order):
            color = np.array(SATS[sat_id]["color"], np.float32) / 255
            light += self.glow[sat_id] * color * (0.15 + 0.10 * states[sat_id]["light"] + 0.015 * wave(t, 2, index / 4))
        canvas = BACKGROUND + light * self.edge
        for sat_id in self.order:
            canvas *= 1 - 0.55 * self.shadow[sat_id]
        for index, sat_id in enumerate(self.order):
            sat = self.sats[sat_id]
            sprite = sat.pose(states[sat_id], wave(t, 4, index * 0.23))
            ax, ay = self.anchor[sat_id]
            sh, sw = sprite.shape[:2]
            x0, y0 = max(ax, 0), max(ay, 0)
            x1, y1 = min(ax + sw, w), min(ay + sh, h)
            part = sprite[y0 - ay:y1 - ay, x0 - ax:x1 - ax]
            region = canvas[y0:y1, x0:x1]
            canvas[y0:y1, x0:x1] = part[..., :3] + region * (1 - part[..., 3:4])
        return Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def encode(frames_dir, variant):
    pattern = str(frames_dir / "%04d.png")
    color = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]
    vf = ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"]
    base = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", pattern, "-an"]
    webm = OUT / f"sats-team-{variant}.webm"
    mp4 = OUT / f"sats-team-{variant}.mp4"
    subprocess.run(base + vf + ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "27", "-row-mt", "1",
                                "-deadline", "good", "-cpu-used", "2", "-g", str(FPS * 5)] + color + [str(webm)], check=True)
    subprocess.run(base + vf + ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-profile:v", "high",
                                "-movflags", "+faststart", "-g", str(FPS * 5)] + color + [str(mp4)], check=True)
    Image.open(frames_dir / "0000.png").save(OUT / f"sats-team-{variant}.webp", quality=82, method=6)
    for path in (webm, mp4, OUT / f"sats-team-{variant}.webp"):
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size / 1e6:.2f} MB")


def export_stage_images(height=640):
    OUT.mkdir(parents=True, exist_ok=True)
    for sat_id in SATS:
        source = Image.open(SOURCES / f"{sat_id}-original.png").convert("RGBA")
        sprite = source.crop(source.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
        sprite = sprite.resize((round(sprite.width * height / sprite.height), height), Image.LANCZOS)
        path = OUT / f"{sat_id}-stage.webp"
        sprite.save(path, quality=84, method=6)
        print(f"{path.relative_to(ROOT)}  {sprite.size}  {path.stat().st_size / 1e3:.0f} kB")


def main():
    args = sys.argv[1:]
    if args[:1] == ["stage"]:
        export_stage_images()
        return
    variants = ["desktop", "mobile"] if not args or args[0] == "all" else [args[0]]
    if "--preview" in args:
        times = [float(v) for v in args[args.index("--preview") + 1].split(",")]
        target = Path(args[args.index("--out") + 1]) if "--out" in args else Path(tempfile.gettempdir())
        target.mkdir(parents=True, exist_ok=True)
        for variant in variants:
            scene = Scene(variant)
            for t in times:
                scene.frame(t).save(target / f"{variant}-{t:05.2f}.png")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for variant in variants:
        scene = Scene(variant)
        frames_dir = Path(tempfile.mkdtemp(prefix=f"hero-{variant}-"))
        try:
            for i in range(int(LOOP * FPS)):
                scene.frame(i / FPS).save(frames_dir / f"{i:04d}.png", compress_level=1)
            encode(frames_dir, variant)
        finally:
            shutil.rmtree(frames_dir)


if __name__ == "__main__":
    main()
