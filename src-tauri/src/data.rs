//! 本地数据层：项目与任务，持久化到 app_data_dir/data.json。
//! 损坏文件先保全再报错（见 json_store），绝不静默当成空数据 —— 那会让下一次保存
//! 把可恢复的用户数据覆盖成空集。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::json_store;

#[derive(Serialize, Deserialize, Clone, Debug, Default, ts_rs::TS)]
pub struct WorkbenchData {
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
}

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub note: String,
    #[ts(type = "number")]
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due: Option<String>,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    #[ts(type = "number")]
    pub created_at: u64,
    #[ts(type = "number")]
    pub updated_at: u64,
}

pub fn data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("data.json"))
}

/// 读取项目/任务数据。文件损坏或不可读时返回 Err，由前端明确告知用户。
pub fn load_from_disk(app: &AppHandle) -> Result<WorkbenchData, String> {
    let path = data_file_path(app)?;
    Ok(json_store::read_json(&path)?.unwrap_or_default())
}

pub fn save_to_disk(app: &AppHandle, data: &WorkbenchData) -> Result<(), String> {
    json_store::write_json_atomic(&data_file_path(app)?, data)
}

/// 数据文件锁。
///
/// 为什么必须加：前端用 300ms 防抖整文件保存（`saveData`），而 Agent 工具
/// （`create_task`）会在另一个线程做「读-改-写」。没有锁时后写者会用自己的
/// 旧快照盖掉前者刚写入的内容 —— json_store 的原子写只保证"不会写出半截
/// 文件"，不保证读-改-写是原子的。
static DATA_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    DATA_LOCK.lock().unwrap_or_else(|p| p.into_inner())
}

/// 在锁内做「读-改-写」，返回被修改后的数据。
/// `f` 返回 true 表示有变更，需要落盘。
pub fn mutate<R>(
    app: &AppHandle,
    f: impl FnOnce(&mut WorkbenchData) -> (R, bool),
) -> Result<R, String> {
    let _guard = lock();
    let mut data = load_from_disk(app)?;
    let (out, changed) = f(&mut data);
    if changed {
        save_to_disk(app, &data)?;
    }
    Ok(out)
}

