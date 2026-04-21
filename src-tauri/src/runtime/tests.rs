use super::{
    build_engine_observability, replace_workspace_session_with_terminator,
    terminate_replaced_workspace_session, write_json_atomically, RuntimeEndedRecord,
    RuntimeEngineObservability, RuntimeManager, RuntimeProcessDiagnostics, RuntimeState,
};
use super::process_diagnostics::{
    is_engine_root_process, parse_process_rows_unix_output,
    parse_process_rows_windows_payload, ProcessSnapshotRow,
};
use crate::backend::app_server::{
    dispose_test_workspace_session, make_test_workspace_session, WorkspaceSession,
};
use crate::types::{AppSettings, WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

fn workspace_entry(id: &str) -> WorkspaceEntry {
    let mut settings = WorkspaceSettings::default();
    settings.engine_type = Some("codex".to_string());
    WorkspaceEntry {
        id: id.to_string(),
        name: format!("Workspace {id}"),
        path: std::env::temp_dir().join(id).display().to_string(),
        codex_bin: None,
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings,
    }
}

#[tokio::test]
async fn reconcile_never_marks_leased_runtime_evictable() {
    let manager = RuntimeManager::new(&std::env::temp_dir());
    let entry = workspace_entry("leased");
    manager.record_starting(&entry, "codex", "test").await;
    manager.acquire_turn_lease(&entry, "codex", "turn:a").await;
    {
        let mut entries = manager.entries.lock().await;
        let runtime = entries
            .get_mut("codex::leased")
            .expect("runtime entry should exist");
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.last_used_at_ms = 0;
    }
    let mut settings = AppSettings::default();
    settings.codex_warm_ttl_seconds = 1;
    let candidates = manager.reconcile_pool(&settings).await;
    assert!(candidates.is_empty());
    let snapshot = manager.snapshot(&settings).await;
    assert!(matches!(snapshot.rows[0].state, RuntimeState::Acquired));
    assert!(snapshot.rows[0].active_work_protected);
}

#[tokio::test]
async fn reconcile_never_marks_thread_create_pending_runtime_evictable() {
    let manager = RuntimeManager::new(&std::env::temp_dir());
    let entry = workspace_entry("thread-create-pending");
    manager.record_starting(&entry, "codex", "test").await;
    {
        let mut entries = manager.entries.lock().await;
        let runtime = entries
            .get_mut("codex::thread-create-pending")
            .expect("runtime entry should exist");
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.last_used_at_ms = 0;
    }
    manager
        .note_foreground_thread_create_pending(&entry, "codex", 30_000)
        .await;
    let mut settings = AppSettings::default();
    settings.codex_warm_ttl_seconds = 1;
    let candidates = manager.reconcile_pool(&settings).await;
    assert!(candidates.is_empty());
    let snapshot = manager.snapshot(&settings).await;
    assert!(matches!(
        snapshot.rows[0].state,
        RuntimeState::StartupPending
    ));
    assert!(snapshot.rows[0].active_work_protected);
}

#[tokio::test]
async fn manual_release_waits_for_active_work_protection() {
    let manager = RuntimeManager::new(&std::env::temp_dir());
    let entry = workspace_entry("manual-release");
    manager.record_starting(&entry, "codex", "test").await;
    manager.acquire_turn_lease(&entry, "codex", "turn:a").await;
    {
        let mut entries = manager.entries.lock().await;
        let runtime = entries
            .get_mut("codex::manual-release")
            .expect("runtime entry should exist");
        runtime.session_exists = true;
        runtime.starting = false;
    }

    manager
        .request_release_to_cold("codex", "manual-release")
        .await;

    let snapshot = manager.snapshot(&AppSettings::default()).await;
    let row = snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == "manual-release")
        .expect("runtime row should exist");
    assert!(row.active_work_protected);
    assert_eq!(row.active_work_reason.as_deref(), Some("turn"));
    assert!(!row.evict_candidate);
    assert_eq!(
        row.eviction_reason.as_deref(),
        Some("manual-release-waiting-for-active-work"),
    );
    assert_eq!(snapshot.summary.active_work_protected_runtimes, 1);
}

#[tokio::test]
async fn record_runtime_ended_clears_leases_and_persists_exit_diagnostics() {
    let manager = RuntimeManager::new(&std::env::temp_dir());
    let entry = workspace_entry("ended");
    manager.record_starting(&entry, "codex", "test").await;
    manager.acquire_turn_lease(&entry, "codex", "turn:a").await;
    manager
        .acquire_stream_lease(&entry, "codex", "stream:a")
        .await;
    {
        let mut entries = manager.entries.lock().await;
        let runtime = entries
            .get_mut("codex::ended")
            .expect("runtime entry should exist");
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.pid = Some(4242);
    }

    manager
        .record_runtime_ended(
            "codex",
            "ended",
            RuntimeEndedRecord {
                reason_code: "process_exit".to_string(),
                message: Some(
                    "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.".to_string(),
                ),
                exit_code: Some(9),
                exit_signal: Some("15".to_string()),
                pending_request_count: 2,
            },
        )
        .await;

    let snapshot = manager.snapshot(&AppSettings::default()).await;
    let row = snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == "ended")
        .expect("runtime row should exist");
    assert!(!row.active_work_protected);
    assert_eq!(row.turn_lease_count, 0);
    assert_eq!(row.stream_lease_count, 0);
    assert_eq!(row.last_exit_reason_code.as_deref(), Some("process_exit"));
    assert_eq!(
        row.last_exit_message.as_deref(),
        Some("[RUNTIME_ENDED] Managed runtime process exited unexpectedly.")
    );
    assert_eq!(row.last_exit_code, Some(9));
    assert_eq!(row.last_exit_signal.as_deref(), Some("15"));
    assert_eq!(row.last_exit_pending_request_count, 2);
    assert_eq!(
        row.error.as_deref(),
        Some("[RUNTIME_ENDED] Managed runtime process exited unexpectedly."),
    );
    assert_eq!(row.pid, None);
}

#[tokio::test]
async fn reconcile_marks_old_idle_runtime_evictable() {
    let manager = RuntimeManager::new(&std::env::temp_dir());
    let entry = workspace_entry("idle");
    manager.record_starting(&entry, "codex", "test").await;
    {
        let mut entries = manager.entries.lock().await;
        let runtime = entries
            .get_mut("codex::idle")
            .expect("runtime entry should exist");
        runtime.session_exists = true;
        runtime.starting = false;
        runtime.last_used_at_ms = 0;
    }
    let mut settings = AppSettings::default();
    settings.codex_warm_ttl_seconds = 1;
    let candidates = manager.reconcile_pool(&settings).await;
    assert_eq!(candidates.len(), 1);
    let snapshot = manager.snapshot(&settings).await;
    assert!(matches!(snapshot.rows[0].state, RuntimeState::Evictable));
}

#[tokio::test]
async fn replacement_waiter_does_not_swap_in_a_third_runtime() {
    let runtime_manager = Arc::new(RuntimeManager::new(&std::env::temp_dir()));
    let sessions: Arc<Mutex<HashMap<String, Arc<WorkspaceSession>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let workspace_id = "replacement-serial".to_string();

    let original_session = make_test_workspace_session(&workspace_id).await;
    original_session.attach_runtime_manager(Arc::clone(&runtime_manager));
    runtime_manager
        .record_ready(&original_session, "initial-runtime")
        .await;
    sessions
        .lock()
        .await
        .insert(workspace_id.clone(), Arc::clone(&original_session));

    let first_successor = make_test_workspace_session(&workspace_id).await;
    first_successor.attach_runtime_manager(Arc::clone(&runtime_manager));
    let suppressed_successor = make_test_workspace_session(&workspace_id).await;
    suppressed_successor.attach_runtime_manager(Arc::clone(&runtime_manager));

    let replacement_started = Arc::new(Notify::new());
    let allow_replacement_to_finish = Arc::new(Notify::new());
    let suppressed_terminator_calls = Arc::new(AtomicU64::new(0));

    let first_task = {
        let replacement_started = Arc::clone(&replacement_started);
        let allow_replacement_to_finish = Arc::clone(&allow_replacement_to_finish);
        let workspace_id = workspace_id.clone();
        let first_successor = Arc::clone(&first_successor);
        let runtime_manager = Arc::clone(&runtime_manager);
        let sessions = Arc::clone(&sessions);
        tokio::spawn(async move {
            replace_workspace_session_with_terminator(
                sessions.as_ref(),
                Some(runtime_manager.as_ref()),
                workspace_id,
                first_successor,
                "ensure-runtime-ready",
                move |old_session, runtime_manager| {
                    let replacement_started = Arc::clone(&replacement_started);
                    let allow_replacement_to_finish = Arc::clone(&allow_replacement_to_finish);
                    Box::pin(async move {
                        replacement_started.notify_one();
                        allow_replacement_to_finish.notified().await;
                        terminate_replaced_workspace_session(old_session, runtime_manager).await
                    })
                },
            )
            .await
        })
    };

    replacement_started.notified().await;

    let snapshot_during_replacement = runtime_manager.snapshot(&AppSettings::default()).await;
    let row_during_replacement = snapshot_during_replacement
        .rows
        .iter()
        .find(|item| item.workspace_id == workspace_id)
        .expect("replacement row should exist");
    assert!(row_during_replacement.has_stopping_predecessor);
    assert_eq!(
        row_during_replacement.last_replace_reason.as_deref(),
        Some("ensure-runtime-ready"),
    );

    let second_task = {
        let workspace_id = workspace_id.clone();
        let suppressed_successor = Arc::clone(&suppressed_successor);
        let runtime_manager = Arc::clone(&runtime_manager);
        let suppressed_terminator_calls = Arc::clone(&suppressed_terminator_calls);
        let sessions = Arc::clone(&sessions);
        tokio::spawn(async move {
            replace_workspace_session_with_terminator(
                sessions.as_ref(),
                Some(runtime_manager.as_ref()),
                workspace_id,
                suppressed_successor,
                "focus-refresh",
                move |old_session, runtime_manager| {
                    suppressed_terminator_calls.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move {
                        terminate_replaced_workspace_session(old_session, runtime_manager).await
                    })
                },
            )
            .await
        })
    };

    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(suppressed_terminator_calls.load(Ordering::SeqCst), 0);
    let current_during_replacement = sessions
        .lock()
        .await
        .get(&workspace_id)
        .cloned()
        .expect("successor should stay active during replacement");
    assert!(Arc::ptr_eq(&current_during_replacement, &first_successor));

    allow_replacement_to_finish.notify_one();

    first_task
        .await
        .expect("first replacement join should succeed")
        .expect("first replacement should succeed");
    second_task
        .await
        .expect("second replacement join should succeed")
        .expect("waiter replacement should settle without swapping");

    assert_eq!(suppressed_terminator_calls.load(Ordering::SeqCst), 0);
    let current_after_replacement = sessions
        .lock()
        .await
        .get(&workspace_id)
        .cloned()
        .expect("successor should remain registered");
    assert!(Arc::ptr_eq(&current_after_replacement, &first_successor));

    let suppressed_exit = {
        let mut child = suppressed_successor.child.lock().await;
        child
            .try_wait()
            .expect("suppressed successor should be inspectable")
    };
    assert!(
        suppressed_exit.is_some(),
        "suppressed successor should be disposed instead of becoming a third runtime",
    );

    let settled_snapshot = runtime_manager.snapshot(&AppSettings::default()).await;
    let settled_row = settled_snapshot
        .rows
        .iter()
        .find(|item| item.workspace_id == workspace_id)
        .expect("settled row should exist");
    assert!(!settled_row.has_stopping_predecessor);

    dispose_test_workspace_session(&current_after_replacement).await;
}

#[test]
fn engine_observability_uses_tracked_snapshot_fields() {
    let rows = vec![super::RuntimePoolRow {
        workspace_id: "workspace-a".to_string(),
        workspace_name: "Workspace A".to_string(),
        workspace_path: std::env::temp_dir()
            .join("workspace-a")
            .display()
            .to_string(),
        engine: "codex".to_string(),
        state: RuntimeState::Acquired,
        pid: Some(4242),
        wrapper_kind: Some("node".to_string()),
        resolved_bin: Some("/opt/homebrew/bin/codex".to_string()),
        started_at_ms: Some(1),
        last_used_at_ms: 2,
        pinned: false,
        turn_lease_count: 1,
        stream_lease_count: 0,
        lease_sources: vec!["turn:test".to_string()],
        active_work_protected: true,
        active_work_reason: Some("turn".to_string()),
        active_work_since_ms: Some(1),
        active_work_last_renewed_at_ms: Some(2),
        foreground_work_state: None,
        foreground_work_thread_id: None,
        foreground_work_turn_id: None,
        foreground_work_since_ms: None,
        foreground_work_timeout_at_ms: None,
        foreground_work_last_event_at_ms: None,
        foreground_work_timed_out: false,
        evict_candidate: false,
        eviction_reason: None,
        error: None,
        last_exit_reason_code: None,
        last_exit_message: None,
        last_exit_at_ms: None,
        last_exit_code: None,
        last_exit_signal: None,
        last_exit_pending_request_count: 0,
        process_diagnostics: Some(RuntimeProcessDiagnostics {
            root_processes: 1,
            total_processes: 2,
            node_processes: 1,
            root_command: Some("node".to_string()),
            managed_runtime_processes: 1,
            resume_helper_processes: 0,
            orphan_residue_processes: 0,
        }),
        startup_state: Some(super::RuntimeStartupState::Ready),
        last_recovery_source: Some("thread-list-live".to_string()),
        last_guard_state: Some("ready".to_string()),
        last_replace_reason: None,
        last_probe_failure: None,
        last_probe_failure_source: None,
        has_stopping_predecessor: false,
        recent_spawn_count: 1,
        recent_replace_count: 0,
        recent_force_kill_count: 0,
    }];

    let observability = build_engine_observability(&rows);
    let codex = observability
        .into_iter()
        .find(|item| item.engine == "codex")
        .unwrap_or(RuntimeEngineObservability {
            engine: "codex".to_string(),
            session_count: 0,
            tracked_root_processes: 0,
            tracked_total_processes: 0,
            tracked_node_processes: 0,
            host_managed_root_processes: 0,
            host_unmanaged_root_processes: 0,
            external_root_processes: 0,
            host_unmanaged_total_processes: 0,
            external_total_processes: 0,
        });

    assert_eq!(codex.session_count, 1);
    assert_eq!(codex.tracked_root_processes, 1);
    assert_eq!(codex.tracked_total_processes, 2);
    assert_eq!(codex.tracked_node_processes, 1);
}

#[test]
fn codex_root_detector_ignores_vendor_child() {
    let root = ProcessSnapshotRow {
        pid: 100,
        ppid: 1,
        command: "node".to_string(),
        args: "node /opt/homebrew/bin/codex app-server".to_string(),
    };
    let vendor_child = ProcessSnapshotRow {
        pid: 101,
        ppid: 100,
        command: "codex".to_string(),
        args: "/vendor/codex app-server".to_string(),
    };
    let rows_by_pid = [(100, &root), (101, &vendor_child)]
        .into_iter()
        .collect::<std::collections::HashMap<_, _>>();

    assert!(is_engine_root_process("codex", &root, &rows_by_pid));
    assert!(!is_engine_root_process(
        "codex",
        &vendor_child,
        &rows_by_pid
    ));
}

#[test]
fn parse_process_rows_unix_output_skips_malformed_rows() {
    let rows = parse_process_rows_unix_output(
        "100 1 node node /opt/homebrew/bin/codex app-server\ninvalid row\n101 100 codex /vendor/codex app-server\n",
    );

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].pid, 100);
    assert_eq!(rows[0].ppid, 1);
    assert_eq!(rows[0].command, "node");
    assert!(rows[0].args.contains("codex app-server"));
}

#[test]
fn parse_process_rows_windows_payload_reads_command_line() {
    let rows = parse_process_rows_windows_payload(&json!([
        {
            "ProcessId": 200,
            "ParentProcessId": 50,
            "Name": "node.exe",
            "CommandLine": "\"C:\\\\Program Files\\\\node.exe\" C:\\\\Users\\\\demo\\\\codex app-server"
        },
        {
            "ProcessId": 201,
            "ParentProcessId": 200,
            "Name": "codex.exe",
            "CommandLine": null
        }
    ]));

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].pid, 200);
    assert_eq!(rows[0].command, "node.exe");
    assert!(rows[0].args.contains("codex app-server"));
    assert_eq!(rows[1].args, "codex.exe");
}

#[test]
fn write_json_atomically_replaces_existing_file() {
    let temp_dir = std::env::temp_dir().join(format!("ccgui-runtime-ledger-{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let path = temp_dir.join("runtime-pool-ledger.json");

    fs::write(&path, "{\"old\":true}").expect("seed existing file");
    write_json_atomically(&path, "{\"new\":true}").expect("replace existing file");

    let persisted = fs::read_to_string(&path).expect("read persisted file");
    assert_eq!(persisted, "{\"new\":true}");

    let _ = fs::remove_dir_all(&temp_dir);
}
