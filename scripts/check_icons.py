"""图标契约检查：所有对外可见的图标必须带透明圆角。

为什么需要它：图标由 make_icons.py 从 JPEG 生成，源图是白底无 alpha。
一旦有人改了生成脚本或换了源图却忘了抠圆角，深色界面上就会出现
一圈白方块 —— 这个回归不在任何单元测试或类型检查的覆盖范围里。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    ROOT / "src" / "assets" / "logo.png",
    ROOT / "src-tauri" / "icons" / "32x32.png",
    ROOT / "src-tauri" / "icons" / "128x128.png",
    ROOT / "src-tauri" / "icons" / "128x128@2x.png",
    ROOT / "src-tauri" / "icons" / "256x256.png",
]


def main() -> int:
    failed = False
    for path in TARGETS:
        if not path.exists():
            print(f"FAIL 缺少文件: {path}")
            failed = True
            continue
        img = Image.open(path)
        if img.mode != "RGBA":
            print(f"FAIL {path.name}: 模式是 {img.mode}，应为 RGBA")
            failed = True
            continue
        img = img.convert("RGBA")
        w, h = img.size
        corners = [
            img.getpixel((0, 0)),
            img.getpixel((w - 1, 0)),
            img.getpixel((0, h - 1)),
            img.getpixel((w - 1, h - 1)),
        ]
        alphas = [c[3] for c in corners]
        center = img.getpixel((w // 2, h // 2))[3]
        if any(a > 8 for a in alphas):
            print(f"FAIL {path.name}: 四角不透明 {alphas}（深色界面上会显示白底）")
            failed = True
        elif center < 240:
            print(f"FAIL {path.name}: 中心几乎透明，图标内容缺失")
            failed = True
        else:
            print(f"ok   {path.name}: {w}x{h} 四角 alpha={alphas}")

    if failed:
        print("\n图标检查未通过。运行 `python scripts/make_icons.py` 重新生成。")
        return 1
    print("\n所有图标均为透明圆角。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
