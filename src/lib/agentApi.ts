import { invoke } from "@tauri-apps/api/core";
import type {
  AgentRunResult,
  ChatMessage,
  ProviderConfig,
  ProviderView,
  ToolResult,
  ToolSpec,
} from "../types";

/**
 * Agent IPC 封装。
 *
 * 密钥约束：`setProvider` 只把密钥送进 Rust 进程内存，前端**不持久化**它
 * （不写 localStorage、不进 zustand persist 的 partialize 白名单）。
 */

export async function agentSetProvider(config: ProviderConfig): Promise<void> {
  await invoke("agent_set_provider", { config });
}

export async function agentGetProvider(): Promise<ProviderView> {
  return invoke<ProviderView>("agent_get_provider");
}

export async function agentListTools(): Promise<ToolSpec[]> {
  return invoke<ToolSpec[]>("agent_list_tools");
}

/**
 * 批准并执行一次待审批的调用。
 *
 * 后端执行的是**已登记的那一条**（工具名 + 参数都在后端），
 * 而不是让前端再跑一轮模型 —— 重跑会生成新的 call_id，批准就永远对不上。
 */
export async function agentApproveTool(callId: string): Promise<ToolResult> {
  return invoke<ToolResult>("agent_approve_tool", { callId });
}

export async function agentRejectTool(callId: string): Promise<void> {
  await invoke("agent_reject_tool", { callId });
}

/** 执行一轮对话（可能包含多次工具调用）。 */
export async function agentRun(messages: ChatMessage[]): Promise<AgentRunResult> {
  return invoke<AgentRunResult>("agent_run", { messages });
}
