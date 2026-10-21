import { useMemo } from "react";
import { EChart } from "../lib/echarts";
import {
  chartGapColor,
  chartLineColor,
  horizontalBarOption,
  seriesColors,
} from "../lib/chartTheme";
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
import { useT, useLang, localeFor } from "../lib/i18n";
import { useBreakpoint } from "../lib/useBreakpoint";
import { categorizeProcesses, portDistribution } from "../lib/aggregate";
import { BrandMark } from "../components/BrandMark";

// ─── 主组件 ──────────────────────────────────────────────

export default function Overview() {
  const t = useT();
  const lang = useLang();
  const bp = useBreakpoint();
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
  const doingTasks = data.tasks.filter((task) => task.status === "doing");
  const upcoming = data.tasks
    .filter((task) => task.due && task.status !== "done")
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
    .slice(0, 5);

  const memTotalGb = sysinfo ? sysinfo.total_memory / 1024 ** 3 : 0;
  const memUsedPct =
    memTotalGb > 0 ? Math.round((memTotal / 1024 / 1024 / 1024 / memTotalGb) * 100) : 0;

  // ─── 图表选项 ───────────────────────────────────────────

  const cpuMemOption = useMemo(() => {
    const times = history.map((h) =>
      new Date(h.t).toLocaleTimeString(localeFor(lang), { hour12: false }).slice(3)
    );
    // 窄屏下双轴名（CPU% / GB）与图例挤在同一行会重叠，
    // 把图例下移并允许换行，轴名保持贴边。
    const narrow = bp === "compact";
    return {
      grid: { left: 42, right: narrow ? 36 : 48, top: narrow ? 46 : 28, bottom: 24 },
      tooltip: { trigger: "axis" },
      legend: {
        top: narrow ? 20 : 0,
        left: "center",
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 4,
        textStyle: { fontSize: narrow ? 9 : 10 },
      },
      xAxis: { type: "category", data: times, axisLabel: { fontSize: 10 } },
      yAxis: [
        {
          type: "value",
          name: "CPU%",
          nameTextStyle: { fontSize: narrow ? 9 : 10 },
          axisLabel: { fontSize: 10 },
          splitLine: { lineStyle: { type: "dashed" } },
        },
        {
          type: "value",
          name: "GB",
          nameTextStyle: { fontSize: narrow ? 9 : 10 },
          axisLabel: { fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          id: "cpu",
          name: t("overview.seriesCpuTotal"),
          type: "line",
          smooth: true,
          showSymbol: false,
          data: history.map((h) => h.cpu),
          lineStyle: { color: ACCENT, width: 2 },
          itemStyle: { color: ACCENT },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: ACCENT + "40" },
                { offset: 1, color: ACCENT + "05" },
              ],
            },
          },
        },
        {
          id: "memory",
          name: t("overview.seriesMemory"),
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          data: history.map((h) => h.memGb),
          lineStyle: { color: WARN, width: 2 },
          itemStyle: { color: WARN },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: WARN + "30" },
                { offset: 1, color: WARN + "05" },
              ],
            },
          },
        },
      ],
    };
  }, [history, t, lang, bp]);

  // 进程分类饼图（分类规则与色板在 lib/aggregate 与 chartTheme，页面不再自持一份）
  const categories = useMemo(
    () =>
      categorizeProcesses(procs, {
        browser: t("overview.cat.browser"),
        dev: t("overview.cat.dev"),
        ai: t("overview.cat.ai"),
        system: t("overview.cat.system"),
        other: t("overview.cat.other"),
      }),
    [procs, t]
  );
  const pieOption = useMemo(
    () => ({
      tooltip: { trigger: "item", formatter: t("overview.pieTooltip") },
      series: [
        {
          id: "proc-category",
          type: "pie",
          radius: ["52%", "76%"],
          center: ["50%", "50%"],
          padAngle: 3,
          itemStyle: { borderColor: chartGapColor(theme), borderWidth: 2 },
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
    [categories, theme, t]
  );

  // 端口分布条形图（与 Servers / Projects / AiSessions 共用同一构造器）
  const portRanges = useMemo(
    () =>
      portDistribution(ports, [
        t("servers.portRange.wellKnown"),
        t("servers.portRange.registered"),
        t("servers.portRange.dynamic"),
      ]),
    [ports, t]
  );
  const portBarOption = useMemo(
    () =>
      horizontalBarOption({
        labels: portRanges.map((p) => p.label),
        values: portRanges.map((p) => ({ value: p.count })),
        theme,
        fontSize: 11,
      }),
    [portRanges, theme]
  );

  // 磁盘环形图
  const colors = useMemo(() => seriesColors(theme), [theme]);
  const diskSeries = useMemo(() => {
    return disks.map((d, i) => {
      const pct =
        d.total_bytes > 0 ? Math.round((d.used_bytes / d.total_bytes) * 100) : 0;
      return {
        value: pct,
        name: d.label || d.mount_point,
        total: d.total_bytes,
        used: d.used_bytes,
        mount: d.mount_point,
        itemStyle: { color: colors[i % colors.length] },
      };
    });
  }, [disks, colors]);

  const diskOption = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (p: {
          data: { name: string; total: number; used: number; mount: string };
        }) => {
          const d = p.data;
          return `<b>${d.name}</b><br/>${t("overview.diskTooltip", {
            used: formatBytes(d.used),
            total: formatBytes(d.total),
            mount: d.mount,
          })}`;
        },
      },
      series: diskSeries.length
        ? [
            {
              id: "disk",
              type: "pie",
              radius: ["52%", "72%"],
              center: ["50%", "50%"],
              padAngle: 3,
              itemStyle: { borderColor: chartGapColor(theme), borderWidth: 2 },
              // 不画外侧标签：多个磁盘时 ECharts 的标签避让实测仍会叠在一起
              // （「D 38%」压在「C 65%」上），而这张卡的下方本来就有完整的
              // 磁盘列表（名称 + 已用/总量 + 百分比），hover 还有 tooltip。
              // 在这里重复一遍标签只会制造噪音和遮挡。
              label: { show: false },
              labelLine: { show: false },
              data: diskSeries,
            },
          ]
        : [
            {
              id: "disk-empty",
              type: "pie",
              radius: ["52%", "72%"],
              center: ["50%", "50%"],
              silent: true,
              data: [
                {
                  value: 1,
                  name: t("overview.noDiskData"),
                  itemStyle: { color: chartLineColor(theme) },
                },
              ],
              label: { show: false },
            },
          ],
    }),
    [diskSeries, theme, t]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── 报头：像仪表铭牌，不是营销横幅 ──
          没有卡片、没有底色块：标题直接落在画布上，字形与背景同一平面。 */}
      <header className="flex flex-col gap-3 border-b border-line/70 pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <BrandMark className="h-6 w-[27px] shrink-0 sm:h-7 sm:w-8" gradient />
            <h1 className="t-heading truncate text-[26px] font-semibold leading-none sm:text-[30px]">
              {t("overview.heroTitle")}
            </h1>
            <span className="hidden text-[11px] font-medium tracking-[0.14em] text-faint sm:inline">
              WORKBENCH
            </span>
          </div>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-dim">
            {greeting(t)}，{t("overview.heroSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto sm:flex-col sm:items-end sm:gap-1.5">
          <span className="flex items-center gap-2 text-[11px] font-medium text-ok">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
            </span>
            {t("overview.liveMonitoring")}
          </span>
          <span className="num text-[11px] text-faint">
            {new Date().toLocaleDateString(localeFor(lang), {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
        </div>
      </header>

      {/* ── 机器铭牌：一条细带，不是卡片。
          这些值用户不会长时间盯，但需要随时能扫到，所以压成一行等宽读数。 */}
      {sysinfo && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-[var(--radius-btn)] border border-line/70 bg-panel/40 px-3.5 py-2 text-[11px] text-dim">
          <span className="flex items-center gap-1.5">
            <Monitor size={12} className="text-accent" />
            <span className="font-medium text-text">{sysinfo.hostname}</span>
          </span>
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          <span>{sysinfo.os_name}</span>
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          <span className="flex items-center gap-1">
            <Cpu size={12} className="text-faint" />
            <span className="num text-text">{sysinfo.cpu_cores}</span>
            {t("overview.cpuCores")}
          </span>
          <span className="flex items-center gap-1">
            <HardDrive size={12} className="text-faint" />
            <span className="num text-text">{formatBytes(sysinfo.total_memory)}</span>
            {memUsedPct > 0 && (
              <span className="text-faint">
                {t("overview.memUsedPct", { pct: memUsedPct })}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} className="text-faint" />
            {t("overview.uptime")}{" "}
            <span className="num text-text">{formatUptime(sysinfo.uptime_seconds)}</span>
          </span>
        </div>
      )}

      {/* ── 顶部统计 ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={Cpu}
          label={t("overview.statRunningProcs")}
          value={procs.length}
          hint={t("overview.statCpuTotal", { cpu: formatCpu(cpuTotal) })}
          tone="accent"
        />
        <StatCard
          icon={Server}
          label={t("overview.statDevServers")}
          value={devs.length}
          hint={
            devs.map((d) => `${d.framework}:${d.port}`).join(" / ") || t("overview.none")
          }
          tone="ok"
        />
        <StatCard
          icon={Sparkles}
          label={t("overview.statAiAgents")}
          value={ais.length}
          hint={ais.map((a) => a.name).join(" / ") || t("overview.none")}
          tone="warn"
        />
        <StatCard
          icon={Activity}
          label={t("overview.statDoingTasks")}
          value={doingTasks.length}
          hint={t("overview.statTotalTasks", { count: data.tasks.length })}
          tone="text"
        />
      </div>

      {/* ── 图表区域 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* CPU + 内存大图 */}
        <Card className="p-4 xl:col-span-2">
          <SectionTitle>
            {t("overview.chartResourceTitle", { count: history.length })}
          </SectionTitle>
          {history.length > 1 ? (
            <EChart option={cpuMemOption} style={{ height: 230 }} lazyUpdate />
          ) : (
            <Empty icon={Activity}>{t("overview.samplingEmpty")}</Empty>
          )}
          <p className="mt-1 text-[11px] text-dim">
            {t("overview.chartNote1")}
            {memTotalGb > 0 &&
              t("overview.chartNoteTotal", { gb: memTotalGb.toFixed(1) })}
            {t("overview.chartNoteSumPrefix")}
            {formatBytes(memTotal)}
            {t("overview.chartNotePeriod")}
          </p>
        </Card>

        {/* 进程分类饼图 */}
        <Card className="p-4">
          <SectionTitle>{t("overview.chartCategoryTitle")}</SectionTitle>
          {categories.length > 0 ? (
            <EChart option={pieOption} style={{ height: 190 }} lazyUpdate />
          ) : (
            <Empty icon={Cpu}>{t("overview.noProcessData")}</Empty>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {categories.map((c) => (
              <span
                key={c.name}
                className="flex items-center gap-1.5 text-[11px] text-dim"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: c.color }}
                />
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
          <SectionTitle>{t("overview.diskTitle")}</SectionTitle>
          {disks.length > 0 ? (
            <EChart option={diskOption} style={{ height: 190 }} lazyUpdate />
          ) : (
            <Empty icon={HardDrive}>{t("overview.diskLoading")}</Empty>
          )}
          {disks.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {disks.map((d, i) => {
                const pct =
                  d.total_bytes > 0
                    ? Math.round((d.used_bytes / d.total_bytes) * 100)
                    : 0;
                const danger = pct >= 90;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded border border-line/40 px-2.5 py-1.5 text-xs"
                  >
                    <HardDrive
                      size={12}
                      className={danger ? "text-danger" : "text-accent"}
                    />
                    <span className="font-medium truncate" title={d.mount_point}>
                      {d.label || d.mount_point}
                    </span>
                    <span className="ml-auto font-mono text-dim">
                      {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
                    </span>
                    <span className={`font-mono ${danger ? "text-danger" : "text-ok"}`}>
                      {pct}%
                    </span>
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
              {t("overview.portTitle")}
            </span>
          </SectionTitle>
          {portRanges.some((p) => p.count > 0) ? (
            <EChart option={portBarOption} style={{ height: 190 }} lazyUpdate />
          ) : (
            <Empty icon={Network}>{t("overview.noPorts")}</Empty>
          )}
          <div className="mt-2 flex gap-6 text-xs text-dim">
            <span>
              {t("overview.totalListening")}{" "}
              <span className="font-mono text-text">{ports.length}</span>
            </span>
            <span>
              {t("overview.knownServices")}{" "}
              <span className="font-mono text-text">{devs.length}</span>
            </span>
          </div>
        </Card>
      </div>

      {/* ── Top 进程 + AI 服务 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle
            extra={
              <button
                className="text-xs text-accent hover:underline"
                onClick={() => setView("processes")}
              >
                {t("overview.viewAll")}
              </button>
            }
          >
            {t("overview.topCpuTitle")}
          </SectionTitle>
          <Table head={["PID", t("overview.colProcess"), "CPU", t("overview.memory")]}>
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
                <Td className="text-dim">{t("overview.noData")}</Td>
              </Tr>
            )}
          </Table>
        </Card>

        <Card className="p-4">
          <SectionTitle
            extra={
              <button
                className="text-xs text-accent hover:underline"
                onClick={() => setView("ai")}
              >
                {t("overview.viewSessions")}
              </button>
            }
          >
            {t("overview.runningServicesTitle")}
          </SectionTitle>
          {devs.length === 0 && ais.length === 0 && (
            <Empty icon={Server}>{t("overview.noServices")}</Empty>
          )}
          <ul className="flex flex-col gap-2">
            {devs.map((d) => (
              <li
                key={d.port}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-panel2 px-3 py-2 text-sm animate-in hover:border-ok/40"
              >
                <Server size={14} className="text-ok" />
                <span className="font-medium">{d.framework}</span>
                <Badge tone="ok">:{d.port}</Badge>
                <span
                  className="ml-auto truncate text-xs text-dim"
                  title={shortPath(d.project_dir ?? "", 80)}
                >
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
              <button
                className="text-xs text-accent hover:underline"
                onClick={() => setView("tasks")}
              >
                {t("overview.goHandle")}
              </button>
            }
          >
            {t("overview.recentTasks")}
          </SectionTitle>
          {upcoming.length === 0 ? (
            <Empty icon={Activity}>{t("overview.noUpcomingTasks")}</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((task) => {
                const due = dueLabel(task.due);
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-line/60 bg-panel2 px-3 py-2 text-sm"
                  >
                    <Badge tone={due.tone}>{due.text}</Badge>
                    <span className="truncate">{task.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>{t("overview.localSessions")}</SectionTitle>
          {sessionFiles.length === 0 ? (
            <Empty icon={Inbox}>{t("overview.noSessionFiles")}</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
              {sessionFiles.slice(0, 8).map((s) => (
                <li
                  key={s.path}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-panel2"
                >
                  <Badge tone={s.tool.includes("Claude") ? "accent" : "ok"}>
                    {s.tool}
                  </Badge>
                  <span className="text-dim truncate" title={s.path}>
                    {s.project}
                  </span>
                  <span className="ml-auto font-mono text-dim">
                    {formatBytes(s.size)}
                  </span>
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
function greeting(t: (key: string) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t("overview.greeting.lateNight");
  if (h < 11) return t("overview.greeting.morning");
  if (h < 14) return t("overview.greeting.noon");
  if (h < 18) return t("overview.greeting.afternoon");
  return t("overview.greeting.evening");
}
