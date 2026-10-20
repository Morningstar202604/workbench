import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Loader2,
  Plus,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { useT } from "../lib/i18n";
import { Badge, Btn, Card, Empty, Field, Modal, inputCls } from "../ui";
import {
  agentApproveTool,
  agentGetProvider,
  agentListTools,
  agentRejectTool,
  agentRun,
  agentSetProvider,
} from "../lib/agentApi";
import { isTauri } from "../lib/api";
import type { AgentStep, ChatMessage, ProviderView, ToolSpec } from "../types";

/**
 * Agent 对话页。
 *
 * 交互取舍：
 * - 模型每调用一个工具都在轨迹里留痕（参数原文 + 结果），用户能审计它到底做了什么。
 * - 需要审批的工具（改状态 / 终止进程）在执行前**停下整个对话**，
 *   由用户逐次点「允许」或「拒绝」；不允许前端替用户自动批准。
 * - 密钥只进 Rust 内存，本页不回显、不持久化。
 */

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  steps?: AgentStep[];
  stopped?: string;
}

interface PendingApproval {
  callId: string;
  tool: string;
  arguments: string;
}

export default function Agent() {
  const t = useT();
  const setToast = useStore(useShallow((s) => s.setToast));

  const [provider, setProvider] = useState<ProviderView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [fallbacks, setFallbacks] = useState<
    { base_url: string; model: string; api_key: string }[]
  >([]);
  const [showSettings, setShowSettings] = useState(false);
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 运行计时：让用户看到「还在跑」而不是界面卡死
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const elapsed = busy ? tick : 0;

  useEffect(() => {
    if (!isTauri()) return;
    void agentGetProvider()
      .then(setProvider)
      .catch(() => {});
    void agentListTools()
      .then(setTools)
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  const configured = !!provider && provider.base_url.trim() !== "" && provider.has_key;

  const saveProvider = useCallback(async () => {
    if (!provider) return;
    try {
      await agentSetProvider({
        base_url: provider.base_url,
        model: provider.model,
        api_key: apiKey,
        temperature: provider.temperature,
        max_tokens: provider.max_tokens,
        // 备用服务：主服务排队/超时时自动切换
        fallbacks: fallbacks.filter((f) => f.base_url.trim() && f.model.trim()),
      });
      const view = await agentGetProvider();
      setProvider(view);
      setApiKey("");
      setShowSettings(false);
      setToast(t("agent.saved"));
    } catch (e) {
      setToast(String(e));
    }
  }, [provider, apiKey, fallbacks, setToast, t]);

  /** 把对话历史转成协议消息（只保留纯文本轮次，工具轨迹由后端重新产生）。 */
  const buildMessages = useCallback(
    (turnsToSend: ChatTurn[]): ChatMessage[] =>
      turnsToSend
        .filter((turn) => turn.text.trim() !== "")
        .map((turn) =>
          turn.role === "user"
            ? ({ role: "user", content: turn.text } as ChatMessage)
            : ({ role: "assistant", content: turn.text, tool_calls: null } as ChatMessage)
        ),
    []
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!configured) {
      setShowSettings(true);
      return;
    }
    const nextTurns: ChatTurn[] = [...turns, { role: "user", text }];
    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    setTick(0);
    try {
      const result = await agentRun(buildMessages(nextTurns));
      // 收集需要审批的步骤：AgentStep 带后端生成的 call_id，
      // 审批时原样回传，与后端登记的待批调用一一对应。
      setPending(
        result.steps
          .filter((s) => s.needs_approval && s.call_id)
          .map((s) => ({
            // 用后端给的协议 id：通行证与这次调用一一对应，不能自行拼接
            callId: s.call_id,
            tool: s.tool,
            arguments: s.arguments,
          }))
      );
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.answer,
          steps: result.steps,
          stopped: result.stopped_reason,
        },
      ]);
    } catch (e) {
      setTurns((prev) => [...prev, { role: "assistant", text: String(e) }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, configured, turns, buildMessages]);

  const approve = useCallback(
    async (approval: PendingApproval) => {
      try {
        // 后端执行**这一条已登记的调用**并返回结果，不再让模型重发
        const result = await agentApproveTool(approval.callId);
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          const step: AgentStep = {
            kind: "tool",
            call_id: result.call_id,
            tool: result.tool,
            arguments: approval.arguments,
            content: result.ok ? result.content : result.error,
            ok: result.ok,
            needs_approval: false,
            elapsed_ms: 0n,
          };
          if (last && last.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...last, steps: [...(last.steps ?? []), step] },
            ];
          }
          return [...prev, { role: "assistant", text: "", steps: [step] }];
        });
        setToast(result.ok ? t("agent.approvedHint") : result.error);
      } catch (e) {
        setToast(String(e));
      }
      setPending((prev) => prev.filter((p) => p.callId !== approval.callId));
    },
    [setToast, t]
  );

  const reject = useCallback(async (approval: PendingApproval) => {
    try {
      await agentRejectTool(approval.callId);
    } catch {
      /* 拒绝失败不影响 UI */
    }
    setPending((prev) => prev.filter((p) => p.callId !== approval.callId));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolSpec[]>();
    for (const tool of tools) {
      const list = map.get(tool.risk) ?? [];
      list.push(tool);
      map.set(tool.risk, list);
    }
    return [...map.entries()];
  }, [tools]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 顶部：状态 + 配置入口 */}
      <div className="flex flex-wrap items-center gap-2">
        <Bot size={16} className="text-accent" />
        <span className="text-sm font-medium">{t("agent.title")}</span>
        {configured ? (
          <Badge tone="ok">{provider?.model}</Badge>
        ) : (
          <Badge tone="warn">{t("agent.notConfigured")}</Badge>
        )}
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-dim">
            <Loader2 size={12} className="animate-spin" />
            {t("agent.running", { seconds: elapsed })}
          </span>
        )}
        <Btn className="ml-auto !py-1 !text-xs" onClick={() => setShowSettings(true)}>
          <Settings2 size={12} /> {t("agent.configure")}
        </Btn>
      </div>

      {/* 对话区 */}
      <Card className="flex min-h-0 flex-1 flex-col p-0">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && !busy ? (
            <Empty icon={Bot}>{t("agent.emptyHint")}</Empty>
          ) : (
            turns.map((turn, i) => <TurnView key={i} turn={turn} />)
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-dim">
              <Loader2 size={12} className="animate-spin" />
              {t("agent.thinking", { seconds: elapsed })}
            </div>
          )}
        </div>

        {/* 待审批提示 */}
        {pending.length > 0 && (
          <div className="border-t border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldAlert size={13} />
              {t("agent.pendingApproval", { count: pending.length })}
            </div>
            <div className="mt-1 flex flex-col gap-1.5">
              {pending.map((p) => (
                <span key={p.callId} className="flex items-center gap-2">
                  <code className="rounded bg-bg px-1.5 py-0.5">{p.tool}</code>
                  {/* 危险工具必须让用户看到具体目标（pid/路径），否则是盲批 */}
                  <code
                    className="max-w-[420px] truncate rounded bg-bg px-1.5 py-0.5 text-[11px]"
                    title={p.arguments}
                  >
                    {p.arguments}
                  </code>
                  <Btn
                    variant="primary"
                    className="!px-2 !py-0.5 !text-[10px]"
                    onClick={() => void approve(p)}
                  >
                    <Check size={10} /> {t("agent.approve")}
                  </Btn>
                  <Btn
                    variant="danger"
                    className="!px-2 !py-0.5 !text-[10px]"
                    onClick={() => void reject(p)}
                  >
                    <X size={10} /> {t("agent.reject")}
                  </Btn>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2 border-t border-line p-3">
          <textarea
            className={`${inputCls} max-h-32 min-h-[38px] resize-y`}
            rows={1}
            placeholder={t("agent.inputPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送，Shift+Enter 换行
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Btn
            variant="primary"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
          >
            <Send size={14} />
          </Btn>
        </div>
      </Card>

      {/* 工具能力一览：让用户知道模型能做什么 */}
      <details className="rounded-xl border border-line bg-panel px-4 py-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-dim">
          {t("agent.capabilities", { count: tools.length })}
        </summary>
        <div className="mt-3 space-y-3">
          {grouped.map(([risk, list]) => (
            <div key={risk}>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-dim">
                {t(`agent.risk.${risk}`)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((tool) => (
                  <span
                    key={tool.name}
                    title={tool.description}
                    className="flex items-center gap-1 rounded-md border border-line bg-panel2 px-2 py-0.5 font-mono text-[11px] text-dim"
                  >
                    <Wrench size={10} />
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* 模型服务配置 */}
      <Modal
        open={showSettings}
        title={t("agent.settingsTitle")}
        onClose={() => setShowSettings(false)}
        footer={
          <>
            <Btn onClick={() => setShowSettings(false)}>{t("projects.cancel")}</Btn>
            <Btn variant="primary" onClick={() => void saveProvider()}>
              {t("projects.save")}
            </Btn>
          </>
        }
      >
        {provider && (
          <>
            <Field label={t("agent.baseUrl")}>
              <input
                className={inputCls}
                value={provider.base_url}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setProvider({ ...provider, base_url: e.target.value })}
              />
            </Field>
            <Field label={t("agent.model")}>
              <input
                className={inputCls}
                value={provider.model}
                placeholder="gpt-4o-mini"
                onChange={(e) => setProvider({ ...provider, model: e.target.value })}
              />
            </Field>
            <Field label={t("agent.apiKey")}>
              <input
                className={inputCls}
                type="password"
                value={apiKey}
                placeholder={provider.has_key ? t("agent.keyKeepHint") : "sk-…"}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <p className="text-[11px] leading-relaxed text-dim">{t("agent.keyNotice")}</p>

            {/* 备用服务：主服务排队 / 超时 / 无可用渠道时自动切换 */}
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-dim">
                  {t("agent.fallbacks")}
                </span>
                <Btn
                  className="!px-2 !py-0.5 !text-[11px]"
                  onClick={() =>
                    setFallbacks([...fallbacks, { base_url: "", model: "", api_key: "" }])
                  }
                >
                  <Plus size={12} /> {t("agent.addFallback")}
                </Btn>
              </div>
              {fallbacks.length === 0 && (
                <p className="text-[11px] text-dim">{t("agent.fallbackHint")}</p>
              )}
              {fallbacks.map((fb, i) => (
                <div key={i} className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <input
                    className={inputCls}
                    placeholder={t("agent.baseUrl")}
                    value={fb.base_url}
                    onChange={(e) => {
                      const next = [...fallbacks];
                      next[i] = { ...fb, base_url: e.target.value };
                      setFallbacks(next);
                    }}
                  />
                  <input
                    className={inputCls}
                    placeholder={t("agent.model")}
                    value={fb.model}
                    onChange={(e) => {
                      const next = [...fallbacks];
                      next[i] = { ...fb, model: e.target.value };
                      setFallbacks(next);
                    }}
                  />
                  <div className="flex gap-1">
                    <input
                      className={inputCls}
                      type="password"
                      placeholder={t("agent.apiKey")}
                      value={fb.api_key}
                      onChange={(e) => {
                        const next = [...fallbacks];
                        next[i] = { ...fb, api_key: e.target.value };
                        setFallbacks(next);
                      }}
                    />
                    <Btn
                      variant="danger"
                      className="!px-2 !py-1"
                      onClick={() => setFallbacks(fallbacks.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={12} />
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function TurnView({ turn }: { turn: ChatTurn }) {
  const t = useT();
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-accentsoft px-3 py-2 text-sm text-accent">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {turn.steps && turn.steps.length > 0 && (
        <div className="space-y-1.5">
          {turn.steps.map((step, i) => (
            <ToolStepView key={i} step={step} />
          ))}
        </div>
      )}
      {turn.text && (
        <div className="max-w-[92%] whitespace-pre-wrap rounded-xl rounded-bl-sm border border-line bg-panel2 px-3 py-2 text-sm">
          {turn.text}
        </div>
      )}
      {turn.stopped === "needs_approval" && (
        <div className="flex items-center gap-1.5 text-xs text-warn">
          <AlertTriangle size={12} /> {t("agent.stoppedNeedsApproval")}
        </div>
      )}
    </div>
  );
}

function ToolStepView({ step }: { step: AgentStep }) {
  if (step.kind === "answer") return null;
  return (
    <details className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-2">
        <Wrench size={11} className={step.ok ? "text-ok" : "text-danger"} />
        <span className="font-mono">{step.tool || "notice"}</span>
        {step.needs_approval && <Badge tone="warn">approval</Badge>}
        <span className="ml-auto text-dim">{step.elapsed_ms}ms</span>
      </summary>
      {step.arguments && (
        <pre className="mt-2 max-h-32 overflow-auto rounded bg-bg p-2 text-[11px] text-dim">
          {step.arguments}
        </pre>
      )}
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-[11px]">
        {step.content}
      </pre>
    </details>
  );
}
