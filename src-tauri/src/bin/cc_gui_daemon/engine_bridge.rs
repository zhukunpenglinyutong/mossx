use serde::{Deserialize, Serialize};
use serde_json::Value;

#[path = "../../engine/claude.rs"]
pub mod claude;
#[path = "../../engine/claude_history.rs"]
pub mod claude_history;
#[path = "../../engine/claude_message_content.rs"]
pub(crate) mod claude_message_content;
#[path = "../../engine/codex_adapter.rs"]
pub mod codex_adapter;
#[path = "../../engine/error_mapper.rs"]
pub(crate) mod error_mapper;
#[path = "../../engine/events.rs"]
pub mod events;
#[path = "../../engine/gemini.rs"]
pub mod gemini;
#[path = "../../engine/gemini_history.rs"]
pub mod gemini_history;
#[path = "../../engine/gemini_proxy_guard.rs"]
pub(crate) mod gemini_proxy_guard;
#[path = "../../engine/manager.rs"]
pub mod manager;
#[path = "../../engine/opencode.rs"]
pub mod opencode;
#[path = "../../engine/status.rs"]
pub mod status;

pub use manager::EngineManager;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineType {
    Claude,
    Codex,
    Gemini,
    OpenCode,
}

impl Default for EngineType {
    fn default() -> Self {
        EngineType::Claude
    }
}

impl EngineType {
    pub fn display_name(&self) -> &'static str {
        match self {
            EngineType::Claude => "Claude Code",
            EngineType::Codex => "Codex",
            EngineType::Gemini => "Gemini",
            EngineType::OpenCode => "OpenCode",
        }
    }

    pub fn icon(&self) -> &'static str {
        match self {
            EngineType::Claude => "claude",
            EngineType::Codex => "codex",
            EngineType::Gemini => "gemini",
            EngineType::OpenCode => "opencode",
        }
    }
}

impl std::fmt::Display for EngineType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub engine_type: EngineType,
    pub installed: bool,
    pub version: Option<String>,
    pub bin_path: Option<String>,
    pub home_dir: Option<String>,
    pub models: Vec<ModelInfo>,
    pub default_model: Option<String>,
    pub features: EngineFeatures,
    pub error: Option<String>,
}

impl EngineStatus {
    pub fn not_installed(engine_type: EngineType) -> Self {
        Self {
            engine_type,
            installed: false,
            version: None,
            bin_path: None,
            home_dir: None,
            models: Vec::new(),
            default_model: None,
            features: EngineFeatures::default(),
            error: None,
        }
    }

    pub fn with_error(engine_type: EngineType, error: String) -> Self {
        Self {
            engine_type,
            installed: false,
            version: None,
            bin_path: None,
            home_dir: None,
            models: Vec::new(),
            default_model: None,
            features: EngineFeatures::default(),
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    #[serde(rename = "displayName")]
    pub name: String,
    #[serde(skip_serializing)]
    pub alias: Option<String>,
    #[serde(rename = "isDefault")]
    pub default: bool,
    #[serde(default)]
    pub description: String,
    #[serde(skip_serializing)]
    pub provider: Option<String>,
    #[serde(skip_serializing)]
    pub tags: Vec<String>,
}

impl ModelInfo {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            alias: None,
            default: false,
            description: String::new(),
            provider: None,
            tags: Vec::new(),
        }
    }

    pub fn with_alias(mut self, alias: impl Into<String>) -> Self {
        self.alias = Some(alias.into());
        self
    }

    pub fn as_default(mut self) -> Self {
        self.default = true;
        self
    }

    pub fn with_provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = Some(provider.into());
        self
    }

    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = description.into();
        self
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFeatures {
    pub reasoning_effort: bool,
    pub collaboration_mode: bool,
    pub image_input: bool,
    pub session_resume: bool,
    pub tools_control: bool,
    pub streaming: bool,
    pub mcp: bool,
}

impl EngineFeatures {
    pub fn claude() -> Self {
        Self {
            reasoning_effort: false,
            collaboration_mode: false,
            image_input: true,
            session_resume: true,
            tools_control: true,
            streaming: true,
            mcp: true,
        }
    }

    pub fn codex() -> Self {
        Self {
            reasoning_effort: true,
            collaboration_mode: true,
            image_input: true,
            session_resume: true,
            tools_control: true,
            streaming: true,
            mcp: true,
        }
    }

    pub fn opencode() -> Self {
        Self {
            reasoning_effort: false,
            collaboration_mode: false,
            image_input: false,
            session_resume: true,
            tools_control: true,
            streaming: true,
            mcp: false,
        }
    }

    pub fn gemini() -> Self {
        Self {
            reasoning_effort: false,
            collaboration_mode: false,
            image_input: true,
            session_resume: true,
            tools_control: true,
            streaming: true,
            mcp: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageParams {
    pub text: String,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub access_mode: Option<String>,
    pub images: Option<Vec<String>>,
    pub continue_session: bool,
    pub session_id: Option<String>,
    pub agent: Option<String>,
    pub variant: Option<String>,
    pub collaboration_mode: Option<Value>,
    pub custom_spec_root: Option<String>,
}

impl Default for SendMessageParams {
    fn default() -> Self {
        Self {
            text: String::new(),
            model: None,
            effort: None,
            access_mode: None,
            images: None,
            continue_session: false,
            session_id: None,
            agent: None,
            variant: None,
            collaboration_mode: None,
            custom_spec_root: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfig {
    pub bin_path: Option<String>,
    pub home_dir: Option<String>,
    pub custom_args: Option<String>,
    pub default_model: Option<String>,
}
