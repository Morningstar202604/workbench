import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  MemoryStick,
  Search,
  SearchX,
  XCircle,
} from "lucide-react";
import { EChart } from "../lib/echarts";
import { useStore } from "../lib/store";
import { Badge, Btn, Card, Empty, Spinner, Table, Td, Tr, inputCls } from "../ui";
import { formatBytes, fromNow, shortPath } from "../lib/util";
import type { ProcInfo } from "../types";

type SortKey = "cpu" | "memory" | "pid" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "cpu", label: "CPU 占用" },
  { key: "memory", label: "内存占用" },
  { key: "pid", label: "PID" },
  { key: "name", label: "名称" },
];

// ── CPU 分布直方图数据 ────────────────────────────────────
function cpuHistogram(procs: ProcInfo[]) {
  const bins = [
    { range: "0%", min: 0, max: 0.5, count: 0 },
    { range: "<5%", min: 0.5, max: 5, count: 0 },
    { range: "5-20%", min: 5, max: 20, count: 0 },
    { range: "20-50%", min: 20, max: 50, count: 0 },
    { range: "50%+", min: 50, max:Infinity, count: 0 },
  ];
  for (const p of procs) {
    for (const b of bins) {
      if (p.cpu >= b.min && p.cpu < b.max) {
        b.count++;
        break;
      }
    }
  }
  return bins;
}

// ── 内存分布直方图数据 ────────────────────────────────────
function memHistogram(procs: ProcInfo[]) {
  const bins = [
    { range: "<10MB", min: 0, max: 10, count: 0 },
    { range: "10-50MB", min: 10, max: 50, count: 0 },
    { range: "50-200MB", min: 50, max: 200, count: 0 },
    { range: "200MB-1G", min: 200, max: 1024, count: 0 },
    { range: "1GB+", min: 1024, max: Infinity, count: 0 },
  ];
  for (const p of procs) {
    const mb = p.memory / 1024 / 1024;
    for (const b of bins) {
      if (mb >= b.min && mb < b.max) {
        b.count++;
        break;
      }
    }
  }
  return bins;
}

export default function Processes() {
  const { procs, devs, ais, loading, refreshRuntime } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [chip, setChip] = useState<"all" | "ai" | "dev">("all");
  const [expandedPid, setExpandedPid] = useState<number | null>(null);

  const aiPids = useMemo(() => new Set(ais.map((a) => a.pid)), [ais]);
  const devPids = useMemo(() => new Set(devs.map((d) => d.pid)), [devs]);

  // 派生：compute filteredProcs via useMemo（no setState-in-memo anti-pattern）
  const filteredProcs = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = procs;
    if (chip === "ai") list = list.filter((p) => aiPids.has(p.pid));
    if (chip === "dev") list = list.filter((p) => devPids.has(p.pid));
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.pid.toString().includes(query) ||
          p.cmd_line.toLowerCase().includes(query) ||
          p.exe_path.toLowerCase().includes(query)
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "pid") return a.pid - b.pid;
      return b[sort] - a[sort];
    });
  }, [procs, q, sort, chip, aiPids, devPids]);

  const cpuBins = useMemo(() => cpuHistogram(procs), [procs]);
  const memBins = useMemo(() => memHistogram(procs), [procs]);

  const cpuChart = useMemo(() => {
    return {
      grid: { left: 36, right: 16, top: 12, bottom: 24 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: cpuBins.map((b) => b.range), axisLabel: { fontSize: 9 } },
      yAxis: { type: "value", axisLabel: { fontSize: 9 }, splitLine: { lineStyle: { type: "dashed" } } },
      series: [
        {
          type: "bar",
          data: cpuBins.map((b, i) => ({
            value: b.count,
            itemStyle: {
              color: ["#34d399", "#22d3ee", "#fbbf24", "#f97316", "#ef4444"][i],
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: "60%",
          label: { show: true, position: "top", fontSize: 10 },
        },
      ],
    };
  }, [cpuBins]);

  const memChart = useMemo(() => {
    return {
      grid: { left: 36, right: 16, top: 12, bottom: 24 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: memBins.map((b) => b.range), axisLabel: { fontSize: 9 } },
      yAxis: { type: "value", axisLabel: { fontSize: 9 }, splitLine: { lineStyle: { type: "dashed" } } },
      series: [
        {
          type: "bar",
          data: memBins.map((b, i) => ({
            value: b.count,
            itemStyle: {
              color: ["#34d399", "#22d3ee", "#a78bfa", "#f97316", "#ef4444"][i],
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: "60%",
          label: { show: true, position: "top", fontSize: 10 },
        },
      ],
    };
  }, [memBins]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── 摘要 + 分布图 ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatPill icon={Cpu} label="进程总数" value={procs.length} tone="accent" />
        <StatPill icon={Cpu} label="CPU 占用" value={`${procs.reduce((a, p) => a + (p.cpu ?? 0), 0).toFixed(0)}%`} tone="warn" />
        <StatPill
          icon={MemoryStick}
          label="内存合计"
          value={formatBytes(procs.reduce((a, p) => a + (p.memory ?? 0), 0))}
          tone="ok"
        />
        <StatPill
          icon={Search}
          label="高CPU进程"
          value={procs.filter((p) => p.cpu > 10).length}
          tone="danger"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Cpu size={14} className="text-warn" /> CPU 占用分布
          </h3>
          <EChart option={cpuChart} style={{ height: 170 }} notMerge lazyUpdate />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <MemoryStick size={14} className="text-ok" /> 内存占用分布
          </h3>
          <EChart option={memChart} style={{ height: 170 }} notMerge lazyUpdate />
        </Card>
      </div>

      {/* ── 搜索栏 ── */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="搜索进程名 / PID / 命令行…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              ["all", "全部"],
              ["ai", "AI 代理"],
              ["dev", "开发服务器"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setChip(key)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                chip === key
                  ? "border-accent/50 bg-accentsoft text-accent"
                  : "border-line bg-panel2 text-dim hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-dim">
          排序
          <select
            className="rounded-lg border border-line bg-panel2 px-2 py-1 text-xs text-text outline-none"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-dim">
          {loading ? <Spinner /> : `${filteredProcs.length} / ${procs.length} 个进程`}
        </span>
        <Btn onClick={refreshRuntime} className="ml-auto">
          刷新
        </Btn>
      </Card>

      {/* ── 进程表格 ── */}
      <Card>
        {filteredProcs.length === 0 ? (
          <Empty icon={SearchX}>没有匹配的进程</Empty>
        ) : (
          <Table head={["", "PID", "名称", "CPU", "内存", "状态", "启动", "路径 / 命令行", "操作"]}>
            {filteredProcs.slice(0, 400).map((p) => {
              const expanded = expandedPid === p.pid;
              return (
                <Fragment key={p.pid}>
                  <Tr
                    className={`cursor-pointer ${expanded ? "bg-accentsoft/10" : ""}`}
                    onClick={() => setExpandedPid(expanded ? null : p.pid)}
                  >
                    <Td className="w-6">
                      {expanded ? (
                        <ChevronDown size={12} className="text-accent" />
                      ) : (
                        <ChevronRight size={12} className="text-dim" />
                      )}
                    </Td>
                    <Td mono className="text-dim">{p.pid}</Td>
                    <Td className="font-medium max-w-[160px] truncate">
                      <span className="flex items-center gap-1.5">
                        {p.name}
                        {aiPids.has(p.pid) && <Badge tone="warn">AI</Badge>}
                        {devPids.has(p.pid) && <Badge tone="ok">DEV</Badge>}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-11 text-right tabular-nums ${
                            p.cpu > 50 ? "text-danger" : p.cpu > 10 ? "text-warn" : ""
                          }`}
                        >
                          {p.cpu.toFixed(1)}%
                        </span>
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-panel2">
                          <span
                            className={`block h-full rounded-full ${
                              p.cpu > 50 ? "bg-danger" : p.cpu > 10 ? "bg-warn" : "bg-accent"
                            }`}
                            style={{ width: `${Math.min(100, p.cpu)}%` }}
                          />
                        </span>
                      </div>
                    </Td>
                    <Td>{formatBytes(p.memory)}</Td>
                    <Td className="text-dim">{p.status}</Td>
                    <Td className="text-xs text-dim">{fromNow(p.start_time)}</Td>
                    <Td className="max-w-[240px]">
                      <div className="truncate font-mono text-[11px] text-dim" title={p.cmd_line || p.exe_path}>
                        {p.cmd_line ? shortPath(p.cmd_line, 60) : shortPath(p.exe_path, 60)}
                      </div>
                    </Td>
                    <Td>
                      {aiPids.has(p.pid) ||
                      devPids.has(p.pid) ||
                      p.cpu > 50 ? (
                        <Btn
                          variant="danger"
                          className="!px-2 !py-1 !text-xs"
                          title="结束进程"
                          onClick={() => {
                            useStore.getState().setKillTarget(p);
                          }}
                        >
                          <XCircle size={12} />
                        </Btn>
                      ) : (
                        <Btn
                          variant="ghost"
                          className="!px-2 !py-1 !text-xs"
                          title="结束进程"
                          onClick={() => {
                            useStore.getState().setKillTarget(p);
                          }}
                        >
                          <XCircle size={12} />
                        </Btn>
                      )}
                    </Td>
                  </Tr>

                  {expanded && (
                    <Tr key={`${p.pid}-detail`}>
                      <Td colSpan={9} className="bg-panel/60 px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                          <div>
                            <span className="text-dim">可执行路径</span>
                            <div className="mt-0.5 break-all font-mono text-[11px] text-text">
                              {p.exe_path || "—"}
                            </div>
                          </div>
                          <div>
                            <span className="text-dim">父进程 PID</span>
                            <div className="mt-0.5 font-mono text-text">
                              {p.parent_pid ?? "无（根进程）"}
                            </div>
                          </div>
                          <div>
                            <span className="text-dim">启动时间</span>
                            <div className="mt-0.5 text-text">
                              {new Date(p.start_time * 1000).toLocaleString("zh-CN")}
                            </div>
                          </div>
                          <div className="sm:col-span-3">
                            <span className="text-dim">完整命令行</span>
                            <code className="mt-0.5 block break-all rounded bg-bg px-2 py-1.5 font-mono text-[11px] text-dim">
                              {p.cmd_line || "—"}
                            </code>
                          </div>
                        </div>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>
      <p className="px-1 text-[11px] text-dim">点击进程行展开详情。最多展示 400 条，可用搜索或筛选收窄范围。</p>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone = "text",
}: {
  icon: typeof Cpu;
  label: string;
  value: number | string;
  tone?: string;
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3">
      <Icon size={16} className={color} />
      <div>
        <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
        <div className="text-[11px] text-dim">{label}</div>
      </div>
    </div>
  );
}
