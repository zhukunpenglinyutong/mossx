use super::thread_listing::{
    build_local_codex_session_preview, build_thread_list_empty_response,
    codex_session_identifier_candidates, merge_unified_codex_thread_entries,
};
use super::{
    create_session_runtime_recovering_error, run_start_thread_with_hook_safe_fallback,
    run_start_thread_with_hook_safe_fallback_and_recovery_probe, run_start_thread_with_retry,
    run_start_thread_with_retry_and_recovery_probe,
};
use crate::types::{LocalUsageSessionSummary, LocalUsageUsageData};
use serde_json::json;
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[test]
fn build_thread_list_empty_response_has_expected_shape() {
    let response = build_thread_list_empty_response();
    assert_eq!(response["result"]["data"], json!([]));
    assert!(response["result"]["nextCursor"].is_null());
}

#[test]
fn build_local_codex_session_preview_prefers_trimmed_summary() {
    let with_summary = build_local_codex_session_preview(
        Some("  fixed preview  ".to_string()),
        "openai/gpt-5".to_string(),
    );
    let without_summary =
        build_local_codex_session_preview(Some("   ".to_string()), "openai/gpt-5".to_string());
    assert_eq!(with_summary, "fixed preview");
    assert_eq!(without_summary, "Codex session (openai/gpt-5)");
}

#[test]
fn merge_unified_codex_thread_entries_dedupes_and_keeps_metadata_stable() {
    let live_entries = vec![
        json!({
            "id": "thread-live",
            "preview": "live",
            "updatedAt": 100,
            "createdAt": 100
        }),
        json!({
            "id": "thread-dup",
            "preview": "remote",
            "updatedAt": 90,
            "createdAt": 90
        }),
        json!({
            "id": "thread-dup",
            "preview": "stale",
            "updatedAt": 80,
            "createdAt": 80
        }),
    ];
    let local_sessions = vec![
        LocalUsageSessionSummary {
            session_id: "thread-dup".to_string(),
            session_id_aliases: Vec::new(),
            timestamp: 110,
            cwd: None,
            model: "openai/gpt-5".to_string(),
            usage: LocalUsageUsageData::default(),
            cost: 0.0,
            summary: Some("local".to_string()),
            source: Some("custom".to_string()),
            provider: Some("openai".to_string()),
            file_size_bytes: Some(4_096),
            modified_lines: 0,
        },
        LocalUsageSessionSummary {
            session_id: "thread-local".to_string(),
            session_id_aliases: Vec::new(),
            timestamp: 105,
            cwd: None,
            model: "openai/gpt-5-mini".to_string(),
            usage: LocalUsageUsageData::default(),
            cost: 0.0,
            summary: Some("local-only".to_string()),
            source: Some("project".to_string()),
            provider: Some("openai".to_string()),
            file_size_bytes: Some(8_192),
            modified_lines: 0,
        },
    ];

    let workspace_session_ids: HashSet<String> = local_sessions
        .iter()
        .flat_map(codex_session_identifier_candidates)
        .collect();
    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &local_sessions,
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );

    assert_eq!(merged.len(), 3);
    assert_eq!(merged[0]["id"], "thread-dup");
    assert_eq!(merged[0]["updatedAt"], 110);
    assert_eq!(merged[0]["preview"], "remote");
    assert_eq!(merged[0]["sizeBytes"], 4_096);
    assert_eq!(merged[0]["source"], "custom");
    assert_eq!(merged[0]["provider"], "openai");
    assert_eq!(merged[0]["sourceLabel"], "custom/openai");
    assert_eq!(merged[0]["engine"], "codex");
    assert_eq!(merged[0]["canonicalSessionId"], "thread-dup");
    assert_eq!(merged[0]["attributionStatus"], "strict-match");

    assert_eq!(merged[1]["id"], "thread-local");
    assert_eq!(merged[1]["localFallback"], true);
    assert_eq!(merged[1]["sizeBytes"], 8_192);
    assert_eq!(merged[1]["sourceLabel"], "project/openai");
    assert_eq!(merged[1]["engine"], "codex");
    assert_eq!(merged[1]["canonicalSessionId"], "thread-local");
    assert_eq!(merged[1]["attributionStatus"], "strict-match");

    assert_eq!(merged[2]["id"], "thread-live");
    assert_eq!(merged[2]["engine"], "codex");
    assert_eq!(merged[2]["canonicalSessionId"], "thread-live");
    assert_eq!(merged[2]["attributionStatus"], "strict-match");
}

#[test]
fn merge_unified_codex_thread_entries_replaces_generic_vscode_source() {
    let live_entries = vec![json!({
        "id": "thread-dup",
        "preview": "remote",
        "updatedAt": 90,
        "createdAt": 90,
        "source": "vscode",
        "sourceLabel": "vscode"
    })];
    let local_sessions = vec![LocalUsageSessionSummary {
        session_id: "thread-dup".to_string(),
        session_id_aliases: Vec::new(),
        timestamp: 110,
        cwd: None,
        model: "openai/gpt-5".to_string(),
        usage: LocalUsageUsageData::default(),
        cost: 0.0,
        summary: Some("local".to_string()),
        source: Some("ccgui".to_string()),
        provider: Some("openai".to_string()),
        file_size_bytes: Some(1_024),
        modified_lines: 0,
    }];

    let workspace_session_ids: HashSet<String> = local_sessions
        .iter()
        .flat_map(codex_session_identifier_candidates)
        .collect();
    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &local_sessions,
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );
    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0]["sizeBytes"], 1_024);
    assert_eq!(merged[0]["source"], "ccgui");
    assert_eq!(merged[0]["sourceLabel"], "ccgui/openai");
}

#[test]
fn merge_unified_codex_thread_entries_matches_session_id_aliases() {
    let live_entries = vec![json!({
        "id": "rollout-2026-04-10T10-00-00-session-123",
        "preview": "remote",
        "updatedAt": 90,
        "createdAt": 90
    })];
    let local_sessions = vec![LocalUsageSessionSummary {
        session_id: "session-123".to_string(),
        session_id_aliases: vec!["rollout-2026-04-10T10-00-00-session-123".to_string()],
        timestamp: 110,
        cwd: None,
        model: "openai/gpt-5".to_string(),
        usage: LocalUsageUsageData::default(),
        cost: 0.0,
        summary: Some("local".to_string()),
        source: Some("cli".to_string()),
        provider: Some("openai".to_string()),
        file_size_bytes: Some(2_048),
        modified_lines: 0,
    }];

    let workspace_session_ids: HashSet<String> = local_sessions
        .iter()
        .flat_map(codex_session_identifier_candidates)
        .collect();
    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &local_sessions,
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0]["id"], "rollout-2026-04-10T10-00-00-session-123");
    assert_eq!(merged[0]["sizeBytes"], 2_048);
    assert_eq!(merged[0]["source"], "cli");
    assert_eq!(merged[0]["sourceLabel"], "cli/openai");
}

#[test]
fn merge_unified_codex_thread_entries_filters_background_helper_sessions() {
    let live_entries = vec![
        json!({
            "id": "thread-memory-helper",
            "preview": "live row should be hidden through local alias",
            "updatedAt": 120,
            "createdAt": 120
        }),
        json!({
            "id": "thread-title-helper",
            "preview": "Generate a concise title for a coding chat thread from the first user message. Return only title text.",
            "updatedAt": 115,
            "createdAt": 115
        }),
        json!({
            "id": "thread-visible",
            "preview": "normal user prompt",
            "updatedAt": 100,
            "createdAt": 100
        }),
    ];
    let local_sessions = vec![
        LocalUsageSessionSummary {
            session_id: "session-memory-helper".to_string(),
            session_id_aliases: vec!["thread-memory-helper".to_string()],
            timestamp: 125,
            cwd: None,
            model: "openai/gpt-5".to_string(),
            usage: LocalUsageUsageData::default(),
            cost: 0.0,
            summary: Some(
                "## Memory Writing Agent: Phase 2 (Consolidation)\n\nConsolidate raw memories."
                    .to_string(),
            ),
            source: Some("cli".to_string()),
            provider: Some("openai".to_string()),
            file_size_bytes: Some(2_048),
            modified_lines: 0,
        },
        LocalUsageSessionSummary {
            session_id: "thread-visible-local".to_string(),
            session_id_aliases: Vec::new(),
            timestamp: 90,
            cwd: None,
            model: "openai/gpt-5".to_string(),
            usage: LocalUsageUsageData::default(),
            cost: 0.0,
            summary: Some("normal local prompt".to_string()),
            source: Some("cli".to_string()),
            provider: Some("openai".to_string()),
            file_size_bytes: Some(1_024),
            modified_lines: 0,
        },
    ];

    let workspace_session_ids: HashSet<String> = local_sessions
        .iter()
        .flat_map(codex_session_identifier_candidates)
        .collect();
    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &local_sessions,
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );
    let ids = merged
        .iter()
        .filter_map(|entry| entry.get("id").and_then(|value| value.as_str()))
        .collect::<Vec<_>>();

    assert_eq!(ids, vec!["thread-visible", "thread-visible-local"]);
}

#[test]
fn merge_unified_codex_thread_entries_does_not_backfill_cwd_for_unmapped_live_rows() {
    let live_entries = vec![json!({
        "id": "thread-live",
        "preview": "remote",
        "updatedAt": 90,
        "createdAt": 90
    })];

    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &[],
        &HashSet::new(),
        "/tmp/workspace",
        10,
    );

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0]["id"], "thread-live");
    assert!(merged[0].get("cwd").is_none() || merged[0]["cwd"].is_null());
}

#[test]
fn merge_unified_codex_thread_entries_backfills_cwd_from_cached_workspace_ids() {
    let live_entries = vec![json!({
        "id": "thread-live",
        "preview": "remote",
        "updatedAt": 90,
        "createdAt": 90
    })];
    let mut workspace_session_ids = HashSet::new();
    workspace_session_ids.insert("thread-live".to_string());

    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &[],
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0]["id"], "thread-live");
    assert_eq!(merged[0]["cwd"], "/tmp/workspace");
}

#[test]
fn merge_unified_codex_thread_entries_backfills_workspace_cwd_for_mapped_live_rows() {
    let live_entries = vec![json!({
        "id": "rollout-2026-04-10T10-00-00-session-123",
        "preview": "remote",
        "updatedAt": 90,
        "createdAt": 90
    })];
    let local_sessions = vec![LocalUsageSessionSummary {
        session_id: "session-123".to_string(),
        session_id_aliases: vec!["rollout-2026-04-10T10-00-00-session-123".to_string()],
        timestamp: 110,
        cwd: None,
        model: "openai/gpt-5".to_string(),
        usage: LocalUsageUsageData::default(),
        cost: 0.0,
        summary: Some("local".to_string()),
        source: Some("cli".to_string()),
        provider: Some("openai".to_string()),
        file_size_bytes: Some(2_048),
        modified_lines: 0,
    }];

    let workspace_session_ids: HashSet<String> = local_sessions
        .iter()
        .flat_map(codex_session_identifier_candidates)
        .collect();
    let merged = merge_unified_codex_thread_entries(
        live_entries,
        &local_sessions,
        &workspace_session_ids,
        "/tmp/workspace",
        10,
    );

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0]["id"], "rollout-2026-04-10T10-00-00-session-123");
    assert_eq!(merged[0]["cwd"], "/tmp/workspace");
}

#[tokio::test]
async fn start_thread_retry_reacquires_after_manual_shutdown_race() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_retry(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    let attempt = start_calls.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        Err(
                            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
                                .to_string(),
                        )
                    } else {
                        Ok(json!({ "result": { "threadId": "thread-recovered" } }))
                    }
                }
            }
        },
    )
    .await
    .expect("manual shutdown race should retry once");

    assert_eq!(result["result"]["threadId"], "thread-recovered");
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 2);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn start_thread_retry_does_not_retry_non_runtime_shutdown_errors() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_retry(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Err("workspace not connected".to_string())
                }
            }
        },
    )
    .await
    .expect_err("non-runtime errors should surface directly");

    assert_eq!(error, "workspace not connected");
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn start_thread_retry_returns_recoverable_error_when_stopping_race_persists() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_retry(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Err(
                        "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
                            .to_string(),
                    )
                }
            }
        },
    )
    .await
    .expect_err("persistent stopping race should surface recoverable error");

    assert_eq!(error, create_session_runtime_recovering_error());
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 2);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn start_thread_retry_stops_when_recovery_probe_blocks_reacquire() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let probe_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_retry_and_recovery_probe(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        &{
            let probe_calls = Arc::clone(&probe_calls);
            move || {
                let probe_calls = Arc::clone(&probe_calls);
                async move {
                    probe_calls.fetch_add(1, Ordering::SeqCst);
                    Err("[RUNTIME_RECOVERY_QUARANTINED] retry later".to_string())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Err(
                        "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
                            .to_string(),
                    )
                }
            }
        },
    )
    .await
    .expect_err("quarantined recovery probe should stop bounded retry");

    assert_eq!(error, "[RUNTIME_RECOVERY_QUARANTINED] retry later");
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(probe_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn hook_safe_fallback_retries_once_after_invalid_thread_start_response() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    if start_calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Err("invalid_thread_start_response: root_keys=[]".to_string())
                    } else {
                        Ok(json!({ "result": { "thread": { "id": "thread-fallback" } } }))
                    }
                }
            }
        },
    )
    .await
    .expect("hook-safe fallback should recover invalid response");

    assert_eq!(result["result"]["thread"]["id"], "thread-fallback");
    assert_eq!(
        result["ccguiHookSafeFallback"]["reason"],
        "invalid_thread_start_response"
    );
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn hook_safe_fallback_reuses_stopping_runtime_retry_after_fallback_runtime() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-1",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    match start_calls.fetch_add(1, Ordering::SeqCst) {
                        0 => Err("invalid_thread_start_response: root_keys=[]".to_string()),
                        1 => Err(
                            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
                                .to_string(),
                        ),
                        _ => Ok(json!({ "result": { "thread": { "id": "thread-fallback" } } })),
                    }
                }
            }
        },
    )
    .await
    .expect("hook-safe fallback should reuse stopping-runtime retry");

    assert_eq!(result["result"]["thread"]["id"], "thread-fallback");
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 2);
    assert_eq!(start_calls.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn hook_safe_fallback_stopping_race_honors_recovery_probe() {
    let ensure_calls = Arc::new(AtomicUsize::new(0));
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let probe_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_hook_safe_fallback_and_recovery_probe(
        "ws-1",
        {
            let ensure_calls = Arc::clone(&ensure_calls);
            move || {
                let ensure_calls = Arc::clone(&ensure_calls);
                async move {
                    ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let probe_calls = Arc::clone(&probe_calls);
            move || {
                let probe_calls = Arc::clone(&probe_calls);
                async move {
                    probe_calls.fetch_add(1, Ordering::SeqCst);
                    Err("[RUNTIME_RECOVERY_QUARANTINED] retry later".to_string())
                }
            }
        },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    let attempt = start_calls.fetch_add(1, Ordering::SeqCst);
                    if attempt == 0 {
                        Err("invalid_thread_start_response: root_keys=[]".to_string())
                    } else {
                        Err(
                            "[RUNTIME_ENDED] Managed runtime stopped after manual shutdown."
                                .to_string(),
                        )
                    }
                }
            }
        },
    )
    .await
    .expect_err("fallback stopping race should honor recovery probe");

    assert!(error.contains("Primary create-session failed"));
    assert!(error.contains("[RUNTIME_RECOVERY_QUARANTINED] retry later"));
    assert_eq!(ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(probe_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn hook_safe_fallback_does_not_retry_unrelated_errors() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_hook_safe_fallback(
        "ws-1",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Err("workspace not connected".to_string())
                }
            }
        },
    )
    .await
    .expect_err("unrelated errors should not trigger fallback");

    assert_eq!(error, "workspace not connected");
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 0);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn sessionstart_hook_matrix_normal_hook_stays_on_primary_path() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-normal-hook",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(json!({ "result": { "thread": { "id": "thread-normal-hook" } } }))
                }
            }
        },
    )
    .await
    .expect("healthy SessionStart hook should keep primary create-session path");

    assert_eq!(result["result"]["thread"]["id"], "thread-normal-hook");
    assert!(result.get("ccguiHookSafeFallback").is_none());
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 0);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn sessionstart_hook_matrix_no_hook_stays_on_primary_path() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-no-hook",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(json!({ "result": { "thread": { "id": "thread-no-hook" } } }))
                }
            }
        },
    )
    .await
    .expect("workspace without hooks should keep primary create-session path");

    assert_eq!(result["result"]["thread"]["id"], "thread-no-hook");
    assert!(result.get("ccguiHookSafeFallback").is_none());
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 0);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn sessionstart_hook_matrix_broken_hook_falls_back_once() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-broken-hook",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    if start_calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Err("invalid_thread_start_response: root_keys=[\"result\"]".to_string())
                    } else {
                        Ok(json!({ "result": { "thread": { "id": "thread-broken-hook-fallback" } } }))
                    }
                }
            }
        },
    )
    .await
    .expect("broken SessionStart hook should recover through hook-safe fallback");

    assert_eq!(
        result["result"]["thread"]["id"],
        "thread-broken-hook-fallback"
    );
    assert_eq!(
        result["ccguiHookSafeFallback"]["reason"],
        "invalid_thread_start_response"
    );
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn sessionstart_hook_matrix_slow_hook_falls_back_once() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let result = run_start_thread_with_hook_safe_fallback(
        "ws-slow-hook",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    if start_calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Err("thread/start failed: SessionStart hook timed out".to_string())
                    } else {
                        Ok(json!({ "result": { "thread": { "id": "thread-slow-hook-fallback" } } }))
                    }
                }
            }
        },
    )
    .await
    .expect("slow SessionStart hook should recover through hook-safe fallback");

    assert_eq!(
        result["result"]["thread"]["id"],
        "thread-slow-hook-fallback"
    );
    assert_eq!(
        result["ccguiHookSafeFallback"]["reason"],
        "thread_start_timeout"
    );
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 1);
    assert_eq!(start_calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn sessionstart_hook_matrix_plain_thread_timeout_does_not_fallback() {
    let fallback_ensure_calls = Arc::new(AtomicUsize::new(0));
    let start_calls = Arc::new(AtomicUsize::new(0));

    let error = run_start_thread_with_hook_safe_fallback(
        "ws-plain-timeout",
        || async { Ok(()) },
        {
            let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
            move || {
                let fallback_ensure_calls = Arc::clone(&fallback_ensure_calls);
                async move {
                    fallback_ensure_calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            }
        },
        {
            let start_calls = Arc::clone(&start_calls);
            move || {
                let start_calls = Arc::clone(&start_calls);
                async move {
                    start_calls.fetch_add(1, Ordering::SeqCst);
                    Err("thread/start timed out after 300 seconds".to_string())
                }
            }
        },
    )
    .await
    .expect_err("plain thread/start timeout must not be classified as a hook failure");

    assert_eq!(error, "thread/start timed out after 300 seconds");
    assert_eq!(fallback_ensure_calls.load(Ordering::SeqCst), 0);
    assert_eq!(start_calls.load(Ordering::SeqCst), 1);
}
