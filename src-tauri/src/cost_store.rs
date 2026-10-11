//! 成本数据持久化（JSON 文件，幂等导入）
//!
//! 设计取舍：
//! - 不用 SQLite —— 工作台的数据量级（几百~几万条成本记录）用 JSON 足够了
//! - 原子写入（tmp + rename）—— 与 data.rs 保持一致
//! - 幂等：每条记录以 file_path + file_mtime + file_size 为去重键，重复扫描不重复计费

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ── 成本配置（预算 / 自定价 / 告警阈值）─────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CostSettings {
    /// 日预算（USD），0 表示不设限
    pub daily_budget: f64,
    /// 月预算（USD），0 表示不设限
    pub monthly_budget: f64,
    /// 预算告警阈值（百分比，80 = 80% 时告警）
    pub alert_threshold_pct: u32,
    /// 写入时是否包含估算行（cost_source = estimated 的记录）
    pub include_estimated: bool,
}

impl Default for CostSettings {
    fn default() -> Self {
        Self {
            daily_budget: 5.0,
            monthly_budget: 50.0,
            alert_threshold_pct: 80,
            include_estimated: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CostRecord {
    /// 文件路径（去重键之一）
    pub file_path: String,
    /// 文件修改时间 (unix_secs)
    pub file_mtime: u64,
    /// 文件大小
    pub file_size: u64,
    /// 工具类型
    pub tool: String,
    /// 项目名
    pub project: String,
    /// 推断模型
    pub model: String,
    /// 输入 tokens（不含 cache_read/creation，已被剥离为单独字段计费）
    pub input_tokens: u64,
    /// 输出 tokens
    pub output_tokens: u64,
    /// Anthropic cache_read_input_tokens（按 0.1x 计价）
    pub cache_read_tokens: u64,
    /// Anthropic cache_creation_input_tokens（按 1.25x 计价）
    pub cache_creation_tokens: u64,
    /// 输入成本 (USD)
    pub cost_input: f64,
    /// 输出成本 (USD)
    pub cost_output: f64,
    /// 总成本
    pub cost_total: f64,
    /// 记录来源：`measured` | `estimated` | `zero_pricing`
    pub cost_source: String,
    /// 数据所属日期（YYYY-MM-DD），按文件 mtime 推算
    pub day: String,
}

// ── 聚合视图 ───────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CostOverview {
    pub today_cost: f64,
    pub today_input_tokens: u64,
    pub today_output_tokens: u64,
    pub today_cache_read_tokens: u64,
    pub today_cache_creation_tokens: u64,
    pub month_cost: f64,
    pub month_input_tokens: u64,
    pub month_output_tokens: u64,
    pub month_cache_read_tokens: u64,
    pub month_cache_creation_tokens: u64,
    pub total_cost: f64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub record_count: usize,
    pub measured_count: usize,
    pub estimated_count: usize,
    pub zero_pricing_count: usize,
    pub daily_budget: f64,
    pub monthly_budget: f64,
    pub alert_threshold_pct: u32,
    /// 今日已用 / 日预算 百分比（>100 即超支）
    pub daily_pct: f64,
    /// 本月已用 / 月预算 百分比
    pub monthly_pct: f64,
    pub budget_exceeded: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CostTrendRow {
    pub day: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cost: f64,
    pub record_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModelBreakdownRow {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost: f64,
    pub record_count: u32,
}

// ── 存储层 ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CostData {
    pub records: Vec<CostRecord>,
    pub settings: CostSettings,
}

/// app_data_dir 下的成本数据文件路径
fn cost_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("cost_data.json"))
}

/// 用户自定义定价覆盖文件路径
pub fn cost_data_path_overrides(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("pricing_overrides.json"))
}

pub fn load_cost_data(app: &AppHandle) -> CostData {
    let path = match cost_data_path(app) {
        Ok(p) => p,
        Err(_) => return CostData::default(),
    };
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => CostData::default(),
    }
}

fn save_cost_data(app: &AppHandle, data: &CostData) -> Result<(), String> {
    let path = cost_data_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(data).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&tmp, text).map_err(|e| format!("写入失败: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("替换文件失败: {e}"))?;
    Ok(())
}

/// 获取当前成本设置（单独读写，不占主数据通道）
pub fn get_cost_settings(app: &AppHandle) -> CostSettings {
    load_cost_data(app).settings
}

pub fn save_cost_settings(app: &AppHandle, settings: CostSettings) -> Result<(), String> {
    // 先读再改，避免覆盖已有记录
    let mut data = load_cost_data(app);
    data.settings = settings;
    save_cost_data(app, &data)
}

/// 导入：按 file_path **整组替换**。
/// 同一会话文件每次变化只保留最新一组按日记录，避免旧快照与新快照重复累加。
/// 返回值 = 净新增记录数（新文件的全部记录；已存在文件被替换则记 0 或差额）。
pub fn import_records(app: &AppHandle, new_records: &[CostRecord]) -> Result<usize, String> {
    if new_records.is_empty() {
        return Ok(0);
    }
    let mut data = load_cost_data(app);

    let touched_paths: HashSet<String> = new_records
        .iter()
        .map(|r| r.file_path.clone())
        .collect();
    let old_len = data.records.len();
    data.records.retain(|r| !touched_paths.contains(&r.file_path));
    let removed = old_len - data.records.len();

    data.records.extend(new_records.iter().cloned());
    save_cost_data(app, &data)?;

    Ok(data.records.len().saturating_sub(old_len))
}

pub fn build_overview(app: &AppHandle) -> CostOverview {
    let data = load_cost_data(app);
    let settings = &data.settings;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let month_prefix = chrono::Local::now().format("%Y-%m").to_string();

    let mut overview = CostOverview {
        today_cost: 0.0,
        today_input_tokens: 0,
        today_output_tokens: 0,
        today_cache_read_tokens: 0,
        today_cache_creation_tokens: 0,
        month_cost: 0.0,
        month_input_tokens: 0,
        month_output_tokens: 0,
        month_cache_read_tokens: 0,
        month_cache_creation_tokens: 0,
        total_cost: 0.0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_creation_tokens: 0,
        record_count: 0,
        measured_count: 0,
        estimated_count: 0,
        zero_pricing_count: 0,
        daily_budget: settings.daily_budget,
        monthly_budget: settings.monthly_budget,
        alert_threshold_pct: settings.alert_threshold_pct,
        daily_pct: 0.0,
        monthly_pct: 0.0,
        budget_exceeded: false,
    };

    for r in &data.records {
        match r.cost_source.as_str() {
            "measured" => overview.measured_count += 1,
            "estimated" => overview.estimated_count += 1,
            _ => overview.zero_pricing_count += 1,
        }
        // include_estimated = false 时，估算行不参与金额/token 聚合
        if r.cost_source == "estimated" && !settings.include_estimated {
            continue;
        }
        overview.record_count += 1;
        overview.total_cost += r.cost_total;
        overview.total_input_tokens += r.input_tokens;
        overview.total_output_tokens += r.output_tokens;
        overview.total_cache_read_tokens += r.cache_read_tokens;
        overview.total_cache_creation_tokens += r.cache_creation_tokens;
        if r.day == today {
            overview.today_cost += r.cost_total;
            overview.today_input_tokens += r.input_tokens;
            overview.today_output_tokens += r.output_tokens;
            overview.today_cache_read_tokens += r.cache_read_tokens;
            overview.today_cache_creation_tokens += r.cache_creation_tokens;
        }
        if r.day.starts_with(&month_prefix) {
            overview.month_cost += r.cost_total;
            overview.month_input_tokens += r.input_tokens;
            overview.month_output_tokens += r.output_tokens;
            overview.month_cache_read_tokens += r.cache_read_tokens;
            overview.month_cache_creation_tokens += r.cache_creation_tokens;
        }
    }

    if settings.daily_budget > 0.0 {
        overview.daily_pct = (overview.today_cost / settings.daily_budget * 100.0).min(999.0);
    }
    if settings.monthly_budget > 0.0 {
        overview.monthly_pct = (overview.month_cost / settings.monthly_budget * 100.0).min(999.0);
    }
    overview.budget_exceeded =
        overview.daily_pct >= 100.0 || overview.monthly_pct >= 100.0;
    overview
}

/// 聚合：成本趋势（按天）
pub fn build_trend(app: &AppHandle, days: usize) -> Vec<CostTrendRow> {
    let data = load_cost_data(app);
    let mut by_day: std::collections::BTreeMap<String, (u64, u64, u64, u64, f64, u32)> =
        std::collections::BTreeMap::new();
    for r in &data.records {
        if r.cost_source == "estimated" && !data.settings.include_estimated {
            continue;
        }
        let e = by_day.entry(r.day.clone()).or_insert((0, 0, 0, 0, 0.0, 0));
        e.0 += r.input_tokens;
        e.1 += r.output_tokens;
        e.2 += r.cache_read_tokens;
        e.3 += r.cache_creation_tokens;
        e.4 += r.cost_total;
        e.5 += 1;
    }

    let mut rows: Vec<CostTrendRow> = by_day
        .into_iter()
        .map(|(day, (inp, out, cr, cc, cost, cnt))| CostTrendRow {
            day,
            input_tokens: inp,
            output_tokens: out,
            cache_read_tokens: cr,
            cache_creation_tokens: cc,
            cost,
            record_count: cnt,
        })
        .collect();

    // 限制最近 N 天
    if rows.len() > days {
        rows = rows.split_off(rows.len() - days);
    }
    rows
}

/// 聚合：按模型分解
pub fn build_model_breakdown(app: &AppHandle) -> Vec<ModelBreakdownRow> {
    let data = load_cost_data(app);
    let mut by_model: std::collections::BTreeMap<String, (u64, u64, f64, u32)> = std::collections::BTreeMap::new();
    for r in &data.records {
        if r.cost_source == "estimated" && !data.settings.include_estimated {
            continue;
        }
        let e = by_model.entry(r.model.clone()).or_insert((0, 0, 0.0, 0));
        e.0 += r.input_tokens;
        e.1 += r.output_tokens;
        e.2 += r.cost_total;
        e.3 += 1;
    }

    let mut rows: Vec<ModelBreakdownRow> = by_model
        .into_iter()
        .map(|(model, (inp, out, cost, cnt))| ModelBreakdownRow {
            model,
            input_tokens: inp,
            output_tokens: out,
            cost,
            record_count: cnt,
        })
        .collect();

    rows.sort_by(|a, b| b.cost.partial_cmp(&a.cost).unwrap_or(std::cmp::Ordering::Equal));
    rows
}

/// 清空所有成本记录（只清记录，保留 settings）
pub fn clear_records(app: &AppHandle) -> Result<(), String> {
    let mut data = load_cost_data(app);
    data.records.clear();
    save_cost_data(app, &data)
}
