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
pub fn extract_usage(path: &str, tool: &str, mtime_day: &str) -> (String, Vec<UsageAgg>) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return (
                infer_model(tool, ""),
                vec![zero_agg(mtime_day, "zero_pricing")],
            )
        }
    };

    let reader = BufReader::new(file);
    let mut by_day: HashMap<String, UsageAgg> = HashMap::new();
    let mut found_model: Option<String> = None;
    let mut found_usage = false;
    let mut head_line = String::new();

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }
        if head_line.is_empty() {
            head_line = line.clone();
        }
        let parsed: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if found_model.is_none() {
            found_model = model_from_value(&parsed);
        }

        let usage = parsed
            .get("message")
            .and_then(|m| m.get("usage"))
            .or_else(|| parsed.get("usage"));
        let usage = match usage {
            Some(u) => u,
            None => continue,
        };
        let inp = usage_token_u64(usage.get("input_tokens"))
            .or_else(|| usage_token_u64(usage.get("inputTokens")))
            .or_else(|| usage_token_u64(usage.get("prompt_tokens")))
            .unwrap_or(0);
        let out = usage_token_u64(usage.get("output_tokens"))
            .or_else(|| usage_token_u64(usage.get("outputTokens")))
            .or_else(|| usage_token_u64(usage.get("completion_tokens")))
            .unwrap_or(0);
        if inp == 0 && out == 0 {
            continue;
        }
        let cache_read = usage_token_u64(usage.get("cache_read_input_tokens")).unwrap_or(0);
        let cache_creation = usage_token_u64(usage.get("cache_creation_input_tokens")).unwrap_or(0);

        found_usage = true;
        let day = line_day(&parsed).unwrap_or_else(|| mtime_day.to_string());
        let agg = by_day
            .entry(day.clone())
            .or_insert_with(|| zero_agg(&day, "measured"));
        agg.input = agg.input.saturating_add(inp);
        agg.output = agg.output.saturating_add(out);
        agg.cache_read = agg.cache_read.saturating_add(cache_read);
        agg.cache_creation = agg.cache_creation.saturating_add(cache_creation);
    }

    let model = found_model.unwrap_or_else(|| infer_model(tool, &head_line));

    if found_usage {
        let mut aggs: Vec<UsageAgg> = by_day.into_values().collect();
        aggs.sort_by(|a, b| a.day.cmp(&b.day));
        return (model, aggs);
    }

    // 降级：启发式估算（4 chars/token 是业界常用经验值），整文件记到 mtime 日
    let (est_inp, est_out) = heuristic_estimate(path);
    if est_inp + est_out > 0 {
        return (
            model,
            vec![UsageAgg {
                day: mtime_day.to_string(),
                input: est_inp,
                output: est_out,
                cache_read: 0,
                cache_creation: 0,
                source: "estimated".to_string(),
            }],
        );
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

/// 从已知格式的 JSON 中提取 (input, output) usage —— 保留给单测与外部复用。
fn extract_usage_from_json(v: &serde_json::Value) -> Option<(u64, u64)> {
    let usage = v
        .get("message")
        .and_then(|m| m.get("usage"))
        .or_else(|| v.get("usage"))?;
    let inp = usage_token_u64(usage.get("input_tokens"))
        .or_else(|| usage_token_u64(usage.get("inputTokens")))
        .or_else(|| usage_token_u64(usage.get("prompt_tokens")))?;
    let out = usage_token_u64(usage.get("output_tokens"))
        .or_else(|| usage_token_u64(usage.get("outputTokens")))
        .or_else(|| usage_token_u64(usage.get("completion_tokens")))?;
    if inp > 0 || out > 0 {
        Some((inp, out))
    } else {
        None
    }
}

fn usage_token_u64(v: Option<&serde_json::Value>) -> Option<u64> {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_u64(),
        Some(serde_json::Value::String(s)) => s.parse::<u64>().ok(),
        _ => None,
    }
}

/// 启发式估算：读取全部文本，character_count / 4 估 token，按 6:4 粗分 input:output。
fn heuristic_estimate(path: &str) -> (u64, u64) {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(_) => return (0, 0),
    };
    let total_chars = text.chars().count() as f64;
    let total_tokens = (total_chars / 4.0).max(0.0) as u64;
    if total_tokens == 0 {
        return (0, 0);
    }
    let input = (total_tokens as f64 * 0.6) as u64;
    let output = total_tokens - input;
    (input, output)
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
        let (model, aggs) = extract_usage(&f.path, &f.tool, &mtime_day);
        for agg in aggs {
            let (cost_inp, cost_out, cost_total) = table.calc_cost(
                &model,
                agg.input,
                agg.output,
                agg.cache_read,
                agg.cache_creation,
            );
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
                cost_source: agg.source,
                day: agg.day,
            });
        }
    }
    records
}

fn unix_to_day(unix_secs: u64) -> String {
    let dt = chrono::DateTime::from_timestamp(unix_secs as i64, 0)
        .unwrap_or_else(|| chrono::DateTime::UNIX_EPOCH);
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
        assert_eq!(extract_usage_from_json(&v), Some((15000, 2500)));
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
        assert_eq!(extract_usage_from_json(&v), Some((100, 50)));
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
        let (model, aggs) = extract_usage(tmp.to_str().unwrap(), "Claude Code", "2026-01-05");
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
        let (_model, aggs) = extract_usage(tmp.to_str().unwrap(), "Claude Code", "2026-01-06");
        assert_eq!(aggs.len(), 1);
        assert_eq!(aggs[0].source, "estimated");
        assert!(aggs[0].input + aggs[0].output > 0);
        assert_eq!(aggs[0].day, "2026-01-06");
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
    fn round3_works() {
        assert_eq!(round3(1.23456), 1.235);
        assert_eq!(round3(0.0), 0.0);
    }
}
