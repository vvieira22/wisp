from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = Path(
    r"C:\Users\Vitor\.cursor\projects\c-Users-Vitor-Desktop-projects-wisp\assets"
    r"\c__Users_Vitor_AppData_Roaming_Cursor_User_workspaceStorage_781bbcea20a7d4cebd0dfd9a8ed098e8_images_ChatGPT_Image_13_de_set._de_2026__18_03_28-aa71a0dc-9f1b-4623-92b8-5af6b489d9ea.jpg"
)
OUT = ROOT / "chat"
ART_W, ART_H = 248, 296
COLS, ROWS = 6, 3
# ponytail: even 6×3 grid on 1024×512; trim 4px gutter per cell
PAD = 4


def is_bg(p):
    r, g, b = p[:3]
    return (r + g + b) / 3 < 18 and max(r, g, b) - min(r, g, b) < 12


def is_laptop(p):
    r, g, b, a = p
    if a < 40:
        return False
    luma = (r + g + b) / 3
    chroma = max(r, g, b) - min(r, g, b)
    return 26 <= luma <= 100 and chroma <= 30 and b + 8 >= r and b + 8 >= g


def matte(cell):
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


def body_anchor(im):
    # ponytail: bottom-center of visible art — works for bust (row2) and full (row1/3)
    bbox = im.getbbox()
    if not bbox:
        w, h = im.size
        return w / 2, h
    return (bbox[0] + bbox[2]) / 2, bbox[3]


def cell_rect(im, row, col):
    w, h = im.size
    cw, ch = w // COLS, h // ROWS
    x0 = col * cw + PAD
    y0 = row * ch + PAD
    x1 = (col + 1) * cw - PAD
    y1 = (row + 1) * ch - PAD
    return x0, y0, x1, y1


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert("RGBA")
    frames = []
    for row in range(ROWS):
        for col in range(COLS):
            idx = row * COLS + col + 1
            x0, y0, x1, y1 = cell_rect(im, row, col)
            matted = matte(im.crop((x0, y0, x1, y1)))
            bbox = matted.getbbox()
            ax, ay = body_anchor(matted)
            crop = matted.crop(bbox)
            bh = bbox[3] - bbox[1]
            frames.append((idx, crop, bbox, ax - bbox[0], ay - bbox[1], bh))
            print(f"f{idx:02d} src={(x0, y0, x1, y1)} bbox={bbox} anchor=({ax-bbox[0]:.1f},{ay-bbox[1]:.1f})")

    # row1 typing frames set the body height reference; scale up to fill pet window
    row1 = [f for f in frames if f[0] <= COLS]
    ref_h = max(f[5] for f in row1)
    target_h = ART_H * 0.86
    dest_ax = ART_W / 2
    dest_ay = ART_H - 4
    print("ref_h", ref_h, "target_h", round(target_h))

    packed = []
    for idx, matted, bbox, ax, ay, bh in frames:
        scale = min((ART_W - 8) / matted.size[0], target_h / bh)
        nw, nh = max(1, round(matted.size[0] * scale)), max(1, round(matted.size[1] * scale))
        x = dest_ax - ax * scale
        y = dest_ay - ay * scale
        packed.append((idx, matted, nw, nh, x, y))

    min_x = min(p[4] for p in packed)
    min_y = min(p[5] for p in packed)
    max_x = max(p[4] + p[2] for p in packed)
    max_y = max(p[5] + p[3] for p in packed)
    shift_x = 4 - min_x if min_x < 4 else (ART_W - 4 - max_x if max_x > ART_W - 4 else 0)
    shift_y = 4 - min_y if min_y < 4 else (ART_H - 4 - max_y if max_y > ART_H - 4 else 0)
    print("shift", (round(shift_x, 1), round(shift_y, 1)), "bounds", (min_x, min_y, max_x, max_y))

    for idx, matted, nw, nh, x, y in packed:
        canvas = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
        resized = matted.resize((nw, nh), Image.Resampling.LANCZOS)
        px, py = round(x + shift_x), round(y + shift_y)
        canvas.paste(resized, (px, py), resized)
        path = OUT / f"f{idx:02d}.png"
        canvas.save(path)
        print(path.name, "paste", (px, py), "size", (nw, nh))

    onion = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
    for idx in range(1, COLS * ROWS + 1):
        layer = Image.open(OUT / f"f{idx:02d}.png")
        r, g, b, a = layer.split()
        a = a.point(lambda v: int(v * 0.18))
        onion = Image.alpha_composite(onion, Image.merge("RGBA", (r, g, b, a)))
    onion.save(OUT / "onion.png")
    print("wrote onion.png")


if __name__ == "__main__":
    main()
