"""Regenera los iconos PNG de la PWA. Requiere Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

directory = Path(__file__).resolve().parent.parent / 'public' / 'icons'
directory.mkdir(parents=True, exist_ok=True)
scale = 3
image = Image.new('RGB', (512 * scale, 512 * scale), '#ee562f')
draw = ImageDraw.Draw(image)

def line(points, width=24):
    draw.line([(x * scale, y * scale) for x, y in points], fill='white', width=width * scale, joint='curve')

line([(119, 304), (119, 242), (164, 179), (319, 179), (368, 242), (393, 260), (393, 304), (119, 304)])
line([(153, 242), (345, 242)])
line([(253, 179), (253, 242)])
for x in (173, 336):
    draw.ellipse(((x - 29) * scale, 279 * scale, (x + 29) * scale, 337 * scale), fill='#ee562f', outline='white', width=24 * scale)

for filename, size in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    image.resize((size, size), Image.Resampling.LANCZOS).save(directory / filename)
