import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { EChart } from "../../lib/echarts";
import { useStore } from "../../lib/store";
import { useShallow } from "zustand/react/shallow";
import { useT } from "../../lib/i18n";
import {
  Badge,
  Btn,
  Card,
  Empty,
  SectionTitle,
  Spinner,
  StatCard,
  Table,
  Td,
  Tr,
} from "../../ui";
import { formatBytes, formatDuration, formatTime, fromNow } from "../../lib/util";
import { totalMessageCount, toolUsageDistribution } from "../../lib/aggregate";

/** AI 进程 + 在线会话 + 本地会话文件统计。 */
export function AiProcessPanel() {
  const t = useT();
  const { ais, sessions, sessionFiles } = useStore(
    useShallow((s) => ({
      ais: s.ais,
      sessions: s.sessions,
      sessionFiles: s.sessionFiles,
    }))
  );
  const totalMessages = useMemo(() => totalMessageCount(sessionFiles), [sessionFiles]);

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
          data: sorted.map((a) => Math.round(a.memory / 1024 / 1024)),
          barWidth: 14,
          label: { show: true, position: "right", fontSize: 10, formatter: "{c} MB" },
        },
      ],
    };
  }, [ais]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label={t("ai.aiProcesses")}
          value={ais.length}
          tone="warn"
          bar="bg-warn"
        />
        <StatCard
          icon={MessageSquare}
          label={t("ai.onlineSessions")}
          value={sessions.length}
          tone="accent"
          bar="bg-accent"
        />
        <StatCard
          icon={Terminal}
          label={t("ai.localSessionFiles")}
          value={sessionFiles.length}
          tone="ok"
          bar="bg-ok"
        />
        <StatCard
          icon={Hash}
          label={t("ai.totalMessages")}
          value={totalMessages || "—"}
          tone="text"
          bar="bg-accent"
        />
      </div>

      <Card className="p-4">
        <SectionTitle>{t("ai.aiMemTitle")}</SectionTitle>
        {ais.length > 0 ? (
          <EChart
            option={aiMemChart}
            style={{ height: Math.max(120, ais.length * 36) }}
            notMerge
            lazyUpdate
          />
        ) : (
          <Empty icon={Sparkles}>{t("ai.noAiProcesses")}</Empty>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>{t("ai.aiAgentProcesses", { count: ais.length })}</SectionTitle>
        {ais.length === 0 ? (
          <Empty>{t("ai.noAiAgents")}</Empty>
        ) : (
          <Table
            head={[
              t("ai.table.process"),
              t("ai.table.matchedKeyword"),
              t("ai.table.pid"),
              t("ai.table.memory"),
              t("ai.table.startedAt"),
              t("ai.table.commandLine"),
            ]}
          >
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
    </>
  );
}

export function OpencodeSessionsPanel() {
  const t = useT();
  const {
    sessions,
    opencodePort,
    sessionsErr,
    sessionDetail,
    sessionDetailLoading,
    loadSessionDetail,
    refreshAi,
  } = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      opencodePort: s.opencodePort,
      sessionsErr: s.sessionsErr,
      sessionDetail: s.sessionDetail,
      sessionDetailLoading: s.sessionDetailLoading,
      loadSessionDetail: s.loadSessionDetail,
      refreshAi: s.refreshAi,
    }))
  );
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const openSessionDetail = (port: number, id: string) => {
    if (expandedSession === id) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(id);
    loadSessionDetail(port, id);
  };

  const toolsFromDetail = sessionDetail
    ? toolUsageDistribution(sessionDetail.tools_used)
    : [];

  return (
    <Card className="p-4">
      <SectionTitle
        extra={
          <Btn onClick={refreshAi} className="!py-1 !text-xs">
            <RefreshCw size={12} /> {t("ai.refresh")}
          </Btn>
        }
      >
        {t("ai.opencodeSessions", { count: sessions.length })}
      </SectionTitle>
      {sessions.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Empty>{t("ai.opencodeUnreachable")}</Empty>
          {sessionsErr && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {sessionsErr}
              <br />
              {t("ai.opencodeHintPrefix")}{" "}
              <span className="font-mono">opencode serve</span>
              {t("ai.opencodeHintSuffix")}
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
                className="overflow-hidden rounded-xl border border-line bg-panel2 transition-all"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accentsoft/30"
                  onClick={() => openSessionDetail(opencodePort, s.id)}
                >
                  {expanded ? (
                    <ChevronDown size={14} className="shrink-0 text-accent" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-dim" />
                  )}
                  <MessageSquare size={14} className="shrink-0 text-accent" />
                  <span className="flex-1 truncate font-medium">{s.title}</span>
                  <span className="hidden font-mono text-xs text-dim sm:block">
                    {s.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-dim">
                    {s.created ? formatTime(s.created) : ""}
                  </span>
                  {sessionDetailLoading && expanded && <Spinner />}
                </button>

                {expanded && sessionDetail && sessionDetail.id === s.id && (
                  <div className="space-y-3 border-t border-line bg-panel/50 px-4 py-4 text-sm">
                    {sessionDetail.error && !sessionDetail.message_count && (
                      <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                        {sessionDetail.error}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs">
                      <InfoChip
                        icon={Hash}
                        label={t("ai.messageCount")}
                        value={String(sessionDetail.message_count)}
                      />
                      <InfoChip
                        icon={Clock}
                        label={t("ai.duration")}
                        value={formatDuration(sessionDetail.duration_seconds)}
                      />
                      <InfoChip
                        icon={Wrench}
                        label={t("ai.toolsUsed")}
                        value={String(toolsFromDetail.length)}
                      />
                    </div>
                    {sessionDetail.first_message && (
                      <MessageBlock
                        label={t("ai.firstMessage")}
                        text={sessionDetail.first_message}
                      />
                    )}
                    {sessionDetail.last_message &&
                      sessionDetail.last_message !== sessionDetail.first_message && (
                        <MessageBlock
                          label={t("ai.lastMessage")}
                          text={sessionDetail.last_message}
                        />
                      )}
                    {toolsFromDetail.length > 0 && (
                      <div>
                        <div className="mb-1 text-xs font-medium text-dim">
                          {t("ai.toolDistTitle")}
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
  );
}

function MessageBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-dim">{label}</div>
      <div className="max-h-[100px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-bg px-3 py-2 text-xs">
        {text}
      </div>
    </div>
  );
}

export function InfoChip({
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
