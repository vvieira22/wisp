"""Rebuild assets/mascot-*.apng from riv-seq (same timing as build_mascot_scene.py)."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parents[1] / "assets"

EXPORTS = [
    ("idle", ROOT / "idle" / "riv-seq", "f*.png", 180),
    ("thinking", ROOT / "think" / "riv-seq", "t*.png", 83),
]


def export_apng(name: str, seq_dir: Path, glob_pat: str, frame_ms: int) -> None:
    frames = sorted(seq_dir.glob(glob_pat))
    if not frames:
        raise SystemExit(f"missing frames: {seq_dir / glob_pat}")
    out = ASSETS / f"mascot-{name}.apng"
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        for i, src in enumerate(frames, 1):
            shutil.copy2(src, td / f"frame_{i:03d}.png")
        fps = f"{1000 / frame_ms:.6f}"
        cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            fps,
            "-i",
            str(td / "frame_%03d.png"),
            "-plays",
            "0",
            "-f",
            "apng",
            str(out),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    print(f"wrote {out} ({len(frames)} frames @ {frame_ms}ms)")


def main() -> None:
    for name, seq_dir, glob_pat, frame_ms in EXPORTS:
        export_apng(name, seq_dir, glob_pat, frame_ms)
    alert = ASSETS / "mascot-alert.apng"
    if not alert.is_file():
        print("skip alert (no riv-seq source)", file=sys.stderr)


if __name__ == "__main__":
    main()
