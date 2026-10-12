import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatCpu(cpu: number): string {
  return `${cpu.toFixed(1)}%`;
}

/** Unix 秒 → 友好的相对时间（如「3 分钟前」）。 */
export function fromNow(unixSecs: number): string {
  if (!unixSecs) return "-";
  return dayjs.unix(unixSecs).fromNow();
}

export function formatTime(ms: number): string {
  if (!ms) return "-";
  return dayjs(ms).format("MM-DD HH:mm");
}

export function dueLabel(due: string | null): {
  text: string;
  tone: "normal" | "warn" | "danger" | "muted";
} {
  if (!due) return { text: "无期限", tone: "muted" };
  const d = dayjs(due);
  if (!d.isValid()) return { text: due, tone: "normal" };
  const days = d.diff(dayjs(), "day");
  if (days < 0) return { text: `逾期 ${d.format("MM-DD")}`, tone: "danger" };
  if (days === 0) return { text: "今天", tone: "warn" };
  if (days <= 3) return { text: `${days} 天内`, tone: "warn" };
  return { text: d.format("MM-DD"), tone: "normal" };
}

export function shortPath(p: string | null | undefined, max = 60): string {
  if (!p) return "-";
  return p.length > max ? `…${p.slice(-max)}` : p;
}

/** 秒数 → 人性化运行时间 */
export function formatUptime(secs: number): string {
  if (!secs) return "-";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d} 天`);
  if (h) parts.push(`${h} 小时`);
  if (m && d === 0) parts.push(`${m} 分钟`);
  return parts.join(" ") || "不到 1 分钟";
}

/** 毫秒/秒 → 可读时长（2小时15分 / 45分钟 / 30秒）。 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "< 1 分钟";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}小时${m > 0 ? `${m}分` : ""}`;
  if (m > 0) return `${m}分钟${s > 0 ? `${s}秒` : ""}`;
  return `${s}秒`;
}

/** 美元格式化：< $0.01 显示 4 位，否则 2 位 */
export function formatUsd(n: number): string {
  if (n <= 0 || !isFinite(n)) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** Token 数格式化：1234567 → "1.23M"，890 → "890" */
export function formatTokens(n: number): string {
  if (n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
