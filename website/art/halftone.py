"""Amplitude-modulated halftone: dot area tracks darkness. Yellow areas keep the accent colour.

usage: python3 -I halftone.py <in.png> <out.png> [cell_px] [face=cx,cy,rx,ry] [dark]
face: oval whose features dissolve into a loose random scatter of dots.
dark: light dots on the dark-mode background (same dot sizes, so it reads as a chalk negative).
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PAPER, INK, ACCENT = (249, 249, 247), (17, 18, 15), (255, 204, 74)
SCALE = 3  # draw supersampled, then downsample for smooth dot edges

src_path, out_path = sys.argv[1], sys.argv[2]
cell = float(sys.argv[3]) if len(sys.argv) > 3 else 6
face = next((tuple(map(float, a[5:].split(','))) for a in sys.argv[4:] if a.startswith('face=')), None)
rng = np.random.default_rng(7)
if 'dark' in sys.argv[4:]:
    PAPER, INK = (21, 22, 18), (247, 248, 242)

src = Image.open(src_path).convert('RGB')
w, h = src.size
blur = np.asarray(src.filter(ImageFilter.GaussianBlur(cell / 4)), dtype=np.float32) / 255
r, g, b = blur[..., 0], blur[..., 1], blur[..., 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
# Yellow: strong red+green, weak blue.
yellow = (r - b > 0.35) & (g - b > 0.2)

# Face mask: 1 inside the oval, smooth fade to 0 by 1.3x its radius.
mask = np.zeros((h, w), np.float32)
if face:
    fx, fy, frx, fry = face
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt(((xx - fx) / frx) ** 2 + ((yy - fy) / fry) ** 2)
    t = np.clip((1.3 - dist) / 0.3, 0, 1)
    mask = t * t * (3 - 2 * t)
    # Heavy blur erases eyes/nose/mouth; only the head's rough light and shadow survive.
    soft = np.asarray(src.convert('L').filter(ImageFilter.GaussianBlur(14)), dtype=np.float32) / 255
    lum = lum * (1 - mask) + soft * mask

dark = np.clip((1 - lum - 0.03) / 0.9, 0, 1) ** 1.4 * 0.78  # gamma spreads mid-tones; cap keeps paper between the darkest dots

out = Image.new('RGB', (w * SCALE, h * SCALE), PAPER)
draw = ImageDraw.Draw(out)
angle = math.radians(45)
ca, sa = math.cos(angle), math.sin(angle)
rmax = cell * 0.62  # darkest dots nearly touch
span = int((w + h) / cell) + 2
for i in range(-span, span):
    for j in range(-span, span):
        x = (i * ca - j * sa) * cell + w / 2
        y = (i * sa + j * ca) * cell + h / 2
        if not (0 <= x < w and 0 <= y < h):
            continue
        m = mask[int(y), int(x)]
        if m:  # scatter: jitter off the grid and thin out
            x, y = x + rng.uniform(-.6, .6) * cell * m, y + rng.uniform(-.6, .6) * cell * m
            if not (0 <= x < w and 0 <= y < h) or rng.random() < .3 * m:
                continue
        yi, xi = int(y), int(x)
        is_yellow = yellow[yi, xi]
        # Yellow plates: dot size from the plate's own shading, min size keeps them reading as yellow.
        d = max(0.35, 1 - lum[yi, xi] * 0.6) if is_yellow else dark[yi, xi]
        if d < 0.02:
            continue
        rad = rmax * math.sqrt(d) * SCALE  # area ∝ darkness
        cx, cy = x * SCALE, y * SCALE
        draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=ACCENT if is_yellow else INK)

out.resize((w, h), Image.LANCZOS).save(out_path)
print(out_path)
