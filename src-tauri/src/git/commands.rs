use super::*;

#[path = "commands_pr_workflow.rs"]
mod commands_pr_workflow;

#[tauri::command]
pub(crate) async fn get_git_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;

    let branch_name = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut status_options))
        .map_err(|e| e.to_string())?;
    let should_compute_diff_stats = statuses.len() <= GIT_STATUS_DIFF_STATS_FILE_LIMIT;

    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let index = repo.index().ok();

    let mut files = Vec::new();
    let mut staged_files = Vec::new();
    let mut unstaged_files = Vec::new();
    let mut total_additions = 0i64;
    let mut total_deletions = 0i64;
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("");
        if path.is_empty() {
            continue;
        }
        if let Some(index) = index.as_ref() {
            if let Some(entry) = index.get_path(Path::new(path), 0) {
                if entry.flags_extended & INDEX_SKIP_WORKTREE_FLAG != 0 {
                    continue;
                }
            }
        }
        let status = entry.status();
        let normalized_path = normalize_git_path(path);
        let include_index = status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        let include_workdir = status.intersects(
            Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        );
        let should_compute_path_diff_stats =
            should_compute_diff_stats && !should_skip_diff_stats(&repo_root, path);
        let mut combined_additions = 0i64;
        let mut combined_deletions = 0i64;

        if include_index {
            let (additions, deletions) = if should_compute_path_diff_stats {
                diff_stats_for_path(&repo, head_tree.as_ref(), path, true, false).unwrap_or((0, 0))
            } else {
                (0, 0)
            };
            if let Some(status_str) = status_for_index(status) {
                staged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_workdir {
            let (additions, deletions) = if should_compute_path_diff_stats {
                diff_stats_for_path(&repo, head_tree.as_ref(), path, false, true).unwrap_or((0, 0))
            } else {
                (0, 0)
            };
            if let Some(status_str) = status_for_workdir(status) {
                unstaged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_index || include_workdir {
            let status_str = status_for_workdir(status)
                .or_else(|| status_for_index(status))
                .unwrap_or("--");
            files.push(GitFileStatus {
                path: normalized_path,
                status: status_str.to_string(),
                additions: combined_additions,
                deletions: combined_deletions,
            });
        }
    }

    Ok(json!({
        "branchName": branch_name,
        "files": files,
        "stagedFiles": staged_files,
        "unstagedFiles": unstaged_files,
        "totalAdditions": total_additions,
        "totalDeletions": total_deletions,
    }))
}

#[tauri::command]
pub(crate) async fn stage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    // If libgit2 reports a rename, we want a single UI action to stage both the
    // old + new paths so the change actually moves to the staged section.
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["add", "-A", "--", &path]).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn stage_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["add", "-A"]).await
}

#[tauri::command]
pub(crate) async fn unstage_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        run_git_command(&repo_root, &["restore", "--staged", "--", &path]).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn revert_git_file(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    for path in action_paths_for_file(&repo_root, &path) {
        if run_git_command(
            &repo_root,
            &["restore", "--staged", "--worktree", "--", &path],
        )
        .await
        .is_ok()
        {
            continue;
        }
        run_git_command(&repo_root, &["clean", "-f", "--", &path]).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn revert_git_hunk(
    workspace_id: String,
    path: String,
    hunk_patch: String,
    reverse_staged: Option<bool>,
    reverse_unstaged: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let repo_root = resolve_git_root(&entry)?;
    let normalized_path = normalize_git_path(&path);
    let trimmed_patch = hunk_patch.trim();
    if normalized_path.is_empty() {
        return Err("Git hunk revert requires a file path.".to_string());
    }
    if trimmed_patch.is_empty() {
        return Err(format!(
            "Git hunk revert requires a non-empty patch for '{normalized_path}'."
        ));
    }
    if !trimmed_patch.contains("@@") {
        return Err(format!(
            "Git hunk revert patch for '{normalized_path}' does not contain a hunk header."
        ));
    }

    let patch = if hunk_patch.ends_with('\n') {
        hunk_patch
    } else {
        format!("{hunk_patch}\n")
    };
    let apply_to_staged = reverse_staged.unwrap_or(true);
    let apply_to_unstaged = reverse_unstaged.unwrap_or(true);
    if !apply_to_staged && !apply_to_unstaged {
        return Err(format!(
            "Git hunk revert for '{normalized_path}' has no target state enabled."
        ));
    }

    if apply_to_staged {
        apply_reverse_hunk_patch(&repo_root, &patch, true, &normalized_path).await?;
    }
    if apply_to_unstaged {
        apply_reverse_hunk_patch(&repo_root, &patch, false, &normalized_path).await?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn revert_git_all(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces.get(&workspace_id).ok_or("workspace not found")?;
    let repo_root = resolve_git_root(entry)?;
    run_git_command(
        &repo_root,
        &["restore", "--staged", "--worktree", "--", "."],
    )
    .await?;
    run_git_command(&repo_root, &["clean", "-f", "-d"]).await
}

#[tauri::command]
pub(crate) async fn commit_git(
    workspace_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["commit", "-m", &message]).await
}

#[tauri::command]
pub(crate) async fn push_git(
    workspace_id: String,
    remote: Option<String>,
    branch: Option<String>,
    force_with_lease: Option<bool>,
    push_tags: Option<bool>,
    run_hooks: Option<bool>,
    push_to_gerrit: Option<bool>,
    topic: Option<String>,
    reviewers: Option<String>,
    cc: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    push_with_options(
        &repo_root,
        remote,
        branch,
        force_with_lease.unwrap_or(false),
        push_tags.unwrap_or(false),
        run_hooks.unwrap_or(true),
        push_to_gerrit.unwrap_or(false),
        topic,
        reviewers,
        cc,
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_git_push_preview(
    workspace_id: String,
    remote: String,
    branch: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitPushPreviewResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let target_remote = remote.trim();
    if target_remote.is_empty() {
        return Err("Remote is required for push preview.".to_string());
    }
    let normalized_target_branch = normalize_remote_target_branch(target_remote, &branch);
    if normalized_target_branch.is_empty() {
        return Err("Target branch is required for push preview.".to_string());
    }

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let source_oid = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .ok_or_else(|| "HEAD does not point to a commit.".to_string())?;
    let source_branch = current_local_branch(&repo_root)?.unwrap_or_else(|| "HEAD".to_string());
    let target_ref = format!("refs/remotes/{target_remote}/{normalized_target_branch}");
    let target_oid = repo.refname_to_id(&target_ref).ok();

    let refs_map = collect_commit_refs_map(&repo);
    let max_items = limit.unwrap_or(120).clamp(1, 500);
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;
    revwalk.push(source_oid).map_err(|e| e.to_string())?;
    if let Some(oid) = target_oid {
        revwalk.hide(oid).map_err(|e| e.to_string())?;
    }

    let mut commits = Vec::new();
    let mut has_more = false;
    for oid_result in revwalk {
        if commits.len() >= max_items {
            has_more = true;
            break;
        }
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let sha = commit.id().to_string();
        let short_sha: String = sha.chars().take(7).collect();
        commits.push(GitHistoryCommit {
            sha,
            short_sha,
            summary: commit.summary().unwrap_or("").to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            parents: commit
                .parents()
                .map(|parent| parent.id().to_string())
                .collect(),
            refs: refs_map.get(&oid).cloned().unwrap_or_default(),
        });
    }

    Ok(GitPushPreviewResponse {
        source_branch,
        target_remote: target_remote.to_string(),
        target_branch: normalized_target_branch,
        target_ref,
        target_found: target_oid.is_some(),
        has_more,
        commits,
    })
}

#[tauri::command]
pub(crate) async fn pull_git(
    workspace_id: String,
    remote: Option<String>,
    branch: Option<String>,
    strategy: Option<String>,
    no_commit: Option<bool>,
    no_verify: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let mut args = vec!["pull".to_string()];
    if let Some(strategy_flag) = trim_optional(strategy) {
        match strategy_flag.as_str() {
            "--rebase" | "--ff-only" | "--no-ff" | "--squash" => args.push(strategy_flag),
            _ => return Err("Unsupported pull strategy option.".to_string()),
        }
    }
    if no_commit.unwrap_or(false) {
        args.push("--no-commit".to_string());
    }
    if no_verify.unwrap_or(false) {
        args.push("--no-verify".to_string());
    }
    if let Some(remote_name) = trim_optional(remote) {
        args.push(remote_name);
        if let Some(branch_name) = trim_optional(branch) {
            args.push(normalize_local_branch_ref(&branch_name));
        }
    } else if let Some(branch_name) = trim_optional(branch) {
        args.push("origin".to_string());
        args.push(normalize_local_branch_ref(&branch_name));
    }
    let command: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git_command(&repo_root, &command).await
}

#[tauri::command]
pub(crate) async fn sync_git(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    // Pull first, then push (like VSCode sync)
    run_git_command(&repo_root, &["pull"]).await?;
    push_with_upstream(&repo_root).await
}

#[tauri::command]
pub(crate) async fn git_pull(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    pull_git(workspace_id, None, None, None, None, None, state).await
}

#[tauri::command]
pub(crate) async fn git_push(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    push_git(
        workspace_id,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        state,
    )
    .await
}

#[tauri::command]
pub(crate) async fn git_sync(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sync_git(workspace_id, state).await
}

#[tauri::command]
pub(crate) async fn git_fetch(
    workspace_id: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    if let Some(remote_name) = remote
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        run_git_command(&repo_root, &["fetch", remote_name.as_str()]).await
    } else {
        run_git_command(&repo_root, &["fetch", "--all"]).await
    }
}

#[tauri::command]
pub(crate) async fn cherry_pick_commit(
    workspace_id: String,
    commit_hash: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["cherry-pick", commit_hash.trim()]).await
}

#[tauri::command]
pub(crate) async fn revert_commit(
    workspace_id: String,
    commit_hash: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    run_git_command(&repo_root, &["revert", "--no-edit", commit_hash.trim()]).await
}

#[tauri::command]
pub(crate) async fn reset_git_commit(
    workspace_id: String,
    commit_hash: String,
    mode: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let trimmed_hash = commit_hash.trim();
    if trimmed_hash.is_empty() {
        return Err("commit hash is required".to_string());
    }

    let mode_flag = match mode.trim().to_lowercase().as_str() {
        "soft" => "--soft",
        "hard" => "--hard",
        "keep" => "--keep",
        "mixed" => "--mixed",
        _ => "--mixed",
    };

    run_git_command(&repo_root, &["reset", mode_flag, trimmed_hash]).await
}

#[tauri::command]
pub(crate) async fn list_git_roots(
    workspace_id: String,
    depth: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let root = PathBuf::from(&entry.path);
    let depth = depth.unwrap_or(2).clamp(1, 6);
    Ok(scan_git_roots(&root, depth, 200))
}

/// Helper function to get the combined diff for a workspace (used by commit message generation)
pub(crate) async fn get_workspace_diff(
    workspace_id: &str,
    state: &State<'_, AppState>,
) -> Result<String, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    collect_workspace_diff(&repo_root)
}

#[tauri::command]
pub(crate) async fn get_git_diffs(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitFileDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    tokio::task::spawn_blocking(move || {
        let repo = open_repository_at_root(&repo_root)?;
        let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

        let mut options = DiffOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);

        let diff = match head_tree.as_ref() {
            Some(tree) => repo
                .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                .map_err(|e| e.to_string())?,
            None => repo
                .diff_tree_to_workdir_with_index(None, Some(&mut options))
                .map_err(|e| e.to_string())?,
        };

        let mut results = Vec::new();
        let mut total_diff_bytes = 0usize;
        let mut included_deltas = 0usize;
        for (index, delta) in diff.deltas().enumerate() {
            if included_deltas >= GIT_DIFF_PREVIEW_MAX_FILES {
                break;
            }

            let old_path = delta.old_file().path();
            let new_path = delta.new_file().path();
            let display_path = new_path.or(old_path);
            let Some(display_path) = display_path else {
                continue;
            };
            let old_path_str = old_path.map(|path| path.to_string_lossy());
            let new_path_str = new_path.map(|path| path.to_string_lossy());
            let display_path_str = display_path.to_string_lossy();
            let normalized_path = normalize_git_path(&display_path_str);
            let max_file_size = delta.new_file().size().max(delta.old_file().size());

            if is_heavy_diff_path(&display_path_str)
                || max_file_size > GIT_DIFF_PREVIEW_SKIP_FILE_SIZE_BYTES
                || is_large_worktree_file(
                    &repo_root,
                    &display_path_str,
                    GIT_DIFF_PREVIEW_SKIP_FILE_SIZE_BYTES,
                )
            {
                continue;
            }

            let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
            let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
            let is_image = old_image_mime.is_some() || new_image_mime.is_some();

            if is_image {
                let is_deleted = delta.status() == git2::Delta::Deleted;
                let is_added = delta.status() == git2::Delta::Added;

                let old_image_data = if !is_added && old_image_mime.is_some() {
                    head_tree
                        .as_ref()
                        .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                        .and_then(|entry| repo.find_blob(entry.id()).ok())
                        .and_then(blob_to_base64)
                } else {
                    None
                };

                let new_image_data = if !is_deleted && new_image_mime.is_some() {
                    match new_path {
                        Some(path) => {
                            let full_path = repo_root.join(path);
                            read_image_base64(&full_path)
                        }
                        None => None,
                    }
                } else {
                    None
                };

                results.push(GitFileDiff {
                    path: normalized_path,
                    diff: String::new(),
                    is_binary: true,
                    is_image: true,
                    old_image_data,
                    new_image_data,
                    old_image_mime: old_image_mime.map(str::to_string),
                    new_image_mime: new_image_mime.map(str::to_string),
                });
                included_deltas += 1;
                continue;
            }

            let patch = match git2::Patch::from_diff(&diff, index) {
                Ok(patch) => patch,
                Err(_) => continue,
            };
            let Some(mut patch) = patch else {
                continue;
            };
            let content = match diff_patch_to_string(&mut patch) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if content.trim().is_empty() {
                continue;
            }

            if total_diff_bytes >= GIT_DIFF_PREVIEW_MAX_TOTAL_BYTES {
                break;
            }
            let remaining_budget = GIT_DIFF_PREVIEW_MAX_TOTAL_BYTES - total_diff_bytes;
            let per_file_budget = remaining_budget.min(GIT_DIFF_PREVIEW_MAX_BYTES_PER_FILE);
            if per_file_budget == 0 {
                break;
            }
            let trimmed_content = truncate_diff_preview(
                content,
                GIT_DIFF_PREVIEW_MAX_LINES_PER_FILE,
                per_file_budget,
            );
            if trimmed_content.trim().is_empty() {
                continue;
            }
            total_diff_bytes += trimmed_content.len();

            results.push(GitFileDiff {
                path: normalized_path,
                diff: trimmed_content,
                is_binary: false,
                is_image: false,
                old_image_data: None,
                new_image_data: None,
                old_image_mime: None,
                new_image_mime: None,
            });
            included_deltas += 1;
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn get_git_file_full_diff(
    workspace_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    get_git_file_full_diff_for_section(workspace_id, path, Some("unstaged".to_string()), state).await
}

#[tauri::command]
pub(crate) async fn get_git_file_full_diff_for_section(
    workspace_id: String,
    path: String,
    section: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let normalized_path = normalize_git_path(&path);
    let section = section
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unstaged");
    let use_cached = matches!(section, "staged");
    let full_diff = {
        let args = if use_cached {
            vec!["diff", "--cached", "--unified=3", "--", normalized_path.as_str()]
        } else {
            vec!["diff", "HEAD", "--unified=3", "--", normalized_path.as_str()]
        };
        let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
        let output = crate::utils::async_command(git_bin)
            .args(args)
            .current_dir(&repo_root)
            .env("PATH", git_env_path())
            .output()
            .await
            .map_err(|e| format!("Failed to run git: {e}"))?;

        if output.status.success() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            String::new()
        }
    };
    if !full_diff.trim().is_empty() {
        return Ok(full_diff);
    }

    tokio::task::spawn_blocking(move || {
        let repo = open_repository_at_root(&repo_root)?;
        let mut options = DiffOptions::new();
        options
            .pathspec(&normalized_path)
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true)
            .context_lines(3)
            .interhunk_lines(1);

        let diff = if use_cached {
            let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
            let index = repo.index().map_err(|e| e.to_string())?;
            repo.diff_tree_to_index(head_tree.as_ref(), Some(&index), Some(&mut options))
                .map_err(|e| e.to_string())?
        } else {
            let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
            match head_tree.as_ref() {
                Some(tree) => repo
                    .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                    .map_err(|e| e.to_string())?,
                None => repo
                    .diff_tree_to_workdir_with_index(None, Some(&mut options))
                    .map_err(|e| e.to_string())?,
            }
        };

        for (index, _delta) in diff.deltas().enumerate() {
            let patch = match git2::Patch::from_diff(&diff, index) {
                Ok(patch) => patch,
                Err(_) => continue,
            };
            let Some(mut patch) = patch else {
                continue;
            };
            let content = match diff_patch_to_string(&mut patch) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if !content.trim().is_empty() {
                return Ok(content);
            }
        }
        Ok(String::new())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn get_git_log(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let max_items = limit.unwrap_or(40);
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for oid_result in revwalk {
        oid_result.map_err(|e| e.to_string())?;
        total += 1;
    }

    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for oid_result in revwalk.take(max_items) {
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        entries.push(commit_to_entry(commit));
    }

    let mut ahead = 0usize;
    let mut behind = 0usize;
    let mut ahead_entries = Vec::new();
    let mut behind_entries = Vec::new();
    let mut upstream = None;

    if let Ok(head) = repo.head() {
        if head.is_branch() {
            if let Some(branch_name) = head.shorthand() {
                if let Ok(branch) = repo.find_branch(branch_name, BranchType::Local) {
                    if let Ok(upstream_branch) = branch.upstream() {
                        let upstream_ref = upstream_branch.get();
                        upstream = upstream_ref
                            .shorthand()
                            .map(|name| name.to_string())
                            .or_else(|| upstream_ref.name().map(|name| name.to_string()));
                        if let (Some(head_oid), Some(upstream_oid)) =
                            (head.target(), upstream_ref.target())
                        {
                            let (ahead_count, behind_count) = repo
                                .graph_ahead_behind(head_oid, upstream_oid)
                                .map_err(|e| e.to_string())?;
                            ahead = ahead_count;
                            behind = behind_count;

                            let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
                            revwalk.push(head_oid).map_err(|e| e.to_string())?;
                            revwalk.hide(upstream_oid).map_err(|e| e.to_string())?;
                            revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
                                ahead_entries.push(commit_to_entry(commit));
                            }

                            let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
                            revwalk.push(upstream_oid).map_err(|e| e.to_string())?;
                            revwalk.hide(head_oid).map_err(|e| e.to_string())?;
                            revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;
                            for oid_result in revwalk.take(max_items) {
                                let oid = oid_result.map_err(|e| e.to_string())?;
                                let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
                                behind_entries.push(commit_to_entry(commit));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(GitLogResponse {
        total,
        entries,
        ahead,
        behind,
        ahead_entries,
        behind_entries,
        upstream,
    })
}

#[tauri::command]
pub(crate) async fn get_git_commit_history(
    workspace_id: String,
    branch: Option<String>,
    query: Option<String>,
    author: Option<String>,
    date_from: Option<i64>,
    date_to: Option<i64>,
    snapshot_id: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitHistoryResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;

    let branch_filter = branch.map(|value| value.trim().to_string());
    let branch_filter = branch_filter.filter(|value| !value.is_empty());
    let mut has_ref = false;
    if let Some(selected_branch) = branch_filter.as_ref() {
        let lower = selected_branch.to_lowercase();
        if lower == "all" || lower == "*" {
            if revwalk.push_glob("refs/heads/*").is_ok() {
                has_ref = true;
            }
            if revwalk.push_glob("refs/remotes/*").is_ok() {
                has_ref = true;
            }
        } else {
            let local_ref = format!("refs/heads/{selected_branch}");
            if let Ok(oid) = repo.refname_to_id(&local_ref) {
                revwalk.push(oid).map_err(|e| e.to_string())?;
                has_ref = true;
            } else {
                let remote_ref = format!("refs/remotes/{selected_branch}");
                if let Ok(oid) = repo.refname_to_id(&remote_ref) {
                    revwalk.push(oid).map_err(|e| e.to_string())?;
                    has_ref = true;
                } else if let Ok(object) = repo.revparse_single(selected_branch) {
                    revwalk.push(object.id()).map_err(|e| e.to_string())?;
                    has_ref = true;
                }
            }
            if !has_ref {
                return Err(format!("Branch or ref not found: {selected_branch}"));
            }
        }
    }
    if !has_ref {
        revwalk.push_head().map_err(|e| e.to_string())?;
    }

    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let provided_snapshot_id = snapshot_id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let query_filter = trim_lowercase(query);
    let author_filter = trim_lowercase(author);
    let refs_map = collect_commit_refs_map(&repo);
    let head_sha = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .map(|oid| oid.to_string())
        .unwrap_or_else(|| "detached".to_string());
    let current_snapshot_id = format!(
        "{}:{}:{}:{}:{}:{}",
        head_sha,
        branch_filter.clone().unwrap_or_else(|| "HEAD".to_string()),
        query_filter.clone().unwrap_or_default(),
        author_filter.clone().unwrap_or_default(),
        date_from.unwrap_or_default(),
        date_to.unwrap_or_default()
    );
    if let Some(previous_snapshot_id) = provided_snapshot_id {
        if previous_snapshot_id != current_snapshot_id {
            return Err("History snapshot expired. Please refresh commits.".to_string());
        }
    }

    let mut filtered = Vec::new();
    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let commit_time = commit.time().seconds();
        if date_from.is_some_and(|value| commit_time < value) {
            continue;
        }
        if date_to.is_some_and(|value| commit_time > value) {
            continue;
        }
        let sha = commit.id().to_string();
        let summary = commit.summary().unwrap_or("").to_string();
        let message = commit.message().unwrap_or("").to_string();
        let author_name = commit.author().name().unwrap_or("").to_string();
        let author_email = commit.author().email().unwrap_or("").to_string();

        if let Some(filter) = query_filter.as_ref() {
            let haystacks = [
                sha.to_lowercase(),
                summary.to_lowercase(),
                message.to_lowercase(),
            ];
            if !haystacks.iter().any(|item| item.contains(filter)) {
                continue;
            }
        }
        if let Some(filter) = author_filter.as_ref() {
            let author_haystack = format!(
                "{} {}",
                author_name.to_lowercase(),
                author_email.to_lowercase()
            );
            if !author_haystack.contains(filter) {
                continue;
            }
        }

        let short_sha: String = sha.chars().take(7).collect();
        let parents = commit
            .parents()
            .map(|parent| parent.id().to_string())
            .collect();
        let refs = refs_map.get(&oid).cloned().unwrap_or_default();
        filtered.push(GitHistoryCommit {
            sha,
            short_sha,
            summary,
            message,
            author: author_name,
            author_email,
            timestamp: commit_time,
            parents,
            refs,
        });
    }

    let (commits, total, has_more) = paginate_history_commits(filtered, offset, limit);
    Ok(GitHistoryResponse {
        snapshot_id: current_snapshot_id,
        total,
        offset,
        limit,
        has_more,
        commits,
    })
}

#[tauri::command]
pub(crate) async fn resolve_git_commit_ref(
    workspace_id: String,
    target: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Commit target cannot be empty.".to_string());
    }

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let object = repo
        .revparse_single(trimmed)
        .map_err(|_| format!("Commit or ref not found: {trimmed}"))?;
    let commit = object
        .peel_to_commit()
        .map_err(|_| format!("Target does not resolve to a commit: {trimmed}"))?;
    Ok(commit.id().to_string())
}

#[tauri::command]
pub(crate) async fn get_git_commit_details(
    workspace_id: String,
    commit_hash: String,
    max_diff_lines: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitCommitDetails, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let oid = Oid::from_str(commit_hash.trim()).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
    let mut options = DiffOptions::new();
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))
        .map_err(|e| e.to_string())?;

    let max_lines = max_diff_lines.unwrap_or(MAX_COMMIT_DIFF_LINES).max(200);
    let mut files = Vec::new();
    let mut total_additions = 0i64;
    let mut total_deletions = 0i64;

    for (index, delta) in diff.deltas().enumerate() {
        let old_path = delta
            .old_file()
            .path()
            .map(|path| normalize_git_path(path.to_string_lossy().as_ref()));
        let new_path = delta
            .new_file()
            .path()
            .map(|path| normalize_git_path(path.to_string_lossy().as_ref()));
        let path = new_path
            .clone()
            .or_else(|| old_path.clone())
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        let status = status_for_delta(delta.status()).to_string();
        let old_mime = old_path.as_deref().and_then(image_mime_type);
        let new_mime = new_path.as_deref().and_then(image_mime_type);
        let is_image = old_mime.is_some() || new_mime.is_some();

        let mut additions = 0i64;
        let mut deletions = 0i64;
        let mut diff_text = String::new();
        let mut line_count = 0usize;
        let mut truncated = false;
        let mut is_binary = false;

        match git2::Patch::from_diff(&diff, index) {
            Ok(Some(mut patch)) => {
                if let Ok((_, added, deleted)) = patch.line_stats() {
                    additions = added as i64;
                    deletions = deleted as i64;
                }
                let raw = diff_patch_to_string(&mut patch).unwrap_or_default();
                let (trimmed, total_lines, is_truncated) = truncate_diff_lines(&raw, max_lines);
                diff_text = trimmed;
                line_count = total_lines;
                truncated = is_truncated;
            }
            Ok(None) => {
                is_binary = true;
            }
            Err(_) => {
                is_binary = true;
            }
        }

        total_additions += additions;
        total_deletions += deletions;
        files.push(GitCommitFileChange {
            path,
            old_path,
            status,
            additions,
            deletions,
            is_binary,
            is_image,
            diff: diff_text,
            line_count,
            truncated,
        });
    }

    files.sort_by(|left, right| {
        fn rank(status: &str) -> usize {
            match status {
                "A" => 0,
                "M" => 1,
                "D" => 2,
                "R" => 3,
                _ => 4,
            }
        }
        rank(&left.status).cmp(&rank(&right.status))
    });

    let author_signature = commit.author();
    let author = author_signature.name().unwrap_or("").to_string();
    let author_email = author_signature.email().unwrap_or("").to_string();
    let author_time = author_signature.when().seconds();
    let committer_signature = commit.committer();
    let committer = committer_signature.name().unwrap_or("").to_string();
    let committer_email = committer_signature.email().unwrap_or("").to_string();
    let commit_time = committer_signature.when().seconds();

    let details = GitCommitDetails {
        sha: commit.id().to_string(),
        summary: commit.summary().unwrap_or("").to_string(),
        message: commit.message().unwrap_or("").to_string(),
        author,
        author_email,
        committer,
        committer_email,
        author_time,
        commit_time,
        parents: commit
            .parents()
            .map(|parent| parent.id().to_string())
            .collect(),
        files,
        total_additions,
        total_deletions,
    };
    Ok(details)
}

#[tauri::command]
pub(crate) async fn get_git_commit_diff(
    workspace_id: String,
    sha: String,
    path: Option<String>,
    context_lines: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommitDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let oid = git2::Oid::from_str(&sha).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());

    let mut options = DiffOptions::new();
    let context = context_lines.unwrap_or(3).min(200_000) as u32;
    options.context_lines(context).interhunk_lines(context);
    if let Some(path_filter) = trim_optional(path) {
        let normalized_path = normalize_git_path(&path_filter);
        if !normalized_path.is_empty() {
            options.pathspec(normalized_path);
        }
    }
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for (index, delta) in diff.deltas().enumerate() {
        let old_path = delta.old_file().path();
        let new_path = delta.new_file().path();
        let display_path = new_path.or(old_path);
        let Some(display_path) = display_path else {
            continue;
        };
        let old_path_str = old_path.map(|path| path.to_string_lossy());
        let new_path_str = new_path.map(|path| path.to_string_lossy());
        let display_path_str = display_path.to_string_lossy();
        let normalized_path = normalize_git_path(&display_path_str);
        let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
        let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
        let is_image = old_image_mime.is_some() || new_image_mime.is_some();

        if is_image {
            let is_deleted = delta.status() == git2::Delta::Deleted;
            let is_added = delta.status() == git2::Delta::Added;

            let old_image_data = if !is_added && old_image_mime.is_some() {
                parent_tree
                    .as_ref()
                    .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            let new_image_data = if !is_deleted && new_image_mime.is_some() {
                new_path
                    .and_then(|path| commit_tree.get_path(path).ok())
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            results.push(GitCommitDiff {
                path: normalized_path,
                status: status_for_delta(delta.status()).to_string(),
                diff: String::new(),
                is_binary: true,
                is_image: true,
                old_image_data,
                new_image_data,
                old_image_mime: old_image_mime.map(str::to_string),
                new_image_mime: new_image_mime.map(str::to_string),
            });
            continue;
        }

        let patch = match git2::Patch::from_diff(&diff, index) {
            Ok(patch) => patch,
            Err(_) => continue,
        };
        let Some(mut patch) = patch else {
            continue;
        };
        let content = match diff_patch_to_string(&mut patch) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if content.trim().is_empty() {
            continue;
        }
        results.push(GitCommitDiff {
            path: normalized_path,
            status: status_for_delta(delta.status()).to_string(),
            diff: content,
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes.iter().flatten().next().unwrap_or("").to_string()
    };
    if name.is_empty() {
        return Ok(None);
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    Ok(remote.url().map(|url| url.to_string()))
}

#[tauri::command]
pub(crate) async fn get_git_pr_workflow_defaults(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitPrWorkflowDefaults, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let head_branch = current_local_branch(&repo_root)?.unwrap_or_default();
    let upstream_repo = resolve_remote_repo(&repo, "upstream")
        .or_else(|| resolve_remote_repo(&repo, "origin"))
        .unwrap_or_default();
    let origin_repo = resolve_remote_repo(&repo, "origin");
    let tracked_upstream = upstream_remote_and_branch(&repo_root)?
        .filter(|(remote, _)| remote == "upstream" || remote == "origin")
        .map(|(_, branch)| branch);
    let base_branch = infer_remote_head_branch(&repo, "upstream")
        .or(tracked_upstream)
        .or_else(|| infer_remote_head_branch(&repo, "origin"))
        .unwrap_or_else(|| "main".to_string());
    let head_owner = origin_repo
        .as_ref()
        .and_then(|repo_name| parse_repo_owner(repo_name))
        .or_else(|| parse_repo_owner(&upstream_repo))
        .unwrap_or_default();
    let title = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok())
        .and_then(|commit| {
            commit
                .summary()
                .map(str::trim)
                .filter(|summary| !summary.is_empty())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| format!("chore(git): create pr for {head_branch}"));
    let body = default_pr_description(
        if base_branch.trim().is_empty() {
            "main"
        } else {
            &base_branch
        },
        if head_branch.trim().is_empty() {
            "HEAD"
        } else {
            &head_branch
        },
    );
    let comment_body = parse_repo_owner(&upstream_repo)
        .map(|owner| format!("@{owner} 麻烦审批，已完成验证。"))
        .unwrap_or_else(|| "@maintainer 麻烦审批，已完成验证。".to_string());

    let disabled_reason = if head_branch.trim().is_empty() {
        Some("Current branch is unavailable (detached HEAD or no local branch).".to_string())
    } else if upstream_repo.trim().is_empty() {
        Some("No GitHub remote detected. Configure upstream/origin remote first.".to_string())
    } else if head_owner.trim().is_empty() {
        Some("Cannot infer fork owner from origin remote URL.".to_string())
    } else {
        None
    };

    Ok(GitPrWorkflowDefaults {
        upstream_repo,
        base_branch,
        head_owner,
        head_branch,
        title,
        body,
        comment_body,
        can_create: disabled_reason.is_none(),
        disabled_reason,
    })
}

#[tauri::command]
pub(crate) async fn create_git_pr_workflow(
    workspace_id: String,
    upstream_repo: String,
    base_branch: String,
    head_owner: String,
    head_branch: String,
    title: String,
    body: Option<String>,
    comment_after_create: Option<bool>,
    comment_body: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitPrWorkflowResult, String> {
    commands_pr_workflow::create_git_pr_workflow_impl(
        workspace_id,
        upstream_repo,
        base_branch,
        head_owner,
        head_branch,
        title,
        body,
        comment_after_create,
        comment_body,
        state,
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssuesResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = crate::utils::async_command("gh")
        .args([
            "issue",
            "list",
            "--repo",
            &repo_name,
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let issues: Vec<GitHubIssue> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:issue is:open");
    let search_query = search_query.replace(' ', "+");
    let total = match crate::utils::async_command("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(issues.len()),
        _ => issues.len(),
    };

    Ok(GitHubIssuesResponse { total, issues })
}

#[tauri::command]
pub(crate) async fn get_github_pull_requests(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestsResponse, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = crate::utils::async_command("gh")
        .args([
            "pr",
            "list",
            "--repo",
            &repo_name,
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt,createdAt,body,headRefName,baseRefName,isDraft,author",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let pull_requests: Vec<GitHubPullRequest> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:pr is:open");
    let search_query = search_query.replace(' ', "+");
    let total = match crate::utils::async_command("gh")
        .args([
            "api",
            &format!("/search/issues?q={search_query}"),
            "--jq",
            ".total_count",
        ])
        .current_dir(&repo_root)
        .output()
        .await
    {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(pull_requests.len()),
        _ => pull_requests.len(),
    };

    Ok(GitHubPullRequestsResponse {
        total,
        pull_requests,
    })
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_diff(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let output = crate::utils::async_command("gh")
        .args([
            "pr",
            "diff",
            &pr_number.to_string(),
            "--repo",
            &repo_name,
            "--color",
            "never",
        ])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_pr_diff(&diff_text))
}

#[tauri::command]
pub(crate) async fn get_github_pull_request_comments(
    workspace_id: String,
    pr_number: u64,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubPullRequestComment>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let repo_name = github_repo_from_path(&repo_root)?;

    let comments_endpoint = format!("/repos/{repo_name}/issues/{pr_number}/comments?per_page=30");
    let jq_filter = r#"[.[] | {id, body, createdAt: .created_at, url: .html_url, author: (if .user then {login: .user.login} else null end)}]"#;

    let output = crate::utils::async_command("gh")
        .args(["api", &comments_endpoint, "--jq", jq_filter])
        .current_dir(&repo_root)
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("GitHub CLI command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let comments: Vec<GitHubPullRequestComment> =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    Ok(comments)
}

#[tauri::command]
pub(crate) async fn list_git_branches(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let current_branch = repo
        .head()
        .ok()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand().map(|name| name.to_string()));

    let mut legacy_branches = Vec::new();
    let mut local_branches = Vec::new();
    let refs = repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.to_string())?;
    for branch_result in refs {
        let (branch, _) = branch_result.map_err(|e| e.to_string())?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let last_commit = branch
            .get()
            .target()
            .and_then(|oid| repo.find_commit(oid).ok())
            .map(|commit| commit.time().seconds())
            .unwrap_or(0);
        let local_oid = branch.get().target();
        let mut ahead = 0usize;
        let mut behind = 0usize;
        let mut upstream: Option<String> = None;
        if let Ok(upstream_branch) = branch.upstream() {
            let upstream_ref = upstream_branch.get();
            upstream = upstream_ref
                .shorthand()
                .map(|name| name.to_string())
                .or_else(|| upstream_ref.name().map(|name| name.to_string()));
            if let (Some(local_oid), Some(upstream_oid)) = (local_oid, upstream_ref.target()) {
                if let Ok((ahead_count, behind_count)) =
                    repo.graph_ahead_behind(local_oid, upstream_oid)
                {
                    ahead = ahead_count;
                    behind = behind_count;
                }
            }
        }
        legacy_branches.push(BranchInfo {
            name: name.clone(),
            last_commit,
        });
        local_branches.push(GitBranchListItem {
            name: name.clone(),
            is_current: current_branch.as_deref() == Some(name.as_str()),
            is_remote: false,
            remote: None,
            last_commit,
            head_sha: local_oid.map(|oid| oid.to_string()),
            ahead,
            behind,
            upstream,
        });
    }
    legacy_branches.sort_by(|a, b| b.last_commit.cmp(&a.last_commit));
    local_branches.sort_by(|a, b| a.name.cmp(&b.name));

    let mut remote_branches = Vec::new();
    let remote_refs = repo
        .branches(Some(BranchType::Remote))
        .map_err(|e| e.to_string())?;
    for branch_result in remote_refs {
        let (branch, _) = branch_result.map_err(|e| e.to_string())?;
        let name = branch.name().ok().flatten().unwrap_or("").to_string();
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        let (remote, _) =
            parse_remote_branch(&name).unwrap_or_else(|| ("origin".to_string(), name.clone()));
        let last_commit = branch
            .get()
            .target()
            .and_then(|oid| repo.find_commit(oid).ok())
            .map(|commit| commit.time().seconds())
            .unwrap_or(0);
        remote_branches.push(GitBranchListItem {
            name,
            is_current: false,
            is_remote: true,
            remote: Some(remote),
            last_commit,
            head_sha: branch.get().target().map(|oid| oid.to_string()),
            ahead: 0,
            behind: 0,
            upstream: None,
        });
    }
    remote_branches.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(json!({
        "branches": legacy_branches,
        "localBranches": local_branches,
        "remoteBranches": remote_branches,
        "currentBranch": current_branch
    }))
}

fn has_uncommitted_changes(repo: &Repository) -> Result<bool, String> {
    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo
        .statuses(Some(&mut status_options))
        .map_err(|e| e.to_string())?;
    Ok(!statuses.is_empty())
}

fn ensure_checkout_precondition_clean(repo: &Repository) -> Result<(), String> {
    if has_uncommitted_changes(repo)? {
        return Err(
            "Working tree has uncommitted changes. Commit/stash/discard changes first.".to_string(),
        );
    }
    Ok(())
}

fn verify_checkout_postcondition(repo_root: &Path, expected_branch: &str) -> Result<(), String> {
    let expected_local_branch = normalize_local_branch_ref(expected_branch);
    let current_branch = current_local_branch(repo_root)?;
    let current_branch = current_branch.ok_or_else(|| {
        format!(
            "Checkout verification failed: expected current branch '{expected_local_branch}', but HEAD is detached."
        )
    })?;
    if current_branch != expected_local_branch {
        return Err(format!(
            "Checkout verification failed: expected current branch '{expected_local_branch}', but found '{current_branch}'."
        ));
    }

    let repo = open_repository_at_root(repo_root)?;
    if has_uncommitted_changes(&repo)? {
        return Err(
            "Working tree has uncommitted changes after checkout. Commit/stash/discard changes first."
                .to_string(),
        );
    }

    Ok(())
}

async fn checkout_existing_local_branch(repo_root: &Path, branch_name: &str) -> Result<(), String> {
    run_git_command(repo_root, &["checkout", branch_name]).await?;
    verify_checkout_postcondition(repo_root, branch_name)
}

async fn checkout_remote_branch_with_tracking(
    repo_root: &Path,
    remote_branch: &str,
    local_branch: &str,
) -> Result<(), String> {
    run_git_command(
        repo_root,
        &["checkout", "-b", local_branch, "--track", remote_branch],
    )
    .await?;
    verify_checkout_postcondition(repo_root, local_branch)
}

#[tauri::command]
pub(crate) async fn checkout_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }

    enum CheckoutTarget {
        ExistingLocal(String),
        CreateTrackingLocal {
            remote_branch: String,
            local_branch: String,
        },
        Missing,
    }

    let repo_root = resolve_git_root(&entry)?;
    let normalized_local_name = normalize_local_branch_ref(trimmed_name);
    let checkout_target = {
        let repo = open_repository_at_root(&repo_root)?;
        ensure_checkout_precondition_clean(&repo)?;

        if !normalized_local_name.is_empty()
            && repo
                .find_branch(normalized_local_name.as_str(), BranchType::Local)
                .is_ok()
        {
            CheckoutTarget::ExistingLocal(normalized_local_name)
        } else {
            let remote_ref = if trimmed_name.starts_with("refs/remotes/") {
                trimmed_name.to_string()
            } else {
                format!("refs/remotes/{trimmed_name}")
            };
            if repo.refname_to_id(&remote_ref).is_ok() {
                let local_name = trimmed_name.split('/').next_back().unwrap_or(trimmed_name);
                let valid_local_name = validate_local_branch_name(local_name)?;
                CheckoutTarget::CreateTrackingLocal {
                    remote_branch: trimmed_name.to_string(),
                    local_branch: valid_local_name,
                }
            } else {
                CheckoutTarget::Missing
            }
        }
    };

    match checkout_target {
        CheckoutTarget::ExistingLocal(local_branch) => {
            checkout_existing_local_branch(&repo_root, local_branch.as_str()).await
        }
        CheckoutTarget::CreateTrackingLocal {
            remote_branch,
            local_branch,
        } => {
            checkout_remote_branch_with_tracking(
                &repo_root,
                remote_branch.as_str(),
                local_branch.as_str(),
            )
            .await
        }
        CheckoutTarget::Missing => Err(format!("Branch not found: {trimmed_name}")),
    }
}

#[tauri::command]
pub(crate) async fn create_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let valid_name = validate_local_branch_name(&name)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let target = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&valid_name, &target, false)
        .map_err(|e| e.to_string())?;
    checkout_branch(&repo, &valid_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn create_git_branch_from_branch(
    workspace_id: String,
    name: String,
    source_branch: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let valid_name = validate_local_branch_name(&name)?;
    let source_name = source_branch.trim();
    if source_name.is_empty() {
        return Err("Source branch cannot be empty.".to_string());
    }

    let source_ref_candidates = if source_name.starts_with("refs/") {
        vec![source_name.to_string()]
    } else {
        vec![
            format!("refs/heads/{source_name}"),
            format!("refs/remotes/{source_name}"),
        ]
    };

    let mut target_commit = None;
    for source_ref in source_ref_candidates {
        if let Ok(reference) = repo.find_reference(&source_ref) {
            target_commit = Some(reference.peel_to_commit().map_err(|e| e.to_string())?);
            break;
        }
    }
    let target_commit =
        target_commit.ok_or_else(|| format!("Source branch not found: {source_name}"))?;

    repo.branch(&valid_name, &target_commit, false)
        .map_err(|e| e.to_string())?;
    checkout_branch(&repo, &valid_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn create_git_branch_from_commit(
    workspace_id: String,
    name: String,
    commit_hash: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let repo = open_repository_at_root(&repo_root)?;
    let valid_name = validate_local_branch_name(&name)?;
    let oid = Oid::from_str(commit_hash.trim()).map_err(|e| e.to_string())?;
    let target = repo.find_commit(oid).map_err(|e| e.to_string())?;
    repo.branch(&valid_name, &target, false)
        .map_err(|e| e.to_string())?;
    checkout_branch(&repo, &valid_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn delete_git_branch(
    workspace_id: String,
    name: String,
    force: Option<bool>,
    remove_occupied_worktree: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let branch_name = name.trim();
    if branch_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    let force_delete = force.unwrap_or(false);
    let remove_worktree_on_force = remove_occupied_worktree.unwrap_or(false);
    let flag = if force_delete { "-D" } else { "-d" };
    match run_git_command(&repo_root, &["branch", flag, branch_name]).await {
        Ok(()) => Ok(()),
        Err(delete_error) => {
            if !is_branch_used_by_worktree_error(&delete_error) {
                return Err(delete_error);
            }
            // Try once to clean stale worktree metadata, then retry delete.
            let _ = run_git_command(&repo_root, &["worktree", "prune"]).await;
            match run_git_command(&repo_root, &["branch", flag, branch_name]).await {
                Ok(()) => Ok(()),
                Err(retry_error) => {
                    if force_delete && remove_worktree_on_force {
                        if let Some(occupied_path) =
                            extract_worktree_path_from_delete_error(&retry_error)
                        {
                            let _ = run_git_command(
                                &repo_root,
                                &["worktree", "remove", "--force", occupied_path.as_str()],
                            )
                            .await;
                            if run_git_command(&repo_root, &["branch", flag, branch_name])
                                .await
                                .is_ok()
                            {
                                return Ok(());
                            }
                        }
                    }
                    if is_branch_used_by_worktree_error(&retry_error) {
                        Err(build_delete_branch_worktree_error(
                            branch_name,
                            &retry_error,
                        ))
                    } else {
                        Err(retry_error)
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn rename_git_branch(
    workspace_id: String,
    old_name: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let old_name = old_name.trim();
    let new_name = validate_local_branch_name(&new_name)?;
    if old_name.is_empty() {
        return Err("Old branch name cannot be empty.".to_string());
    }
    run_git_command(&repo_root, &["branch", "-m", old_name, &new_name]).await
}

#[tauri::command]
pub(crate) async fn merge_git_branch(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let branch_name = name.trim();
    if branch_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    run_git_command(&repo_root, &["merge", branch_name]).await
}

#[tauri::command]
pub(crate) async fn rebase_git_branch(
    workspace_id: String,
    onto_branch: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    let repo_root = resolve_git_root(&entry)?;
    let onto_branch_name = onto_branch.trim();
    if onto_branch_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    run_git_command(&repo_root, &["rebase", onto_branch_name]).await
}

#[tauri::command]
pub(crate) async fn get_git_branch_compare_commits(
    workspace_id: String,
    target_branch: String,
    current_branch: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitBranchCompareCommitSets, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let target_branch_name = target_branch.trim().to_string();
    if target_branch_name.is_empty() {
        return Err("Target branch name cannot be empty.".to_string());
    }
    let current_branch_name = current_branch.trim().to_string();
    if current_branch_name.is_empty() {
        return Err("Current branch name cannot be empty.".to_string());
    }
    if target_branch_name == current_branch_name {
        return Ok(GitBranchCompareCommitSets {
            target_only_commits: Vec::new(),
            current_only_commits: Vec::new(),
        });
    }
    let max_items = limit.unwrap_or(200).clamp(1, 500);

    tokio::task::spawn_blocking(move || -> Result<GitBranchCompareCommitSets, String> {
        let repo = open_repository_at_root(&repo_root)?;
        let refs_map = collect_commit_refs_map(&repo);
        let target_only_commits = collect_unique_commits(
            &repo,
            target_branch_name.as_str(),
            current_branch_name.as_str(),
            &refs_map,
            max_items,
        )?;
        let current_only_commits = collect_unique_commits(
            &repo,
            current_branch_name.as_str(),
            target_branch_name.as_str(),
            &refs_map,
            max_items,
        )?;
        Ok(GitBranchCompareCommitSets {
            target_only_commits,
            current_only_commits,
        })
    })
    .await
    .map_err(|error| format!("Failed to collect branch compare commits: {error}"))?
}

#[tauri::command]
pub(crate) async fn get_git_branch_diff_between_branches(
    workspace_id: String,
    from_branch: String,
    to_branch: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommitDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let from_branch_name = from_branch.trim().to_string();
    if from_branch_name.is_empty() {
        return Err("From branch name cannot be empty.".to_string());
    }
    let to_branch_name = to_branch.trim().to_string();
    if to_branch_name.is_empty() {
        return Err("To branch name cannot be empty.".to_string());
    }
    if from_branch_name == to_branch_name {
        return Ok(Vec::new());
    }

    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = crate::utils::async_command(git_bin)
        .args([
            "diff",
            "--name-status",
            "--find-renames",
            from_branch_name.as_str(),
            to_branch_name.as_str(),
        ])
        .current_dir(&repo_root)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("Git diff command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let mut results = Vec::new();
    for raw_line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let raw_status = parts.next().unwrap_or("").trim();
        if raw_status.is_empty() {
            continue;
        }
        let status = raw_status.chars().next().unwrap_or('M').to_string();
        let path = if raw_status.starts_with('R') || raw_status.starts_with('C') {
            parts.nth(1)
        } else {
            parts.next()
        };
        let Some(path) = path else {
            continue;
        };
        if path.trim().is_empty() {
            continue;
        }
        results.push(GitCommitDiff {
            path: normalize_git_path(path),
            status,
            diff: String::new(),
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub(crate) async fn get_git_branch_file_diff_between_branches(
    workspace_id: String,
    from_branch: String,
    to_branch: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitCommitDiff, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let from_branch_name = from_branch.trim().to_string();
    if from_branch_name.is_empty() {
        return Err("From branch name cannot be empty.".to_string());
    }
    let to_branch_name = to_branch.trim().to_string();
    if to_branch_name.is_empty() {
        return Err("To branch name cannot be empty.".to_string());
    }
    let normalized_path = normalize_git_path(&path);
    if normalized_path.trim().is_empty() {
        return Err("Path cannot be empty.".to_string());
    }

    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = crate::utils::async_command(git_bin)
        .args([
            "diff",
            "--no-color",
            "--find-renames",
            from_branch_name.as_str(),
            to_branch_name.as_str(),
            "--",
            normalized_path.as_str(),
        ])
        .current_dir(&repo_root)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("Git diff command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    let mut entries = parse_patch_diff_entries(&diff_text);
    if let Some(entry) = entries.pop() {
        return Ok(entry);
    }

    Ok(GitCommitDiff {
        path: normalized_path,
        status: "M".to_string(),
        diff: String::new(),
        is_binary: false,
        is_image: false,
        old_image_data: None,
        new_image_data: None,
        old_image_mime: None,
        new_image_mime: None,
    })
}

#[tauri::command]
pub(crate) async fn get_git_worktree_diff_against_branch(
    workspace_id: String,
    branch: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommitDiff>, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let branch_name = branch.trim().to_string();
    if branch_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }

    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = crate::utils::async_command(git_bin)
        .args([
            "diff",
            "--name-status",
            "--find-renames",
            branch_name.as_str(),
        ])
        .current_dir(&repo_root)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("Git diff command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let mut results = Vec::new();
    for raw_line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let raw_status = parts.next().unwrap_or("").trim();
        if raw_status.is_empty() {
            continue;
        }
        let status = raw_status.chars().next().unwrap_or('M').to_string();
        let path = if raw_status.starts_with('R') || raw_status.starts_with('C') {
            parts.nth(1)
        } else {
            parts.next()
        };
        let Some(path) = path else {
            continue;
        };
        if path.trim().is_empty() {
            continue;
        }
        results.push(GitCommitDiff {
            path: normalize_git_path(path),
            status,
            diff: String::new(),
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub(crate) async fn get_git_worktree_file_diff_against_branch(
    workspace_id: String,
    branch: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitCommitDiff, String> {
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let branch_name = branch.trim().to_string();
    if branch_name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    let normalized_path = normalize_git_path(&path);
    if normalized_path.trim().is_empty() {
        return Err("Path cannot be empty.".to_string());
    }

    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = crate::utils::async_command(git_bin)
        .args([
            "diff",
            "--no-color",
            "--find-renames",
            branch_name.as_str(),
            "--",
            normalized_path.as_str(),
        ])
        .current_dir(&repo_root)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            return Err("Git diff command failed.".to_string());
        }
        return Err(detail.to_string());
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    let mut entries = parse_patch_diff_entries(&diff_text);
    if let Some(entry) = entries.pop() {
        return Ok(entry);
    }

    Ok(GitCommitDiff {
        path: normalized_path,
        status: "M".to_string(),
        diff: String::new(),
        is_binary: false,
        is_image: false,
        old_image_data: None,
        new_image_data: None,
        old_image_mime: None,
        new_image_mime: None,
    })
}
