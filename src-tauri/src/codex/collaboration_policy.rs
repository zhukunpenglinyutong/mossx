use std::env;

use serde_json::{json, Value};

pub(crate) const COLLABORATION_POLICY_VERSION: &str = "mossx-collaboration-policy/v1";

const DEFAULT_EFFECTIVE_MODE: &str = "code";
const COLLABORATION_PROFILE_ENV: &str = "MOSSX_CODEX_COLLABORATION_PROFILE";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CollaborationProfile {
    OfficialCompatible,
    StrictLocal,
}

impl CollaborationProfile {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            CollaborationProfile::OfficialCompatible => "official-compatible",
            CollaborationProfile::StrictLocal => "strict-local",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RequestUserInputPolicy {
    Allow,
    Block,
}

impl RequestUserInputPolicy {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            RequestUserInputPolicy::Allow => "allow",
            RequestUserInputPolicy::Block => "block",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CodexCollaborationPolicy {
    pub(crate) selected_mode: Option<String>,
    pub(crate) effective_mode: String,
    pub(crate) profile: CollaborationProfile,
    pub(crate) fallback_reason: Option<String>,
    pub(crate) policy_version: &'static str,
    pub(crate) request_user_input_policy: RequestUserInputPolicy,
    pub(crate) directives: Vec<String>,
}

pub(crate) fn normalize_mode(value: Option<&str>) -> Option<String> {
    match value.map(|raw| raw.trim().to_lowercase()) {
        Some(mode) if mode == "plan" || mode == "code" => Some(mode),
        Some(mode) if mode == "default" => Some("code".to_string()),
        _ => None,
    }
}

pub(crate) fn extract_selected_mode(payload: Option<&Value>) -> Option<String> {
    let value = payload?;
    if let Some(mode) = value.as_str() {
        let trimmed = mode.trim().to_lowercase();
        return if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    }
    let object = value.as_object()?;
    let mode = object
        .get("mode")
        .or_else(|| object.get("id"))
        .and_then(Value::as_str)?;
    let trimmed = mode.trim().to_lowercase();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub(crate) fn resolve_collaboration_profile_from_raw(raw: Option<&str>) -> CollaborationProfile {
    match raw.map(|value| value.trim().to_lowercase()).as_deref() {
        Some("strict-local") | Some("strict_local") | Some("strictlocal") | Some("strict") => {
            CollaborationProfile::StrictLocal
        }
        _ => CollaborationProfile::OfficialCompatible,
    }
}

pub(crate) fn resolve_collaboration_profile() -> CollaborationProfile {
    resolve_collaboration_profile_from_raw(env::var(COLLABORATION_PROFILE_ENV).ok().as_deref())
}

pub(crate) fn strict_local_collaboration_profile_enabled() -> bool {
    resolve_collaboration_profile() == CollaborationProfile::StrictLocal
}

pub(crate) fn resolve_policy(
    payload: Option<&Value>,
    persisted_mode: Option<&str>,
) -> CodexCollaborationPolicy {
    let profile = resolve_collaboration_profile();
    let selected_mode = extract_selected_mode(payload);
    let normalized_selected = normalize_mode(selected_mode.as_deref());
    let normalized_persisted = normalize_mode(persisted_mode);

    let (effective_mode, fallback_reason) = match (normalized_selected, normalized_persisted) {
        (Some(selected), _) => (selected, None),
        (None, Some(persisted)) if selected_mode.is_some() => (
            persisted,
            Some("invalid_mode_in_request_using_thread_state".to_string()),
        ),
        (None, Some(persisted)) => (
            persisted,
            Some("missing_mode_in_request_using_thread_state".to_string()),
        ),
        (None, None) if selected_mode.is_some() => (
            DEFAULT_EFFECTIVE_MODE.to_string(),
            Some("invalid_mode_in_request_default_code".to_string()),
        ),
        (None, None) => (
            DEFAULT_EFFECTIVE_MODE.to_string(),
            Some("missing_mode_in_request_default_code".to_string()),
        ),
    };

    let request_user_input_policy = match (profile, effective_mode.as_str()) {
        (CollaborationProfile::StrictLocal, "code") => RequestUserInputPolicy::Block,
        _ => RequestUserInputPolicy::Allow,
    };

    CodexCollaborationPolicy {
        selected_mode,
        effective_mode: effective_mode.clone(),
        profile,
        fallback_reason,
        policy_version: COLLABORATION_POLICY_VERSION,
        request_user_input_policy,
        directives: build_policy_directives(profile, &effective_mode),
    }
}

pub(crate) fn build_policy_directives(
    profile: CollaborationProfile,
    effective_mode: &str,
) -> Vec<String> {
    if effective_mode == "code" {
        match profile {
            CollaborationProfile::OfficialCompatible => vec![
                "Execution policy (default mode): execute tasks autonomously by default, but requestUserInput / askuserquestion is allowed when critical information is missing."
                    .to_string(),
            ],
            CollaborationProfile::StrictLocal => vec![
                "Execution policy (default mode): keep execution autonomous. Do not ask the user follow-up questions and avoid requestUserInput / askuserquestion interactions. If details are missing, make minimal reasonable assumptions, proceed, and report assumptions briefly."
                    .to_string(),
            ],
        }
    } else {
        vec![
            "Execution policy (plan mode): work in planning-only style. You MAY inspect files and run read-only checks, but MUST NOT apply file edits or execute repository-mutating operations."
                .to_string(),
            "Execution policy (plan mode): if a blocker appears (missing path/context, ambiguous scope, permission gap, or any prerequisite failure), you MUST immediately stop further work, call requestUserInput / askuserquestion with concrete options, and WAIT for user input before continuing. Do not silently continue with assumptions."
                .to_string(),
            "Execution policy (plan mode): when you need extra user information (for example path, credentials, env value, target scope, preference, or any missing input), you MUST ask via requestUserInput / askuserquestion. Plain-text follow-up questions are NOT allowed."
                .to_string(),
        ]
    }
}

fn merge_developer_instructions(existing: Option<&str>, directives: &[String]) -> Option<String> {
    let policy_block = directives
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if policy_block.is_empty() {
        return existing
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
    }

    let existing_trimmed = existing
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default();

    if existing_trimmed.is_empty() {
        return Some(policy_block);
    }

    if existing_trimmed.contains(&policy_block) {
        return Some(existing_trimmed.to_string());
    }

    Some(format!("{existing_trimmed}\n\n{policy_block}"))
}

pub(crate) fn apply_policy_to_collaboration_mode(
    payload: Option<Value>,
    policy: &CodexCollaborationPolicy,
) -> Value {
    let mut root = payload
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut settings = root
        .get("settings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let existing_instructions = settings
        .get("developer_instructions")
        .and_then(Value::as_str);
    if let Some(merged) = merge_developer_instructions(existing_instructions, &policy.directives) {
        settings.insert("developer_instructions".to_string(), Value::String(merged));
    }
    settings.insert(
        "_mossx_runtime".to_string(),
        json!({
            "selected_mode": policy.selected_mode.clone().unwrap_or_else(|| "missing".to_string()),
            "effective_mode": policy.effective_mode,
            "collaboration_profile": policy.profile.as_str(),
            "policy_version": policy.policy_version,
            "fallback_reason": policy.fallback_reason,
            "request_user_input_policy": policy.request_user_input_policy.as_str(),
        }),
    );
    let wire_mode = if policy.effective_mode == "plan" {
        "plan"
    } else {
        // codex app-server v2 uses "default" as the non-plan mode enum.
        "default"
    };
    root.insert("mode".to_string(), Value::String(wire_mode.to_string()));
    root.insert(
        "selectedMode".to_string(),
        Value::String(
            policy
                .selected_mode
                .clone()
                .unwrap_or_else(|| "missing".to_string()),
        ),
    );
    root.insert(
        "effectiveMode".to_string(),
        Value::String(policy.effective_mode.clone()),
    );
    root.insert(
        "policyVersion".to_string(),
        Value::String(policy.policy_version.to_string()),
    );
    root.insert(
        "fallbackReason".to_string(),
        policy
            .fallback_reason
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    root.insert("settings".to_string(), Value::Object(settings));
    Value::Object(root)
}

#[cfg(test)]
mod tests {
    use super::{
        apply_policy_to_collaboration_mode, build_policy_directives, normalize_mode,
        resolve_collaboration_profile_from_raw, CodexCollaborationPolicy, CollaborationProfile,
        RequestUserInputPolicy, COLLABORATION_POLICY_VERSION,
    };
    use serde_json::json;

    fn resolve_policy_with_profile(
        profile: CollaborationProfile,
        payload: Option<&serde_json::Value>,
        persisted_mode: Option<&str>,
    ) -> CodexCollaborationPolicy {
        let selected_mode = super::extract_selected_mode(payload);
        let normalized_selected = super::normalize_mode(selected_mode.as_deref());
        let normalized_persisted = super::normalize_mode(persisted_mode);

        let (effective_mode, fallback_reason) = match (normalized_selected, normalized_persisted) {
            (Some(selected), _) => (selected, None),
            (None, Some(persisted)) if selected_mode.is_some() => (
                persisted,
                Some("invalid_mode_in_request_using_thread_state".to_string()),
            ),
            (None, Some(persisted)) => (
                persisted,
                Some("missing_mode_in_request_using_thread_state".to_string()),
            ),
            (None, None) if selected_mode.is_some() => (
                super::DEFAULT_EFFECTIVE_MODE.to_string(),
                Some("invalid_mode_in_request_default_code".to_string()),
            ),
            (None, None) => (
                super::DEFAULT_EFFECTIVE_MODE.to_string(),
                Some("missing_mode_in_request_default_code".to_string()),
            ),
        };

        let request_user_input_policy = match (profile, effective_mode.as_str()) {
            (CollaborationProfile::StrictLocal, "code") => RequestUserInputPolicy::Block,
            _ => RequestUserInputPolicy::Allow,
        };

        CodexCollaborationPolicy {
            selected_mode,
            effective_mode: effective_mode.clone(),
            profile,
            fallback_reason,
            policy_version: COLLABORATION_POLICY_VERSION,
            request_user_input_policy,
            directives: build_policy_directives(profile, &effective_mode),
        }
    }

    #[test]
    fn normalize_mode_accepts_plan_and_code() {
        assert_eq!(normalize_mode(Some("plan")), Some("plan".to_string()));
        assert_eq!(normalize_mode(Some(" CODE ")), Some("code".to_string()));
        assert_eq!(normalize_mode(Some("default")), Some("code".to_string()));
        assert_eq!(normalize_mode(Some("unknown")), None);
        assert_eq!(normalize_mode(None), None);
    }

    #[test]
    fn resolve_policy_prefers_explicit_mode() {
        let payload = json!({ "mode": "code" });
        let policy = resolve_policy_with_profile(
            CollaborationProfile::OfficialCompatible,
            Some(&payload),
            Some("plan"),
        );
        assert_eq!(policy.selected_mode, Some("code".to_string()));
        assert_eq!(policy.effective_mode, "code");
        assert_eq!(policy.fallback_reason, None);
        assert_eq!(policy.policy_version, COLLABORATION_POLICY_VERSION);
        assert_eq!(
            policy.request_user_input_policy,
            RequestUserInputPolicy::Allow
        );
    }

    #[test]
    fn resolve_policy_falls_back_to_thread_mode_for_invalid_selection() {
        let payload = json!({ "mode": "invalid" });
        let policy = resolve_policy_with_profile(
            CollaborationProfile::OfficialCompatible,
            Some(&payload),
            Some("code"),
        );
        assert_eq!(policy.selected_mode, Some("invalid".to_string()));
        assert_eq!(policy.effective_mode, "code");
        assert_eq!(
            policy.fallback_reason.as_deref(),
            Some("invalid_mode_in_request_using_thread_state")
        );
    }

    #[test]
    fn apply_policy_to_collaboration_mode_injects_observability_fields() {
        let payload = json!({
            "mode": "plan",
            "settings": {
                "developer_instructions": "Keep answers concise."
            }
        });
        let policy = resolve_policy_with_profile(
            CollaborationProfile::OfficialCompatible,
            Some(&json!({ "mode": "code" })),
            None,
        );
        let enriched = apply_policy_to_collaboration_mode(Some(payload), &policy);
        assert_eq!(enriched["mode"], "default");
        assert_eq!(enriched["selectedMode"], "code");
        assert_eq!(enriched["effectiveMode"], "code");
        assert_eq!(enriched["policyVersion"], COLLABORATION_POLICY_VERSION);
        assert_eq!(enriched["fallbackReason"], serde_json::Value::Null);
        assert_eq!(
            enriched["settings"]["_mossx_runtime"]["request_user_input_policy"],
            "allow"
        );
        assert_eq!(
            enriched["settings"]["_mossx_runtime"]["collaboration_profile"],
            "official-compatible"
        );
        let merged_instructions = enriched["settings"]["developer_instructions"]
            .as_str()
            .unwrap_or("");
        assert!(merged_instructions.contains("Keep answers concise."));
        assert!(merged_instructions.contains("Execution policy (default mode)"));
    }

    #[test]
    fn plan_mode_directives_require_blocker_question_flow() {
        let directives = build_policy_directives(CollaborationProfile::OfficialCompatible, "plan");
        let merged = directives.join("\n");
        assert!(merged.contains("Execution policy (plan mode):"));
        assert!(merged.contains("MUST immediately stop further work"));
        assert!(merged.contains("call requestUserInput / askuserquestion"));
        assert!(merged.contains("WAIT for user input"));
        assert!(merged.contains("Plain-text follow-up questions are NOT allowed"));
    }

    #[test]
    fn resolve_policy_defaults_to_code_when_mode_missing() {
        let policy =
            resolve_policy_with_profile(CollaborationProfile::OfficialCompatible, None, None);
        assert_eq!(policy.effective_mode, "code");
        assert_eq!(
            policy.fallback_reason.as_deref(),
            Some("missing_mode_in_request_default_code")
        );
        assert_eq!(
            policy.request_user_input_policy,
            RequestUserInputPolicy::Allow
        );
    }

    #[test]
    fn strict_local_profile_blocks_request_user_input_in_code_mode() {
        let policy =
            resolve_policy_with_profile(CollaborationProfile::StrictLocal, None, Some("code"));
        assert_eq!(policy.profile, CollaborationProfile::StrictLocal);
        assert_eq!(
            policy.request_user_input_policy,
            RequestUserInputPolicy::Block
        );
    }

    #[test]
    fn profile_parser_defaults_to_official_compatible() {
        assert_eq!(
            resolve_collaboration_profile_from_raw(None),
            CollaborationProfile::OfficialCompatible
        );
        assert_eq!(
            resolve_collaboration_profile_from_raw(Some("unknown")),
            CollaborationProfile::OfficialCompatible
        );
        assert_eq!(
            resolve_collaboration_profile_from_raw(Some("strict-local")),
            CollaborationProfile::StrictLocal
        );
        assert_eq!(
            resolve_collaboration_profile_from_raw(Some("strict_local")),
            CollaborationProfile::StrictLocal
        );
    }
}
