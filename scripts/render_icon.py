"""Render the Aguacate app icon (same geometry + lighting as icon-master.svg)
with a true alpha channel, then produce icon.icns inputs, icon.ico, icon.png.

Design: flat warm off-white #F7F5F0 squircle (25% radius), baked bottom
shadow, avocado lit from the upper-left — diagonal skin gradient, radial
flesh shading, walnut pit with specular highlight and ambient occlusion.
The avocado silhouette is canonical: do not alter the path geometry.

Run with the backend venv python (needs Pillow + numpy).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "electron" / "assets"
S = 2  # supersample factor → 2048 canvas
SIZE = 1024 * S


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def cubic(p0, p1, p2, p3, n=40):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
            + 3 * (1 - t) * t**2 * p2 + t**3 * p3)


# SVG control points (from icon-master.svg) — [start, c1, c2, end] per segment
RIM_SEGS = [
    [(512, 198), (580, 198), (612, 266), (638, 348)],
    [(638, 348), (666, 436), (718, 492), (718, 590)],
    [(718, 590), (718, 716), (626, 808), (512, 808)],
    [(512, 808), (398, 808), (306, 716), (306, 590)],
    [(306, 590), (306, 492), (358, 436), (386, 348)],
    [(386, 348), (412, 266), (444, 198), (512, 198)],
]
FLESH_SEGS = [
    [(512, 240), (568, 240), (594, 300), (618, 372)],
    [(618, 372), (642, 450), (686, 502), (686, 588)],
    [(686, 588), (686, 696), (608, 774), (512, 774)],
    [(512, 774), (416, 774), (338, 696), (338, 588)],
    [(338, 588), (338, 502), (382, 450), (406, 372)],
    [(406, 372), (430, 300), (456, 240), (512, 240)],
]


def segs_to_poly(segs):
    pts = []
    for p0, p1, p2, p3 in segs:
        pts.append(cubic(np.array(p0, float), np.array(p1, float),
                         np.array(p2, float), np.array(p3, float)))
    return [tuple(p * S) for p in np.vstack(pts)]


def mask_from(draw_fn):
    m = Image.new("L", (SIZE, SIZE), 0)
    draw_fn(ImageDraw.Draw(m))
    return np.array(m, dtype=np.float32) / 255.0


def blur(mask, radius):
    img = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), "L")
    return np.array(img.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255.0


def shift(mask, dx, dy):
    """Shift a mask by (dx, dy) pixels, zero-filling the edges."""
    out = np.zeros_like(mask)
    h, w = mask.shape
    sy0, sy1 = max(0, dy), min(h, h + dy)
    sx0, sx1 = max(0, dx), min(w, w + dx)
    out[sy0:sy1, sx0:sx1] = mask[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def comp(canvas, rgb, alpha):
    """Composite a flat color (or HxWx3 image) over canvas with alpha (HxW)."""
    if np.ndim(rgb) == 1 or isinstance(rgb, tuple):
        rgb = np.asarray(rgb, np.float32)[None, None]
    canvas[..., :3] = canvas[..., :3] * (1 - alpha[..., None]) + rgb * alpha[..., None]


def main():
    canvas = np.zeros((SIZE, SIZE, 4), dtype=np.float32)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)

    # --- container drop shadow: dy=16, blur 24, #1A3020 @ 25% (visible
    #     elevation in the dock; spec dy=4/stdDev=8 scaled 4x to 1024) ---
    sh = mask_from(lambda d: d.rounded_rectangle(
        (32 * S, 44 * S, 992 * S, 1004 * S), radius=240 * S, fill=255))
    sh = blur(sh, 24 * S) * 0.25
    canvas[..., :3] = np.asarray(hex_rgb("#1A3020"), np.float32)[None, None]
    canvas[..., 3] = sh * 255.0

    # --- container: flat warm off-white squircle (25% corner radius) ---
    sq = mask_from(lambda d: d.rounded_rectangle(
        (32 * S, 28 * S, 992 * S, 988 * S), radius=240 * S, fill=255))
    comp(canvas, hex_rgb("#F7F5F0"), sq)
    canvas[..., 3] = np.maximum(canvas[..., 3], sq * 255.0)

    # --- subtle top-surface light: soft white glow at the top center ---
    glow = mask_from(lambda d: d.ellipse(
        (512 * S - 320 * S, 40 * S - 80 * S, 512 * S + 320 * S, 40 * S + 80 * S), fill=255))
    comp(canvas, hex_rgb("#FFFFFF"), blur(glow, 20 * S) * sq * 0.15)

    # --- avocado skin: diagonal gradient, light from the upper-left ---
    rim_poly = segs_to_poly(RIM_SEGS)
    rmask = mask_from(lambda d: d.polygon(rim_poly, fill=255))
    x0, y0, x1, y1 = 306 * S, 198 * S, 718 * S, 808 * S
    t = np.clip(((xx - x0) + (yy - y0)) / ((x1 - x0) + (y1 - y0)), 0, 1)
    light = np.asarray(hex_rgb("#85B260"), np.float32)
    dark = np.asarray(hex_rgb("#5A8240"), np.float32)
    skin = light[None, None] * (1 - t[..., None]) + dark[None, None] * t[..., None]
    comp(canvas, skin, rmask)

    # --- delicate highlight along the upper-left skin edge ---
    edge = np.clip(rmask - shift(rmask, 5 * S, 5 * S), 0, 1)
    edge = blur(edge, 3 * S) * rmask * (1 - t) * 0.45
    comp(canvas, hex_rgb("#FFFFFF"), edge)

    # --- flesh: creamy light green, radial shading (lighter center) ---
    flesh_poly = segs_to_poly(FLESH_SEGS)
    fmask = mask_from(lambda d: d.polygon(flesh_poly, fill=255))
    fc_x, fc_y, fr = 512 * S, 510 * S, 300 * S
    ft = np.clip(np.sqrt((xx - fc_x) ** 2 + (yy - fc_y) ** 2) / fr, 0, 1)
    stops_p = [0.0, 0.68, 1.0]
    stops_c = np.array([hex_rgb("#DEEDBE"), hex_rgb("#D4E8B0"), hex_rgb("#CBDFA2")], np.float32)
    flesh = np.stack([np.interp(ft, stops_p, stops_c[:, ch]) for ch in range(3)], axis=-1)
    comp(canvas, flesh, fmask)

    # --- gentle emboss: soft inner shadow where flesh meets skin ---
    inner = fmask * blur(1 - fmask, 12 * S) * 0.55
    comp(canvas, hex_rgb("#69904A"), inner)

    # --- pit ambient occlusion (clipped to flesh) ---
    cx, cy, pr = 512 * S, 592 * S, 118 * S
    ao = mask_from(lambda d: d.ellipse(
        (cx - 130 * S, cy + 10 * S - 127 * S, cx + 130 * S, cy + 10 * S + 127 * S), fill=255))
    ao = blur(ao, 22 * S) * fmask * 0.32
    comp(canvas, hex_rgb("#4A6B33"), ao)

    # --- pit: walnut sphere lit from the upper-left ---
    pmask = mask_from(lambda d: d.ellipse((cx - pr, cy - pr, cx + pr, cy + pr), fill=255))
    dist = np.sqrt((xx - (cx - 0.28 * pr)) ** 2 + (yy - (cy - 0.36 * pr)) ** 2) / (1.9 * pr)
    dist = np.clip(dist, 0, 1)
    pit_p = [0.0, 0.55, 1.0]
    pit_c = np.array([hex_rgb("#8A5526"), hex_rgb("#5C2E0E"), hex_rgb("#411F0A")], np.float32)
    pit = np.stack([np.interp(dist, pit_p, pit_c[:, ch]) for ch in range(3)], axis=-1)
    comp(canvas, pit, pmask)

    # --- pit specular highlight (soft halo + tighter core) ---
    halo = mask_from(lambda d: d.ellipse(
        (474 * S - 36 * S, 550 * S - 27 * S, 474 * S + 36 * S, 550 * S + 27 * S), fill=255))
    comp(canvas, hex_rgb("#F2D7B8"), blur(halo, 6 * S) * pmask * 0.40)
    core = mask_from(lambda d: d.ellipse(
        (466 * S - 15 * S, 542 * S - 11 * S, 466 * S + 15 * S, 542 * S + 11 * S), fill=255))
    comp(canvas, hex_rgb("#FFF1DE"), blur(core, 4 * S) * pmask * 0.55)

    # --- faint reflected light along the pit's lower edge ---
    refl = mask_from(lambda d: d.ellipse(
        (524 * S - 72 * S, 692 * S - 22 * S, 524 * S + 72 * S, 692 * S + 22 * S), fill=255))
    comp(canvas, hex_rgb("#8A5526"), blur(refl, 14 * S) * pmask * 0.30)

    img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGBA")
    img = img.resize((1024, 1024), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "icon-1024.png")

    # Linux 512
    img.resize((512, 512), Image.LANCZOS).save(OUT / "icon.png")

    # Windows .ico with embedded sizes
    img.save(OUT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])

    print("rendered:", OUT / "icon-1024.png")


if __name__ == "__main__":
    main()
