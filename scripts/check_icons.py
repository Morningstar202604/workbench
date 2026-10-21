"""图标契约检查：所有对外可见的图标必须无白片、四角透明。

为什么需要它：图标由 make_icons.py 从白底 JPEG 生成。只要「抠白」这一步
出错（遮罩半径与徽标圆角不一致、阈值放宽、有人换了源图），深色界面上
就会重新出现一圈白边或整块白底 —— 这个回归不在任何单元测试或类型检查的
覆盖范围里，整页截图也看不出来。

这里检查三层：
1. 格式：RGBA
2. 四角：alpha ≈ 0（背景能透出）
3. 内容：不允许出现近白的不透明像素（白片/白边的直接证据）

只依赖 Pillow：CI 的 icon contract 步骤没有 numpy。
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
    ROOT / "src-tauri" / "icons" / "icon.png",
]

# 近白判定：三通道都 > 235。徽标本体是深蓝，不可能命中。
WHITE = 235
# 边缘环带宽度（占边长的比例）：白边通常正好落在这里
RING_RATIO = 0.03
# 低于此 alpha 的像素在深色底上不可见（有效亮度不足 1/4）
VISIBLE_ALPHA = 64


def corners_alpha(img: Image.Image) -> list[int]:
    w, h = img.size
    return [
        img.getpixel((0, 0))[3],
        img.getpixel((w - 1, 0))[3],
        img.getpixel((0, h - 1))[3],
        img.getpixel((w - 1, h - 1))[3],
    ]


def count_white(img: Image.Image, ring: int | None = None) -> tuple[int, int]:
    """返回 (近白可见像素数, 可见像素总数)；给定 ring 时只统计边缘环带。"""
    w, h = img.size
    px = img.load()
    white = visible = 0
    for y in range(h):
        in_ring_y = ring is not None and (y < ring or y >= h - ring)
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= VISIBLE_ALPHA:
                continue
            if ring is not None and not in_ring_y and ring <= x < w - ring:
                continue
            visible += 1
            if r > WHITE and g > WHITE and b > WHITE:
                white += 1
    return white, visible


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
        corners = corners_alpha(img)
        white, visible = count_white(img)
        ratio = white / max(visible, 1)
        ring = int(h * RING_RATIO) + 1
        white_ring, _ = count_white(img, ring=ring)

        if any(a > 8 for a in corners):
            print(f"FAIL {path.name}: 四角不透明 {corners}")
            failed = True
        elif ratio > 0.001:
            print(f"FAIL {path.name}: 出现白片 —— 近白占可见像素 {ratio:.2%}")
            failed = True
        elif white_ring > 0:
            print(f"FAIL {path.name}: 边缘 {ring}px 内有 {white_ring} 个近白像素（白边）")
            failed = True
        else:
            print(f"ok   {path.name}: {w}x{h} 四角alpha={corners} 近白={ratio:.3%}")

    if failed:
        print("\n图标检查未通过。运行 `python scripts/make_icons.py` 重新生成。")
        return 1
    print("\n所有图标均无白片、四角透明。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
