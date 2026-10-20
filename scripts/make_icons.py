"""从 logo-src.jpg 生成全套 Tauri 应用图标。

步骤：
1. 自动检测白色外框并裁剪到圆角徽标本体
2. **把徽标圆角外的白色画布抠成透明**（源图是 JPEG，没有 alpha；
   不抠的话，深色界面上每个图标都会带一圈白方块）
3. 缩放为标准尺寸 PNG（32/128/128@2x/256 + icon.png 512）
4. 用多尺寸合成高质量 ICO（16/24/32/48/64/128/256）
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
ICONS = ROOT / "src-tauri" / "icons"
# 界面里 <img src> 用的那份（侧栏 / Hero 横幅），必须与安装图标同源，
# 否则会出现「应用图标是圆角透明、界面里却是一圈白底」的不一致。
UI_LOGO = ROOT / "src" / "assets" / "logo.png"
SRC = HERE / "logo-src.jpg"

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


def rounded_alpha(img: Image.Image, radius_ratio: float = 0.225) -> Image.Image:
    """把方形图裁成圆角矩形，角外透明。

    源图是 JPEG：徽标本身画在白色画布上，圆角外没有 alpha 通道。
    直接转 RGBA 只会得到一个"白色不透明"的方角图标 —— 放在深色侧栏里
    就是一圈刺眼的白底。这里按统一半径做圆角遮罩。

    radius_ratio 取 0.225：源图的圆角约为边长的 22.5%，与 macOS/iOS
    图标规范接近，也让 32px 的小尺寸仍然看得出圆角。
    """
    size = img.size[0]
    radius = max(1, round(size * radius_ratio))
    # 4x 超采样再缩小，边缘抗锯齿更干净
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, size * scale - 1, size * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    mask = mask.resize((size, size), Image.LANCZOS)
    # 轻微羽化，避免深色底上出现硬边锯齿
    mask = mask.filter(ImageFilter.GaussianBlur(radius=size / 512))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"找不到源图 {SRC}")

    img = Image.open(SRC).convert("RGB")
    bbox = detect_content_bbox(img)
    logo = square_crop(img.crop(bbox))
    print(f"裁剪后尺寸: {logo.size}")
    # 关键：抠成圆角透明，否则深色界面上是一圈白方块
    logo = rounded_alpha(logo)
    print("已应用圆角透明遮罩")

    ICONS.mkdir(parents=True, exist_ok=True)

    # 1) 生成各尺寸 PNG（LANCZOS 高质量缩放；Tauri include_image! 要求 RGBA）
    for name, size in PNG_TARGETS.items():
        logo.resize((size, size), Image.LANCZOS).save(ICONS / name, "PNG")
        print(f"  {name}: {size}x{size}")

    # UI 里用的那份（与 128@2x 同尺寸，256px 足够 2x 屏幕）
    logo.resize((256, 256), Image.LANCZOS).save(UI_LOGO, "PNG")
    print(f"  UI logo: {UI_LOGO.relative_to(ROOT)} 256x256")

    # 2) 合成多尺寸 ICO（PIL 内置 ICO 编码器）
    # ICO 也保留 alpha：Windows 任务栏是深色时白底同样明显
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
