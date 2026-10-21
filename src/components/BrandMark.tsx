import { useId } from "react";

/**
 * 品牌字形（纯矢量，无底板）。
 *
 * 设计约束：侧栏 / Hero / 文档里必须「直接贴上去」——背景与周围完全一致。
 * 所以这里只有笔画本身：没有圆角方块、没有底色、没有阴影贴片。
 * 需要层次时用 drop-shadow 发光（光，不是面），换主题时随 currentColor 走。
 *
 * 几何来自 logo-src.jpg 的实测描摹：顶横 + W 四笔，线宽 5.5/100，
 * 端点全圆角，比例与原图一致。
 */
export function BrandMark({
  className = "",
  strokeWidth = 5.5,
  gradient = false,
  title,
}: {
  className?: string;
  strokeWidth?: number;
  gradient?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const stroke = gradient ? `url(#wb-mark-${uid})` : "currentColor";
  return (
    <svg
      viewBox="0 0 100 88"
      className={className}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {gradient && (
        <defs>
          <linearGradient id={`wb-mark-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7BF3FF" />
            <stop offset="0.55" stopColor="#22D3EE" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
      )}
      <path d="M3 3H97" />
      <path d="M10.8 12.7 29.7 85.5 43.4 47.8" />
      <path d="M50.1 12.7V46.8" />
      <path d="M89.2 12.7 69.4 85.5 56.7 47.8" />
    </svg>
  );
}
