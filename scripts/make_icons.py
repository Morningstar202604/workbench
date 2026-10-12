"""从 logo-src.jpg 生成全套 Tauri 应用图标。

步骤：
1. 自动检测白色外框并裁剪到圆角徽标本体
2. 缩放为标准尺寸 PNG（32/128/128@2x/256 + icon.png 512）
3. 用多尺寸合成高质量 ICO（16/24/32/48/64/128/256）
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
SRC = ROOT / "logo-src.jpg"

# ICO 内包含的尺寸（Windows 推荐）
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

# Tauri tauri.conf.json 引用的 PNG
PNG_TARGETS = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "256x256.png": 256,
    "icon.png": 512,
}


def detect_content_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    """检测非白色画布区域，返回徽标本体的 bbox。"""
    gray = img.convert("L")
    # 亮于 245 视为白色画布
    mask = gray.point(lambda v: 255 if v < 245 else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("未检测到内容，源图可能全白")
    l, t, r, b = bbox
    pad = 4
    return (
        max(0, l - pad),
        max(0, t - pad),
        min(img.width, r + pad),
        min(img.height, b + pad),
    )


def square_crop(img: Image.Image) -> Image.Image:
    """中心方形裁剪。"""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"找不到源图 {SRC}")

    img = Image.open(SRC).convert("RGB")
    bbox = detect_content_bbox(img)
    logo = square_crop(img.crop(bbox))
    print(f"裁剪后尺寸: {logo.size}")

    ICONS.mkdir(parents=True, exist_ok=True)

    # 1) 生成各尺寸 PNG（LANCZOS 高质量缩放；Tauri include_image! 要求 RGBA）
    for name, size in PNG_TARGETS.items():
        logo.convert("RGBA").resize((size, size), Image.LANCZOS).save(ICONS / name, "PNG")
        print(f"  {name}: {size}x{size}")

    # 2) 合成多尺寸 ICO（PIL 内置 ICO 编码器）
    ico_path = ICONS / "icon.ico"
    logo.save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )
    print(f"  icon.ico: 包含 {ICO_SIZES} 共 {ico_path.stat().st_size} 字节")

    print("图标生成完成")


if __name__ == "__main__":
    main()
