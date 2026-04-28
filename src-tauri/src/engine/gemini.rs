//! Gemini engine implementation
//!
//! Handles Gemini CLI execution via:
//! `gemini -p "<prompt>" --output-format stream-json`

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex, RwLock};

use super::events::EngineEvent;
use super::gemini_history::{load_gemini_session, GeminiSessionMessage};
use super::gemini_proxy_guard::apply_dead_loopback_proxy_guard;
use super::{EngineConfig, EngineType, SendMessageParams};
use crate::app_paths;
#[path = "gemini_event_parsing.rs"]
mod event_parsing;
use self::event_parsing::{
    collect_latest_turn_reasoning_texts, extract_latest_thought_text, extract_session_id,
    extract_text_from_value, extract_tool_events_from_snapshot, parse_gemini_event,
    should_extract_thought_fallback,
};

const GEMINI_REASONING_HISTORY_SYNC_INTERVAL_MS: u64 = 900;
const GEMINI_INLINE_IMAGE_MAX_BYTES: usize = 12 * 1024 * 1024;
// Keep enough margin under Windows CreateProcessW command-line limits.
const GEMINI_PROMPT_ARG_MAX_CHARS: usize = 8 * 1024;
static GEMINI_INLINE_IMAGE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Default)]
struct GeminiSnapshotToolState {
    started_emitted: bool,
    completed_signature: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GeminiTurnEvent {
    pub turn_id: String,
    pub event: EngineEvent,
}

#[derive(Debug, Default)]
struct GeminiVendorRuntimeConfig {
    env: HashMap<String, String>,
    auth_mode: Option<String>,
}

struct GeminiBuiltCommand {
    command: Command,
    prompt_stdin_payload: Option<String>,
}

/// Gemini session for a workspace
pub struct GeminiSession {
    pub workspace_id: String,
    pub workspace_path: PathBuf,
    session_id: RwLock<Option<String>>,
    event_sender: broadcast::Sender<GeminiTurnEvent>,
    bin_path: Option<String>,
    home_dir: Option<String>,
    custom_args: Option<String>,
    active_processes: Mutex<HashMap<String, Child>>,
    interrupted: AtomicBool,
}

impl GeminiSession {
    pub fn new(
        workspace_id: String,
        workspace_path: PathBuf,
        config: Option<EngineConfig>,
    ) -> Self {
        let (event_sender, _) = broadcast::channel(1024);
        let config = config.unwrap_or_default();
        Self {
            workspace_id,
            workspace_path,
            session_id: RwLock::new(None),
            event_sender,
            bin_path: config.bin_path,
            home_dir: config.home_dir,
            custom_args: config.custom_args,
            active_processes: Mutex::new(HashMap::new()),
            interrupted: AtomicBool::new(false),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<GeminiTurnEvent> {
        self.event_sender.subscribe()
    }

    pub async fn get_session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
    }

    async fn set_session_id(&self, id: Option<String>) {
        *self.session_id.write().await = id;
    }

    fn emit_turn_event(&self, turn_id: &str, event: EngineEvent) {
        let _ = self.event_sender.send(GeminiTurnEvent {
            turn_id: turn_id.to_string(),
            event,
        });
    }

    pub fn emit_error(&self, turn_id: &str, error: String) {
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnError {
                workspace_id: self.workspace_id.clone(),
                error,
                code: None,
            },
        );
    }

    fn with_external_spec_hint(text: &str, custom_spec_root: Option<&str>) -> String {
        let Some(spec_root) = custom_spec_root
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return text.to_string();
        };
        if !Path::new(spec_root).is_absolute() {
            return text.to_string();
        }
        format!(
            "[External OpenSpec Root]\n- Path: {spec_root}\n- Treat this as the active spec root when checking or reading project specs.\n[/External OpenSpec Root]\n\n{text}"
        )
    }

    fn locale_to_prompt_language_hint(locale: &str) -> Option<&'static str> {
        let normalized = locale.trim().to_ascii_lowercase();
        if normalized.is_empty() {
            return None;
        }
        if normalized.starts_with("zh")
            || normalized.contains("zh_cn")
            || normalized.contains("zh-hans")
            || normalized.contains("chinese")
        {
            return Some("Output language: Simplified Chinese.");
        }
        None
    }

    fn resolve_prompt_language_hint() -> Option<&'static str> {
        let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
            .iter()
            .find_map(|key| std::env::var(key).ok())
            .unwrap_or_default();
        Self::locale_to_prompt_language_hint(&locale)
    }

    fn with_output_language_hint(text: &str) -> String {
        let trimmed = text.trim_start();
        if trimmed.starts_with("Output language:") {
            return text.to_string();
        }
        let Some(language_hint) = Self::resolve_prompt_language_hint() else {
            return text.to_string();
        };
        format!(
            "{language_hint}\nPrefer this language for reasoning and final answer unless the user explicitly requests another language.\n\n{text}"
        )
    }

    fn normalize_image_path_for_prompt(raw: &str, workspace_path: &Path) -> Option<String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed.starts_with("data:") {
            if let Some((_, data_segment)) = trimmed.split_once(',') {
                let recovered = data_segment.trim();
                if recovered.starts_with("file://") {
                    return Self::normalize_file_uri_path(recovered);
                }
            }
            return Self::materialize_data_url_image(trimmed, workspace_path);
        }
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            log::warn!(
                "Gemini image attachment is remote-url based; Gemini CLI needs local file paths, skipping: {}",
                trimmed
            );
            return None;
        }
        if trimmed.starts_with("file://") {
            return Self::normalize_file_uri_path(trimmed).and_then(|path| {
                Self::normalize_local_image_path_for_workspace(path, workspace_path)
            });
        }
        Self::normalize_local_image_path_for_workspace(trimmed.to_string(), workspace_path)
    }

    fn normalize_file_uri_path(raw_uri: &str) -> Option<String> {
        let without_scheme = raw_uri.strip_prefix("file://")?;
        let (host, path_part) = if without_scheme.starts_with('/') {
            ("", without_scheme.to_string())
        } else if let Some((host, rest)) = without_scheme.split_once('/') {
            (host, format!("/{}", rest))
        } else {
            (without_scheme, "/".to_string())
        };

        let decoded_path = Self::percent_decode_path(&path_part);
        let host_is_windows_drive = Self::has_windows_drive_host(host);
        let is_local_host =
            host.is_empty() || host.eq_ignore_ascii_case("localhost") || host_is_windows_drive;
        let mut normalized = if host_is_windows_drive {
            format!("/{}{}", host, decoded_path)
        } else if is_local_host {
            decoded_path
        } else {
            format!("//{}{}", host, decoded_path)
        };

        if cfg!(windows)
            && is_local_host
            && normalized.starts_with('/')
            && Self::has_windows_drive_prefix(&normalized[1..])
        {
            normalized = normalized[1..].to_string();
        }
        Some(normalized)
    }

    fn percent_decode_path(input: &str) -> String {
        let bytes = input.as_bytes();
        let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
        let mut idx = 0usize;
        while idx < bytes.len() {
            if bytes[idx] == b'%' && idx + 2 < bytes.len() {
                let h1 = bytes[idx + 1];
                let h2 = bytes[idx + 2];
                if let (Some(a), Some(b)) = (Self::hex_value(h1), Self::hex_value(h2)) {
                    out.push((a << 4) | b);
                    idx += 3;
                    continue;
                }
            }
            out.push(bytes[idx]);
            idx += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    fn hex_value(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }

    fn has_windows_drive_prefix(path: &str) -> bool {
        let bytes = path.as_bytes();
        bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'/' || bytes[2] == b'\\')
    }

    fn has_windows_drive_host(host: &str) -> bool {
        let bytes = host.as_bytes();
        bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
    }

    fn normalize_local_image_path_for_workspace(
        path: String,
        workspace_path: &Path,
    ) -> Option<String> {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            return None;
        }
        let candidate = PathBuf::from(trimmed);
        if !candidate.is_absolute() || Self::is_path_within_workspace(&candidate, workspace_path) {
            return Some(trimmed.to_string());
        }
        if let Some(materialized) =
            Self::materialize_external_image_path(&candidate, workspace_path)
        {
            return Some(materialized);
        }
        log::warn!(
            "Gemini image attachment path is outside workspace and could not be copied, forwarding original path: {}",
            candidate.display()
        );
        Some(trimmed.to_string())
    }

    fn is_path_within_workspace(candidate: &Path, workspace_path: &Path) -> bool {
        let normalized_workspace = workspace_path
            .canonicalize()
            .unwrap_or_else(|_| workspace_path.to_path_buf());
        let normalized_candidate = candidate
            .canonicalize()
            .unwrap_or_else(|_| candidate.to_path_buf());
        normalized_candidate.starts_with(normalized_workspace)
    }

    fn materialize_external_image_path(path: &Path, workspace_path: &Path) -> Option<String> {
        let bytes = match std::fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) => {
                log::warn!(
                    "Gemini image attachment failed to read source file {}: {}",
                    path.display(),
                    error
                );
                return None;
            }
        };
        if bytes.is_empty() {
            log::warn!(
                "Gemini image attachment source file is empty, skipping workspace copy: {}",
                path.display()
            );
            return None;
        }
        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_else(|| "png".to_string());
        let sanitized_extension = extension
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric())
            .collect::<String>();
        let extension = if sanitized_extension.is_empty() {
            "png"
        } else {
            sanitized_extension.as_str()
        };
        Self::write_workspace_inline_image_file(workspace_path, extension, &bytes)
    }

    fn write_workspace_inline_image_file(
        workspace_path: &Path,
        extension: &str,
        bytes: &[u8],
    ) -> Option<String> {
        let inline_dir = workspace_path.join(".moss-x-gemini-inline-images");
        if let Err(error) = std::fs::create_dir_all(&inline_dir) {
            log::warn!(
                "Gemini image attachment failed to ensure workspace inline dir {}: {}",
                inline_dir.display(),
                error
            );
            return None;
        }

        let nonce = GEMINI_INLINE_IMAGE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        let file_name = format!(
            "gemini-inline-{}-{}-{}.{}",
            std::process::id(),
            timestamp_ms,
            nonce,
            extension
        );
        let path = inline_dir.join(file_name);

        if let Err(error) = std::fs::write(&path, bytes) {
            log::warn!(
                "Gemini image attachment failed to write workspace inline file {}: {}",
                path.display(),
                error
            );
            return None;
        }

        Some(path.to_string_lossy().to_string())
    }

    fn materialize_data_url_image(raw_data_url: &str, workspace_path: &Path) -> Option<String> {
        let Some((header, payload)) = raw_data_url.split_once(',') else {
            log::warn!("Gemini image attachment data-url is malformed (missing comma), skipping");
            return None;
        };
        let Some(meta) = header.strip_prefix("data:") else {
            log::warn!(
                "Gemini image attachment data-url is malformed (missing data: prefix), skipping"
            );
            return None;
        };
        let mut meta_parts = meta.split(';');
        let mime = meta_parts.next().unwrap_or("image/png").trim();
        let normalized_mime = if mime.is_empty() { "image/png" } else { mime };
        if !normalized_mime.to_ascii_lowercase().starts_with("image/") {
            log::warn!(
                "Gemini image attachment data-url mime is not image/* ({}), skipping",
                normalized_mime
            );
            return None;
        }
        if !meta_parts.any(|entry| entry.eq_ignore_ascii_case("base64")) {
            log::warn!("Gemini image attachment data-url is not base64 encoded, skipping");
            return None;
        }

        let normalized_payload: String = payload.chars().filter(|ch| !ch.is_whitespace()).collect();
        if normalized_payload.is_empty() {
            log::warn!("Gemini image attachment data-url payload is empty, skipping");
            return None;
        }

        let decoded = match STANDARD.decode(normalized_payload.as_bytes()) {
            Ok(bytes) => bytes,
            Err(error) => {
                log::warn!(
                    "Gemini image attachment data-url base64 decode failed, skipping: {}",
                    error
                );
                return None;
            }
        };
        if decoded.is_empty() {
            log::warn!("Gemini image attachment data-url decoded to empty bytes, skipping");
            return None;
        }
        if decoded.len() > GEMINI_INLINE_IMAGE_MAX_BYTES {
            log::warn!(
                "Gemini image attachment data-url exceeds {} bytes (actual={}), skipping",
                GEMINI_INLINE_IMAGE_MAX_BYTES,
                decoded.len()
            );
            return None;
        }

        let extension = Self::image_extension_for_mime(normalized_mime);
        Self::write_workspace_inline_image_file(workspace_path, extension, &decoded)
    }

    fn image_extension_for_mime(mime: &str) -> &'static str {
        match mime.to_ascii_lowercase().as_str() {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/bmp" => "bmp",
            "image/tiff" => "tiff",
            "image/svg+xml" => "svg",
            _ => "png",
        }
    }

    fn escape_path_for_at_reference(path: &str) -> String {
        let normalized_path = Self::normalize_path_for_at_reference(path);
        let path = normalized_path.as_str();
        let mut escaped = String::with_capacity(path.len());
        for ch in path.chars() {
            if ch.is_whitespace() {
                escaped.push('\\');
            }
            escaped.push(ch);
        }
        escaped
    }

    fn normalize_path_for_at_reference(path: &str) -> String {
        if cfg!(windows) {
            // Gemini CLI parses @path tokens inside prompt text. Normalizing Windows
            // separators to POSIX style avoids backslash-escape ambiguity.
            return path.replace('\\', "/");
        }
        path.to_string()
    }

    fn format_image_reference(path: &str) -> String {
        format!("@{}", Self::escape_path_for_at_reference(path))
    }

    fn with_image_references(
        text: &str,
        images: Option<&[String]>,
        workspace_path: &Path,
    ) -> String {
        let Some(images) = images else {
            return text.to_string();
        };
        let mut image_references: Vec<String> = Vec::new();
        for raw in images {
            if let Some(path) = Self::normalize_image_path_for_prompt(raw, workspace_path) {
                let reference = Self::format_image_reference(&path);
                if !image_references
                    .iter()
                    .any(|existing| existing == &reference)
                {
                    image_references.push(reference);
                }
            }
        }
        if image_references.is_empty() {
            return text.to_string();
        }
        let mut merged = text.trim_end().to_string();
        if !merged.is_empty() {
            merged.push_str("\n\n");
        }
        merged.push_str(&image_references.join(" "));
        merged
    }

    fn normalize_auth_mode(raw_mode: Option<&str>) -> Option<&'static str> {
        let normalized = raw_mode
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase())?;
        match normalized.as_str() {
            "custom" => Some("custom"),
            "login_google" => Some("login_google"),
            "gemini_api_key" => Some("gemini_api_key"),
            "vertex_adc" => Some("vertex_adc"),
            "vertex_service_account" => Some("vertex_service_account"),
            "vertex_api_key" => Some("vertex_api_key"),
            _ => None,
        }
    }

    fn selected_auth_type_for_mode(raw_mode: Option<&str>) -> &'static str {
        match Self::normalize_auth_mode(raw_mode) {
            Some("login_google") => "oauth-personal",
            Some("vertex_adc") | Some("vertex_service_account") | Some("vertex_api_key") => {
                "vertex-ai"
            }
            Some("custom") | Some("gemini_api_key") => "gemini-api-key",
            _ => "oauth-personal",
        }
    }

    fn resolve_global_gemini_dir(home_override: Option<&str>) -> Option<PathBuf> {
        let Some(home) = dirs::home_dir() else {
            return None;
        };
        let override_path = home_override
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        let Some(raw_root) = override_path.or(Some(home)) else {
            return None;
        };
        if raw_root
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value == ".gemini")
        {
            return Some(raw_root);
        }
        Some(raw_root.join(".gemini"))
    }

    fn persist_auth_mode_hint(auth_mode: Option<&str>, home_override: Option<&str>) {
        let Some(gemini_dir) = Self::resolve_global_gemini_dir(home_override) else {
            return;
        };
        let selected_type = Self::selected_auth_type_for_mode(auth_mode);
        let settings_path = gemini_dir.join("settings.json");
        let mut root = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();

        let security = root
            .entry("security".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !security.is_object() {
            *security = Value::Object(serde_json::Map::new());
        }
        let Some(security_obj) = security.as_object_mut() else {
            return;
        };

        let auth = security_obj
            .entry("auth".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !auth.is_object() {
            *auth = Value::Object(serde_json::Map::new());
        }
        let Some(auth_obj) = auth.as_object_mut() else {
            return;
        };
        auth_obj.insert(
            "selectedType".to_string(),
            Value::String(selected_type.to_string()),
        );
        auth_obj.insert("useExternal".to_string(), Value::Bool(false));

        if let Some(parent) = settings_path.parent() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                log::warn!(
                    "failed to ensure Gemini settings dir {}: {}",
                    parent.display(),
                    error
                );
                return;
            }
        }
        let content = match serde_json::to_string_pretty(&Value::Object(root)) {
            Ok(serialized) => serialized,
            Err(error) => {
                log::warn!("failed to serialize Gemini settings auth hint: {}", error);
                return;
            }
        };
        if let Err(error) = std::fs::write(&settings_path, content) {
            log::warn!(
                "failed to persist Gemini settings auth hint to {}: {}",
                settings_path.display(),
                error
            );
        }
    }

    fn apply_auth_mode_env_overrides(cmd: &mut Command, auth_mode: Option<&str>) {
        match Self::normalize_auth_mode(auth_mode) {
            Some("login_google") => {
                cmd.env("GOOGLE_GENAI_USE_GCA", "true");
                cmd.env_remove("GOOGLE_GENAI_USE_VERTEXAI");
            }
            Some("vertex_adc") | Some("vertex_service_account") | Some("vertex_api_key") => {
                cmd.env("GOOGLE_GENAI_USE_VERTEXAI", "true");
                cmd.env_remove("GOOGLE_GENAI_USE_GCA");
            }
            Some("custom") | Some("gemini_api_key") => {
                cmd.env_remove("GOOGLE_GENAI_USE_GCA");
                cmd.env_remove("GOOGLE_GENAI_USE_VERTEXAI");
            }
            _ => {}
        }
    }

    fn resolve_approval_mode(access_mode: Option<&str>) -> Option<&'static str> {
        let normalized = access_mode.map(str::trim).filter(|value| !value.is_empty());
        match normalized {
            Some("full-access") => Some("yolo"),
            Some("read-only") => Some("plan"),
            Some("default") => Some("default"),
            // "current" should respect Gemini CLI's own active/default policy.
            Some("current") | None => None,
            // Keep compatibility for unknown/legacy values.
            Some(_) => Some("auto_edit"),
        }
    }

    fn load_vendor_runtime_config() -> GeminiVendorRuntimeConfig {
        let mut result = GeminiVendorRuntimeConfig::default();
        let Ok(config_path) = app_paths::config_file_path() else {
            return result;
        };
        let Ok(content) = std::fs::read_to_string(config_path) else {
            return result;
        };
        let Ok(root) = serde_json::from_str::<Value>(&content) else {
            return result;
        };
        let Some(gemini) = root.get("gemini").and_then(Value::as_object) else {
            return result;
        };
        let enabled = gemini
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        if !enabled {
            return result;
        }
        result.auth_mode = gemini
            .get("auth_mode")
            .or_else(|| gemini.get("authMode"))
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let Some(env_obj) = gemini.get("env").and_then(Value::as_object) else {
            return result;
        };
        for (key, value) in env_obj {
            let normalized_key = key.trim();
            if normalized_key.is_empty() {
                continue;
            }
            let normalized_value = value.as_str().map(|v| v.trim().to_string()).or_else(|| {
                if value.is_null() {
                    None
                } else {
                    Some(value.to_string())
                }
            });
            let Some(normalized_value) = normalized_value else {
                continue;
            };
            if normalized_value.is_empty() {
                continue;
            }
            result
                .env
                .insert(normalized_key.to_string(), normalized_value);
        }
        result
    }

    fn should_pipe_prompt_via_stdin(text: &str) -> bool {
        text.chars().count() > GEMINI_PROMPT_ARG_MAX_CHARS
    }

    fn build_command(&self, params: &SendMessageParams) -> GeminiBuiltCommand {
        let bin = if let Some(ref custom) = self.bin_path {
            custom.clone()
        } else {
            crate::backend::app_server::find_cli_binary("gemini", None)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "gemini".to_string())
        };

        let mut cmd = crate::backend::app_server::build_command_for_binary(&bin);
        cmd.current_dir(&self.workspace_path);
        cmd.arg("--output-format");
        cmd.arg("stream-json");

        if let Some(model) = params
            .model
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            cmd.arg("--model");
            cmd.arg(model);
        }

        if let Some(approval_mode) = Self::resolve_approval_mode(params.access_mode.as_deref()) {
            cmd.arg("--approval-mode");
            cmd.arg(approval_mode);
        }

        if params.continue_session {
            if let Some(session_id) = params
                .session_id
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
            {
                cmd.arg("--resume");
                cmd.arg(session_id);
            }
        }

        if let Some(args) = self.custom_args.as_ref() {
            for arg in args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        let message_text =
            Self::with_external_spec_hint(&params.text, params.custom_spec_root.as_deref());
        let message_text = Self::with_image_references(
            &message_text,
            params.images.as_deref(),
            &self.workspace_path,
        );
        let message_text = Self::with_output_language_hint(&message_text);
        let safe_text = if message_text.starts_with('-') {
            format!(" {}", message_text)
        } else {
            message_text
        };
        let prompt_via_stdin = Self::should_pipe_prompt_via_stdin(&safe_text);
        cmd.arg("--prompt");
        if prompt_via_stdin {
            // Gemini CLI appends stdin content to --prompt. Keep prompt empty and stream
            // the payload to stdin so long text does not rely on argv limits/parsing.
            cmd.arg("");
        } else {
            cmd.arg(&safe_text);
        }

        let vendor_runtime = Self::load_vendor_runtime_config();
        apply_dead_loopback_proxy_guard(&mut cmd, &vendor_runtime.env);
        for (key, value) in &vendor_runtime.env {
            cmd.env(key, value);
        }
        Self::apply_auth_mode_env_overrides(&mut cmd, vendor_runtime.auth_mode.as_deref());
        Self::persist_auth_mode_hint(
            vendor_runtime.auth_mode.as_deref(),
            self.home_dir.as_deref(),
        );

        if let Some(home) = self.home_dir.as_ref() {
            cmd.env("GEMINI_CLI_HOME", home);
        }

        if prompt_via_stdin {
            cmd.stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        GeminiBuiltCommand {
            command: cmd,
            prompt_stdin_payload: if prompt_via_stdin {
                Some(safe_text)
            } else {
                None
            },
        }
    }

    pub async fn send_message(
        &self,
        params: SendMessageParams,
        turn_id: &str,
    ) -> Result<String, String> {
        let turn_started_at = std::time::Instant::now();
        let requested_model = params
            .model
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .unwrap_or("<auto>");
        let resume_session_id_len = params
            .session_id
            .as_ref()
            .map(|value| value.trim().len())
            .unwrap_or(0);
        log::info!(
            "[gemini/send] turn={} workspace={} model={} continue_session={} resume_session_id_len={} images={} access_mode={}",
            turn_id,
            self.workspace_id,
            requested_model,
            params.continue_session,
            resume_session_id_len,
            params.images.as_ref().map(|entries| entries.len()).unwrap_or(0),
            params.access_mode.as_deref().unwrap_or("current"),
        );

        let GeminiBuiltCommand {
            mut command,
            prompt_stdin_payload,
        } = self.build_command(&params);
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let error_msg = format!("Failed to spawn gemini: {}", error);
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
        };
        let spawn_ms = turn_started_at.elapsed().as_millis();

        if let Some(prompt_payload) = prompt_stdin_payload {
            let prompt_chars = prompt_payload.chars().count();
            let Some(mut stdin) = child.stdin.take() else {
                let error_msg = "Failed to capture stdin for Gemini long prompt".to_string();
                let _ = child.kill().await;
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            };
            if let Err(error) = stdin.write_all(prompt_payload.as_bytes()).await {
                let error_msg = format!("Failed to write Gemini prompt to stdin: {}", error);
                let _ = child.kill().await;
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
            if let Err(error) = stdin.flush().await {
                let error_msg = format!("Failed to flush Gemini prompt stdin: {}", error);
                let _ = child.kill().await;
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
            log::info!(
                "[gemini/send] turn={} prompt_transport=stdin prompt_chars={}",
                turn_id,
                prompt_chars
            );
        }

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                let error_msg = "Failed to capture stdout".to_string();
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
        };
        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                let error_msg = "Failed to capture stderr".to_string();
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
        };

        {
            let mut active = self.active_processes.lock().await;
            active.insert(turn_id.to_string(), child);
        }

        self.emit_turn_event(
            turn_id,
            EngineEvent::SessionStarted {
                workspace_id: self.workspace_id.clone(),
                session_id: "pending".to_string(),
                engine: EngineType::Gemini,
                turn_id: Some(turn_id.to_string()),
            },
        );
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnStarted {
                workspace_id: self.workspace_id.clone(),
                turn_id: turn_id.to_string(),
            },
        );

        let stderr_reader = BufReader::new(stderr);
        let stderr_task = tokio::spawn(async move {
            let mut lines = stderr_reader.lines();
            let mut text = String::new();
            while let Ok(Some(line)) = lines.next_line().await {
                text.push_str(&line);
                text.push('\n');
            }
            text
        });

        let mut response_text = String::new();
        let mut saw_turn_completed = false;
        let mut saw_turn_error = false;
        let mut saw_tool_activity = false;
        let mut error_output = String::new();
        let mut session_started_emitted = false;
        let mut new_session_id: Option<String> = None;
        let mut observed_event_types = BTreeSet::new();
        let mut last_reasoning_snapshot = String::new();
        let mut saw_reasoning_output = false;
        let mut emitted_reasoning_texts = BTreeSet::new();
        let mut snapshot_tool_states: HashMap<String, GeminiSnapshotToolState> = HashMap::new();
        let mut last_reasoning_history_sync_at = std::time::Instant::now()
            - std::time::Duration::from_millis(GEMINI_REASONING_HISTORY_SYNC_INTERVAL_MS);
        let mut first_stdout_line_ms: Option<u128> = None;
        let mut first_json_event_ms: Option<u128> = None;
        let mut first_text_delta_ms: Option<u128> = None;
        let mut first_turn_completed_ms: Option<u128> = None;
        let mut first_event_type: Option<String> = None;
        let mut stdout_line_count: usize = 0;

        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }
            stdout_line_count += 1;
            if first_stdout_line_ms.is_none() {
                first_stdout_line_ms = Some(turn_started_at.elapsed().as_millis());
            }
            match serde_json::from_str::<Value>(&line) {
                Ok(event) => {
                    if first_json_event_ms.is_none() {
                        first_json_event_ms = Some(turn_started_at.elapsed().as_millis());
                    }
                    if let Some(event_type) = event.get("type").and_then(|value| value.as_str()) {
                        if first_event_type.is_none() {
                            first_event_type = Some(event_type.to_string());
                        }
                        observed_event_types.insert(event_type.to_string());
                    }
                    if let Some(session_id) = extract_session_id(&event) {
                        if !session_started_emitted {
                            session_started_emitted = true;
                            new_session_id = Some(session_id.clone());
                            self.set_session_id(Some(session_id.clone())).await;
                            self.emit_turn_event(
                                turn_id,
                                EngineEvent::SessionStarted {
                                    workspace_id: self.workspace_id.clone(),
                                    session_id,
                                    engine: EngineType::Gemini,
                                    turn_id: Some(turn_id.to_string()),
                                },
                            );
                        }
                    }
                    let snapshot_tool_events = extract_tool_events_from_snapshot(
                        &self.workspace_id,
                        &event,
                        &mut snapshot_tool_states,
                    );
                    if !snapshot_tool_events.is_empty() {
                        saw_tool_activity = true;
                        for tool_event in snapshot_tool_events {
                            self.emit_turn_event(turn_id, tool_event);
                        }
                    }
                    let parsed_event = parse_gemini_event(&self.workspace_id, &event);
                    if should_extract_thought_fallback(parsed_event.as_ref()) {
                        if let Some(thought_text) = extract_latest_thought_text(&event) {
                            let normalized_thought_text = thought_text.trim().to_string();
                            if !normalized_thought_text.is_empty()
                                && normalized_thought_text != last_reasoning_snapshot
                                && emitted_reasoning_texts.insert(normalized_thought_text.clone())
                            {
                                last_reasoning_snapshot = normalized_thought_text.clone();
                                saw_reasoning_output = true;
                                self.emit_turn_event(
                                    turn_id,
                                    EngineEvent::ReasoningDelta {
                                        workspace_id: self.workspace_id.clone(),
                                        text: normalized_thought_text,
                                    },
                                );
                            }
                        }
                    }
                    if let Some(unified_event) = parsed_event {
                        match &unified_event {
                            EngineEvent::TextDelta { text, .. } => {
                                if first_text_delta_ms.is_none() {
                                    first_text_delta_ms =
                                        Some(turn_started_at.elapsed().as_millis());
                                }
                                response_text.push_str(text);
                            }
                            EngineEvent::ReasoningDelta { text, .. } => {
                                saw_reasoning_output = true;
                                let normalized_text = text.trim().to_string();
                                if !normalized_text.is_empty() {
                                    last_reasoning_snapshot = normalized_text.clone();
                                    emitted_reasoning_texts.insert(normalized_text);
                                }
                            }
                            EngineEvent::ToolStarted { .. } | EngineEvent::ToolCompleted { .. } => {
                                saw_tool_activity = true;
                            }
                            EngineEvent::TurnError { .. } => {
                                saw_turn_error = true;
                            }
                            EngineEvent::TurnCompleted { result, .. } => {
                                if first_turn_completed_ms.is_none() {
                                    first_turn_completed_ms =
                                        Some(turn_started_at.elapsed().as_millis());
                                }
                                saw_turn_completed = true;
                                if response_text.trim().is_empty() {
                                    if let Some(result_text) = result
                                        .as_ref()
                                        .and_then(|value| extract_text_from_value(value, 0))
                                    {
                                        response_text = result_text;
                                    }
                                }
                            }
                            _ => {}
                        }
                        self.emit_turn_event(turn_id, unified_event);
                    }

                    if !saw_reasoning_output
                        && last_reasoning_history_sync_at.elapsed()
                            >= std::time::Duration::from_millis(
                                GEMINI_REASONING_HISTORY_SYNC_INTERVAL_MS,
                            )
                    {
                        last_reasoning_history_sync_at = std::time::Instant::now();
                        let fallback_session_id = if new_session_id.is_some() {
                            new_session_id.clone()
                        } else {
                            self.get_session_id().await
                        };
                        if let Some(session_id) = fallback_session_id {
                            if let Ok(history) = load_gemini_session(
                                &self.workspace_path,
                                &session_id,
                                self.home_dir.as_deref(),
                            )
                            .await
                            {
                                let synced_reasoning =
                                    collect_latest_turn_reasoning_texts(&history.messages);
                                for text in synced_reasoning {
                                    let normalized_text = text.trim().to_string();
                                    if normalized_text.is_empty()
                                        || normalized_text == last_reasoning_snapshot
                                        || !emitted_reasoning_texts.insert(normalized_text.clone())
                                    {
                                        continue;
                                    }
                                    last_reasoning_snapshot = normalized_text.clone();
                                    saw_reasoning_output = true;
                                    self.emit_turn_event(
                                        turn_id,
                                        EngineEvent::ReasoningDelta {
                                            workspace_id: self.workspace_id.clone(),
                                            text: normalized_text,
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
                Err(_) => {
                    error_output.push_str(&line);
                    error_output.push('\n');
                }
            }
        }
        let stdout_eof_ms = turn_started_at.elapsed().as_millis();

        if !saw_reasoning_output {
            let fallback_session_id = if new_session_id.is_some() {
                new_session_id.clone()
            } else {
                self.get_session_id().await
            };
            if let Some(session_id) = fallback_session_id {
                if let Ok(history) =
                    load_gemini_session(&self.workspace_path, &session_id, self.home_dir.as_deref())
                        .await
                {
                    let fallback_reasoning = collect_latest_turn_reasoning_texts(&history.messages);
                    for text in fallback_reasoning {
                        let normalized_text = text.trim().to_string();
                        if normalized_text.is_empty()
                            || normalized_text == last_reasoning_snapshot
                            || !emitted_reasoning_texts.insert(normalized_text.clone())
                        {
                            continue;
                        }
                        last_reasoning_snapshot = normalized_text.clone();
                        self.emit_turn_event(
                            turn_id,
                            EngineEvent::ReasoningDelta {
                                workspace_id: self.workspace_id.clone(),
                                text: normalized_text,
                            },
                        );
                    }
                }
            }
        }

        let mut child = {
            let mut active = self.active_processes.lock().await;
            active.remove(turn_id)
        };
        let status = if let Some(mut process) = child.take() {
            process.wait().await.ok()
        } else {
            None
        };
        let stderr_text = stderr_task.await.unwrap_or_default();
        if !stderr_text.trim().is_empty() {
            error_output.push_str(&stderr_text);
        }
        let completed_ms = turn_started_at.elapsed().as_millis();
        let status_success = status.as_ref().is_some_and(|value| value.success());
        let had_retry_backoff = error_output.contains("Retrying with backoff");
        let had_conn_reset = error_output.contains("ECONNRESET");
        log::info!(
            "[gemini/send][timing] turn={} spawn_ms={} first_stdout_line_ms={:?} first_json_event_ms={:?} first_text_delta_ms={:?} first_turn_completed_ms={:?} stdout_eof_ms={} completed_ms={} stdout_lines={} first_event_type={:?} observed_event_types={} status_success={} saw_turn_completed={} saw_turn_error={} response_chars={} stderr_chars={} retry_backoff={} conn_reset={}",
            turn_id,
            spawn_ms,
            first_stdout_line_ms,
            first_json_event_ms,
            first_text_delta_ms,
            first_turn_completed_ms,
            stdout_eof_ms,
            completed_ms,
            stdout_line_count,
            first_event_type,
            if observed_event_types.is_empty() {
                "none".to_string()
            } else {
                observed_event_types
                    .iter()
                    .cloned()
                    .collect::<Vec<String>>()
                    .join(",")
            },
            status_success,
            saw_turn_completed,
            saw_turn_error,
            response_text.chars().count(),
            error_output.chars().count(),
            had_retry_backoff,
            had_conn_reset,
        );

        if let Some(status) = status {
            if !status.success() {
                let error_msg = if self.interrupted.swap(false, Ordering::SeqCst) {
                    "Session stopped.".to_string()
                } else if !error_output.trim().is_empty() {
                    error_output.trim().to_string()
                } else {
                    format!("Gemini exited with status: {}", status)
                };
                self.emit_error(turn_id, error_msg.clone());
                return Err(error_msg);
            }
        } else if self.interrupted.swap(false, Ordering::SeqCst) {
            let error_msg = "Session stopped.".to_string();
            self.emit_error(turn_id, error_msg.clone());
            return Err(error_msg);
        }

        if response_text.trim().is_empty() && !error_output.trim().is_empty() {
            let error_msg = error_output.trim().to_string();
            self.emit_error(turn_id, error_msg.clone());
            return Err(error_msg);
        }

        if response_text.trim().is_empty() && saw_turn_error {
            return Err("Gemini returned an error event.".to_string());
        }

        if response_text.trim().is_empty() {
            let observed = if observed_event_types.is_empty() {
                "none".to_string()
            } else {
                observed_event_types
                    .iter()
                    .cloned()
                    .collect::<Vec<String>>()
                    .join(", ")
            };
            let reason = if saw_turn_completed {
                "Gemini completed but produced no assistant output."
            } else {
                "Gemini exited without a completion event or assistant output."
            };
            let diagnostic = format!("{reason} Observed event types: {observed}.");
            if !saw_tool_activity {
                self.emit_error(turn_id, diagnostic.clone());
                return Err(diagnostic);
            }
        }

        if let Some(session_id) = new_session_id {
            self.set_session_id(Some(session_id)).await;
        }

        if !saw_turn_completed && !saw_turn_error {
            self.emit_turn_event(
                turn_id,
                EngineEvent::TurnCompleted {
                    workspace_id: self.workspace_id.clone(),
                    result: Some(json!({
                        "text": response_text,
                    })),
                },
            );
        }

        Ok(response_text)
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        self.interrupted.store(true, Ordering::SeqCst);
        let mut active = self.active_processes.lock().await;
        for child in active.values_mut() {
            child
                .kill()
                .await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        active.clear();
        Ok(())
    }

    pub async fn interrupt_turn(&self, turn_id: &str) -> Result<(), String> {
        self.interrupted.store(true, Ordering::SeqCst);
        let mut child = {
            let mut active = self.active_processes.lock().await;
            active.remove(turn_id)
        };
        if let Some(child_proc) = child.as_mut() {
            child_proc
                .kill()
                .await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "gemini_tests.rs"]
mod tests;
