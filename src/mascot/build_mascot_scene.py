"""Build mascot.scene.json from sprite sheets — same sources as pet.js."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mascot.scene.json"

TILE = 256
FOOT_Y = 238  # ponytail: match idle-sprites anchor so states don't jump
FPS = 60
SCALE = 1.12

PACKS = [
    {
        "name": "idle",
        "sheet": ROOT / "idle-sprites.png",
        "seq": ROOT / "idle" / "riv-seq",
        "prefix": "f",
        "frames": 24,
        "cols": 24,
        "frame_ms": 180,
    },
    {
        "name": "thinking",
        "sheet": ROOT / "think-sprites.png",
        "seq": ROOT / "think" / "riv-seq",
        "prefix": "t",
        "frames": 24,
        "cols": 8,
        "frame_ms": 83,
    },
]

SM_STATES = ["idle", "thinking", "alert"]


def normalize_tile(img):
    """Anchor every pose by the feet so idle/thinking/alert don't hop."""
    src = img.convert("RGBA")
    arr = np.array(src)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(ys) == 0:
        return Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    crop = src.crop((x0, y0, x1 + 1, y1 + 1))
    tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    px = TILE // 2 - crop.width // 2
    py = FOOT_Y - crop.height
    tile.alpha_composite(crop, (px, py))
    return tile


def slice_sheet(sheet_path, seq_dir, prefix, frames, cols):
    seq_dir.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(sheet_path).convert("RGBA")
    ids = []
    for i in range(frames):
        col, row = i % cols, i // cols
        raw = sheet.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))
        pid = f"{prefix}{i + 1:02d}"
        normalize_tile(raw).save(seq_dir / f"{pid}.png", optimize=True)
        ids.append(pid)
    return ids


def measure_content_size(path):
    arr = np.array(Image.open(path).convert("RGBA"))
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 10)
    if len(ys) == 0:
        return TILE, TILE
    return int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)


def anim_keys(ids, frame_ms):
    dur = max(1, round(frame_ms * FPS / 1000))
    keys = [{"frame": i * dur, "ref": pid, "easing": "hold"} for i, pid in enumerate(ids)]
    return len(ids) * dur, keys


BADGE_PNG = ROOT / "notify-badge.png"
BADGE_SCALE = 0.48
# ponytail: canto sup. direito da silhueta (bbox f01 @ scale 1.12), não no meio da testa
BADGE_X = 74
BADGE_Y = -110


def write_badge_png():
    size = 48
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    inset = 3
    draw.ellipse(
        (inset, inset, size - inset - 1, size - inset - 1),
        fill=(244, 196, 48, 255),
        outline=(255, 248, 231, 255),
        width=3,
    )
    im.save(BADGE_PNG, optimize=True)


def sm_transitions(states):
    out = [{"from": "entry", "to": "idle"}]
    for src in states:
        for dst in states:
            if src == dst:
                continue
            out.append({"from": src, "to": dst, "condition": {"input": dst}})
    return out


def main():
    all_images = []
    animations = []
    seen_ids = set()
    active = None

    for pack in PACKS:
        if not pack["sheet"].is_file():
            raise SystemExit(f"missing {pack['sheet']}")
        # ponytail: t01..t24 = pack_think_rivseq.py (not think-sprites grid); re-slicing here regresses art
        if pack["name"] == "thinking":
            ids = [f"{pack['prefix']}{i + 1:02d}" for i in range(pack["frames"])]
            missing = [pack["seq"] / f"{pid}.png" for pid in ids if not (pack["seq"] / f"{pid}.png").is_file()]
            if missing:
                raise SystemExit(f"missing thinking frames (run pack_think_rivseq.py): {missing[0]}")
        else:
            ids = slice_sheet(
                pack["sheet"],
                pack["seq"],
                pack["prefix"],
                pack["frames"],
                pack["cols"],
            )
        if active is None:
            active = ids[0]
        duration, keys = anim_keys(ids, pack["frame_ms"])
        for pid in ids:
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            all_images.append(
                {
                    "id": pid,
                    "pngPath": str((pack["seq"] / f"{pid}.png").resolve()).replace("\\", "/"),
                    "x": 0,
                    "y": 0,
                    "scale": SCALE,
                    "parent": "poses",
                }
            )
        animations.append(
            {
                "name": pack["name"],
                "fps": FPS,
                "duration": duration,
                "loop": "loop",
                "tracks": [{"target": "poses", "property": "soloActive", "keyframes": keys}],
            }
        )
        print(pack["name"], pack["frames"], "frames", duration, "f")

    # ponytail: shake suave + bolinha de notificação; olhar atento em micro-cortes
    alert_keys = [
        {"frame": 0, "ref": "f01", "easing": "hold"},
        {"frame": 12, "ref": "f14", "easing": "hold"},
        {"frame": 28, "ref": "f01", "easing": "hold"},
        {"frame": 40, "ref": "f15", "easing": "hold"},
        {"frame": 55, "ref": "f01", "easing": "hold"},
        {"frame": 68, "ref": "f14", "easing": "hold"},
    ]
    badge_hidden = [
        {
            "target": "notify-badge",
            "property": "opacity",
            "keyframes": [{"frame": 0, "value": 0, "easing": "hold"}],
        }
    ]
    for anim in animations:
        anim["tracks"].extend(badge_hidden)

    badge_pop = [
        {
            "target": "notify-badge",
            "property": "opacity",
            "keyframes": [
                {"frame": 0, "value": 0, "easing": "hold"},
                {"frame": 8, "value": 1, "easing": "ease-out"},
                {"frame": 90, "value": 1, "easing": "smooth"},
            ],
        },
        {
            "target": "notify-badge",
            "property": "scaleX",
            "keyframes": [
                {"frame": 0, "value": BADGE_SCALE * 0.35, "easing": "hold"},
                {"frame": 14, "value": BADGE_SCALE, "easing": "ease-out-back"},
                {"frame": 52, "value": BADGE_SCALE * 1.06, "easing": "ease-in-out"},
                {"frame": 90, "value": BADGE_SCALE, "easing": "ease-in-out"},
            ],
        },
        {
            "target": "notify-badge",
            "property": "scaleY",
            "keyframes": [
                {"frame": 0, "value": BADGE_SCALE * 0.35, "easing": "hold"},
                {"frame": 14, "value": BADGE_SCALE, "easing": "ease-out-back"},
                {"frame": 52, "value": BADGE_SCALE * 1.06, "easing": "ease-in-out"},
                {"frame": 90, "value": BADGE_SCALE, "easing": "ease-in-out"},
            ],
        },
    ]

    animations.append(
        {
            "name": "alert",
            "fps": FPS,
            "duration": 90,
            "loop": "loop",
            "presets": [
                {"preset": "shake", "target": "rig", "intensity": 0.55, "cycleSeconds": 0.42},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": alert_keys},
                *badge_pop,
            ],
        }
    )

    write_badge_png()
    all_images.append(
        {
            "id": "notify-badge",
            "pngPath": str(BADGE_PNG.resolve()).replace("\\", "/"),
            "x": BADGE_X,
            "y": BADGE_Y,
            "scale": BADGE_SCALE,
            "parent": "rig",
            "opacity": 0,
            "z": 99990,
        }
    )

    scene = {
        "artboard": {"name": "Ikari", "width": TILE, "height": TILE},
        "backgroundColor": "#00000000",
        "groups": [
            {"id": "rig", "x": TILE / 2, "y": TILE / 2},
            {"id": "poses", "x": 0, "y": 0, "parent": "rig", "solo": True, "active": active},
        ],
        "images": all_images,
        "animations": animations,
        "stateMachine": {
            "name": "Pet",
            "inputs": [{"name": s, "type": "bool"} for s in SM_STATES],
            "states": [{"name": s, "animation": s} for s in SM_STATES],
            "transitions": sm_transitions(SM_STATES),
        },
    }

    OUT.write_text(json.dumps(scene, indent=2), encoding="utf-8")
    idle_w, idle_h = measure_content_size(PACKS[0]["seq"] / "f01.png")
    think_w, think_h = measure_content_size(PACKS[1]["seq"] / "t01.png")
    print("wrote", OUT, "idle", (idle_w, idle_h), "think", (think_w, think_h))

    assert abs(idle_w - think_w) <= 2, f"width mismatch idle={idle_w} think={think_w}"


if __name__ == "__main__":
    main()
