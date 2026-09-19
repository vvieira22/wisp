from PIL import Image
import os

src = r"C:\Users\vitor\develop\wisp\src\mascot"
W, H = 248, 296
BASE = 258


def wipe_dock(im):
    px = im.load()
    w, h = im.size
    for y in range(792, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            luma = (r + g + b) / 3
            cyan = b > r + 15 and b > g
            if y >= 900 or luma < 140 or cyan:
                px[x, y] = (0, 0, 0, 0)
    return im


def pack(name, img):
    bbox = img.getbbox()
    crop = img.crop(bbox)
    cw, ch = crop.size
    scale = 232 / 914
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = (W - nw) // 2
    y = BASE - nh
    canvas.paste(crop, (x, y), crop)
    canvas.save(os.path.join(src, name))
    print(name, crop.size, "at", (x, y))


for src_name, dst_name in [
    ("shinji-idle.png", "pose-idle.png"),
    ("shinji-think.png", "pose-think.png"),
    ("shinji-talk.png", "pose-talk.png"),
    ("shinji-win.png", "pose-win.png"),
    ("shinji-error.png", "pose-error.png"),
]:
    im = Image.open(os.path.join(src, src_name)).convert("RGBA")
    if src_name == "shinji-think.png":
        im = wipe_dock(im)
        im.save(os.path.join(src, src_name))
    pack(dst_name, im)
