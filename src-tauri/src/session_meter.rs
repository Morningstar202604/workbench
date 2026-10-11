//! Session 计费：从 JSONL 会话文件中提取 token usage 并计算成本
//!
//! 支持的格式：
//! - Claude Code (~/.claude/projects/**/*.jsonl): 顶层 model 字段 + message.usage + 行级 timestamp
//! - Codex CLI (~/.codex/sessions/**/*.jsonl): 滚动日志格式
//! - 通用 fallback: 启发式估算（4 chars/token）
//!
//! 设计：三级降级
//!   1) 有 usage 字段（measured）—— 按行级 timestamp 分日聚合，跨天会话不再整记到 mtime 日
//!   2) 无 usage 但有内容，按字符数启发式估算（estimated）
//!   3) 什么都没有（zero_pricing）
//!
//! 计价语义：Anthropic 的 input_tokens 不含 cache_read/cache_creation（三者互斥），
//! 因此不做减法，cache 分量单独按折扣/溢价计价（见 pricing.rs::calc_cost）。

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};

use crate::cost_store::CostRecord;
use crate::pricing::{infer_model, PricingTable};

/// 单日聚合的用量。
#[derive(Debug, Clone, PartialEq)]
pub struct UsageAgg {
    pub day: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
    /// "measured" | "estimated" | "zero_pricing"
    pub source: String,
}

/// 从单个 JSONL 文件提取 (模型, 按日聚合的用量列表)。
/// `mtime_day`：文件 mtime 对应日期，作为无行级时间戳时的兜底归属日。
pub fn extract_usage(path: &str, mtime_day: &str) -> (String, Vec<UsageAgg>) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            // 读不动的文件不猜模型：标 zero_pricing，金额为 0，由 UI 明示未定价
            return (infer_model(""), vec![zero_agg(mtime_day, "zero_pricing")]);
        }
    };

    let reader = BufReader::new(file);
    let mut by_day: HashMap<String, UsageAgg> = HashMap::new();
    let mut chars_by_day: HashMap<String, usize> = HashMap::new();
    let mut found_model: Option<String> = None;
    let mut found_usage = false;
    let mut head_line = String::new();
    let mut latest_day: Option<String> = None;

    for line_result in reader.lines() {
        let Ok(line) = line_result else { continue };
        if line.trim().is_empty() {
            continue;
        }
        if head_line.is_empty() {
            head_line = line.clone();
        }
        let parsed: Option<serde_json::Value> = serde_json::from_str(&line).ok();

        // 归属日：行级 timestamp 优先；取不到就挂到已见到的最近一天，最后兜底 mtime 日。
        // 同时累计每天的字符数，供无 usage 时的启发式估算按日分桶使用。
        let day = parsed
            .as_ref()
            .and_then(line_day)
            .or_else(|| latest_day.clone())
            .unwrap_or_else(|| mtime_day.to_string());
        if latest_day.as_deref().map_or(true, |prev| day.as_str() > prev) {
            latest_day = Some(day.clone());
        }
        *chars_by_day.entry(day.clone()).or_insert(0) += line.chars().count();

        let Some(value) = parsed else { continue };
        if found_model.is_none() {
            found_model = model_from_value(&value);
        }
        let Some(usage) = usage_from_value(&value) else {
            continue;
        };

        // 纯缓存行（input/output 均为 0 但 cache 分量非 0）同样是真实计费事件，不能跳过
        if usage.is_empty() {
            continue;
        }

        found_usage = true;
        let agg = by_day
            .entry(day.clone())
            .or_insert_with(|| zero_agg(&day, "measured"));
        agg.input = agg.input.saturating_add(usage.input);
        agg.output = agg.output.saturating_add(usage.output);
        agg.cache_read = agg.cache_read.saturating_add(usage.cache_read);
        agg.cache_creation = agg.cache_creation.saturating_add(usage.cache_creation);
    }

    let model = found_model.unwrap_or_else(|| infer_model(&head_line));

    if found_usage {
        let mut aggs: Vec<UsageAgg> = by_day.into_values().collect();
        aggs.sort_by(|a, b| a.day.cmp(&b.day));
        return (model, aggs);
    }

    // 降级：按日分桶的字符估算（4 chars/token 是业界常用经验值）。
    // 关键点是分桶而不是整文件记到 mtime 日：会话追加只会改变最新一天的桶，
    // 往日柱子保持稳定，趋势图不会自己重写历史。
    let mut aggs: Vec<UsageAgg> = chars_by_day
        .into_iter()
        .filter_map(|(day, chars)| {
            let total = (chars / 4) as u64;
            if total == 0 {
                return None;
            }
            let input = total * 6 / 10;
            Some(UsageAgg {
                day,
                input,
                output: total - input,
                cache_read: 0,
                cache_creation: 0,
                source: "estimated".to_string(),
            })
        })
        .collect();
    if !aggs.is_empty() {
        aggs.sort_by(|a, b| a.day.cmp(&b.day));
        return (model, aggs);
    }
    (model, vec![zero_agg(mtime_day, "zero_pricing")])
}

fn zero_agg(day: &str, source: &str) -> UsageAgg {
    UsageAgg {
        day: day.to_string(),
        input: 0,
        output: 0,
        cache_read: 0,
        cache_creation: 0,
        source: source.to_string(),
    }
}

/// 从 JSON 值提取模型名（顶层 model / manifest.model）。
fn model_from_value(v: &serde_json::Value) -> Option<String> {
    if let Some(m) = v.get("model").and_then(|s| s.as_str()) {
        if !m.is_empty() {
            return Some(m.to_string());
        }
    }
    if let Some(m) = v
        .get("manifest")
        .and_then(|mf| mf.get("model"))
        .and_then(|s| s.as_str())
    {
        if !m.is_empty() {
            return Some(m.to_string());
        }
    }
    None
}

/// 行级时间戳 → 本地日期（YYYY-MM-DD）。支持 RFC3339 字符串、秒/毫秒数值、time.created。
fn line_day(v: &serde_json::Value) -> Option<String> {
    let to_day = |secs: i64| -> Option<String> {
        chrono::DateTime::from_timestamp(secs, 0).map(|dt| {
            dt.with_timezone(&chrono::Local)
                .format("%Y-%m-%d")
                .to_string()
        })
    };
    let ts = v.get("timestamp").or_else(|| v.get("time"))?;
    if let Some(s) = ts.as_str() {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
            return Some(dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string());
        }
        if let Ok(naive) = s.parse::<i64>() {
            return to_day(normalize_epoch(naive));
        }
        return None;
    }
    if let Some(n) = ts.as_i64() {
        return to_day(normalize_epoch(n));
    }
    // opencode 风格：time: { created: <ms> }
    ts.get("created").and_then(|c| c.as_i64()).and_then(|n| to_day(normalize_epoch(n)))
}

/// 秒 / 毫秒时间戳统一为秒。
fn normalize_epoch(n: i64) -> i64 {
    if n > 1_000_000_000_000 {
        n / 1000
    } else {
        n
    }
}

/// 一条 usage 的四个分量。
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Usage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_creation: u64,
}

impl Usage {
    fn is_empty(&self) -> bool {
        self.input + self.output + self.cache_read + self.cache_creation == 0
    }
}

/// 从一行 JSONL 提取 usage：兼容 Claude Code（message.usage）、OpenAI 风格
/// （顶层 usage + prompt/completion_tokens）与驼峰命名。生产路径与单测共用同一实现，
/// 避免「测的是生产不跑的函数」这种假信心。
fn usage_from_value(v: &serde_json::Value) -> Option<Usage> {
    let usage = v
        .get("message")
        .and_then(|m| m.get("usage"))
        .or_else(|| v.get("usage"))?;
    let pick = |keys: [&str; 3]| -> u64 {
        keys.iter()
            .filter_map(|k| usage_token_u64(usage.get(*k)))
            .next()
            .unwrap_or(0)
    };
    let input = pick(["input_tokens", "inputTokens", "prompt_tokens"]);
    let output = pick(["output_tokens", "outputTokens", "completion_tokens"]);
    let cache_read = usage_token_u64(usage.get("cache_read_input_tokens")).unwrap_or(0);
    let cache_creation =
        usage_token_u64(usage.get("cache_creation_input_tokens")).unwrap_or(0);
    Some(Usage {
        input,
        output,
        cache_read,
        cache_creation,
    })
}

fn usage_token_u64(v: Option<&serde_json::Value>) -> Option<u64> {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_u64(),
        Some(serde_json::Value::String(s)) => s.parse::<u64>().ok(),
        _ => None,
    }
}

/// 批量扫描 session 文件 → 成本记录。
/// `existing_keys`：已有的 (file_path, mtime, size) 集合，跳过未变化的文件（幂等）。
/// 同一文件可产出多条按日记录；持久化层按 file_path 整组替换，保证不重复计费。
pub fn scan_sessions_to_records(
    files: &[SessionFileEntry],
    table: &PricingTable,
    existing_keys: &HashMap<(String, u64, u64), ()>,
) -> Vec<CostRecord> {
    let mut records = Vec::new();
    for f in files {
        let key = (f.path.clone(), f.modified, f.size);
        if existing_keys.contains_key(&key) {
            continue;
        }

        let mtime_day = unix_to_day(f.modified);
        let (model, aggs) = extract_usage(&f.path, &mtime_day);
        let priced = table.is_priced(&model);
        for agg in aggs {
            let (cost_inp, cost_out, cost_total) = table.calc_cost(
                &model,
                agg.input,
                agg.output,
                agg.cache_read,
                agg.cache_creation,
            );
            // 查不到单价的型号：一律记 zero_pricing，绝不让它伪装成「花了 $0.00」的有效账单
            let source = if priced { agg.source } else { "zero_pricing".to_string() };
            records.push(CostRecord {
                file_path: f.path.clone(),
                file_mtime: f.modified,
                file_size: f.size,
                tool: f.tool.clone(),
                project: f.project.clone(),
                model: model.clone(),
                input_tokens: agg.input,
                output_tokens: agg.output,
                cache_read_tokens: agg.cache_read,
                cache_creation_tokens: agg.cache_creation,
                cost_input: round3(cost_inp),
                cost_output: round3(cost_out),
                cost_total: round3(cost_total),
                cost_source: source,
                day: agg.day,
            });
        }
    }
    records
}

fn unix_to_day(unix_secs: u64) -> String {
    let dt = chrono::DateTime::from_timestamp(unix_secs as i64, 0)
        .unwrap_or(chrono::DateTime::UNIX_EPOCH);
    dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string()
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// 简化的 session 文件描述（给 batch 扫描用）
#[derive(Clone, Debug, Serialize)]
pub struct SessionFileEntry {
    pub path: String,
    pub tool: String,
    pub project: String,
    pub modified: u64,
    pub size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_claude_code_format() {
        let json = r#"{
            "type": "assistant",
            "model": "claude-sonnet-4-5",
            "message": {
                "role": "assistant",
                "usage": {
                    "input_tokens": 15000,
                    "output_tokens": 2500
                }
            }
        }"#;
        let v: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(
            usage_from_value(&v),
            Some(Usage {
                input: 15000,
                output: 2500,
                cache_read: 0,
                cache_creation: 0
            })
        );
    }

    #[test]
    fn extract_openai_format() {
        let json = r#"{
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50
            }
        }"#;
        let v: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(
            usage_from_value(&v),
            Some(Usage {
                input: 100,
                output: 50,
                cache_read: 0,
                cache_creation: 0
            })
        );
    }

    #[test]
    fn cache_only_line_is_not_dropped() {
        // 纯缓存写入行：input/output 为 0 但 cache_creation 非 0，这是真实计费事件
        let json = r#"{"usage":{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":8000}}"#;
        let v: serde_json::Value = serde_json::from_str(json).unwrap();
        let usage = usage_from_value(&v).expect("应识别为有效 usage");
        assert!(!usage.is_empty());
        assert_eq!(usage.cache_creation, 8000);
    }

    #[test]
    fn measured_usage_splits_by_line_timestamp() {
        let tmp = std::env::temp_dir().join("wb-day-split.jsonl");
        let lines = [
            r#"{"type":"assistant","model":"claude-sonnet-4-5","timestamp":"2026-01-04T10:00:00Z","message":{"usage":{"input_tokens":100,"output_tokens":10,"cache_read_input_tokens":500,"cache_creation_input_tokens":50}}}"#,
            r#"{"type":"assistant","model":"claude-sonnet-4-5","timestamp":"2026-01-04T23:30:00Z","message":{"usage":{"input_tokens":200,"output_tokens":20}}}"#,
            r#"{"type":"assistant","model":"claude-sonnet-4-5","timestamp":"2026-01-05T01:00:00Z","message":{"usage":{"input_tokens":300,"output_tokens":30,"cache_read_input_tokens":900}}}"#,
        ];
        fs::write(&tmp, lines.join("\n")).unwrap();
        let (model, aggs) = extract_usage(tmp.to_str().unwrap(), "2026-01-05");
        assert_eq!(model, "claude-sonnet-4-5");
        assert_eq!(aggs.len(), 2, "跨两天应拆成两条记录，got {:?}", aggs);
        let total_input: u64 = aggs.iter().map(|a| a.input).sum();
        let total_cache_read: u64 = aggs.iter().map(|a| a.cache_read).sum();
        assert_eq!(total_input, 600);
        assert_eq!(total_cache_read, 1400);
        assert!(aggs.iter().all(|a| a.source == "measured"));
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn no_usage_falls_back_to_estimated() {
        let tmp = std::env::temp_dir().join("wb-estimate.jsonl");
        let content = "This is a test line with about forty characters of text content here.\nAnother line of similar length and content here.";
        fs::write(&tmp, content).unwrap();
        let (_model, aggs) = extract_usage(tmp.to_str().unwrap(), "2026-01-06");
        assert_eq!(aggs.len(), 1);
        assert_eq!(aggs[0].source, "estimated");
        assert!(aggs[0].input + aggs[0].output > 0);
        assert_eq!(aggs[0].day, "2026-01-06");
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn estimated_rows_are_bucketed_by_line_day_and_stay_stable() {
        // 无 usage 但每行有时间戳：估算应落到各自的那一天，而不是整文件挂到 mtime 日
        let tmp = std::env::temp_dir().join("wb-estimate-perday.jsonl");
        let day_a = r#"{"type":"user","timestamp":"2026-01-03T09:00:00Z","message":{"content":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}"#;
        let day_b = r#"{"type":"user","timestamp":"2026-01-04T09:00:00Z","message":{"content":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}}"#;
        fs::write(&tmp, format!("{day_a}\n{day_b}\n")).unwrap();

        let (_m, first_two) = extract_usage(tmp.to_str().unwrap(), "2026-01-09");
        assert_eq!(
            first_two.iter().map(|a| a.day.as_str()).collect::<Vec<_>>(),
            vec!["2026-01-03", "2026-01-04"],
            "估算必须按行级日期分桶，不能整组挂到 mtime 日"
        );

        // 追加新一天后，往日桶的 token 数不应变化 —— 趋势图不重写历史
        let day_c = r#"{"type":"user","timestamp":"2026-01-05T09:00:00Z","message":{"content":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}}"#;
        let mut text = fs::read_to_string(&tmp).unwrap();
        text.push_str(day_c);
        text.push('\n');
        fs::write(&tmp, &text).unwrap();

        let (_m, after) = extract_usage(tmp.to_str().unwrap(), "2026-01-09");
        assert_eq!(after.len(), 3);
        for day in ["2026-01-03", "2026-01-04"] {
            let before = first_two.iter().find(|a| a.day == day).unwrap();
            let now = after.iter().find(|a| a.day == day).unwrap();
            assert_eq!(
                (before.input, before.output),
                (now.input, now.output),
                "{day} 的估算量不应随文件追加而变化"
            );
        }
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn records_use_raw_input_without_cache_subtraction() {
        let tmp = std::env::temp_dir().join("wb-no-subtract.jsonl");
        let line = r#"{"model":"claude-sonnet-4-5","timestamp":"2026-01-06T10:00:00Z","message":{"usage":{"input_tokens":1000,"output_tokens":500,"cache_read_input_tokens":9000}}}"#;
        fs::write(&tmp, format!("{line}\n")).unwrap();
        let meta = fs::metadata(&tmp).unwrap();
        let modified = meta
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let entries = vec![SessionFileEntry {
            path: tmp.to_str().unwrap().to_string(),
            tool: "Claude Code".to_string(),
            project: "p".to_string(),
            modified,
            size: meta.len(),
        }];
        let table = PricingTable::default();
        let records = scan_sessions_to_records(&entries, &table, &HashMap::new());
        assert_eq!(records.len(), 1);
        // input 1000 全额计价，不被 cache 9000 吃掉
        assert_eq!(records[0].input_tokens, 1000);
        assert_eq!(records[0].cache_read_tokens, 9000);
        assert!(records[0].cost_input > 0.003, "got {}", records[0].cost_input);
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn unpriced_model_is_flagged_zero_pricing_not_free_money() {
        // 回归：型号推断失败或价格表没有该型号时，不能伪装成「花了 $0.00」的有效记录
        let tmp = std::env::temp_dir().join("wb-unpriced.jsonl");
        let line = r#"{"model":"some-brand-new-model-9000","timestamp":"2026-01-07T10:00:00Z","message":{"usage":{"input_tokens":1000,"output_tokens":500}}}"#;
        fs::write(&tmp, format!("{line}\n")).unwrap();
        let entries = vec![SessionFileEntry {
            path: tmp.to_str().unwrap().to_string(),
            tool: "Claude Code".to_string(),
            project: "p".to_string(),
            modified: 1_767_000_000,
            size: 1,
        }];
        let records = scan_sessions_to_records(&entries, &PricingTable::default(), &HashMap::new());
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].cost_source, "zero_pricing");
        assert_eq!(records[0].cost_total, 0.0);
        // token 数仍然保留，用户能看出「有用量但没定价」而不是凭空没花钱
        assert_eq!(records[0].input_tokens, 1000);
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn round3_works() {
        assert_eq!(round3(1.23456), 1.235);
        assert_eq!(round3(0.0), 0.0);
    }
}
