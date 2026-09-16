"""
Slice the idle storyboard into aligned key frames and write a beat manifest.

Scale: per-frame height normalize so the character never changes size.
No cross-fade: pixel-lerping between distinct hand-drawn poses ghosts the
eyes (open+closed show at once = "weird blink"). Sprite animation uses hard
cuts with snappy timing — blinks are 2-3 frames, eye darts are instant, rest
holds 1-2s. That reads as motion, not slides.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = Path(
    r"C:\Users\Vitor\.cursor\projects\c-Users-Vitor-Desktop-projects-wisp\assets"
    r"\c__Users_Vitor_AppData_Roaming_Cursor_User_workspaceStorage_781bbcea20a7d4cebd0dfd9a8ed098e8_images_ChatGPT_Image_13_de_set._de_2026__18_04_35-27111d03-6a15-4261-971e-556b2e63a4a8.jpg"
)
OUT = ROOT / "idle"
SEQ = OUT / "seq"
ART_W, ART_H = 248, 296
COLS = 6
ROWS = 3
PAD = 3
MARGIN = 10          # px margin top + bottom so hair never clips

# ponytail: idle is NOT 18 frames in order — that's a slideshow.
# Real idle = rest → action → rest → action, returning to a neutral pose
# between each beat so it reads as a living character, not a flipbook.
# Entry types:
#   ("k", key_index, hold_frames)           — show a key frame
#   ("b", from_idx, to_idx, t, hold_frames)  — blend two keys at t (0..1)
# Blink = 1-frame blends around the closed frame (16ms at 60fps — too fast
# to see ghosting, enough to smooth the lid closing/opening).
SEQUENCE = [
    ("k", 0, 130),            # rest 2.2s
    ("b", 0, 2, 0.2, 1),      # lid 20% closed
    ("b", 0, 2, 0.4, 1),      # lid 40% closed
    ("b", 0, 2, 0.7, 1),      # lid 70% closed
    ("k", 2, 3),              # eyes closed 50ms
    ("b", 2, 0, 0.3, 1),      # lid 30% open
    ("b", 2, 0, 0.6, 1),      # lid 60% open
    ("b", 2, 0, 0.8, 1),      # lid 80% open
    ("k", 0, 100),            # rest 1.7s
    ("k", 1, 50),             # look L 0.8s
    ("k", 0, 70),             # rest
    ("k", 3, 50),             # look R 0.8s
    ("k", 0, 90),             # rest
    ("b", 0, 2, 0.2, 1),      # blink
    ("b", 0, 2, 0.5, 1),
    ("b", 0, 2, 0.8, 1),
    ("k", 2, 3),
    ("b", 2, 0, 0.2, 1),
    ("b", 2, 0, 0.5, 1),
    ("b", 2, 0, 0.8, 1),
    ("k", 0, 80),             # rest
    ("k", 12, 35),            # smile 0.6s
    ("k", 0, 100),            # rest
    ("k", 14, 25),            # wink 0.4s
    ("k", 0, 80),             # rest
    ("k", 15, 25),            # wink other eye
    ("k", 0, 90),             # rest
    ("b", 0, 2, 0.2, 1),      # blink
    ("b", 0, 2, 0.5, 1),
    ("b", 0, 2, 0.8, 1),
    ("k", 2, 3),
    ("b", 2, 0, 0.2, 1),
    ("b", 2, 0, 0.5, 1),
    ("b", 2, 0, 0.8, 1),
    ("k", 0, 120),            # rest 2s
    ("k", 6, 60),             # pensive 1s
    ("k", 7, 50),             # pensive look
    ("k", 8, 60),             # pensive
    ("k", 6, 50),             # pensive rest
    ("k", 0, 100),            # return to neutral
    ("b", 0, 2, 0.2, 1),      # blink
    ("b", 0, 2, 0.5, 1),
    ("b", 0, 2, 0.8, 1),
    ("k", 2, 3),
    ("b", 2, 0, 0.2, 1),
    ("b", 2, 0, 0.5, 1),
    ("b", 2, 0, 0.8, 1),
    ("k", 0, 120),            # rest
]


def is_bg(p):
    r, g, b = p[:3]
    return (r + g + b) / 3 < 18 and max(r, g, b) - min(r, g, b) < 12


def occupied_runs(counts, want, thr):
    runs = []
    i = 0
    n = len(counts)
    while i < n:
        if counts[i] >= thr:
            j = i
            while j < n and counts[j] >= thr:
                j += 1
            runs.append((i, j - 1))
            i = j
        else:
            i += 1
    if len(runs) == want:
        return runs
    merged = []
    for start, end in runs:
        if merged and start - merged[-1][1] <= 6:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    merged.sort(key=lambda r: r[1] - r[0], reverse=True)
    return sorted(merged[:want])


def detect_grid(im):
    w, h = im.size
    px = im.load()
    col_n = [sum(1 for y in range(0, h, 2) if not is_bg(px[x, y])) for x in range(w)]
    row_n = [sum(1 for x in range(0, w, 2) if not is_bg(px[x, y])) for y in range(h)]
    cols = occupied_runs(col_n, COLS, 8)
    rows = occupied_runs(row_n, ROWS, 8)
    if len(cols) != COLS or len(rows) != ROWS:
        raise SystemExit(f"grid detect failed cols={cols} rows={rows}")
    cols = [(max(0, a - PAD), min(w, b + 1 + PAD)) for a, b in cols]
    rows = [(max(0, a - PAD), min(h, b + 1 + PAD)) for a, b in rows]
    return rows, cols


def matte(cell):
    from collections import deque
    cw, ch = cell.size
    cp = cell.load()
    vis = [[False] * cw for _ in range(ch)]
    q = deque()
    for x in range(cw):
        for y in (0, ch - 1):
            if is_bg(cp[x, y]):
                vis[y][x] = True
                q.append((x, y))
    for y in range(ch):
        for x in (0, cw - 1):
            if not vis[y][x] and is_bg(cp[x, y]):
                vis[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < cw and 0 <= ny < ch and not vis[ny][nx] and is_bg(cp[nx, ny]):
                vis[ny][nx] = True
                q.append((nx, ny))
    out = cell.copy()
    op = out.load()
    for y in range(ch):
        for x in range(cw):
            if vis[y][x]:
                op[x, y] = (0, 0, 0, 0)
    for y in range(1, ch - 1):
        for x in range(1, cw - 1):
            if op[x, y][3] == 0:
                continue
            near = any(vis[ny][nx] for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
            if near and is_bg(op[x, y]):
                r, g, b, a = op[x, y]
                avg = (r + g + b) / 3
                t = min(1.0, max(0.0, (12 - avg) / 12.0))
                op[x, y] = (r, g, b, int(a * (1 - t * 0.92)))
    return out


def eye_centroid(crop):
    """Eyes are dark purple/blue (B > R); hair is dark brown (R >= B).
    Find the centroid of dark bluish pixels = eye center, the most stable face anchor.
    Searches only the upper 45% of the crop (chibi face region) so the blue plugsuit
    at the bottom doesn't win."""
    cp = crop.load()
    cw, ch = crop.size
    # find the eye row = row with most dark bluish pixels, upper 45% only
    best_y, best_n = 0, 0
    for y in range(int(ch * 0.45)):
        n = 0
        for x in range(cw):
            r, g, b, a = cp[x, y]
            if a < 40:
                continue
            if (r + g + b) / 3 > 90:
                continue
            if b <= r + 8:
                continue
            n += 1
        if n > best_n:
            best_n, best_y = n, y
    if best_n < 20:
        return None
    # centroid + head width at the eye row
    sx, sy, n = 0, 0, 0
    xs = []
    for x in range(cw):
        r, g, b, a = cp[x, best_y]
        if a < 40:
            continue
        if (r + g + b) / 3 > 90 or b <= r + 8:
            # still count eye-ish pixels for centroid
            pass
        if (r + g + b) / 3 <= 90 and b > r + 8:
            sx += x
            sy += best_y
            n += 1
        if a > 40:
            xs.append(x)
    if n < 20:
        return None
    return sx / n, sy / n


def main():
    SEQ.mkdir(parents=True, exist_ok=True)
    for old in SEQ.glob("*.png"):
        old.unlink()
    im = Image.open(SRC).convert("RGBA")
    rows, cols = detect_grid(im)

    # 1. matte + crop + detect eye centroid
    keys = []
    for ri, (y0, y1) in enumerate(rows):
        for ci, (x0, x1) in enumerate(cols):
            idx = ri * COLS + ci + 1
            matted = matte(im.crop((x0, y0, x1, y1)))
            bbox = matted.getbbox()
            if not bbox:
                raise SystemExit(f"empty cell i{idx:02d}")
            crop = matted.crop(bbox)
            ec = eye_centroid(crop)
            keys.append((idx, crop, bbox, ec))
            print(f"i{idx:02d} bbox={bbox} eye={ec}")

    # 2. per-frame scale so every frame fills the canvas height (no scale change between poses),
    # centered in the canvas (no movement)
    target_h = ART_H - 2 * MARGIN
    dest_cx = ART_W / 2
    dest_cy = MARGIN + target_h / 2
    print(f"per-frame height normalize -> target height {target_h}px, centered")

    # 3. render key frames: each scaled to fill canvas height, centered
    rendered = []
    for i, (idx, crop, bbox, ec) in enumerate(keys):
        bh = bbox[3] - bbox[1]
        sf = target_h / bh  # per-frame: fill canvas height
        nw = max(1, round(crop.size[0] * sf))
        nh = max(1, round(crop.size[1] * sf))
        resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        x = dest_cx - nw / 2
        y = dest_cy - nh / 2
        canvas = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
        canvas.paste(resized, (round(x), round(y)), resized)
        rendered.append(canvas)
        kname = f"s{i*100+1:03d}.png"
        canvas.save(SEQ / kname)
        print(f"k{idx:02d} -> {kname} sf={sf:.3f} paste ({round(x)},{round(y)}) size ({nw},{nh})")

    # 4. generate sequence frames (key frames + 1-frame blends for blinks)
    seq = []
    beats = []
    blend_counter = 0
    for entry in SEQUENCE:
        if entry[0] == "k":
            _, ki, hold = entry
            ref = f"s{ki*100+1:03d}"
            seq.append((f"{ref}.png", True, ki))
            beats.append({"ref": ref, "dur": hold})
        elif entry[0] == "b":
            _, ki_from, ki_to, t, hold = entry
            blend_counter += 1
            ref = f"sb{blend_counter:03d}"
            fade = Image.blend(rendered[ki_from], rendered[ki_to], t)
            fade.save(SEQ / f"{ref}.png")
            seq.append((f"{ref}.png", False, ki_from))
            beats.append({"ref": ref, "dur": hold})

    # 5. write beat manifest
    import json
    (OUT / "beats.json").write_text(json.dumps(beats, indent=2), encoding="utf-8")
    print(f"wrote {len(beats)} beats, {len(seq)} frames to {SEQ}")

    # onion skin of all sequence frames
    onion = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
    for name, _, _ in seq:
        layer = Image.open(SEQ / name)
        r, g, b, a = layer.split()
        a = a.point(lambda v: int(v * 0.12))
        onion = Image.alpha_composite(onion, Image.merge("RGBA", (r, g, b, a)))
    onion.save(OUT / "onion.png")
    print("wrote onion.png")

    # ponytail: verify the sequence references valid keys
    for entry in SEQUENCE:
        if entry[0] == "k":
            assert 0 <= entry[1] < len(rendered)
        elif entry[0] == "b":
            assert 0 <= entry[1] < len(rendered) and 0 <= entry[2] < len(rendered)


if __name__ == "__main__":
    main()
