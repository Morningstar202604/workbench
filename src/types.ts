// ─────────────────────────────────────────────────────────────
// IPC 契约类型 —— 单一事实来源是 Rust 结构体（src-tauri/src/*.rs）。
//
// 本文件只做 re-export：具体定义由 `cargo test --test export_bindings`
// 生成到 src/generated/，Rust 侧一改，前端 tsc 立刻暴露漂移，
// 不再人肉双维护。不要在这里手写跨 IPC 的类型。
//
// 仅前端使用的视图类型（ViewKey 等）仍定义在本文件底部。
// ─────────────────────────────────────────────────────────────

export type { AiProcess } from "./generated/AiProcess";
export type { OpencodeSession } from "./generated/OpencodeSession";
export type { OpencodeSessionsResult } from "./generated/OpencodeSessionsResult";
export type { SessionDetail } from "./generated/SessionDetail";
export type { SessionFile } from "./generated/SessionFile";
export type { SessionFilePreview } from "./generated/SessionFilePreview";

export type { ProcInfo } from "./generated/ProcInfo";
export type { PortEntry } from "./generated/PortEntry";
export type { DevServer } from "./generated/DevServer";

export type { Project } from "./generated/Project";
export type { Task } from "./generated/Task";
export type { WorkbenchData } from "./generated/WorkbenchData";

export type { SystemInfo } from "./generated/SystemInfo";
export type { DiskInfo } from "./generated/DiskInfo";
export type { ScanCostResult } from "./generated/ScanCostResult";
export type { PricingRow } from "./generated/PricingRow";
export type { PricingView } from "./generated/PricingView";

// ── Agent（模型 + 工具调用）──
export type { ChatMessage } from "./generated/ChatMessage";
export type { ChatReply } from "./generated/ChatReply";
export type { ToolCallWire } from "./generated/ToolCallWire";
export type { FunctionCall } from "./generated/FunctionCall";
export type { ProviderConfig } from "./generated/ProviderConfig";
export type { ProviderView } from "./generated/ProviderView";
export type { ToolSpec } from "./generated/ToolSpec";
export type { ToolRisk } from "./generated/ToolRisk";
export type { ToolResult } from "./generated/ToolResult";
export type { AgentStep } from "./generated/AgentStep";
export type { AgentRunResult } from "./generated/AgentRunResult";

export type { CostSettings } from "./generated/CostSettings";
export type { CostOverview } from "./generated/CostOverview";
export type { CostTrendRow } from "./generated/CostTrendRow";
export type { ModelBreakdownRow } from "./generated/ModelBreakdownRow";

// ── 仅前端使用的类型 ──────────────────────────────────────────

/** 侧边栏视图 key：由页面注册表派生，新增页面只需改 pages/registry。 */
export type { ViewKey } from "./pages/registry";
