import { invoke } from "@tauri-apps/api/core";
import type {
  AiProcess,
  CostOverview,
  CostSettings,
  CostTrendRow,
  DevServer,
  DiskInfo,
  ModelBreakdownRow,
  OpencodeSessionsResult,
  PortEntry,
  ProcInfo,
  ScanCostResult,
  SessionDetail,
  SessionFilePreview,
  SystemInfo,
  WorkbenchData,
} from "../types";

/** 是否运行在 Tauri 桌面壳内 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function listProcesses(): Promise<ProcInfo[]> {
  return invoke<ProcInfo[]>("list_processes");
}

export async function terminateProcess(pid: number): Promise<void> {
  return invoke("terminate_process", { pid });
}

export async function listPorts(): Promise<PortEntry[]> {
  return invoke<PortEntry[]>("list_ports");
}

export async function listDevServers(): Promise<DevServer[]> {
  return invoke<DevServer[]>("list_dev_servers");
}

export async function listAiProcesses(): Promise<AiProcess[]> {
  return invoke<AiProcess[]>("list_ai_processes");
}

export async function opencodeSessions(): Promise<OpencodeSessionsResult> {
  return invoke<OpencodeSessionsResult>("opencode_sessions");
}

export async function recentSessions(): Promise<SessionFilePreview[]> {
  return invoke<SessionFilePreview[]>("recent_sessions_preview");
}

export async function opencodeSessionDetail(
  port: number,
  sessionId: string
): Promise<SessionDetail> {
  return invoke<SessionDetail>("opencode_session_detail", { port, sessionId });
}

export async function gitBranch(dir: string): Promise<string> {
  return invoke<string>("git_branch", { dir });
}

/** 切换主窗口置顶。 */
export async function setAlwaysOnTop(on: boolean): Promise<void> {
  return invoke("set_always_on_top", { on });
}

export async function systemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("system_info");
}

export async function diskInfo(): Promise<DiskInfo[]> {
  return invoke<DiskInfo[]>("disk_info");
}

export async function loadData(): Promise<WorkbenchData> {
  return invoke<WorkbenchData>("load_data");
}

export async function saveData(data: WorkbenchData): Promise<void> {
  return invoke("save_data", { data });
}

/** 用系统默认方式打开 URL / 目录。
 * URL 走 opener 插件；目录必须经后端 `open_known_path` 白名单校验，
 * 因此 capabilities 里不再给 WebView 直接的 allow-open-path 权限。 */
export async function openExternal(target: string): Promise<void> {
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
  if (!isTauri()) {
    if (isUrl) window.open(target, "_blank", "noopener");
    return;
  }
  if (isUrl) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(target);
    return;
  }
  await invoke("open_known_path", { path: target });
}

// ── 系统通知 ──────────────────────────────────────────────

/** 发送系统通知（桌面端原生通知，浏览器端尝试 Notification API）。 */
export async function notify(title: string, body: string): Promise<void> {
  if (isTauri()) {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
  } else if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    new Notification(title, { body });
  }
}

// ── 日志读取 ──────────────────────────────────────────────

export async function readLogs(maxLines: number): Promise<string> {
  return invoke<string>("read_logs", { maxLines });
}

export async function clearLogs(): Promise<void> {
  await invoke("clear_logs");
}

// ── 成本计量 ──────────────────────────────────────────────

/** 扫描 session 文件 → 提取 usage → 计算成本 → 持久化 */
export async function scanSessionCosts(): Promise<ScanCostResult> {
  return invoke<ScanCostResult>("scan_session_costs");
}

/** 获取成本总览（不重新扫描） */
export async function getCostOverview(): Promise<CostOverview> {
  return invoke<CostOverview>("get_cost_overview");
}

/** 获取成本趋势 */
export async function getCostTrend(days: number = 14): Promise<CostTrendRow[]> {
  return invoke<CostTrendRow[]>("get_cost_trend", { days });
}

/** 按模型分解成本 */
export async function getModelBreakdown(): Promise<ModelBreakdownRow[]> {
  return invoke<ModelBreakdownRow[]>("get_model_breakdown");
}

/** 获取成本设置 */
export async function getCostSettings(): Promise<CostSettings> {
  return invoke<CostSettings>("get_cost_settings_cmd");
}

/** 保存成本设置 */
export async function saveCostSettings(settings: CostSettings): Promise<void> {
  return invoke("save_cost_settings_cmd", { settings });
}

/** 清空全部成本记录 */
export async function clearCostRecords(): Promise<void> {
  return invoke("clear_cost_records");
}
