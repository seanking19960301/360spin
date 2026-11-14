param(
  [string]$PythonCommand = 'py -3.11',
  [string]$TorchIndexUrl = 'https://download.pytorch.org/whl/cpu'
)

$ErrorActionPreference = 'Stop'
$appData = Join-Path $env:LOCALAPPDATA '360spin'
$venv = Join-Path $appData 'venv'
$modelRoot = Join-Path $appData 'models\TripoSR'
$python = Join-Path $venv 'Scripts\python.exe'

Write-Host '360spin local model setup'
Write-Host "Runtime folder: $appData"
Write-Host ''
Write-Host "PyTorch wheel index: $TorchIndexUrl"
Write-Host 'For NVIDIA CUDA, copy the matching wheel index from https://pytorch.org/get-started/locally/ and pass it with -TorchIndexUrl.'
Write-Host 'TripoSR documents about 6 GB of VRAM for its default single-image settings.'
Write-Host ''

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required to fetch the TripoSR source.'
}

if (-not (Test-Path -LiteralPath $venv)) {
  $pythonParts = $PythonCommand -split '\s+'
  $launcherArgs = @()
  if ($pythonParts.Length -gt 1) { $launcherArgs = $pythonParts[1..($pythonParts.Length - 1)] }
  & $pythonParts[0] @launcherArgs -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the local Python environment.' }
}

if (-not (Test-Path -LiteralPath $modelRoot)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $modelRoot) -Force | Out-Null
  git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git $modelRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not download the TripoSR source.' }
}

& $python -m pip install --upgrade pip setuptools
if ($LASTEXITCODE -ne 0) { throw 'Could not update pip and setuptools.' }

& $python -m pip install torch torchvision --index-url $TorchIndexUrl
if ($LASTEXITCODE -ne 0) { throw 'Could not install PyTorch. Check the selected CPU/CUDA wheel index.' }

& $python -c 'import torch; print(torch.__version__)'
if ($LASTEXITCODE -ne 0) {
  throw 'PyTorch is not available in the 360spin environment.'
}

$runtimeRequirements = Join-Path $PSScriptRoot 'requirements.txt'
& $python -m pip install -r $runtimeRequirements
if ($LASTEXITCODE -ne 0) { throw 'Could not install the 360spin local AI dependencies.' }

Write-Host ''
Write-Host 'Local model setup is ready.'
Write-Host 'The model weights (about 1.7 GB) are downloaded from Hugging Face on first generation.'
Write-Host 'Product photos stay on this computer.'
