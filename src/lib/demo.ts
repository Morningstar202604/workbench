/**
 * 浏览器预览模式（非 Tauri）下的静态演示数据。
 * 仅在 window.__TAURI_INTERNALS__ 不存在时使用，让 UI 可以离线演示；
 * 桌面端永远走真实 IPC，不会读取这里。
 */
import type {
  AiProcess,
  DevServer,
  DiskInfo,
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
  { pid: 1234, name: "node.exe", exe_path: "C:\\nodejs\\node.exe", cmd_line: "node C:\\proj\\shop-web\\node_modules\\vite\\bin\\vite.js --port 5173", cpu: 8.4, memory: 420 * 1024 * 1024, parent_pid: 900, status: "运行中", start_time: nowSec() - 3600 },
  { pid: 2345, name: "claude.exe", exe_path: "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe", cmd_line: "claude", cpu: 2.1, memory: 180 * 1024 * 1024, parent_pid: null, status: "运行中", start_time: nowSec() - 7200 },
  { pid: 3456, name: "chrome.exe", exe_path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", cmd_line: "chrome --type=renderer", cpu: 12.6, memory: 980 * 1024 * 1024, parent_pid: 3000, status: "运行中", start_time: nowSec() - 86400 },
  { pid: 4567, name: "python.exe", exe_path: "C:\\Python312\\python.exe", cmd_line: "python -m uvicorn main:app --port 8000", cpu: 1.2, memory: 96 * 1024 * 1024, parent_pid: 4000, status: "运行中", start_time: nowSec() - 1800 },
];

export const demoPorts: PortEntry[] = [
  { protocol: "TCP", local_addr: "0.0.0.0", local_port: 5173, remote_addr: "0.0.0.0", state: "LISTENING", pid: 1234 },
  { protocol: "TCP", local_addr: "0.0.0.0", local_port: 8000, remote_addr: "0.0.0.0", state: "LISTENING", pid: 4567 },
  { protocol: "TCP", local_addr: "127.0.0.1", local_port: 4096, remote_addr: "0.0.0.0", state: "LISTENING", pid: 2345 },
];

export const demoDevs: DevServer[] = [
  { port: 5173, protocol: "TCP", pid: 1234, process_name: "node.exe", framework: "Vite", project_dir: "C:\\proj\\shop-web", cmd_line: "node vite.js --port 5173", confidence: "high" },
  { port: 8000, protocol: "TCP", pid: 4567, process_name: "python.exe", framework: "uvicorn (FastAPI/Starlette)", project_dir: null, cmd_line: "python -m uvicorn main:app --port 8000", confidence: "high" },
];

export const demoAis: AiProcess[] = [
  { pid: 2345, name: "claude.exe", exe_path: "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe", cmd_line: "claude", matched: "claude", memory: 180 * 1024 * 1024, start_time: nowSec() - 7200 },
];

export const demoSessionFiles: SessionFilePreview[] = [
  { tool: "Claude Code", project: "-proj-shop-web", path: "C:\\Users\\me\\.claude\\projects\\-proj-shop-web\\demo.jsonl", modified: nowSec() - 600, size: 245_000, message_count: 42, first_line: "帮我把登录页改成新设计稿", last_line: "已完成，测试通过", human_preview: "已完成，测试通过" },
];

export const demoSysinfo: SystemInfo = {
  hostname: "DEMO-PC",
  os_name: "Windows 11 (演示)",
  cpu_cores: 16,
  total_memory: 32 * 1024 ** 3,
  uptime_seconds: 3600 * 26,
};

export const demoDisks: DiskInfo[] = [
  { label: "C", mount_point: "C:\\", total_bytes: 512 * 1024 ** 3, available_bytes: 180 * 1024 ** 3, used_bytes: 332 * 1024 ** 3, is_removable: false },
  { label: "D", mount_point: "D:\\", total_bytes: 1024 * 1024 ** 3, available_bytes: 640 * 1024 ** 3, used_bytes: 384 * 1024 ** 3, is_removable: false },
];
