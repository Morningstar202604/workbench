/**
 * 浏览器预览模式（非 Tauri）下的静态演示数据。
 * 仅在 window.__TAURI_INTERNALS__ 不存在时使用，让 UI 可以离线演示；
 * 桌面端永远走真实 IPC，不会读取这里。
 */
import type {
  AiProcess,
  CostOverview,
  CostTrendRow,
  DevServer,
  DiskInfo,
  ModelBreakdownRow,
  PortEntry,
  ProcInfo,
  SessionFilePreview,
  SystemInfo,
  WorkbenchData,
} from "../types";

const nowSec = () => Math.floor(Date.now() / 1000);

export const demoData: WorkbenchData = {
  projects: [
    {
      id: "demo-p1",
      name: "商城前端重构",
      path: "C:\\proj\\shop-web",
      status: "active",
      tags: ["前端", "v2"],
      pinned: true,
      note: "演示项目",
      created_at: nowSec() - 86400 * 7,
    },
    {
      id: "demo-p2",
      name: "数据中台 API",
      path: "C:\\proj\\data-api",
      status: "paused",
      tags: ["后端"],
      pinned: false,
      note: "",
      created_at: nowSec() - 86400 * 30,
    },
  ],
  tasks: [
    {
      id: "demo-t1",
      title: "登录页改版（演示）",
      status: "doing",
      priority: "high",
      due: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      project_id: "demo-p1",
      tags: [],
      created_at: nowSec() - 3600,
      updated_at: nowSec(),
    },
    {
      id: "demo-t2",
      title: "接口压测（演示）",
      status: "todo",
      priority: "normal",
      due: null,
      project_id: "demo-p2",
      tags: ["测试"],
      created_at: nowSec() - 7200,
      updated_at: nowSec() - 7200,
    },
    {
      id: "demo-t3",
      title: "组件库升级（演示）",
      status: "done",
      priority: "low",
      due: null,
      project_id: null,
      tags: [],
      created_at: nowSec() - 86400,
      updated_at: nowSec() - 3600,
    },
  ],
};

export const demoProcs: ProcInfo[] = [
  {
    pid: 1234,
    name: "node.exe",
    exe_path: "C:\\nodejs\\node.exe",
    cmd_line: "node C:\\proj\\shop-web\\node_modules\\vite\\bin\\vite.js --port 5173",
    cpu: 8.4,
    memory: 420 * 1024 * 1024,
    parent_pid: 900,
    status: "运行中",
    start_time: nowSec() - 3600,
  },
  {
    pid: 2345,
    name: "claude.exe",
    exe_path: "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe",
    cmd_line: "claude",
    cpu: 2.1,
    memory: 180 * 1024 * 1024,
    parent_pid: null,
    status: "运行中",
    start_time: nowSec() - 7200,
  },
  {
    pid: 3456,
    name: "chrome.exe",
    exe_path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    cmd_line: "chrome --type=renderer",
    cpu: 12.6,
    memory: 980 * 1024 * 1024,
    parent_pid: 3000,
    status: "运行中",
    start_time: nowSec() - 86400,
  },
  {
    pid: 4567,
    name: "python.exe",
    exe_path: "C:\\Python312\\python.exe",
    cmd_line: "python -m uvicorn main:app --port 8000",
    cpu: 1.2,
    memory: 96 * 1024 * 1024,
    parent_pid: 4000,
    status: "运行中",
    start_time: nowSec() - 1800,
  },
];

export const demoPorts: PortEntry[] = [
  {
    protocol: "TCP",
    local_addr: "0.0.0.0",
    local_port: 5173,
    remote_addr: "0.0.0.0",
    state: "LISTENING",
    pid: 1234,
  },
  {
    protocol: "TCP",
    local_addr: "0.0.0.0",
    local_port: 8000,
    remote_addr: "0.0.0.0",
    state: "LISTENING",
    pid: 4567,
  },
  {
    protocol: "TCP",
    local_addr: "127.0.0.1",
    local_port: 4096,
    remote_addr: "0.0.0.0",
    state: "LISTENING",
    pid: 2345,
  },
];

export const demoDevs: DevServer[] = [
  {
    port: 5173,
    protocol: "TCP",
    pid: 1234,
    process_name: "node.exe",
    framework: "Vite",
    project_dir: "C:\\proj\\shop-web",
    cmd_line: "node vite.js --port 5173",
    confidence: "high",
  },
  {
    port: 8000,
    protocol: "TCP",
    pid: 4567,
    process_name: "python.exe",
    framework: "uvicorn (FastAPI/Starlette)",
    project_dir: null,
    cmd_line: "python -m uvicorn main:app --port 8000",
    confidence: "high",
  },
];

export const demoAis: AiProcess[] = [
  {
    pid: 2345,
    name: "claude.exe",
    exe_path: "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe",
    cmd_line: "claude",
    matched: "claude",
    memory: 180 * 1024 * 1024,
    start_time: nowSec() - 7200,
  },
];

export const demoSessionFiles: SessionFilePreview[] = [
  {
    tool: "Claude Code",
    project: "-proj-shop-web",
    path: "C:\\Users\\me\\.claude\\projects\\-proj-shop-web\\demo.jsonl",
    modified: nowSec() - 600,
    size: 245_000,
    message_count: 42,
    first_line: "帮我把登录页改成新设计稿",
    last_line: "已完成，测试通过",
    human_preview: "已完成，测试通过",
  },
];

export const demoSysinfo: SystemInfo = {
  hostname: "DEMO-PC",
  os_name: "Windows 11 (演示)",
  cpu_cores: 16,
  total_memory: 32 * 1024 ** 3,
  uptime_seconds: 3600 * 26,
};

export const demoDisks: DiskInfo[] = [
  {
    label: "C",
    mount_point: "C:\\",
    total_bytes: 512 * 1024 ** 3,
    available_bytes: 180 * 1024 ** 3,
    used_bytes: 332 * 1024 ** 3,
    is_removable: false,
  },
  {
    label: "D",
    mount_point: "D:\\",
    total_bytes: 1024 * 1024 ** 3,
    available_bytes: 640 * 1024 ** 3,
    used_bytes: 384 * 1024 ** 3,
    is_removable: false,
  },
];

// ── 成本计量（演示）────────────────────────────────────────
// 数字均为构造值，不代表任何真实账户消费。

export const demoCostOverview: CostOverview = {
  today_cost: 1.284,
  today_input_tokens: 412_000,
  today_output_tokens: 96_500,
  today_cache_read_tokens: 1_820_000,
  today_cache_creation_tokens: 240_000,
  month_cost: 18.63,
  month_input_tokens: 5_640_000,
  month_output_tokens: 1_280_000,
  month_cache_read_tokens: 24_100_000,
  month_cache_creation_tokens: 3_150_000,
  total_cost: 47.91,
  total_input_tokens: 14_200_000,
  total_output_tokens: 3_460_000,
  total_cache_read_tokens: 61_500_000,
  total_cache_creation_tokens: 8_020_000,
  record_count: 386,
  measured_count: 352,
  estimated_count: 26,
  zero_pricing_count: 8,
  daily_budget: 5,
  monthly_budget: 50,
  alert_threshold_pct: 80,
  daily_pct: 25.68,
  monthly_pct: 37.26,
  budget_exceeded: false,
};

/** 近 14 天趋势（构造值，形状贴近真实扫描结果）。 */
export const demoCostTrend: CostTrendRow[] = [
  {
    day: "09-29",
    input_tokens: 320_000,
    output_tokens: 78_000,
    cache_read_tokens: 1_100_000,
    cache_creation_tokens: 160_000,
    cost: 0.912,
    record_count: 18,
  },
  {
    day: "09-30",
    input_tokens: 410_000,
    output_tokens: 96_000,
    cache_read_tokens: 1_540_000,
    cache_creation_tokens: 210_000,
    cost: 1.176,
    record_count: 22,
  },
  {
    day: "10-01",
    input_tokens: 268_000,
    output_tokens: 61_000,
    cache_read_tokens: 980_000,
    cache_creation_tokens: 130_000,
    cost: 0.744,
    record_count: 15,
  },
  {
    day: "10-02",
    input_tokens: 512_000,
    output_tokens: 124_000,
    cache_read_tokens: 2_050_000,
    cache_creation_tokens: 280_000,
    cost: 1.462,
    record_count: 27,
  },
  {
    day: "10-03",
    input_tokens: 148_000,
    output_tokens: 36_000,
    cache_read_tokens: 520_000,
    cache_creation_tokens: 74_000,
    cost: 0.418,
    record_count: 9,
  },
  {
    day: "10-04",
    input_tokens: 96_000,
    output_tokens: 22_000,
    cache_read_tokens: 340_000,
    cache_creation_tokens: 48_000,
    cost: 0.271,
    record_count: 6,
  },
  {
    day: "10-05",
    input_tokens: 382_000,
    output_tokens: 91_000,
    cache_read_tokens: 1_420_000,
    cache_creation_tokens: 195_000,
    cost: 1.084,
    record_count: 21,
  },
  {
    day: "10-06",
    input_tokens: 466_000,
    output_tokens: 112_000,
    cache_read_tokens: 1_780_000,
    cache_creation_tokens: 245_000,
    cost: 1.328,
    record_count: 25,
  },
  {
    day: "10-07",
    input_tokens: 398_000,
    output_tokens: 95_000,
    cache_read_tokens: 1_460_000,
    cache_creation_tokens: 198_000,
    cost: 1.132,
    record_count: 19,
  },
  {
    day: "10-08",
    input_tokens: 524_000,
    output_tokens: 128_000,
    cache_read_tokens: 2_140_000,
    cache_creation_tokens: 292_000,
    cost: 1.504,
    record_count: 28,
  },
  {
    day: "10-09",
    input_tokens: 442_000,
    output_tokens: 104_000,
    cache_read_tokens: 1_690_000,
    cache_creation_tokens: 228_000,
    cost: 1.248,
    record_count: 23,
  },
  {
    day: "10-10",
    input_tokens: 356_000,
    output_tokens: 84_000,
    cache_read_tokens: 1_320_000,
    cache_creation_tokens: 178_000,
    cost: 1.006,
    record_count: 17,
  },
  {
    day: "10-11",
    input_tokens: 448_000,
    output_tokens: 108_000,
    cache_read_tokens: 1_720_000,
    cache_creation_tokens: 232_000,
    cost: 1.268,
    record_count: 24,
  },
  {
    day: "10-12",
    input_tokens: 412_000,
    output_tokens: 96_500,
    cache_read_tokens: 1_820_000,
    cache_creation_tokens: 240_000,
    cost: 1.284,
    record_count: 20,
  },
];

/** 按模型分解（构造值）。 */
export const demoCostModelBreakdown: ModelBreakdownRow[] = [
  {
    model: "claude-sonnet-4-5",
    input_tokens: 8_640_000,
    output_tokens: 2_180_000,
    cost: 28.42,
    record_count: 214,
  },
  {
    model: "claude-opus-4-1",
    input_tokens: 2_120_000,
    output_tokens: 640_000,
    cost: 12.86,
    record_count: 58,
  },
  {
    model: "claude-haiku-4-5",
    input_tokens: 3_040_000,
    output_tokens: 520_000,
    cost: 5.13,
    record_count: 96,
  },
  {
    model: "gpt-5-codex",
    input_tokens: 400_000,
    output_tokens: 120_000,
    cost: 1.5,
    record_count: 18,
  },
];
