use super::lifecycle::parse_context_command_usage;
use super::*;
use serde_json::json;
use tokio::sync::broadcast::error::TryRecvError;

fn test_workspace_path() -> PathBuf {
    std::env::temp_dir().join("ccgui-claude-context-usage-test-workspace")
}

#[test]
fn convert_event_ignores_invalid_context_usage_numbers() {
    let session = ClaudeSession::new("test-workspace".to_string(), test_workspace_path(), None);
    let mut receiver = session.subscribe();
    let event = json!({
        "type": "system",
        "subtype": "status",
        "context_window": {
            "current_usage": {
                "input_tokens": -1,
                "cache_creation_input_tokens": i64::MAX,
                "cache_read_input_tokens": 1,
                "output_tokens": "NaN"
            },
            "context_window_size": -258_400,
            "used_percentage": "NaN",
            "remaining_percentage": -1
        }
    });

    let _ = session.convert_event("turn-invalid-usage", &event);

    assert!(matches!(receiver.try_recv(), Err(TryRecvError::Empty)));
}

#[test]
fn parse_context_command_usage_reads_totals_categories_and_top_tools() {
    let markdown = r#"## Context Usage

**Model:** MiniMax-M2.7
**Tokens:** 12.9k / 200k (6%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 1.6k | 0.8% |
| Custom agents | 1k | 0.5% |
| Memory files | 6.7k | 3.3% |
| Skills | 3.6k | 1.8% |
| Free space | 154.1k | 77.0% |
| Autocompact buffer | 33k | 16.5% |

### MCP Tools

| Tool | Server | Tokens |
|------|--------|--------|
| mcp__a | srv | 3.5k |
| mcp__b | srv | 2k |
| mcp__c | srv | 1k |
| mcp__d | srv | 500 |
| mcp__zero | srv | 0 |
"#;

    let snapshot = parse_context_command_usage(markdown).expect("parse /context markdown");
    assert_eq!(snapshot.used_tokens, 12_900);
    assert_eq!(snapshot.context_window, 200_000);
    assert_eq!(snapshot.used_percent, 6.0);
    assert_eq!(snapshot.category_usages.len(), 6);
    assert_eq!(snapshot.category_usages[0].name, "System prompt");
    assert_eq!(snapshot.category_usages[0].tokens, 1_600);
    assert_eq!(snapshot.category_usages[0].percent, Some(0.8));
    assert_eq!(snapshot.tool_usages.len(), 3);
    assert_eq!(snapshot.tool_usages[0].name, "mcp__a");
    assert_eq!(snapshot.tool_usages[0].tokens, 3_500);
    assert!(snapshot.tool_usages_truncated);
}

#[test]
fn parse_context_command_usage_rejects_non_finite_or_negative_totals() {
    let negative_total = r#"## Context Usage

**Tokens:** -1 / 200k (6%)
"#;
    assert!(parse_context_command_usage(negative_total).is_none());

    let non_finite_total = r#"## Context Usage

**Tokens:** 1e309 / 200k (6%)
"#;
    assert!(parse_context_command_usage(non_finite_total).is_none());

    let negative_percent = r#"## Context Usage

**Tokens:** 1k / 200k (-1%)
"#;
    assert!(parse_context_command_usage(negative_percent).is_none());
}
