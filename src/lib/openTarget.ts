/**
 * 打开目标（URL / 本地目录）的分类纯函数。
 *
 * 独立成模块的原因：这段判定曾经写死在 api.ts 的 openExternal 里，
 * 用 `/^[a-z][a-z0-9+.-]*:/` 判 scheme，结果把 `C:\proj`、`C:/proj`
 * 这类 Windows 盘符路径也当成 scheme 拒绝，项目页和服务器页的「打开目录」
 * 全部失效（且是未处理的 Promise rejection，界面上毫无反应）。判定逻辑
 * 必须有单测覆盖各种路径形态。
 */

export type OpenTarget =
  /** http/https，交给系统浏览器 */
  | { kind: "http"; value: string }
  /** 其它 scheme（file:、ms-msdt: 等）：一律拒绝，不让系统默认处理器接管 */
  | { kind: "unsupported"; scheme: string }
  /** 本地路径，必须经过后端白名单校验 */
  | { kind: "path"; value: string }
  | { kind: "empty" };

/**
 * 是否为「真正的 URL scheme」而不是 Windows 盘符路径。
 *
 * `C:\proj` / `C:/proj` / 裸 `C:` / UNC `\\server\share` 都是路径。
 * 真正的 scheme 至少两个字符（`http:`、`mailto:`、`ms-msdt:`）。
 */
export function isUrlScheme(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false; // C:\ 或 C:/
  if (/^[a-zA-Z]:$/.test(value)) return false; // 裸盘符 C:
  if (/^\\\\|^\/\//.test(value)) return false; // UNC \\server\share 与 //server/share
  return /^[a-z][a-z0-9+.-]+:/i.test(value);
}

export function classifyOpenTarget(raw: string): OpenTarget {
  const value = raw.trim();
  if (!value) return { kind: "empty" };
  if (/^https?:\/\//i.test(value)) return { kind: "http", value };
  if (isUrlScheme(value)) {
    return { kind: "unsupported", scheme: value.split(":")[0] };
  }
  return { kind: "path", value };
}
