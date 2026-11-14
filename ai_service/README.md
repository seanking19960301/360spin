# Local AI runtime

360spin uses [TripoSR](https://github.com/VAST-AI-Research/TripoSR) for local single-image 3D reconstruction. The official project is MIT licensed and its default run is documented at about 6 GB of VRAM. The model generates one plausible 3D object from one selected photo; extra uploaded angles are not fused by this model yet.

## Windows development setup

1. Install Python 3.11 and Git.
2. Open PowerShell in the project folder and run `./ai_service/install-model.ps1`. It creates an isolated environment and installs CPU PyTorch by default.
3. For an NVIDIA GPU, copy the matching wheel index from the [official PyTorch installer page](https://pytorch.org/get-started/locally/) and pass `-TorchIndexUrl <wheel-index>` to the setup script.
4. Start the 360spin desktop app. The first generation downloads TripoSR weights into the local 360spin model cache (about 1.7 GB) and the background-removal model (about 176 MB).

The install script stores the runtime under `%LOCALAPPDATA%\360spin`. It downloads upstream TripoSR source and the Python packages used by 360spin's image-to-video path. The upstream C++ `torchmcubes` extension is only needed when exporting meshes; this app renders directly from the TripoSR scene, so it is omitted to keep Windows setup simpler. TripoSR and background-removal weights are downloaded for local use. The 360spin app sends the selected image only to the local Python process; it does not upload product photos. A network connection is needed for the initial dependency and model-weight downloads.

To point the app at a different environment, set `TRIPOSR_PYTHON` to its Python executable and `TRIPOSR_HOME` to the folder containing TripoSR's `run.py`.

## Limitations

- Current local AI inference uses the first image in the list as its reconstruction input. Reordering photos changes the selected main view.
- Views not present in that image are inferred, so small labels, text, and unseen product details may differ from the real item.
- CPU inference is supported by TripoSR but can take much longer than CUDA inference. On the development PC, a 16-view smoke render took about 8 minutes; use the 4-second default for an initial test. A 6 GB or larger CUDA GPU is recommended for regular use.
- The photo-sequence mode uses every uploaded view but is a 2D transition, not a reconstructed 3D model.
