//! 模型定价与成本计算
//!
//! 价格单位：USD / 1M tokens。内置主流厂商公开价格快照，可被用户自定义覆盖。
//! 匹配逻辑：先精确匹配 → 再前缀匹配（如 `claude-sonnet-4-5` 匹配 `claude-sonnet-4`）。

use serde::Serialize;
use std::collections::HashMap;

/// (input_price, output_price)  USD per 1M tokens
pub type PricePair = (f64, f64);

/// 内置价格快照。键为模型名（小写），值为 (input, output) 单价。
/// 参考 TokenLens 的价格表架构，但用更精简的 Rust HashMap 实现。
fn builtin_pricing() -> HashMap<&'static str, PricePair> {
    let mut m = HashMap::new();

    // OpenAI
    m.insert("gpt-5", (1.25, 10.0));
    m.insert("gpt-5-mini", (0.25, 2.0));
    m.insert("gpt-5-nano", (0.05, 0.4));
    m.insert("gpt-4.1", (2.0, 8.0));
    m.insert("gpt-4.1-mini", (0.4, 1.6));
    m.insert("gpt-4.1-nano", (0.1, 0.4));
    m.insert("gpt-4o-mini", (0.15, 0.6));
    m.insert("gpt-4o", (2.5, 10.0));
    m.insert("gpt-4-turbo", (10.0, 30.0));
    m.insert("o4-mini", (1.1, 4.4));
    m.insert("o3-mini", (1.1, 4.4));
    m.insert("o3", (2.0, 8.0));
    m.insert("o1-mini", (1.1, 4.4));
    m.insert("o1", (15.0, 60.0));
    m.insert("text-embedding-3-small", (0.02, 0.0));
    m.insert("text-embedding-3-large", (0.13, 0.0));

    // Anthropic
    m.insert("claude-opus-4-1", (15.0, 75.0));
    m.insert("claude-opus-4-5", (15.0, 75.0));
    m.insert("claude-sonnet-4-5", (3.0, 15.0));
    m.insert("claude-sonnet-4-20250514", (3.0, 15.0));
    m.insert("claude-haiku-4-5", (1.0, 5.0));
    m.insert("claude-3-5-sonnet", (3.0, 15.0));
    m.insert("claude-3-7-sonnet", (3.0, 15.0));
    m.insert("claude-3-5-haiku", (0.8, 4.0));
    m.insert("claude-3-opus", (15.0, 75.0));
    m.insert("claude-3-sonnet", (3.0, 15.0));
    m.insert("claude-3-haiku", (0.25, 1.25));

    // DeepSeek
    m.insert("deepseek-reasoner", (0.55, 2.19));
    m.insert("deepseek-chat", (0.27, 1.10));
    m.insert("deepseek-r1", (0.55, 2.19));
    m.insert("deepseek-v3", (0.27, 1.10));

    // 阿里通义千问
    m.insert("qwen-plus", (0.4, 1.2));
    m.insert("qwen-turbo", (0.1, 0.3));
    m.insert("qwen-max", (0.8, 2.4));
    m.insert("qwen-long", (0.1, 0.3));

    // 字节豆包
    m.insert("doubao-pro-32k", (0.8, 2.0));
    m.insert("doubao-pro-128k", (0.8, 2.0));
    m.insert("doubao-lite-32k", (0.1, 0.3));

    // 智谱 GLM
    m.insert("glm-4-plus", (0.1, 0.1));
    m.insert("glm-4", (0.1, 0.1));
    m.insert("glm-4-air", (0.01, 0.01));
    m.insert("glm-4-flash", (0.0, 0.0));

    // Kimi (Moonshot)
    m.insert("moonshot-v1-8k", (0.1, 0.3));
    m.insert("moonshot-v1-32k", (0.2, 0.6));
    m.insert("moonshot-v1-128k", (0.4, 1.2));

    // OpenRouter 常用
    m.insert("mistral-large", (2.0, 6.0));
    m.insert("mistral-small", (0.2, 0.6));
    m.insert("llama-3.1-405b", (3.5, 3.5));

    // Google
    m.insert("gemini-2.5-pro", (1.25, 10.0));
    m.insert("gemini-2.5-flash", (0.15, 0.6));
    m.insert("gemini-2.0-flash", (0.1, 0.4));

    // xAI
    m.insert("grok-3", (3.0, 15.0));
    m.insert("grok-3-mini", (0.3, 0.5));
    m.insert("grok-2", (2.0, 10.0));

    // 国产其他（键必须小写：lookup 会先把模型名转小写）
    m.insert("ernie-4.0", (0.12, 0.12));
    m.insert("ernie-3.5", (0.12, 0.12));

    m
}

/// 预构建的内置价格表：HashMap + 按长度降序的前缀键。
///
/// 原先每次 `lookup` 都重建一次 HashMap（56 条 insert）再 `collect + sort`
/// 全部键 —— 实测 4.85µs/次。一次成本扫描对每条记录调 2 次 lookup
/// （is_priced + calc_cost），1 万条记录就是近 100ms 的纯开销。
/// 内置表是编译期常量，进程内只需构建一次。
struct BuiltinTable {
    prices: HashMap<&'static str, PricePair>,
    /// 前缀匹配候选，按长度降序（优先最长前缀）
    prefix_keys: Vec<&'static str>,
}

fn builtin_table() -> &'static BuiltinTable {
    use std::sync::OnceLock;
    static TABLE: OnceLock<BuiltinTable> = OnceLock::new();
    TABLE.get_or_init(|| {
        let prices = builtin_pricing();
        let mut prefix_keys: Vec<&'static str> = prices.keys().copied().collect();
        prefix_keys.sort_by_key(|k| std::cmp::Reverse(k.len()));
        BuiltinTable {
            prices,
            prefix_keys,
        }
    })
}

/// 价格表：内置快照 + 用户覆盖。
#[derive(Serialize, Clone, Debug, Default)]
pub struct PricingTable {
    /// 用户自定义覆盖（优先级高于内置）
    pub overrides: HashMap<String, PricePair>,
}

impl PricingTable {
    /// 查找模型的单价（精确匹配 → 前缀匹配 → 未知模型 = 0）
    pub fn lookup(&self, model: &str) -> PricePair {
        let key = model.to_ascii_lowercase();
        // 1) 用户覆盖
        if let Some(p) = self.overrides.get(&key) {
            return *p;
        }
        let builtin = builtin_table();
        // 2) 内置精确
        if let Some(p) = builtin.prices.get(key.as_str()) {
            return *p;
        }
        // 3) 前缀匹配（键已按长度降序预排，最长前缀优先）
        for k in &builtin.prefix_keys {
            if key.starts_with(k) {
                return builtin.prices[k];
            }
        }
        (0.0, 0.0)
    }

    /// 计算成本（input + output tokens 分开计价，各自按 1M 归一）
    ///
    /// 语义约定：`input_tokens` 为**不含缓存**的常规输入（Anthropic API 的
    /// `input_tokens` 本身就不含 cache_read/cache_creation，三者互斥）。
    /// cache_read 按 0.1x、cache_creation 按 1.25x 计价。
    /// 非 Anthropic 模型没有独立的缓存 token 字段（OpenAI 的 cached_tokens 已含在
    /// prompt_tokens 里），缓存分量按 0 处理，避免重复计费。
    pub fn calc_cost(
        &self,
        model: &str,
        input_tokens: u64,
        output_tokens: u64,
        cache_read_tokens: u64,
        cache_creation_tokens: u64,
    ) -> (f64, f64, f64) {
        let (inp_price, out_price) = self.lookup(model);
        let is_anthropic = model.to_ascii_lowercase().starts_with("claude-");
        let inp_cost = input_tokens as f64 / 1_000_000.0 * inp_price;
        let out_cost = output_tokens as f64 / 1_000_000.0 * out_price;
        let cache_cost = if is_anthropic {
            cache_read_tokens as f64 / 1_000_000.0 * inp_price * 0.1
                + cache_creation_tokens as f64 / 1_000_000.0 * inp_price * 1.25
        } else {
            0.0
        };
        let total = inp_cost + out_cost + cache_cost;
        (inp_cost + cache_cost, out_cost, total)
    }

    /// 该型号在价格表里是否真的有价。0 价 = 未定价，调用方应标成 zero_pricing
    /// 而不是让用户看到「花了 $0.00」。
    pub fn is_priced(&self, model: &str) -> bool {
        let (input, output) = self.lookup(model);
        input > 0.0 || output > 0.0
    }
}

/// 从 JSONL 内容中推断模型名（如果存在）。
/// Claude Code 文件通常在顶层有 `model` 字段，但很多时候只有 session 元信息里才有。
/// 推断不出来时返回 "unknown" —— 绝不编造一个具体型号：编造会让它按那个型号的价格
/// 参与成本聚合，把一个 haiku/gpt 会话算成 sonnet 的钱。
/// 未知型号查表得 0 价，由 scan_sessions_to_records 标成 zero_pricing 供 UI 明示。
pub fn infer_model(raw_jsonl_head: &str) -> String {
    // 尝试从首行 JSON 中找 model 字段
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw_jsonl_head) {
        if let Some(m) = v.get("model").and_then(|s| s.as_str()) {
            if !m.is_empty() {
                return m.to_string();
            }
        }
        // Claude Code 有的嵌套在 leaf.session 中
        if let Some(m) = v.get("manifest").and_then(|m| m.get("model")).and_then(|s| s.as_str()) {
            if !m.is_empty() {
                return m.to_string();
            }
        }
    }
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_exact_and_prefix() {
        let t = PricingTable::default();
        // 精确匹配
        assert_eq!(t.lookup("gpt-4o"), (2.5, 10.0));
        // 前缀匹配
        let p = t.lookup("claude-sonnet-4-5-xxxxxx");
        assert_eq!(p, (3.0, 15.0));
        // 未知
        assert_eq!(t.lookup("totally-unknown-model"), (0.0, 0.0));
    }

    #[test]
    fn overrides_take_priority() {
        let mut t = PricingTable::default();
        t.overrides.insert("gpt-4o".to_string(), (5.0, 20.0));
        assert_eq!(t.lookup("gpt-4o"), (5.0, 20.0));
    }

    #[test]
    fn calc_cost_basic() {
        let t = PricingTable::default();
        let (inp, out, total) = t.calc_cost("gpt-4o", 1_000_000, 500_000, 0, 0);
        assert!((inp - 2.5).abs() < 0.001);
        assert!((out - 5.0).abs() < 0.001);
        assert!((total - 7.5).abs() < 0.001);
    }

    #[test]
    fn calc_cost_zero_for_unknown() {
        let t = PricingTable::default();
        let (_, _, total) = t.calc_cost("unknown-model-xyz", 1_000_000, 1_000_000, 0, 0);
        assert_eq!(total, 0.0);
    }

    #[test]
    fn calc_cost_anthropic_cache_pricing() {
        // claude-sonnet-4-5: input $3/MTok, output $15/MTok
        // Anthropic 语义：input_tokens 不含缓存，cache_read 0.1x = $0.3/MTok,
        // cache_creation 1.25x = $3.75/MTok，三部分相加。
        let t = PricingTable::default();
        let (inp, out, total) = t.calc_cost(
            "claude-sonnet-4-5",
            1_000_000, // 常规输入（不含缓存）
            200_000,   // 输出
            100_000,   // cache_read
            50_000,    // cache_creation
        );
        // inp = 1.0*3 + 0.1*0.3 + 0.05*3.75 = 3 + 0.03 + 0.1875 = 3.2175
        assert!((inp - 3.2175).abs() < 0.01, "inp got {}", inp);
        // out_cost: 0.2 * 15 = 3.0
        assert!((out - 3.0).abs() < 0.01);
        assert!((total - 6.2175).abs() < 0.01, "total got {}", total);
    }

    #[test]
    fn non_anthropic_cache_not_double_counted() {
        // gpt-4o：没有独立 cache 字段，传入的 cache 量不加价（已含在 input 语义外，按 0 处理）
        let t = PricingTable::default();
        let (inp, _, total) = t.calc_cost("gpt-4o", 500_000, 0, 1_000_000, 0);
        assert!((inp - 1.25).abs() < 0.001);
        assert!((total - 1.25).abs() < 0.001);
    }

    #[test]
    fn ernie_keys_match_lowercase_lookup() {
        let t = PricingTable::default();
        assert_eq!(t.lookup("ernie-4.0"), (0.12, 0.12));
        assert_eq!(t.lookup("ERNIE-4.0"), (0.12, 0.12));
    }

    #[test]
    fn infer_model_never_invents_a_specific_model() {
        // 关键回归：宁可 unknown（走 zero_pricing，UI 显示「未定价」），
        // 也不能把 haiku/gpt 会话编成 sonnet 计费。
        assert_eq!(infer_model(""), "unknown");
        assert!(!PricingTable::default().is_priced("unknown"));
        assert!(PricingTable::default().is_priced("claude-sonnet-4-5"));
    }

    #[test]
    fn infer_model_from_json() {
        let json = r#"{"model":"gpt-4o-mini","type":"summary"}"#;
        assert_eq!(infer_model(json), "gpt-4o-mini");
    }
}
