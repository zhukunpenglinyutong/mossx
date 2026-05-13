use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

pub(super) fn normalize_whitespace(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<&str>>()
        .join("\n")
}

pub(super) fn remove_control_chars(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect::<String>()
}

static REDACT_PATTERNS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    vec![
        // SSH private key blocks
        (Regex::new(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----").unwrap(), "[REDACTED:SSH_KEY]"),
        // AWS access key
        (Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(), "[REDACTED:AWS_KEY]"),
        // GitHub tokens (ghp_, gho_, ghs_)
        (Regex::new(r"gh[pos]_[a-zA-Z0-9]{36}").unwrap(), "[REDACTED:GITHUB_TOKEN]"),
        // GitHub fine-grained PAT
        (Regex::new(r"github_pat_[a-zA-Z0-9_]{22,}").unwrap(), "[REDACTED:GITHUB_PAT]"),
        // OpenAI sk- tokens
        (Regex::new(r"sk-[a-zA-Z0-9]{12,}").unwrap(), "sk-***"),
        // JWT (three base64url segments)
        (Regex::new(r"eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}").unwrap(), "[REDACTED:JWT]"),
        // Bearer token header
        (Regex::new(r"Bearer\s+[a-zA-Z0-9_.\-]{10,}").unwrap(), "Bearer [REDACTED]"),
        // Database connection URLs
        (Regex::new(r"(?:postgres|postgresql|mysql|mongodb|redis)://[^\s]+").unwrap(), "[REDACTED:DB_URL]"),
        // Email addresses
        (Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap(), "[REDACTED:EMAIL]"),
        // Long base64 strings (>= 40 chars)
        (Regex::new(r"\b[A-Za-z0-9+/]{40,}={0,3}\b").unwrap(), "[REDACTED:SECRET]"),
    ]
});

/// 兜底规则：24+ 字符的混合字母数字字符串（regex crate 不支持 lookahead，用函数判断）
static FALLBACK_ALNUM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b[a-zA-Z0-9]{24,}\b").unwrap());
static HASHTAG_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"#([\p{L}\p{N}_-]{2,20})").unwrap());
static NON_TEXT_CHARS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}\u{3400}-\u{9FFF}]+").unwrap());
static AUTO_TAG_STOP_WORDS: LazyLock<std::collections::HashSet<&'static str>> =
    LazyLock::new(|| {
        [
            "的", "是", "在", "了", "和", "与", "或", "但", "如果", "因为", "这是", "这个", "那个",
            "我们", "你们", "他们", "一个", "一些", "进行", "需要", "已经", "可以", "就是", "and",
            "the", "for", "with", "this", "that", "from", "into", "about", "what", "when", "where",
            "which", "why", "have", "has", "had", "was", "were", "are", "is", "it", "of", "to",
            "in", "on", "or", "but", "if", "because", "ai", "auto", "reach", "codex", "claude",
            "at", "com", "org", "net", "io", "lang",
        ]
        .into_iter()
        .collect()
    });
static CJK_DOMAIN_KEYWORDS: &[&str] = &[
    "线程池",
    "死锁",
    "并发",
    "数据库",
    "索引",
    "缓存",
    "redis",
    "kafka",
    "队列",
    "消息队列",
    "接口",
    "网关",
    "鉴权",
    "权限",
    "事务",
    "回滚",
    "限流",
    "熔断",
    "重试",
    "超时",
    "网络",
    "网速",
    "前端",
    "后端",
    "部署",
    "编译",
    "构建",
    "测试",
    "日志",
    "监控",
];

pub(super) fn is_mixed_alphanumeric(s: &str) -> bool {
    let has_letter = s.bytes().any(|b| b.is_ascii_alphabetic());
    let has_digit = s.bytes().any(|b| b.is_ascii_digit());
    has_letter && has_digit
}

pub(super) fn desensitize(text: &str) -> String {
    let mut result = text.to_string();
    for (pattern, replacement) in REDACT_PATTERNS.iter() {
        result = pattern.replace_all(&result, *replacement).to_string();
    }
    // 兜底：24+ 字符混合字母数字（无法用 lookahead，手动过滤）
    result = FALLBACK_ALNUM
        .replace_all(&result, |caps: &regex::Captures| {
            let matched = caps.get(0).unwrap().as_str();
            if is_mixed_alphanumeric(matched) {
                "***".to_string()
            } else {
                matched.to_string()
            }
        })
        .to_string();
    result
}

pub(super) fn normalize_text(text: &str, desensitize_enabled: bool) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let no_control = remove_control_chars(&normalized);
    let compact = normalize_whitespace(&no_control);
    if desensitize_enabled {
        desensitize(&compact)
    } else {
        compact
    }
}

pub(super) fn is_noise(text: &str) -> bool {
    if text.len() < 3 {
        return true;
    }
    let has_alpha_num = text.chars().any(|c| c.is_alphanumeric());
    !has_alpha_num
}

pub(super) fn calculate_fingerprint(workspace_id: &str, clean_text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(workspace_id.as_bytes());
    hasher.update(b":");
    hasher.update(clean_text.to_lowercase().as_bytes());
    let hash = hasher.finalize();
    // 截取前 16 字节 = 32 hex 字符，128 bit 足够去重
    hash.iter()
        .take(16)
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
}

/// 旧指纹算法（SipHash/DefaultHasher），用于双检兼容已有记忆
pub(super) fn calculate_legacy_fingerprint(workspace_id: &str, clean_text: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    workspace_id.hash(&mut hasher);
    clean_text.to_lowercase().hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

pub(super) fn classify_kind(clean_text: &str) -> String {
    struct KindSignal {
        phrases: &'static [&'static str],
        weight: u32,
    }
    struct KindRule {
        kind: &'static str,
        signals: &'static [KindSignal],
        negations: &'static [&'static str],
        threshold: u32,
        priority: u32,
    }

    const KNOWN_ISSUE_SIGNALS: [KindSignal; 3] = [
        KindSignal {
            phrases: &[
                "bug report",
                "stack trace",
                "panic at",
                "segfault",
                "core dump",
                "null pointer",
                "undefined is not",
                "cannot read property",
                "报错信息",
                "崩溃了",
                "异常堆栈",
                "空指针",
                "段错误",
            ],
            weight: 3,
        },
        KindSignal {
            phrases: &[
                "error",
                "exception",
                "failed",
                "failure",
                "crash",
                "broken",
                "issue",
                "problem",
                "fix",
                "debug",
                "defect",
                "regression",
                "bug",
                "报错",
                "失败",
                "异常",
                "故障",
                "修复",
                "调试",
                "缺陷",
                "回退",
            ],
            weight: 2,
        },
        KindSignal {
            phrases: &[
                "warning",
                "deprecated",
                "timeout",
                "retry",
                "workaround",
                "flaky",
                "告警",
                "超时",
                "重试",
                "临时方案",
            ],
            weight: 1,
        },
    ];

    const CODE_DECISION_SIGNALS: [KindSignal; 3] = [
        KindSignal {
            phrases: &[
                "architecture decision",
                "design choice",
                "tradeoff",
                "trade-off",
                "tech stack",
                "we chose",
                "decided to use",
                "migration plan",
                "架构决策",
                "技术选型",
                "权衡取舍",
                "我们选择了",
                "迁移方案",
            ],
            weight: 3,
        },
        KindSignal {
            phrases: &[
                "decision",
                "decide",
                "architecture",
                "pattern",
                "refactor",
                "migration",
                "approach",
                "strategy",
                "convention",
                "决策",
                "架构",
                "重构",
                "迁移",
                "方案",
                "策略",
                "规范",
            ],
            weight: 2,
        },
        KindSignal {
            phrases: &[
                "compare",
                "versus",
                "alternative",
                "pros and cons",
                "evaluate",
                "对比",
                "方案对比",
                "优劣",
                "评估",
            ],
            weight: 1,
        },
    ];

    const PROJECT_CONTEXT_SIGNALS: [KindSignal; 3] = [
        KindSignal {
            phrases: &[
                "project setup",
                "tech stack",
                "project structure",
                "monorepo",
                "repository",
                "toolchain",
                "development environment",
                "项目结构",
                "技术栈",
                "工程配置",
                "仓库结构",
                "开发环境",
            ],
            weight: 3,
        },
        KindSignal {
            phrases: &[
                "project",
                "workspace",
                "environment",
                "config",
                "dependency",
                "version",
                "framework",
                "library",
                "context",
                "stack",
                "项目",
                "环境",
                "配置",
                "依赖",
                "框架",
                "版本",
            ],
            weight: 2,
        },
        KindSignal {
            phrases: &[
                "setup",
                "install",
                "init",
                "scaffold",
                "boilerplate",
                "搭建",
                "初始化",
                "安装",
                "脚手架",
            ],
            weight: 1,
        },
    ];

    const RULES: [KindRule; 3] = [
        KindRule {
            kind: "known_issue",
            signals: &KNOWN_ISSUE_SIGNALS,
            negations: &[
                "no error",
                "without error",
                "not a bug",
                "error-free",
                "没有报错",
                "无异常",
                "不是bug",
            ],
            threshold: 3,
            priority: 3,
        },
        KindRule {
            kind: "code_decision",
            signals: &CODE_DECISION_SIGNALS,
            negations: &[],
            threshold: 3,
            priority: 2,
        },
        KindRule {
            kind: "project_context",
            signals: &PROJECT_CONTEXT_SIGNALS,
            negations: &[],
            threshold: 3,
            priority: 1,
        },
    ];

    let lower = clean_text.to_lowercase();

    let mut best_kind = "note";
    let mut best_score = 0_u32;
    let mut best_priority = 0_u32;

    for rule in RULES {
        if rule
            .negations
            .iter()
            .any(|negation| lower.contains(negation))
        {
            continue;
        }

        let mut score = 0_u32;
        for signal in rule.signals {
            if signal.phrases.iter().any(|phrase| lower.contains(phrase)) {
                score += signal.weight;
            }
        }

        if score < rule.threshold {
            continue;
        }

        if score > best_score || (score == best_score && rule.priority > best_priority) {
            best_kind = rule.kind;
            best_score = score;
            best_priority = rule.priority;
        }
    }

    best_kind.to_string()
}

pub(super) fn classify_importance(clean_text: &str) -> String {
    let lower = clean_text.to_lowercase();
    if lower.contains("critical")
        || lower.contains("urgent")
        || lower.contains("security")
        || lower.contains("production")
    {
        return "high".to_string();
    }
    if clean_text.len() >= 240 {
        return "medium".to_string();
    }
    "low".to_string()
}

pub(super) fn build_title(clean_text: &str) -> String {
    clean_text
        .lines()
        .next()
        .unwrap_or("Untitled Memory")
        .chars()
        .take(60)
        .collect::<String>()
}

pub(super) fn build_summary(clean_text: &str) -> String {
    clean_text.chars().take(140).collect::<String>()
}

pub(super) fn normalize_tags(tags: Option<Vec<String>>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    if let Some(input) = tags {
        for tag in input {
            let normalized = tag.trim().to_string();
            if normalized.is_empty() {
                continue;
            }
            if normalized.chars().count() > 32 {
                continue;
            }
            let dedupe_key = normalized.to_lowercase();
            if seen.insert(dedupe_key) {
                out.push(normalized);
            }
            if out.len() >= 12 {
                break;
            }
        }
    }
    out
}

pub(super) fn is_cjk_char(c: char) -> bool {
    ('\u{3400}'..='\u{9FFF}').contains(&c)
}

pub(super) fn extract_hashtag_tags(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for caps in HASHTAG_REGEX.captures_iter(text) {
        if let Some(matched) = caps.get(1) {
            tags.push(matched.as_str().to_string());
        }
    }
    tags
}

pub(super) fn extract_keyword_tags(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let normalized = NON_TEXT_CHARS_REGEX.replace_all(text, " ");
    let mut tags: Vec<String> = Vec::new();
    for token_raw in normalized.split_whitespace() {
        if token_raw.is_empty() {
            continue;
        }
        let token = token_raw.to_lowercase();
        let char_count = token_raw.chars().count();
        if char_count < 2 || char_count > 20 {
            continue;
        }
        if token_raw.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if AUTO_TAG_STOP_WORDS.contains(token.as_str()) {
            continue;
        }
        // For CJK, avoid free extraction from raw sentence fragments to reduce false tags.
        let has_cjk = token_raw.chars().any(is_cjk_char);
        if has_cjk {
            continue;
        }
        tags.push(token_raw.to_string());
    }

    // Chinese tags are extracted conservatively by domain-keyword whitelist.
    for keyword in CJK_DOMAIN_KEYWORDS.iter() {
        if lower.contains(keyword) {
            tags.push((*keyword).to_string());
        }
    }

    tags
}

pub(super) fn extract_auto_tags(text: &str) -> Vec<String> {
    let hashtag_tags = extract_hashtag_tags(text);
    let source = if hashtag_tags.is_empty() {
        extract_keyword_tags(text)
    } else {
        hashtag_tags
    };
    normalize_tags(Some(source)).into_iter().take(5).collect()
}
