use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

pub(crate) const CLAUDE_SUMMARY_LARGE_LINE_BYTE_BUDGET: usize = 512 * 1024;
pub(crate) const CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET: usize = 256 * 1024;
pub(crate) const CLAUDE_HYDRATED_IMAGE_BASE64_BYTE_BUDGET: usize = 16 * 1024 * 1024;
const CLAUDE_OMITTED_IMAGE_DATA_SENTINEL: &str = "__ccgui_omitted_large_claude_image__";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDeferredImageLocator {
    pub session_id: String,
    pub line_index: usize,
    pub block_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDeferredImage {
    pub locator: ClaudeDeferredImageLocator,
    pub media_type: String,
    pub estimated_byte_size: u64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHydratedImage {
    pub locator: ClaudeDeferredImageLocator,
    pub src: String,
    pub media_type: String,
    pub byte_size: u64,
}

pub(crate) fn is_supported_image_media_type(media_type: Option<&str>) -> bool {
    media_type
        .map(|value| value.trim().to_ascii_lowercase())
        .map(|value| value.starts_with("image/"))
        .unwrap_or(false)
}

pub(crate) fn estimate_base64_decoded_bytes(payload: &str) -> u64 {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return 0;
    }
    let padding = trimmed
        .as_bytes()
        .iter()
        .rev()
        .take_while(|byte| **byte == b'=')
        .count();
    ((trimmed.len().saturating_mul(3)) / 4).saturating_sub(padding) as u64
}

pub(crate) fn parse_claude_summary_entry(line: &str) -> Result<Value, serde_json::Error> {
    if line.len() <= CLAUDE_SUMMARY_LARGE_LINE_BYTE_BUDGET {
        return serde_json::from_str(line);
    }

    // Sidebar listing only needs metadata. Redacting large `source.data` values
    // before serde avoids duplicating screenshot payloads into the summary tree.
    let redacted = redact_json_string_field_values(
        line,
        "data",
        CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET,
        CLAUDE_OMITTED_IMAGE_DATA_SENTINEL,
    );
    serde_json::from_str(&redacted)
}

fn redact_json_string_field_values(
    input: &str,
    target_key: &str,
    value_byte_budget: usize,
    replacement: &str,
) -> String {
    let mut output = String::with_capacity(input.len().min(CLAUDE_SUMMARY_LARGE_LINE_BYTE_BUDGET));
    let mut index = 0;
    let key_pattern = format!("\"{}\"", target_key);

    while let Some(relative_key_start) = input[index..].find(&key_pattern) {
        let key_start = index + relative_key_start;
        output.push_str(&input[index..key_start + key_pattern.len()]);
        let mut cursor = key_start + key_pattern.len();

        while let Some(byte) = input.as_bytes().get(cursor) {
            if byte.is_ascii_whitespace() {
                output.push(*byte as char);
                cursor += 1;
                continue;
            }
            break;
        }

        if input.as_bytes().get(cursor) != Some(&b':') {
            index = cursor;
            continue;
        }
        output.push(':');
        cursor += 1;

        while let Some(byte) = input.as_bytes().get(cursor) {
            if byte.is_ascii_whitespace() {
                output.push(*byte as char);
                cursor += 1;
                continue;
            }
            break;
        }

        if input.as_bytes().get(cursor) != Some(&b'"') {
            index = cursor;
            continue;
        }

        let value_start = cursor + 1;
        let Some(value_end) = find_json_string_end(input, value_start) else {
            index = cursor;
            continue;
        };
        let value = &input[value_start..value_end];
        if value.len() > value_byte_budget {
            output.push('"');
            output.push_str(replacement);
            output.push('"');
        } else {
            output.push_str(&input[cursor..=value_end]);
        }
        index = value_end + 1;
    }

    output.push_str(&input[index..]);
    output
}

fn find_json_string_end(input: &str, value_start: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut cursor = value_start;
    let mut escaped = false;
    while cursor < bytes.len() {
        let byte = bytes[cursor];
        if escaped {
            escaped = false;
        } else if byte == b'\\' {
            escaped = true;
        } else if byte == b'"' {
            return Some(cursor);
        }
        cursor += 1;
    }
    None
}

pub(crate) fn extract_images_and_deferred_from_content(
    content: &Value,
    session_id: &str,
    line_index: usize,
    message_id: Option<&str>,
) -> (Vec<String>, Vec<ClaudeDeferredImage>) {
    let mut images = Vec::new();
    let mut deferred_images = Vec::new();
    let mut seen = HashSet::new();
    let Some(blocks) = content.as_array() else {
        return (images, deferred_images);
    };
    for (block_index, block) in blocks.iter().enumerate() {
        if block.get("type").and_then(Value::as_str) != Some("image") {
            continue;
        }
        let Some(source) = block.get("source").and_then(Value::as_object) else {
            continue;
        };
        let source_type = source
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let image_value = match source_type.as_str() {
            "url" => source
                .get("url")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string),
            "base64" => {
                let media_type = source.get("media_type").and_then(Value::as_str);
                let data = source
                    .get("data")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                if is_supported_image_media_type(media_type) {
                    data.and_then(|payload| {
                        let media_type = media_type.unwrap_or("image/png").to_string();
                        if payload.len() > CLAUDE_EAGER_IMAGE_BASE64_BYTE_BUDGET
                            && !session_id.is_empty()
                        {
                            deferred_images.push(ClaudeDeferredImage {
                                locator: ClaudeDeferredImageLocator {
                                    session_id: session_id.to_string(),
                                    line_index,
                                    block_index,
                                    message_id: message_id.map(ToString::to_string),
                                    media_type: media_type.clone(),
                                },
                                media_type,
                                estimated_byte_size: estimate_base64_decoded_bytes(payload),
                                reason: "large-inline-image".to_string(),
                            });
                            None
                        } else {
                            Some(format!("data:{};base64,{}", media_type, payload))
                        }
                    })
                } else {
                    None
                }
            }
            _ => None,
        };
        if let Some(value) = image_value {
            if seen.insert(value.clone()) {
                images.push(value);
            }
        }
    }
    (images, deferred_images)
}
