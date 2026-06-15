# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Aguacate FastAPI backend.

Produces a single self-contained executable (backend/dist/aguacate-backend)
so the app runs on any Mac without a Python install.
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = []

# Native-library-heavy packages: pull in their binaries, data files, and
# submodules wholesale so faster-whisper / ctranslate2 / torch load at runtime.
for pkg in ("faster_whisper", "ctranslate2", "torch", "torchaudio"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# The application package and all of its submodules (routes/, services/, ...).
hiddenimports += collect_submodules("app")

# Explicit hidden imports for dynamically-loaded modules PyInstaller can miss.
hiddenimports += [
    "uvicorn",
    "fastapi",
    "whisper",
    "faster_whisper",
    "ctranslate2",
    "sounddevice",
    "anthropic",
    "sqlite3",
]
for mod in ("uvicorn", "fastapi", "whisper", "anthropic"):
    try:
        hiddenimports += collect_submodules(mod)
    except Exception:
        pass


a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="aguacate-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
