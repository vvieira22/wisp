from collections import deque
from PIL import Image
import os

src = r"C:\Users\vitor\.cursor\projects\c-Users-vitor-develop-wisp\assets"
dst = r"C:\Users\vitor\develop\wisp\src\mascot"
os.makedirs(dst, exist_ok=True)


def is_bg(p):
    r, g, b = p[:3]
    if max(r, g, b) - min(r, g, b) > 14:
        return False
    return (r + g + b) / 3 >= 200


def matte(path, cut_bottom=None):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    vis = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]):
                q.append((x, y))
                vis[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not vis[y][x] and is_bg(px[x, y]):
                q.append((x, y))
                vis[y][x] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[ny][nx] and is_bg(px[nx, ny]):
                vis[ny][nx] = True
                q.append((nx, ny))
    out = im.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if vis[y][x]:
                op[x, y] = (0, 0, 0, 0)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            a = op[x, y][3]
            if a == 0:
                continue
            near = any(vis[ny][nx] for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
            if near and is_bg(op[x, y]):
                r, g, b, _ = op[x, y]
                avg = (r + g + b) / 3
                t = min(1.0, max(0.0, (avg - 205) / 50.0))
                op[x, y] = (r, g, b, int(a * (1 - t * 0.92)))
    if cut_bottom:
        y0 = int(h * cut_bottom)
        for y in range(y0, h):
            for x in range(w):
                r, g, b, a = op[x, y]
                if not a:
                    continue
                luma = (r + g + b) / 3
                if luma < 90 or (r < 80 and g < 90 and b > 100):
                    op[x, y] = (0, 0, 0, 0)
    return out, out.getbbox()


jobs = [
    ("shinji-idle.png", None),
    ("shinji-think.png", 0.78),
    ("shinji-talk.png", None),
    ("shinji-win.png", None),
    ("shinji-error.png", None),
]
for name, cut in jobs:
    img, bbox = matte(os.path.join(src, name), cut)
    img.save(os.path.join(dst, name))
    opaque = sum(1 for p in img.getdata() if p[3] > 8)
    print(name, "bbox", bbox, "opaque", opaque)
