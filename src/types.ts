export interface ProcInfo {
  pid: number;
  name: string;
  exe_path: string;
  cmd_line: string;
  cpu: number;
  memory: number;
  parent_pid: number | null;
  status: string;
  start_time: number;
}

export interface PortEntry {
  protocol: string;
  local_addr: string;
  local_port: number;
  remote_addr: string;
  state: string;
  pid: number;
}

export interface DevServer {
  port: number;
  protocol: string;
  pid: number;
  process_name: string;
  framework: string;
  project_dir: string | null;
  cmd_line: string;
  confidence: string;
}

export interface AiProcess {
  pid: number;
  name: string;
  exe_path: string;
  cmd_line: string;
  matched: string;
  memory: number;
  start_time: number;
}

export interface OpencodeSession {
  id: string;
  title: string;
  created: number;
  updated: number;
}

/** opencode 会话列表 + 实际命中的服务端口（详情请求需复用） */
export interface OpencodeSessionsResult {
  port: number;
  sessions: OpencodeSession[];
}

export interface SessionFile {
  tool: string;
  project: string;
  path: string;
  modified: number;
  size: number;
}

export interface SessionFilePreview extends SessionFile {
  message_count: number;
  first_line: string;
  last_line: string;
  human_preview: string;
}

export interface SessionDetail {
  id: string;
  title: string;
  message_count: number;
  first_message: string;
  last_message: string;
  duration_seconds: number;
  tools_used: string[];
  error: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  status: string;
  tags: string[];
  pinned: boolean;
  note: string;
  created_at: number;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due: string | null;
  project_id: string | null;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface WorkbenchData {
  projects: Project[];
  tasks: Task[];
}

export interface SystemInfo {
  hostname: string;
  os_name: string;
  cpu_cores: number;
  total_memory: number;
  uptime_seconds: number;
}

export interface DiskInfo {
  label: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  is_removable: boolean;
}

export type ViewKey =
  | "overview"
  | "processes"
  | "servers"
  | "ai"
  | "projects"
  | "tasks"
  | "settings"
  | "logs";

// ── 成本计量 ──────────────────────────────────────────────

/** 成本配置（预算 / 告警 / 计价偏好） */
export interface CostSettings {
  /** 日预算（USD），0 = 不设限 */
  daily_budget: number;
  /** 月预算（USD），0 = 不设限 */
  monthly_budget: number;
  /** 告警阈值百分比（80 = 80% 时告警） */
  alert_threshold_pct: number;
  /** 是否计入估算记录（cost_source=estimated） */
  include_estimated: boolean;
}

/** 成本总览聚合 */
export interface CostOverview {
  today_cost: number;
  today_input_tokens: number;
  today_output_tokens: number;
  today_cache_read_tokens: number;
  today_cache_creation_tokens: number;
  month_cost: number;
  month_input_tokens: number;
  month_output_tokens: number;
  month_cache_read_tokens: number;
  month_cache_creation_tokens: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  record_count: number;
  measured_count: number;
  estimated_count: number;
  zero_pricing_count: number;
  daily_budget: number;
  monthly_budget: number;
  alert_threshold_pct: number;
  daily_pct: number;
  monthly_pct: number;
  budget_exceeded: boolean;
}

/** 成本趋势行（按天聚合） */
export interface CostTrendRow {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost: number;
  record_count: number;
}

/** 模型分解行 */
export interface ModelBreakdownRow {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  record_count: number;
}

/** 扫描成本结果 */
export interface ScanCostResult {
  new_records: number;
  total_scanned: number;
  overview: CostOverview;
  trend: CostTrendRow[];
  model_breakdown: ModelBreakdownRow[];
}
