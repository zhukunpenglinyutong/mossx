use super::*;

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
