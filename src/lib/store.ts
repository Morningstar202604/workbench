import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clearCostRecords,
  getCostOverview,
  getCostSettings,
  getCostTrend,
  getModelBreakdown,
  isTauri,
  listAiProcesses,
  listDevServers,
  listPorts,
  listProcesses,
  diskInfo,
  loadData,
  notify,
  opencodeSessions,
  opencodeSessionDetail,
  gitBranch,
  recentSessions,
  saveCostSettings,
  saveData,
  scanSessionCosts,
  systemInfo,
  terminateProcess,
} from "../lib/api";
import {
  demoAis,
  demoData,
  demoDevs,
  demoDisks,
  demoPorts,
  demoProcs,
  demoSessionFiles,
  demoSysinfo,
} from "../lib/demo";
import type {
  AiProcess,
  CostOverview,
  CostSettings,
  CostTrendRow,
  DevServer,
  DiskInfo,
  ModelBreakdownRow,
  OpencodeSession,
  PortEntry,
  ProcInfo,
  Project,
  SessionDetail,
  SessionFilePreview,
  SystemInfo,
  Task,
  ViewKey,
  WorkbenchData,
} from "../types";

const HISTORY_LEN = 60;
const TOAST_TTL_MS = 2600;
const SAVE_DEBOUNCE_MS = 300;

interface UiState {
  theme: "dark" | "light";
  refreshMs: number;
  view: ViewKey;
}

interface RuntimeState {
  procs: ProcInfo[];
  ports: PortEntry[];
  devs: DevServer[];
  ais: AiProcess[];
  sessions: OpencodeSession[];
  opencodePort: number;
  sessionsErr: string;
  sessionFiles: SessionFilePreview[];
  sessionDetail: SessionDetail | null;
  sessionDetailLoading: boolean;
  sysinfo: SystemInfo | null;
  disks: DiskInfo[];
  gitBranches: Record<string, string>;
  loading: boolean;
  lastRefreshAt: number;
  history: { cpu: number; memGb: number; t: number }[];
  // ── 成本计量 ──
  costOverview: CostOverview | null;
  costTrend: CostTrendRow[];
  costModelBreakdown: ModelBreakdownRow[];
  costSettings: CostSettings;
  costLoading: boolean;
  costNotified: boolean; // 是否已发过预算告警通知（避免重复打扰）
}

interface Store extends UiState, RuntimeState {
  data: WorkbenchData;
  toast: string;
  killTarget: ProcInfo | null;
  setView: (v: ViewKey) => void;
  setTheme: (t: "dark" | "light") => void;
  setRefreshMs: (ms: number) => void;
  setToast: (t: string) => void;
  clearToast: () => void;
  setKillTarget: (p: ProcInfo | null) => void;
  loadAll: () => Promise<void>;
  refreshRuntime: () => Promise<void>;
  refreshAi: () => Promise<void>;
  loadSessionDetail: (port: number, id: string) => Promise<void>;
  fetchGitBranch: (dir: string) => Promise<string>;
  killProcess: (pid: number) => Promise<void>;
  addTask: (t: Partial<Task>) => void;
  moveTask: (id: string, status: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addProject: (p: Partial<Project>) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  persistData: (next: WorkbenchData) => void;
  // ── 成本计量 ──
  loadCostOverview: () => Promise<void>;
  scanCosts: () => Promise<void>;
  loadCostSettings: () => Promise<void>;
  updateCostSettings: (s: CostSettings) => Promise<void>;
  clearCosts: () => Promise<void>;
  checkBudgetAlert: () => void;
}

const emptyData: WorkbenchData = { projects: [], tasks: [] };

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// 模块级防抖计时器（仅用于持久化，toast 由 TTL 自动清理）
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// 运行时刷新重入标记（同一时刻只允许一次快照采集在途）
let refreshing = false;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      theme: "dark",
      refreshMs: 3000,
      view: "overview",
      procs: [],
      ports: [],
      devs: [],
      ais: [],
      sessions: [],
      opencodePort: 4096,
      sessionsErr: "",
      sessionFiles: [],
      sessionDetail: null,
      sessionDetailLoading: false,
      sysinfo: null,
      disks: [],
      gitBranches: {},
      loading: false,
      lastRefreshAt: 0,
      history: [],
      costOverview: null,
      costTrend: [],
      costModelBreakdown: [],
      costSettings: { daily_budget: 5, monthly_budget: 50, alert_threshold_pct: 80, include_estimated: true },
      costLoading: false,
      costNotified: false,
      data: emptyData,
      toast: "",
      killTarget: null,

      setView: (v) => set({ view: v }),
      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.dataset.theme = t;
      },
      setRefreshMs: (ms) => set({ refreshMs: ms }),
      setToast: (t) => {
        set({ toast: t });
        setTimeout(() => {
          // 仅在 toast 未被新内容替换时才清除
          set((s) => (s.toast === t ? { toast: "" } : {}));
        }, TOAST_TTL_MS);
      },
      clearToast: () => set({ toast: "" }),
      setKillTarget: (p) => set({ killTarget: p }),

      loadAll: async () => {
        if (!isTauri()) {
          // 浏览器预览模式：注入静态演示数据，不发 IPC 请求
          const seed = [0, 1, 2].map((i) => ({
            cpu: Math.round(20 + i * 3),
            memGb: Math.round((12 + i * 0.4) * 100) / 100,
            t: Date.now() - (3 - i) * 3000,
          }));
          set({
            data: demoData,
            procs: demoProcs,
            ports: demoPorts,
            devs: demoDevs,
            ais: demoAis,
            sessionFiles: demoSessionFiles,
            sysinfo: demoSysinfo,
            disks: demoDisks,
            history: seed,
            loading: false,
            lastRefreshAt: Date.now(),
          });
          return;
        }
        try {
          const data = await loadData();
          set({ data: { ...emptyData, ...data } });
        } catch (e) {
          set({ toast: `读取本地数据失败: ${String(e)}` });
        }
        get().refreshRuntime();
        get().refreshAi();
      },

      refreshRuntime: async () => {
        if (!isTauri()) return;
        // 刷新重入保护：netstat + 进程快照耗时可超过最短刷新间隔（设置页有 1s 档），
        // 不加锁会让并发调用乱序覆盖数据，并丢掉 history 采样点。
        if (refreshing) return;
        refreshing = true;
        set({ loading: true });
        try {
          const [procs, ports, devs, ais, sys, dk] = await Promise.all([
            listProcesses(),
            listPorts(),
            listDevServers(),
            listAiProcesses(),
            systemInfo().catch(() => null),
            diskInfo().catch(() => []),
          ]);
          const cpuSum = procs.reduce((acc, p) => acc + (p.cpu ?? 0), 0);
          const memTotal = procs.reduce((acc, p) => acc + (p.memory ?? 0), 0);
          const point = {
            cpu: Math.round(cpuSum),
            memGb: Math.round((memTotal / 1024 ** 3) * 100) / 100,
            t: Date.now(),
          };
          // 用函数式 set 追加，避免与并发写入互相覆盖采样点
          const history = [...get().history.slice(-(HISTORY_LEN - 1)), point];
          set({
            procs,
            ports,
            devs,
            ais,
            sysinfo: sys,
            disks: dk,
            history,
            loading: false,
            lastRefreshAt: Date.now(),
          });
        } catch (e) {
          set({ loading: false, toast: `运行时数据刷新失败: ${String(e)}` });
        } finally {
          refreshing = false;
        }
      },

      refreshAi: async () => {
        if (!isTauri()) return;
        try {
          const [result, sessionFiles] = await Promise.all([
            opencodeSessions().catch((e) => {
              set({ sessionsErr: String(e) });
              return { port: get().opencodePort, sessions: [] as OpencodeSession[] };
            }),
            recentSessions().catch(() => [] as SessionFilePreview[]),
          ]);
          if (result.sessions.length) set({ sessionsErr: "" });
          set({ sessions: result.sessions, opencodePort: result.port, sessionFiles });
        } catch (e) {
          set({ sessionsErr: String(e) });
        }
      },

      loadSessionDetail: async (port, id) => {
        set({ sessionDetailLoading: true });
        try {
          const detail = await opencodeSessionDetail(port, id);
          set({ sessionDetail: detail, sessionDetailLoading: false });
        } catch (e) {
          set({
            sessionDetail: {
              id,
              title: "(获取失败)",
              message_count: 0,
              first_message: "",
              last_message: "",
              duration_seconds: 0,
              tools_used: [],
              error: String(e),
            },
            sessionDetailLoading: false,
          });
        }
      },

      fetchGitBranch: async (dir) => {
        const cached = get().gitBranches[dir];
        if (cached !== undefined) return cached;
        const branch = await gitBranch(dir).catch(() => "");
        set((s) => ({ gitBranches: { ...s.gitBranches, [dir]: branch } }));
        return branch;
      },

      killProcess: async (pid) => {
        try {
          await terminateProcess(pid);
          set({ toast: `已发送终止信号给进程 ${pid}`, killTarget: null });
          get().refreshRuntime();
        } catch (e) {
          set({ toast: `终止失败: ${String(e)}` });
        }
      },

      addTask: (t) => {
        const now = Math.floor(Date.now() / 1000);
        const task: Task = {
          id: uid(),
          title: t.title?.trim() || "未命名任务",
          status: t.status ?? "todo",
          priority: t.priority ?? "normal",
          due: t.due ?? null,
          project_id: t.project_id ?? null,
          tags: t.tags ?? [],
          created_at: now,
          updated_at: now,
        };
        get().persistData({ ...get().data, tasks: [task, ...get().data.tasks] });
      },

      moveTask: (id, status) => {
        get().updateTask(id, { status });
      },

      updateTask: (id, patch) => {
        const tasks = get().data.tasks.map((t) =>
          t.id === id ? { ...t, ...patch, updated_at: Math.floor(Date.now() / 1000) } : t
        );
        get().persistData({ ...get().data, tasks });
      },

      deleteTask: (id) => {
        get().persistData({ ...get().data, tasks: get().data.tasks.filter((t) => t.id !== id) });
      },

      addProject: (p) => {
        const project: Project = {
          id: uid(),
          name: p.name?.trim() || "未命名项目",
          path: p.path?.trim() ?? "",
          status: p.status ?? "active",
          tags: p.tags ?? [],
          pinned: p.pinned ?? false,
          note: p.note ?? "",
          created_at: Math.floor(Date.now() / 1000),
        };
        get().persistData({ ...get().data, projects: [project, ...get().data.projects] });
      },

      updateProject: (id, patch) => {
        const projects = get().data.projects.map((p) => (p.id === id ? { ...p, ...patch } : p));
        get().persistData({ ...get().data, projects });
      },

      deleteProject: (id) => {
        get().persistData({
          projects: get().data.projects.filter((p) => p.id !== id),
          tasks: get().data.tasks.map((t) =>
            t.project_id === id ? { ...t, project_id: null } : t
          ),
        });
      },

      persistData: (next) => {
        set({ data: next });
        if (!isTauri()) return; // 浏览器演示模式不持久化
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveData(next).catch((e) => set({ toast: `保存失败: ${String(e)}` }));
        }, SAVE_DEBOUNCE_MS);
      },

      // ── 成本计量 ──

      loadCostOverview: async () => {
        // 后端现在会把「数据文件损坏」等真实错误抛出来，不能再用 catch(()=>null) 吞掉，
        // 否则用户看到的是空白页而不是「账本读不了」。
        const errors: string[] = [];
        const track = <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
          p.catch((e) => {
            errors.push(`${label}: ${String(e)}`);
            return fallback;
          });

        const [overview, trend, breakdown, settings] = await Promise.all([
          track("成本总览", getCostOverview(), null),
          track("成本趋势", getCostTrend(14), [] as CostTrendRow[]),
          track("模型分解", getModelBreakdown(), [] as ModelBreakdownRow[]),
          track("成本设置", getCostSettings(), get().costSettings),
        ]);
        set({
          costOverview: overview,
          costTrend: trend,
          costModelBreakdown: breakdown,
          costSettings: settings,
        });
        if (errors.length) set({ toast: `成本数据读取失败（${errors[0]}）` });
      },

      scanCosts: async () => {
        set({ costLoading: true });
        try {
          const result = await scanSessionCosts();
          set({
            costOverview: result.overview,
            costTrend: result.trend,
            costModelBreakdown: result.model_breakdown,
            costLoading: false,
            toast: `已扫描 ${result.new_records} 条新成本记录`,
          });
          get().checkBudgetAlert();
        } catch (e) {
          set({ costLoading: false, toast: `成本扫描失败: ${String(e)}` });
        }
      },

      loadCostSettings: async () => {
        try {
          const s = await getCostSettings();
          set({ costSettings: s });
        } catch {
          /* 浏览器演示模式：保持默认设置 */
        }
      },

      updateCostSettings: async (s) => {
        set({ costSettings: s });
        try {
          await saveCostSettings(s);
          set({ toast: "成本设置已保存" });
        } catch (e) {
          set({ toast: `成本设置保存失败: ${String(e)}` });
          return;
        }
        // 重新计算概览以反映设置变更
        await get().loadCostOverview();
        get().checkBudgetAlert();
      },

      clearCosts: async () => {
        try {
          await clearCostRecords();
          set({ costOverview: null, costTrend: [], costModelBreakdown: [], costNotified: false, toast: "已清空成本数据" });
        } catch (e) {
          set({ toast: `清空成本数据失败: ${String(e)}` });
        }
      },

      checkBudgetAlert: () => {
        const o = get().costOverview;
        if (!o) return;
        const exceeded =
          (o.daily_budget > 0 && o.daily_pct >= o.alert_threshold_pct) ||
          (o.monthly_budget > 0 && o.monthly_pct >= o.alert_threshold_pct);
        if (exceeded && !get().costNotified) {
          set({ costNotified: true });
          notify(
            "工作台成本告警",
            `日 ${o.daily_pct.toFixed(0)}% / 月 ${o.monthly_pct.toFixed(0)}% 已超预算阈值 ${o.alert_threshold_pct}%`
          ).catch(() => {});
        }
        if (!exceeded) {
          set({ costNotified: false });
        }
      },
    }),
    {
      name: "workbench-ui-v1",
      // 显式版本 + migrate：以后改持久化结构时老用户数据才不会直接被反序列化成半截状态
      version: 1,
      partialize: (s) => ({ theme: s.theme, refreshMs: s.refreshMs }),
    }
  )
);
