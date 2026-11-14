"""Run TripoSR locally and render a full turntable MP4."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import types


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model-root", required=True, type=Path)
    parser.add_argument("--duration", type=int, default=8)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--chunk-size", type=int, default=4096)
    parser.add_argument("--background", type=str, default="#f7f7f5")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    model_root = args.model_root.resolve()
    if not (model_root / "run.py").is_file():
        raise SystemExit(
            "TripoSR is not installed. Run ai_service/install-model.ps1 and follow its PyTorch setup step."
        )
    if not args.input.is_file():
        raise SystemExit("The selected image could not be found.")
    if not 4 <= args.duration <= 16:
        raise SystemExit("Duration must be between 4 and 16 seconds.")

    local_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    numba_cache = Path(os.environ.get("NUMBA_CACHE_DIR", local_data / "360spin" / "cache" / "numba"))
    numba_cache.mkdir(parents=True, exist_ok=True)
    os.environ["NUMBA_CACHE_DIR"] = str(numba_cache)

    # Import the upstream package from the user's local model installation.
    import numpy as np
    import rembg
    import torch
    from PIL import Image

    sys.path.insert(0, str(model_root))

    # TripoSR imports torchmcubes during startup even when only its renderer is used.
    # 360spin does not export meshes, so keep that optional native extension out of the
    # Windows CPU install and fail clearly only if mesh extraction is requested upstream.
    try:
        import torchmcubes  # noqa: F401
    except ImportError:
        torchmcubes_fallback = types.ModuleType("torchmcubes")

        def unavailable_mesh_extraction(*_args, **_kwargs):
            raise RuntimeError("TripoSR mesh extraction requires the optional torchmcubes extension.")

        torchmcubes_fallback.marching_cubes = unavailable_mesh_extraction
        sys.modules["torchmcubes"] = torchmcubes_fallback

    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground, save_video

    print("Loading TripoSR on this computer…", flush=True)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(args.chunk_size)
    model.to(device)
    model.eval()

    print("Preparing product image…", flush=True)
    rembg_session = rembg.new_session()
    image = remove_background(Image.open(args.input).convert("RGBA"), rembg_session)
    image = resize_foreground(image, 0.85)
    rgba = np.asarray(image).astype(np.float32) / 255.0
    rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1.0 - rgba[:, :, 3:4]) * 0.5
    image = Image.fromarray((rgb * 255.0).clip(0, 255).astype(np.uint8))

    print(f"Reconstructing and rendering {args.duration} seconds on {device}…", flush=True)
    with torch.no_grad():
        scene_codes = model([image], device=device)
        frame_count = args.duration * args.fps
        frames = model.render(
            scene_codes,
            n_views=frame_count,
            height=512,
            width=288,
            return_type="pil",
        )[0]

    if len(args.background) != 7 or not args.background.startswith("#"):
        raise SystemExit("Background must be a six-digit hex color.")
    background = tuple(int(args.background[index:index + 2], 16) for index in (1, 3, 5))
    composited = []
    for frame in frames:
        foreground = frame.convert("RGBA")
        layer = Image.new("RGBA", foreground.size, background + (255,))
        layer.alpha_composite(foreground)
        composited.append(layer.convert("RGB"))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    save_video(composited, str(args.output), fps=args.fps)
    print(f"Video saved: {args.output}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
