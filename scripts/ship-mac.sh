#!/usr/bin/env bash
set -euo pipefail

# Build, notarize, and staple the macOS Aguacate DMG.
DMG="release/Aguacate.dmg"

# 1. Bundle the Python backend with PyInstaller (must precede the Electron package step)
backend/.venv/bin/pyinstaller backend/backend.spec --clean --distpath backend/dist --workpath backend/build --noconfirm

npm run dist:mac

xcrun notarytool submit "$DMG" --keychain-profile "AguacateNotarization" --wait

xcrun stapler staple "$DMG"
