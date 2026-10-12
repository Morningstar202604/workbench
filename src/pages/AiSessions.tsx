import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  DollarSign,
  Hash,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { EChart } from "../lib/echarts";
import { chartGapColor } from "../lib/chartTheme";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Modal,
  SectionTitle,
  Spinner,
  StatCard,
  Table,
  Td,
  Tr,
} from "../ui";
import {
  formatBytes,
  formatDuration,
  formatTime,
  formatTokens,
  formatUsd,
  fromNow,
} from "../lib/util";
import type { SessionFilePreview } from "../types";

const COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa"];

// ════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════

export default function AiSessions() {
  const {
    theme,
    ais,
    sessions,
    opencodePort,
    sessionsErr,
    sessionFiles,
    sessionDetail,
    sessionDetailLoading,
    loadSessionDetail,
    refreshAi,
    setToast,
    // 成本
    costOverview,
    costTrend,
    costModelBreakdown,
    costLoading,
    loadCostOverview,
    scanCosts,
    clearCosts,
  } = useStore(
    useShallow((s) => ({
      theme: s.theme,
      ais: s.ais,
      sessions: s.sessions,
      opencodePort: s.opencodePort,
      sessionsErr: s.sessionsErr,
      sessionFiles: s.sessionFiles,
      sessionDetail: s.sessionDetail,
      sessionDetailLoading: s.sessionDetailLoading,
      loadSessionDetail: s.loadSessionDetail,
      refreshAi: s.refreshAi,
      setToast: s.setToast,
      costOverview: s.costOverview,
      costTrend: s.costTrend,
      costModelBreakdown: s.costModelBreakdown,
      costLoading: s.costLoading,
      loadCostOverview: s.loadCostOverview,
      scanCosts: s.scanCosts,
      clearCosts: s.clearCosts,
    }))
  );

  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<SessionFilePreview | null>(null);

  useEffect(() => {
    refreshAi();
    loadCostOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 成本总 token 数 ──────────────────────────────────────
  const totalTokensDisplay = useMemo(() => {
    if (!costOverview) return "—";
    return formatTokens(
      costOverview.total_input_tokens + costOverview.total_output_tokens
    );
  }, [costOverview]);

  // ── 图表：成本趋势 ──────────────────────────────────────
  const costTrendChart = useMemo(() => {
    if (!costTrend.length) return null;
    const days = costTrend.map((r) => r.day.slice(5)); // MM-DD
    return {
      grid: { left: 50, right: 16, top: 20, bottom: 24 },
      tooltip: {
        trigger: "axis",
        formatter: (
          params: { name: string; value: number; seriesName: string; marker: string }[]
        ) => {
          const p = params[0];
          return `${p.name}<br/>成本: $${p.value.toFixed(3)}`;
        },
      },
      legend: { data: ["成本 (USD)"], top: 0, right: 8, textStyle: { fontSize: 10 } },
      xAxis: { type: "category", data: days, boundaryGap: false },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 10, formatter: (v: number) => `$${v.toFixed(2)}` },
      },
      series: [
        {
          name: "成本 (USD)",
          type: "line",
          smooth: true,
          data: costTrend.map((r) => Math.round(r.cost * 1000) / 1000),
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#22d3ee30" },
                { offset: 1, color: "#22d3ee05" },
              ],
            },
          },
          lineStyle: { width: 2 },
          itemStyle: { color: "#22d3ee" },
          symbol: "circle",
          symbolSize: 5,
        },
      ],
    };
  }, [costTrend]);

  // ── 图表：模型分解（饼图，按成本）──────────────────────
  const modelBreakdownChart = useMemo(() => {
    if (!costModelBreakdown.length) return null;
    const topN = costModelBreakdown.slice(0, 6);
    const data = topN.map((r, i) => ({
      name: r.model.length > 20 ? r.model.slice(0, 20) + "…" : r.model,
      value: Math.round(r.cost * 1000) / 1000,
      itemStyle: { color: COLORS[i % COLORS.length] },
    }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: ${c} ({d}%)" },
      legend: {
        orient: "vertical",
        right: 8,
        top: "middle",
        textStyle: { fontSize: 10 },
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "68%"],
          center: ["35%", "50%"],
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderColor: chartGapColor(theme), borderWidth: 2 },
          data,
        },
      ],
    };
  }, [costModelBreakdown, theme]);

  // ── 预算状态 ──────────────────────────────────────────────
  const budgetStatus = useMemo(() => {
    if (!costOverview) return null;
    return {
      dailyPct: costOverview.daily_pct,
      monthlyPct: costOverview.monthly_pct,
      exceeded: costOverview.budget_exceeded,
      nearLimit:
        costOverview.daily_pct >= costOverview.alert_threshold_pct ||
        costOverview.monthly_pct >= costOverview.alert_threshold_pct,
    };
  }, [costOverview]);

  // ── 总消息数 ──────────────────────────────────────────────
  const totalMessages = useMemo(
    () => sessionFiles.reduce((acc, f) => acc + (f.message_count ?? 0), 0),
    [sessionFiles]
  );

  // ── 图表：AI 进程内存分布 ──────────────────────────────
  const aiMemChart = useMemo(() => {
    const sorted = [...ais].sort((a, b) => b.memory - a.memory).slice(0, 8);
    return {
      grid: { left: 90, right: 40, top: 8, bottom: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { type: "dashed" } },
      },
      yAxis: {
        type: "category",
        data: sorted.map((a) =>
          a.name.length > 16 ? a.name.slice(0, 16) + "…" : a.name
        ),
        inverse: true,
        axisLabel: { fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((a) => ({
            value: Math.round(a.memory / 1024 / 1024),
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: "#22d3ee40" },
                  { offset: 1, color: "#22d3ee" },
                ],
              },
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 14,
          label: { show: true, position: "right", fontSize: 10, formatter: "{c} MB" },
        },
      ],
    };
  }, [ais]);

  // ── 图表：会话文件工具分布 ──────────────────────────────
  const sessionToolChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of sessionFiles) counts[f.tool] = (counts[f.tool] ?? 0) + 1;
    const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return {
      tooltip: { trigger: "item", formatter: "{b}: {c} 个文件 ({d}%)" },
      series: [
        {
          type: "pie",
          radius: ["42%", "64%"],
          label: { show: false },
          labelLine: { show: false },
          data: data.map((d, i) => ({
            ...d,
            itemStyle: {
              color: COLORS[i % COLORS.length],
              borderColor: chartGapColor(theme),
              borderWidth: 2,
            },
          })),
        },
      ],
    };
  }, [sessionFiles, theme]);

  // ── 会话详情加载 ──────────────────────────────────────────
  const openSessionDetail = (port: number, id: string) => {
    if (expandedSession === id) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(id);
    loadSessionDetail(port, id);
  };

  const toolsFromDetail = sessionDetail ? toolDist(sessionDetail.tools_used) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* ── ═══════════════════════════════════════════════════ ── */}
      {/* ── 成本仪表盘 ── */}
      {/* ── ═══════════════════════════════════════════════════ ── */}

      {/* 预算告警横幅 */}
      {budgetStatus?.exceeded && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger shrink-0" />
          <span className="text-danger font-medium">
            预算告警：今日 {budgetStatus.dailyPct.toFixed(0)}% / 本月{" "}
            {budgetStatus.monthlyPct.toFixed(0)}% 已超限额
          </span>
        </div>
      )}
      {budgetStatus?.nearLimit && !budgetStatus.exceeded && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-warn shrink-0" />
          <span className="text-warn font-medium">
            预算提醒：今日 {budgetStatus.dailyPct.toFixed(0)}% / 本月{" "}
            {budgetStatus.monthlyPct.toFixed(0)}% 接近 {costOverview?.alert_threshold_pct}
            % 阈值
          </span>
        </div>
      )}

      {/* 概览卡片 + 操作按钮 */}
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={DollarSign}
            label="今日成本"
            value={costOverview ? formatUsd(costOverview.today_cost) : "—"}
            tone="warn"
            bar="bg-warn"
            hint={
              costOverview
                ? `${formatTokens(costOverview.today_input_tokens + costOverview.today_output_tokens)} tokens`
                : undefined
            }
          />
          <StatCard
            icon={TrendingUp}
            label="本月成本"
            value={costOverview ? formatUsd(costOverview.month_cost) : "—"}
            tone="accent"
            bar="bg-accent"
            hint={
              costOverview
                ? `${formatTokens(costOverview.month_input_tokens + costOverview.month_output_tokens)} tokens`
                : undefined
            }
          />
          <StatCard
            icon={Coins}
            label="累计成本"
            value={costOverview ? formatUsd(costOverview.total_cost) : "—"}
            tone="ok"
            bar="bg-ok"
            hint={costOverview ? `${costOverview.record_count} 条记录` : undefined}
          />
          <StatCard
            icon={Hash}
            label="累计 Token"
            value={totalTokensDisplay}
            tone="text"
            bar="bg-accent"
            hint={
              costOverview
                ? `实测 ${costOverview.measured_count} / 估算 ${costOverview.estimated_count}`
                : undefined
            }
          />
        </div>
        <div className="ml-3 flex shrink-0 flex-col gap-2">
          <Btn
            onClick={scanCosts}
            disabled={costLoading}
            title="扫描 session 文件提取 token 用量并计算成本"
          >
            {costLoading ? <Spinner /> : <RefreshCw size={14} />}
            {costLoading ? "扫描中…" : "扫描成本"}
          </Btn>
          <Btn
            onClick={() => {
              if (confirm("确定清空所有成本记录？")) clearCosts();
            }}
            className="!py-1 !text-xs"
            title="清空成本数据"
          >
            <Trash2 size={12} /> 清空
          </Btn>
        </div>
      </div>

      {/* 预算进度条 */}
      {costOverview &&
        (costOverview.daily_budget > 0 || costOverview.monthly_budget > 0) && (
          <Card className="p-4">
            <SectionTitle>预算进度</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-2">
              {costOverview.daily_budget > 0 && (
                <BudgetBar
                  label="今日"
                  pct={costOverview.daily_pct}
                  spent={costOverview.today_cost}
                  total={costOverview.daily_budget}
                />
              )}
              {costOverview.monthly_budget > 0 && (
                <BudgetBar
                  label="本月"
                  pct={costOverview.monthly_pct}
                  spent={costOverview.month_cost}
                  total={costOverview.monthly_budget}
                />
              )}
            </div>
          </Card>
        )}

      {/* 图表行 */}
      {(costTrendChart || modelBreakdownChart) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {costTrendChart && (
            <Card className="p-4 lg:col-span-3">
              <SectionTitle>成本趋势（近 14 天）</SectionTitle>
              <EChart
                option={costTrendChart}
                style={{ height: 200 }}
                notMerge
                lazyUpdate
              />
            </Card>
          )}
          {modelBreakdownChart && (
            <Card className="p-4 lg:col-span-2">
              <SectionTitle>模型成本构成</SectionTitle>
              <EChart
                option={modelBreakdownChart}
                style={{ height: 200 }}
                notMerge
                lazyUpdate
              />
              <div className="mt-2 space-y-1">
                {costModelBreakdown.slice(0, 5).map((r, i) => (
                  <div key={r.model} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="flex-1 truncate text-dim" title={r.model}>
                      {r.model}
                    </span>
                    <span className="font-mono text-text">{formatUsd(r.cost)}</span>
                    <span className="text-dim">
                      {formatTokens(r.input_tokens + r.output_tokens)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 原有 AI 会话监控内容                                     */}
      {/* ═══════════════════════════════════════════════════════ */}

      {/* ── 摘要条 ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="AI 进程"
          value={ais.length}
          tone="warn"
          bar="bg-warn"
        />
        <StatCard
          icon={MessageSquare}
          label="在线会话"
          value={sessions.length}
          tone="accent"
          bar="bg-accent"
        />
        <StatCard
          icon={Terminal}
          label="本地会话文件"
          value={sessionFiles.length}
          tone="ok"
          bar="bg-ok"
        />
        <StatCard
          icon={Hash}
          label="总消息数"
          value={totalMessages || "—"}
          tone="text"
          bar="bg-accent"
        />
      </div>

      {/* ── AI 进程内存图 ── */}
      <Card className="p-4">
        <SectionTitle>AI 进程内存占用</SectionTitle>
        {ais.length > 0 ? (
          <EChart
            option={aiMemChart}
            style={{ height: Math.max(120, ais.length * 36) }}
            notMerge
            lazyUpdate
          />
        ) : (
          <Empty icon={Sparkles}>当前没有 AI 进程在运行</Empty>
        )}
      </Card>

      {/* ── AI 代理进程列表 ── */}
      <Card className="p-4">
        <SectionTitle>AI 代理进程（{ais.length}）</SectionTitle>
        {ais.length === 0 ? (
          <Empty>
            当前没有检测到 AI 编码代理进程（opencode / claude / codex / cursor 等）
          </Empty>
        ) : (
          <Table head={["进程", "命中关键词", "PID", "内存", "启动时间", "命令行"]}>
            {ais.map((a) => (
              <Tr key={a.pid}>
                <Td className="font-medium">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-warn" />
                    {a.name}
                  </span>
                </Td>
                <Td>
                  <Badge tone="warn">{a.matched}</Badge>
                </Td>
                <Td mono className="text-dim">
                  {a.pid}
                </Td>
                <Td>{formatBytes(a.memory)}</Td>
                <Td className="text-xs text-dim">{fromNow(a.start_time)}</Td>
                <Td
                  className="max-w-[280px] truncate font-mono text-[11px] text-dim"
                  title={a.cmd_line}
                >
                  {a.cmd_line}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      {/* ── opencode 在线会话 ── */}
      <Card className="p-4">
        <SectionTitle
          extra={
            <Btn onClick={refreshAi} className="!py-1 !text-xs">
              <RefreshCw size={12} /> 刷新
            </Btn>
          }
        >
          opencode 在线会话（{sessions.length}）
        </SectionTitle>
        {sessions.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Empty>未能连接到 opencode 服务（默认端口 4096）</Empty>
            {sessionsErr && (
              <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                {sessionsErr}
                <br />
                提示：先运行 <span className="font-mono">opencode serve</span>，再点刷新。
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => {
              const expanded = expandedSession === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-line bg-panel2 overflow-hidden transition-all"
                >
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accentsoft/30 transition-colors"
                    onClick={() => openSessionDetail(opencodePort, s.id)}
                  >
                    {expanded ? (
                      <ChevronDown size={14} className="text-accent shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-dim shrink-0" />
                    )}
                    <MessageSquare size={14} className="text-accent shrink-0" />
                    <span className="font-medium flex-1 truncate">{s.title}</span>
                    <span className="font-mono text-xs text-dim hidden sm:block">
                      {s.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-dim">
                      {s.created ? formatTime(s.created) : ""}
                    </span>
                    {sessionDetailLoading && expanded && <Spinner />}
                  </button>

                  {expanded && sessionDetail && sessionDetail.id === s.id && (
                    <div className="border-t border-line bg-panel/50 px-4 py-4 space-y-3 text-sm">
                      {sessionDetail.error && !sessionDetail.message_count && (
                        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                          {sessionDetail.error}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs">
                        <InfoChip
                          icon={Hash}
                          label="消息数"
                          value={String(sessionDetail.message_count)}
                        />
                        <InfoChip
                          icon={Clock}
                          label="持续时间"
                          value={formatDuration(sessionDetail.duration_seconds)}
                        />
                        <InfoChip
                          icon={Wrench}
                          label="使用工具"
                          value={String(toolsFromDetail.length)}
                        />
                      </div>

                      {sessionDetail.first_message && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-dim">
                            首条消息
                          </div>
                          <div className="rounded-lg border border-line bg-bg px-3 py-2 text-xs whitespace-pre-wrap max-h-[100px] overflow-y-auto">
                            {sessionDetail.first_message}
                          </div>
                        </div>
                      )}

                      {sessionDetail.last_message &&
                        sessionDetail.last_message !== sessionDetail.first_message && (
                          <div>
                            <div className="mb-1 text-xs font-medium text-dim">
                              最近消息
                            </div>
                            <div className="rounded-lg border border-line bg-bg px-3 py-2 text-xs whitespace-pre-wrap max-h-[100px] overflow-y-auto">
                              {sessionDetail.last_message}
                            </div>
                          </div>
                        )}

                      {toolsFromDetail.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-medium text-dim">
                            工具使用分布
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {toolsFromDetail.map(([tool, count]) => (
                              <Badge key={tool} tone="accent">
                                {tool} <span className="ml-1 opacity-60">×{count}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── 本地会话文件 ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <SectionTitle>本机会话记录（{sessionFiles.length}）</SectionTitle>
          {sessionFiles.length === 0 ? (
            <Empty>没有找到 ~/.claude/projects 或 ~/.codex/sessions 下的会话记录</Empty>
          ) : (
            <Table head={["工具", "项目", "消息数", "修改时间", "大小", "文件"]}>
              {sessionFiles.map((f, i) => (
                <Tr
                  key={i}
                  className="cursor-pointer hover:bg-accentsoft/20"
                  onClick={() => setPreviewFile(f)}
                >
                  <Td>
                    <Badge tone={f.tool.includes("Claude") ? "accent" : "ok"}>
                      {f.tool}
                    </Badge>
                  </Td>
                  <Td className="max-w-[160px] truncate font-medium" title={f.project}>
                    {f.project || "—"}
                  </Td>
                  <Td>
                    <Badge tone={f.message_count > 0 ? "accent" : "dim"}>
                      {f.message_count > 0 ? f.message_count : "—"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-dim">{fromNow(f.modified)}</Td>
                  <Td className="text-xs text-dim">{formatBytes(f.size)}</Td>
                  <Td
                    className="max-w-[180px] truncate font-mono text-[11px] text-dim"
                    title={f.path}
                  >
                    {f.path.split(/[\\/]/).pop()}
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>工具分布</SectionTitle>
          {sessionFiles.length > 0 ? (
            <>
              <EChart
                option={sessionToolChart}
                style={{ height: 160 }}
                notMerge
                lazyUpdate
              />
              <div className="mt-2 space-y-1.5">
                {sessionFiles.length > 0 &&
                  (() => {
                    const counts: Record<string, number> = {};
                    for (const f of sessionFiles)
                      counts[f.tool] = (counts[f.tool] ?? 0) + 1;
                    return Object.entries(counts).map(([tool, count], i) => (
                      <div key={tool} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-dim">{tool}</span>
                        <span className="ml-auto font-mono text-text">{count}</span>
                      </div>
                    ));
                  })()}
              </div>
            </>
          ) : (
            <Empty icon={Terminal}>无数据</Empty>
          )}
        </Card>
      </div>

      {/* ── 预览 Modal ── */}
      {previewFile && (
        <Modal
          open={!!previewFile}
          title={`${previewFile.tool} / ${previewFile.project}`}
          onClose={() => setPreviewFile(null)}
          wide
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <InfoChip
                icon={Hash}
                label="消息数"
                value={String(previewFile.message_count)}
              />
              <InfoChip
                icon={Clock}
                label="修改时间"
                value={fromNow(previewFile.modified)}
              />
              <InfoChip
                icon={Terminal}
                label="大小"
                value={formatBytes(previewFile.size)}
              />
            </div>
            {previewFile.first_line && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-dim">
                  <span>首条内容</span>
                  <Btn
                    className="!px-2 !py-0.5 !text-[10px]"
                    onClick={() => {
                      navigator.clipboard.writeText(previewFile.first_line);
                      setToast("已复制");
                    }}
                  >
                    <Copy size={10} />
                  </Btn>
                </div>
                <pre className="max-h-[200px] overflow-auto rounded-lg border border-line bg-bg p-3 text-[11px] whitespace-pre-wrap">
                  {previewFile.first_line}
                </pre>
              </div>
            )}
            {previewFile.last_line &&
              previewFile.last_line !== previewFile.first_line && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-dim">
                    <span>最近内容</span>
                    <Btn
                      className="!px-2 !py-0.5 !text-[10px]"
                      onClick={() => {
                        navigator.clipboard.writeText(previewFile.last_line);
                        setToast("已复制");
                      }}
                    >
                      <Copy size={10} />
                    </Btn>
                  </div>
                  <pre className="max-h-[200px] overflow-auto rounded-lg border border-line bg-bg p-3 text-[11px] whitespace-pre-wrap">
                    {previewFile.last_line}
                  </pre>
                </div>
              )}
            <div className="text-[11px] text-dim break-all">文件: {previewFile.path}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 辅助组件
// ════════════════════════════════════════════════════════════

function InfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1.5">
      <Icon size={11} className="text-warn" />
      <span className="text-dim">{label}</span>
      <span className="font-mono font-medium text-text">{value}</span>
    </div>
  );
}

function BudgetBar({
  label,
  pct,
  spent,
  total,
}: {
  label: string;
  pct: number;
  spent: number;
  total: number;
}) {
  const clamped = Math.min(pct, 100);
  const exceeded = pct >= 100;
  const nearLimit = pct >= 80 && pct < 100;
  const barColor = exceeded ? "bg-danger" : nearLimit ? "bg-warn" : "bg-accent";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-dim">{label}预算</span>
        <span className="font-mono">
          {formatUsd(spent)} / {formatUsd(total)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function toolDist(tools: string[]) {
  const m = new Map<string, number>();
  for (const t of tools) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
