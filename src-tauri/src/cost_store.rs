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
    COST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

// ── 成本配置（预算 / 自定价 / 告警阈值）─────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, ts_rs::TS)]
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

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct CostOverview {
    pub today_cost: f64,
    #[ts(type = "number")]
    pub today_input_tokens: u64,
    #[ts(type = "number")]
    pub today_output_tokens: u64,
    #[ts(type = "number")]
    pub today_cache_read_tokens: u64,
    #[ts(type = "number")]
    pub today_cache_creation_tokens: u64,
    pub month_cost: f64,
    #[ts(type = "number")]
    pub month_input_tokens: u64,
    #[ts(type = "number")]
    pub month_output_tokens: u64,
    #[ts(type = "number")]
    pub month_cache_read_tokens: u64,
    #[ts(type = "number")]
    pub month_cache_creation_tokens: u64,
    pub total_cost: f64,
    #[ts(type = "number")]
    pub total_input_tokens: u64,
    #[ts(type = "number")]
    pub total_output_tokens: u64,
    #[ts(type = "number")]
    pub total_cache_read_tokens: u64,
    #[ts(type = "number")]
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

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct CostTrendRow {
    pub day: String,
    #[ts(type = "number")]
    pub input_tokens: u64,
    #[ts(type = "number")]
    pub output_tokens: u64,
    #[ts(type = "number")]
    pub cache_read_tokens: u64,
    #[ts(type = "number")]
    pub cache_creation_tokens: u64,
    pub cost: f64,
    pub record_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, ts_rs::TS)]
pub struct ModelBreakdownRow {
    pub model: String,
    #[ts(type = "number")]
    pub input_tokens: u64,
    #[ts(type = "number")]
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
/// 成本库文件路径（供备份命令使用）。
pub fn cost_data_path_public(app: &AppHandle) -> Result<PathBuf, String> {
    cost_data_path(app)
}

fn cost_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir.join("cost_data.json"))
}

/// 定价覆盖的读取结果：合法条目 + 每条被拒的原因。
#[derive(Default, Debug)]
pub struct OverrideRead {
    pub overrides: HashMap<String, (f64, f64)>,
    pub problems: Vec<String>,
}

/// 读取并校验用户的定价覆盖文件。
///
/// 与「静默忽略坏文件」不同：这里把每个条目的校验错误都收集起来返回，
/// 因为定价直接影响账单——用户以为改了价、实际被忽略，比报错更糟。
pub fn read_pricing_overrides(app: &AppHandle) -> Result<OverrideRead, String> {
    read_pricing_overrides_at(&cost_data_path_overrides(app)?)
}

/// 纯路径版本：可脱离 AppHandle 测试（文件格式、逐条校验、空文件语义）。
pub fn read_pricing_overrides_at(path: &std::path::Path) -> Result<OverrideRead, String> {
    let raw: Option<HashMap<String, (f64, f64)>> = json_store::read_json(path)?;
    let Some(map) = raw else {
        return Ok(OverrideRead::default());
    };
    let mut ok = HashMap::new();
    let mut problems = Vec::new();
    for (model, (input, output)) in map {
        match crate::pricing::PricingTable::validate_override(&model, input, output) {
            Ok((key, pair)) => {
                ok.insert(key, pair);
            }
            Err(e) => problems.push(format!("{model}: {e}")),
        }
    }
    Ok(OverrideRead {
        overrides: ok,
        problems,
    })
}

/// 写入定价覆盖（整体替换，原子写）。
pub fn save_pricing_overrides(
    app: &AppHandle,
    overrides: &HashMap<String, (f64, f64)>,
) -> Result<(), String> {
    save_pricing_overrides_at(&cost_data_path_overrides(app)?, overrides)
}

/// 纯路径版本：空表删除文件，非空原子写入。
pub fn save_pricing_overrides_at(
    path: &std::path::Path,
    overrides: &HashMap<String, (f64, f64)>,
) -> Result<(), String> {
    if overrides.is_empty() {
        // 空覆盖表 = 回到内置价：删掉文件比留一个 {} 更干净，
        // 也避免用户误以为「已经改过价」。
        match std::fs::remove_file(path) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(format!("删除 {} 失败: {e}", path.display())),
        }
    }
    json_store::write_json_atomic(path, overrides)
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

/// 在锁内做「读-改-写」；闭包返回 `false` 表示无变更，跳过落盘。
fn mutate<T>(app: &AppHandle, f: impl FnOnce(&mut CostData) -> (T, bool)) -> Result<T, String> {
    let _guard = lock();
    let mut data = load_cost_data(app)?;
    let (out, changed) = f(&mut data);
    if changed {
        save_cost_data(app, &data)?;
    }
    Ok(out)
}

/// 在锁内做只读聚合。
fn view<T>(app: &AppHandle, f: impl FnOnce(&CostData) -> T) -> Result<T, String> {
    let _guard = lock();
    Ok(f(&load_cost_data(app)?))
}

/// 一次扫描的完整结果：导入 + 三个聚合视图。
pub struct ScanOutcome {
    pub net_new: usize,
    pub overview: CostOverview,
    pub trend: Vec<CostTrendRow>,
    pub breakdown: Vec<ModelBreakdownRow>,
}

/// 扫描落库 + 聚合，全程只加一次锁、只读写一次文件。
///
/// 原先 commands.rs 里依次调用 existing_keys / import_records / build_overview /
/// build_trend / build_model_breakdown，每一轮都在锁内全量读 JSON、全量序列化、
/// fsync 一次（记录上万条时 5 次 fsync + 5 次全文件解析）。这些操作本该是
/// 一次事务：扫描结果与聚合视图必须是同一份快照，否则中途失败会留下
/// 「记录已写入、视图还是旧的」的中间态。
pub fn import_and_aggregate(
    app: &AppHandle,
    records: &[CostRecord],
    trend_days: usize,
) -> Result<ScanOutcome, String> {
    let _guard = lock();
    let mut data = load_cost_data(app)?;
    let net_new = apply_import(&mut data, records);
    if !records.is_empty() {
        save_cost_data(app, &data)?;
    }
    Ok(ScanOutcome {
        net_new,
        overview: overview_of(&data),
        trend: trend_of(&data, trend_days),
        breakdown: model_breakdown_of(&data),
    })
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
    mutate(app, |data| {
        let changed = data.settings != settings;
        data.settings = settings;
        ((), changed)
    })
}

/// 导入：按 file_path **整组替换**。
/// 同一会话文件每次变化只保留最新一组按日记录，避免旧快照与新快照重复累加。
/// 返回值 = 净新增记录数（新文件的全部记录；已存在文件被替换则记 0 或差额）。
pub fn import_records(app: &AppHandle, new_records: &[CostRecord]) -> Result<usize, String> {
    if new_records.is_empty() {
        return Ok(0);
    }
    mutate(app, |data| {
        let net = apply_import(data, new_records);
        (net, true)
    })
}

/// 纯函数：整组替换 + 返回净增量。单独抽出来是为了可脱离 AppHandle 测试。
fn apply_import(data: &mut CostData, new_records: &[CostRecord]) -> usize {
    let touched_paths: HashSet<String> = new_records.iter().map(|r| r.file_path.clone()).collect();
    let old_len = data.records.len();
    data.records
        .retain(|r| !touched_paths.contains(&r.file_path));
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
    mutate(app, |data| {
        let changed = !data.records.is_empty();
        data.records.clear();
        ((), changed)
    })
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

    /// 临时目录（不引 tempfile 依赖，只用标准库）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wb-cost-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn pricing_overrides_roundtrip_and_empty_deletes_file() {
        let dir = temp_dir("pricing");
        let path = dir.join("pricing_overrides.json");

        // 无文件 → 空覆盖、无问题
        let read = read_pricing_overrides_at(&path).unwrap();
        assert!(read.overrides.is_empty());
        assert!(read.problems.is_empty());

        let mut map = HashMap::new();
        map.insert("my-model".to_string(), (1.5, 6.0));
        map.insert("gpt-4o".to_string(), (9.0, 30.0));
        save_pricing_overrides_at(&path, &map).unwrap();
        assert!(path.exists());

        let read = read_pricing_overrides_at(&path).unwrap();
        assert_eq!(read.overrides.len(), 2);
        assert_eq!(read.overrides["gpt-4o"], (9.0, 30.0));
        assert!(read.problems.is_empty());

        // 空表 → 删文件（回到内置价），而不是留一个 {}
        save_pricing_overrides_at(&path, &HashMap::new()).unwrap();
        assert!(!path.exists(), "空覆盖必须删除文件");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pricing_overrides_bad_entries_are_reported_not_dropped_silently() {
        let dir = temp_dir("pricing-bad");
        let path = dir.join("pricing_overrides.json");
        // 手工写入：一条合法、三条非法（负价 / 全 0 / 过高）
        std::fs::write(
            &path,
            r#"{"good-model":[1.0,2.0],"neg":[-1.0,2.0],"zero":[0.0,0.0],"huge":[20000.0,1.0]}"#,
        )
        .unwrap();

        let read = read_pricing_overrides_at(&path).unwrap();
        assert_eq!(read.overrides.len(), 1, "只有合法条目生效");
        assert_eq!(read.overrides["good-model"], (1.0, 2.0));
        assert_eq!(read.problems.len(), 3, "每条非法条目都要有原因");
        assert!(read.problems.iter().any(|p| p.starts_with("neg:")));
        assert!(read.problems.iter().any(|p| p.starts_with("zero:")));
        assert!(read.problems.iter().any(|p| p.starts_with("huge:")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pricing_overrides_model_names_are_normalized_on_read() {
        let dir = temp_dir("pricing-norm");
        let path = dir.join("pricing_overrides.json");
        std::fs::write(&path, r#"{"My-Model":[1.0,2.0]}"#).unwrap();
        let read = read_pricing_overrides_at(&path).unwrap();
        // 键统一小写，否则 lookup 的小写匹配永远命中不了大写键
        assert!(read.overrides.contains_key("my-model"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reimport_same_file_replaces_group_instead_of_accumulating() {
        let mut data = data_with(vec![record(
            "/s/a.jsonl",
            "2026-10-01",
            "measured",
            "claude-sonnet-4-5",
            0.5,
        )]);
        // 同一文件增长后重扫：旧的两条按日记录应被这一组的新记录整组替换
        let second = vec![
            record(
                "/s/a.jsonl",
                "2026-10-01",
                "measured",
                "claude-sonnet-4-5",
                0.6,
            ),
            record(
                "/s/a.jsonl",
                "2026-10-02",
                "measured",
                "claude-sonnet-4-5",
                0.4,
            ),
        ];
        let net = apply_import(&mut data, &second);

        assert_eq!(data.records.len(), 2, "不应残留旧快照");
        assert_eq!(net, 1, "净新增 = 2 - 1");
        assert_eq!(
            data.records
                .iter()
                .find(|r| r.day == "2026-10-01")
                .unwrap()
                .cost_total,
            0.6,
            "应保留最新一次扫描的值"
        );
        assert!(data
            .records
            .iter()
            .all(|r| r.day != "2026-10-01" || r.cost_total > 0.5));
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
        assert!(
            (filtered.total_cost - 1.0).abs() < 1e-9,
            "估算行不应计入金额"
        );
        assert_eq!(
            filtered.estimated_count, 1,
            "计数仍应可见，用于提示数据质量"
        );
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
        mixed
            .records
            .push(record("/s/z.jsonl", "2026-05-02", "measured", "mid", 1.5));
        let models = model_breakdown_of(&mixed);
        assert_eq!(
            models.iter().map(|m| m.model.as_str()).collect::<Vec<_>>(),
            vec!["expensive", "mid", "cheap"]
        );
    }
}
