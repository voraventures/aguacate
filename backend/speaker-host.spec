# Build on the target OS only; no app/backend token is bundled.
a = Analysis(['native_host.py'], pathex=[], binaries=[], datas=[], hiddenimports=[], hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='aguacate-speaker-host', console=True)
coll = COLLECT(exe, a.binaries, a.datas, name='aguacate-speaker-host')
