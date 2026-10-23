/**
 * 主题分享链接：把一份主题压进 URL 的 `#theme=` 参数，对方打开即导入。
 *
 * 为什么是 URL hash 而不是文件：主题 JSON 已可导出，但「发个链接」比
 * 「传个文件再导入」门槛低一个量级——这是主题市场的最小形态，不需要后端。
 *
 * 安全口径与 JSON 导入完全一致（复用 parseTheme，fail-closed）：
 * hash 是不可信输入——base64url 解码、JSON.parse、字段校验任何一步失败
 * 都整体放弃，绝无「尽量修一修」；成功与否都把 hash 从地址栏清掉，
 * 保证一次性消费，刷新不会重复导入。
 */

import { parseTheme } from "./presets";
import type { ThemeInput } from "./tokens";

const PARAM = "theme";

/** ThemeInput → 紧凑 JSON → UTF-8 字节 → base64url（无 +/=，可直接进 URL）。 */
export function encodeTheme(t: ThemeInput): string {
  const json = JSON.stringify(t);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → UTF-8 → JSON → parseTheme。任何一步失败返回 null。 */
export function decodeTheme(s: string): ThemeInput | null {
  if (!s) return null;
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = std.length % 4 ? "=".repeat(4 - (std.length % 4)) : "";
  let bin: string;
  try {
    bin = atob(std + pad);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    return parseTheme(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** 当前主题的分享链接。base 缺省用当前页面（浏览器预览 / 托管的 dist）。 */
export function buildShareUrl(
  t: ThemeInput,
  base?: { origin: string; pathname: string }
): string {
  const origin = base?.origin ?? location.origin;
  const path = base?.pathname ?? location.pathname;
  return `${origin}${path}#${PARAM}=${encodeTheme(t)}`;
}

/**
 * 启动时消费一次 hash：有 `#theme=` 就解码返回主题，并把 hash 清掉。
 * 非法载荷同样清掉（坏链接不该留在地址栏里反复被解析）；
 * 与主题无关的 hash（未来可能的锚点）不碰。
 */
export function consumeThemeHash(): ThemeInput | null {
  if (typeof location === "undefined") return null;
  const hash = location.hash || "";
  const prefix = `#${PARAM}=`;
  if (!hash.startsWith(prefix)) return null;
  const payload = hash.slice(prefix.length);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* 清理失败不影响导入本身 */
  }
  return /^[A-Za-z0-9_-]+$/.test(payload) ? decodeTheme(payload) : null;
}
