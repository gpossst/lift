"""Cut a mascot render out of its flat backdrop and export it for the site.

usage: python3 -I cutout.py <in.png> <out.webp> [max_px] [hole=x,y ...]

The backdrop is a bright, neutral grey-white; the mascot's cream body is warmer (red above blue),
so neutral-and-bright pixels are backdrop candidates. Candidate regions touching the border become
transparent. Enclosed gaps (between arms and a bar) look identical to white props like a phone
screen, so they are only removed when named with hole=x,y.
"""
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src_path, out_path = sys.argv[1], sys.argv[2]
max_px = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 880
holes = [tuple(map(int, arg[5:].split(','))) for arg in sys.argv[3:] if arg.startswith('hole=')]

src = Image.open(src_path).convert('RGB')
a = np.asarray(src).astype(int)
r, b = a[..., 0], a[..., 2]
cand = (a.mean(axis=2) > 205) & (r - b < 10)  # loose bounds also catch the faint grey contact shadow
labels, _ = ndimage.label(cand)
edges = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
keep = set(edges) | {labels[y, x] for x, y in holes}
bg = np.isin(labels, list(keep - {0}))

alpha = Image.fromarray(np.where(bg, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1))
out = src.copy()
out.putalpha(alpha)
out = out.crop(out.getbbox())
scale = max_px / max(out.size)
out = out.resize((round(out.size[0] * scale), round(out.size[1] * scale)), Image.LANCZOS)
out.save(out_path, 'WEBP', quality=88)
print(out_path, out.size)
