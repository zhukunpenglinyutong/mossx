use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

const AGENT_EXPORT_FORMAT: &str = "claude-code-agents-export-v1";
const MAX_IMPORT_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AgentStore {
    #[serde(default)]
    agents: HashMap<String, AgentConfig>,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    selected_agent_id: Option<String>,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSelectedResponse {
    pub selected_agent_id: Option<String>,
    pub agent: Option<AgentConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSetSelectedResult {
    pub success: bool,
    pub agent: Option<AgentConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentExportPayload {
    format: String,
    export_time: String,
    agent_count: usize,
    agents: Vec<AgentConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImportPreviewItem {
    pub data: AgentConfig,
    pub status: String,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImportPreviewSummary {
    pub total: usize,
    pub new_count: usize,
    pub update_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImportPreviewResult {
    pub items: Vec<AgentImportPreviewItem>,
    pub summary: AgentImportPreviewSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImportApplyResult {
    pub success: bool,
    pub imported: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConflictStrategy {
    Skip,
    Overwrite,
    Duplicate,
}

fn parse_conflict_strategy(strategy: &str) -> Result<ConflictStrategy, String> {
    match strategy.trim().to_lowercase().as_str() {
        "skip" => Ok(ConflictStrategy::Skip),
        "overwrite" => Ok(ConflictStrategy::Overwrite),
        "duplicate" => Ok(ConflictStrategy::Duplicate),
        _ => Err(format!("Unsupported conflict strategy: {}", strategy)),
    }
}

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn agent_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    Ok(home.join(".codemoss").join("agent.json"))
}

fn read_agent_store() -> Result<AgentStore, String> {
    let path = agent_file_path()?;
    if !path.exists() {
        return Ok(AgentStore::default());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read agent.json: {}", e))?;
    if content.trim().is_empty() {
        return Ok(AgentStore::default());
    }
    match serde_json::from_str(&content) {
        Ok(store) => Ok(store),
        Err(e) => {
            log::warn!("Corrupted agent.json, resetting to default: {}", e);
            Ok(AgentStore::default())
        }
    }
}

fn write_agent_store(store: &AgentStore) -> Result<(), String> {
    let path = agent_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .codemoss directory: {}", e))?;
    }
    let content = serde_json::to_string(store)
        .map_err(|e| format!("Failed to serialize agent store: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write agent.json: {}", e))
}

fn agent_with_store_key(id: &str, mut agent: AgentConfig) -> AgentConfig {
    if agent.id.trim().is_empty() {
        agent.id = id.to_string();
    }
    agent
}

fn validate_agent(agent: &AgentConfig) -> Result<(), String> {
    let id = agent.id.trim();
    if id.is_empty() {
        return Err("Missing required field: id".to_string());
    }

    let name = agent.name.trim();
    let name_len = name.chars().count();
    if name_len == 0 {
        return Err("Missing required field: name".to_string());
    }
    if name_len > 20 {
        return Err("Agent name must be 1-20 characters".to_string());
    }

    if let Some(prompt) = agent.prompt.as_ref() {
        if prompt.chars().count() > 100_000 {
            return Err("Agent prompt must be less than 100,000 characters".to_string());
        }
    }

    Ok(())
}

fn sanitize_agent(mut agent: AgentConfig) -> AgentConfig {
    agent.id = agent.id.trim().to_string();
    agent.name = agent.name.trim().to_string();
    agent.prompt = agent
        .prompt
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    agent
}

fn sorted_agents(store: &AgentStore) -> Vec<AgentConfig> {
    let mut agents: Vec<AgentConfig> = store
        .agents
        .iter()
        .map(|(id, agent)| agent_with_store_key(id, agent.clone()))
        .collect();

    agents.sort_by(|a, b| {
        let lhs = a.created_at.unwrap_or(0);
        let rhs = b.created_at.unwrap_or(0);
        rhs.cmp(&lhs)
    });
    agents
}

fn generate_unique_id(base_id: &str, existing: &HashMap<String, AgentConfig>) -> String {
    let mut candidate = base_id.to_string();
    let mut suffix = 1usize;
    while existing.contains_key(&candidate) {
        candidate = format!("{}-{}", base_id, suffix);
        suffix += 1;
    }
    candidate
}

fn read_import_file(path: &str) -> Result<Vec<AgentConfig>, String> {
    let file_path = PathBuf::from(path);
    if !file_path.exists() {
        return Err(format!("Import file not found: {}", path));
    }
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to stat import file: {}", e))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE_BYTES {
        return Err("File too large (> 5MB). Please reduce the number of items.".to_string());
    }
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read import file: {}", e))?;
    let payload: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid import JSON: {}", e))?;

    let format = payload
        .get("format")
        .and_then(Value::as_str)
        .ok_or_else(|| "Invalid file format. Expected claude-code-agents-export-v1".to_string())?;
    if format != AGENT_EXPORT_FORMAT {
        return Err("Invalid file format. Expected claude-code-agents-export-v1".to_string());
    }
    let agents_value = payload
        .get("agents")
        .ok_or_else(|| "Invalid file: missing 'agents' field".to_string())?;
    let agents: Vec<AgentConfig> = serde_json::from_value(agents_value.clone())
        .map_err(|e| format!("Invalid agents payload: {}", e))?;
    Ok(agents)
}

#[tauri::command]
pub fn agent_list() -> Result<Vec<AgentConfig>, String> {
    let store = read_agent_store()?;
    Ok(sorted_agents(&store))
}

#[tauri::command]
pub fn agent_add(agent: AgentConfig) -> Result<(), String> {
    let mut store = read_agent_store()?;
    let mut normalized = sanitize_agent(agent);
    validate_agent(&normalized)?;
    if normalized.created_at.is_none() {
        normalized.created_at = Some(now_millis());
    }

    if store.agents.contains_key(&normalized.id) {
        return Err(format!(
            "Agent with id '{}' already exists",
            normalized.id
        ));
    }

    store.agents.insert(normalized.id.clone(), normalized);
    write_agent_store(&store)
}

#[tauri::command]
pub fn agent_update(id: String, updates: Value) -> Result<(), String> {
    let mut store = read_agent_store()?;
    let current = store
        .agents
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("Agent with id '{}' not found", id))?;

    let mut next_value =
        serde_json::to_value(current).map_err(|e| format!("Failed to serialize agent: {}", e))?;
    let next_obj = next_value
        .as_object_mut()
        .ok_or_else(|| "Invalid stored agent payload".to_string())?;
    let update_obj = updates
        .as_object()
        .ok_or_else(|| "Invalid update payload".to_string())?;

    for (key, value) in update_obj {
        if key == "id" || key == "createdAt" || key == "created_at" {
            continue;
        }
        if value.is_null() {
            next_obj.remove(key);
        } else {
            next_obj.insert(key.clone(), value.clone());
        }
    }

    let mut next: AgentConfig = serde_json::from_value(next_value)
        .map_err(|e| format!("Failed to parse updated agent payload: {}", e))?;
    next = sanitize_agent(next);
    validate_agent(&next)?;
    store.agents.insert(id, next);
    write_agent_store(&store)
}

#[tauri::command]
pub fn agent_delete(id: String) -> Result<bool, String> {
    let mut store = read_agent_store()?;
    let removed = store.agents.remove(&id).is_some();
    if !removed {
        return Ok(false);
    }
    if store.selected_agent_id.as_deref() == Some(id.as_str()) {
        store.selected_agent_id = None;
    }
    write_agent_store(&store)?;
    Ok(true)
}

#[tauri::command]
pub fn agent_get_selected() -> Result<AgentSelectedResponse, String> {
    let mut store = read_agent_store()?;
    let mut selected_id = store.selected_agent_id.clone();
    let mut selected_agent = selected_id
        .as_deref()
        .and_then(|id| store.agents.get(id))
        .cloned();

    if selected_id.is_some() && selected_agent.is_none() {
        store.selected_agent_id = None;
        selected_id = None;
        write_agent_store(&store)?;
    }

    if let (Some(id), Some(agent)) = (selected_id.as_deref(), selected_agent.as_mut()) {
        if agent.id.trim().is_empty() {
            agent.id = id.to_string();
        }
    }

    Ok(AgentSelectedResponse {
        selected_agent_id: selected_id,
        agent: selected_agent,
    })
}

#[tauri::command]
pub fn agent_set_selected(agent_id: Option<String>) -> Result<AgentSetSelectedResult, String> {
    let mut store = read_agent_store()?;
    let normalized = agent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    store.selected_agent_id = normalized.clone();
    write_agent_store(&store)?;
    let mut agent = normalized
        .as_deref()
        .and_then(|id| store.agents.get(id))
        .cloned();
    if let (Some(id), Some(value)) = (normalized.as_deref(), agent.as_mut()) {
        if value.id.trim().is_empty() {
            value.id = id.to_string();
        }
    }
    Ok(AgentSetSelectedResult {
        success: true,
        agent,
    })
}

#[tauri::command]
pub fn agent_export(agent_ids: Vec<String>, path: String) -> Result<(), String> {
    let store = read_agent_store()?;
    let selected_ids: std::collections::HashSet<String> = agent_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();

    let mut agents = sorted_agents(&store);
    if !selected_ids.is_empty() {
        agents.retain(|agent| selected_ids.contains(&agent.id));
    }

    let payload = AgentExportPayload {
        format: AGENT_EXPORT_FORMAT.to_string(),
        export_time: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        agent_count: agents.len(),
        agents,
    };

    let export_path = PathBuf::from(&path);
    if let Some(parent) = export_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize export payload: {}", e))?;
    std::fs::write(&export_path, content)
        .map_err(|e| format!("Failed to write export file: {}", e))
}

#[tauri::command]
pub fn agent_import_preview(path: String) -> Result<AgentImportPreviewResult, String> {
    let incoming_agents = read_import_file(&path)?;
    let store = read_agent_store()?;

    let mut items = Vec::with_capacity(incoming_agents.len());
    let mut new_count = 0usize;
    let mut update_count = 0usize;

    for raw_agent in incoming_agents {
        let agent = sanitize_agent(raw_agent);
        let conflict = store.agents.contains_key(agent.id.as_str());
        if conflict {
            update_count += 1;
        } else {
            new_count += 1;
        }
        items.push(AgentImportPreviewItem {
            data: agent,
            status: if conflict {
                "update".to_string()
            } else {
                "new".to_string()
            },
            conflict,
        });
    }

    Ok(AgentImportPreviewResult {
        summary: AgentImportPreviewSummary {
            total: items.len(),
            new_count,
            update_count,
        },
        items,
    })
}

#[tauri::command]
pub fn agent_import_apply(
    agents: Vec<AgentConfig>,
    strategy: String,
) -> Result<AgentImportApplyResult, String> {
    let conflict_strategy = parse_conflict_strategy(&strategy)?;
    let mut store = read_agent_store()?;

    let mut imported = 0usize;
    let mut updated = 0usize;
    let mut skipped = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for raw_agent in agents {
        let mut agent = sanitize_agent(raw_agent);
        if let Err(error) = validate_agent(&agent) {
            skipped += 1;
            errors.push(format!("Validation failed: {}", error));
            continue;
        }

        let has_conflict = store.agents.contains_key(&agent.id);
        if has_conflict {
            match conflict_strategy {
                ConflictStrategy::Skip => {
                    skipped += 1;
                    continue;
                }
                ConflictStrategy::Overwrite => {
                    store.agents.insert(agent.id.clone(), agent);
                    updated += 1;
                }
                ConflictStrategy::Duplicate => {
                    let new_id = generate_unique_id(&agent.id, &store.agents);
                    agent.id = new_id;
                    if agent.created_at.is_none() {
                        agent.created_at = Some(now_millis());
                    }
                    store.agents.insert(agent.id.clone(), agent);
                    imported += 1;
                }
            }
        } else {
            if agent.created_at.is_none() {
                agent.created_at = Some(now_millis());
            }
            store.agents.insert(agent.id.clone(), agent);
            imported += 1;
        }
    }

    write_agent_store(&store)?;

    Ok(AgentImportApplyResult {
        success: errors.is_empty(),
        imported,
        updated,
        skipped,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_agent(id: &str, name: &str, prompt: Option<&str>) -> AgentConfig {
        AgentConfig {
            id: id.to_string(),
            name: name.to_string(),
            prompt: prompt.map(|s| s.to_string()),
            created_at: Some(1000),
            extra: HashMap::new(),
        }
    }

    #[test]
    fn validate_agent_requires_id() {
        let agent = make_agent("", "Agent", None);
        assert!(validate_agent(&agent).is_err());
    }

    #[test]
    fn validate_agent_requires_name() {
        let agent = make_agent("a1", "", None);
        assert!(validate_agent(&agent).is_err());
    }

    #[test]
    fn validate_agent_name_max_20_chars() {
        let long_name: String = "a".repeat(21);
        let agent = make_agent("a1", &long_name, None);
        assert!(validate_agent(&agent).is_err());

        let ok_name: String = "a".repeat(20);
        let agent = make_agent("a1", &ok_name, None);
        assert!(validate_agent(&agent).is_ok());
    }

    #[test]
    fn validate_agent_prompt_max_100k_chars() {
        let long_prompt: String = "x".repeat(100_001);
        let agent = make_agent("a1", "Agent", Some(&long_prompt));
        assert!(validate_agent(&agent).is_err());
    }

    #[test]
    fn validate_agent_success() {
        let agent = make_agent("a1", "My Agent", Some("Do something"));
        assert!(validate_agent(&agent).is_ok());
    }

    #[test]
    fn sanitize_agent_trims_whitespace() {
        let agent = AgentConfig {
            id: "  a1  ".to_string(),
            name: "  Agent  ".to_string(),
            prompt: Some("  prompt  ".to_string()),
            created_at: None,
            extra: HashMap::new(),
        };
        let result = sanitize_agent(agent);
        assert_eq!(result.id, "a1");
        assert_eq!(result.name, "Agent");
        assert_eq!(result.prompt, Some("prompt".to_string()));
    }

    #[test]
    fn sanitize_agent_clears_empty_prompt() {
        let agent = AgentConfig {
            id: "a1".to_string(),
            name: "Agent".to_string(),
            prompt: Some("   ".to_string()),
            created_at: None,
            extra: HashMap::new(),
        };
        let result = sanitize_agent(agent);
        assert!(result.prompt.is_none());
    }

    #[test]
    fn parse_conflict_strategy_valid() {
        assert_eq!(parse_conflict_strategy("skip").unwrap(), ConflictStrategy::Skip);
        assert_eq!(parse_conflict_strategy("overwrite").unwrap(), ConflictStrategy::Overwrite);
        assert_eq!(parse_conflict_strategy("duplicate").unwrap(), ConflictStrategy::Duplicate);
        assert_eq!(parse_conflict_strategy("  SKIP  ").unwrap(), ConflictStrategy::Skip);
    }

    #[test]
    fn parse_conflict_strategy_invalid() {
        assert!(parse_conflict_strategy("invalid").is_err());
    }

    #[test]
    fn generate_unique_id_no_conflict() {
        let existing = HashMap::new();
        assert_eq!(generate_unique_id("agent-1", &existing), "agent-1");
    }

    #[test]
    fn generate_unique_id_with_conflict() {
        let mut existing = HashMap::new();
        existing.insert("agent-1".to_string(), make_agent("agent-1", "A", None));
        let result = generate_unique_id("agent-1", &existing);
        assert_eq!(result, "agent-1-1");
    }

    #[test]
    fn generate_unique_id_multiple_conflicts() {
        let mut existing = HashMap::new();
        existing.insert("x".to_string(), make_agent("x", "A", None));
        existing.insert("x-1".to_string(), make_agent("x-1", "B", None));
        existing.insert("x-2".to_string(), make_agent("x-2", "C", None));
        let result = generate_unique_id("x", &existing);
        assert_eq!(result, "x-3");
    }

    #[test]
    fn sorted_agents_by_created_at_desc() {
        let mut store = AgentStore::default();
        store.agents.insert("a".to_string(), make_agent("a", "Alpha", None));
        store.agents.insert(
            "b".to_string(),
            AgentConfig {
                created_at: Some(2000),
                ..make_agent("b", "Beta", None)
            },
        );
        store.agents.insert(
            "c".to_string(),
            AgentConfig {
                created_at: Some(3000),
                ..make_agent("c", "Gamma", None)
            },
        );
        let sorted = sorted_agents(&store);
        assert_eq!(sorted[0].id, "c");
        assert_eq!(sorted[1].id, "b");
        assert_eq!(sorted[2].id, "a");
    }
}
