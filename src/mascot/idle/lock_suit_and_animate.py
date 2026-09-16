# ponytail: lock the full body/head; use only face frames and CSS floating.
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
import shutil

ASSETS = Path(r"C:\Users\Vitor\.cursor\projects\c-Users-Vitor-Desktop-projects-wisp\assets")
DST = Path(r"C:\Users\Vitor\Desktop\projects\wisp\src\mascot\idle-kf")
SUIT_SRC = Path(
    r"C:\Users\Vitor\.cursor\projects\c-Users-Vitor-Desktop-projects-wisp"
    r"\assets\c__Users_Vitor_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"781bbcea20a7d4cebd0dfd9a8ed098e8_images_image-197220c3-68a7-4396-8d6d-bf51567d7938.png"
)

CANVAS = 1024
TARGET_H = 918
MARGIN_B = 70
SPRITE_TILE = 256
FRAME_MS = 180


def fg(arr, thr=18):
    return arr.max(axis=2) > thr


def normalize(im):
    arr = np.array(im.convert("RGB"))
    ys, xs = np.where(fg(arr))
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    crop = im.convert("RGBA").crop((x0, y0, x1 + 1, y1 + 1))
    ww, hh = crop.size
    scale = TARGET_H / hh
    nw, nh = max(1, int(round(ww * scale))), max(1, int(round(hh * scale)))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 255))
    px = CANVAS // 2 - nw // 2
    py = CANVAS - MARGIN_B - nh
    canvas.paste(crop, (px, py), crop)
    return canvas.convert("RGB")


def remove_black_background(im, threshold=18):
    rgba = np.array(im.convert("RGBA"))
    rgb = rgba[:, :, :3]
    near_black = rgb.max(axis=2) <= threshold
    background = np.zeros(near_black.shape, dtype=bool)
    queue = deque()

    for x in range(near_black.shape[1]):
        if near_black[0, x]:
            background[0, x] = True
            queue.append((0, x))
        if near_black[-1, x]:
            background[-1, x] = True
            queue.append((near_black.shape[0] - 1, x))
    for y in range(1, near_black.shape[0] - 1):
        if near_black[y, 0]:
            background[y, 0] = True
            queue.append((y, 0))
        if near_black[y, -1]:
            background[y, -1] = True
            queue.append((y, near_black.shape[1] - 1))

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if (
                0 <= ny < near_black.shape[0]
                and 0 <= nx < near_black.shape[1]
                and near_black[ny, nx]
                and not background[ny, nx]
            ):
                background[ny, nx] = True
                queue.append((ny, nx))

    rgba[background, 3] = 0
    return Image.fromarray(rgba, "RGBA")


def build_sprite_sheet(frames):
    sheet = Image.new("RGBA", (SPRITE_TILE * len(frames), SPRITE_TILE), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        tile = remove_black_background(frame).resize(
            (SPRITE_TILE, SPRITE_TILE), Image.Resampling.LANCZOS
        )
        sheet.alpha_composite(tile, (i * SPRITE_TILE, 0))
    sheet.save(DST.parent / "idle-sprites.png", optimize=True)


def shift(im, dx, dy):
    arr = np.array(im)
    return Image.fromarray(np.roll(np.roll(arr, dy, 0), dx, 1))


def align_to_master(master, variant, body_mask, max_shift=12):
    ma = np.array(master).astype(np.int16)
    va = np.array(variant).astype(np.int16)
    best, score = (0, 0), 1e18
    for dy in range(-max_shift, max_shift + 1, 2):
        for dx in range(-max_shift, max_shift + 1, 2):
            rolled = np.roll(np.roll(va, dy, 0), dx, 1)
            diff = np.abs(rolled - ma).mean(axis=2)
            s = float(diff[body_mask].mean())
            if s < score:
                score, best = s, (dx, dy)
    return shift(variant, best[0], best[1]), best, score


def collar_y(arr):
    r, g, b = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    # peach chin sits just above the red collar — do not use hair reds
    skin = (r > 180) & (g > 140) & (b > 110) & (r > g + 25) & (r > b + 25)
    rows = np.where(skin.any(axis=1))[0]
    if len(rows) == 0:
        return 590
    return int(rows.max()) + 4


def feature_mask(shape, feature):
    yy, xx = np.ogrid[: shape[0], : shape[1]]
    eyes = (
        (((xx - 450) / 100) ** 2 + ((yy - 460) / 70) ** 2 <= 1)
        | (((xx - 620) / 100) ** 2 + ((yy - 460) / 70) ** 2 <= 1)
    )
    mouth = ((xx - 535) / 68) ** 2 + ((yy - 538) / 30) ** 2 <= 1
    return eyes if feature == "eyes" else mouth


def lock_face(master, variant, fmask):
    out = np.array(master)
    var = np.array(variant)
    feather = Image.fromarray((fmask.astype(np.uint8) * 255), "L").filter(ImageFilter.GaussianBlur(2))
    a = np.array(feather).astype(np.float32) / 255.0
    a = a[:, :, None]
    out = (var * a + out * (1 - a)).astype(np.uint8)
    return Image.fromarray(out)


def blend_feature(master, target, fmask, amount):
    out = np.array(master).astype(np.float32)
    var = np.array(target).astype(np.float32)
    feather = Image.fromarray((fmask.astype(np.uint8) * 255), "L").filter(ImageFilter.GaussianBlur(2))
    a = np.array(feather).astype(np.float32) / 255.0
    a = (a * amount)[:, :, None]
    out = (var * a + out * (1 - a)).astype(np.uint8)
    return Image.fromarray(out)


def main():
    shutil.copy2(SUIT_SRC, DST / "suit-ref.png")

    master = normalize(Image.open(ASSETS / "suit-master-a.png"))
    variants = {
        "open": master,
        "blink": normalize(Image.open(ASSETS / "suit-master-blink.png")),
        "smile": normalize(Image.open(ASSETS / "suit-master-smile.png")),
        "half": normalize(Image.open(ASSETS / "suit-master-halfblink.png")),
    }

    marr = np.array(master)
    neck = collar_y(marr)
    body_mask = fg(marr) & (np.arange(marr.shape[0])[:, None] > neck + 20)
    masks = {"eyes": feature_mask(marr.shape, "eyes"), "mouth": feature_mask(marr.shape, "mouth")}
    print("neck", neck, "eye_px", int(masks["eyes"].sum()), "mouth_px", int(masks["mouth"].sum()))

    locked = {"open": master}
    for name, feature in (("blink", "eyes"), ("half", "eyes"), ("smile", "mouth")):
        aligned, sh, score = align_to_master(master, variants[name], body_mask)
        locked[name] = lock_face(master, aligned, masks[feature])
        locked[name].save(DST / f"suit-lock-{name}.png")
        print(name, "shift", sh, "score", round(score, 3))

    locked["smile-soft"] = blend_feature(master, locked["smile"], masks["mouth"], 0.35)
    locked["smile-mid"] = blend_feature(master, locked["smile"], masks["mouth"], 0.7)

    master.save(DST / "suit-lock.png")

    # One complete drawing supplies every frame. Only the face changes;
    # floating is handled by the desktop CSS, so no head/body redraws can
    # introduce color or pose changes.
    seq = [
        ("kf01-neutral.png", "open"),
        ("ib01-02a.png", "open"),
        ("ib01-02b.png", "open"),
        ("kf02-tilt-left-start.png", "open"),
        ("ib02-03a.png", "open"),
        ("ib02-03b.png", "open"),
        ("kf03-tilt-left.png", "open"),
        ("ib03-04a.png", "open"),
        ("ib03-04b.png", "open"),
        ("kf04-return-center.png", "open"),
        ("ib04-05a.png", "open"),
        ("ib04-05b.png", "open"),
        ("kf05-tilt-right-start.png", "open"),
        ("ib05-06a.png", "open"),
        ("ib05-06b.png", "open"),
        ("kf06-tilt-right.png", "half"),
        ("ib06-07a.png", "blink"),
        ("ib06-07b.png", "half"),
        ("kf07-blink.png", "open"),
        ("ib07-08a.png", "smile-soft"),
        ("ib07-08b.png", "smile-mid"),
        ("kf08-smile.png", "smile"),
        ("ib08-01a.png", "smile"),
        ("ib08-01b.png", "smile-mid"),
    ]

    frames = []
    for i, (name, face) in enumerate(seq, 1):
        out = locked[face].convert("RGB")
        out.save(DST / name)
        out.save(DST / f"{i:02d}-{name}")
        frames.append(out)
        print(f"{i:02d}", name, face)

    thumb, cols, rows, pad = 220, 8, 3, 12
    sheet = Image.new("RGB", (cols * thumb + (cols + 1) * pad, rows * thumb + (rows + 1) * pad), (0, 0, 0))
    for i, im in enumerate(frames):
        t = im.resize((thumb, thumb), Image.Resampling.LANCZOS)
        r, c = divmod(i, cols)
        sheet.paste(t, (pad + c * (thumb + pad), pad + r * (thumb + pad)))
    sheet.save(DST / "seq-contact.png")

    gif = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    gif[0].save(DST / "idle-preview.gif", save_all=True, append_images=gif[1:], duration=FRAME_MS, loop=0, optimize=True)
    build_sprite_sheet(frames)
    print("done")


if __name__ == "__main__":
    main()
