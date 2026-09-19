import json

fx = json.load(open(r"C:\Users\vitor\develop\wisp\src\mascot\fx.scene.json"))
behind = {"fxshadow", "fxdock", "fxdockShine", "fxdockGlow", "fxnerv"}
for shape in fx["shapes"]:
    shape["z"] = 5 if shape["id"] in behind else 2500

root = r"C:/Users/vitor/develop/wisp/src/mascot"


def hold_opacity(ids, value):
    return [{"target": tid, "property": "opacity", "keyframes": [{"frame": 0, "value": value, "easing": "hold"}]} for tid in ids]


overlay = ["fxswirl", "fxswirl2", "fxholoL", "fxholoR", "fxsparkA", "fxsparkB", "fxsparkC", "fxsweatA", "fxsweatB"]

scene = {
    "artboard": {"name": "Ikari", "width": 248, "height": 296},
    "backgroundColor": "#00000000",
    "shapes": fx["shapes"],
    "groups": [
        {"id": "rig", "x": 124, "y": 148},
        {"id": "poses", "x": 0, "y": 0, "parent": "rig", "solo": True, "active": "poseIdle"},
    ],
    "images": [
        {"id": "poseIdle", "pngPath": f"{root}/pose-idle.png", "x": 0, "y": 0, "scale": 1, "parent": "poses"},
        {"id": "poseThink", "pngPath": f"{root}/pose-think.png", "x": 0, "y": 0, "scale": 1, "parent": "poses"},
        {"id": "poseTalk", "pngPath": f"{root}/pose-talk.png", "x": 0, "y": 0, "scale": 1, "parent": "poses"},
        {"id": "poseWin", "pngPath": f"{root}/pose-win.png", "x": 0, "y": 0, "scale": 1, "parent": "poses"},
        {"id": "poseError", "pngPath": f"{root}/pose-error.png", "x": 0, "y": 0, "scale": 1, "parent": "poses"},
    ],
    "animations": [
        {
            "name": "idle",
            "fps": 60,
            "duration": 210,
            "loop": "loop",
            "presets": [
                {"preset": "float-idle", "target": "rig", "intensity": 0.7, "cycleSeconds": 3.5},
                {"preset": "glow-pulse", "target": "fxdockGlow", "intensity": 0.8, "cycleSeconds": 3.5},
                {"preset": "breathing", "target": "fxdock", "intensity": 0.35, "cycleSeconds": 3.5},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": [{"frame": 0, "ref": "poseIdle"}]},
                *hold_opacity(overlay, 0),
            ],
        },
        {
            "name": "thinking",
            "fps": 60,
            "duration": 180,
            "loop": "loop",
            "presets": [
                {"preset": "float-idle", "target": "rig", "intensity": 1.05, "cycleSeconds": 2.2},
                {"preset": "spin", "target": "fxswirl", "intensity": 0.7, "cycleSeconds": 2.2},
                {"preset": "sway", "target": "fxswirl2", "intensity": 1.2, "cycleSeconds": 1.8},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": [{"frame": 0, "ref": "poseThink"}]},
                *hold_opacity(["fxsparkA", "fxsparkB", "fxsparkC", "fxsweatA", "fxsweatB"], 0),
                {
                    "target": "fxswirl",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 18, "value": 1, "easing": "emphasized-decel"},
                    ],
                },
                {
                    "target": "fxswirl2",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 24, "value": 0.85, "easing": "emphasized-decel"},
                    ],
                },
                {
                    "target": "fxholoL",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 27, "value": 0.9, "easing": "emphasized-decel"},
                    ],
                },
                {
                    "target": "fxholoR",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 8, "value": 0, "easing": "hold"},
                        {"frame": 36, "value": 0.8, "easing": "emphasized-decel"},
                    ],
                },
            ],
        },
        {
            "name": "talking",
            "fps": 60,
            "duration": 120,
            "loop": "loop",
            "presets": [
                {"preset": "float-idle", "target": "rig", "intensity": 0.9, "cycleSeconds": 2},
                {"preset": "pulse", "targets": ["fxsparkA", "fxsparkB", "fxsparkC"], "stagger": 6, "intensity": 1.1},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": [{"frame": 0, "ref": "poseTalk"}]},
                *hold_opacity(["fxswirl", "fxswirl2", "fxholoL", "fxholoR", "fxsweatA", "fxsweatB"], 0),
                {
                    "target": "fxsparkA",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 12, "value": 1, "easing": "emphasized-decel"},
                        {"frame": 70, "value": 0.35, "easing": "ease-in-out"},
                        {"frame": 120, "value": 1, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsparkB",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 18, "value": 1, "easing": "emphasized-decel"},
                        {"frame": 80, "value": 0.4, "easing": "ease-in-out"},
                        {"frame": 120, "value": 0.9, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsparkC",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 24, "value": 0.85, "easing": "emphasized-decel"},
                        {"frame": 90, "value": 0.25, "easing": "ease-in-out"},
                        {"frame": 120, "value": 0.8, "easing": "ease-in-out"},
                    ],
                },
            ],
        },
        {
            "name": "notify",
            "fps": 60,
            "duration": 90,
            "loop": "loop",
            "presets": [
                {"preset": "tada", "targets": ["fxsparkA", "fxsparkB", "fxsparkC"], "at": 6, "stagger": 4, "intensity": 1.1},
                {"preset": "glow-pulse", "target": "fxdockGlow", "intensity": 1.3, "cycleSeconds": 1.5},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": [{"frame": 0, "ref": "poseWin"}]},
                *hold_opacity(["fxswirl", "fxswirl2", "fxholoL", "fxholoR", "fxsweatA", "fxsweatB"], 0),
                {
                    "target": "rig",
                    "property": "y",
                    "keyframes": [
                        {"frame": 0, "value": 148, "easing": "hold"},
                        {"frame": 8, "value": 156, "easing": "ease-out"},
                        {"frame": 27, "value": 126, "easing": "emphasized-decel"},
                        {"frame": 50, "value": 148, "easing": "ease-out-back"},
                        {"frame": 90, "value": 148, "easing": "smooth"},
                    ],
                },
                {
                    "target": "fxsparkA",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 10, "value": 1, "easing": "emphasized-decel"},
                        {"frame": 60, "value": 0.4, "easing": "ease-in-out"},
                        {"frame": 90, "value": 1, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsparkB",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 16, "value": 1, "easing": "emphasized-decel"},
                        {"frame": 70, "value": 0.45, "easing": "ease-in-out"},
                        {"frame": 90, "value": 0.9, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsparkC",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 22, "value": 1, "easing": "emphasized-decel"},
                        {"frame": 90, "value": 0.7, "easing": "ease-in-out"},
                    ],
                },
            ],
        },
        {
            "name": "error",
            "fps": 60,
            "duration": 150,
            "loop": "loop",
            "presets": [
                {"preset": "shake", "target": "rig", "at": 0, "intensity": 0.85},
            ],
            "tracks": [
                {"target": "poses", "property": "soloActive", "keyframes": [{"frame": 0, "ref": "poseError"}]},
                *hold_opacity(["fxswirl", "fxswirl2", "fxholoL", "fxholoR", "fxsparkA", "fxsparkB", "fxsparkC"], 0),
                {
                    "target": "fxsweatA",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 18, "value": 0.95, "easing": "emphasized-decel"},
                        {"frame": 100, "value": 0.2, "easing": "smooth"},
                        {"frame": 150, "value": 0.9, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsweatA",
                    "property": "y",
                    "keyframes": [
                        {"frame": 0, "value": 96, "easing": "hold"},
                        {"frame": 90, "value": 118, "easing": "smooth"},
                        {"frame": 150, "value": 96, "easing": "hold"},
                    ],
                },
                {
                    "target": "fxsweatB",
                    "property": "opacity",
                    "keyframes": [
                        {"frame": 0, "value": 0, "easing": "hold"},
                        {"frame": 30, "value": 0.8, "easing": "emphasized-decel"},
                        {"frame": 120, "value": 0.15, "easing": "smooth"},
                        {"frame": 150, "value": 0.7, "easing": "ease-in-out"},
                    ],
                },
                {
                    "target": "fxsweatB",
                    "property": "y",
                    "keyframes": [
                        {"frame": 12, "value": 112, "easing": "hold"},
                        {"frame": 110, "value": 132, "easing": "smooth"},
                        {"frame": 150, "value": 112, "easing": "hold"},
                    ],
                },
            ],
        },
    ],
    "stateMachine": {
        "name": "Pet",
        "inputs": [
            {"name": "idle", "type": "bool"},
            {"name": "thinking", "type": "bool"},
            {"name": "talking", "type": "bool"},
            {"name": "notify", "type": "bool"},
            {"name": "error", "type": "bool"},
            {"name": "lookX", "type": "number"},
            {"name": "lookY", "type": "number"},
        ],
        "states": [
            {"name": "idle", "animation": "idle"},
            {"name": "thinking", "animation": "thinking"},
            {"name": "talking", "animation": "talking"},
            {"name": "notify", "animation": "notify"},
            {"name": "error", "animation": "error"},
        ],
        "transitions": [
            {"from": "entry", "to": "idle"},
            {"from": "*", "to": "idle", "condition": {"input": "idle"}},
            {"from": "*", "to": "thinking", "condition": {"input": "thinking"}},
            {"from": "*", "to": "talking", "condition": {"input": "talking"}},
            {"from": "*", "to": "notify", "condition": {"input": "notify"}},
            {"from": "*", "to": "error", "condition": {"input": "error"}},
        ],
    },
}

out = r"C:\Users\vitor\develop\wisp\src\mascot\shinji.scene.json"
json.dump(scene, open(out, "w"), indent=2)
print("wrote", out, "shapes", len(scene["shapes"]), "anims", len(scene["animations"]))
