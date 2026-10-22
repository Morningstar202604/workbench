import { useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Clock,
  Cpu,
  HardDrive,
  Inbox,
  Network,
  Server,
  Sparkles,
} from "lucide-react";
import { EChart } from "../../lib/echarts";
import {
  chartGapColor,
  chartLineColor,
  horizontalBarOption,
  seriesColors,
} from "../../lib/chartTheme";
import { useStore } from "../../lib/store";
import { useShallow } from "zustand/react/shallow";
import { Badge, Card, Empty, Skeleton, StatCard, Table, Td, Tr } from "../../ui";
import {
  dueLabel,
  escapeHtml,
  formatBytes,
  formatCpu,
  formatUptime,
  shortPath,
} from "../../lib/util";
import { useLang, useT, localeFor } from "../../lib/i18n";
import { useBreakpoint } from "../../lib/useBreakpoint";
import { categorizeProcesses, portDistribution } from "../../lib/aggregate";
import type { WidgetId } from "../../lib/layout";
import type {
  AiProcess,
  DevServer,
  DiskInfo,
  PortEntry,
  ProcInfo,
  SessionFilePreview,
  Task,
} from "../../types";

/**
 * 概览页的九个组件。
 *
 * 每个组件自己订阅需要的 store 切片，不通过 props 传数据：
 * - 布局引擎只管「谁在哪、多大」，不碰业务数据；
 * - 组件被隐藏/移走时不会连带其它组件的重渲染；
 * - 新增布局不需要改任何组件。
 *
 * 唯一的例外是「当前主题 id」——图表要按主题取色，而 ECharts 不读 CSS 变量。
 */

const ACCENT = "#22d3ee";
const WARN = "#f5b544";

/** 组件外壳：统一的标题栏 + 拖拽把手。 */
export function WidgetFrame({
  title,
  extra,
  children,
  dragHandle,
  className = "",
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  dragHandle?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex h-full min-h-0 flex-col ${className}`}>
      {(title || dragHandle) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="section-title flex min-w-0 items-center gap-2">
              <span className="h-3 w-px shrink-0 bg-accent/70" aria-hidden="true" />
              <span className="truncate">{title}</span>
            </h2>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {extra}
            {dragHandle}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

// ── 1. 关键指标 ────────────────────────────────────────────

export function KpiWidget() {
  const t = useT();
  const { procs, devs, ais, data, loading } = useStore(
    useShallow((s) => ({
      procs: s.procs,
      devs: s.devs,
      ais: s.ais,
      data: s.data,
      loading: s.loading,
    }))
  );
  const cpuTotal = procs.reduce((a, p) => a + (p.cpu ?? 0), 0);
  const doing = data.tasks.filter((x) => x.status === "doing").length;

  // 首次采样还没回来：显示骨架，避免四个 0 一闪而过
  if (procs.length === 0 && loading) {
    return (
      <div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="px-4 py-3.5">
            <Skeleton lines={2} />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-4">
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
        value={doing}
        hint={t("overview.statTotalTasks", { count: data.tasks.length })}
        tone="text"
      />
    </div>
  );
}

// ── 2. 资源曲线 ────────────────────────────────────────────

export function ResourceWidget() {
  const t = useT();
  const lang = useLang();
  const bp = useBreakpoint();
  const { history, procs, sysinfo } = useStore(
    useShallow((s) => ({ history: s.history, procs: s.procs, sysinfo: s.sysinfo }))
  );

  const memTotal = procs.reduce((a, p) => a + (p.memory ?? 0), 0);
  const memTotalGb = sysinfo ? sysinfo.total_memory / 1024 ** 3 : 0;

  const option = useMemo(() => {
    const times = history.map((h) =>
      new Date(h.t).toLocaleTimeString(localeFor(lang), { hour12: false }).slice(3)
    );
    const narrow = bp === "compact";
    const area = (color: string) => ({
      color: {
        type: "linear",
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: color + "40" },
          { offset: 1, color: color + "05" },
        ],
      },
    });
    return {
      grid: { left: 42, right: narrow ? 36 : 48, top: narrow ? 46 : 22, bottom: 22 },
      tooltip: { trigger: "axis" },
      legend: {
        top: narrow ? 20 : -2,
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
          areaStyle: area(ACCENT),
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
          areaStyle: area(WARN),
        },
      ],
    };
  }, [history, t, lang, bp]);

  return (
    <WidgetFrame title={t("overview.chartResourceTitle", { count: history.length })}>
      {history.length > 1 ? (
        <div className="flex h-full min-h-[180px] flex-col">
          <div className="min-h-0 flex-1">
            <EChart
              option={option}
              style={{ height: "100%", minHeight: 170 }}
              lazyUpdate
            />
          </div>
          <p className="mt-1 line-clamp-2 text-[10.5px] text-faint">
            {t("overview.chartNote1")}
            {memTotalGb > 0 &&
              t("overview.chartNoteTotal", { gb: memTotalGb.toFixed(1) })}
            {t("overview.chartNoteSumPrefix")}
            {formatBytes(memTotal)}
            {t("overview.chartNotePeriod")}
          </p>
        </div>
      ) : (
        <Empty icon={Activity}>{t("overview.samplingEmpty")}</Empty>
      )}
    </WidgetFrame>
  );
}

// ── 3. 进程分类 ────────────────────────────────────────────

export function CategoryWidget() {
  const t = useT();
  const { procs, theme } = useStore(
    useShallow((s) => ({ procs: s.procs, theme: s.theme }))
  );
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

  const option = useMemo(
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

  return (
    <WidgetFrame title={t("overview.chartCategoryTitle")}>
      {categories.length > 0 ? (
        <div className="flex h-full min-h-[160px] flex-col">
          <div className="min-h-0 flex-1">
            <EChart
              option={option}
              style={{ height: "100%", minHeight: 140 }}
              lazyUpdate
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {categories.map((c) => (
              <span
                key={c.name}
                className="flex items-center gap-1.5 text-[10.5px] text-dim"
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: c.color }}
                />
                {c.name} <span className="num text-text">{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <Empty icon={Cpu}>{t("overview.noProcessData")}</Empty>
      )}
    </WidgetFrame>
  );
}

// ── 4. 磁盘 ────────────────────────────────────────────────

export function DiskWidget() {
  const t = useT();
  const { disks, theme } = useStore(
    useShallow((s) => ({ disks: s.disks, theme: s.theme }))
  );
  const colors = useMemo(() => seriesColors(theme), [theme]);

  const series = useMemo(
    () =>
      disks.map((d, i) => ({
        value: d.total_bytes > 0 ? Math.round((d.used_bytes / d.total_bytes) * 100) : 0,
        name: d.label || d.mount_point,
        total: d.total_bytes,
        used: d.used_bytes,
        mount: d.mount_point,
        itemStyle: { color: colors[i % colors.length] },
      })),
    [disks, colors]
  );

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (p: {
          data: { name: string; total: number; used: number; mount: string };
        }) => {
          const d = p.data;
          // 名称/挂载点来自本机磁盘卷标（外部可控字符串），必须转义后再拼 HTML
          return `<b>${escapeHtml(d.name)}</b><br/>${escapeHtml(
            t("overview.diskTooltip", {
              used: formatBytes(d.used),
              total: formatBytes(d.total),
              mount: d.mount,
            })
          )}`;
        },
      },
      series: series.length
        ? [
            {
              id: "disk",
              type: "pie",
              radius: ["52%", "72%"],
              center: ["50%", "50%"],
              padAngle: 3,
              itemStyle: { borderColor: chartGapColor(theme), borderWidth: 2 },
              label: { show: false },
              labelLine: { show: false },
              data: series,
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
    [series, theme, t]
  );

  return (
    <WidgetFrame title={t("overview.diskTitle")}>
      {disks.length > 0 ? (
        <div className="flex h-full flex-col">
          <EChart option={option} style={{ height: 150 }} lazyUpdate />
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {disks.map((d, i) => {
              const pct =
                d.total_bytes > 0 ? Math.round((d.used_bytes / d.total_bytes) * 100) : 0;
              const danger = pct >= 90;
              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded border border-line/40 px-2 py-1 text-[11px]"
                >
                  <HardDrive
                    size={11}
                    className={danger ? "text-danger" : "text-accent"}
                  />
                  <span className="truncate font-medium" title={d.mount_point}>
                    {d.label || d.mount_point}
                  </span>
                  <span className="num ml-auto text-faint">
                    {formatBytes(d.used_bytes)}
                  </span>
                  <span className={`num ${danger ? "text-danger" : "text-ok"}`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Empty icon={HardDrive}>{t("overview.diskLoading")}</Empty>
      )}
    </WidgetFrame>
  );
}

// ── 5. 端口 ────────────────────────────────────────────────

export function PortWidget() {
  const t = useT();
  const { ports, devs, theme } = useStore(
    useShallow((s) => ({ ports: s.ports, devs: s.devs, theme: s.theme }))
  );
  const ranges = useMemo(
    () =>
      portDistribution(ports, [
        t("servers.portRange.wellKnown"),
        t("servers.portRange.registered"),
        t("servers.portRange.dynamic"),
      ]),
    [ports, t]
  );
  const option = useMemo(
    () =>
      horizontalBarOption({
        labels: ranges.map((p) => p.label),
        values: ranges.map((p) => ({ value: p.count })),
        theme,
        fontSize: 10,
      }),
    [ranges, theme]
  );

  return (
    <WidgetFrame title={t("overview.portTitle")}>
      {ranges.some((p) => p.count > 0) ? (
        <div className="flex h-full flex-col">
          <EChart option={option} style={{ height: 150 }} lazyUpdate />
          <div className="mt-2 flex gap-5 text-[11px] text-dim">
            <span>
              {t("overview.totalListening")}{" "}
              <span className="num text-text">{ports.length}</span>
            </span>
            <span>
              {t("overview.knownServices")}{" "}
              <span className="num text-text">{devs.length}</span>
            </span>
          </div>
        </div>
      ) : (
        <Empty icon={Network}>{t("overview.noPorts")}</Empty>
      )}
    </WidgetFrame>
  );
}

// ── 6. CPU 前列 ────────────────────────────────────────────

export function TopProcessWidget() {
  const t = useT();
  const { procs, setView } = useStore(
    useShallow((s) => ({ procs: s.procs, setView: s.setView }))
  );
  const top = useMemo(
    () => [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 6),
    [procs]
  );

  return (
    <WidgetFrame
      title={t("overview.topCpuTitle")}
      extra={
        <button
          className="text-[11px] text-accent hover:underline"
          onClick={() => setView("processes")}
        >
          {t("overview.viewAll")}
        </button>
      }
    >
      <Table head={["PID", t("overview.colProcess"), "CPU", t("overview.memory")]}>
        {top.map((p) => (
          <Tr key={p.pid}>
            <Td mono className="text-dim">
              {p.pid}
            </Td>
            <Td className="max-w-[150px] truncate font-medium" title={p.cmd_line}>
              {p.name}
            </Td>
            <Td className="num text-accent">{formatCpu(p.cpu)}</Td>
            <Td className="num">{formatBytes(p.memory)}</Td>
          </Tr>
        ))}
        {top.length === 0 && (
          <Tr>
            <Td className="text-dim">{t("overview.noData")}</Td>
          </Tr>
        )}
      </Table>
    </WidgetFrame>
  );
}

// ── 7. 运行服务 ────────────────────────────────────────────

export function ServicesWidget() {
  const t = useT();
  const { devs, ais, setView } = useStore(
    useShallow((s) => ({ devs: s.devs, ais: s.ais, setView: s.setView }))
  );

  return (
    <WidgetFrame
      title={t("overview.runningServicesTitle")}
      extra={
        <button
          className="text-[11px] text-accent hover:underline"
          onClick={() => setView("ai")}
        >
          {t("overview.viewSessions")}
        </button>
      }
    >
      {devs.length === 0 && ais.length === 0 && (
        <Empty
          icon={Server}
          action={
            <button
              className="text-[11px] text-accent hover:underline"
              onClick={() => setView("servers")}
            >
              {t("overview.noServicesAction")}
            </button>
          }
        >
          {t("overview.noServices")}
        </Empty>
      )}
      <ul className="flex flex-col gap-1.5">
        {devs.map((d) => (
          <li
            key={d.port}
            className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-line/60 bg-panel2/60 px-2.5 py-1.5 text-[12px]"
          >
            <Server size={12} className="text-ok" />
            <span className="truncate font-medium">{d.framework}</span>
            <Badge tone="ok">:{d.port}</Badge>
            <span
              className="ml-auto truncate text-[10.5px] text-faint"
              title={shortPath(d.project_dir ?? "", 80)}
            >
              {d.project_dir ? shortPath(d.project_dir, 32) : `PID ${d.pid}`}
            </span>
          </li>
        ))}
        {ais.map((a) => (
          <li
            key={a.pid}
            className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-line/60 bg-panel2/60 px-2.5 py-1.5 text-[12px]"
          >
            <Sparkles size={12} className="text-warn" />
            <span className="truncate font-medium">{a.name}</span>
            <Badge tone="warn">{a.matched}</Badge>
            <span className="num ml-auto text-[10.5px] text-faint">
              {a.pid} · {formatBytes(a.memory)}
            </span>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}

// ── 8. 临期任务 ────────────────────────────────────────────

export function TasksWidget() {
  const t = useT();
  const { tasks, setView } = useStore(
    useShallow((s) => ({ tasks: s.data.tasks, setView: s.setView }))
  );
  const upcoming = useMemo(
    () =>
      tasks
        .filter((x) => x.due && x.status !== "done")
        .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
        .slice(0, 5),
    [tasks]
  );

  return (
    <WidgetFrame
      title={t("overview.recentTasks")}
      extra={
        <button
          className="text-[11px] text-accent hover:underline"
          onClick={() => setView("tasks")}
        >
          {t("overview.goHandle")}
        </button>
      }
    >
      {upcoming.length === 0 ? (
        <Empty icon={Activity}>{t("overview.noUpcomingTasks")}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((task) => {
            const due = dueLabel(task.due);
            return (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-line/60 bg-panel2/60 px-2.5 py-1.5 text-[12px]"
              >
                <Badge tone={due.tone}>{due.text}</Badge>
                <span className="truncate">{task.title}</span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetFrame>
  );
}

// ── 9. 会话文件 ────────────────────────────────────────────

export function SessionsWidget() {
  const t = useT();
  const { files } = useStore(useShallow((s) => ({ files: s.sessionFiles })));

  return (
    <WidgetFrame title={t("overview.localSessions")}>
      {files.length === 0 ? (
        <Empty icon={Inbox}>{t("overview.noSessionFiles")}</Empty>
      ) : (
        <ul className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
          {files.slice(0, 8).map((s) => (
            <li
              key={s.path}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-panel2"
            >
              <Badge tone={s.tool.includes("Claude") ? "accent" : "ok"}>{s.tool}</Badge>
              <span className="truncate text-dim" title={s.path}>
                {s.project}
              </span>
              <span className="num ml-auto text-faint">{formatBytes(s.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

/**
 * 环仪布局用的「卫星瓦片」：只显示一个标题 + 一个主数字 + 一行注脚。
 *
 * 为什么不在环上放完整组件：完整组件最小可读宽度约 320px，
 * 8 个围一圈时每个只能分到 200px 左右，图表和表格会被压成不可读的窄条
 * （实测表格直接溢出）。环形布局的职责是「一眼看到全貌」，
 * 细节留给便当格/账本布局——所以这里刻意只取每组数据的一个headline。
 */
export function OrbitTile({ id }: { id: WidgetId }) {
  const t = useT();
  const s = useStore(
    useShallow((st) => ({
      procs: st.procs,
      devs: st.devs,
      ais: st.ais,
      disks: st.disks,
      ports: st.ports,
      tasks: st.data.tasks,
      files: st.sessionFiles,
      setView: st.setView,
    }))
  );
  const h = headline(id, s, t);

  return (
    <button
      type="button"
      onClick={h.go}
      className="orbit-satellite group flex w-full items-center gap-2.5 border border-line/90 bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent/45"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-accentsoft/70">
        <h.icon size={13} className="text-accent" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] text-dim">{h.label}</span>
        <span className="num block truncate text-[17px] font-semibold leading-tight text-text">
          {h.value}
        </span>
      </span>
      <span className="shrink-0 text-[9.5px] text-faint">{h.note}</span>
    </button>
  );
}

function headline(
  id: WidgetId,
  s: {
    procs: ProcInfo[];
    devs: DevServer[];
    ais: AiProcess[];
    disks: DiskInfo[];
    ports: PortEntry[];
    tasks: Task[];
    files: SessionFilePreview[];
    setView: (v: never) => void;
  },
  t: (k: string, v?: Record<string, string | number>) => string
): { label: string; value: string; note: string; icon: LucideIcon; go?: () => void } {
  const go = (v: string) => () => s.setView(v as never);
  switch (id) {
    case "resources": {
      const total = s.procs.reduce((a, p) => a + (p.cpu ?? 0), 0);
      return {
        label: t("overview.seriesCpuTotal"),
        value: `${formatCpu(total)}`,
        note: t("overview.hubProc"),
        icon: Activity,
      };
    }
    case "categories":
      return {
        label: t("overview.chartCategoryTitle"),
        value: String(s.procs.length),
        note: t("overview.hubProc"),
        icon: Cpu,
      };
    case "disks": {
      const worst = s.disks.reduce(
        (m, d) =>
          Math.max(m, d.total_bytes > 0 ? (d.used_bytes / d.total_bytes) * 100 : 0),
        0
      );
      return {
        label: t("overview.diskTitle"),
        value: `${Math.round(worst)}%`,
        note: `${s.disks.length}`,
        icon: HardDrive,
      };
    }
    case "ports":
      return {
        label: t("overview.portTitle"),
        value: String(s.ports.length),
        note: t("overview.totalListening"),
        icon: Network,
        go: go("servers"),
      };
    case "processes":
      return {
        label: t("overview.topCpuTitle"),
        value: String(s.procs.length),
        note: t("overview.hubProc"),
        icon: Cpu,
        go: go("processes"),
      };
    case "services":
      return {
        label: t("overview.runningServicesTitle"),
        value: String(s.devs.length + s.ais.length),
        note: t("overview.hubSrv"),
        icon: Server,
        go: go("servers"),
      };
    case "tasks": {
      const due = s.tasks.filter((x) => x.status !== "done").length;
      return {
        label: t("overview.recentTasks"),
        value: String(due),
        note: t("overview.goHandle"),
        icon: Activity,
        go: go("tasks"),
      };
    }
    case "sessions":
      return {
        label: t("overview.localSessions"),
        value: String(s.files.length),
        note: "jsonl",
        icon: Inbox,
      };
    default:
      return {
        label: t("overview.heroTitle"),
        value: "—",
        note: "",
        icon: Activity,
      };
  }
}

/** 顶部铭牌：主机 / 系统 / 核数 / 内存 / 运行时长。 */
export function Nameplate() {
  const t = useT();
  const { sysinfo, procs } = useStore(
    useShallow((s) => ({ sysinfo: s.sysinfo, procs: s.procs }))
  );
  if (!sysinfo) return null;
  const memUsed = procs.reduce((a, p) => a + (p.memory ?? 0), 0);
  const totalGb = sysinfo.total_memory / 1024 ** 3;
  const pct = totalGb > 0 ? Math.round((memUsed / 1024 ** 3 / totalGb) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-[var(--radius-btn)] border border-line/70 bg-panel/40 px-3.5 py-2 text-[11px] text-dim">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="font-medium text-text">{sysinfo.hostname}</span>
      </span>
      <span className="h-3 w-px bg-line" aria-hidden="true" />
      <span>{sysinfo.os_name}</span>
      <span className="h-3 w-px bg-line" aria-hidden="true" />
      <span className="flex items-center gap-1">
        <Cpu size={11} className="text-faint" />
        <span className="num text-text">{sysinfo.cpu_cores}</span>
        {t("overview.cpuCores")}
      </span>
      <span className="flex items-center gap-1">
        <HardDrive size={11} className="text-faint" />
        <span className="num text-text">{formatBytes(sysinfo.total_memory)}</span>
        {pct > 0 && (
          <span className="text-faint">{t("overview.memUsedPct", { pct })}</span>
        )}
      </span>
      <span className="flex items-center gap-1">
        <Clock size={11} className="text-faint" />
        {t("overview.uptime")}{" "}
        <span className="num text-text">{formatUptime(sysinfo.uptime_seconds)}</span>
      </span>
    </div>
  );
}
