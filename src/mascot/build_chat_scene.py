import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHAT = ROOT / "chat"
IDLE = ROOT / "idle"
IDLE_SEQ = IDLE / "seq"
IDLE_BEATS = json.loads((IDLE / "beats.json").read_text(encoding="utf-8"))
THINK = ROOT / "think"
THINK_SEQ = THINK / "seq"
THINK_BEATS = json.loads((THINK / "beats.json").read_text(encoding="utf-8"))
P2 = ROOT / "p2"
P2_BEATS = json.loads((P2 / "beats.json").read_text(encoding="utf-8"))
OUT = ROOT / "chat.scene.json"
ART_W, ART_H = 248, 296
FPS = 60
FRAME_COUNT = 18

POSES = [f"f{i:02d}" for i in range(1, FRAME_COUNT + 1)]
SM_STATES = ["idle", "thinking", "pensativo2", "talking", "notify", "error", "listening", "reading", "sleepy"]

# storyboard 6×3 — row1 typing, row2 pensive, row3 blinks/expressions
# f01-f06  teclando (L→R)
# f07-f12  pensativo (L→R)
# f13-f18  micro-expressões no teclado (L→R)


def sm_transitions():
    # ponytail: riv_create ignores from:"*"; spell every pair like ikari.scene.json
    out = [{"from": "entry", "to": "idle"}]
    for src in SM_STATES:
        for dst in SM_STATES:
            if src == dst:
                continue
            out.append({"from": src, "to": dst, "condition": {"input": dst}})
    return out


def hold_solo(frames):
    keys = []
    t = 0
    for pose, dur in frames:
        keys.append({"frame": t, "ref": pose, "easing": "hold"})
        t += dur
    return t, keys


TYPE_BEATS = [
    ("f01", 14),
    ("f02", 12),
    ("f03", 14),
    ("f04", 12),
    ("f05", 10),
    ("f06", 14),
    ("f01", 10),
    ("f13", 8),
    ("f03", 12),
    ("f14", 8),
    ("f04", 12),
    ("f15", 8),
    ("f05", 10),
    ("f16", 8),
    ("f06", 12),
    ("f17", 8),
    ("f02", 10),
    ("f18", 8),
]

READ_BEATS = [
    ("f09", 30),
    ("f10", 24),
    ("f11", 36),
    ("f08", 22),
    ("f07", 26),
    ("f10", 28),
]

type_dur, type_keys = hold_solo(TYPE_BEATS)
read_dur, read_keys = hold_solo(READ_BEATS)

# idle / thinking: beat manifests from slice_*.py
idle_dur = sum(b["dur"] for b in IDLE_BEATS)
idle_keys = []
t = 0
for b in IDLE_BEATS:
    idle_keys.append({"frame": t, "ref": b["ref"], "easing": "hold"})
    t += b["dur"]
idle_seq_poses = sorted({b["ref"] for b in IDLE_BEATS})

think_dur = sum(b["dur"] for b in THINK_BEATS)
think_keys = []
t = 0
for b in THINK_BEATS:
    think_keys.append({"frame": t, "ref": b["ref"], "easing": "hold"})
    t += b["dur"]
think_seq_poses = sorted({b["ref"] for b in THINK_BEATS})

p2_dur = sum(b["dur"] for b in P2_BEATS)
p2_keys = []
t = 0
for b in P2_BEATS:
    p2_keys.append({"frame": t, "ref": b["ref"], "easing": "hold"})
    t += b["dur"]
# pensativo2 only adds the pb** blink blends; the f** poses are already in POSES
p2_extra_poses = sorted({b["ref"] for b in P2_BEATS} - set(POSES))

scene = {
    "artboard": {"name": "Ikari", "width": ART_W, "height": ART_H},
    "backgroundColor": "#00000000",
    "groups": [
        {"id": "rig", "x": ART_W / 2, "y": ART_H / 2},
        {"id": "poses", "x": 0, "y": 0, "parent": "rig", "solo": True, "active": "s001"},
    ],
    "images": [
        *[
            {
                "id": pose,
                "pngPath": str(IDLE_SEQ / f"{pose}.png").replace("\\", "/"),
                "x": 0,
                "y": 0,
                "scale": 1,
                "parent": "poses",
            }
            for pose in idle_seq_poses
        ],
        *[
            {
                "id": pose,
                "pngPath": str(THINK_SEQ / f"{pose}.png").replace("\\", "/"),
                "x": 0,
                "y": 0,
                "scale": 1,
                "parent": "poses",
            }
            for pose in think_seq_poses
        ],
        *[
            {
                "id": pose,
                "pngPath": str(CHAT / f"{pose}.png").replace("\\", "/"),
                "x": 0,
                "y": 0,
                "scale": 1,
                "parent": "poses",
            }
            for pose in POSES + p2_extra_poses
        ],
    ],
    "animations": [
        {
            "name": "idle",
            "fps": FPS,
            "duration": idle_dur,
            "loop": "loop",
            # ponytail: no float-idle, no scaleY breathing — any Y/scale motion
            # clips the hair at the canvas top. The rhythm of the pose sequence
            # (rest → blink → rest → look) is what makes it feel alive.
            "tracks": [
                {
                    "target": "poses",
                    "property": "soloActive",
                    "keyframes": idle_keys,
                },
            ],
        },
        {
            "name": "thinking",
            "fps": FPS,
            "duration": think_dur,
            "loop": "loop",
            # ponytail: no float-idle — same as idle; Y/scale clips hair and jitters the laptop
            "tracks": [{"target": "poses", "property": "soloActive", "keyframes": think_keys}],
        },
        {
            "name": "pensativo2",
            "fps": FPS,
            "duration": p2_dur,
            "loop": "loop",
            # idle language: long rests, short actions, hard cuts, blink blends only
            "tracks": [{"target": "poses", "property": "soloActive", "keyframes": p2_keys}],
        },
        {
            "name": "talking",
            "fps": FPS,
            "duration": type_dur,
            "loop": "loop",
            "presets": [{"preset": "float-idle", "target": "rig", "intensity": 0.35, "cycleSeconds": 2.8}],
            "tracks": [{"target": "poses", "property": "soloActive", "keyframes": type_keys}],
        },
        {
            "name": "reading",
            "fps": FPS,
            "duration": read_dur,
            "loop": "loop",
            "tracks": [{"target": "poses", "property": "soloActive", "keyframes": read_keys}],
        },
        {
            "name": "notify",
            "fps": FPS,
            "duration": 90,
            "loop": "loop",
            "presets": [{"preset": "attention", "target": "rig", "intensity": 0.7}],
            "tracks": [
                {
                    "target": "poses",
                    "property": "soloActive",
                    "keyframes": [
                        {"frame": 0, "ref": "f01", "easing": "hold"},
                        {"frame": 18, "ref": "f17", "easing": "hold"},
                        {"frame": 48, "ref": "f01", "easing": "hold"},
                        {"frame": 70, "ref": "f18", "easing": "hold"},
                    ],
                }
            ],
        },
        {
            "name": "error",
            "fps": FPS,
            "duration": 150,
            "loop": "loop",
            "presets": [{"preset": "shake", "target": "rig", "at": 0, "intensity": 0.7}],
            "tracks": [
                {
                    "target": "poses",
                    "property": "soloActive",
                    "keyframes": [
                        {"frame": 0, "ref": "f11", "easing": "hold"},
                        {"frame": 40, "ref": "f12", "easing": "hold"},
                        {"frame": 70, "ref": "f11", "easing": "hold"},
                        {"frame": 110, "ref": "f10", "easing": "hold"},
                    ],
                }
            ],
        },
        {
            "name": "listening",
            "fps": FPS,
            "duration": 180,
            "loop": "loop",
            "presets": [{"preset": "float-idle", "target": "rig", "intensity": 0.4, "cycleSeconds": 3.0}],
            "tracks": [
                {
                    "target": "poses",
                    "property": "soloActive",
                    "keyframes": [
                        {"frame": 0, "ref": "f01", "easing": "hold"},
                        {"frame": 90, "ref": "f03", "easing": "hold"},
                        {"frame": 140, "ref": "f13", "easing": "hold"},
                        {"frame": 148, "ref": "f01", "easing": "hold"},
                    ],
                }
            ],
        },
        {
            "name": "sleepy",
            "fps": FPS,
            "duration": 240,
            "loop": "loop",
            "presets": [{"preset": "breathing", "target": "rig", "intensity": 0.35, "cycleSeconds": 4.0}],
            "tracks": [
                {
                    "target": "poses",
                    "property": "soloActive",
                    "keyframes": [
                        {"frame": 0, "ref": "f12", "easing": "hold"},
                        {"frame": 80, "ref": "f11", "easing": "hold"},
                        {"frame": 160, "ref": "f12", "easing": "hold"},
                    ],
                }
            ],
        },
    ],
    "stateMachine": {
        "name": "Pet",
        "inputs": [
            {"name": "idle", "type": "bool"},
            {"name": "thinking", "type": "bool"},
            {"name": "pensativo2", "type": "bool"},
            {"name": "talking", "type": "bool"},
            {"name": "notify", "type": "bool"},
            {"name": "error", "type": "bool"},
            {"name": "listening", "type": "bool"},
            {"name": "reading", "type": "bool"},
            {"name": "sleepy", "type": "bool"},
            {"name": "lookX", "type": "number"},
            {"name": "lookY", "type": "number"},
        ],
        "states": [{"name": name, "animation": name} for name in SM_STATES],
        "transitions": sm_transitions(),
    },
}

OUT.write_text(json.dumps(scene, indent=2), encoding="utf-8")
print("wrote", OUT, "think", think_dur, "talk", type_dur, "read", read_dur)
