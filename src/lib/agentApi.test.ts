import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 助手 IPC 包装层。与 api.test.ts 同一思路：命令名与参数形状
 * 在类型层面看不出对错，只有捕获真实调用才能保证不漂移。
 */
const invokeMock = vi.fn(async (..._args: unknown[]) => undefined as unknown);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

const api = await import("./agentApi");

beforeEach(() => {
  invokeMock.mockClear();
});

const provider = {
  base_url: "https://api.example.com/v1",
  model: "gpt-4o-mini",
  api_key: "sk-test",
  temperature: 0.2,
  max_tokens: 1024,
  fallbacks: [],
};

describe("agentApi", () => {
  it("保存 provider 时把配置整体传过去", async () => {
    await api.agentSetProvider(provider);
    expect(invokeMock).toHaveBeenLastCalledWith("agent_set_provider", {
      config: provider,
    });
  });

  it("读取 provider 无参数", async () => {
    await api.agentGetProvider();
    expect(invokeMock).toHaveBeenLastCalledWith("agent_get_provider");
  });

  it("工具清单无参数", async () => {
    await api.agentListTools();
    expect(invokeMock).toHaveBeenLastCalledWith("agent_list_tools");
  });

  it("审批/拒绝都用 camelCase 的 callId", async () => {
    await api.agentApproveTool("call-1");
    expect(invokeMock).toHaveBeenLastCalledWith("agent_approve_tool", {
      callId: "call-1",
    });
    await api.agentRejectTool("call-2");
    expect(invokeMock).toHaveBeenLastCalledWith("agent_reject_tool", {
      callId: "call-2",
    });
  });

  it("取消与清空无参数", async () => {
    await api.agentCancel();
    expect(invokeMock).toHaveBeenLastCalledWith("agent_cancel");
    await api.agentClearChat();
    expect(invokeMock).toHaveBeenLastCalledWith("agent_clear_chat");
  });

  it("run 把消息数组传成 messages", async () => {
    const messages = [{ role: "user" as const, content: "hi" }];
    await api.agentRun(messages as never);
    expect(invokeMock).toHaveBeenLastCalledWith("agent_run", { messages });
  });

  it("所有 agent 命令名都以 agent_ 开头（后端注册表同前缀）", async () => {
    await api.agentGetProvider();
    await api.agentListTools();
    await api.agentCancel();
    const names = invokeMock.mock.calls.map((c) => String(c[0]));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.startsWith("agent_")).toBe(true);
  });
});
