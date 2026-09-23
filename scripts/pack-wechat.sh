#!/usr/bin/env bash
# Pack a Windows-importable WeChat zip: app.json must sit at the archive root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/miniprogram"
OUT_DIR="${1:-$ROOT/wechat-import}"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

test -f "$SRC/app.json"
test -f "$SRC/pages/index/index.wxml"

mkdir -p "$OUT_DIR" "$STAGE"
cp -a "$SRC"/. "$STAGE"/
rm -rf "$STAGE/.zion-mcp"
find "$STAGE" -name '.DS_Store' -delete

cat > "$STAGE/导入说明.txt" <<'EOF'
家庭教育讲师自学 · 微信小程序

微信开发者工具 2.02 会在你选中的目录里直接找 app.json。
请导入「能同时看到 app.json 和 pages 文件夹」的那一层。

Windows：
1. 右键 zip → 全部提取。不要把 zip 当成项目打开。
2. 解压后打开该文件夹，确认第一层就有 app.json。
3. 开发者工具 → 导入项目 → 选中这一层。
4. 如果看到 family-edu-miniprogram\family-edu-miniprogram\app.json，选里面那一层。
5. AppID：wx0277d4abe92dd8a3
EOF

ZIP_PATH="$OUT_DIR/family-edu-miniprogram.zip"
rm -f "$ZIP_PATH"
(
  cd "$STAGE"
  zip -r -q "$ZIP_PATH" .
)

python3 - <<PY
import zipfile, sys
z = zipfile.ZipFile("$OUT_DIR/family-edu-miniprogram.zip")
names = z.namelist()
need = ("app.json", "project.config.json", "pages/index/index.wxml", "sitemap.json")
missing = [n for n in need if n not in names]
if missing:
    sys.exit("zip root missing: " + ", ".join(missing))
nested = [n for n in names if n.startswith("family-edu-miniprogram/")]
if nested:
    sys.exit("zip is nested, Windows import will miss app.json")
print("ok", len(names), "entries, app.json at zip root")
PY
