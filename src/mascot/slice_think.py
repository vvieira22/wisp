"""
Slice the 8x3 thinking storyboard (hand on chin, eyes up) into a clean loop.

The source is a contact sheet, not a ready-to-play sprite sheet:
each row has a different vertical offset and a black background. Crop each
frame independently, remove that background, anchor every pose by its
feet/laptop baseline, and then use hard cuts.

ponytail: use short, aligned in-between blends only between neighboring poses.
The key pose remains held so thinking reads as deliberate instead of twitchy.
"""

from collections import deque
import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
# ponytail: use the original PNG from Downloads — images attached in chat are
# downscaled to a 1024px JPEG by the client before the agent ever sees them.
SRC = Path(r"C:\Users\Vitor\Downloads\shinji_thinking.png")
OUT = ROOT / "think"
SEQ = OUT / "seq"
ART_W, ART_H = 248, 296
COLS, ROWS = 8, 3
CELL_PAD = 0
MARGIN = 8
TILE = 256
FOOT_Y = 238  # ponytail: keep in sync with build_mascot_scene.py
IDLE_BOX = (150, 231)  # idle/riv-seq/f01 content box
SPRITE_FRAME_MS = 100
SPRITE_KEY_REPEATS = 3
POSE_HOLD_FRAMES = 18
BLEND_HOLD_FRAMES = 6
BLEND_STEPS = (1 / 3, 2 / 3)
# The source's poses 10-15 contain a discontinuous notebook drop and head
# shift; skipping that bad segment keeps the remaining loop spatially coherent.
DROP_FRAMES = frozenset(range(9, 15))


# The contact sheet has a solid black background. Two failure modes:
#  - flood at a high threshold eats the laptop/dark suit (same brightness,
#    connected to the edge through the halo);
#  - flood at a low threshold leaves the halo as a grey fringe.
# Fix: flood only the near-black core (< BG_BRIGHT), then erode the alpha by
# HALO_ERODE px. Erosion strips the thin outer halo fringe without touching
# the laptop, which sits in the interior of the silhouette.
# ponytail: this sheet has no halo (bg is pure 0,0,0) but the shoes/legs are
# near-black too — a luma threshold tunnels from the edge through scattered
# dark pixels and eats the whole suit. Max-channel keeps navy (10,31,86) and
# shoe leather (max 9-47) while only true black floods.
BG_BRIGHT = 10
HALO_ERODE = 1
MIN_COMPONENT = 32


def is_bg(pixel):
    return (len(pixel) > 3 and pixel[3] < 40) or max(pixel[:3]) < BG_BRIGHT


def cell_rect(im, row, col):
    w, h = im.size
    x0 = round(col * w / COLS) - CELL_PAD
    y0 = round(row * h / ROWS) - CELL_PAD
    x1 = round((col + 1) * w / COLS) + CELL_PAD
    y1 = round((row + 1) * h / ROWS) + CELL_PAD
    return max(0, x0), max(0, y0), min(w, x1), min(h, y1)


def transparent_frames(image):
    """Extract complete mascot components from a transparent contact sheet.
    Some sheets let adjacent rows overlap the nominal grid cells, so slicing
    fixed rectangles would import the next row's hair or cut the current pose."""
    alpha = image.getchannel("A")
    px = alpha.load()
    w, h = image.size
    visited = [[False] * w for _ in range(h)]
    components = []
    for y in range(h):
        for x in range(w):
            if px[x, y] < 40 or visited[y][x]:
                continue
            queue = [(x, y)]
            visited[y][x] = True
            points = []
            while queue:
                cx, cy = queue.pop()
                points.append((cx, cy))
                for nx in (cx - 1, cx, cx + 1):
                    for ny in (cy - 1, cy, cy + 1):
                        if (
                            0 <= nx < w
                            and 0 <= ny < h
                            and not visited[ny][nx]
                            and px[nx, ny] >= 40
                        ):
                            visited[ny][nx] = True
                            queue.append((nx, ny))
            if len(points) >= MIN_COMPONENT:
                xs = [point[0] for point in points]
                ys = [point[1] for point in points]
                components.append(
                    ((min(xs), min(ys), max(xs) + 1, max(ys) + 1), points)
                )

    if len(components) != COLS * ROWS:
        raise SystemExit(f"transparent component detect failed: {len(components)}")
    components.sort(
        key=lambda item: (
            (item[0][1] + item[0][3]) / 2,
            (item[0][0] + item[0][2]) / 2,
        )
    )
    frames = []
    for (x0, y0, x1, y1), points in components:
        # Neighboring poses can touch exactly at the column boundary.
        # Mask the crop to this component so their pixels cannot leak in.
        frame = image.crop((x0, y0, x1, y1))
        alpha = frame.getchannel("A")
        ap = alpha.load()
        keep = {(x - x0, y - y0) for x, y in points}
        for y in range(frame.height):
            for x in range(frame.width):
                if (x, y) not in keep:
                    ap[x, y] = 0
        frame.putalpha(alpha)
        frames.append(frame)
    return frames


def matte(cell):
    """Flood-fill an opaque near-black background. Preserve an existing alpha
    channel because definitive PNG sources already have clean transparency."""
    cw, ch = cell.size
    rgba = cell.convert("RGBA")
    pixels = rgba.load()
    visited = [[False] * cw for _ in range(ch)]
    queue = deque()

    def seed(x, y):
        if is_bg(pixels[x, y]) and not visited[y][x]:
            visited[y][x] = True
            queue.append((x, y))

    for x in range(cw):
        seed(x, 0)
        seed(x, ch - 1)
    for y in range(ch):
        seed(0, y)
        seed(cw - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < cw and 0 <= ny < ch and not visited[ny][nx] and is_bg(pixels[nx, ny]):
                visited[ny][nx] = True
                queue.append((nx, ny))

    for y in range(ch):
        for x in range(cw):
            if visited[y][x]:
                pixels[x, y] = (0, 0, 0, 0)

    alpha = rgba.getchannel("A")
    if HALO_ERODE and alpha.getextrema()[0] == 255:
        alpha = alpha.filter(ImageFilter.MinFilter(2 * HALO_ERODE + 1))
    rgba.putalpha(alpha)
    return rgba


def remove_debris(image):
    """Keep all substantial mascot components. The hand-drawn leg can be
    disconnected from the torso by a transparent gap, so largest-only
    filtering would erase it; only tiny stray pixels are discarded."""
    alpha = image.getchannel("A")
    mask = alpha.load()
    cw, ch = image.size
    visited = [[False] * cw for _ in range(ch)]
    components = []

    for y in range(ch):
        for x in range(cw):
            if not mask[x, y] or visited[y][x]:
                continue
            queue = [(x, y)]
            visited[y][x] = True
            pixels = []
            while queue:
                px, py = queue.pop()
                pixels.append((px, py))
                for nx in (px - 1, px, px + 1):
                    for ny in (py - 1, py, py + 1):
                        if (
                            0 <= nx < cw
                            and 0 <= ny < ch
                            and not visited[ny][nx]
                            and mask[nx, ny]
                        ):
                            visited[ny][nx] = True
                            queue.append((nx, ny))
            components.append(pixels)

    keep = {
        (x, y)
        for pixels in components
        if len(pixels) >= MIN_COMPONENT
        for x, y in pixels
    }
    for pixels in components:
        for x, y in pixels:
            if (x, y) not in keep:
                mask[x, y] = 0
    image.putalpha(alpha)
    return image


def key_name(index):
    return f"t{index * 100 + 1:03d}"


def blend_name(index):
    return f"tb{index + 1:03d}"


def pack_sprites(frames):
    """Pack frames into 256 tiles matching idle's on-screen footprint."""
    ref_w, ref_h = IDLE_BOX
    cols = 8
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (TILE * cols, TILE * rows), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        if frame.size != (ART_W, ART_H):
            raise ValueError(f"sprite frame size {frame.size} != {(ART_W, ART_H)}")
        box = frame.getbbox()
        if not box:
            tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
        else:
            crop = frame.crop(box)
            fit = min(ref_w / crop.width, ref_h / crop.height)
            nw = max(1, round(crop.width * fit))
            nh = max(1, round(crop.height * fit))
            crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
            tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
            px = TILE // 2 - nw // 2
            py = FOOT_Y - nh
            tile.alpha_composite(crop, (px, py))
        tile_x = (index % cols) * TILE
        tile_y = (index // cols) * TILE
        sheet.alpha_composite(tile, (tile_x, tile_y))
    out = ROOT / "think-sprites.png"
    tmp = out.with_name(f".{out.stem}.new.png")
    tmp.unlink(missing_ok=True)
    sheet.save(tmp, optimize=True)
    tmp.replace(out)
    print("wrote", out, "frames", len(frames))


def write_contact(source):
    # Keep the inspection board at its native resolution. It is a quality
    # reference, not a second enlarged render of the animation.
    out = OUT / "contact.png"
    tmp = out.with_name(f".{out.stem}.new.png")
    tmp.unlink(missing_ok=True)
    source.save(tmp, format="PNG")
    tmp.replace(out)


def main():
    SEQ.mkdir(parents=True, exist_ok=True)
    for old in SEQ.glob("*.png"):
        old.unlink()

    source = Image.open(SRC).convert("RGBA")
    if source.getchannel("A").getextrema()[0] < 255:
        frames = transparent_frames(source)
    else:
        frames = []
        for row in range(ROWS):
            for col in range(COLS):
                frame = remove_debris(matte(source.crop(cell_rect(source, row, col))))
                bbox = frame.getbbox()
                if not bbox:
                    raise SystemExit(f"empty thinking frame {row * COLS + col + 1:02d}")
                frames.append(frame.crop(bbox))

    source_frame_count = len(frames)
    frames = [frame for index, frame in enumerate(frames) if index not in DROP_FRAMES]
    max_w = max(frame.width for frame in frames)
    max_h = max(frame.height for frame in frames)
    scale = min((ART_W - 2 * MARGIN) / max_w, (ART_H - 2 * MARGIN) / max_h)
    dest_cx = ART_W / 2
    dest_bottom = ART_H - MARGIN
    print(
        "source frames",
        source_frame_count,
        "kept",
        len(frames),
        "scale",
        round(scale, 3),
        "max",
        (max_w, max_h),
    )

    rendered = []
    for index, frame in enumerate(frames):
        nw = max(1, round(frame.width * scale))
        nh = max(1, round(frame.height * scale))
        resized = frame.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
        canvas.alpha_composite(
            resized,
            (round(dest_cx - nw / 2), round(dest_bottom - nh)),
        )
        rendered.append(canvas)

    for index, frame in enumerate(rendered):
        frame.save(SEQ / f"{key_name(index)}.png")

    sequence = []
    sprite_sequence = []
    beats = []
    blend_index = 0
    for index in range(len(rendered)):
        sequence.append(rendered[index])
        sprite_sequence.extend([rendered[index]] * SPRITE_KEY_REPEATS)
        beats.append({"ref": key_name(index), "dur": POSE_HOLD_FRAMES})
        next_frame = rendered[(index + 1) % len(rendered)]
        for amount in BLEND_STEPS:
            ref = blend_name(blend_index)
            blend_index += 1
            frame = Image.blend(rendered[index], next_frame, amount)
            frame.save(SEQ / f"{ref}.png")
            sequence.append(frame)
            sprite_sequence.append(frame)
            beats.append({"ref": ref, "dur": BLEND_HOLD_FRAMES})

    (OUT / "beats.json").write_text(json.dumps(beats, indent=2), encoding="utf-8")
    write_contact(source)

    gif = [frame.convert("P", palette=Image.ADAPTIVE, colors=128) for frame in sequence]
    gif_durations = [round(beat["dur"] * 1000 / 60) for beat in beats]
    gif[0].save(
        OUT / "think-preview.gif",
        save_all=True,
        append_images=gif[1:],
        duration=gif_durations,
        loop=0,
        optimize=True,
    )
    pack_sprites(sprite_sequence)

    # onion skin of all poses, same as slice_idle.py
    onion = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
    for frame in rendered:
        r, g, b, a = frame.split()
        a = a.point(lambda v: int(v * 0.12))
        onion = Image.alpha_composite(onion, Image.merge("RGBA", (r, g, b, a)))
    onion.save(OUT / "onion.png")
    print("wrote", len(beats), "beats with in-betweens, think-preview.gif and onion.png")

    assert source_frame_count == COLS * ROWS
    assert len(rendered) == COLS * ROWS - len(DROP_FRAMES)
    assert len(sequence) == len(beats) == len(rendered) * (1 + len(BLEND_STEPS))
    assert len(sprite_sequence) * SPRITE_FRAME_MS == round(sum(b["dur"] for b in beats) * 1000 / 60)
    assert all(frame.getbbox() for frame in rendered)
    assert all(beat["dur"] in (POSE_HOLD_FRAMES, BLEND_HOLD_FRAMES) for beat in beats)


if __name__ == "__main__":
    main()
