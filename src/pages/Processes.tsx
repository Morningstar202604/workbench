import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { seriesColors } from "../lib/chartTheme";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { Badge, Btn, Card, Empty, Spinner, StatCard, Td, Tr, inputCls } from "../ui";
import { formatBytes, fromNow, shortPath } from "../lib/util";
import { cpuHistogram, memoryHistogram } from "../lib/aggregate";
import { useT, useLang, localeFor } from "../lib/i18n";
import type { ProcInfo } from "../types";

type SortKey = "cpu" | "memory" | "pid" | "name";

const SORTS: { key: SortKey; labelKey: string }[] = [
  { key: "cpu", labelKey: "procs.sortCpu" },
  { key: "memory", labelKey: "procs.sortMemory" },
  { key: "pid", labelKey: "procs.sortPid" },
  { key: "name", labelKey: "procs.sortName" },
];

/** 虚拟滚动估算尺寸：普通行固定，展开详情行内容高度不定，交由实测修正 */
const ROW_H = 37;
const DETAIL_H = 170;
const OVERSCAN = 12;

export default function Processes() {
  const t = useT();
  const lang = useLang();
  const { procs, devs, ais, loading, refreshRuntime, theme } = useStore(
    useShallow((s) => ({
      procs: s.procs,
      devs: s.devs,
      ais: s.ais,
      loading: s.loading,
      refreshRuntime: s.refreshRuntime,
      theme: s.theme,
    }))
  );
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

  // ── 虚拟滚动 ────────────────────────────────────────────
  // 把「进程行 + 其展开的详情行」摊平成一条可测量的单元序列：详情行高度随
  // 命令行长度变化，react-virtual 先按估算值排版，再对进入视口的单元实测修正。
  const units = useMemo(() => {
    const out: { kind: "row" | "detail"; p: ProcInfo }[] = [];
    for (const p of filteredProcs) {
      out.push({ kind: "row", p });
      if (expandedPid === p.pid) out.push({ kind: "detail", p });
    }
    return out;
  }, [filteredProcs, expandedPid]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: units.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (units[i]?.kind === "detail" ? DETAIL_H : ROW_H),
    overscan: OVERSCAN,
  });

  // 展开/收起会改变「索引 ↔ 单元」的对应关系，实测高度缓存按索引存放，必须清掉
  useEffect(() => {
    virtualizer.measure();
  }, [expandedPid, virtualizer]);

  // 筛选条件变化后列表整体换血，回到顶部，避免停留在旧滚动位置看到空白区
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [q, sort, chip]);

  const virtualRows = virtualizer.getVirtualItems();
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const cpuBins = useMemo(() => cpuHistogram(procs), [procs]);
  const memBins = useMemo(() => memoryHistogram(procs), [procs]);
  const colors = useMemo(() => seriesColors(theme), [theme]);

  const histogramOption = useMemo(
    () => (bins: { label: string; count: number }[], palette: string[]) => ({
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
          type: "bar",
          data: bins.map((b, i) => ({
            value: b.count,
            itemStyle: {
              color: palette[i % palette.length],
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: "60%",
          label: { show: true, position: "top", fontSize: 10 },
        },
      ],
    }),
    []
  );

  const cpuChart = useMemo(
    () => histogramOption(cpuBins, colors),
    [cpuBins, colors, histogramOption]
  );
  const memChart = useMemo(
    () => histogramOption(memBins, colors),
    [memBins, colors, histogramOption]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── 摘要 + 分布图 ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Cpu}
          label={t("procs.statTotal")}
          value={procs.length}
          tone="accent"
          bar="bg-accent"
        />
        <StatCard
          icon={Cpu}
          label={t("procs.sortCpu")}
          value={`${procs.reduce((a, p) => a + (p.cpu ?? 0), 0).toFixed(0)}%`}
          tone="warn"
          bar="bg-warn"
        />
        <StatCard
          icon={MemoryStick}
          label={t("procs.statMemoryTotal")}
          value={formatBytes(procs.reduce((a, p) => a + (p.memory ?? 0), 0))}
          tone="ok"
          bar="bg-ok"
        />
        <StatCard
          icon={Search}
          label={t("procs.statHighCpu")}
          value={procs.filter((p) => p.cpu > 10).length}
          tone="danger"
          bar="bg-danger"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Cpu size={14} className="text-warn" /> {t("procs.cpuDistTitle")}
          </h3>
          <EChart option={cpuChart} style={{ height: 170 }} notMerge lazyUpdate />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <MemoryStick size={14} className="text-ok" /> {t("procs.memDistTitle")}
          </h3>
          <EChart option={memChart} style={{ height: 170 }} notMerge lazyUpdate />
        </Card>
      </div>

      {/* ── 搜索栏 ── */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim"
          />
          <input
            className={`${inputCls} pl-8`}
            placeholder={t("procs.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              ["all", "procs.chipAll"],
              ["ai", "procs.chipAi"],
              ["dev", "procs.chipDev"],
            ] as const
          ).map(([key, labelKey]) => (
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
              {t(labelKey)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-dim">
          {t("procs.sortLabel")}
          <select
            className="rounded-lg border border-line bg-panel2 px-2 py-1 text-xs text-text outline-none"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>
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

      {/* ── 进程表格（虚拟滚动：只渲染视口内的行） ── */}
      {/* max-h 而非固定高：筛出少量行时表格随内容收缩，滚动条不会留一片空白 */}
      <Card>
        {filteredProcs.length === 0 ? (
          <Empty icon={SearchX}>{t("procs.noMatch")}</Empty>
        ) : (
          <div ref={scrollRef} className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line text-left text-xs text-dim">
                  {[
                    "",
                    "PID",
                    t("procs.colName"),
                    "CPU",
                    t("procs.colMemory"),
                    t("procs.colStatus"),
                    t("procs.colStarted"),
                    t("procs.colPath"),
                    t("procs.colAction"),
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap bg-panel px-3 py-2 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {padTop > 0 && (
                  <tr aria-hidden="true" style={{ height: padTop }}>
                    <td colSpan={9} className="p-0" />
                  </tr>
                )}
                {virtualRows.map((v) => {
                  const unit = units[v.index];
                  if (!unit) return null;
                  const { p } = unit;

                  if (unit.kind === "detail") {
                    return (
                      <Tr
                        key={`d-${p.pid}`}
                        data-index={v.index}
                        ref={virtualizer.measureElement}
                      >
                        <Td colSpan={9} className="bg-panel/60 px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                            <div>
                              <span className="text-dim">{t("procs.detailExePath")}</span>
                              <div className="mt-0.5 break-all font-mono text-[11px] text-text">
                                {p.exe_path || "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-dim">
                                {t("procs.detailParentPid")}
                              </span>
                              <div className="mt-0.5 font-mono text-text">
                                {p.parent_pid ?? t("procs.detailNoParent")}
                              </div>
                            </div>
                            <div>
                              <span className="text-dim">
                                {t("procs.detailStartTime")}
                              </span>
                              <div className="mt-0.5 text-text">
                                {new Date(p.start_time * 1000).toLocaleString(
                                  localeFor(lang)
                                )}
                              </div>
                            </div>
                            <div className="sm:col-span-3">
                              <span className="text-dim">{t("procs.detailCmdLine")}</span>
                              <code className="mt-0.5 block break-all rounded bg-bg px-2 py-1.5 font-mono text-[11px] text-dim">
                                {p.cmd_line || "—"}
                              </code>
                            </div>
                          </div>
                        </Td>
                      </Tr>
                    );
                  }

                  const expanded = expandedPid === p.pid;
                  const toggle = () => setExpandedPid(expanded ? null : p.pid);
                  return (
                    <Tr
                      key={p.pid}
                      data-index={v.index}
                      ref={virtualizer.measureElement}
                      className={expanded ? "bg-accentsoft/10" : ""}
                      onClick={toggle}
                      // 表格行本身不可聚焦，键盘用户无法展开详情：补 role/tabIndex
                      // 与 Enter/Space，和鼠标点击等价。
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                    >
                      <Td className="w-6">
                        {expanded ? (
                          <ChevronDown size={12} className="text-accent" />
                        ) : (
                          <ChevronRight size={12} className="text-dim" />
                        )}
                      </Td>
                      <Td mono className="text-dim">
                        {p.pid}
                      </Td>
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
                                p.cpu > 50
                                  ? "bg-danger"
                                  : p.cpu > 10
                                    ? "bg-warn"
                                    : "bg-accent"
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
                        <div
                          className="truncate font-mono text-[11px] text-dim"
                          title={p.cmd_line || p.exe_path}
                        >
                          {p.cmd_line
                            ? shortPath(p.cmd_line, 60)
                            : shortPath(p.exe_path, 60)}
                        </div>
                      </Td>
                      <Td>
                        <Btn
                          variant={
                            aiPids.has(p.pid) || devPids.has(p.pid) || p.cpu > 50
                              ? "danger"
                              : "ghost"
                          }
                          className="!px-2 !py-1 !text-xs"
                          title={t("procs.killTitle")}
                          onClick={() => {
                            useStore.getState().setKillTarget(p);
                          }}
                        >
                          <XCircle size={12} />
                        </Btn>
                      </Td>
                    </Tr>
                  );
                })}
                {padBottom > 0 && (
                  <tr aria-hidden="true" style={{ height: padBottom }}>
                    <td colSpan={9} className="p-0" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="px-1 text-[11px] text-dim">{t("procs.tableHint")}</p>
    </div>
  );
}
