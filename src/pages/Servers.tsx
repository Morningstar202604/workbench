import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Network,
  Server,
  Terminal,
} from "lucide-react";
import { EChart, chartGapColor } from "../lib/echarts";
import { useStore } from "../lib/store";
import { openExternal } from "../lib/api";
import { Badge, Btn, Card, Empty, SectionTitle } from "../ui";
import type { DevServer, PortEntry } from "../types";

// ── 框架分布统计 ──────────────────────────────────────────
function frameworkDist(servers: DevServer[]) {
  const m = new Map<string, number>();
  for (const s of servers) m.set(s.framework, (m.get(s.framework) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ── 端口区间分布 ──────────────────────────────────────────
function portHeatmap(ports: PortEntry[]) {
  const ranges = [
    { label: "知名端口 1-1023", min: 1, max: 1023, count: 0 },
    { label: "注册端口 1024-49151", min: 1024, max: 49151, count: 0 },
    { label: "动态端口 49152+", min: 49152, max: 65535, count: 0 },
  ];
  for (const p of ports) {
    for (const r of ranges) {
      if (p.local_port >= r.min && p.local_port <= r.max) {
        r.count++;
        break;
      }
    }
  }
  return ranges;
}

const COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#e879f9"];

export default function Servers() {
  const { devs, ports, procs, refreshRuntime, setKillTarget, gitBranches, fetchGitBranch } = useStore();
  const [expandedServer, setExpandedServer] = useState<number | null>(null);

  const listening = useMemo<PortEntry[]>(
    () =>
      ports
        .filter((p) => p.protocol === "TCP" && p.state === "LISTENING")
        .sort((a, b) => a.local_port - b.local_port),
    [ports]
  );

  const procByPid = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of procs) m.set(p.pid, p.name);
    return m;
  }, [procs]);

  const frameworkData = useMemo(() => frameworkDist(devs), [devs]);
  const heatmapData = useMemo(() => portHeatmap(listening), [listening]);

  // 框架分布饼图
  const frameworkPieOption = useMemo(() => {
    return {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "70%"],
          center: ["50%", "50%"],
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: "bold" },
          },
          labelLine: { show: false },
          itemStyle: { borderColor: chartGapColor(), borderWidth: 2 },
          data: frameworkData.map(([name, count], i) => ({
            name,
            value: count,
            itemStyle: { color: COLORS[i % COLORS.length] },
          })),
        },
      ],
    };
  }, [frameworkData]);

  // 端口分布条形图
  const portBarOption = useMemo(() => {
    return {
      grid: { left: 100, right: 24, top: 8, bottom: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        data: heatmapData.map((h) => h.label),
        axisLabel: { fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: heatmapData.map((h, i) => ({
            value: h.count,
            itemStyle: {
              color: {
                type: "linear",
                x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: COLORS[i] + "60" },
                  { offset: 1, color: COLORS[i] },
                ],
              },
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barWidth: 16,
          label: {
            show: true,
            position: "right",
            fontSize: 11,
            formatter: "{c}",
          },
        },
      ],
    };
  }, [heatmapData]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── 摘要条 ── */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryPill icon={Server} label="开发服务" value={devs.length} tone="ok" />
        <SummaryPill icon={Network} label="TCP 监听" value={listening.length} tone="accent" />
        <SummaryPill icon={BarChart3} label="框架种类" value={frameworkData.length} tone="warn" />
      </div>

      {/* ── 图表区 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle>框架分布</SectionTitle>
          {frameworkData.length > 0 ? (
            <>
              <EChart option={frameworkPieOption} style={{ height: 180 }} notMerge lazyUpdate />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {frameworkData.map(([name, count], i) => (
                  <span key={name} className="flex items-center gap-1.5 text-[11px] text-dim">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    {name} <span className="font-mono text-text">{count}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty icon={Server}>没有检测到开发服务器</Empty>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>端口分布</SectionTitle>
          {listening.length > 0 ? (
            <EChart option={portBarOption} style={{ height: 180 }} notMerge lazyUpdate />
          ) : (
            <Empty icon={Network}>未检测到监听端口</Empty>
          )}
        </Card>
      </div>

      {/* ── 开发服务器列表 ── */}
      <Card className="p-4">
        <SectionTitle
          extra={
            <Btn onClick={refreshRuntime} className="!py-1 !text-xs">
              刷新
            </Btn>
          }
        >
          开发服务器（{devs.length}）
        </SectionTitle>
        {devs.length === 0 ? (
          <Empty>当前没有检测到运行中的开发服务器。启动 npm run dev / uvicorn 等后会出现在这里。</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {devs.map((d) => {
              const expanded = expandedServer === d.port;
              const branch = d.project_dir ? gitBranches[d.project_dir] : undefined;
              return (
                <div
                  key={`${d.port}-${d.pid}`}
                  className="rounded-xl border border-line bg-panel2 transition-all overflow-hidden"
                >
                  {/* 折叠头部 */}
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accentsoft/30 transition-colors"
                    onClick={() => setExpandedServer(expanded ? null : d.port)}
                  >
                    {expanded ? (
                      <ChevronDown size={14} className="text-accent shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-dim shrink-0" />
                    )}
                    <Server size={16} className="text-ok shrink-0" />
                    <span className="font-semibold">{d.framework}</span>
                    <Badge tone="ok">:{d.port}</Badge>
                    <Badge tone={d.confidence === "high" ? "ok" : d.confidence === "medium" ? "warn" : "dim"}>
                      {d.confidence === "high" ? "高置信" : d.confidence === "medium" ? "中置信" : "低置信"}
                    </Badge>
                    <span className="ml-auto truncate font-mono text-xs text-dim hidden md:block" title={d.project_dir ?? ""}>
                      {d.project_dir ? d.project_dir : `PID ${d.pid}`}
                    </span>
                    {/* 操作 */}
                    <div className="flex gap-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Btn
                        className="!px-2 !py-1 !text-xs"
                        title="在浏览器打开"
                        onClick={() => openExternal(`http://localhost:${d.port}`)}
                      >
                        <ExternalLink size={12} />
                      </Btn>
                      {d.project_dir && (
                        <Btn
                          className="!px-2 !py-1 !text-xs"
                          title="打开项目目录"
                          onClick={() => openExternal(d.project_dir!)}
                        >
                          <FolderOpen size={12} />
                        </Btn>
                      )}
                      <Btn
                        variant="danger"
                        className="!px-2 !py-1 !text-xs"
                        title="结束进程"
                        onClick={() => {
                          const p = procs.find((x) => x.pid === d.pid);
                          if (p) setKillTarget(p);
                        }}
                      >
                        <Terminal size={12} />
                      </Btn>
                    </div>
                  </button>

                  {/* 展开详情 */}
                  {expanded && (
                    <div className="border-t border-line bg-panel/50 px-4 py-3 space-y-2 text-sm">
                      <DetailRow label="进程">
                        <span className="font-mono">{d.process_name} · PID {d.pid}</span>
                      </DetailRow>
                      <DetailRow label="协议">
                        <Badge>{d.protocol}</Badge>
                      </DetailRow>
                      {d.project_dir && (
                        <>
                          <DetailRow label="项目目录">
                            <span className="font-mono text-xs" title={d.project_dir}>
                              {d.project_dir}
                            </span>
                          </DetailRow>
                          <DetailRow label="Git 分支">
                            {branch === undefined ? (
                              <Btn
                                className="!px-2 !py-0.5 !text-[10px]"
                                onClick={() => {
                                  if (d.project_dir) fetchGitBranch(d.project_dir);
                                }}
                              >
                                <GitBranch size={10} />
                              </Btn>
                            ) : (
                              <Badge tone="dim">
                                <GitBranch size={10} className="mr-1 inline" />
                                {branch || "非 git 仓库"}
                              </Badge>
                            )}
                          </DetailRow>
                        </>
                      )}
                      <DetailRow label="命令行">
                        <code className="block break-all rounded bg-bg px-2 py-1 text-[11px] text-dim">
                          {d.cmd_line}
                        </code>
                      </DetailRow>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── 全部监听端口 ── */}
      <Card className="p-4">
        <SectionTitle>全部 TCP 监听端口（{listening.length}）</SectionTitle>
        {listening.length === 0 ? (
          <Empty>没有 TCP 监听端口</Empty>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listening.map((p) => (
              <div
                key={`${p.local_addr}-${p.local_port}-${p.pid}`}
                className="flex items-center gap-2 rounded-lg border border-line/50 bg-panel2 px-3 py-2 text-xs hover:border-accent/40 transition-colors"
              >
                <Network size={12} className="text-accent shrink-0" />
                <span className="font-mono font-semibold text-accent">:{p.local_port}</span>
                <span className="text-dim truncate">{procByPid.get(p.pid) ?? `PID ${p.pid}`}</span>
                <button
                  className="ml-auto text-dim hover:text-accent"
                  onClick={() => openExternal(`http://localhost:${p.local_port}`)}
                  title="打开"
                >
                  <ExternalLink size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-xs text-dim">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Server;
  label: string;
  value: number;
  tone: string;
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-accent";
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
