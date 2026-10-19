/**
 * 纯函数聚合层：把「页面里各写一遍的统计逻辑」集中到一处。
 *
 * 这些问题原先散落在 Overview / Processes / Servers / AiSessions 里各自实现，
 * 同一份分桶/计数逻辑有 2-4 个副本，改一处就会漏掉另一处。这里全部是无副作用
 * 的纯函数，可以直接单测，不需要 React 或 DOM。
 */
import type { DevServer, PortEntry, ProcInfo, SessionFilePreview } from "../types";

/** 通用分桶：给定边界表，把数值数量统计到第一个命中的桶。 */
export interface Bucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export function bucketize(
  values: number[],
  bins: { label: string; min: number; max: number }[]
): Bucket[] {
  const counts = bins.map(() => 0);
  for (const v of values) {
    const i = bins.findIndex((b) => v >= b.min && v < b.max);
    if (i >= 0) counts[i]++;
  }
  return bins.map((b, i) => ({ ...b, count: counts[i] }));
}

/** 进程 CPU 占比分桶（百分比，0-100）。 */
export const CPU_BINS = [
  { label: "0%", min: 0, max: 0.5 },
  { label: "<5%", min: 0.5, max: 5 },
  { label: "5-20%", min: 5, max: 20 },
  { label: "20-50%", min: 20, max: 50 },
  { label: "50%+", min: 50, max: Number.POSITIVE_INFINITY },
];

/** 进程内存分桶（MB）。 */
export const MEMORY_BINS = [
  { label: "<10MB", min: 0, max: 10 },
  { label: "10-50MB", min: 10, max: 50 },
  { label: "50-200MB", min: 50, max: 200 },
  { label: "200MB-1G", min: 200, max: 1024 },
  { label: "1GB+", min: 1024, max: Number.POSITIVE_INFINITY },
];

export function cpuHistogram(procs: ProcInfo[]): Bucket[] {
  return bucketize(
    procs.map((p) => p.cpu ?? 0),
    CPU_BINS
  );
}

export function memoryHistogram(procs: ProcInfo[]): Bucket[] {
  return bucketize(
    procs.map((p) => p.memory / 1024 / 1024),
    MEMORY_BINS
  );
}

/** TCP 端口的三档区间边界（与 IANA 注册分类一致）。 */
export const PORT_RANGE_BOUNDS = [
  { min: 1, max: 1023 },
  { min: 1024, max: 49151 },
  { min: 49152, max: 65535 },
];

export interface PortRange extends Bucket {
  /** 区间上限是否包含端点（最后一档包含 65535） */
  inclusiveMax?: boolean;
}

/**
 * 端口区间分布。`labels` 由调用方提供，便于按界面语言翻译；
 * 区间本身只认边界，不认展示文案。
 */
export function portDistribution(
  ports: Pick<PortEntry, "local_port">[],
  labels: string[]
): PortRange[] {
  const bins = PORT_RANGE_BOUNDS.map((b, i) => ({
    label: labels[i] ?? `${b.min}-${b.max}`,
    min: b.min,
    max: b.max + 1,
  }));
  const buckets = bucketize(
    ports.map((p) => p.local_port),
    bins
  );
  return buckets.map((b) => ({ ...b, max: b.max - 1 }));
}

/** 按字符串键计数，结果按数量降序。 */
export function countBy<T>(items: T[], keyOf: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 开发服务器框架分布。 */
export function frameworkDistribution(servers: DevServer[]): [string, number][] {
  return countBy(servers, (s) => s.framework);
}

/** 会话文件的工具分布。 */
export function toolDistribution(files: SessionFilePreview[]): [string, number][] {
  return countBy(files, (f) => f.tool);
}

/** 工具调用列表 → (工具名, 次数) 降序。 */
export function toolUsageDistribution(tools: string[]): [string, number][] {
  return countBy(tools, (tool) => tool);
}

/** 进程分类关键词。按 token 边界匹配，避免 "go" 命中 "google" 这类子串误判。 */
const BROWSER_TOKENS = [
  "chrome",
  "firefox",
  "edge",
  "msedge",
  "brave",
  "opera",
  "safari",
];

const DEV_TOKENS = [
  "node",
  "deno",
  "bun",
  "npm",
  "pnpm",
  "yarn",
  "webpack",
  "vite",
  "rustc",
  "cargo",
  "go",
  "java",
  "python",
  "vscode",
  "code",
  "jetbrains",
  "idea",
  "pycharm",
  "webstorm",
  "goland",
];

const AI_TOKENS = [
  "claude",
  "opencode",
  "copilot",
  "codex",
  "ollama",
  "continue",
  "tabnine",
  "cursor",
  "aider",
  "gemini",
  "windsurf",
  "qwen",
  "iflow",
  "cline",
  "roo",
];

const SYSTEM_TOKENS = [
  "system",
  "svchost",
  "lsass",
  "csrss",
  "services",
  "winlogon",
  "dwm",
  "registry",
  "smss",
  "taskhost",
  "spoolsv",
];

export type ProcessCategoryKey = "browser" | "dev" | "ai" | "system" | "other";

export interface ProcessCategory {
  key: ProcessCategoryKey;
  name: string;
  count: number;
  mem: number;
  color: string;
}

/** 非字母数字切 token，避免子串误判。 */
function tokenize(s: string): Set<string> {
  return new Set(s.split(/[^a-z0-9]+/).filter(Boolean));
}

function hasAny(tokens: Set<string>, list: string[]): boolean {
  for (const t of tokens) if (list.includes(t)) return true;
  return false;
}

const CATEGORY_COLORS: Record<ProcessCategoryKey, string> = {
  browser: "#22d3ee",
  dev: "#a78bfa",
  ai: "#fbbf24",
  system: "#34d399",
  other: "#64748b",
};

export function categorizeProcesses(
  procs: Pick<ProcInfo, "name" | "exe_path" | "memory">[],
  names: Record<ProcessCategoryKey, string>
): ProcessCategory[] {
  const acc: Record<ProcessCategoryKey, { count: number; mem: number }> = {
    browser: { count: 0, mem: 0 },
    dev: { count: 0, mem: 0 },
    ai: { count: 0, mem: 0 },
    system: { count: 0, mem: 0 },
    other: { count: 0, mem: 0 },
  };

  for (const p of procs) {
    const nameTokens = tokenize(p.name.toLowerCase());
    const allTokens = tokenize(`${p.name} ${p.exe_path}`.toLowerCase());
    const key: ProcessCategoryKey = hasAny(nameTokens, BROWSER_TOKENS)
      ? "browser"
      : hasAny(allTokens, AI_TOKENS)
        ? "ai"
        : hasAny(allTokens, DEV_TOKENS)
          ? "dev"
          : hasAny(nameTokens, SYSTEM_TOKENS)
            ? "system"
            : "other";
    acc[key].count++;
    acc[key].mem += p.memory;
  }

  return (Object.keys(acc) as ProcessCategoryKey[])
    .filter((key) => acc[key].count > 0)
    .map((key) => ({
      key,
      name: names[key],
      count: acc[key].count,
      mem: acc[key].mem,
      color: CATEGORY_COLORS[key],
    }));
}

/** 会话文件的消息总数。 */
export function totalMessageCount(files: SessionFilePreview[]): number {
  return files.reduce((acc, f) => acc + (f.message_count ?? 0), 0);
}

/** 判断项目目录是否正被开发服务器占用（精确前缀匹配，避免 shop-web 命中 shop-web-old）。 */
export function isProjectRunning(
  projectPath: string,
  runningDirs: (string | null | undefined)[]
): boolean {
  const target = normalizeDir(projectPath);
  if (!target) return false;
  return runningDirs.some((dir) => {
    const running = normalizeDir(dir);
    if (!running) return false;
    return running === target || running.startsWith(`${target}/`);
  });
}

function normalizeDir(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
