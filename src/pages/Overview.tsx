import { useMemo } from "react";
import { EChart, chartGapColor, chartLineColor } from "../lib/echarts";
import {
  Activity,
  Cpu,
  Server,
  Sparkles,
  HardDrive,
  Clock,
  Inbox,
  Monitor,
  Network,
} from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { Badge, Card, Empty, SectionTitle, StatCard, Table, Td, Tr } from "../ui";
import { formatBytes, formatCpu, formatUptime, dueLabel, shortPath } from "../lib/util";
import logoUrl from "../assets/logo.png";

// ─── 进程分类 ─────────────────────────────────────────────

interface Category {
  name: string;
  count: number;
  mem: number;
  color: string;
}

const BROWSER_TOKENS = ["chrome", "firefox", "edge", "msedge", "brave", "opera", "safari"];
const DEV_TOKENS = ["node", "deno", "bun", "npm", "pnpm", "yarn", "webpack", "vite", "rustc", "cargo", "go", "java", "python", "vscode", "code", "jetbrains", "idea", "pycharm", "webstorm", "goland"];
const AI_TOKENS = ["claude", "opencode", "copilot", "codex", "ollama", "continue", "tabnine", "cursor", "aider", "gemini", "windsurf", "qwen", "iflow", "cline", "roo"];
const SYSTEM_TOKENS = ["system", "svchost", "lsass", "csrss", "services", "winlogon", "dwm", "registry", "smss", "taskhost", "spoolsv"];

/** 按非字母数字切 token，避免 "go" 命中 "google"、"amp" 命中 "sample" 这类子串误判。 */
function tokenize(s: string): Set<string> {
  return new Set(s.split(/[^a-z0-9]+/).filter(Boolean));
}

function hasAny(tokens: Set<string>, list: string[]): boolean {
  for (const t of tokens) if (list.includes(t)) return true;
  return false;
}

function categorizeProcs(
  procs: { name: string; exe_path: string; memory: number }[]
): Category[] {
  const cats: Record<string, Category> = {
    浏览器: { name: "浏览器", count: 0, mem: 0, color: "#22d3ee" },
    开发工具: { name: "开发工具", count: 0, mem: 0, color: "#a78bfa" },
    AI工具: { name: "AI 工具", count: 0, mem: 0, color: "#fbbf24" },
    系统: { name: "系统", count: 0, mem: 0, color: "#34d399" },
    其他: { name: "其他", count: 0, mem: 0, color: "#64748b" },
  };
  for (const p of procs) {
    const nameTokens = tokenize(p.name.toLowerCase());
    const allTokens = tokenize(`${p.name} ${p.exe_path}`.toLowerCase());
    const cat = hasAny(nameTokens, BROWSER_TOKENS)
      ? "浏览器"
      : hasAny(allTokens, AI_TOKENS)
      ? "AI工具"
      : hasAny(allTokens, DEV_TOKENS)
      ? "开发工具"
      : hasAny(nameTokens, SYSTEM_TOKENS)
      ? "系统"
      : "其他";
    cats[cat].count++;
    cats[cat].mem += p.memory;
  }
  return Object.values(cats).filter((c) => c.count > 0);
}

// ─── 端口分布 ─────────────────────────────────────────────

interface PortRange {
  range: string;
  count: number;
}

function portDistribution(ports: { local_port: number }[]): PortRange[] {
  const bins = [
    { range: "0-1023", min: 0, max: 1023, count: 0 },
    { range: "1024-49151", min: 1024, max: 49151, count: 0 },
    { range: "49152+", min: 49152, max: 65535, count: 0 },
  ];
  for (const p of ports) {
    const b = bins.find((x) => p.local_port >= x.min && p.local_port <= x.max);
    if (b) b.count++;
  }
  return bins.map(({ range, count }) => ({ range: `${range}`, count }));
}

// ─── 主组件 ──────────────────────────────────────────────

export default function Overview() {
  const {
    procs,
    ports,
    devs,
    ais,
    history,
    data,
    theme,
    disks,
    sysinfo,
    sessionFiles,
    setView,
  } = useStore(
    useShallow((s) => ({
      procs: s.procs,
      ports: s.ports,
      devs: s.devs,
      ais: s.ais,
      history: s.history,
      data: s.data,
      theme: s.theme,
      disks: s.disks,
      sysinfo: s.sysinfo,
      sessionFiles: s.sessionFiles,
      setView: s.setView,
    }))
  );

  const ACCENT = "#22d3ee";
  const WARN = "#fbbf24";

  const cpuTotal = procs.reduce((a, p) => a + (p.cpu ?? 0), 0);
  const memTotal = procs.reduce((a, p) => a + (p.memory ?? 0), 0);
  const topProcs = useMemo(
    () => [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 6),
    [procs]
  );
  const doingTasks = data.tasks.filter((t) => t.status === "doing");
  const upcoming = data.tasks
    .filter((t) => t.due && t.status !== "done")
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
    .slice(0, 5);

  const memTotalGb = sysinfo ? sysinfo.total_memory / (1024 ** 3) : 0;
  const memUsedPct = memTotalGb > 0 ? Math.round((memTotal / 1024 / 1024 / 1024 / memTotalGb) * 100) : 0;

  // ─── 图表选项 ───────────────────────────────────────────

  const cpuMemOption = useMemo(() => {
    const times = history.map((h) =>
      new Date(h.t).toLocaleTimeString("zh-CN", { hour12: false }).slice(3)
    );
    return {
      grid: { left: 42, right: 48, top: 28, bottom: 24 },
      tooltip: { trigger: "axis" },
      legend: { top: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4 },
      xAxis: { type: "category", data: times, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: "value", name: "CPU%", axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: "dashed" } } },
        { type: "value", name: "GB", axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: "CPU 合计",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: history.map((h) => h.cpu),
          lineStyle: { color: ACCENT, width: 2 },
          itemStyle: { color: ACCENT },
          areaStyle: {
            color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: ACCENT + "40" }, { offset: 1, color: ACCENT + "05" }] },
          },
        },
        {
          name: "内存占用",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: history.map((h) => h.memGb),
          lineStyle: { color: WARN, width: 2 },
          itemStyle: { color: WARN },
          areaStyle: {
            color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: WARN + "30" }, { offset: 1, color: WARN + "05" }] },
          },
        },
      ],
    };
  }, [history]);

  // 进程分类饼图
  const categories = useMemo(() => categorizeProcs(procs), [procs]);
  const pieOption = useMemo(
    () => ({
      tooltip: { trigger: "item", formatter: "{b}: {c} 个 ({d}%)" },
      series: [
        {
          type: "pie",
          radius: ["52%", "76%"],
          center: ["50%", "50%"],
          padAngle: 3,
          itemStyle: { borderColor: chartGapColor(), borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: "bold" },
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.4)" },
          },
          data: categories.map((c) => ({
            name: c.name,
            value: c.count,
            itemStyle: { color: c.color },
          })),
        },
      ],
    }),
    [categories, theme]
  );

  // 端口分布条形图
  const portRanges = useMemo(() => portDistribution(ports), [ports]);
  const portBarOption = useMemo(
    () => ({
      grid: { left: 72, right: 24, top: 8, bottom: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        data: portRanges.map((p) => p.range),
        axisLabel: { fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: portRanges.map((p) => p.count),
          barWidth: 18,
          itemStyle: {
            color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#22d3ee80" }, { offset: 1, color: "#22d3ee" }] },
            borderRadius: [0, 6, 6, 0],
          },
          label: { show: true, position: "right", fontSize: 11, formatter: "{c}" },
        },
      ],
    }),
    [portRanges]
  );

  // 磁盘环形图
  const diskSeries = useMemo(() => {
    const colors = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa"];
    return disks.map((d, i) => {
      const pct = d.total_bytes > 0 ? Math.round((d.used_bytes / d.total_bytes) * 100) : 0;
      return {
        value: pct,
        name: d.label || d.mount_point,
        total: d.total_bytes,
        used: d.used_bytes,
        mount: d.mount_point,
        itemStyle: { color: colors[i % colors.length] },
      };
    });
  }, [disks]);

  const diskOption = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (p: { data: { name: string; total: number; used: number; mount: string } }) => {
          const d = p.data;
          return `<b>${d.name}</b><br/>已用: ${formatBytes(d.used)}<br/>总计: ${formatBytes(d.total)}<br/>挂载: ${d.mount}`;
        },
      },
      series: diskSeries.length
        ? [
            {
              type: "pie",
              radius: ["58%", "78%"],
              center: ["50%", "50%"],
              padAngle: 3,
              itemStyle: { borderColor: chartGapColor(), borderWidth: 2 },
              label: {
                show: true,
                position: "outside",
                fontSize: 10,
                formatter: (p: { data: { name: string }; percent: number }) =>
                  `${p.data.name}\n${p.percent}%`,
              },
              labelLine: { length: 8, length2: 10 },
              data: diskSeries,
            },
          ]
        : [
            {
              type: "pie",
              radius: ["58%", "78%"],
              center: ["50%", "50%"],
              silent: true,
              data: [{ value: 1, name: "无磁盘数据", itemStyle: { color: chartLineColor() } }],
              label: { show: false },
            },
          ],
    }),
    [diskSeries, theme]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Hero 横幅：大标题 + 实时状态 ── */}
      <div className="hero-glow relative overflow-hidden rounded-2xl border border-line bg-panel p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-56 w-56 rounded-full bg-accentsoft/60 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <img
            src={logoUrl}
            alt=""
            className="hero-float h-16 w-16 rounded-2xl shadow-[0_8px_32px_rgba(34,211,238,0.25)]"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-wide">工作台</h1>
              <span className="rounded-md border border-accent/40 bg-accentsoft px-2 py-0.5 text-xs font-medium text-accent">
                Workbench
              </span>
            </div>
            <p className="mt-1.5 text-sm text-dim">
              {greeting()} · 本机运维仪表盘与 AI 会话成本计量，数据仅存本机
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <span className="flex items-center gap-2 text-sm font-medium text-ok">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
              </span>
              实时监控中
            </span>
            <span className="font-mono text-xs tabular-nums text-dim">
              {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
            </span>
          </div>
        </div>
      </div>

      {/* ── 系统信息栏 ── */}
      {sysinfo && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5 text-dim">
              <Monitor size={13} className="text-accent" />
              <span className="font-medium text-text">{sysinfo.hostname}</span>
            </span>
            <span className="flex items-center gap-1.5 text-dim">
              <Cpu size={13} />{sysinfo.os_name}
            </span>
            <span className="flex items-center gap-1.5 text-dim">
              <Cpu size={13} className="text-accent" />
              CPU <span className="font-mono font-semibold text-text">{sysinfo.cpu_cores} 核</span>
            </span>
            <span className="flex items-center gap-1.5 text-dim">
              <HardDrive size={13} className="text-warn" />
              内存 <span className="font-mono font-semibold text-text">{formatBytes(sysinfo.total_memory)}</span>
              {memUsedPct > 0 && (
                <span className="text-dim">（已用 {memUsedPct}%）</span>
              )}
            </span>
            <span className="flex items-center gap-1.5 text-dim">
              <Clock size={13} className="text-ok" />
              已运行 <span className="font-mono font-semibold text-text">{formatUptime(sysinfo.uptime_seconds)}</span>
            </span>
          </div>
        </Card>
      )}

      {/* ── 顶部统计 ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Cpu} label="运行中进程" value={procs.length} hint={`CPU 合计 ${formatCpu(cpuTotal)}`} tone="accent" bar="bg-accent" />
        <StatCard icon={Server} label="开发服务器" value={devs.length} hint={devs.map((d) => `${d.framework}:${d.port}`).join(" / ") || "无"} tone="ok" bar="bg-ok" />
        <StatCard icon={Sparkles} label="AI 代理进程" value={ais.length} hint={ais.map((a) => a.name).join(" / ") || "无"} tone="warn" bar="bg-warn" />
        <StatCard icon={Activity} label="进行中任务" value={doingTasks.length} hint={`共 ${data.tasks.length} 个任务`} tone="text" bar="bg-accent" />
      </div>

      {/* ── 图表区域 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* CPU + 内存大图 */}
        <Card className="p-4 xl:col-span-2">
          <SectionTitle>资源曲线（近 {history.length} 次采样）</SectionTitle>
          {history.length > 1 ? (
            <EChart option={cpuMemOption} style={{ height: 230 }} notMerge lazyUpdate />
          ) : (
            <Empty icon={Activity}>采样中，稍候出现曲线…</Empty>
          )}
          <p className="mt-1 text-[11px] text-dim">
            CPU 为所有进程占用率求和（可超过 100%）；内存为进程工作集{memTotalGb > 0 && `（总计 ${memTotalGb.toFixed(1)} GB）`}，合计 {formatBytes(memTotal)}。
          </p>
        </Card>

        {/* 进程分类饼图 */}
        <Card className="p-4">
          <SectionTitle>进程分类</SectionTitle>
          {categories.length > 0 ? (
            <EChart option={pieOption} style={{ height: 190 }} notMerge lazyUpdate />
          ) : (
            <Empty icon={Cpu}>暂无进程数据</Empty>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {categories.map((c) => (
              <span key={c.name} className="flex items-center gap-1.5 text-[11px] text-dim">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                {c.name} <span className="font-mono text-text">{c.count}</span>
                <span className="text-dim/70">{formatBytes(c.mem)}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* ── 磁盘 + 端口分布 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle>磁盘用量</SectionTitle>
          {disks.length > 0 ? (
            <EChart option={diskOption} style={{ height: 190 }} notMerge lazyUpdate />
          ) : (
            <Empty icon={HardDrive}>读取磁盘信息中…</Empty>
          )}
          {disks.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {disks.map((d, i) => {
                const pct = d.total_bytes > 0 ? Math.round((d.used_bytes / d.total_bytes) * 100) : 0;
                const danger = pct >= 90;
                return (
                  <div key={i} className="flex items-center gap-2 rounded border border-line/40 px-2.5 py-1.5 text-xs">
                    <HardDrive size={12} className={danger ? "text-danger" : "text-accent"} />
                    <span className="font-medium truncate" title={d.mount_point}>
                      {d.label || d.mount_point}
                    </span>
                    <span className="ml-auto font-mono text-dim">
                      {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
                    </span>
                    <span className={`font-mono ${danger ? "text-danger" : "text-ok"}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Network size={14} />
              端口分布
            </span>
          </SectionTitle>
          {portRanges.some((p) => p.count > 0) ? (
            <EChart option={portBarOption} style={{ height: 190 }} notMerge lazyUpdate />
          ) : (
            <Empty icon={Network}>未检测到监听端口</Empty>
          )}
          <div className="mt-2 flex gap-6 text-xs text-dim">
            <span>总监听 <span className="font-mono text-text">{ports.length}</span></span>
            <span>已知服务 <span className="font-mono text-text">{devs.length}</span></span>
          </div>
        </Card>
      </div>

      {/* ── Top 进程 + AI 服务 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle
            extra={
              <button className="text-xs text-accent hover:underline" onClick={() => setView("processes")}>
                查看全部 →
              </button>
            }
          >
            CPU 占用 Top 6
          </SectionTitle>
          <Table head={["PID", "进程", "CPU", "内存"]}>
            {topProcs.map((p) => (
              <Tr key={p.pid}>
                <Td mono className="text-dim">
                  {p.pid}
                </Td>
                <Td className="max-w-[180px] truncate font-medium" title={p.cmd_line}>
                  {p.name}
                </Td>
                <Td className="text-accent">{formatCpu(p.cpu)}</Td>
                <Td>{formatBytes(p.memory)}</Td>
              </Tr>
            ))}
            {topProcs.length === 0 && (
              <Tr>
                <Td className="text-dim">暂无数据</Td>
              </Tr>
            )}
          </Table>
        </Card>

        <Card className="p-4">
          <SectionTitle
            extra={
              <button className="text-xs text-accent hover:underline" onClick={() => setView("ai")}>
                查看会话 →
              </button>
            }
          >
            正在运行的服务与 AI 代理
          </SectionTitle>
          {devs.length === 0 && ais.length === 0 && <Empty icon={Server}>没有检测到开发服务器或 AI 代理进程</Empty>}
          <ul className="flex flex-col gap-2">
            {devs.map((d) => (
              <li
                key={d.port}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-panel2 px-3 py-2 text-sm animate-in hover:border-ok/40"
              >
                <Server size={14} className="text-ok" />
                <span className="font-medium">{d.framework}</span>
                <Badge tone="ok">:{d.port}</Badge>
                <span className="ml-auto truncate text-xs text-dim" title={shortPath(d.project_dir ?? "", 80)}>
                  {d.project_dir ? shortPath(d.project_dir, 40) : `PID ${d.pid}`}
                </span>
              </li>
            ))}
            {ais.map((a) => (
              <li
                key={a.pid}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-panel2 px-3 py-2 text-sm animate-in hover:border-warn/40"
              >
                <Sparkles size={14} className="text-warn" />
                <span className="font-medium">{a.name}</span>
                <Badge tone="warn">{a.matched}</Badge>
                <span className="ml-auto font-mono text-xs text-dim">
                  PID {a.pid} · {formatBytes(a.memory)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── 近期任务 + 本地会话 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle
            extra={
              <button className="text-xs text-accent hover:underline" onClick={() => setView("tasks")}>
                去处理 →
              </button>
            }
          >
            近期任务
          </SectionTitle>
          {upcoming.length === 0 ? (
            <Empty icon={Activity}>没有带截止日期的待办任务</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((t) => {
                const due = dueLabel(t.due);
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line/60 bg-panel2 px-3 py-2 text-sm">
                    <Badge tone={due.tone === "muted" ? "dim" : due.tone}>{due.text}</Badge>
                    <span className="truncate">{t.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>本地会话文件</SectionTitle>
          {sessionFiles.length === 0 ? (
            <Empty icon={Inbox}>未检测到 ~/.claude 或 ~/.codex 会话</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
              {sessionFiles.slice(0, 8).map((s, i) => (
                <li key={i} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-panel2">
                  <Badge tone={s.tool.includes("Claude") ? "accent" : "ok"}>{s.tool}</Badge>
                  <span className="text-dim truncate" title={s.path}>
                    {s.project}
                  </span>
                  <span className="ml-auto font-mono text-dim">{formatBytes(s.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** 按当前小时返回问候语。 */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
