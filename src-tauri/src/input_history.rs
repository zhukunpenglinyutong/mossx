use serde_json::{json, Value};
use std::path::PathBuf;

const MAX_HISTORY_ITEMS: usize = 200;
const MAX_COUNT_RECORDS: usize = 200;

fn history_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Unable to resolve home directory")?;
    Ok(home.join(".codemoss").join("inputHistory.json"))
}

fn read_history_file() -> Result<Value, String> {
    let path = history_file_path()?;
    if !path.exists() {
        return Ok(json!({ "items": [], "counts": {} }));
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: Value = serde_json::from_str(&data).unwrap_or(json!({ "items": [], "counts": {} }));
    Ok(parsed)
}

fn write_history_file(data: &Value) -> Result<(), String> {
    let path = history_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

fn cleanup_counts(counts: &Value) -> Value {
    let obj = match counts.as_object() {
        Some(o) => o,
        None => return json!({}),
    };
    if obj.len() <= MAX_COUNT_RECORDS {
        return counts.clone();
    }
    let mut entries: Vec<(&String, i64)> = obj
        .iter()
        .map(|(k, v)| (k, v.as_i64().unwrap_or(0)))
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    let kept: serde_json::Map<String, Value> = entries
        .into_iter()
        .take(MAX_COUNT_RECORDS)
        .map(|(k, v)| (k.clone(), json!(v)))
        .collect();
    Value::Object(kept)
}

#[tauri::command]
pub(crate) fn input_history_read() -> Result<Value, String> {
    read_history_file()
}

#[tauri::command]
pub(crate) fn input_history_record(fragments: Vec<String>) -> Result<Value, String> {
    if fragments.is_empty() {
        let data = read_history_file()?;
        return Ok(data);
    }

    let data = read_history_file()?;
    let items_val = data.get("items").cloned().unwrap_or(json!([]));
    let counts_val = data.get("counts").cloned().unwrap_or(json!({}));

    let mut items: Vec<String> = items_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut counts = counts_val.as_object().cloned().unwrap_or_default();

    // Increment counts for each fragment
    for fragment in &fragments {
        let current = counts.get(fragment).and_then(|v| v.as_i64()).unwrap_or(0);
        counts.insert(fragment.clone(), json!(current + 1));
    }

    // Cleanup counts
    let cleaned_counts = cleanup_counts(&Value::Object(counts));

    // Remove existing fragments to avoid duplicates
    let fragments_set: std::collections::HashSet<&str> =
        fragments.iter().map(|s| s.as_str()).collect();
    items.retain(|item| !fragments_set.contains(item.as_str()));

    // Append new fragments
    items.extend(fragments);

    // Keep only last MAX_HISTORY_ITEMS
    if items.len() > MAX_HISTORY_ITEMS {
        let start = items.len() - MAX_HISTORY_ITEMS;
        items = items[start..].to_vec();
    }

    let result = json!({
        "items": items,
        "counts": cleaned_counts,
    });
    write_history_file(&result)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn input_history_delete(item: String) -> Result<Value, String> {
    let data = read_history_file()?;
    let items_val = data.get("items").cloned().unwrap_or(json!([]));
    let counts_val = data.get("counts").cloned().unwrap_or(json!({}));

    let items: Vec<String> = items_val
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .filter(|s| s != &item)
                .collect()
        })
        .unwrap_or_default();

    let mut counts = counts_val.as_object().cloned().unwrap_or_default();
    counts.remove(&item);

    let result = json!({
        "items": items,
        "counts": Value::Object(counts),
    });
    write_history_file(&result)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn input_history_clear() -> Result<(), String> {
    write_history_file(&json!({ "items": [], "counts": {} }))
}
