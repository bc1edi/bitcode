"""Renders Sats wallpapers (desktop) and social graphics from assets/sats.

Usage: python3 build.py <inter.ttf> <jetbrains-mono.ttf>
The fonts are the variable TTFs converted from assets/site/*.woff2.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SATS = HERE.parent / "sats"
INTER, MONO = sys.argv[1], sys.argv[2]

ORANGE = (247, 147, 26)
THEMES = {
    "light": dict(bg=(247, 247, 244), ink=(38, 37, 30), muted=(110, 108, 100), dot=(38, 37, 30, 22), glow=0.38, shadow=70),
    "dark": dict(bg=(15, 15, 15), ink=(247, 247, 244), muted=(150, 148, 140), dot=(247, 247, 244, 18), glow=0.55, shadow=140),
}
SATS_META = {
    "node": ("Node", "Infrastruttura Bitcoin", (50, 151, 255)),
    "script": ("Script", "Implementazione", (247, 147, 26)),
    "hash": ("Hash", "Analisi di sicurezza", (182, 245, 0)),
    "merkle": ("Merkle", "Orchestrazione", (200, 107, 255)),
}
TEAM_POSES = {"node": "idle", "script": "working", "hash": "happy", "merkle": "ask"}


def font(path, size, weight):
    f = ImageFont.truetype(path, size)
    f.set_variation_by_axes([weight])
    return f


def load_sat(sat, pose, hires=False):
    path = SATS / sat / "masters" / f"{pose}-1024.png"
    if hires and pose == "idle":
        path = SATS / "sources" / f"{sat}-original.png"
    im = Image.open(path).convert("RGBA")
    return im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())


def paste_sat(canvas, sat_im, cx, feet_y, height, color, theme):
    t = THEMES[theme]
    ratio = height / sat_im.height
    sprite = sat_im.resize((round(sat_im.width * ratio), height), Image.LANCZOS)
    glow_r = int(height * 0.62)
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - glow_r, feet_y - height * 0.55 - glow_r, cx + glow_r, feet_y - height * 0.55 + glow_r), fill=color + (int(255 * t["glow"]),))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(height * 0.28)))
    sh_w, sh_h = int(sprite.width * 0.75), int(height * 0.07)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((cx - sh_w // 2, feet_y - sh_h // 2, cx + sh_w // 2, feet_y + sh_h // 2), fill=(0, 0, 0, t["shadow"]))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(sh_h * 0.45)))
    canvas.alpha_composite(sprite, (cx - sprite.width // 2, feet_y - sprite.height + int(height * 0.015)))


def base(w, h, theme):
    t = THEMES[theme]
    canvas = Image.new("RGBA", (w, h), t["bg"] + (255,))
    step = max(24, w // 60)
    dots = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(dots)
    r = max(1, step // 22)
    for x in range(step // 2, w, step):
        for y in range(step // 2, h, step):
            d.rectangle((x - r, y - r, x + r, y + r), fill=t["dot"])
    canvas.alpha_composite(dots)
    return canvas


def mark(canvas, x, y, unit, theme):
    d = ImageDraw.Draw(canvas)
    ink = (15, 15, 15) if theme == "light" else (247, 247, 244)
    for cx, cy, cw, ch in [(0, 0, 1, 4), (1, 0, 2, 1), (2, 1, 1, 1), (1, 2, 1, 1), (3, 2, 1, 2)]:
        d.rectangle((x + cx * unit, y + cy * unit, x + (cx + cw) * unit - 1, y + (cy + ch) * unit - 1), fill=ORANGE)
    d.rectangle((x, y + 4 * unit, x + 2 * unit - 1, y + 5 * unit - 1), fill=ink)


def wordmark(canvas, x, y, height, theme):
    """Logo mark plus 'bitcode'; (x, y) is the top-left, returns the right edge."""
    unit = height // 5
    mark(canvas, x, y, unit, theme)
    f = font(INTER, int(height * 0.95), 700)
    d = ImageDraw.Draw(canvas)
    tx = x + 4 * unit + unit
    d.text((tx, y + height * 0.5), "bitcode", font=f, fill=THEMES[theme]["ink"], anchor="lm")
    return tx + d.textlength("bitcode", font=f)


def team_row(canvas, w, feet_y, sat_h, theme, span=0.86):
    order = ["node", "script", "hash", "merkle"]
    xs = [int(w * (0.5 + (i - 1.5) * span / 4)) for i in range(4)]
    for sat, cx in zip(order, xs):
        paste_sat(canvas, load_sat(sat, TEAM_POSES[sat]), cx, feet_y, sat_h, SATS_META[sat][2], theme)
    return xs


def caption(canvas, w, y, size, theme, tagline="Your code. Your Bitcoin. Your agents."):
    t = THEMES[theme]
    d = ImageDraw.Draw(canvas)
    d.text((w / 2, y), tagline, font=font(INTER, size, 500), fill=t["muted"], anchor="mm")


def save(canvas, folder, name):
    out = HERE / folder
    out.mkdir(exist_ok=True)
    canvas.convert("RGB").save(out / name, optimize=True)
    print(folder + "/" + name, canvas.size)


def team_landscape(w, h, theme, name, folder):
    c = base(w, h, theme)
    u = h / 2160
    team_row(c, w, int(h * 0.80), int(h * 0.44), theme, span=0.90)
    mark_h = int(150 * u)
    wm = Image.new("RGBA", (int(2000 * u), mark_h), (0, 0, 0, 0))
    right = wordmark(wm, 0, 0, mark_h, theme)
    wm = wm.crop((0, 0, int(right) + 1, mark_h))
    c.alpha_composite(wm, ((w - wm.width) // 2, int(h * 0.11)))
    caption(c, w, int(h * 0.90), int(54 * u), theme)
    save(c, folder, name)


def solo_landscape(sat, theme, w=3840, h=2160):
    label, role, color = SATS_META[sat]
    c = base(w, h, theme)
    u = h / 2160
    t = THEMES[theme]
    paste_sat(c, load_sat(sat, "idle", hires=True), int(w * 0.70), int(h * 0.90), int(h * 0.68), color, theme)
    d = ImageDraw.Draw(c)
    x = int(w * 0.12)
    d.text((x, int(h * 0.40)), label, font=font(INTER, int(300 * u), 800), fill=t["ink"], anchor="ls")
    d.rectangle((x, int(h * 0.43), x + int(160 * u), int(h * 0.43) + int(14 * u)), fill=color)
    d.text((x, int(h * 0.52)), role, font=font(MONO, int(64 * u), 500), fill=t["muted"], anchor="ls")
    wordmark(c, x, int(h * 0.80), int(110 * u), theme)
    save(c, "desktop", f"sat-{sat}-{theme}-{w}x{h}.png")


def solo_portrait(sat, theme, w, h, name):
    label, role, color = SATS_META[sat]
    c = base(w, h, theme)
    u = w / 1080
    t = THEMES[theme]
    feet = int(h * 0.80)
    paste_sat(c, load_sat(sat, "idle", hires=True), w // 2, feet, int(h * 0.50), color, theme)
    d = ImageDraw.Draw(c)
    d.text((w / 2, int(h * 0.16)), label, font=font(INTER, int(150 * u), 800), fill=t["ink"], anchor="mm")
    d.text((w / 2, int(h * 0.16 + 110 * u)), role, font=font(MONO, int(36 * u), 500), fill=t["muted"], anchor="mm")
    wm = Image.new("RGBA", (int(900 * u), int(60 * u)), (0, 0, 0, 0))
    right = wordmark(wm, 0, 0, int(60 * u), theme)
    wm = wm.crop((0, 0, int(right) + 1, wm.height))
    c.alpha_composite(wm, ((w - wm.width) // 2, h - int(110 * u) - wm.height // 2))
    save(c, "social", name)


def team_portrait(w, h, theme, name):
    c = base(w, h, theme)
    u = w / 1080
    sat_h = int(330 * u)
    rows = [(["node", "script"], 0.50), (["hash", "merkle"], 0.80)]
    for sats, feet in rows:
        for i, sat in enumerate(sats):
            paste_sat(c, load_sat(sat, TEAM_POSES[sat]), int(w * (0.30 + 0.40 * i)), int(h * feet), sat_h, SATS_META[sat][2], theme)
    wm = Image.new("RGBA", (int(900 * u), int(90 * u)), (0, 0, 0, 0))
    right = wordmark(wm, 0, 0, int(90 * u), theme)
    wm = wm.crop((0, 0, int(right) + 1, wm.height))
    c.alpha_composite(wm, ((w - wm.width) // 2, int(h * 0.09)))
    caption(c, w, int(h * 0.93), int(36 * u), theme)
    save(c, "social", name)


def banner(theme, w=1500, h=500):
    c = base(w, h, theme)
    t = THEMES[theme]
    team_row(c, w, int(h * 0.90), int(h * 0.62), theme, span=0.60)
    wm = Image.new("RGBA", (700, 90), (0, 0, 0, 0))
    right = wordmark(wm, 0, 0, 70, theme)
    c.alpha_composite(wm.crop((0, 0, int(right) + 1, 90)), (60, 60))
    ImageDraw.Draw(c).text((60, 170), "Your code.\nYour Bitcoin.\nYour agents.", font=font(INTER, 30, 600), fill=t["muted"], spacing=6)
    save(c, "social", f"x-header-{theme}-1500x500.png")


for theme in THEMES:
    team_landscape(3840, 2160, theme, f"sats-team-{theme}-3840x2160.png", "desktop")
    team_landscape(3440, 1440, theme, f"sats-team-{theme}-3440x1440.png", "desktop")
    team_portrait(1080, 1350, theme, f"team-{theme}-1080x1350.png")
    team_portrait(1080, 1920, theme, f"story-{theme}-1080x1920.png")
    banner(theme)
for sat in SATS_META:
    solo_landscape(sat, "dark")
    solo_portrait(sat, "dark", 1080, 1080, f"sat-{sat}-dark-1080x1080.png")
