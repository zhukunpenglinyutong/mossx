//! Gemini engine implementation
//!
//! Handles Gemini CLI execution via:
//! `gemini -p "<prompt>" --output-format stream-json`

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Map, Value};
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
        let Some(home) = dirs::home_dir() else {
            return result;
        };
        let config_path = home.join(".codemoss").join("config.json");
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
            prompt_stdin_payload: if prompt_via_stdin { Some(safe_text) } else { None },
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
                                    first_text_delta_ms = Some(turn_started_at.elapsed().as_millis());
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

fn first_non_empty_str<'a>(candidates: &[Option<&'a str>]) -> Option<&'a str> {
    for value in candidates {
        if let Some(text) = value {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn extract_text_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 4 {
        return None;
    }
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    if let Some(array) = value.as_array() {
        let mut merged = String::new();
        for item in array {
            if let Some(text) = extract_text_from_value(item, depth + 1) {
                if !merged.is_empty() {
                    merged.push('\n');
                }
                merged.push_str(&text);
            }
        }
        return if merged.trim().is_empty() {
            None
        } else {
            Some(merged)
        };
    }
    if let Some(object) = value.as_object() {
        let direct = first_non_empty_str(&[
            object.get("delta").and_then(|v| v.as_str()),
            object.get("text").and_then(|v| v.as_str()),
            object.get("message").and_then(|v| v.as_str()),
            object.get("content").and_then(|v| v.as_str()),
        ]);
        if let Some(text) = direct {
            return Some(text.to_string());
        }
        for key in [
            "content", "message", "part", "parts", "result", "output", "response", "data",
            "payload",
        ] {
            if let Some(nested) = object.get(key) {
                if let Some(text) = extract_text_from_value(nested, depth + 1) {
                    return Some(text);
                }
            }
        }
    }
    None
}

fn normalize_session_id_candidate(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("pending") {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return None;
    }
    if trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    Some(trimmed.to_string())
}

fn extract_session_id_from_object(object: &Map<String, Value>, depth: usize) -> Option<String> {
    let direct = first_non_empty_str(&[
        object.get("session_id").and_then(|value| value.as_str()),
        object.get("sessionId").and_then(|value| value.as_str()),
    ])
    .and_then(normalize_session_id_candidate);
    if direct.is_some() {
        return direct;
    }

    if let Some(session) = object.get("session").and_then(|value| value.as_object()) {
        let nested = first_non_empty_str(&[
            session.get("session_id").and_then(|value| value.as_str()),
            session.get("sessionId").and_then(|value| value.as_str()),
            session.get("id").and_then(|value| value.as_str()),
        ])
        .and_then(normalize_session_id_candidate);
        if nested.is_some() {
            return nested;
        }
    }

    if depth >= 3 {
        return None;
    }

    for key in [
        "result", "payload", "data", "message", "event", "metadata", "thread", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(session_id) = extract_session_id_from_value(nested, depth + 1) {
                return Some(session_id);
            }
        }
    }
    None
}

fn extract_session_id_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 3 {
        return None;
    }
    if let Some(object) = value.as_object() {
        return extract_session_id_from_object(object, depth);
    }
    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(session_id) = extract_session_id_from_value(item, depth + 1) {
                return Some(session_id);
            }
        }
    }
    None
}

fn extract_session_id(event: &Value) -> Option<String> {
    extract_session_id_from_value(event, 0)
}

fn extract_result_error_message(event: &Value) -> Option<String> {
    if let Some(error) = event.get("error") {
        if let Some(message) = extract_text_from_value(error, 0) {
            return Some(message);
        }
        if let Some(message) = error
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(message.to_string());
        }
    }
    first_non_empty_str(&[event.get("message").and_then(|value| value.as_str())])
        .map(|value| value.to_string())
}

fn extract_thought_entry_text(thought: &Value) -> Option<String> {
    let subject = first_non_empty_str(&[
        thought.get("subject").and_then(|value| value.as_str()),
        thought.get("title").and_then(|value| value.as_str()),
    ]);
    let description = first_non_empty_str(&[
        thought.get("description").and_then(|value| value.as_str()),
        thought.get("detail").and_then(|value| value.as_str()),
        thought.get("text").and_then(|value| value.as_str()),
        thought.get("message").and_then(|value| value.as_str()),
    ]);
    match (subject, description) {
        (Some(sub), Some(desc)) => Some(format!("{}: {}", sub, desc)),
        (Some(sub), None) => Some(sub.to_string()),
        (None, Some(desc)) => Some(desc.to_string()),
        (None, None) => None,
    }
}

fn extract_latest_thought_text_from_value(value: &Value, depth: usize) -> Option<String> {
    if depth > 6 {
        return None;
    }
    if let Some(thoughts) = value
        .get("thoughts")
        .and_then(|candidate| candidate.as_array())
    {
        if let Some(latest) = thoughts.iter().rev().find_map(extract_thought_entry_text) {
            return Some(latest);
        }
    }

    if let Some(text) = value
        .get("thought")
        .and_then(extract_thought_entry_text)
        .or_else(|| {
            value
                .get("currentThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| {
            value
                .get("latestThought")
                .and_then(extract_thought_entry_text)
        })
    {
        return Some(text);
    }

    if let Some(array) = value.as_array() {
        for item in array.iter().rev() {
            if let Some(latest) = extract_latest_thought_text_from_value(item, depth + 1) {
                return Some(latest);
            }
        }
        return None;
    }

    let Some(object) = value.as_object() else {
        return None;
    };

    for key in [
        "message", "messages", "item", "items", "content", "data", "payload", "result", "response",
        "event", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(latest) = extract_latest_thought_text_from_value(nested, depth + 1) {
                return Some(latest);
            }
        }
    }

    for nested in object.values() {
        if let Some(latest) = extract_latest_thought_text_from_value(nested, depth + 1) {
            return Some(latest);
        }
    }
    None
}

fn extract_latest_thought_text(event: &Value) -> Option<String> {
    extract_latest_thought_text_from_value(event, 0)
}

fn extract_reasoning_event_text(event: &Value) -> Option<String> {
    extract_event_text(event)
        .or_else(|| extract_thought_entry_text(event))
        .or_else(|| event.get("thought").and_then(extract_thought_entry_text))
        .or_else(|| {
            event
                .get("currentThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| {
            event
                .get("latestThought")
                .and_then(extract_thought_entry_text)
        })
        .or_else(|| extract_latest_thought_text(event))
}

fn parse_completion_event(workspace_id: &str, event: &Value) -> Option<EngineEvent> {
    let status = event
        .get("status")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());
    let is_error_status = status
        .as_deref()
        .is_some_and(|value| matches!(value, "error" | "failed" | "cancelled" | "canceled"));
    let has_error_payload = event.get("error").is_some_and(|value| !value.is_null());
    if is_error_status || has_error_payload {
        let message = extract_result_error_message(event).unwrap_or_else(|| {
            if let Some(value) = status.as_deref() {
                format!("Gemini result status: {}", value)
            } else {
                "Gemini returned an error result.".to_string()
            }
        });
        return Some(EngineEvent::TurnError {
            workspace_id: workspace_id.to_string(),
            error: message,
            code: None,
        });
    }

    let result_text = event
        .get("text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            event
                .get("response")
                .and_then(|value| extract_text_from_value(value, 0))
        })
        .or_else(|| {
            event
                .get("result")
                .and_then(|value| extract_text_from_value(value, 0))
        });
    let result_payload = if let Some(text) = result_text {
        Some(json!({
            "text": text,
            "raw": event,
        }))
    } else {
        Some(event.clone())
    };
    Some(EngineEvent::TurnCompleted {
        workspace_id: workspace_id.to_string(),
        result: result_payload,
    })
}

fn collect_latest_turn_reasoning_texts(messages: &[GeminiSessionMessage]) -> Vec<String> {
    let mut collected_reversed: Vec<String> = Vec::new();
    for message in messages.iter().rev() {
        if message.role.eq_ignore_ascii_case("user") {
            break;
        }
        if !message.kind.eq_ignore_ascii_case("reasoning") {
            continue;
        }
        let trimmed = message.text.trim();
        if trimmed.is_empty() {
            continue;
        }
        collected_reversed.push(trimmed.to_string());
    }
    collected_reversed.reverse();
    collected_reversed
}

fn extract_event_text(event: &Value) -> Option<String> {
    first_non_empty_str(&[
        event.get("delta").and_then(|v| v.as_str()),
        event.get("text").and_then(|v| v.as_str()),
        event.get("message").and_then(|v| v.as_str()),
    ])
    .map(|s| s.to_string())
    .or_else(|| {
        event
            .get("content")
            .and_then(|value| extract_text_from_value(value, 0))
    })
    .or_else(|| extract_text_from_value(event, 0))
    .filter(|value| !value.trim().is_empty())
}

fn contains_reasoning_keyword(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    normalized.contains("reason") || normalized.contains("think") || normalized.contains("thought")
}

fn is_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number.as_i64().is_some_and(|n| n != 0),
        Some(Value::String(raw)) => {
            let normalized = raw.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        _ => false,
    }
}

fn should_treat_message_as_reasoning(event: &Value, role: &str) -> bool {
    if contains_reasoning_keyword(role) {
        return true;
    }
    let kind = event
        .get("kind")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if contains_reasoning_keyword(kind) {
        return true;
    }
    let channel = event
        .get("channel")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if contains_reasoning_keyword(channel) {
        return true;
    }
    is_truthy(event.get("isThought").or_else(|| event.get("is_thought")))
        || is_truthy(
            event
                .get("isReasoning")
                .or_else(|| event.get("is_reasoning")),
        )
}

fn is_reasoning_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "reasoning"
            | "reasoning_delta"
            | "thinking"
            | "thinking_delta"
            | "thought"
            | "thought_delta"
    ) || contains_reasoning_keyword(&normalized)
}

fn is_text_like_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "text"
            | "content_delta"
            | "text_delta"
            | "output_text_delta"
            | "assistant_message_delta"
            | "message_delta"
            | "assistant_message"
    ) || normalized.contains("message")
        || normalized.contains("text")
}

fn is_completion_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "result"
            | "done"
            | "complete"
            | "completed"
            | "final"
            | "turn_completed"
            | "turn.complete"
            | "response_complete"
            | "response.completed"
    )
}

fn is_response_item_event_type(event_type: &str) -> bool {
    let normalized = event_type.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }
    matches!(
        normalized.as_str(),
        "response_item"
            | "response.item"
            | "response_item_added"
            | "response.output_item.added"
            | "response_output_item_added"
            | "response.output_item.delta"
            | "response_output_item_delta"
            | "response.output_item.done"
            | "response_output_item_done"
    ) || (normalized.contains("response") && normalized.contains("item"))
}

fn extract_response_item_payload<'a>(event: &'a Value) -> Option<&'a Value> {
    for key in [
        "payload",
        "item",
        "output_item",
        "outputItem",
        "message",
        "part",
        "data",
        "response",
    ] {
        if let Some(value) = event.get(key) {
            return Some(value);
        }
    }
    None
}

fn parse_response_item_event(
    workspace_id: &str,
    event_type: &str,
    event: &Value,
) -> Option<EngineEvent> {
    let payload = extract_response_item_payload(event).unwrap_or(event);
    if let Some(payload_type) = payload.get("type").and_then(|value| value.as_str()) {
        let normalized_event_type = event_type.trim().to_ascii_lowercase();
        let normalized_payload_type = payload_type.trim().to_ascii_lowercase();
        if !normalized_payload_type.is_empty() && normalized_payload_type != normalized_event_type {
            if let Some(parsed) = parse_gemini_event(workspace_id, payload) {
                return Some(parsed);
            }
        }
    }

    let role = payload
        .get("role")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if role == "user" || role == "system" {
        return None;
    }
    if should_treat_message_as_reasoning(payload, &role) {
        let text = extract_reasoning_event_text(payload)?;
        return Some(EngineEvent::ReasoningDelta {
            workspace_id: workspace_id.to_string(),
            text,
        });
    }
    let text = extract_event_text(payload)?;
    Some(EngineEvent::TextDelta {
        workspace_id: workspace_id.to_string(),
        text,
    })
}

fn should_extract_thought_fallback(parsed_event: Option<&EngineEvent>) -> bool {
    !matches!(parsed_event, Some(EngineEvent::ReasoningDelta { .. }))
}

fn find_tool_calls_array<'a>(value: &'a Value, depth: usize) -> Option<&'a Vec<Value>> {
    if depth > 6 {
        return None;
    }

    if let Some(calls) = value.get("toolCalls").and_then(Value::as_array) {
        if !calls.is_empty() {
            return Some(calls);
        }
    }
    if let Some(calls) = value.get("tool_calls").and_then(Value::as_array) {
        if !calls.is_empty() {
            return Some(calls);
        }
    }

    if let Some(array) = value.as_array() {
        for item in array.iter().rev() {
            if let Some(calls) = find_tool_calls_array(item, depth + 1) {
                return Some(calls);
            }
        }
        return None;
    }

    let Some(object) = value.as_object() else {
        return None;
    };

    for key in [
        "message", "messages", "item", "items", "content", "data", "payload", "result", "response",
        "event", "turn",
    ] {
        if let Some(nested) = object.get(key) {
            if let Some(calls) = find_tool_calls_array(nested, depth + 1) {
                return Some(calls);
            }
        }
    }

    for nested in object.values() {
        if let Some(calls) = find_tool_calls_array(nested, depth + 1) {
            return Some(calls);
        }
    }

    None
}

fn extract_tool_events_from_snapshot(
    workspace_id: &str,
    event: &Value,
    tool_states: &mut HashMap<String, GeminiSnapshotToolState>,
) -> Vec<EngineEvent> {
    let Some(tool_calls) = find_tool_calls_array(event, 0) else {
        return Vec::new();
    };
    let mut events: Vec<EngineEvent> = Vec::new();

    for (index, call) in tool_calls.iter().enumerate() {
        let Some(call_object) = call.as_object() else {
            continue;
        };

        let tool_id = first_non_empty_str(&[
            call_object.get("id").and_then(|value| value.as_str()),
            call_object.get("toolId").and_then(|value| value.as_str()),
            call_object
                .get("tool_use_id")
                .and_then(|value| value.as_str()),
            call_object
                .get("toolUseId")
                .and_then(|value| value.as_str()),
            call_object.get("callId").and_then(|value| value.as_str()),
            call_object.get("call_id").and_then(|value| value.as_str()),
        ])
        .map(str::to_string)
        .unwrap_or_else(|| format!("gemini-tool-call-{}", index + 1));

        let tool_name = first_non_empty_str(&[
            call_object
                .get("displayName")
                .and_then(|value| value.as_str()),
            call_object.get("name").and_then(|value| value.as_str()),
            call_object.get("toolName").and_then(|value| value.as_str()),
            call_object.get("tool").and_then(|value| value.as_str()),
        ])
        .unwrap_or("tool")
        .to_string();

        let input = call_object
            .get("args")
            .cloned()
            .or_else(|| call_object.get("input").cloned())
            .or_else(|| call_object.get("parameters").cloned())
            .or_else(|| call_object.get("arguments").cloned());

        let mut output = call_object
            .get("result")
            .cloned()
            .filter(|value| !value.is_null())
            .or_else(|| call_object.get("output").cloned())
            .or_else(|| call_object.get("response").cloned());

        let result_display = first_non_empty_str(&[
            call_object
                .get("resultDisplay")
                .and_then(|value| value.as_str()),
            call_object
                .get("result_display")
                .and_then(|value| value.as_str()),
            call_object.get("display").and_then(|value| value.as_str()),
        ])
        .map(str::to_string);
        if output.is_none() {
            if let Some(display) = result_display.clone() {
                output = Some(Value::String(display));
            }
        }

        let status = first_non_empty_str(&[
            call_object.get("status").and_then(|value| value.as_str()),
            call_object.get("phase").and_then(|value| value.as_str()),
            call_object.get("state").and_then(|value| value.as_str()),
        ])
        .map(|value| value.trim().to_ascii_lowercase());
        let status_is_completed = status.as_deref().is_some_and(|value| {
            matches!(
                value,
                "done"
                    | "completed"
                    | "complete"
                    | "success"
                    | "succeeded"
                    | "failed"
                    | "failure"
                    | "error"
                    | "cancelled"
                    | "canceled"
            )
        });
        let status_is_failed = status
            .as_deref()
            .is_some_and(|value| value.contains("fail") || value.contains("error"));
        let explicit_completion = call_object.get("endedAt").is_some()
            || call_object.get("completedAt").is_some()
            || is_truthy(
                call_object
                    .get("completed")
                    .or_else(|| call_object.get("isCompleted"))
                    .or_else(|| call_object.get("done")),
            );
        let has_completion = output.is_some() || status_is_completed || explicit_completion;

        let error_text = first_non_empty_str(&[
            call_object.get("error").and_then(|value| value.as_str()),
            call_object.get("message").and_then(|value| value.as_str()),
        ])
        .map(str::to_string)
        .or_else(|| {
            if status_is_failed {
                Some("Tool execution failed".to_string())
            } else {
                None
            }
        });

        let completion_output = match (input.clone(), output.clone()) {
            (Some(input_value), Some(output_value)) => Some(json!({
                "_input": input_value,
                "_output": output_value,
            })),
            (None, Some(output_value)) => Some(output_value),
            (Some(input_value), None) if error_text.is_some() => Some(json!({
                "_input": input_value,
            })),
            _ => None,
        };

        let state = tool_states.entry(tool_id.clone()).or_default();
        if !state.started_emitted {
            events.push(EngineEvent::ToolStarted {
                workspace_id: workspace_id.to_string(),
                tool_id: tool_id.clone(),
                tool_name: tool_name.clone(),
                input: input.clone(),
            });
            state.started_emitted = true;
        }

        if !has_completion {
            continue;
        }

        let completion_signature = serde_json::to_string(&json!({
            "output": completion_output,
            "error": error_text,
            "status": status,
        }))
        .unwrap_or_default();
        if state.completed_signature.as_deref() == Some(completion_signature.as_str()) {
            continue;
        }
        state.completed_signature = Some(completion_signature);
        events.push(EngineEvent::ToolCompleted {
            workspace_id: workspace_id.to_string(),
            tool_id,
            tool_name: Some(tool_name),
            output: completion_output,
            error: error_text,
        });
    }

    events
}

fn parse_gemini_event(workspace_id: &str, event: &Value) -> Option<EngineEvent> {
    let event_type = event.get("type").and_then(|v| v.as_str())?;
    if is_response_item_event_type(event_type) {
        if let Some(parsed) = parse_response_item_event(workspace_id, event_type, event) {
            return Some(parsed);
        }
    }
    match event_type {
        "text"
        | "content_delta"
        | "text_delta"
        | "output_text_delta"
        | "assistant_message_delta"
        | "message_delta"
        | "assistant_message" => {
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "reasoning" | "reasoning_delta" | "thinking" | "thinking_delta" | "thought"
        | "thought_delta" => {
            let text = extract_reasoning_event_text(event)?;
            Some(EngineEvent::ReasoningDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "message" => {
            let role = event
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if role == "user" || role == "system" {
                return None;
            }
            if should_treat_message_as_reasoning(event, &role) {
                let text = extract_reasoning_event_text(event)?;
                return Some(EngineEvent::ReasoningDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "gemini" => {
            let role = event
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if role == "user" || role == "system" {
                return None;
            }
            let text = extract_event_text(event)?;
            Some(EngineEvent::TextDelta {
                workspace_id: workspace_id.to_string(),
                text,
            })
        }
        "tool_use" => {
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("toolId").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
            ])?
            .to_string();
            let tool_name = first_non_empty_str(&[
                event.get("tool_name").and_then(|v| v.as_str()),
                event.get("toolName").and_then(|v| v.as_str()),
                event.get("name").and_then(|v| v.as_str()),
            ])
            .unwrap_or("tool")
            .to_string();
            let input = event
                .get("parameters")
                .cloned()
                .or_else(|| event.get("args").cloned())
                .or_else(|| event.get("input").cloned());
            Some(EngineEvent::ToolStarted {
                workspace_id: workspace_id.to_string(),
                tool_id,
                tool_name,
                input,
            })
        }
        "tool_result" => {
            let tool_id = first_non_empty_str(&[
                event.get("tool_id").and_then(|v| v.as_str()),
                event.get("toolId").and_then(|v| v.as_str()),
                event.get("id").and_then(|v| v.as_str()),
            ])?
            .to_string();
            let status = event
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let error = first_non_empty_str(&[
                event.get("error").and_then(|v| v.as_str()),
                event.get("message").and_then(|v| v.as_str()),
            ])
            .map(|s| s.to_string())
            .or_else(|| {
                if status.contains("fail") || status.contains("error") {
                    Some("Tool execution failed".to_string())
                } else {
                    None
                }
            });
            let output = event
                .get("output")
                .cloned()
                .or_else(|| event.get("result").cloned())
                .or_else(|| event.get("response").cloned());
            Some(EngineEvent::ToolCompleted {
                workspace_id: workspace_id.to_string(),
                tool_id,
                tool_name: event
                    .get("tool_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                output,
                error,
            })
        }
        "error" => {
            let message = first_non_empty_str(&[
                event.get("error").and_then(|v| v.as_str()),
                event.get("message").and_then(|v| v.as_str()),
            ])
            .map(|s| s.to_string())
            .unwrap_or_else(|| serde_json::to_string(event).unwrap_or_default());
            Some(EngineEvent::TurnError {
                workspace_id: workspace_id.to_string(),
                error: message,
                code: None,
            })
        }
        "result" => parse_completion_event(workspace_id, event),
        _ => {
            if is_completion_event_type(event_type) {
                return parse_completion_event(workspace_id, event);
            }
            if is_reasoning_event_type(event_type) {
                let text = extract_reasoning_event_text(event)?;
                return Some(EngineEvent::ReasoningDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            if is_text_like_event_type(event_type) {
                let text = extract_event_text(event)?;
                return Some(EngineEvent::TextDelta {
                    workspace_id: workspace_id.to_string(),
                    text,
                });
            }
            None
        }
    }
}


#[cfg(test)]
#[path = "gemini_tests.rs"]
mod tests;
