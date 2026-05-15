use super::model::WorkspaceMemoryOverride;
use super::settings::memory_auto_enabled_for_workspace;
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
    assert_eq!(
        classify_kind("Found a bug report in the parser"),
        "known_issue"
    );
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
    let raw = include_str!(
        "../../../src/features/project-memory/utils/memoryKindClassification.contract.json"
    );
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
        WorkspaceMemoryOverride { auto_enabled: None },
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
fn write_json_file_atomic_replaces_existing_file_without_temp_leftover() {
    let dir = std::env::temp_dir().join("codemoss-test-atomic-write");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("settings.json");

    write_json_file_atomic(&file, "{\"version\":1}").unwrap();
    write_json_file_atomic(&file, "{\"version\":2}").unwrap();

    let raw = std::fs::read_to_string(&file).unwrap();
    assert_eq!(raw, "{\"version\":2}");
    let leftovers = std::fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.ends_with(".tmp"))
        })
        .count();
    assert_eq!(leftovers, 0);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn write_and_read_date_file_roundtrip() {
    let dir = std::env::temp_dir().join("codemoss-test-roundtrip");
    let _ = std::fs::remove_dir_all(&dir);
    let file = dir.join("2026-02-10.json");
    let item = ProjectMemoryItem {
        id: "test-id".to_string(),
        workspace_id: "ws-1".to_string(),
        schema_version: None,
        record_kind: None,
        kind: "note".to_string(),
        title: "Test".to_string(),
        summary: "Test summary".to_string(),
        detail: None,
        raw_text: None,
        clean_text: "test".to_string(),
        tags: vec![],
        importance: "low".to_string(),
        thread_id: None,
        turn_id: None,
        message_id: None,
        assistant_message_id: None,
        user_input: None,
        assistant_response: None,
        assistant_thinking_summary: None,
        review_state: None,
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
        schema_version: None,
        record_kind: None,
        kind: "note".to_string(),
        title: "Find".to_string(),
        summary: "Find me".to_string(),
        detail: None,
        raw_text: None,
        clean_text: "find me".to_string(),
        tags: vec![],
        importance: "low".to_string(),
        thread_id: None,
        turn_id: None,
        message_id: None,
        assistant_message_id: None,
        user_input: None,
        assistant_response: None,
        assistant_thinking_summary: None,
        review_state: None,
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
        schema_version: None,
        record_kind: None,
        kind: "note".to_string(),
        title: id.to_string(),
        summary: id.to_string(),
        detail: None,
        raw_text: None,
        clean_text: id.to_string(),
        tags: vec![],
        importance: "low".to_string(),
        thread_id: None,
        turn_id: None,
        message_id: None,
        assistant_message_id: None,
        user_input: None,
        assistant_response: None,
        assistant_thinking_summary: None,
        review_state: None,
        source: "manual".to_string(),
        fingerprint: id.to_string(),
        created_at: 1000,
        updated_at: 1000,
        deleted_at: None,
        workspace_name: None,
        workspace_path: None,
        engine: None,
    };

    write_date_file(
        &dir.join("2026-02-10.json"),
        &[make_item("a"), make_item("b")],
    )
    .unwrap();
    write_date_file(&dir.join("2026-02-11.json"), &[make_item("c")]).unwrap();

    let all = read_workspace_memories(&dir).unwrap();
    assert_eq!(all.len(), 3);
    let ids: Vec<&str> = all.iter().map(|i| i.id.as_str()).collect();
    assert!(ids.contains(&"a"));
    assert!(ids.contains(&"b"));
    assert!(ids.contains(&"c"));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn read_workspace_memories_skips_bad_json_file() {
    let dir = std::env::temp_dir().join("codemoss-test-bad-json-isolation");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let item = ProjectMemoryItem {
        id: "good".to_string(),
        workspace_id: "ws-1".to_string(),
        schema_version: None,
        record_kind: None,
        kind: "note".to_string(),
        title: "good".to_string(),
        summary: "good".to_string(),
        detail: None,
        raw_text: None,
        clean_text: "good".to_string(),
        tags: vec![],
        importance: "low".to_string(),
        thread_id: None,
        turn_id: None,
        message_id: None,
        assistant_message_id: None,
        user_input: None,
        assistant_response: None,
        assistant_thinking_summary: None,
        review_state: None,
        source: "manual".to_string(),
        fingerprint: "good".to_string(),
        created_at: 1000,
        updated_at: 1000,
        deleted_at: None,
        workspace_name: None,
        workspace_path: None,
        engine: None,
    };
    write_date_file(&dir.join("2026-02-10.json"), &[item]).unwrap();
    write_json_file_atomic(&dir.join("2026-02-10.001.json"), "{not-valid-json").unwrap();

    let all = read_workspace_memories(&dir).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "good");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn date_file_path_for_append_rolls_to_next_shard_when_current_exceeds_limit() {
    let dir = std::env::temp_dir().join("codemoss-test-date-shard");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    write_json_file_atomic(&dir.join("2026-02-10.json"), &"x".repeat(16)).unwrap();

    let next_file = date_file_path_for_append_with_limit(&dir, "2026-02-10", 8).unwrap();

    assert_eq!(next_file, dir.join("2026-02-10.001.json"));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn conversation_turn_projection_preserves_full_input_and_response() {
    let long_response = "完整 AI 回复 ".repeat(1500);
    let mut item = ProjectMemoryItem {
        id: "turn-memory".to_string(),
        workspace_id: "ws-1".to_string(),
        schema_version: Some(2),
        record_kind: Some("conversation_turn".to_string()),
        kind: "conversation".to_string(),
        title: String::new(),
        summary: String::new(),
        detail: None,
        raw_text: None,
        clean_text: String::new(),
        tags: vec![],
        importance: String::new(),
        thread_id: Some("thread-1".to_string()),
        turn_id: Some("turn-1".to_string()),
        message_id: Some("turn-1".to_string()),
        assistant_message_id: Some("assistant-1".to_string()),
        user_input: Some("完整用户输入".to_string()),
        assistant_response: Some(long_response.clone()),
        assistant_thinking_summary: None,
        review_state: None,
        source: "conversation_turn".to_string(),
        fingerprint: String::new(),
        created_at: 1000,
        updated_at: 1000,
        deleted_at: None,
        workspace_name: None,
        workspace_path: None,
        engine: Some("codex".to_string()),
    };

    apply_conversation_turn_projection(&mut item);

    assert_eq!(item.user_input.as_deref(), Some("完整用户输入"));
    assert_eq!(
        item.assistant_response.as_deref(),
        Some(long_response.as_str())
    );
    assert!(item
        .detail
        .as_deref()
        .unwrap_or("")
        .contains("完整用户输入"));
    assert!(item
        .detail
        .as_deref()
        .unwrap_or("")
        .contains(long_response.trim()));
    assert!(item.clean_text.contains(long_response.trim()));
    assert_eq!(item.record_kind.as_deref(), Some("conversation_turn"));
}

#[test]
fn apply_delete_semantics_physically_deletes_turn_and_soft_deletes_legacy() {
    let make_item = |id: &str, record_kind: Option<&str>| ProjectMemoryItem {
        id: id.to_string(),
        workspace_id: "ws-1".to_string(),
        schema_version: record_kind.map(|_| 2),
        record_kind: record_kind.map(str::to_string),
        kind: if record_kind == Some("conversation_turn") {
            "conversation".to_string()
        } else {
            "note".to_string()
        },
        title: id.to_string(),
        summary: id.to_string(),
        detail: None,
        raw_text: None,
        clean_text: id.to_string(),
        tags: vec![],
        importance: "medium".to_string(),
        thread_id: Some("thread-1".to_string()),
        turn_id: record_kind.map(|_| "turn-1".to_string()),
        message_id: None,
        assistant_message_id: None,
        user_input: record_kind.map(|_| "完整用户输入".to_string()),
        assistant_response: record_kind.map(|_| "完整 AI 回复".to_string()),
        assistant_thinking_summary: None,
        review_state: None,
        source: record_kind.unwrap_or("auto").to_string(),
        fingerprint: id.to_string(),
        created_at: 1000,
        updated_at: 1000,
        deleted_at: None,
        workspace_name: None,
        workspace_path: None,
        engine: None,
    };
    let mut turn_items = vec![make_item("turn-memory", Some("conversation_turn"))];
    assert!(apply_delete_semantics(&mut turn_items, "turn-memory", 2000));
    assert!(turn_items.is_empty());

    let mut legacy_items = vec![make_item("legacy-memory", None)];
    assert!(apply_delete_semantics(
        &mut legacy_items,
        "legacy-memory",
        2000
    ));
    assert_eq!(legacy_items.len(), 1);
    assert_eq!(legacy_items[0].deleted_at, Some(2000));
    assert_eq!(legacy_items[0].updated_at, 2000);
}

#[test]
fn find_turn_memory_in_workspace_uses_workspace_thread_and_turn_key() {
    let dir = std::env::temp_dir().join("codemoss-test-turn-key");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let item = ProjectMemoryItem {
        id: "turn-memory".to_string(),
        workspace_id: "ws-1".to_string(),
        schema_version: Some(2),
        record_kind: Some("conversation_turn".to_string()),
        kind: "conversation".to_string(),
        title: "Turn".to_string(),
        summary: "Summary".to_string(),
        detail: None,
        raw_text: None,
        clean_text: "turn".to_string(),
        tags: vec![],
        importance: "medium".to_string(),
        thread_id: Some("thread-1".to_string()),
        turn_id: Some("turn-1".to_string()),
        message_id: Some("turn-1".to_string()),
        assistant_message_id: None,
        user_input: Some("用户".to_string()),
        assistant_response: None,
        assistant_thinking_summary: None,
        review_state: None,
        source: "conversation_turn".to_string(),
        fingerprint: "fp".to_string(),
        created_at: 1000,
        updated_at: 1000,
        deleted_at: None,
        workspace_name: None,
        workspace_path: None,
        engine: Some("claude".to_string()),
    };
    let file = dir.join("2026-02-10.json");
    write_date_file(&file, &[item]).unwrap();

    let found = find_turn_memory_in_workspace(&dir, "ws-1", "thread-1", "turn-1").unwrap();
    assert!(found.is_some());
    let (found_file, items, index) = found.unwrap();
    assert_eq!(found_file, file);
    assert_eq!(items[index].id, "turn-memory");

    let missing = find_turn_memory_in_workspace(&dir, "ws-1", "thread-1", "turn-2").unwrap();
    assert!(missing.is_none());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn diagnostics_counts_health_duplicates_and_bad_files() {
    let dir = std::env::temp_dir().join("codemoss-test-memory-diagnostics");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let make_turn = |id: &str, user_input: Option<&str>, assistant_response: Option<&str>| {
        ProjectMemoryItem {
            id: id.to_string(),
            workspace_id: "ws-1".to_string(),
            schema_version: Some(2),
            record_kind: Some("conversation_turn".to_string()),
            kind: "conversation".to_string(),
            title: id.to_string(),
            summary: id.to_string(),
            detail: None,
            raw_text: None,
            clean_text: id.to_string(),
            tags: vec![],
            importance: "medium".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            message_id: Some("turn-1".to_string()),
            assistant_message_id: None,
            user_input: user_input.map(str::to_string),
            assistant_response: assistant_response.map(str::to_string),
            assistant_thinking_summary: None,
            review_state: None,
            source: "conversation_turn".to_string(),
            fingerprint: id.to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            workspace_name: None,
            workspace_path: None,
            engine: Some("codex".to_string()),
        }
    };
    write_date_file(
        &dir.join("2026-02-10.json"),
        &[
            make_turn("input-only", Some("用户输入"), None),
            make_turn("assistant-only", None, Some("AI 回复")),
        ],
    )
    .unwrap();
    write_json_file_atomic(&dir.join("2026-02-10.001.json"), "{bad-json").unwrap();

    let diagnostics = diagnose_workspace_memories("ws-1", &dir).unwrap();

    assert_eq!(diagnostics.total, 2);
    assert_eq!(diagnostics.health_counts.input_only, 1);
    assert_eq!(diagnostics.health_counts.assistant_only, 1);
    assert_eq!(diagnostics.duplicate_turn_groups.len(), 1);
    assert_eq!(diagnostics.bad_files.len(), 1);
    assert_eq!(diagnostics.bad_files[0].file_name, "2026-02-10.001.json");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn reconcile_dry_run_and_apply_merge_half_turns_without_deleting_facts() {
    let dir = std::env::temp_dir().join("codemoss-test-memory-reconcile");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let make_turn = |id: &str, user_input: Option<&str>, assistant_response: Option<&str>| {
        ProjectMemoryItem {
            id: id.to_string(),
            workspace_id: "ws-1".to_string(),
            schema_version: Some(2),
            record_kind: Some("conversation_turn".to_string()),
            kind: "conversation".to_string(),
            title: id.to_string(),
            summary: id.to_string(),
            detail: None,
            raw_text: None,
            clean_text: id.to_string(),
            tags: vec![],
            importance: "medium".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            message_id: Some("turn-1".to_string()),
            assistant_message_id: None,
            user_input: user_input.map(str::to_string),
            assistant_response: assistant_response.map(str::to_string),
            assistant_thinking_summary: None,
            review_state: None,
            source: "conversation_turn".to_string(),
            fingerprint: id.to_string(),
            created_at: 1000,
            updated_at: if id == "target" { 2000 } else { 1000 },
            deleted_at: None,
            workspace_name: None,
            workspace_path: None,
            engine: Some("codex".to_string()),
        }
    };
    write_date_file(
        &dir.join("2026-02-10.json"),
        &[
            make_turn("target", Some("完整用户输入"), None),
            make_turn("source", None, Some("完整 AI 回复")),
        ],
    )
    .unwrap();

    let dry_run = reconcile_workspace_memories("ws-1", &dir, true).unwrap();
    assert!(dry_run.dry_run);
    assert_eq!(dry_run.fixable_count, 1);
    assert_eq!(dry_run.fixed_count, 0);

    let apply = reconcile_workspace_memories("ws-1", &dir, false).unwrap();
    assert!(!apply.dry_run);
    assert_eq!(apply.fixed_count, 1);
    assert_eq!(apply.changed_memory_ids, vec!["target".to_string()]);

    let items = read_date_file(&dir.join("2026-02-10.json")).unwrap();
    let target = items.iter().find(|item| item.id == "target").unwrap();
    assert_eq!(target.user_input.as_deref(), Some("完整用户输入"));
    assert_eq!(target.assistant_response.as_deref(), Some("完整 AI 回复"));
    assert!(items.iter().any(|item| item.id == "source"));
    let _ = std::fs::remove_dir_all(&dir);
}
