//! 成本数据持久化（JSON 文件，幂等导入）
//!
//! 设计取舍：
//! - 不用 SQLite —— 工作台的数据量级（几百~几万条成本记录）用 JSON 足够了
//! - 原子写入 + 损坏文件保全 —— 见 json_store
//! - 幂等：每条记录以 file_path + file_mtime + file_size 为去重键，重复扫描不重复计费
//! - 并发：所有「读-改-写」在 COST_LOCK 内完成。扫描/保存设置/清空若并发执行，
//!   不加锁会互相覆盖（后写者用自己那份旧快照盖掉前者刚写入的记录）。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

use crate::json_store;

/// 成本库读写锁（进程内单实例桌面应用，静态锁足够）。
static COST_LOCK: Mutex<()> = Mutex::new(());

fn lock() -> MutexGuard<'static, ()> {
    COST_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

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
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("cost_data.json"))
}

/// 用户自定义定价覆盖文件路径
pub fn cost_data_path_overrides(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("pricing_overrides.json"))
}

/// 锁外只读取一次快照，损坏时把真实错误抛给调用方（不再静默清零）。
fn load_cost_data(app: &AppHandle) -> Result<CostData, String> {
    Ok(json_store::read_json(&cost_data_path(app)?)?.unwrap_or_default())
}

fn save_cost_data(app: &AppHandle, data: &CostData) -> Result<(), String> {
    json_store::write_json_atomic(&cost_data_path(app)?, data)
}

/// 在锁内做「读-改-写」；闭包返回 Ok(false) 表示无变更，可跳过落盘。
fn mutate<T>(app: &AppHandle, f: impl FnOnce(&mut CostData) -> T) -> Result<T, String> {
    let _guard = lock();
    let mut data = load_cost_data(app)?;
    let out = f(&mut data);
    save_cost_data(app, &data)?;
    Ok(out)
}

/// 在锁内做只读聚合。
fn view<T>(app: &AppHandle, f: impl FnOnce(&CostData) -> T) -> Result<T, String> {
    let _guard = lock();
    Ok(f(&load_cost_data(app)?))
}

/// 已入库文件的 (path, mtime, size) 快照，供扫描跳过未变化文件。
pub fn existing_keys(app: &AppHandle) -> Result<HashMap<(String, u64, u64), ()>, String> {
    view(app, |data| {
        data.records
            .iter()
            .map(|r| ((r.file_path.clone(), r.file_mtime, r.file_size), ()))
            .collect()
    })
}

/// 获取当前成本设置。
pub fn get_cost_settings(app: &AppHandle) -> Result<CostSettings, String> {
    view(app, |data| data.settings.clone())
}

pub fn save_cost_settings(app: &AppHandle, settings: CostSettings) -> Result<(), String> {
    mutate(app, |data| data.settings = settings)
}

/// 导入：按 file_path **整组替换**。
/// 同一会话文件每次变化只保留最新一组按日记录，避免旧快照与新快照重复累加。
/// 返回值 = 净新增记录数（新文件的全部记录；已存在文件被替换则记 0 或差额）。
pub fn import_records(app: &AppHandle, new_records: &[CostRecord]) -> Result<usize, String> {
    if new_records.is_empty() {
        return Ok(0);
    }
    mutate(app, |data| apply_import(data, new_records))
}

/// 纯函数：整组替换 + 返回净增量。单独抽出来是为了可脱离 AppHandle 测试。
fn apply_import(data: &mut CostData, new_records: &[CostRecord]) -> usize {
    let touched_paths: HashSet<String> = new_records.iter().map(|r| r.file_path.clone()).collect();
    let old_len = data.records.len();
    data.records.retain(|r| !touched_paths.contains(&r.file_path));
    let replaced = old_len - data.records.len();
    data.records.extend(new_records.iter().cloned());

    let net = data.records.len().saturating_sub(old_len);
    log::info!(
        "成本导入: 整组替换 {replaced} 条旧记录，净新增 {net} 条（库内共 {} 条）",
        data.records.len()
    );
    net
}

pub fn clear_records(app: &AppHandle) -> Result<(), String> {
    mutate(app, |data| data.records.clear())
}

pub fn build_overview(app: &AppHandle) -> Result<CostOverview, String> {
    view(app, overview_of)
}

/// 纯函数：按 settings.include_estimated 决定估算行是否参与金额聚合。
fn overview_of(data: &CostData) -> CostOverview {
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
    overview.budget_exceeded = overview.daily_pct >= 100.0 || overview.monthly_pct >= 100.0;
    overview
}

/// 聚合：成本趋势（按天）
pub fn build_trend(app: &AppHandle, days: usize) -> Result<Vec<CostTrendRow>, String> {
    view(app, |data| trend_of(data, days))
}

fn trend_of(data: &CostData, days: usize) -> Vec<CostTrendRow> {
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
pub fn build_model_breakdown(app: &AppHandle) -> Result<Vec<ModelBreakdownRow>, String> {
    view(app, model_breakdown_of)
}

fn model_breakdown_of(data: &CostData) -> Vec<ModelBreakdownRow> {
    let mut by_model: std::collections::BTreeMap<String, (u64, u64, f64, u32)> =
        std::collections::BTreeMap::new();
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

    rows.sort_by(|a, b| b.cost.total_cmp(&a.cost));
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(path: &str, day: &str, source: &str, model: &str, cost: f64) -> CostRecord {
        CostRecord {
            file_path: path.to_string(),
            file_mtime: 1_700_000_000,
            file_size: 1024,
            tool: "Claude Code".to_string(),
            project: "p".to_string(),
            model: model.to_string(),
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            cost_input: cost,
            cost_output: 0.0,
            cost_total: cost,
            cost_source: source.to_string(),
            day: day.to_string(),
        }
    }

    fn data_with(records: Vec<CostRecord>) -> CostData {
        CostData {
            records,
            settings: CostSettings::default(),
        }
    }

    #[test]
    fn reimport_same_file_replaces_group_instead_of_accumulating() {
        let mut data = data_with(vec![record("/s/a.jsonl", "2026-10-01", "measured", "claude-sonnet-4-5", 0.5)]);
        // 同一文件增长后重扫：旧的两条按日记录应被这一组的新记录整组替换
        let second = vec![
            record("/s/a.jsonl", "2026-10-01", "measured", "claude-sonnet-4-5", 0.6),
            record("/s/a.jsonl", "2026-10-02", "measured", "claude-sonnet-4-5", 0.4),
        ];
        let net = apply_import(&mut data, &second);

        assert_eq!(data.records.len(), 2, "不应残留旧快照");
        assert_eq!(net, 1, "净新增 = 2 - 1");
        assert_eq!(
            data.records.iter().find(|r| r.day == "2026-10-01").unwrap().cost_total,
            0.6,
            "应保留最新一次扫描的值"
        );
        assert!(data.records.iter().all(|r| r.day != "2026-10-01" || r.cost_total > 0.5));
    }

    #[test]
    fn reimport_identical_snapshot_is_zero_net() {
        let base = vec![record("/s/a.jsonl", "2026-10-01", "measured", "m", 0.5)];
        let mut data = data_with(base.clone());
        assert_eq!(apply_import(&mut data, &base), 0);
        assert_eq!(data.records.len(), 1);
    }

    #[test]
    fn estimated_records_excluded_when_toggle_off() {
        let data = data_with(vec![
            record("/s/a.jsonl", "2026-10-01", "measured", "m", 1.0),
            record("/s/b.jsonl", "2026-10-01", "estimated", "m", 9.0),
        ]);
        let mut off = data.clone();
        off.settings.include_estimated = false;

        let on = overview_of(&data);
        let filtered = overview_of(&off);

        assert!((on.total_cost - 10.0).abs() < 1e-9);
        assert!((filtered.total_cost - 1.0).abs() < 1e-9, "估算行不应计入金额");
        assert_eq!(filtered.estimated_count, 1, "计数仍应可见，用于提示数据质量");
        assert_eq!(filtered.record_count, 1);
        // 趋势与模型分解同样受开关影响
        assert_eq!(trend_of(&off, 14)[0].record_count, 1);
        assert_eq!(model_breakdown_of(&off).len(), 1);
    }

    #[test]
    fn budget_percentage_and_exceeded_flag() {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut data = data_with(vec![record("/s/a.jsonl", &today, "measured", "m", 6.0)]);
        data.settings.daily_budget = 5.0;
        data.settings.monthly_budget = 50.0;

        let o = overview_of(&data);
        assert!((o.daily_pct - 120.0).abs() < 1e-6, "got {}", o.daily_pct);
        assert!(o.budget_exceeded);
    }

    #[test]
    fn trend_keeps_only_latest_days_and_rows_are_cost_ordered() {
        let mut records = Vec::new();
        for d in 1..=20 {
            records.push(record(
                &format!("/s/{d}.jsonl"),
                &format!("2026-05-{d:02}"),
                "measured",
                "m",
                0.1,
            ));
        }
        let data = data_with(records);
        let rows = trend_of(&data, 7);
        assert_eq!(rows.len(), 7);
        assert_eq!(rows.first().unwrap().day, "2026-05-14");
        assert_eq!(rows.last().unwrap().day, "2026-05-20");

        let mut mixed = data_with(vec![
            record("/s/x.jsonl", "2026-05-01", "measured", "cheap", 0.1),
            record("/s/y.jsonl", "2026-05-01", "measured", "expensive", 3.0),
        ]);
        mixed.records.push(record("/s/z.jsonl", "2026-05-02", "measured", "mid", 1.5));
        let models = model_breakdown_of(&mixed);
        assert_eq!(
            models.iter().map(|m| m.model.as_str()).collect::<Vec<_>>(),
            vec!["expensive", "mid", "cheap"]
        );
    }
}
