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

cat > "$STAGE/导入说明.txt" <<'EOF'
家庭教育讲师自学 · 微信小程序

请导入解压后的英文文件夹 family-edu-miniprogram。
这一层必须同时有 app.json 和 pages。

Windows：
1. 下载 zhixue-wechat.zip（不要下载后直接当项目打开）。
2. 右键 → 全部提取。
3. 打开解压目录，再进入 family-edu-miniprogram。
4. 确认能看到 app.json，再在微信开发者工具里「导入项目」选中这一层。
5. AppID：wx0277d4abe92dd8a3
6. 不要把 zip 当项目打开。选中能看到 app.json 的 family-edu-miniprogram 这一层。
7. 当前包未声明第三方插件，避免模拟器因「插件未授权」启动失败。
EOF

ZIP_PATH="$OUT_DIR/zhixue-wechat.zip"
rm -f "$ZIP_PATH" "$OUT_DIR/family-edu-miniprogram.zip"
(
  cd "$STAGE"
  zip -r -q "$ZIP_PATH" family-edu-miniprogram 导入说明.txt
)
cp -f "$ZIP_PATH" "$OUT_DIR/family-edu-miniprogram.zip"

python3 - <<PY
import zipfile, sys
z = zipfile.ZipFile("$ZIP_PATH")
names = z.namelist()
need = (
    "family-edu-miniprogram/app.json",
    "family-edu-miniprogram/project.config.json",
    "family-edu-miniprogram/pages/index/index.wxml",
    "family-edu-miniprogram/sitemap.json",
)
missing = [n for n in need if n not in names]
if missing:
    sys.exit("zip missing: " + ", ".join(missing))
if "app.json" in names:
    sys.exit("app.json must not sit at zip root; DevTools import needs the inner folder")
print("ok", len(names), "entries")
PY
