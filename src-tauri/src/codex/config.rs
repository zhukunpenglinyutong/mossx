use std::path::{Path, PathBuf};

use toml::Value as TomlValue;

use crate::files::io::read_text_file_within;
use crate::files::ops::write_with_policy;
use crate::files::policy::{policy_for, FileKind, FileScope};

const FEATURES_TABLE: &str = "[features]";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FeatureFlagStatus {
    pub(crate) has_explicit_key: bool,
    pub(crate) value: Option<bool>,
}

pub(crate) fn inspect_unified_exec_override() -> Result<FeatureFlagStatus, String> {
    inspect_feature_flag("unified_exec")
}

pub(crate) fn write_unified_exec_override(enabled: bool) -> Result<(), String> {
    write_feature_flag("unified_exec", enabled)
}

pub(crate) fn clear_unified_exec_override() -> Result<(), String> {
    remove_feature_flag("unified_exec")
}

fn inspect_feature_flag(key: &str) -> Result<FeatureFlagStatus, String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(FeatureFlagStatus {
            has_explicit_key: false,
            value: None,
        });
    };
    let contents = read_config_contents_from_root(&root)?;
    Ok(contents
        .as_deref()
        .map(|value| inspect_feature_flag_contents(value, key))
        .unwrap_or(FeatureFlagStatus {
            has_explicit_key: false,
            value: None,
        }))
}

fn remove_feature_flag(key: &str) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let policy = config_policy()?;
    let response = read_text_file_within(
        &root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    if !response.exists {
        return Ok(());
    }
    let updated = remove_feature_flag_from_contents(&response.content, key);
    if updated == response.content {
        return Ok(());
    }
    write_with_policy(&root, policy, &updated)
}

fn write_feature_flag(key: &str, enabled: bool) -> Result<(), String> {
    let Some(root) = resolve_default_codex_home() else {
        return Ok(());
    };
    let policy = config_policy()?;
    let response = read_text_file_within(
        &root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    let updated = if response.exists {
        upsert_feature_flag_in_contents(&response.content, key, enabled)
    } else {
        format!("{FEATURES_TABLE}\n{key} = {enabled}\n")
    };
    write_with_policy(&root, policy, &updated)
}

pub(crate) fn config_toml_path() -> Option<PathBuf> {
    resolve_default_codex_home().map(|home| home.join("config.toml"))
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = codex_home.or_else(resolve_default_codex_home);
    let Some(root) = root else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    read_config_model_from_root(&root)
}

fn resolve_default_codex_home() -> Option<PathBuf> {
    crate::codex::home::resolve_default_codex_home()
}

fn config_policy() -> Result<crate::files::policy::FilePolicy, String> {
    policy_for(FileScope::Global, FileKind::Config)
}

fn read_config_contents_from_root(root: &Path) -> Result<Option<String>, String> {
    let policy = config_policy()?;
    let response = read_text_file_within(
        root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;
    if response.exists {
        Ok(Some(response.content))
    } else {
        Ok(None)
    }
}

fn read_config_model_from_root(root: &Path) -> Result<Option<String>, String> {
    let contents = read_config_contents_from_root(root)?;
    Ok(contents.as_deref().and_then(parse_model_from_toml))
}

fn parse_model_from_toml(contents: &str) -> Option<String> {
    let parsed: TomlValue = toml::from_str(contents).ok()?;
    let model = parsed.get("model")?.as_str()?;
    let trimmed = model.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn inspect_feature_flag_contents(contents: &str, key: &str) -> FeatureFlagStatus {
    let mut in_features = false;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_features = trimmed == FEATURES_TABLE;
            continue;
        }
        if !in_features || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((candidate_key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if candidate_key.trim() != key {
            continue;
        }
        let value = value.split('#').next().unwrap_or("").trim();
        return FeatureFlagStatus {
            has_explicit_key: true,
            value: match value {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            },
        };
    }
    FeatureFlagStatus {
        has_explicit_key: false,
        value: None,
    }
}

fn remove_feature_flag_from_contents(contents: &str, key: &str) -> String {
    let mut lines = Vec::new();
    let mut in_features = false;
    let line_ending = if contents.contains("\r\n") { "\r\n" } else { "\n" };
    let has_trailing_newline = contents.ends_with('\n');

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_features = trimmed == FEATURES_TABLE;
            lines.push(line.to_string());
            continue;
        }
        if in_features && !trimmed.is_empty() && !trimmed.starts_with('#') {
            if let Some((candidate_key, _)) = trimmed.split_once('=') {
                if candidate_key.trim() == key {
                    continue;
                }
            }
        }
        lines.push(line.to_string());
    }

    let mut updated = lines.join(line_ending);
    if has_trailing_newline && !updated.is_empty() && !updated.ends_with(line_ending) {
        updated.push_str(line_ending);
    }
    updated
}

fn upsert_feature_flag_in_contents(contents: &str, key: &str, enabled: bool) -> String {
    let mut lines = contents.lines().map(str::to_string).collect::<Vec<_>>();
    let line_ending = if contents.contains("\r\n") { "\r\n" } else { "\n" };
    let mut in_features = false;
    let mut insert_index = lines.len();
    let mut replace_index = None;

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_features && replace_index.is_none() {
                insert_index = index;
            }
            in_features = trimmed == FEATURES_TABLE;
            if in_features {
                insert_index = index + 1;
            }
            continue;
        }
        if !in_features {
            continue;
        }
        insert_index = index + 1;
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((candidate_key, _)) = trimmed.split_once('=') else {
            continue;
        };
        if candidate_key.trim() == key {
            replace_index = Some(index);
            break;
        }
    }

    let value_line = format!("{key} = {enabled}");
    if let Some(index) = replace_index {
        lines[index] = value_line;
    } else if lines.iter().any(|line| line.trim() == FEATURES_TABLE) {
        lines.insert(insert_index, value_line);
    } else {
        if !lines.is_empty() && !lines.last().is_some_and(|line| line.trim().is_empty()) {
            lines.push(String::new());
        }
        lines.push(FEATURES_TABLE.to_string());
        lines.push(value_line);
    }

    let mut updated = lines.join(line_ending);
    if !updated.is_empty() && !updated.ends_with(line_ending) {
        updated.push_str(line_ending);
    }
    updated
}

#[cfg(test)]
mod tests {
    use super::{
        inspect_feature_flag_contents, remove_feature_flag_from_contents,
        upsert_feature_flag_in_contents, FeatureFlagStatus,
    };

    #[test]
    fn inspect_feature_flag_reads_only_requested_key() {
        let contents = "[features]\ncollab = false\nunified_exec = true\n";

        assert_eq!(
            inspect_feature_flag_contents(contents, "unified_exec"),
            FeatureFlagStatus {
                has_explicit_key: true,
                value: Some(true),
            }
        );
        assert_eq!(
            inspect_feature_flag_contents(contents, "steer"),
            FeatureFlagStatus {
                has_explicit_key: false,
                value: None,
            }
        );
    }

    #[test]
    fn inspect_feature_flag_reports_invalid_value_as_explicit() {
        assert_eq!(
            inspect_feature_flag_contents("[features]\nunified_exec = maybe\n", "unified_exec"),
            FeatureFlagStatus {
                has_explicit_key: true,
                value: None,
            }
        );
    }

    #[test]
    fn remove_feature_flag_preserves_other_feature_lines() {
        let contents = "[features]\ncollab = false\nunified_exec = false\nsteer = true\n";

        let updated = remove_feature_flag_from_contents(contents, "unified_exec");

        assert!(updated.contains("collab = false"));
        assert!(updated.contains("steer = true"));
        assert!(!updated.contains("unified_exec ="));
    }

    #[test]
    fn remove_feature_flag_keeps_missing_table_unchanged() {
        assert_eq!(remove_feature_flag_from_contents("", "unified_exec"), "");
    }

    #[test]
    fn remove_feature_flag_preserves_windows_crlf_line_endings() {
        let contents = "[features]\r\nunified_exec = false\r\nsteer = true\r\n";

        let updated = remove_feature_flag_from_contents(contents, "unified_exec");

        assert_eq!(updated, "[features]\r\nsteer = true\r\n");
    }

    #[test]
    fn upsert_feature_flag_replaces_existing_value() {
        let contents = "[features]\nunified_exec = false\nsteer = true\n";

        let updated = upsert_feature_flag_in_contents(contents, "unified_exec", true);

        assert!(updated.contains("unified_exec = true"));
        assert!(updated.contains("steer = true"));
        assert!(!updated.contains("unified_exec = false"));
    }

    #[test]
    fn upsert_feature_flag_inserts_into_existing_features_table() {
        let contents = "[features]\nsteer = true\n";

        let updated = upsert_feature_flag_in_contents(contents, "unified_exec", false);

        assert_eq!(updated, "[features]\nsteer = true\nunified_exec = false\n");
    }

    #[test]
    fn upsert_feature_flag_adds_features_table_when_missing() {
        let contents = "model = \"gpt-5.4\"\n";

        let updated = upsert_feature_flag_in_contents(contents, "unified_exec", true);

        assert_eq!(
            updated,
            "model = \"gpt-5.4\"\n\n[features]\nunified_exec = true\n"
        );
    }
}
