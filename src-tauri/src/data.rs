//! 本地数据层：项目与任务，持久化到 app_data_dir/data.json（原子写入）。
//! 任何 IO 异常降级为默认空数据，保证前端可启动。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WorkbenchData {
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub note: String,
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due: Option<String>,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

pub fn data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("data.json"))
}

pub fn load_from_disk(app: &AppHandle) -> WorkbenchData {
    let path = match data_file_path(app) {
        Ok(p) => p,
        Err(_) => return WorkbenchData::default(),
    };
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => WorkbenchData::default(),
    }
}

/// 原子写入：先写临时文件再 rename，避免半截 JSON。
pub fn save_to_disk(app: &AppHandle, data: &WorkbenchData) -> Result<(), String> {
    let path = data_file_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(data).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&tmp, text).map_err(|e| format!("写入失败: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("替换文件失败: {e}"))?;
    Ok(())
}

