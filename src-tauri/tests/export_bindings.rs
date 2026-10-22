//! IPC 契约导出：把所有跨 IPC 的 Rust 类型导出为 TypeScript 定义。
//!
//! 单一事实来源：前端 `src/types.ts` 改为从 `src/generated/` re-export，
//! Rust 结构体一改，跑 `cargo test --test export_bindings` 即重新生成，
//! 前端 tsc 立刻暴露契约漂移 —— 不再依赖人肉双维护。

use std::path::Path;
use ts_rs::{Config, TS};
use workbench_lib::agent::llm::{
    ChatMessage, ChatReply, FunctionCall, ProviderConfig, ToolCallWire,
};
use workbench_lib::agent::tools::{ToolResult, ToolRisk, ToolSpec};
use workbench_lib::agent::{AgentRunResult, AgentStep, ProviderView};
use workbench_lib::ai::{
    AiProcess, OpencodeSession, SessionDetail, SessionFile, SessionFilePreview,
};
use workbench_lib::commands::{
    BackupResult, DiskInfo, OpencodeSessionsResult, PricingView, ScanCostResult, SystemInfo,
};
use workbench_lib::cost_store::{CostOverview, CostSettings, CostTrendRow, ModelBreakdownRow};
use workbench_lib::data::{Project, Task, WorkbenchData};
use workbench_lib::devserver::DevServer;
use workbench_lib::ports::PortEntry;
use workbench_lib::pricing::PricingRow;
use workbench_lib::procs::ProcInfo;

#[test]
fn export_ts_bindings() {
    let out_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/generated");
    std::fs::create_dir_all(&out_dir).expect("创建 generated 目录失败");
    let cfg = Config::new().with_out_dir(&out_dir);

    ProcInfo::export_all(&cfg).unwrap();
    PortEntry::export_all(&cfg).unwrap();
    DevServer::export_all(&cfg).unwrap();
    AiProcess::export_all(&cfg).unwrap();
    OpencodeSession::export_all(&cfg).unwrap();
    OpencodeSessionsResult::export_all(&cfg).unwrap();
    SessionDetail::export_all(&cfg).unwrap();
    SessionFile::export_all(&cfg).unwrap();
    SessionFilePreview::export_all(&cfg).unwrap();
    CostSettings::export_all(&cfg).unwrap();
    CostOverview::export_all(&cfg).unwrap();
    CostTrendRow::export_all(&cfg).unwrap();
    ModelBreakdownRow::export_all(&cfg).unwrap();
    Project::export_all(&cfg).unwrap();
    Task::export_all(&cfg).unwrap();
    WorkbenchData::export_all(&cfg).unwrap();
    SystemInfo::export_all(&cfg).unwrap();
    DiskInfo::export_all(&cfg).unwrap();
    ScanCostResult::export_all(&cfg).unwrap();
    PricingRow::export_all(&cfg).unwrap();
    PricingView::export_all(&cfg).unwrap();
    BackupResult::export_all(&cfg).unwrap();
    // ── Agent 契约 ──
    ToolSpec::export_all(&cfg).unwrap();
    ToolRisk::export_all(&cfg).unwrap();
    ToolResult::export_all(&cfg).unwrap();
    ProviderConfig::export_all(&cfg).unwrap();
    ProviderView::export_all(&cfg).unwrap();
    ChatMessage::export_all(&cfg).unwrap();
    ChatReply::export_all(&cfg).unwrap();
    ToolCallWire::export_all(&cfg).unwrap();
    FunctionCall::export_all(&cfg).unwrap();
    AgentStep::export_all(&cfg).unwrap();
    AgentRunResult::export_all(&cfg).unwrap();
}
