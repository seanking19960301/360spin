# 360spin

Windows-first local desktop app for turning a product photo into an AI-generated 3D spin video. Product images are processed on the user's computer.

## Development prerequisites

- Node.js 20 or newer and npm.
- Rust stable with the MSVC toolchain, plus Microsoft C++ Build Tools.
- Python 3.11 and Git for the local TripoSR environment.
- An NVIDIA GPU with about 6 GB of VRAM is recommended for TripoSR. CPU inference is available but can be much slower.

Tauri uses Windows WebView2 to display the interface. Windows 10 and 11 generally include the runtime; the release installer can bootstrap it when missing.

## Run the desktop app

```powershell
npm install
npm run desktop
```

In another PowerShell window, install the local AI runtime:

```powershell
.\ai_service\install-model.ps1
```

The setup script uses CPU PyTorch by default. For an NVIDIA GPU, copy the matching package index URL from the [official PyTorch selector](https://pytorch.org/get-started/locally/) and pass it with `-TorchIndexUrl`.

The first AI generation downloads the TripoSR weights (about 1.7 GB) to the local 360spin cache. This is a model download; product photos remain local.

## Generate a video

- Add one or more JPG, PNG, or WebP photos.
- In **Local AI modeling** mode, the first photo is used to reconstruct the 3D product and render an MP4 turntable clip. Move a photo to the first position to change the main view.
- In **Photo-view transitions** mode, the app creates a local preview/export from all uploaded photos in order. This mode does not reconstruct unseen sides.
- AI-generated clips use a 9:16 portrait frame at 288 × 512 pixels, matching the supplied reference video's proportions.

TripoSR is a single-image reconstruction model. The current local AI mode does not fuse multiple angles into one 3D model, and inferred unseen details may differ from the real product. See [AI runtime notes](ai_service/README.md) and [third-party licenses](THIRD-PARTY-LICENSES.md).

## Build a Windows installer

```powershell
npm run build:desktop
```

Tauri emits Windows installer bundles under `src-tauri/target/release/bundle/`. A future GitHub release can attach the installer while the repository contains the source code. The local Python/model setup is currently separate from the installer and still needs packaging work before a one-click public release.
