use std::path::PathBuf;

use crate::shared::worktree_core;

pub(crate) fn sanitize_worktree_name(branch: &str) -> String {
    worktree_core::sanitize_worktree_name(branch)
}

#[allow(dead_code)]
pub(crate) fn sanitize_clone_dir_name(name: &str) -> String {
    worktree_core::sanitize_clone_dir_name(name)
}

pub(crate) fn unique_worktree_path(base_dir: &PathBuf, name: &str) -> PathBuf {
    worktree_core::unique_worktree_path_best_effort(base_dir, name)
}

pub(crate) fn unique_worktree_path_for_rename(
    base_dir: &PathBuf,
    name: &str,
    current_path: &PathBuf,
) -> Result<PathBuf, String> {
    worktree_core::unique_worktree_path_for_rename(base_dir, name, current_path)
}

pub(crate) fn build_clone_destination_path(copies_folder: &PathBuf, copy_name: &str) -> PathBuf {
    worktree_core::build_clone_destination_path(copies_folder, copy_name)
}

pub(crate) fn null_device_path() -> &'static str {
    worktree_core::null_device_path()
}
