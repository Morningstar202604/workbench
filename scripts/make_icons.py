"""从 logo-src.jpg 生成全套 Tauri 应用图标。

关键约束：**不能留白片**。
源图是白底 JPEG，没有 alpha。早先的做法是「方形裁剪 + 圆角遮罩」，
遮罩半径按边长比例估算，和徽标自身的圆角不重合：圆角外侧那一圈
白画布仍被判为不透明，于是深色任务栏/侧栏上出现一圈白边。

现在的做法是按**亮度**求 alpha：白画布（亮度≈250）→ 0，
徽标本体（深蓝 <150）→ 1。再用 1px 腐蚀把 alpha 收进徽标内侧，
让边缘落在徽标本色上（否则边缘是白与深蓝的混合色，缩小后就是白晕）。
只依赖 Pillow，不引入 numpy —— CI 的 icon contract 只跑标准库 + Pillow。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
ICONS = ROOT / "src-tauri" / "icons"
# 文档 / OG 图等非交互场景用的那份
UI_LOGO = ROOT / "src" / "assets" / "logo.png"
SRC = HERE / "logo-src.jpg"

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

PNG_TARGETS = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "256x256.png": 256,
    "icon.png": 512,
}

# 源图实测：白画布亮度 250-254，徽标 0-150。
CANVAS_LUM = 244
FULL_LUM = 218


def cut_out_white(img: Image.Image) -> Image.Image:
    """白画布 → 透明，alpha 由亮度线性映射，边缘收进徽标 1px。"""
    lum = img.convert("L")
    span = CANVAS_LUM - FULL_LUM
    alpha = lum.point(lambda v: max(0, min(255, (CANVAS_LUM - v) * 255 // span)))
    # 3x3 最小值滤波：把半透明的白/蓝混合边收掉，只留实心徽标像素。
    # 源图 2048px，缩到 512 后这 1px 不可见，但能彻底消除白晕。
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def trim_to_content(img: Image.Image, pad_ratio: float = 0.02) -> Image.Image:
    """裁到不透明内容的外接框，再补成正方形（图标不能贴边）。"""
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox is None:
        raise SystemExit("裁剪失败：整张图为透明")
    l, t, r, b = bbox
    side = max(r - l, b - t)
    pad = int(side * pad_ratio)
    side += pad * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img.crop((l, t, r, b)), (pad, pad))
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"找不到源图 {SRC}")

    src = Image.open(SRC).convert("RGB")
    # 先砍掉四周大片白画布，减少无谓的逐像素运算（保留 8px 供 alpha 过渡）
    src = src.crop((300, 308, 1748, 1740))
    logo = trim_to_content(cut_out_white(src))
    print(f"抠图完成，尺寸 {logo.size}")

    ICONS.mkdir(parents=True, exist_ok=True)

    for name, size in PNG_TARGETS.items():
        logo.resize((size, size), Image.LANCZOS).save(ICONS / name, "PNG")
        print(f"  {name}: {size}x{size}")

    logo.resize((256, 256), Image.LANCZOS).save(UI_LOGO, "PNG")
    print(f"  UI logo: {UI_LOGO.relative_to(ROOT)} 256x256")

    logo.save(ICONS / "icon.ico", format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"  icon.ico: {ICO_SIZES}")

    print("图标生成完成")


if __name__ == "__main__":
    main()
