import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, SearchX, XCircle } from "lucide-react";
import { Badge, Btn, Empty, Td, Tr } from "../../ui";
import { formatBytes, fromNow, shortPath } from "../../lib/util";
import { useStore } from "../../lib/store";
import { localeFor, useLang, useT } from "../../lib/i18n";
import type { ProcInfo } from "../../types";

/** 虚拟滚动估算尺寸：普通行固定，展开详情行内容高度不定，交由实测修正 */
const ROW_H = 37;
const DETAIL_H = 170;
const OVERSCAN = 12;

type Unit = { kind: "row" | "detail"; p: ProcInfo };

/**
 * 进程表：虚拟滚动 + 行内展开。
 *
 * 从页面里拆出来的原因：虚拟滚动的测量逻辑与行 JSX 一起占 200 行，
 * 页面本身的圈复杂度因此到 14（红线 10）。拆开后页面只负责「取数 +
 * 两三种状态」，表格可以独立测（render 20 行只挂载视口内的几行）。
 */
export function ProcessTable({
  procs,
  aiPids,
  devPids,
  onClearFilter,
  canClear,
}: {
  procs: ProcInfo[];
  aiPids: Set<number>;
  devPids: Set<number>;
  onClearFilter: () => void;
  canClear: boolean;
}) {
  const t = useT();
  const [expandedPid, setExpandedPid] = useState<number | null>(null);

  // 把「进程行 + 其展开的详情行」摊平成一条可测量的单元序列：详情行高度随
  // 命令行长度变化，react-virtual 先按估算值排版，再对进入视口的单元实测修正。
  const units = useMemo(() => {
    const out: Unit[] = [];
    for (const p of procs) {
      out.push({ kind: "row", p });
      if (expandedPid === p.pid) out.push({ kind: "detail", p });
    }
    return out;
  }, [procs, expandedPid]);

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
  }, [procs]);

  if (procs.length === 0) {
    return (
      <Empty
        icon={SearchX}
        action={
          canClear ? (
            <Btn className="!px-2 !py-0.5 !text-[11px]" onClick={onClearFilter}>
              {t("procs.clearFilter")}
            </Btn>
          ) : undefined
        }
      >
        {t("procs.noMatch")}
      </Empty>
    );
  }

  const rows = virtualizer.getVirtualItems();
  const padTop = rows.length ? rows[0].start : 0;
  const padBottom = rows.length
    ? virtualizer.getTotalSize() - rows[rows.length - 1].end
    : 0;

  return (
    <div ref={scrollRef} className="max-h-[60vh] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-line text-left text-xs text-dim">
            {headers(t).map((h, i) => (
              <th key={i} className="whitespace-nowrap bg-panel px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && <Spacer height={padTop} />}
          {rows.map((v) => {
            const unit = units[v.index];
            if (!unit) return null;
            return (
              <ProcessUnit
                key={unit.kind === "detail" ? `d-${unit.p.pid}` : unit.p.pid}
                unit={unit}
                index={v.index}
                measure={virtualizer.measureElement}
                expanded={expandedPid === unit.p.pid}
                onToggle={() =>
                  setExpandedPid(expandedPid === unit.p.pid ? null : unit.p.pid)
                }
                aiPids={aiPids}
                devPids={devPids}
              />
            );
          })}
          {padBottom > 0 && <Spacer height={padBottom} />}
        </tbody>
      </table>
    </div>
  );
}

/** 表头。空字符串是第一列（展开箭头）。 */
function headers(t: (key: string) => string): string[] {
  return [
    "",
    "PID",
    t("procs.colName"),
    "CPU",
    t("procs.colMemory"),
    t("procs.colStatus"),
    t("procs.colStarted"),
    t("procs.colPath"),
    t("procs.colAction"),
  ];
}

/** 虚拟滚动的上下占位行：保持滚动条总高度与实际内容一致。 */
function Spacer({ height }: { height: number }) {
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={9} className="p-0" />
    </tr>
  );
}

/** 一行进程，或它的展开详情。 */
function ProcessUnit(props: {
  unit: Unit;
  index: number;
  measure: (el: Element | null) => void;
  expanded: boolean;
  onToggle: () => void;
  aiPids: Set<number>;
  devPids: Set<number>;
}) {
  if (props.unit.kind === "detail") {
    return <ProcessDetail p={props.unit.p} index={props.index} measure={props.measure} />;
  }
  return <ProcessRow {...props} />;
}

/** 展开的详情行：可执行路径、父 PID、启动时间、完整命令行。 */
function ProcessDetail({
  p,
  index,
  measure,
}: {
  p: ProcInfo;
  index: number;
  measure: (el: Element | null) => void;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <Tr data-index={index} ref={measure}>
      <Td colSpan={9} className="bg-panel/60 px-4 py-3">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <span className="text-dim">{t("procs.detailExePath")}</span>
            <div className="mt-0.5 break-all font-mono text-[11px] text-text">
              {p.exe_path || "—"}
            </div>
          </div>
          <div>
            <span className="text-dim">{t("procs.detailParentPid")}</span>
            <div className="mt-0.5 font-mono text-text">
              {p.parent_pid ?? t("procs.detailNoParent")}
            </div>
          </div>
          <div>
            <span className="text-dim">{t("procs.detailStartTime")}</span>
            <div className="mt-0.5 text-text">
              {new Date(p.start_time * 1000).toLocaleString(localeFor(lang))}
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

/** 普通进程行。整行可点击/可回车展开，右侧是终止按钮。 */
function ProcessRow({
  unit,
  index,
  measure,
  expanded,
  onToggle,
  aiPids,
  devPids,
}: {
  unit: Unit;
  index: number;
  measure: (el: Element | null) => void;
  expanded: boolean;
  onToggle: () => void;
  aiPids: Set<number>;
  devPids: Set<number>;
}) {
  const t = useT();
  const { p } = unit;
  const risky = aiPids.has(p.pid) || devPids.has(p.pid) || p.cpu > 50;

  return (
    <Tr
      data-index={index}
      ref={measure}
      className={expanded ? "bg-accentsoft/10" : ""}
      onClick={onToggle}
      // 表格行本身不可聚焦，键盘用户无法展开详情：补 role/tabIndex
      // 与 Enter/Space，和鼠标点击等价。
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Td className="w-6">
        <Chevron expanded={expanded} />
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
        <CpuCell cpu={p.cpu} />
      </Td>
      <Td>{formatBytes(p.memory)}</Td>
      <Td className="text-dim">{p.status}</Td>
      <Td className="text-xs text-dim">{fromNow(p.start_time)}</Td>
      <Td className="max-w-[240px]">
        <div
          className="truncate font-mono text-[11px] text-dim"
          title={p.cmd_line || p.exe_path}
        >
          {p.cmd_line ? shortPath(p.cmd_line, 60) : shortPath(p.exe_path, 60)}
        </div>
      </Td>
      <Td>
        <Btn
          variant={risky ? "danger" : "ghost"}
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
}

/** 展开箭头。收起时右向、展开时下向且用强调色。 */
function Chevron({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown size={12} className="text-accent" />
  ) : (
    <ChevronRight size={12} className="text-dim" />
  );
}

/** CPU 读数 + 迷你条。阈值色分三档：>50 危险、>10 警告、其余强调色。 */
function CpuCell({ cpu }: { cpu: number }) {
  const tone = cpu > 50 ? "text-danger" : cpu > 10 ? "text-warn" : "";
  const bar = cpu > 50 ? "bg-danger" : cpu > 10 ? "bg-warn" : "bg-accent";
  return (
    <div className="flex items-center gap-2">
      <span className={`num w-11 text-right ${tone}`}>{cpu.toFixed(1)}%</span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-panel2">
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${Math.min(100, cpu)}%` }}
        />
      </span>
    </div>
  );
}
