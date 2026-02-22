use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{BranchType, DiffOptions, Oid, Repository, Sort, Status, StatusOptions};
use serde::Deserialize;
use serde_json::json;
use tauri::State;
use tokio::time::{timeout, Duration};

use crate::git_utils::{
    checkout_branch, commit_to_entry, diff_patch_to_string, diff_stats_for_path, image_mime_type,
    list_git_roots as scan_git_roots, parse_github_repo, resolve_git_root,
};
use crate::state::AppState;
use crate::types::{
    BranchInfo, GitBranchCompareCommitSets, GitBranchListItem, GitCommitDetails, GitCommitDiff,
    GitCommitFileChange, GitFileDiff, GitFileStatus, GitHistoryCommit, GitHistoryResponse,
    GitHubIssue, GitHubIssuesResponse, GitHubPullRequest, GitHubPullRequestComment, GitHubPullRequestDiff,
    GitHubPullRequestsResponse, GitLogResponse, GitPrExistingPullRequest, GitPrWorkflowDefaults,
    GitPrWorkflowResult, GitPrWorkflowStage, GitPushPreviewResponse,
};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};
use validation::validate_local_branch_name;

mod validation;

const INDEX_SKIP_WORKTREE_FLAG: u16 = 0x4000;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_COMMIT_DIFF_LINES: usize = 10_000;
const GIT_COMMAND_TIMEOUT_SECS: u64 = 120;
const PR_RANGE_MAX_CHANGED_FILES: usize = 240;
const PR_RANGE_SUSPICIOUS_THRESHOLD: usize = 32;

fn trim_lowercase(input: Option<String>) -> Option<String> {
    input
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase())
}

fn trim_optional(input: Option<String>) -> Option<String> {
    input
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn is_branch_used_by_worktree_error(raw: &str) -> bool {
    let message = raw.to_lowercase();
    message.contains("cannot delete branch")
        && message.contains("used by worktree at")
}

fn extract_worktree_path_from_delete_error(raw: &str) -> Option<String> {
    let marker = "used by worktree at '";
    let start = raw.find(marker)?;
    let tail = &raw[start + marker.len()..];
    let end = tail.find('\'')?;
    let path = tail[..end].trim();
    if path.is_empty() {
        return None;
    }
    Some(path.to_string())
}

fn build_delete_branch_worktree_error(branch_name: &str, raw: &str) -> String {
    if let Some(path) = extract_worktree_path_from_delete_error(raw) {
        return format!(
            "Cannot delete branch '{branch_name}' because it is currently used by worktree at '{path}'. Switch that worktree to another branch or remove that worktree, then retry."
        );
    }
    format!(
        "Cannot delete branch '{branch_name}' because it is currently used by another worktree. Switch that worktree to another branch or remove that worktree, then retry."
    )
}

fn truncate_diff_lines(content: &str, max_lines: usize) -> (String, usize, bool) {
    if max_lines == 0 {
        return (String::new(), 0, false);
    }
    let mut lines = content.lines();
    let mut kept = Vec::new();
    let mut total = 0usize;
    let mut truncated = false;
    for line in lines.by_ref() {
        total += 1;
        if total <= max_lines {
            kept.push(line);
        } else {
            truncated = true;
        }
    }
    (kept.join("\n"), total, truncated || total > max_lines)
}

fn collect_commit_refs_map(repo: &Repository) -> HashMap<Oid, Vec<String>> {
    let mut map: HashMap<Oid, Vec<String>> = HashMap::new();
    let references = match repo.references() {
        Ok(references) => references,
        Err(_) => return map,
    };
    for reference in references.flatten() {
        let oid = match reference.target() {
            Some(oid) => oid,
            None => continue,
        };
        let name = reference
            .shorthand()
            .or_else(|| reference.name())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        map.entry(oid).or_default().push(name);
    }
    for values in map.values_mut() {
        values.sort();
        values.dedup();
    }
    map
}

fn open_repository_at_root(repo_root: &Path) -> Result<Repository, String> {
    Repository::open_ext(
        repo_root,
        git2::RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&Path>(),
    )
    .map_err(|e| e.to_string())
}

fn paginate_history_commits(
    commits: Vec<GitHistoryCommit>,
    offset: usize,
    limit: usize,
) -> (Vec<GitHistoryCommit>, usize, bool) {
    let total = commits.len();
    let page: Vec<GitHistoryCommit> = commits.into_iter().skip(offset).take(limit).collect();
    let has_more = offset.saturating_add(page.len()) < total;
    (page, total, has_more)
}

fn resolve_ref_to_oid(repo: &Repository, reference: &str) -> Result<Oid, String> {
    let trimmed = reference.trim();
    if trimmed.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    let local_ref = format!("refs/heads/{trimmed}");
    if let Ok(oid) = repo.refname_to_id(&local_ref) {
        return Ok(oid);
    }
    let remote_ref = format!("refs/remotes/{trimmed}");
    if let Ok(oid) = repo.refname_to_id(&remote_ref) {
        return Ok(oid);
    }
    repo.revparse_single(trimmed)
        .map(|object| object.id())
        .map_err(|_| format!("Branch or ref not found: {trimmed}"))
}

fn commit_to_history_commit(
    commit: &git2::Commit<'_>,
    refs_map: &HashMap<Oid, Vec<String>>,
) -> GitHistoryCommit {
    let oid = commit.id();
    let sha = oid.to_string();
    let short_sha: String = sha.chars().take(7).collect();
    let summary = commit.summary().unwrap_or("").to_string();
    let message = commit.message().unwrap_or("").to_string();
    let author = commit.author().name().unwrap_or("").to_string();
    let author_email = commit.author().email().unwrap_or("").to_string();
    let timestamp = commit.time().seconds();
    let parents = commit
        .parents()
        .map(|parent| parent.id().to_string())
        .collect();
    let refs = refs_map.get(&oid).cloned().unwrap_or_default();
    GitHistoryCommit {
        sha,
        short_sha,
        summary,
        message,
        author,
        author_email,
        timestamp,
        parents,
        refs,
    }
}

fn collect_unique_commits(
    repo: &Repository,
    include_ref: &str,
    exclude_ref: &str,
    refs_map: &HashMap<Oid, Vec<String>>,
    limit: usize,
) -> Result<Vec<GitHistoryCommit>, String> {
    let include_oid = resolve_ref_to_oid(repo, include_ref)?;
    let exclude_oid = resolve_ref_to_oid(repo, exclude_ref)?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.to_string())?;
    revwalk.push(include_oid).map_err(|e| e.to_string())?;
    revwalk.hide(exclude_oid).map_err(|e| e.to_string())?;

    let mut commits = Vec::new();
    for oid_result in revwalk.take(limit) {
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        commits.push(commit_to_history_commit(&commit, refs_map));
    }
    Ok(commits)
}

fn parse_remote_branch(name: &str) -> Option<(String, String)> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_prefix = trimmed
        .strip_prefix("refs/remotes/")
        .or_else(|| trimmed.strip_prefix("remotes/"))
        .unwrap_or(trimmed);
    let mut parts = without_prefix.splitn(2, '/');
    let remote = parts.next()?.trim();
    let branch = parts.next()?.trim();
    if remote.is_empty() || branch.is_empty() {
        return None;
    }
    Some((remote.to_string(), branch.to_string()))
}

fn encode_image_base64(data: &[u8]) -> Option<String> {
    if data.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some(STANDARD.encode(data))
}

fn blob_to_base64(blob: git2::Blob) -> Option<String> {
    if blob.size() > MAX_IMAGE_BYTES {
        return None;
    }
    encode_image_base64(blob.content())
}

fn read_image_base64(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return None;
    }
    let data = fs::read(path).ok()?;
    encode_image_base64(&data)
}

async fn run_git_command(repo_root: &Path, args: &[&str]) -> Result<(), String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut command = crate::utils::async_command(git_bin);
    command
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        // Force non-interactive git in GUI context so pull/fetch does not hang on hidden prompts.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = match timeout(
        Duration::from_secs(GIT_COMMAND_TIMEOUT_SECS),
        command.output(),
    )
    .await
    {
        Ok(result) => result.map_err(|e| format!("Failed to run git: {e}"))?,
        Err(_) => {
            let command_name = args.join(" ");
            return Err(format!(
                "Git command timed out after {GIT_COMMAND_TIMEOUT_SECS}s: git {command_name}. Check network/authentication and retry."
            ));
        }
    };

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        return Err("Git command failed.".to_string());
    }
    Err(detail.to_string())
}

fn action_paths_for_file(repo_root: &Path, path: &str) -> Vec<String> {
    let target = normalize_git_path(path).trim().to_string();
    if target.is_empty() {
        return Vec::new();
    }

    let repo = match open_repository_at_root(repo_root) {
        Ok(repo) => repo,
        Err(_) => return vec![target],
    };

    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = match repo.statuses(Some(&mut status_options)) {
        Ok(statuses) => statuses,
        Err(_) => return vec![target],
    };

    for entry in statuses.iter() {
        let status = entry.status();
        if !(status.contains(Status::WT_RENAMED) || status.contains(Status::INDEX_RENAMED)) {
            continue;
        }
        let delta = entry.index_to_workdir().or_else(|| entry.head_to_index());
        let Some(delta) = delta else {
            continue;
        };
        let (Some(old_path), Some(new_path)) = (delta.old_file().path(), delta.new_file().path())
        else {
            continue;
        };
        let old_path = normalize_git_path(old_path.to_string_lossy().as_ref());
        let new_path = normalize_git_path(new_path.to_string_lossy().as_ref());
        if old_path != target && new_path != target {
            continue;
        }
        if old_path == new_path || new_path.is_empty() {
            return vec![target];
        }
        let mut result = Vec::new();
        if !old_path.is_empty() {
            result.push(old_path);
        }
        if !new_path.is_empty() && !result.contains(&new_path) {
            result.push(new_path);
        }
        return if result.is_empty() {
            vec![target]
        } else {
            result
        };
    }

    vec![target]
}

fn parse_upstream_ref(name: &str) -> Option<(String, String)> {
    let trimmed = name.strip_prefix("refs/remotes/").unwrap_or(name);
    let mut parts = trimmed.splitn(2, '/');
    let remote = parts.next()?;
    let branch = parts.next()?;
    if remote.is_empty() || branch.is_empty() {
        return None;
    }
    Some((remote.to_string(), branch.to_string()))
}

fn normalize_local_branch_ref(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("refs/heads/")
        .trim()
        .to_string()
}

fn normalize_remote_target_branch(remote: &str, raw: &str) -> String {
    let trimmed = raw.trim();
    let without_refs = trimmed
        .strip_prefix("refs/remotes/")
        .or_else(|| trimmed.strip_prefix("remotes/"))
        .unwrap_or(trimmed);
    let remote_prefix = format!("{remote}/");
    without_refs
        .strip_prefix(&remote_prefix)
        .unwrap_or(without_refs)
        .trim()
        .to_string()
}

fn upstream_remote_and_branch(repo_root: &Path) -> Result<Option<(String, String)>, String> {
    let repo = open_repository_at_root(repo_root)?;
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(None),
    };
    if !head.is_branch() {
        return Ok(None);
    }
    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return Ok(None),
    };
    let branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|e| e.to_string())?;
    let upstream_branch = match branch.upstream() {
        Ok(upstream) => upstream,
        Err(_) => return Ok(None),
    };
    let upstream_ref = upstream_branch.get();
    let upstream_name = upstream_ref.name().or_else(|| upstream_ref.shorthand());
    Ok(upstream_name.and_then(parse_upstream_ref))
}

fn current_local_branch(repo_root: &Path) -> Result<Option<String>, String> {
    let repo = open_repository_at_root(repo_root)?;
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(None),
    };
    if !head.is_branch() {
        return Ok(None);
    }
    Ok(head
        .shorthand()
        .map(normalize_local_branch_ref)
        .filter(|name| !name.is_empty()))
}

fn split_csv_values(input: Option<String>) -> Vec<String> {
    trim_optional(input)
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn build_gerrit_push_suffix(
    topic: Option<String>,
    reviewers: Option<String>,
    cc: Option<String>,
) -> String {
    let mut params = Vec::new();
    if let Some(topic_name) = trim_optional(topic) {
        params.push(format!("topic={topic_name}"));
    }
    for reviewer in split_csv_values(reviewers) {
        params.push(format!("r={reviewer}"));
    }
    for cc_member in split_csv_values(cc) {
        params.push(format!("cc={cc_member}"));
    }
    params.join(",")
}

async fn push_with_upstream(repo_root: &Path) -> Result<(), String> {
    let upstream = upstream_remote_and_branch(repo_root)?;
    if let Some((remote, branch)) = upstream {
        let refspec = format!("HEAD:{branch}");
        return run_git_command(repo_root, &["push", remote.as_str(), refspec.as_str()]).await;
    }
    run_git_command(repo_root, &["push"]).await
}

async fn push_with_options(
    repo_root: &Path,
    remote: Option<String>,
    branch: Option<String>,
    force_with_lease: bool,
    push_tags: bool,
    run_hooks: bool,
    push_to_gerrit: bool,
    topic: Option<String>,
    reviewers: Option<String>,
    cc: Option<String>,
) -> Result<(), String> {
    let mut args = vec!["push".to_string()];
    if !run_hooks {
        args.push("--no-verify".to_string());
    }
    if force_with_lease {
        args.push("--force-with-lease".to_string());
    }
    if push_tags {
        args.push("--follow-tags".to_string());
    }

    let explicit_remote = trim_optional(remote);
    let explicit_branch = trim_optional(branch)
        .map(|value| normalize_local_branch_ref(&value))
        .filter(|value| !value.is_empty());
    let current_branch = current_local_branch(repo_root)?;
    let target_branch = explicit_branch.or(current_branch);

    if push_to_gerrit {
        let target_remote = explicit_remote
            .or_else(|| {
                upstream_remote_and_branch(repo_root)
                    .ok()
                    .flatten()
                    .map(|(name, _)| name)
            })
            .unwrap_or_else(|| "origin".to_string());
        let target_branch =
            target_branch.ok_or_else(|| "Branch is required for Gerrit push.".to_string())?;

        let mut refspec = format!("HEAD:refs/for/{target_branch}");
        let suffix = build_gerrit_push_suffix(topic, reviewers, cc);
        if !suffix.is_empty() {
            refspec.push('%');
            refspec.push_str(&suffix);
        }
        args.push(target_remote);
        args.push(refspec);
        let command: Vec<&str> = args.iter().map(String::as_str).collect();
        return run_git_command(repo_root, &command).await;
    }

    if explicit_remote.is_none() && target_branch.is_none() {
        if !force_with_lease && !push_tags && run_hooks {
            return push_with_upstream(repo_root).await;
        }
        let command: Vec<&str> = args.iter().map(String::as_str).collect();
        return run_git_command(repo_root, &command).await;
    }

    let target_remote = explicit_remote
        .or_else(|| {
            upstream_remote_and_branch(repo_root)
                .ok()
                .flatten()
                .map(|(name, _)| name)
        })
        .unwrap_or_else(|| "origin".to_string());
    args.push(target_remote);
    if let Some(target_branch) = target_branch {
        args.push(format!("HEAD:{target_branch}"));
    }

    let command: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git_command(repo_root, &command).await
}

fn status_for_index(status: Status) -> Option<&'static str> {
    if status.contains(Status::INDEX_NEW) {
        Some("A")
    } else if status.contains(Status::INDEX_MODIFIED) {
        Some("M")
    } else if status.contains(Status::INDEX_DELETED) {
        Some("D")
    } else if status.contains(Status::INDEX_RENAMED) {
        Some("R")
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_workdir(status: Status) -> Option<&'static str> {
    if status.contains(Status::WT_NEW) {
        Some("A")
    } else if status.contains(Status::WT_MODIFIED) {
        Some("M")
    } else if status.contains(Status::WT_DELETED) {
        Some("D")
    } else if status.contains(Status::WT_RENAMED) {
        Some("R")
    } else if status.contains(Status::WT_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_delta(status: git2::Delta) -> &'static str {
    match status {
        git2::Delta::Added => "A",
        git2::Delta::Modified => "M",
        git2::Delta::Deleted => "D",
        git2::Delta::Renamed => "R",
        git2::Delta::Typechange => "T",
        _ => "M",
    }
}

fn build_combined_diff(diff: &git2::Diff) -> String {
    let mut combined_diff = String::new();
    for (index, delta) in diff.deltas().enumerate() {
        let path = delta.new_file().path().or_else(|| delta.old_file().path());
        let Some(path) = path else {
            continue;
        };
        let patch = match git2::Patch::from_diff(diff, index) {
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
        if !combined_diff.is_empty() {
            combined_diff.push_str("\n\n");
        }
        combined_diff.push_str(&format!("=== {} ===\n", path.display()));
        combined_diff.push_str(&content);
    }
    combined_diff
}

fn collect_workspace_diff(repo_root: &Path) -> Result<String, String> {
    let repo = open_repository_at_root(repo_root)?;
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

    let mut options = DiffOptions::new();
    let index = repo.index().map_err(|e| e.to_string())?;
    let diff = match head_tree.as_ref() {
        Some(tree) => repo
            .diff_tree_to_index(Some(tree), Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
        None => repo
            .diff_tree_to_index(None, Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
    };
    let combined_diff = build_combined_diff(&diff);
    if !combined_diff.trim().is_empty() {
        return Ok(combined_diff);
    }

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
    Ok(build_combined_diff(&diff))
}

fn github_repo_from_path(path: &Path) -> Result<String, String> {
    let repo = open_repository_at_root(path)?;
    let remotes = repo.remotes().map_err(|e| e.to_string())?;
    let name = if remotes.iter().any(|remote| remote == Some("origin")) {
        "origin".to_string()
    } else {
        remotes.iter().flatten().next().unwrap_or("").to_string()
    };
    if name.is_empty() {
        return Err("No git remote configured.".to_string());
    }
    let remote = repo.find_remote(&name).map_err(|e| e.to_string())?;
    let remote_url = remote.url().ok_or("Remote has no URL configured.")?;
    parse_github_repo(remote_url).ok_or("Remote is not a GitHub repository.".to_string())
}

fn parse_patch_diff_entries(diff: &str) -> Vec<GitCommitDiff> {
    let mut entries = Vec::new();
    let mut current_lines: Vec<&str> = Vec::new();
    let mut current_old_path: Option<String> = None;
    let mut current_new_path: Option<String> = None;
    let mut current_status: Option<String> = None;

    let finalize = |lines: &Vec<&str>,
                    old_path: &Option<String>,
                    new_path: &Option<String>,
                    status: &Option<String>,
                    results: &mut Vec<GitCommitDiff>| {
        if lines.is_empty() {
            return;
        }
        let diff_text = lines.join("\n");
        if diff_text.trim().is_empty() {
            return;
        }
        let status_value = status.clone().unwrap_or_else(|| "M".to_string());
        let path = if status_value == "D" {
            old_path.clone().unwrap_or_default()
        } else {
            new_path
                .clone()
                .or_else(|| old_path.clone())
                .unwrap_or_default()
        };
        if path.is_empty() {
            return;
        }
        results.push(GitCommitDiff {
            path: normalize_git_path(&path),
            status: status_value,
            diff: diff_text,
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    };

    for line in diff.lines() {
        if line.starts_with("diff --git ") {
            finalize(
                &current_lines,
                &current_old_path,
                &current_new_path,
                &current_status,
                &mut entries,
            );
            current_lines = vec![line];
            current_old_path = None;
            current_new_path = None;
            current_status = None;

            let rest = line.trim_start_matches("diff --git ").trim();
            let mut parts = rest.split_whitespace();
            let old_part = parts.next().unwrap_or("").trim_start_matches("a/");
            let new_part = parts.next().unwrap_or("").trim_start_matches("b/");
            if !old_part.is_empty() {
                current_old_path = Some(old_part.to_string());
            }
            if !new_part.is_empty() {
                current_new_path = Some(new_part.to_string());
            }
            continue;
        }
        if line.starts_with("new file mode ") {
            current_status = Some("A".to_string());
        } else if line.starts_with("deleted file mode ") {
            current_status = Some("D".to_string());
        } else if line.starts_with("rename from ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename from ").trim();
            if !path.is_empty() {
                current_old_path = Some(path.to_string());
            }
        } else if line.starts_with("rename to ") {
            current_status = Some("R".to_string());
            let path = line.trim_start_matches("rename to ").trim();
            if !path.is_empty() {
                current_new_path = Some(path.to_string());
            }
        }
        current_lines.push(line);
    }

    finalize(
        &current_lines,
        &current_old_path,
        &current_new_path,
        &current_status,
        &mut entries,
    );

    entries
}

fn parse_pr_diff(diff: &str) -> Vec<GitHubPullRequestDiff> {
    parse_patch_diff_entries(diff)
        .into_iter()
        .map(|entry| GitHubPullRequestDiff {
            path: entry.path,
            status: entry.status,
            diff: entry.diff,
        })
        .collect()
}

#[derive(Debug)]
struct TokenIsolatedCommandOutput {
    success: bool,
    command: String,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Deserialize)]
struct GhExistingPrEntry {
    number: u64,
    title: String,
    url: String,
    state: String,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    #[serde(rename = "baseRefName")]
    base_ref_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PrRangeGateDecision {
    Pass { changed_files: usize },
    Blocked { category: String, reason: String },
}

fn shell_escape_for_display(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '_' | '-' | '.' | ':' | '@' | '='))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn build_token_isolated_command_display(program: &str, args: &[String]) -> String {
    let mut rendered = vec!["env -u GH_TOKEN -u GITHUB_TOKEN".to_string()];
    rendered.push(shell_escape_for_display(program));
    rendered.extend(args.iter().map(|value| shell_escape_for_display(value)));
    rendered.join(" ")
}

fn summarize_command_failure(output: &TokenIsolatedCommandOutput) -> String {
    let stderr = output.stderr.trim();
    if !stderr.is_empty() {
        return stderr.to_string();
    }
    let stdout = output.stdout.trim();
    if !stdout.is_empty() {
        return stdout.to_string();
    }
    "Command failed without stderr/stdout output.".to_string()
}

fn truncate_debug_text(raw: &str, max_len: usize) -> String {
    if raw.chars().count() <= max_len {
        return raw.to_string();
    }
    raw.chars().take(max_len).collect::<String>() + " ...[truncated]"
}

async fn run_token_isolated_command(
    repo_root: &Path,
    program: &str,
    args: &[String],
    extra_env: &[(&str, &str)],
) -> Result<TokenIsolatedCommandOutput, String> {
    let mut command = if program == "git" {
        crate::utils::async_command(resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?)
    } else {
        crate::utils::async_command(program)
    };
    command
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .env_remove("GH_TOKEN")
        .env_remove("GITHUB_TOKEN")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in extra_env {
        command.env(key, value);
    }

    let output = match timeout(
        Duration::from_secs(GIT_COMMAND_TIMEOUT_SECS),
        command.output(),
    )
    .await
    {
        Ok(result) => result.map_err(|error| {
            if program == "gh" {
                format!("Failed to run gh command: {error}. Ensure GitHub CLI (gh) is installed.")
            } else {
                format!("Failed to run {program} command: {error}")
            }
        })?,
        Err(_) => {
            return Err(format!(
                "Command timed out after {GIT_COMMAND_TIMEOUT_SECS}s: {}",
                build_token_isolated_command_display(program, args)
            ));
        }
    };

    Ok(TokenIsolatedCommandOutput {
        success: output.status.success(),
        command: build_token_isolated_command_display(program, args),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

fn is_http2_transport_error(raw: &str) -> bool {
    let normalized = raw.to_lowercase();
    normalized.contains("http2 framing layer")
        || normalized.contains("http/2 stream")
        || normalized.contains("stream 0 was not closed cleanly")
}

fn is_auth_related_error(raw: &str) -> bool {
    let normalized = raw.to_lowercase();
    normalized.contains("403")
        || normalized.contains("authentication failed")
        || normalized.contains("permission denied")
        || normalized.contains("resource not accessible by personal access token")
        || normalized.contains("requires authentication")
        || normalized.contains("not logged into any github hosts")
}

fn is_network_related_error(raw: &str) -> bool {
    let normalized = raw.to_lowercase();
    normalized.contains("failed to connect")
        || normalized.contains("could not resolve host")
        || normalized.contains("timed out")
        || normalized.contains("connection reset")
        || normalized.contains("network is unreachable")
}

fn parse_repo_owner(repo: &str) -> Option<String> {
    repo.split('/').next().map(str::trim).filter(|value| !value.is_empty()).map(ToOwned::to_owned)
}

fn resolve_remote_repo(repo: &Repository, remote_name: &str) -> Option<String> {
    let remote = repo.find_remote(remote_name).ok()?;
    let remote_url = remote.url()?;
    parse_github_repo(remote_url)
}

fn infer_remote_head_branch(repo: &Repository, remote_name: &str) -> Option<String> {
    let head_ref = format!("refs/remotes/{remote_name}/HEAD");
    let reference = repo.find_reference(&head_ref).ok()?;
    let symbolic_target = reference.symbolic_target()?;
    let prefix = format!("refs/remotes/{remote_name}/");
    symbolic_target
        .strip_prefix(prefix.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn default_pr_description(base_branch: &str, head_branch: &str) -> String {
    format!(
        "## 背景\n- 从 `{base_branch}` 合并到 `{head_branch}`。\n\n## 改动点\n- \n\n## 验证\n- [ ] npm run typecheck\n- [ ] npm run lint"
    )
}

fn build_workflow_stages() -> Vec<GitPrWorkflowStage> {
    vec![
        GitPrWorkflowStage {
            key: "precheck".to_string(),
            status: "pending".to_string(),
            detail: "Waiting for precheck.".to_string(),
            command: None,
            stdout: None,
            stderr: None,
        },
        GitPrWorkflowStage {
            key: "push".to_string(),
            status: "pending".to_string(),
            detail: "Waiting for push.".to_string(),
            command: None,
            stdout: None,
            stderr: None,
        },
        GitPrWorkflowStage {
            key: "create".to_string(),
            status: "pending".to_string(),
            detail: "Waiting for PR creation.".to_string(),
            command: None,
            stdout: None,
            stderr: None,
        },
        GitPrWorkflowStage {
            key: "comment".to_string(),
            status: "pending".to_string(),
            detail: "Waiting for optional comment.".to_string(),
            command: None,
            stdout: None,
            stderr: None,
        },
    ]
}

fn update_workflow_stage(
    stages: &mut [GitPrWorkflowStage],
    key: &str,
    status: &str,
    detail: String,
    command: Option<String>,
    stdout: Option<String>,
    stderr: Option<String>,
) {
    if let Some(stage) = stages.iter_mut().find(|entry| entry.key == key) {
        stage.status = status.to_string();
        stage.detail = detail;
        stage.command = command;
        stage.stdout = stdout;
        stage.stderr = stderr;
    }
}

fn stage_error_category_and_hint(stage_key: &str, raw: &str) -> (String, String) {
    if stage_key == "precheck" {
        if raw.to_lowercase().contains("gh") && raw.to_lowercase().contains("not found") {
            return (
                "gh-not-installed".to_string(),
                "Install GitHub CLI and run `gh auth login` first.".to_string(),
            );
        }
        if is_auth_related_error(raw) {
            return (
                "gh-auth-missing".to_string(),
                "Run `env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com` and finish login.".to_string(),
            );
        }
        if raw.to_lowercase().contains("range gate") {
            return (
                "range-abnormal".to_string(),
                "Review changed files against upstream base, then re-run after rebasing/fixing scope.".to_string(),
            );
        }
    }
    if stage_key == "push" {
        if is_http2_transport_error(raw) {
            return (
                "push-http2".to_string(),
                "Retry with HTTP/1.1 fallback: `git -c http.version=HTTP/1.1 push ...`.".to_string(),
            );
        }
        if is_auth_related_error(raw) {
            return (
                "push-auth".to_string(),
                "Verify fork push permission and run with token-isolated env (`env -u GH_TOKEN -u GITHUB_TOKEN`).".to_string(),
            );
        }
        if is_network_related_error(raw) {
            return (
                "push-network".to_string(),
                "Check network/proxy connectivity to github.com:443, then retry.".to_string(),
            );
        }
    }
    if stage_key == "create" {
        if is_auth_related_error(raw) {
            return (
                "create-pr-auth".to_string(),
                "Use `env -u GH_TOKEN -u GITHUB_TOKEN` and ensure `gh auth status` is healthy.".to_string(),
            );
        }
        if is_network_related_error(raw) {
            return (
                "create-pr-network".to_string(),
                "Network seems unstable. Retry once after validating GitHub connectivity.".to_string(),
            );
        }
    }
    ("unknown".to_string(), "Check stage stderr and retry.".to_string())
}

fn extract_pr_url(raw: &str) -> Option<String> {
    raw.split_whitespace()
        .find(|token| token.starts_with("https://") && token.contains("/pull/"))
        .map(|token| {
            token
                .trim()
                .trim_matches('\'')
                .trim_matches('"')
                .trim_end_matches('.')
                .to_string()
        })
}

fn extract_pr_number_from_url(url: &str) -> Option<u64> {
    let pull_segment = url.split("/pull/").nth(1)?;
    let number_text = pull_segment
        .split(['/', '?', '#'])
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    number_text.parse::<u64>().ok()
}

fn is_suspicious_range_path(path: &str) -> bool {
    let normalized = normalize_git_path(path).to_lowercase();
    normalized == "readme.md" || normalized == "readme.zh-cn.md" || normalized == "license"
}

fn evaluate_pr_range_gate(changed_paths: &[String]) -> PrRangeGateDecision {
    if changed_paths.is_empty() {
        return PrRangeGateDecision::Blocked {
            category: "range-empty".to_string(),
            reason: "Range gate blocked: `upstream/<base>...HEAD` has no changed files.".to_string(),
        };
    }
    if changed_paths.len() > PR_RANGE_MAX_CHANGED_FILES {
        return PrRangeGateDecision::Blocked {
            category: "range-too-large".to_string(),
            reason: format!(
                "Range gate blocked: {} changed files exceed threshold {}.",
                changed_paths.len(),
                PR_RANGE_MAX_CHANGED_FILES
            ),
        };
    }
    let suspicious_files = changed_paths
        .iter()
        .filter(|path| is_suspicious_range_path(path))
        .cloned()
        .collect::<Vec<_>>();
    if !suspicious_files.is_empty() && changed_paths.len() >= PR_RANGE_SUSPICIOUS_THRESHOLD {
        return PrRangeGateDecision::Blocked {
            category: "range-suspicious".to_string(),
            reason: format!(
                "Range gate blocked: suspicious root files detected ({}). Re-check branch base before creating PR.",
                suspicious_files.join(", ")
            ),
        };
    }
    PrRangeGateDecision::Pass {
        changed_files: changed_paths.len(),
    }
}

fn build_failed_pr_workflow_result(
    stages: Vec<GitPrWorkflowStage>,
    stage_key: &str,
    raw_error: String,
    retry_command: Option<String>,
) -> GitPrWorkflowResult {
    let (category, hint) = stage_error_category_and_hint(stage_key, &raw_error);
    GitPrWorkflowResult {
        ok: false,
        status: "failed".to_string(),
        message: raw_error,
        error_category: Some(category),
        next_action_hint: Some(hint),
        pr_url: None,
        pr_number: None,
        existing_pr: None,
        retry_command,
        stages,
    }
}

fn build_existing_pr_workflow_result(
    stages: Vec<GitPrWorkflowStage>,
    existing_pr: GitPrExistingPullRequest,
) -> GitPrWorkflowResult {
    GitPrWorkflowResult {
        ok: true,
        status: "existing".to_string(),
        message: format!(
            "Existing PR detected: #{} {}",
            existing_pr.number, existing_pr.title
        ),
        error_category: None,
        next_action_hint: Some("Open the existing PR and continue updates on the same branch.".to_string()),
        pr_url: Some(existing_pr.url.clone()),
        pr_number: Some(existing_pr.number),
        existing_pr: Some(existing_pr),
        retry_command: None,
        stages,
    }
}

fn build_success_pr_workflow_result(
    stages: Vec<GitPrWorkflowStage>,
    pr_url: String,
    pr_number: Option<u64>,
    message: String,
) -> GitPrWorkflowResult {
    GitPrWorkflowResult {
        ok: true,
        status: "success".to_string(),
        message,
        error_category: None,
        next_action_hint: None,
        pr_url: Some(pr_url),
        pr_number,
        existing_pr: None,
        retry_command: None,
        stages,
    }
}
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
        let mut combined_additions = 0i64;
        let mut combined_deletions = 0i64;

        if include_index {
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, true, false).unwrap_or((0, 0));
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
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, false, true).unwrap_or((0, 0));
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
            results.push(GitFileDiff {
                path: normalized_path,
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
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();

    let repo_root = resolve_git_root(&entry)?;
    let normalized_path = normalize_git_path(&path);
    let full_diff = {
        let args = [
            "diff",
            "HEAD",
            "--unified=999999",
            "--",
            normalized_path.as_str(),
        ];
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
        let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

        let mut options = DiffOptions::new();
        options
            .pathspec(&normalized_path)
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true)
            .context_lines(200_000)
            .interhunk_lines(200_000);

        let diff = match head_tree.as_ref() {
            Some(tree) => repo
                .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                .map_err(|e| e.to_string())?,
            None => repo
                .diff_tree_to_workdir_with_index(None, Some(&mut options))
                .map_err(|e| e.to_string())?,
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
    let workspaces = state.workspaces.lock().await;
    let entry = workspaces
        .get(&workspace_id)
        .ok_or("workspace not found")?
        .clone();
    drop(workspaces);

    let repo_root = resolve_git_root(&entry)?;
    let upstream_repo = upstream_repo.trim().to_string();
    let base_branch = base_branch.trim().to_string();
    let head_owner = head_owner.trim().to_string();
    let head_branch = head_branch.trim().to_string();
    let title = title.trim().to_string();
    let body = body.unwrap_or_default();
    let comment_enabled = comment_after_create.unwrap_or(false);
    let comment_text = comment_body.unwrap_or_default();
    let mut stages = build_workflow_stages();

    if upstream_repo.is_empty()
        || base_branch.is_empty()
        || head_owner.is_empty()
        || head_branch.is_empty()
        || title.is_empty()
    {
        let reason = "Missing required PR parameters (upstream/base/head/title).".to_string();
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            reason.clone(),
            None,
            None,
            None,
        );
        return Ok(build_failed_pr_workflow_result(
            stages,
            "precheck",
            reason,
            None,
        ));
    }

    update_workflow_stage(
        &mut stages,
        "precheck",
        "running",
        "Checking GitHub CLI readiness and PR range gate.".to_string(),
        None,
        None,
        None,
    );
    let gh_version_args = vec!["--version".to_string()];
    let gh_version_output = match run_token_isolated_command(&repo_root, "gh", &gh_version_args, &[]).await
    {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(stages, "precheck", error, None));
        }
    };
    if !gh_version_output.success {
        let raw = summarize_command_failure(&gh_version_output);
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            raw.clone(),
            Some(gh_version_output.command),
            Some(truncate_debug_text(&gh_version_output.stdout, 1200)),
            Some(truncate_debug_text(&gh_version_output.stderr, 1200)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "precheck", raw, None));
    }

    let gh_auth_args = vec![
        "auth".to_string(),
        "status".to_string(),
        "-h".to_string(),
        "github.com".to_string(),
    ];
    let gh_auth_output = match run_token_isolated_command(&repo_root, "gh", &gh_auth_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(stages, "precheck", error, None));
        }
    };
    if !gh_auth_output.success {
        let raw = summarize_command_failure(&gh_auth_output);
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            raw.clone(),
            Some(gh_auth_output.command),
            Some(truncate_debug_text(&gh_auth_output.stdout, 1200)),
            Some(truncate_debug_text(&gh_auth_output.stderr, 1200)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "precheck", raw, None));
    }

    let repo = open_repository_at_root(&repo_root)?;
    if repo.find_remote("upstream").is_err() {
        let raw =
            "Range gate requires remote `upstream`. Add it first, then retry PR workflow."
                .to_string();
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            raw.clone(),
            None,
            None,
            None,
        );
        return Ok(build_failed_pr_workflow_result(stages, "precheck", raw, None));
    }

    let fetch_args = vec![
        "fetch".to_string(),
        "upstream".to_string(),
        base_branch.clone(),
    ];
    let fetch_output = match run_token_isolated_command(&repo_root, "git", &fetch_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(stages, "precheck", error, None));
        }
    };
    if !fetch_output.success {
        let raw = summarize_command_failure(&fetch_output);
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            raw.clone(),
            Some(fetch_output.command),
            Some(truncate_debug_text(&fetch_output.stdout, 1500)),
            Some(truncate_debug_text(&fetch_output.stderr, 1500)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "precheck", raw, None));
    }

    let range_ref = format!("upstream/{base_branch}...HEAD");
    let range_args = vec![
        "diff".to_string(),
        "--name-only".to_string(),
        range_ref.clone(),
    ];
    let range_output = match run_token_isolated_command(&repo_root, "git", &range_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(stages, "precheck", error, None));
        }
    };
    if !range_output.success {
        let raw = summarize_command_failure(&range_output);
        update_workflow_stage(
            &mut stages,
            "precheck",
            "failed",
            raw.clone(),
            Some(range_output.command),
            Some(truncate_debug_text(&range_output.stdout, 1500)),
            Some(truncate_debug_text(&range_output.stderr, 1500)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "precheck", raw, None));
    }
    let changed_paths = range_output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    match evaluate_pr_range_gate(&changed_paths) {
        PrRangeGateDecision::Pass { changed_files } => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "success",
                format!("Precheck passed. Range gate changed files: {changed_files}."),
                Some(range_output.command),
                Some(truncate_debug_text(&range_output.stdout, 1600)),
                Some(truncate_debug_text(&range_output.stderr, 1200)),
            );
        }
        PrRangeGateDecision::Blocked { category, reason } => {
            update_workflow_stage(
                &mut stages,
                "precheck",
                "failed",
                reason.clone(),
                Some(range_output.command),
                Some(truncate_debug_text(&range_output.stdout, 1600)),
                Some(truncate_debug_text(&range_output.stderr, 1200)),
            );
            return Ok(GitPrWorkflowResult {
                ok: false,
                status: "failed".to_string(),
                message: reason,
                error_category: Some(category),
                next_action_hint: Some(
                    "Fix branch base/range first, then retry workflow to avoid oversized PR.".to_string(),
                ),
                pr_url: None,
                pr_number: None,
                existing_pr: None,
                retry_command: None,
                stages,
            });
        }
    }

    update_workflow_stage(
        &mut stages,
        "push",
        "running",
        "Pushing branch to fork remote.".to_string(),
        None,
        None,
        None,
    );
    let push_target = format!("HEAD:{head_branch}");
    let push_args = vec![
        "push".to_string(),
        "-u".to_string(),
        "origin".to_string(),
        push_target.clone(),
    ];
    let push_output = match run_token_isolated_command(&repo_root, "git", &push_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "push",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(
                stages,
                "push",
                error,
                Some(format!(
                    "env -u GH_TOKEN -u GITHUB_TOKEN git -c http.version=HTTP/1.1 push -u origin HEAD:{head_branch}"
                )),
            ));
        }
    };

    if !push_output.success {
        let first_error = summarize_command_failure(&push_output);
        if is_http2_transport_error(&first_error) {
            let push_http1_args = vec![
                "-c".to_string(),
                "http.version=HTTP/1.1".to_string(),
                "push".to_string(),
                "-u".to_string(),
                "origin".to_string(),
                push_target.clone(),
            ];
            let retry_output =
                match run_token_isolated_command(&repo_root, "git", &push_http1_args, &[]).await {
                    Ok(output) => output,
                    Err(error) => {
                        update_workflow_stage(
                            &mut stages,
                            "push",
                            "failed",
                            error.clone(),
                            None,
                            None,
                            None,
                        );
                        return Ok(build_failed_pr_workflow_result(
                            stages,
                            "push",
                            error,
                            Some(format!(
                                "env -u GH_TOKEN -u GITHUB_TOKEN git -c http.version=HTTP/1.1 push -u origin HEAD:{head_branch}"
                            )),
                        ));
                    }
                };
            if !retry_output.success {
                let retry_error = summarize_command_failure(&retry_output);
                update_workflow_stage(
                    &mut stages,
                    "push",
                    "failed",
                    retry_error.clone(),
                    Some(retry_output.command),
                    Some(truncate_debug_text(&retry_output.stdout, 1600)),
                    Some(truncate_debug_text(&retry_output.stderr, 1600)),
                );
                return Ok(build_failed_pr_workflow_result(
                    stages,
                    "push",
                    retry_error,
                    Some(format!(
                        "env -u GH_TOKEN -u GITHUB_TOKEN git -c http.version=HTTP/1.1 push -u origin HEAD:{head_branch}"
                    )),
                ));
            }
            update_workflow_stage(
                &mut stages,
                "push",
                "success",
                "Push succeeded after HTTP/1.1 fallback retry.".to_string(),
                Some(retry_output.command),
                Some(truncate_debug_text(&retry_output.stdout, 1600)),
                Some(truncate_debug_text(&retry_output.stderr, 1200)),
            );
        } else {
            update_workflow_stage(
                &mut stages,
                "push",
                "failed",
                first_error.clone(),
                Some(push_output.command),
                Some(truncate_debug_text(&push_output.stdout, 1600)),
                Some(truncate_debug_text(&push_output.stderr, 1600)),
            );
            return Ok(build_failed_pr_workflow_result(
                stages,
                "push",
                first_error,
                Some(format!(
                    "env -u GH_TOKEN -u GITHUB_TOKEN git -c http.version=HTTP/1.1 push -u origin HEAD:{head_branch}"
                )),
            ));
        }
    } else {
        update_workflow_stage(
            &mut stages,
            "push",
            "success",
            "Branch push completed.".to_string(),
            Some(push_output.command),
            Some(truncate_debug_text(&push_output.stdout, 1600)),
            Some(truncate_debug_text(&push_output.stderr, 1200)),
        );
    }

    update_workflow_stage(
        &mut stages,
        "create",
        "running",
        "Detecting existing PR and creating a new PR when needed.".to_string(),
        None,
        None,
        None,
    );
    let head_spec = format!("{head_owner}:{head_branch}");
    let existing_pr_args = vec![
        "pr".to_string(),
        "list".to_string(),
        "--repo".to_string(),
        upstream_repo.clone(),
        "--state".to_string(),
        "all".to_string(),
        "--head".to_string(),
        head_spec.clone(),
        "--json".to_string(),
        "number,title,url,state,headRefName,baseRefName".to_string(),
        "--limit".to_string(),
        "5".to_string(),
    ];
    let existing_pr_output =
        match run_token_isolated_command(&repo_root, "gh", &existing_pr_args, &[]).await {
            Ok(output) => output,
            Err(error) => {
                update_workflow_stage(
                    &mut stages,
                    "create",
                    "failed",
                    error.clone(),
                    None,
                    None,
                    None,
                );
                return Ok(build_failed_pr_workflow_result(stages, "create", error, None));
            }
        };
    if !existing_pr_output.success {
        let raw = summarize_command_failure(&existing_pr_output);
        update_workflow_stage(
            &mut stages,
            "create",
            "failed",
            raw.clone(),
            Some(existing_pr_output.command),
            Some(truncate_debug_text(&existing_pr_output.stdout, 1600)),
            Some(truncate_debug_text(&existing_pr_output.stderr, 1600)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "create", raw, None));
    }
    let existing_items: Vec<GhExistingPrEntry> = match serde_json::from_str(&existing_pr_output.stdout) {
        Ok(items) => items,
        Err(error) => {
            let raw = format!("Failed to parse existing PR metadata: {error}");
            update_workflow_stage(
                &mut stages,
                "create",
                "failed",
                raw.clone(),
                Some(existing_pr_output.command),
                Some(truncate_debug_text(&existing_pr_output.stdout, 1600)),
                Some(truncate_debug_text(&existing_pr_output.stderr, 1200)),
            );
            return Ok(build_failed_pr_workflow_result(stages, "create", raw, None));
        }
    };
    if let Some(existing) = existing_items.first() {
        let existing_pr = GitPrExistingPullRequest {
            number: existing.number,
            title: existing.title.clone(),
            url: existing.url.clone(),
            state: existing.state.clone(),
            head_ref_name: existing.head_ref_name.clone(),
            base_ref_name: existing.base_ref_name.clone(),
        };
        update_workflow_stage(
            &mut stages,
            "create",
            "success",
            format!("Existing PR found: #{} {}", existing.number, existing.title),
            Some(existing_pr_output.command),
            Some(truncate_debug_text(&existing_pr_output.stdout, 1200)),
            Some(truncate_debug_text(&existing_pr_output.stderr, 600)),
        );
        update_workflow_stage(
            &mut stages,
            "comment",
            "skipped",
            "Skipped because workflow reused existing PR.".to_string(),
            None,
            None,
            None,
        );
        return Ok(build_existing_pr_workflow_result(stages, existing_pr));
    }

    let body_value = if body.trim().is_empty() {
        default_pr_description(&base_branch, &head_branch)
    } else {
        body
    };
    let create_pr_args = vec![
        "pr".to_string(),
        "create".to_string(),
        "--repo".to_string(),
        upstream_repo.clone(),
        "--base".to_string(),
        base_branch.clone(),
        "--head".to_string(),
        head_spec.clone(),
        "--title".to_string(),
        title.clone(),
        "--body".to_string(),
        body_value,
    ];
    let create_output = match run_token_isolated_command(&repo_root, "gh", &create_pr_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "create",
                "failed",
                error.clone(),
                None,
                None,
                None,
            );
            return Ok(build_failed_pr_workflow_result(stages, "create", error, None));
        }
    };
    if !create_output.success {
        let raw = summarize_command_failure(&create_output);
        update_workflow_stage(
            &mut stages,
            "create",
            "failed",
            raw.clone(),
            Some(create_output.command),
            Some(truncate_debug_text(&create_output.stdout, 1600)),
            Some(truncate_debug_text(&create_output.stderr, 1600)),
        );
        return Ok(build_failed_pr_workflow_result(stages, "create", raw, None));
    }

    let merged_create_output = if create_output.stdout.trim().is_empty() {
        create_output.stderr.as_str()
    } else {
        create_output.stdout.as_str()
    };
    let mut pr_url = extract_pr_url(merged_create_output).unwrap_or_default();
    if pr_url.is_empty() {
        pr_url = extract_pr_url(&create_output.stdout)
            .or_else(|| extract_pr_url(&create_output.stderr))
            .unwrap_or_default();
    }
    let mut pr_number = extract_pr_number_from_url(&pr_url);
    if pr_number.is_none() {
        let pr_view_args = vec![
            "pr".to_string(),
            "list".to_string(),
            "--repo".to_string(),
            upstream_repo.clone(),
            "--state".to_string(),
            "open".to_string(),
            "--head".to_string(),
            head_spec.clone(),
            "--json".to_string(),
            "number,url".to_string(),
            "--limit".to_string(),
            "1".to_string(),
        ];
        if let Ok(view_output) = run_token_isolated_command(&repo_root, "gh", &pr_view_args, &[]).await {
            if view_output.success {
                let parsed: serde_json::Value =
                    serde_json::from_str(&view_output.stdout).unwrap_or_else(|_| json!([]));
                if let Some(item) = parsed.as_array().and_then(|items| items.first()) {
                    if pr_url.is_empty() {
                        pr_url = item
                            .get("url")
                            .and_then(|value| value.as_str())
                            .unwrap_or("")
                            .to_string();
                    }
                    pr_number = item.get("number").and_then(|value| value.as_u64());
                }
            }
        }
    }
    update_workflow_stage(
        &mut stages,
        "create",
        "success",
        if pr_url.is_empty() {
            "PR created successfully.".to_string()
        } else {
            format!("PR created: {pr_url}")
        },
        Some(create_output.command),
        Some(truncate_debug_text(&create_output.stdout, 1600)),
        Some(truncate_debug_text(&create_output.stderr, 1200)),
    );

    if !comment_enabled {
        update_workflow_stage(
            &mut stages,
            "comment",
            "skipped",
            "Comment step disabled.".to_string(),
            None,
            None,
            None,
        );
        return Ok(build_success_pr_workflow_result(
            stages,
            pr_url,
            pr_number,
            "PR workflow completed.".to_string(),
        ));
    }

    let effective_pr_number = pr_number;
    let comment_text = comment_text.trim().to_string();
    if comment_text.is_empty() {
        update_workflow_stage(
            &mut stages,
            "comment",
            "skipped",
            "Comment step skipped because body is empty.".to_string(),
            None,
            None,
            None,
        );
        return Ok(build_success_pr_workflow_result(
            stages,
            pr_url,
            effective_pr_number,
            "PR created (comment skipped).".to_string(),
        ));
    }
    let Some(comment_pr_number) = effective_pr_number else {
        update_workflow_stage(
            &mut stages,
            "comment",
            "skipped",
            "Comment step skipped because PR number is unavailable.".to_string(),
            None,
            None,
            None,
        );
        return Ok(build_success_pr_workflow_result(
            stages,
            pr_url,
            None,
            "PR created (comment skipped).".to_string(),
        ));
    };

    update_workflow_stage(
        &mut stages,
        "comment",
        "running",
        "Posting optional approval comment.".to_string(),
        None,
        None,
        None,
    );
    let comment_args = vec![
        "pr".to_string(),
        "comment".to_string(),
        comment_pr_number.to_string(),
        "--repo".to_string(),
        upstream_repo.clone(),
        "--body".to_string(),
        comment_text,
    ];
    let comment_output = match run_token_isolated_command(&repo_root, "gh", &comment_args, &[]).await {
        Ok(output) => output,
        Err(error) => {
            update_workflow_stage(
                &mut stages,
                "comment",
                "failed",
                error,
                None,
                None,
                None,
            );
            return Ok(build_success_pr_workflow_result(
                stages,
                pr_url,
                Some(comment_pr_number),
                "PR created, but comment step failed.".to_string(),
            ));
        }
    };
    if !comment_output.success {
        let raw = summarize_command_failure(&comment_output);
        update_workflow_stage(
            &mut stages,
            "comment",
            "failed",
            raw,
            Some(comment_output.command),
            Some(truncate_debug_text(&comment_output.stdout, 1200)),
            Some(truncate_debug_text(&comment_output.stderr, 1200)),
        );
        return Ok(build_success_pr_workflow_result(
            stages,
            pr_url,
            Some(comment_pr_number),
            "PR created, but comment step failed.".to_string(),
        ));
    }
    update_workflow_stage(
        &mut stages,
        "comment",
        "success",
        format!("Comment posted on PR #{comment_pr_number}."),
        Some(comment_output.command),
        Some(truncate_debug_text(&comment_output.stdout, 1200)),
        Some(truncate_debug_text(&comment_output.stderr, 600)),
    );
    Ok(build_success_pr_workflow_result(
        stages,
        pr_url,
        Some(comment_pr_number),
        "PR workflow completed.".to_string(),
    ))
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

    let repo_root = resolve_git_root(&entry)?;
    let local_name_to_track = {
        let repo = open_repository_at_root(&repo_root)?;

        let mut status_options = StatusOptions::new();
        status_options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false);
        let statuses = repo
            .statuses(Some(&mut status_options))
            .map_err(|e| e.to_string())?;
        if !statuses.is_empty() {
            return Err(
                "Working tree has uncommitted changes. Commit/stash/discard changes first."
                    .to_string(),
            );
        }

        if repo.find_branch(trimmed_name, BranchType::Local).is_ok() {
            return checkout_branch(&repo, trimmed_name).map_err(|e| e.to_string());
        }

        let remote_ref = format!("refs/remotes/{trimmed_name}");
        if repo.refname_to_id(&remote_ref).is_ok() {
            let local_name = trimmed_name.split('/').next_back().unwrap_or(trimmed_name);
            let valid_local_name = validate_local_branch_name(local_name)?;
            Some(valid_local_name)
        } else {
            None
        }
    };

    if let Some(local_name) = local_name_to_track {
        run_git_command(
            &repo_root,
            &[
                "checkout",
                "-b",
                local_name.as_str(),
                "--track",
                trimmed_name,
            ],
        )
        .await?;
        return Ok(());
    }

    Err(format!("Branch not found: {trimmed_name}"))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use validation::validate_local_branch_name;

    fn create_temp_repo() -> (PathBuf, Repository) {
        let root = std::env::temp_dir().join(format!("code-moss-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create temp repo root");
        let repo = Repository::init(&root).expect("init repo");
        (root, repo)
    }

    #[test]
    fn collect_workspace_diff_prefers_staged_changes() {
        let (root, repo) = create_temp_repo();
        let file_path = root.join("staged.txt");
        fs::write(&file_path, "staged\n").expect("write staged file");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("staged.txt")).expect("add path");
        index.write().expect("write index");

        let diff = collect_workspace_diff(&root).expect("collect diff");
        assert!(diff.contains("staged.txt"));
        assert!(diff.contains("staged"));
    }

    #[test]
    fn collect_workspace_diff_falls_back_to_workdir() {
        let (root, _repo) = create_temp_repo();
        let file_path = root.join("unstaged.txt");
        fs::write(&file_path, "unstaged\n").expect("write unstaged file");

        let diff = collect_workspace_diff(&root).expect("collect diff");
        assert!(diff.contains("unstaged.txt"));
        assert!(diff.contains("unstaged"));
    }

    #[test]
    fn action_paths_for_file_expands_renames() {
        let (root, repo) = create_temp_repo();
        fs::write(root.join("a.txt"), "hello\n").expect("write file");

        let mut index = repo.index().expect("repo index");
        index.add_path(Path::new("a.txt")).expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        fs::rename(root.join("a.txt"), root.join("b.txt")).expect("rename file");

        // Stage the rename so libgit2 reports it as an INDEX_RENAMED entry.
        let mut index = repo.index().expect("repo index");
        index
            .remove_path(Path::new("a.txt"))
            .expect("remove old path");
        index.add_path(Path::new("b.txt")).expect("add new path");
        index.write().expect("write index");

        let paths = action_paths_for_file(&root, "b.txt");
        assert_eq!(paths, vec!["a.txt".to_string(), "b.txt".to_string()]);
    }

    #[test]
    fn open_repository_at_root_does_not_search_parent_directories() {
        let (root, _repo) = create_temp_repo();
        let nested = root.join("nested").join("non-repo");
        fs::create_dir_all(&nested).expect("create nested directory");

        let result = open_repository_at_root(&nested);
        assert!(result.is_err());
    }

    #[test]
    fn paginate_history_commits_respects_offset_and_limit() {
        let commits = (0..5)
            .map(|index| GitHistoryCommit {
                sha: format!("sha-{index}"),
                short_sha: format!("s{index}"),
                summary: format!("commit-{index}"),
                message: format!("message-{index}"),
                author: "tester".to_string(),
                author_email: "tester@example.com".to_string(),
                timestamp: 100 + index as i64,
                parents: Vec::new(),
                refs: Vec::new(),
            })
            .collect::<Vec<_>>();
        let (page, total, has_more) = paginate_history_commits(commits, 2, 2);
        assert_eq!(total, 5);
        assert_eq!(page.len(), 2);
        assert_eq!(page[0].sha, "sha-2");
        assert_eq!(page[1].sha, "sha-3");
        assert!(has_more);
    }

    #[test]
    fn validate_local_branch_name_allows_slash_and_rejects_invalid() {
        assert_eq!(
            validate_local_branch_name("feature/git-log").expect("valid branch"),
            "feature/git-log".to_string()
        );
        assert!(validate_local_branch_name("feature..broken").is_err());
    }

    #[test]
    fn detect_used_by_worktree_delete_error() {
        let message =
            "error: cannot delete branch 'feature/test' used by worktree at '/tmp/worktree'";
        assert!(is_branch_used_by_worktree_error(message));
        assert_eq!(
            extract_worktree_path_from_delete_error(message).as_deref(),
            Some("/tmp/worktree")
        );
    }

    #[test]
    fn build_actionable_used_by_worktree_error_with_path() {
        let message =
            "error: cannot delete branch 'feature/test' used by worktree at '/tmp/worktree'";
        let friendly = build_delete_branch_worktree_error("feature/test", message);
        assert!(friendly.contains("Switch that worktree to another branch"));
        assert!(friendly.contains("/tmp/worktree"));
    }

    #[test]
    fn token_isolated_command_display_includes_env_unset_prefix() {
        let rendered = build_token_isolated_command_display(
            "git",
            &[
                "push".to_string(),
                "-u".to_string(),
                "origin".to_string(),
                "HEAD:feature/a".to_string(),
            ],
        );
        assert!(rendered.starts_with("env -u GH_TOKEN -u GITHUB_TOKEN"));
        assert!(rendered.contains("git push -u origin HEAD:feature/a"));
    }

    #[test]
    fn detect_http2_transport_error_signature() {
        let message = "error: RPC failed; curl 16 Error in the HTTP2 framing layer";
        assert!(is_http2_transport_error(message));
    }

    #[test]
    fn parse_pr_number_from_url_works() {
        assert_eq!(
            extract_pr_number_from_url("https://github.com/a/b/pull/123"),
            Some(123)
        );
        assert_eq!(
            extract_pr_number_from_url("https://github.com/a/b/pull/456/files"),
            Some(456)
        );
        assert_eq!(extract_pr_number_from_url("https://github.com/a/b/issues/1"), None);
    }

    #[test]
    fn range_gate_blocks_oversized_changeset() {
        let paths = (0..(PR_RANGE_MAX_CHANGED_FILES + 1))
            .map(|index| format!("src/file-{index}.ts"))
            .collect::<Vec<_>>();
        let decision = evaluate_pr_range_gate(&paths);
        assert!(matches!(
            decision,
            PrRangeGateDecision::Blocked { category, .. } if category == "range-too-large"
        ));
    }

    #[test]
    fn range_gate_blocks_suspicious_root_files_when_scope_is_large() {
        let mut paths = (0..PR_RANGE_SUSPICIOUS_THRESHOLD)
            .map(|index| format!("src/file-{index}.ts"))
            .collect::<Vec<_>>();
        paths.push("README.md".to_string());
        let decision = evaluate_pr_range_gate(&paths);
        assert!(matches!(
            decision,
            PrRangeGateDecision::Blocked { category, .. } if category == "range-suspicious"
        ));
    }
}
