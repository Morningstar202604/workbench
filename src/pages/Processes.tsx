import { useMemo, useState } from "react";
import { Cpu, MemoryStick, Search } from "lucide-react";
import { EChart } from "../lib/echarts";
import { seriesColors } from "../lib/chartTheme";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { Btn, Card, ErrorState, SkeletonCard, Spinner, StatCard, inputCls } from "../ui";
import { formatBytes } from "../lib/util";
import { cpuHistogram, memoryHistogram } from "../lib/aggregate";
import { filterProcs, type ProcSortKey } from "./processFilter";
import { ProcessTable } from "./processes/ProcessTable";
import { useT } from "../lib/i18n";
import type { Bucket } from "../lib/aggregate";
import type { ProcInfo } from "../types";
import type { EChartsCoreOption } from "echarts/core";

const SORTS: { key: ProcSortKey; labelKey: string }[] = [
  { key: "cpu", labelKey: "procs.sortCpu" },
  { key: "memory", labelKey: "procs.sortMemory" },
  { key: "pid", labelKey: "procs.sortPid" },
  { key: "name", labelKey: "procs.sortName" },
];

const CHIPS = [
  ["all", "procs.chipAll"],
  ["ai", "procs.chipAi"],
  ["dev", "procs.chipDev"],
] as const;

type Chip = "all" | "ai" | "dev";

export default function Processes() {
  const t = useT();
  const { procs, devs, ais, loading, runtimeError, refreshRuntime, theme } = useStore(
    useShallow((s) => ({
      procs: s.procs,
      devs: s.devs,
      ais: s.ais,
      loading: s.loading,
      runtimeError: s.runtimeError,
      refreshRuntime: s.refreshRuntime,
      theme: s.theme,
    }))
  );
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProcSortKey>("cpu");
  const [chip, setChip] = useState<Chip>("all");

  const aiPids = useMemo(() => new Set(ais.map((a) => a.pid)), [ais]);
  const devPids = useMemo(() => new Set(devs.map((d) => d.pid)), [devs]);
  const filteredProcs = useMemo(
    () => filterProcs(procs, { query: q, chip, sort, aiPids, devPids }),
    [procs, q, chip, sort, aiPids, devPids]
  );

  const colors = useMemo(() => seriesColors(theme), [theme]);
  const cpuChart = useMemo(() => histogram(cpuHistogram(procs), colors), [procs, colors]);
  const memChart = useMemo(
    () => histogram(memoryHistogram(procs), colors),
    [procs, colors]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 首次加载：进程表还没数据时给骨架，而不是四张 0 卡 + 空图表 */}
      {procs.length === 0 && loading && !runtimeError && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
        </div>
      )}

      {/* 采集失败：内联可重试，而不是只弹一个几秒后消失的 toast */}
      {runtimeError && procs.length === 0 && (
        <ErrorState
          onRetry={() => void refreshRuntime()}
          retryLabel={t("app.refreshNow")}
        >
          {t("procs.loadFailed", { err: runtimeError })}
        </ErrorState>
      )}

      <Summary procs={procs} />
      <Distribution cpu={cpuChart} mem={memChart} />

      <Card className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[160px] flex-1 sm:min-w-[220px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim"
          />
          <input
            className={`${inputCls} pl-8`}
            aria-label={t("procs.searchPlaceholder")}
            placeholder={t("procs.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ChipFilter chip={chip} onPick={setChip} />
        <SortSelect sort={sort} onPick={setSort} />
        <span className="text-xs text-dim">
          {loading ? (
            <Spinner />
          ) : (
            t("procs.procCount", { shown: filteredProcs.length, total: procs.length })
          )}
        </span>
        <Btn onClick={refreshRuntime} className="ml-auto">
          {t("procs.refresh")}
        </Btn>
      </Card>

      <Card>
        <ProcessTable
          procs={filteredProcs}
          aiPids={aiPids}
          devPids={devPids}
          canClear={Boolean(q) || chip !== "all"}
          onClearFilter={() => {
            setQ("");
            setChip("all");
          }}
        />
      </Card>
      <p className="px-1 text-[11px] text-dim">{t("procs.tableHint")}</p>
    </div>
  );
}

/** 四张统计卡：总数、CPU 合计、内存合计、高 CPU 进程数。 */
function Summary({ procs }: { procs: ProcInfo[] }) {
  const t = useT();
  const cpu = procs.reduce((a, p) => a + (p.cpu ?? 0), 0);
  const mem = procs.reduce((a, p) => a + (p.memory ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Cpu}
        label={t("procs.statTotal")}
        value={procs.length}
        tone="accent"
      />
      <StatCard
        icon={Cpu}
        label={t("procs.sortCpu")}
        value={`${cpu.toFixed(0)}%`}
        tone="warn"
      />
      <StatCard
        icon={MemoryStick}
        label={t("procs.statMemoryTotal")}
        value={formatBytes(mem)}
        tone="ok"
      />
      <StatCard
        icon={Search}
        label={t("procs.statHighCpu")}
        value={procs.filter((p) => p.cpu > 10).length}
        tone="danger"
      />
    </div>
  );
}

/** CPU / 内存分布直方图。 */
function Distribution({ cpu, mem }: { cpu: EChartsCoreOption; mem: EChartsCoreOption }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Cpu size={14} className="text-warn" /> {t("procs.cpuDistTitle")}
        </h3>
        <EChart option={cpu} style={{ height: 170 }} lazyUpdate />
      </Card>
      <Card>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <MemoryStick size={14} className="text-ok" /> {t("procs.memDistTitle")}
        </h3>
        <EChart option={mem} style={{ height: 170 }} lazyUpdate />
      </Card>
    </div>
  );
}

/** 筛选胶囊：全部 / AI / 开发服务器。 */
function ChipFilter({ chip, onPick }: { chip: Chip; onPick: (c: Chip) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5">
      {CHIPS.map(([key, labelKey]) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          className={`rounded-[var(--radius-btn)] border px-2.5 py-1 text-xs transition-colors ${
            chip === key
              ? "border-accent/50 bg-accentsoft text-accent"
              : "border-line bg-panel2 text-dim hover:text-text"
          }`}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

/** 排序下拉。 */
function SortSelect({
  sort,
  onPick,
}: {
  sort: ProcSortKey;
  onPick: (s: ProcSortKey) => void;
}) {
  const t = useT();
  return (
    <label className="flex items-center gap-1.5 text-xs text-dim">
      {t("procs.sortLabel")}
      <select
        className="rounded-[var(--radius-btn)] border border-line bg-panel2 px-2 py-1 text-xs text-text outline-none"
        value={sort}
        onChange={(e) => onPick(e.target.value as ProcSortKey)}
      >
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {t(s.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 直方图选项：0 值不显示标签（标签会贴在轴上像散落字符）。 */
function histogram(bins: Bucket[], palette: string[]) {
  return {
    grid: { left: 36, right: 16, top: 12, bottom: 24 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: bins.map((b) => b.label),
      axisLabel: { fontSize: 9 },
    },
    yAxis: {
      type: "value",
      axisLabel: { fontSize: 9 },
      splitLine: { lineStyle: { type: "dashed" } },
    },
    series: [
      {
        id: "histogram",
        type: "bar",
        data: bins.map((b, i) => ({
          value: b.count,
          itemStyle: {
            color: palette[i % palette.length],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: "60%",
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          formatter: (p: { value: number }) => (p.value > 0 ? String(p.value) : ""),
        },
      },
    ],
  };
}
