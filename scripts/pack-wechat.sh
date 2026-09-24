#!/usr/bin/env bash
# Pack a WeChat DevTools 2.02 importable zip.
# Zip name != inner folder name, so Windows「全部提取」不会套两层同名目录。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/miniprogram"
OUT_DIR="${1:-$ROOT/wechat-import}"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

test -f "$SRC/app.json"
test -f "$SRC/pages/index/index.wxml"
test -f "$SRC/project.config.json"
python3 - "$SRC" <<'PY'
import json, os, sys
root = sys.argv[1]
app = json.load(open(os.path.join(root, 'app.json')))
missing = []
for page in app['pages']:
    for ext in ('.js', '.json', '.wxml', '.wxss'):
        path = os.path.join(root, page + ext)
        if not os.path.isfile(path):
            missing.append(page + ext)
if missing:
    sys.exit('missing page files: ' + ', '.join(missing))
cfg = json.load(open(os.path.join(root, 'project.config.json')))
if cfg.get('miniprogramRoot') in ('.', './'):
    sys.exit('project.config.json must not set miniprogramRoot to ./')
if cfg.get('compileType') != 'miniprogram' or not cfg.get('appid'):
    sys.exit('project.config.json missing compileType/appid')
if app.get('plugins'):
    sys.exit('app.json must not declare plugins until they are added in 微信公众平台; undeclared plugins crash the simulator')
if 'miniprogramRoot' in cfg:
    sys.exit('zip project.config.json must not set miniprogramRoot')
print('project files ok')
PY

mkdir -p "$OUT_DIR" "$STAGE/family-edu-miniprogram"
cp -a "$SRC"/. "$STAGE/family-edu-miniprogram/"
rm -rf "$STAGE/family-edu-miniprogram/.zion-mcp"
find "$STAGE" -name '.DS_Store' -delete

cat > "$STAGE/README.txt" <<'EOF'
Family education lecturer miniprogram

Import the extracted folder family-edu-miniprogram.
That folder must contain app.json and pages/.

Windows:
1. Download the zip. Do not open the zip as a WeChat project.
2. Right-click -> Extract All.
3. Open the extracted folder, then enter family-edu-miniprogram.
4. Confirm you can see app.json, then import that folder in WeChat DevTools.
5. AppID: wx0277d4abe92dd8a3
6. This package does not declare third-party plugins.
EOF

ZIP_PATH="$OUT_DIR/zhixue-wechat.zip"
rm -f "$ZIP_PATH" "$OUT_DIR/family-edu-miniprogram.zip"

python3 - "$STAGE" "$ZIP_PATH" <<'PY'
import os, sys, time, zipfile

root, dest = sys.argv[1], sys.argv[2]
now = time.localtime()[:6]

def add_file(zf, disk, arcname):
    info = zipfile.ZipInfo(arcname.replace('\\', '/'), now)
    info.create_system = 0
    info.create_version = 20
    info.extract_version = 20
    info.flag_bits = 0x800
    info.external_attr = 0o644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    with open(disk, 'rb') as fh:
        zf.writestr(info, fh.read())

def add_dir(zf, arcname):
    name = arcname.replace('\\', '/').rstrip('/') + '/'
    info = zipfile.ZipInfo(name, now)
    info.create_system = 0
    info.create_version = 20
    info.extract_version = 20
    info.flag_bits = 0x800
    info.external_attr = 0o755 << 16
    info.compress_type = zipfile.ZIP_STORED
    zf.writestr(info, b'')

with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=False) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        rel = os.path.relpath(dirpath, root)
        if rel != '.':
            add_dir(zf, rel)
        for name in filenames:
            disk = os.path.join(dirpath, name)
            if os.path.islink(disk) or not os.path.isfile(disk):
                continue
            arc = name if rel == '.' else os.path.join(rel, name)
            add_file(zf, disk, arc)

z = zipfile.ZipFile(dest)
bad = z.testzip()
if bad:
    sys.exit('corrupt member: ' + bad)
names = z.namelist()
if any(ord(ch) > 127 for n in names for ch in n):
    sys.exit('zip must use ASCII names only for Windows Explorer')
need = (
    'family-edu-miniprogram/app.json',
    'family-edu-miniprogram/project.config.json',
    'family-edu-miniprogram/pages/index/index.wxml',
    'family-edu-miniprogram/sitemap.json',
    'README.txt',
)
missing = [n for n in need if n not in names]
if missing:
    sys.exit('zip missing: ' + ', '.join(missing))
if 'app.json' in names:
    sys.exit('app.json must not sit at zip root')
print('ok', len(names), 'entries')
PY
cp -f "$ZIP_PATH" "$OUT_DIR/family-edu-miniprogram.zip"
