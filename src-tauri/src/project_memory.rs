use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

static FILE_LOCK: Mutex<()> = Mutex::new(());

fn with_file_lock<T>(op: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = FILE_LOCK
        .lock()
        .map_err(|e| format!("file lock poisoned: {e}"))?;
    op()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemoryItem {
    pub id: String,
    pub workspace_id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub detail: Option<String>,
    pub raw_text: Option<String>,
    pub clean_text: String,
    pub tags: Vec<String>,
    pub importance: String,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub source: String,
    pub fingerprint: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(default)]
    pub workspace_name: Option<String>,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceMemoryOverride {
    pub auto_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemorySettings {
    pub auto_enabled: bool,
    pub capture_mode: String,
    pub dedupe_enabled: bool,
    pub desensitize_enabled: bool,
    pub workspace_overrides: HashMap<String, WorkspaceMemoryOverride>,
}

impl Default for ProjectMemorySettings {
    fn default() -> Self {
        Self {
            auto_enabled: true,
            capture_mode: "balanced".to_string(),
            dedupe_enabled: true,
            desensitize_enabled: true,
            workspace_overrides: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectMemoryListResult {
    pub items: Vec<ProjectMemoryItem>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectMemoryInput {
    pub workspace_id: String,
    pub kind: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub detail: Option<String>,
    pub tags: Option<Vec<String>>,
    pub importance: Option<String>,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub source: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProjectMemoryInput {
    pub kind: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub detail: Option<String>,
    pub tags: Option<Vec<String>>,
    pub importance: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutoCaptureInput {
    pub workspace_id: String,
    pub text: String,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    pub source: Option<String>,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub engine: Option<String>,
}

fn storage_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Unable to resolve home directory")?;
    Ok(home.join(".codemoss").join("project-memory"))
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(storage_dir()?.join("settings.json"))
}

// ── S2: 路径辅助函数 ──────────────────────────────────────────

/// 项目名 → 合法目录名 slug（小写、空格转 `-`、去特殊字符、截取前 50 字符）
fn slugify_workspace_name(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c == ' ' || c == '/' || c == '\\' {
                '-'
            } else {
                '_'
            }
        })
        .collect();
    // 合并连续的 '-' 和 '_'，去掉首尾
    let trimmed: String = slug
        .split(|c: char| c == '-' || c == '_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-");
    let truncated: String = trimmed.chars().take(50).collect();
    if truncated.is_empty() {
        "unnamed".to_string()
    } else {
        truncated
    }
}

/// 构造 workspace 目录路径：`{slug}--{workspace_id 前 8 位}/`
fn workspace_dir_path(
    base: &std::path::Path,
    workspace_id: &str,
    workspace_name: Option<&str>,
) -> PathBuf {
    let uuid_prefix = &workspace_id[..workspace_id.len().min(8)];
    let slug = workspace_name
        .map(slugify_workspace_name)
        .unwrap_or_else(|| "unnamed".to_string());
    base.join(format!("{slug}--{uuid_prefix}"))
}

/// 扫描 storage_dir 找到 `*--{workspace_id 前 8 位}` 目录（项目改名也能找到）
fn resolve_workspace_dir(workspace_id: &str) -> Result<Option<PathBuf>, String> {
    let base = storage_dir()?;
    if !base.exists() {
        return Ok(None);
    }
    let uuid_prefix = &workspace_id[..workspace_id.len().min(8)];
    let suffix = format!("--{uuid_prefix}");
    let entries = std::fs::read_dir(&base).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(&suffix) {
                    return Ok(Some(path));
                }
            }
        }
    }
    Ok(None)
}

/// 日期文件路径，如 `ws_dir/2026-02-10.json`
fn date_file_path(ws_dir: &std::path::Path, date_str: &str) -> PathBuf {
    ws_dir.join(format!("{date_str}.json"))
}

/// 当前 UTC 日期字符串，格式 `YYYY-MM-DD`
fn today_str() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

/// 从 `created_at` 毫秒时间戳提取日期字符串
fn date_str_from_ms(timestamp_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(timestamp_ms)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| today_str())
}

// ── S3: 日期文件读写 ──────────────────────────────────────────

/// 读取单个日期文件，不存在时返回空 Vec
fn read_date_file(path: &std::path::Path) -> Result<Vec<ProjectMemoryItem>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// 写入单个日期文件（整体覆盖）
fn write_date_file(path: &std::path::Path, items: &[ProjectMemoryItem]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

/// 聚合 workspace 目录下全部 `*.json` 的记忆（排除非日期文件）
fn read_workspace_memories(ws_dir: &std::path::Path) -> Result<Vec<ProjectMemoryItem>, String> {
    if !ws_dir.exists() {
        return Ok(Vec::new());
    }
    let mut all: Vec<ProjectMemoryItem> = Vec::new();
    let entries = std::fs::read_dir(ws_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            let items = read_date_file(&path)?;
            all.extend(items);
        }
    }
    Ok(all)
}

/// 按 id 在 workspace 目录中查找记忆，返回 (日期文件路径, 该文件全部 items)
fn find_memory_in_workspace(
    ws_dir: &std::path::Path,
    memory_id: &str,
) -> Result<Option<(PathBuf, Vec<ProjectMemoryItem>)>, String> {
    if !ws_dir.exists() {
        return Ok(None);
    }
    let entries = std::fs::read_dir(ws_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            let items = read_date_file(&path)?;
            if items.iter().any(|item| item.id == memory_id) {
                return Ok(Some((path, items)));
            }
        }
    }
    Ok(None)
}

// ── S4: 迁移逻辑 ─────────────────────────────────────────────

/// 旧 `memories.json` → 新结构的迁移。幂等 + 可重试。
fn migrate_legacy_flat_file() -> Result<(), String> {
    let base = storage_dir()?;
    let legacy_path = base.join("memories.json");
    if !legacy_path.exists() {
        return Ok(());
    }
    let raw = std::fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        // 空文件直接备份
        let bak = base.join("memories.json.bak");
        std::fs::rename(&legacy_path, &bak).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let items: Vec<ProjectMemoryItem> =
        serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // 按 (workspace_id, date) 分桶
    let mut buckets: HashMap<(String, String), Vec<ProjectMemoryItem>> = HashMap::new();
    for item in &items {
        let date = date_str_from_ms(item.created_at);
        buckets
            .entry((item.workspace_id.clone(), date))
            .or_default()
            .push(item.clone());
    }

    // 写入新结构
    for ((ws_id, date), bucket_items) in &buckets {
        let ws_dir = workspace_dir_path(
            &base,
            ws_id,
            bucket_items
                .first()
                .and_then(|item| item.workspace_name.as_deref()),
        );
        let file_path = date_file_path(&ws_dir, date);
        // 幂等：如果目标文件已存在，合并而非覆盖（防止半迁移后重试丢数据）
        let mut existing = read_date_file(&file_path)?;
        for new_item in bucket_items {
            if !existing.iter().any(|e| e.id == new_item.id) {
                existing.push(new_item.clone());
            }
        }
        write_date_file(&file_path, &existing)?;
    }

    // 校验：新结构记忆总数 >= 旧文件
    let total_migrated: usize = buckets
        .keys()
        .map(|(ws_id, _)| ws_id.clone())
        .collect::<std::collections::HashSet<String>>()
        .iter()
        .filter_map(|ws_id| resolve_workspace_dir(ws_id).ok().flatten())
        .map(|ws_dir| read_workspace_memories(&ws_dir).unwrap_or_default().len())
        .sum();
    if total_migrated < items.len() {
        return Err(format!(
            "Migration verification failed: expected >= {} items, found {}",
            items.len(),
            total_migrated
        ));
    }

    // 备份旧文件
    let bak = base.join("memories.json.bak");
    std::fs::rename(&legacy_path, &bak).map_err(|e| e.to_string())?;
    Ok(())
}

/// 迁移入口：检查并执行。幂等——旧文件不存在即短路。
fn ensure_migrated() -> Result<(), String> {
    let base = storage_dir()?;
    let legacy_path = base.join("memories.json");
    if legacy_path.exists() {
        migrate_legacy_flat_file()?;
    }
    Ok(())
}

fn read_settings() -> Result<ProjectMemorySettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(ProjectMemorySettings::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&raw).map_err(|err| err.to_string())
}

fn write_settings(settings: &ProjectMemorySettings) -> Result<(), String> {
    let dir = storage_dir()?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = settings_path()?;
    let raw = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    std::fs::write(&path, raw).map_err(|err| err.to_string())
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn normalize_whitespace(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<&str>>()
        .join("\n")
}

fn remove_control_chars(text: &str) -> String {
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
            "我们", "你们", "他们", "一个", "一些", "进行", "需要", "已经", "可以", "就是",
            "and", "the", "for", "with", "this", "that", "from", "into", "about", "what",
            "when", "where", "which", "why", "have", "has", "had", "was", "were", "are",
            "is", "it", "of", "to", "in", "on", "or", "but", "if", "because",
            "ai", "auto", "reach", "codex", "claude", "at", "com", "org", "net", "io", "lang",
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

fn is_mixed_alphanumeric(s: &str) -> bool {
    let has_letter = s.bytes().any(|b| b.is_ascii_alphabetic());
    let has_digit = s.bytes().any(|b| b.is_ascii_digit());
    has_letter && has_digit
}

fn desensitize(text: &str) -> String {
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

fn normalize_text(text: &str, desensitize_enabled: bool) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let no_control = remove_control_chars(&normalized);
    let compact = normalize_whitespace(&no_control);
    if desensitize_enabled {
        desensitize(&compact)
    } else {
        compact
    }
}

fn is_noise(text: &str) -> bool {
    if text.len() < 3 {
        return true;
    }
    let has_alpha_num = text.chars().any(|c| c.is_alphanumeric());
    !has_alpha_num
}

fn calculate_fingerprint(workspace_id: &str, clean_text: &str) -> String {
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
fn calculate_legacy_fingerprint(workspace_id: &str, clean_text: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    workspace_id.hash(&mut hasher);
    clean_text.to_lowercase().hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn classify_kind(clean_text: &str) -> String {
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
        if rule.negations.iter().any(|negation| lower.contains(negation)) {
            continue;
        }

        let mut score = 0_u32;
        for signal in rule.signals {
            if signal
                .phrases
                .iter()
                .any(|phrase| lower.contains(phrase))
            {
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

fn classify_importance(clean_text: &str) -> String {
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

fn build_title(clean_text: &str) -> String {
    clean_text
        .lines()
        .next()
        .unwrap_or("Untitled Memory")
        .chars()
        .take(60)
        .collect::<String>()
}

fn build_summary(clean_text: &str) -> String {
    clean_text.chars().take(140).collect::<String>()
}

fn normalize_tags(tags: Option<Vec<String>>) -> Vec<String> {
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

fn is_cjk_char(c: char) -> bool {
    ('\u{3400}'..='\u{9FFF}').contains(&c)
}

fn extract_hashtag_tags(text: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for caps in HASHTAG_REGEX.captures_iter(text) {
        if let Some(matched) = caps.get(1) {
            tags.push(matched.as_str().to_string());
        }
    }
    tags
}

fn extract_keyword_tags(text: &str) -> Vec<String> {
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

fn extract_auto_tags(text: &str) -> Vec<String> {
    let hashtag_tags = extract_hashtag_tags(text);
    let source = if hashtag_tags.is_empty() {
        extract_keyword_tags(text)
    } else {
        hashtag_tags
    };
    normalize_tags(Some(source)).into_iter().take(5).collect()
}

fn parse_tag_filters(input: Option<&str>) -> Vec<String> {
    input
        .unwrap_or_default()
        .split(|c| c == ',' || c == '，')
        .map(|entry| entry.trim().to_lowercase())
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<String>>()
}

fn memory_auto_enabled_for_workspace(
    settings: &ProjectMemorySettings,
    workspace_id: &str,
) -> bool {
    if let Some(override_item) = settings.workspace_overrides.get(workspace_id) {
        if let Some(enabled) = override_item.auto_enabled {
            return enabled;
        }
    }
    settings.auto_enabled
}

#[tauri::command]
pub(crate) fn project_memory_get_settings() -> Result<ProjectMemorySettings, String> {
    with_file_lock(|| read_settings())
}

#[tauri::command]
pub(crate) fn project_memory_update_settings(
    settings: ProjectMemorySettings,
) -> Result<ProjectMemorySettings, String> {
    with_file_lock(|| {
        write_settings(&settings)?;
        Ok(settings.clone())
    })
}

#[tauri::command]
pub(crate) fn project_memory_list(
    workspace_id: String,
    query: Option<String>,
    kind: Option<String>,
    importance: Option<String>,
    tag: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<ProjectMemoryListResult, String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => return Ok(ProjectMemoryListResult { items: Vec::new(), total: 0 }),
        };
        let data = read_workspace_memories(&ws_dir)?;
        let normalized_query = query.as_deref().unwrap_or("").trim().to_lowercase();
        let normalized_kind = kind.as_deref().unwrap_or("").trim().to_lowercase();
        let normalized_importance = importance.as_deref().unwrap_or("").trim().to_lowercase();
        let normalized_tags = parse_tag_filters(tag.as_deref());

        let mut items: Vec<ProjectMemoryItem> = data
            .into_iter()
            .filter(|item| item.deleted_at.is_none() && item.workspace_id == workspace_id)
            .filter(|item| {
                if normalized_kind.is_empty() {
                    true
                } else {
                    item.kind.to_lowercase() == normalized_kind
                }
            })
            .filter(|item| {
                if normalized_importance.is_empty() {
                    true
                } else {
                    item.importance.to_lowercase() == normalized_importance
                }
            })
            .filter(|item| {
                if normalized_tags.is_empty() {
                    true
                } else {
                    normalized_tags
                        .iter()
                        .any(|needle| {
                            item.tags
                                .iter()
                                .any(|entry| entry.to_lowercase() == *needle)
                        })
                }
            })
            .filter(|item| {
                if normalized_query.is_empty() {
                    return true;
                }
                let haystack = format!(
                    "{} {} {}",
                    item.title.to_lowercase(),
                    item.summary.to_lowercase(),
                    item.clean_text.to_lowercase()
                );
                haystack.contains(&normalized_query)
            })
            .collect();

        items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        let total = items.len();
        let page_index = page.unwrap_or(0);
        let page_limit = page_size.unwrap_or(50).clamp(1, 200);
        let start = page_index.saturating_mul(page_limit);
        let paged = if start >= items.len() {
            Vec::new()
        } else {
            let end = (start + page_limit).min(items.len());
            items[start..end].to_vec()
        };
        Ok(ProjectMemoryListResult { items: paged, total })
    })
}

#[tauri::command]
pub(crate) fn project_memory_get(
    memory_id: String,
    workspace_id: String,
) -> Result<Option<ProjectMemoryItem>, String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let ws_dir = match resolve_workspace_dir(&workspace_id)? {
            Some(dir) => dir,
            None => return Ok(None),
        };
        let data = read_workspace_memories(&ws_dir)?;
        Ok(data
            .into_iter()
            .find(|item| item.id == memory_id && item.deleted_at.is_none()))
    })
}

#[tauri::command]
pub(crate) fn project_memory_create(
    input: CreateProjectMemoryInput,
) -> Result<ProjectMemoryItem, String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let base = storage_dir()?;
        let current_ms = now_ms();
        let raw_text = input.detail.clone().unwrap_or_default();
        let clean_text = normalize_text(&raw_text, false);
        let fingerprint = calculate_fingerprint(&input.workspace_id, &clean_text);
        let item = ProjectMemoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: input.workspace_id.clone(),
            kind: input.kind.clone().unwrap_or_else(|| "note".to_string()),
            title: input
                .title
                .clone()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| build_title(&clean_text)),
            summary: input
                .summary
                .clone()
                .filter(|text| !text.trim().is_empty())
                .unwrap_or_else(|| build_summary(&clean_text)),
            detail: input.detail.clone(),
            raw_text: if raw_text.trim().is_empty() {
                None
            } else {
                Some(raw_text)
            },
            clean_text,
            tags: normalize_tags(input.tags.clone()),
            importance: input
                .importance
                .clone()
                .unwrap_or_else(|| "medium".to_string()),
            thread_id: input.thread_id.clone(),
            message_id: input.message_id.clone(),
            source: input.source.clone().unwrap_or_else(|| "manual".to_string()),
            fingerprint,
            created_at: current_ms,
            updated_at: current_ms,
            deleted_at: None,
            workspace_name: input.workspace_name.clone(),
            workspace_path: input.workspace_path.clone(),
            engine: input.engine.clone(),
        };
        // 写入当天日期文件
        let ws_dir = workspace_dir_path(
            &base,
            &input.workspace_id,
            input.workspace_name.as_deref(),
        );
        let today = today_str();
        let file = date_file_path(&ws_dir, &today);
        let mut items = read_date_file(&file)?;
        items.push(item.clone());
        write_date_file(&file, &items)?;
        Ok(item)
    })
}

#[tauri::command]
pub(crate) fn project_memory_update(
    memory_id: String,
    workspace_id: String,
    patch: UpdateProjectMemoryInput,
) -> Result<ProjectMemoryItem, String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let ws_dir = resolve_workspace_dir(&workspace_id)?
            .ok_or_else(|| "workspace directory not found".to_string())?;
        let (file_path, mut items) = find_memory_in_workspace(&ws_dir, &memory_id)?
            .ok_or_else(|| "memory not found".to_string())?;
        let current_ms = now_ms();
        let mut found: Option<ProjectMemoryItem> = None;
        for item in &mut items {
            if item.id != memory_id || item.deleted_at.is_some() {
                continue;
            }
            if let Some(kind) = patch.kind.clone() {
                item.kind = kind;
            }
            if let Some(title) = patch.title.clone() {
                item.title = title;
            }
            if let Some(summary) = patch.summary.clone() {
                item.summary = summary;
            }
            if patch.detail.is_some() {
                let detail_value = patch.detail.clone().unwrap_or_default();
                item.detail = Some(detail_value.clone());
                item.raw_text = Some(detail_value.clone());
                let clean_text = normalize_text(&detail_value, false);
                item.clean_text = clean_text.clone();
                item.fingerprint = calculate_fingerprint(&item.workspace_id, &clean_text);
            }
            if let Some(tags) = patch.tags.clone() {
                item.tags = normalize_tags(Some(tags));
            }
            if let Some(importance) = patch.importance.clone() {
                item.importance = importance;
            }
            item.updated_at = current_ms;
            found = Some(item.clone());
            break;
        }
        if let Some(item) = found {
            write_date_file(&file_path, &items)?;
            Ok(item)
        } else {
            Err("memory not found".to_string())
        }
    })
}

#[tauri::command]
pub(crate) fn project_memory_delete(
    memory_id: String,
    workspace_id: String,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let ws_dir = resolve_workspace_dir(&workspace_id)?
            .ok_or_else(|| "workspace directory not found".to_string())?;
        let (file_path, mut items) = find_memory_in_workspace(&ws_dir, &memory_id)?
            .ok_or_else(|| "memory not found".to_string())?;
        if hard_delete.unwrap_or(false) {
            items.retain(|item| item.id != memory_id);
        } else {
            let current_ms = now_ms();
            for item in &mut items {
                if item.id == memory_id && item.deleted_at.is_none() {
                    item.deleted_at = Some(current_ms);
                    item.updated_at = current_ms;
                    break;
                }
            }
        }
        write_date_file(&file_path, &items)?;
        Ok(())
    })
}

#[tauri::command]
pub(crate) fn project_memory_capture_auto(
    input: AutoCaptureInput,
) -> Result<Option<ProjectMemoryItem>, String> {
    with_file_lock(|| {
        ensure_migrated()?;
        let settings = read_settings()?;
        if !memory_auto_enabled_for_workspace(&settings, &input.workspace_id) {
            return Ok(None);
        }
        let clean_text = normalize_text(&input.text, settings.desensitize_enabled);
        if is_noise(&clean_text) {
            return Ok(None);
        }
        let fingerprint = calculate_fingerprint(&input.workspace_id, &clean_text);
        let legacy_fingerprint =
            calculate_legacy_fingerprint(&input.workspace_id, &clean_text);
        let base = storage_dir()?;
        // 去重：扫描 workspace 目录全部记忆
        let ws_dir = workspace_dir_path(
            &base,
            &input.workspace_id,
            input.workspace_name.as_deref(),
        );
        // 优先用 resolve 找到已存在目录（项目改名场景）
        let existing_ws_dir = resolve_workspace_dir(&input.workspace_id)?;
        let effective_ws_dir = existing_ws_dir.as_deref().unwrap_or(&ws_dir);
        let existing_data = read_workspace_memories(effective_ws_dir)?;
        if settings.dedupe_enabled
            && existing_data.iter().any(|entry| {
                entry.workspace_id == input.workspace_id
                    && entry.deleted_at.is_none()
                    && (entry.fingerprint == fingerprint
                        || entry.fingerprint == legacy_fingerprint)
            })
        {
            return Ok(None);
        }
        let current_ms = now_ms();
        let item = ProjectMemoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: input.workspace_id.clone(),
            kind: classify_kind(&clean_text),
            title: build_title(&clean_text),
            summary: build_summary(&clean_text),
            detail: Some(clean_text.clone()),
            raw_text: Some(input.text.clone()),
            clean_text: clean_text.clone(),
            tags: extract_auto_tags(&clean_text),
            importance: classify_importance(&clean_text),
            thread_id: input.thread_id.clone(),
            message_id: input.message_id.clone(),
            source: input
                .source
                .clone()
                .unwrap_or_else(|| "auto".to_string()),
            fingerprint,
            created_at: current_ms,
            updated_at: current_ms,
            deleted_at: None,
            workspace_name: input.workspace_name.clone(),
            workspace_path: input.workspace_path.clone(),
            engine: input.engine.clone(),
        };
        // 写入当天日期文件（使用已 resolve 或新建的目录）
        let target_ws_dir = existing_ws_dir.unwrap_or(ws_dir);
        let today = today_str();
        let file = date_file_path(&target_ws_dir, &today);
        let mut day_items = read_date_file(&file)?;
        day_items.push(item.clone());
        write_date_file(&file, &day_items)?;
        Ok(Some(item))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    struct MemoryKindContractSample {
        id: String,
        input: String,
        #[serde(rename = "expectedKind")]
        expected_kind: String,
    }

    // ── Fingerprint: SHA-256 ─────────────────────────────────────

    #[test]
    fn fingerprint_is_deterministic() {
        let fp1 = calculate_fingerprint("ws-1", "hello world");
        let fp2 = calculate_fingerprint("ws-1", "hello world");
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn fingerprint_is_case_insensitive() {
        let fp_lower = calculate_fingerprint("ws-1", "Hello World");
        let fp_upper = calculate_fingerprint("ws-1", "hello world");
        assert_eq!(fp_lower, fp_upper);
    }

    #[test]
    fn fingerprint_differs_by_workspace() {
        let fp1 = calculate_fingerprint("ws-1", "same text");
        let fp2 = calculate_fingerprint("ws-2", "same text");
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn fingerprint_differs_by_content() {
        let fp1 = calculate_fingerprint("ws-1", "text A");
        let fp2 = calculate_fingerprint("ws-1", "text B");
        assert_ne!(fp1, fp2);
    }

    #[test]
    fn fingerprint_is_32_hex_chars() {
        let fp = calculate_fingerprint("ws-1", "test content");
        assert_eq!(fp.len(), 32);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
    }

    // ── Fingerprint: Legacy 双检 ─────────────────────────────────

    #[test]
    fn legacy_fingerprint_is_hex_string() {
        let fp = calculate_legacy_fingerprint("ws-1", "test");
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(!fp.is_empty());
    }

    #[test]
    fn legacy_and_new_fingerprint_differ() {
        let new_fp = calculate_fingerprint("ws-1", "test");
        let old_fp = calculate_legacy_fingerprint("ws-1", "test");
        assert_ne!(new_fp, old_fp);
    }

    // ── Desensitize: 模式覆盖 ────────────────────────────────────

    #[test]
    fn desensitize_redacts_sk_token() {
        let output = desensitize("my key is sk-abc123def456ghi789");
        assert_eq!(output, "my key is sk-***");
    }

    #[test]
    fn desensitize_redacts_sk_token_in_concatenation() {
        let output = desensitize("password=sk-abc123def456ghi789");
        assert_eq!(output, "password=sk-***");
    }

    #[test]
    fn desensitize_redacts_aws_key() {
        let output = desensitize("key: AKIAIOSFODNN7EXAMPLE");
        assert_eq!(output, "key: [REDACTED:AWS_KEY]");
    }

    #[test]
    fn desensitize_redacts_github_token() {
        let token = format!("ghp_{}", "a".repeat(36));
        let output = desensitize(&format!("token: {token}"));
        assert_eq!(output, "token: [REDACTED:GITHUB_TOKEN]");
    }

    #[test]
    fn desensitize_redacts_github_pat() {
        let pat = format!("github_pat_{}", "a1b2c3d4e5f6g7h8i9j0k1");
        let output = desensitize(&format!("pat: {pat}"));
        assert_eq!(output, "pat: [REDACTED:GITHUB_PAT]");
    }

    #[test]
    fn desensitize_redacts_jwt() {
        let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        let output = desensitize(&format!("token: {jwt}"));
        assert_eq!(output, "token: [REDACTED:JWT]");
    }

    #[test]
    fn desensitize_redacts_bearer() {
        let output = desensitize("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.long-token-value");
        assert!(output.contains("Bearer [REDACTED]"));
    }

    #[test]
    fn desensitize_redacts_database_url() {
        let output = desensitize("db: postgresql://user:pass@host:5432/mydb");
        assert_eq!(output, "db: [REDACTED:DB_URL]");
    }

    #[test]
    fn desensitize_redacts_email() {
        let output = desensitize("contact: alice@example.com");
        assert_eq!(output, "contact: [REDACTED:EMAIL]");
    }

    #[test]
    fn desensitize_redacts_ssh_key() {
        let key = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...\n-----END RSA PRIVATE KEY-----";
        let output = desensitize(key);
        assert_eq!(output, "[REDACTED:SSH_KEY]");
    }

    #[test]
    fn desensitize_leaves_normal_text_unchanged() {
        let input = "This is a perfectly normal sentence.";
        let output = desensitize(input);
        assert_eq!(output, input);
    }

    #[test]
    fn desensitize_redacts_long_mixed_alphanumeric() {
        // 24+ chars with both letters and digits
        let output = desensitize("secret: abc123def456ghi789jkl012mno");
        assert_eq!(output, "secret: ***");
    }

    #[test]
    fn desensitize_keeps_short_mixed_string() {
        // Under 24 chars — should NOT be redacted
        let output = desensitize("code: abc123");
        assert_eq!(output, "code: abc123");
    }

    #[test]
    fn desensitize_keeps_pure_alpha_long_string() {
        // 30 chars but no digits — should NOT be redacted by fallback
        let long_word = "a".repeat(30);
        let output = desensitize(&long_word);
        assert_eq!(output, long_word);
    }

    // ── Helper: is_noise ─────────────────────────────────────────

    #[test]
    fn is_noise_detects_short_text() {
        assert!(is_noise("ab"));
        assert!(is_noise(""));
    }

    #[test]
    fn is_noise_detects_non_alphanumeric() {
        assert!(is_noise("---"));
        assert!(is_noise("..."));
    }

    #[test]
    fn is_noise_passes_valid_text() {
        assert!(!is_noise("hello world"));
        assert!(!is_noise("abc"));
    }

    // ── Helper: classify_kind ────────────────────────────────────

    #[test]
    fn classify_kind_detects_known_issue_and_decision() {
        assert_eq!(
            classify_kind("This failed with exception and stack trace"),
            "known_issue"
        );
        assert_eq!(
            classify_kind("Architecture decision and tradeoff"),
            "code_decision"
        );
        assert_eq!(classify_kind("Random note"), "note");
    }

    #[test]
    fn classify_kind_detects_project_context() {
        assert_eq!(
            classify_kind("This project setup uses a clear tech stack"),
            "project_context"
        );
    }

    #[test]
    fn classify_kind_detects_bug() {
        assert_eq!(classify_kind("Found a bug report in the parser"), "known_issue");
    }

    #[test]
    fn classify_kind_detects_chinese_issue() {
        assert_eq!(classify_kind("接口报错了，出现空指针异常"), "known_issue");
    }

    #[test]
    fn classify_kind_handles_negation() {
        assert_eq!(classify_kind("There was no error after retry"), "note");
    }

    #[test]
    fn classify_kind_threshold_guards_low_confidence_hits() {
        assert_eq!(classify_kind("Need a workaround"), "note");
    }

    #[test]
    fn classify_kind_matches_contract_samples() {
        let raw = include_str!("../../src/features/project-memory/utils/memoryKindClassification.contract.json");
        let samples: Vec<MemoryKindContractSample> =
            serde_json::from_str(raw).expect("contract samples should be valid json");

        for sample in samples {
            assert_eq!(
                classify_kind(&sample.input),
                sample.expected_kind,
                "contract sample {}",
                sample.id
            );
        }
    }

    // ── Helper: classify_importance ──────────────────────────────

    #[test]
    fn classify_importance_high_for_critical() {
        assert_eq!(classify_importance("critical production issue"), "high");
        assert_eq!(classify_importance("security vulnerability found"), "high");
    }

    #[test]
    fn classify_importance_medium_for_long_text() {
        let long_text = "a".repeat(240);
        assert_eq!(classify_importance(&long_text), "medium");
    }

    #[test]
    fn classify_importance_low_for_short_text() {
        assert_eq!(classify_importance("short note"), "low");
    }

    // ── Helper: build_title / build_summary ──────────────────────

    #[test]
    fn build_title_takes_first_line_truncated() {
        let text = format!("{}\nsecond line", "x".repeat(100));
        let title = build_title(&text);
        assert_eq!(title.len(), 60);
    }

    #[test]
    fn build_title_handles_empty() {
        assert_eq!(build_title(""), "Untitled Memory");
    }

    #[test]
    fn build_summary_truncates_at_140() {
        let long = "a".repeat(200);
        let summary = build_summary(&long);
        assert_eq!(summary.len(), 140);
    }

    // ── Helper: normalize_tags ───────────────────────────────────

    #[test]
    fn normalize_tags_deduplicates_and_limits() {
        let tags = normalize_tags(Some(vec![
            " Bug ".to_string(),
            "bug".to_string(),
            "".to_string(),
            "feature".to_string(),
        ]));
        assert_eq!(tags, vec!["Bug".to_string(), "feature".to_string()]);
    }

    #[test]
    fn normalize_tags_limits_to_12() {
        let tags: Vec<String> = (0..20).map(|i| format!("tag{i}")).collect();
        let result = normalize_tags(Some(tags));
        assert_eq!(result.len(), 12);
    }

    #[test]
    fn normalize_tags_rejects_long_tag() {
        let long_tag = "a".repeat(33);
        let result = normalize_tags(Some(vec![long_tag]));
        assert!(result.is_empty());
    }

    #[test]
    fn normalize_tags_none_returns_empty() {
        assert!(normalize_tags(None).is_empty());
    }

    // ── Helper: auto tag extraction ─────────────────────────────

    #[test]
    fn extract_hashtag_tags_returns_explicit_tags() {
        let tags = extract_hashtag_tags("学习 #Java #SpringBoot 的项目");
        assert_eq!(tags, vec!["Java".to_string(), "SpringBoot".to_string()]);
    }

    #[test]
    fn extract_keyword_tags_handles_chinese_terms() {
        let tags = extract_keyword_tags("线程池配置优化 死锁分析 并发控制");
        assert!(tags.contains(&"线程池".to_string()));
        assert!(tags.contains(&"死锁".to_string()));
        assert!(tags.contains(&"并发".to_string()));
    }

    #[test]
    fn extract_keyword_tags_filters_stopwords_and_digits() {
        let tags = extract_keyword_tags("这是 一个 测试 1234 the is in");
        assert!(!tags.contains(&"这是".to_string()));
        assert!(!tags.contains(&"1234".to_string()));
        assert!(!tags.contains(&"the".to_string()));
        assert!(tags.contains(&"测试".to_string()));
    }

    #[test]
    fn extract_auto_tags_prioritizes_hashtag() {
        let tags = extract_auto_tags("#Rust 项目需要做并发优化");
        assert_eq!(tags, vec!["Rust".to_string()]);
    }

    #[test]
    fn extract_auto_tags_limits_to_five() {
        let tags = extract_auto_tags("#a1 #a2 #a3 #a4 #a5 #a6 #a7");
        assert_eq!(tags.len(), 5);
    }

    // ── Helper: normalize_text ───────────────────────────────────

    #[test]
    fn normalize_text_removes_noise_and_desensitizes() {
        let input = "  line1\r\n\r\nsk-abcdefghijklmnopqrstuvwxyz \u{0007}\n";
        let output = normalize_text(input, true);
        assert_eq!(output, "line1\nsk-***");
    }

    #[test]
    fn normalize_text_without_desensitize() {
        let input = "sk-abcdefghijklmnopqrstuvwxyz";
        let output = normalize_text(input, false);
        assert_eq!(output, "sk-abcdefghijklmnopqrstuvwxyz");
    }

    #[test]
    fn normalize_text_strips_control_chars() {
        let input = "hello\u{0000}world\u{0007}!";
        let output = normalize_text(input, false);
        assert_eq!(output, "helloworld!");
    }

    // ── Settings override ────────────────────────────────────────

    #[test]
    fn workspace_override_takes_priority() {
        let mut settings = ProjectMemorySettings::default();
        settings.auto_enabled = false;
        settings.workspace_overrides.insert(
            "ws-1".to_string(),
            WorkspaceMemoryOverride {
                auto_enabled: Some(true),
            },
        );
        assert!(memory_auto_enabled_for_workspace(&settings, "ws-1"));
        assert!(!memory_auto_enabled_for_workspace(&settings, "ws-2"));
    }

    #[test]
    fn workspace_override_false_overrides_global_true() {
        let mut settings = ProjectMemorySettings::default();
        settings.auto_enabled = true;
        settings.workspace_overrides.insert(
            "ws-1".to_string(),
            WorkspaceMemoryOverride {
                auto_enabled: Some(false),
            },
        );
        assert!(!memory_auto_enabled_for_workspace(&settings, "ws-1"));
    }

    #[test]
    fn workspace_override_none_falls_through_to_global() {
        let mut settings = ProjectMemorySettings::default();
        settings.auto_enabled = true;
        settings.workspace_overrides.insert(
            "ws-1".to_string(),
            WorkspaceMemoryOverride {
                auto_enabled: None,
            },
        );
        assert!(memory_auto_enabled_for_workspace(&settings, "ws-1"));
    }

    // ── Helper: is_mixed_alphanumeric ────────────────────────────

    #[test]
    fn is_mixed_detects_mixed() {
        assert!(is_mixed_alphanumeric("abc123"));
        assert!(is_mixed_alphanumeric("1a"));
    }

    #[test]
    fn is_mixed_rejects_pure_alpha_or_digit() {
        assert!(!is_mixed_alphanumeric("abcdef"));
        assert!(!is_mixed_alphanumeric("123456"));
    }

    // ── Helper: normalize_whitespace / remove_control_chars ──────

    #[test]
    fn normalize_whitespace_collapses_blank_lines() {
        let input = "line1\n\n\n  \nline2";
        assert_eq!(normalize_whitespace(input), "line1\nline2");
    }

    #[test]
    fn remove_control_chars_preserves_newline_and_tab() {
        let input = "hello\tworld\n\u{0000}end";
        let output = remove_control_chars(input);
        assert_eq!(output, "hello\tworld\nend");
    }

    // ── S6: 新结构辅助函数测试 ─────────────────────────────────

    #[test]
    fn slugify_basic_project_name() {
        assert_eq!(slugify_workspace_name("My Project"), "my-project");
    }

    #[test]
    fn slugify_special_characters() {
        assert_eq!(
            slugify_workspace_name("codex/simple-memory"),
            "codex-simple-memory"
        );
    }

    #[test]
    fn slugify_empty_name_returns_unnamed() {
        assert_eq!(slugify_workspace_name(""), "unnamed");
        assert_eq!(slugify_workspace_name("   "), "unnamed");
    }

    #[test]
    fn slugify_truncates_long_name() {
        let long_name = "a".repeat(100);
        let slug = slugify_workspace_name(&long_name);
        assert!(slug.len() <= 50);
    }

    #[test]
    fn slugify_unicode_characters() {
        let slug = slugify_workspace_name("项目名称 test");
        // 非 ASCII 字母变成 '_'，split 后 join 为 '-'
        assert!(slug.contains("test"));
        assert!(!slug.contains(' '));
    }

    #[test]
    fn workspace_dir_path_format() {
        let base = std::path::PathBuf::from("/tmp/test");
        let result = workspace_dir_path(&base, "abcd1234-ef56-7890", Some("My Project"));
        let name = result.file_name().unwrap().to_str().unwrap();
        assert_eq!(name, "my-project--abcd1234");
    }

    #[test]
    fn workspace_dir_path_without_name() {
        let base = std::path::PathBuf::from("/tmp/test");
        let result = workspace_dir_path(&base, "abcd1234-ef56-7890", None);
        let name = result.file_name().unwrap().to_str().unwrap();
        assert_eq!(name, "unnamed--abcd1234");
    }

    #[test]
    fn workspace_dir_path_short_id() {
        let base = std::path::PathBuf::from("/tmp/test");
        let result = workspace_dir_path(&base, "abc", Some("proj"));
        let name = result.file_name().unwrap().to_str().unwrap();
        assert_eq!(name, "proj--abc");
    }

    #[test]
    fn date_file_path_format() {
        let ws_dir = std::path::PathBuf::from("/tmp/my-project--abcd1234");
        let result = date_file_path(&ws_dir, "2026-02-10");
        assert_eq!(
            result,
            std::path::PathBuf::from("/tmp/my-project--abcd1234/2026-02-10.json")
        );
    }

    #[test]
    fn today_str_format() {
        let today = today_str();
        // 格式 YYYY-MM-DD
        assert_eq!(today.len(), 10);
        assert_eq!(today.as_bytes()[4], b'-');
        assert_eq!(today.as_bytes()[7], b'-');
    }

    #[test]
    fn date_str_from_ms_valid_timestamp() {
        // 2026-02-10T00:00:00Z => 1770681600000
        let date = date_str_from_ms(1770681600000);
        assert_eq!(date, "2026-02-10");
    }

    #[test]
    fn date_str_from_ms_zero_falls_back() {
        // epoch 0 => 1970-01-01
        let date = date_str_from_ms(0);
        assert_eq!(date, "1970-01-01");
    }

    #[test]
    fn read_date_file_nonexistent_returns_empty() {
        let path = std::path::PathBuf::from("/tmp/nonexistent-test-file-12345.json");
        let result = read_date_file(&path).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn write_and_read_date_file_roundtrip() {
        let dir = std::env::temp_dir().join("codemoss-test-roundtrip");
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("2026-02-10.json");
        let item = ProjectMemoryItem {
            id: "test-id".to_string(),
            workspace_id: "ws-1".to_string(),
            kind: "note".to_string(),
            title: "Test".to_string(),
            summary: "Test summary".to_string(),
            detail: None,
            raw_text: None,
            clean_text: "test".to_string(),
            tags: vec![],
            importance: "low".to_string(),
            thread_id: None,
            message_id: None,
            source: "manual".to_string(),
            fingerprint: "abc123".to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            workspace_name: Some("test-project".to_string()),
            workspace_path: Some("/tmp/test".to_string()),
            engine: None,
        };
        write_date_file(&file, &[item.clone()]).unwrap();
        let read_back = read_date_file(&file).unwrap();
        assert_eq!(read_back.len(), 1);
        assert_eq!(read_back[0].id, "test-id");
        assert_eq!(read_back[0].workspace_name.as_deref(), Some("test-project"));
        assert_eq!(read_back[0].workspace_path.as_deref(), Some("/tmp/test"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_memory_in_workspace_finds_correct_file() {
        let dir = std::env::temp_dir().join("codemoss-test-find");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let item = ProjectMemoryItem {
            id: "find-me".to_string(),
            workspace_id: "ws-1".to_string(),
            kind: "note".to_string(),
            title: "Find".to_string(),
            summary: "Find me".to_string(),
            detail: None,
            raw_text: None,
            clean_text: "find me".to_string(),
            tags: vec![],
            importance: "low".to_string(),
            thread_id: None,
            message_id: None,
            source: "manual".to_string(),
            fingerprint: "fp1".to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            workspace_name: None,
            workspace_path: None,
            engine: None,
        };
        let file = dir.join("2026-02-10.json");
        write_date_file(&file, &[item]).unwrap();

        let found = find_memory_in_workspace(&dir, "find-me").unwrap();
        assert!(found.is_some());
        let (path, items) = found.unwrap();
        assert_eq!(path, file);
        assert_eq!(items.len(), 1);

        let not_found = find_memory_in_workspace(&dir, "nonexistent").unwrap();
        assert!(not_found.is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_workspace_memories_aggregates_multiple_days() {
        let dir = std::env::temp_dir().join("codemoss-test-aggregate");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let make_item = |id: &str| ProjectMemoryItem {
            id: id.to_string(),
            workspace_id: "ws-1".to_string(),
            kind: "note".to_string(),
            title: id.to_string(),
            summary: id.to_string(),
            detail: None,
            raw_text: None,
            clean_text: id.to_string(),
            tags: vec![],
            importance: "low".to_string(),
            thread_id: None,
            message_id: None,
            source: "manual".to_string(),
            fingerprint: id.to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            workspace_name: None,
            workspace_path: None,
            engine: None,
        };

        write_date_file(&dir.join("2026-02-10.json"), &[make_item("a"), make_item("b")]).unwrap();
        write_date_file(&dir.join("2026-02-11.json"), &[make_item("c")]).unwrap();

        let all = read_workspace_memories(&dir).unwrap();
        assert_eq!(all.len(), 3);
        let ids: Vec<&str> = all.iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"a"));
        assert!(ids.contains(&"b"));
        assert!(ids.contains(&"c"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
