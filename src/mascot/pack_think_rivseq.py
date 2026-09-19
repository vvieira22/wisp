"""
Re-render the 24 thinking.riv frames into 256x256 canvases matching idle's
layout so they drop into mascot.scene.json at the same scale/position as f01-f24.

idle content bbox = (53,7,203,238) -> 150x231, head at y=7, centered x=128.
think frames are 400x512, content bbox ~(93,166,308,396) -> 215x230, head at top.
Crop to the fixed bbox, center horizontally in 256, anchor head at y=7.
No scaling: think content height (230) ~= idle content height (231), so the
character is already the same scale -- only the pose is wider (laptop + prone).

ponytail: t01..t24 = frame_00..frame_23 (extraction order). thinking.riv's
"thinking" anim plays refs 25->2; if this loops backwards, flip REVERSE below.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "think" / "riv-seq"
OUT = SRC
CANVAS = 256
TOP_Y = 7
CROP = (93, 166, 308, 396)  # fixed union bbox; all frames align to this
REVERSE = False

order = list(range(24))
if REVERSE:
    order = list(reversed(order))

for t_index, frame_index in enumerate(order):
    src = SRC / f"frame_{frame_index:02d}.png"
    im = Image.open(src).convert("RGBA")
    crop = im.crop(CROP)
    w, h = crop.size
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - w) // 2
    canvas.paste(crop, (x, TOP_Y), crop)
    out = OUT / f"t{t_index + 1:02d}.png"
    canvas.save(out)

# ponytail: sanity -- every output frame is 256x256 and non-empty
for i in range(1, 25):
    p = OUT / f"t{i:02d}.png"
    assert p.exists(), f"missing {p}"
    im = Image.open(p)
    assert im.size == (CANVAS, CANVAS), f"{p} size {im.size}"
    assert im.getbbox(), f"{p} empty"
print(f"wrote t01..t24 into {OUT} (REVERSE={REVERSE})")
