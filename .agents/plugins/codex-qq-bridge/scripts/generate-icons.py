"""Regenerate the original Bridge PNG/Windows ICO assets. Requires Pillow for authoring only."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SCALE = 4
image = Image.new('RGBA', (256 * SCALE, 256 * SCALE))
draw = ImageDraw.Draw(image)
box = lambda values: tuple(int(v * SCALE) for v in values)
draw.rounded_rectangle(box((4, 4, 252, 252)), radius=56 * SCALE, fill='#285bd4')
def line(points):
    draw.line([box(point) for point in points], fill='white', width=14 * SCALE, joint='curve')
    for x, y in points:
        draw.ellipse(box((x-7,y-7,x+7,y+7)), fill='white')
line([(54,66),(162,66),(162,143),(96,143),(70,167),(70,143),(54,143),(54,66)])
line([(187,105),(202,105),(202,184),(186,184),(186,206),(159,184),(123,184),(123,164)])
line([(83,103),(134,103)])
image = image.resize((256,256), Image.Resampling.LANCZOS)
image.save(ROOT/'icons/bridge.png')
image.save(ROOT/'icons/bridge.ico', format='ICO', sizes=[(n,n) for n in (16,20,24,32,40,48,64,128,256)])
(ROOT/'public/favicon.ico').write_bytes((ROOT/'icons/bridge.ico').read_bytes())
print('Created original Bridge PNG and 9-size ICO (16-256px).')
