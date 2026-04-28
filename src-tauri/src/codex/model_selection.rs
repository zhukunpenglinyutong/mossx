use serde_json::Value;

pub(super) fn normalize_model_id(candidate: Option<String>) -> Option<String> {
    candidate
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn pick_model_from_model_list_response(response: &Value) -> Option<String> {
    let entries = response
        .get("result")
        .and_then(|result| result.get("data"))
        .or_else(|| response.get("data"))
        .and_then(Value::as_array)?;

    let pick_from_entry = |entry: &Value| {
        let model = entry
            .get("model")
            .and_then(Value::as_str)
            .or_else(|| entry.get("id").and_then(Value::as_str));
        model
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    };

    entries
        .iter()
        .find(|entry| {
            entry
                .get("isDefault")
                .or_else(|| entry.get("is_default"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .and_then(pick_from_entry)
        .or_else(|| entries.iter().find_map(pick_from_entry))
}

#[cfg(test)]
mod tests {
    use super::{normalize_model_id, pick_model_from_model_list_response};
    use serde_json::json;

    #[test]
    fn normalize_model_id_trims_and_filters_empty() {
        assert_eq!(
            normalize_model_id(Some(" gpt-5 ".to_string())),
            Some("gpt-5".to_string())
        );
        assert_eq!(normalize_model_id(Some("   ".to_string())), None);
        assert_eq!(normalize_model_id(None), None);
    }

    #[test]
    fn pick_model_prefers_default_entry() {
        let response = json!({
            "result": {
                "data": [
                    { "id": "openai/gpt-4.1", "isDefault": false },
                    { "model": "openai/gpt-5.3-codex", "isDefault": true }
                ]
            }
        });
        assert_eq!(
            pick_model_from_model_list_response(&response),
            Some("openai/gpt-5.3-codex".to_string())
        );
    }

    #[test]
    fn pick_model_falls_back_to_first_entry() {
        let response = json!({
            "data": [
                { "id": "openai/gpt-5-mini" },
                { "model": "openai/gpt-5.3-codex" }
            ]
        });
        assert_eq!(
            pick_model_from_model_list_response(&response),
            Some("openai/gpt-5-mini".to_string())
        );
    }
}
