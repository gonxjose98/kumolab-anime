"""Crop art for Cloud Bank slides.

  python scripts/carousel/crop.py hero  <src> <out.jpg> <x0> <y0> <width>
      Content-slide hero: crops a 1080:820 box starting at (x0,y0) with the given
      source width, resized to 1080x820. Keep faces in frame; stay ABOVE any
      subtitle line and clear of watermarks / printed titles.

  python scripts/carousel/crop.py poster <src> <out.jpg> [maxY]
      Cover/share strip poster: optionally cut the bottom at maxY (to drop a
      printed title), upscale to >=1200px wide if small (Lanczos + light
      unsharp), cap at 1600px. Faces are framed later by the strip's per-panel
      x-position in build.js.

  python scripts/carousel/crop.py grid <src> <out.jpg>
      Writes a copy with a labelled 200px grid, for choosing crop numbers.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

A = 1080 / 820


def hero(src, out, x0, y0, w):
    im = Image.open(src).convert('RGB'); x0, y0, w = int(x0), int(y0), int(w); h = int(w / A)
    assert x0 + w <= im.width and y0 + h <= im.height, f'crop {x0},{y0},{w}x{h} exceeds {im.size}'
    im.crop((x0, y0, x0 + w, y0 + h)).resize((1080, 820), Image.LANCZOS).save(out, quality=95)


def poster(src, out, max_y=None):
    im = Image.open(src).convert('RGB')
    if max_y: im = im.crop((0, 0, im.width, int(max_y)))
    if im.width < 1200:
        im = im.resize((1200, int(im.height * 1200 / im.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.8, percent=70, threshold=2))
    elif im.width > 1600:
        im = im.resize((1600, int(im.height * 1600 / im.width)), Image.LANCZOS)
    im.save(out, quality=94)


def grid(src, out):
    im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im)
    for x in range(0, im.width, 200): d.line([(x, 0), (x, im.height)], fill='red', width=2); d.text((x + 3, 3), str(x), fill='red')
    for y in range(0, im.height, 200): d.line([(0, y), (im.width, y)], fill='red', width=2); d.text((3, y + 3), str(y), fill='red')
    im.thumbnail((1400, 1400)); im.save(out, quality=85)


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'hero': hero(*sys.argv[2:7])
    elif c == 'poster': poster(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif c == 'grid': grid(sys.argv[2], sys.argv[3])
    else: print(__doc__)
