use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use ignore::WalkBuilder;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
struct CodeIntelPosition {
    line: u32,
    character: u32,
}

#[derive(Debug, Clone, Serialize)]
struct CodeIntelRange {
    start: CodeIntelPosition,
    end: CodeIntelPosition,
}

#[derive(Debug, Clone, Serialize)]
struct CodeIntelLocation {
    uri: String,
    path: String,
    range: CodeIntelRange,
}

#[derive(Debug, Clone)]
struct SymbolAtCursor {
    symbol: String,
    method_like: bool,
}

#[derive(Debug, Clone)]
struct FileSnapshot {
    absolute: PathBuf,
    content: String,
}

#[derive(Debug, Clone)]
struct YamlPropertyEntry {
    full_key: String,
    line: u32,
    key_start: u32,
    key_end: u32,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum LanguageKind {
    Java,
    Python,
    TsJs,
    Go,
    Yaml,
}

impl LanguageKind {
    fn from_path(path: &str) -> Option<Self> {
        let ext = Path::new(path)
            .extension()
            .and_then(OsStr::to_str)
            .map(|value| value.to_ascii_lowercase())?;
        match ext.as_str() {
            "java" => Some(Self::Java),
            "py" | "pyi" => Some(Self::Python),
            "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => Some(Self::TsJs),
            "go" => Some(Self::Go),
            "yml" | "yaml" => Some(Self::Yaml),
            _ => None,
        }
    }

    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Java => &["java"],
            Self::Python => &["py", "pyi"],
            Self::TsJs => &["ts", "tsx", "js", "jsx", "mjs", "cjs"],
            Self::Go => &["go"],
            Self::Yaml => &["yml", "yaml"],
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Java => "Java",
            Self::Python => "Python",
            Self::TsJs => "TS/JS",
            Self::Go => "Go",
            Self::Yaml => "YAML",
        }
    }
}

const CODE_INTEL_MAX_FILE_BYTES: u64 = 2_000_000;
const MAX_CODE_INTEL_RESULTS: usize = 500;

fn is_identifier_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | ".pnpm"
            | "target"
            | "build"
            | "dist"
            | "out"
            | ".gradle"
            | "__pycache__"
            | ".mypy_cache"
            | ".pytest_cache"
            | "venv"
            | ".venv"
            | "vendor"
    )
}

fn read_file_snapshot(workspace_root: &Path, relative_path: &str) -> Result<FileSnapshot, String> {
    let candidate = workspace_root.join(relative_path);
    let absolute = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;
    if !absolute.starts_with(workspace_root) {
        return Err("Invalid file path".to_string());
    }
    let metadata =
        std::fs::metadata(&absolute).map_err(|err| format!("Failed to stat file: {err}"))?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }
    if metadata.len() > CODE_INTEL_MAX_FILE_BYTES {
        return Err("File is too large for code intelligence".to_string());
    }
    let content =
        std::fs::read_to_string(&absolute).map_err(|err| format!("Failed to read file: {err}"))?;
    Ok(FileSnapshot { absolute, content })
}

fn load_file_snapshot(workspace_root: &Path, absolute: &Path) -> Option<FileSnapshot> {
    if !absolute.starts_with(workspace_root) {
        return None;
    }
    let metadata = std::fs::metadata(absolute).ok()?;
    if !metadata.is_file() || metadata.len() > CODE_INTEL_MAX_FILE_BYTES {
        return None;
    }
    let content = std::fs::read_to_string(absolute).ok()?;
    Some(FileSnapshot {
        absolute: absolute.to_path_buf(),
        content,
    })
}

fn find_line_bounds(content: &str, target_line: usize) -> Option<(usize, usize)> {
    let mut start = 0usize;
    let mut line_index = 0usize;
    for segment in content.split_inclusive('\n') {
        let end = start + segment.len();
        let line_end = if segment.ends_with('\n') {
            end.saturating_sub(1)
        } else {
            end
        };
        if line_index == target_line {
            return Some((start, line_end));
        }
        start = end;
        line_index += 1;
    }
    if line_index == target_line && start <= content.len() {
        Some((start, content.len()))
    } else {
        None
    }
}

fn offset_to_line_character(content: &str, offset: usize) -> CodeIntelPosition {
    let mut line = 0u32;
    let mut character = 0u32;
    for (idx, ch) in content.char_indices() {
        if idx >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            character = 0;
        } else {
            character += 1;
        }
    }
    CodeIntelPosition { line, character }
}

fn symbol_at_cursor(content: &str, line: u32, character: u32) -> Option<SymbolAtCursor> {
    let (line_start, line_end) = find_line_bounds(content, line as usize)?;
    let line_text = &content[line_start..line_end];
    let chars: Vec<char> = line_text.chars().collect();
    if chars.is_empty() {
        return None;
    }

    let mut cursor = character as usize;
    if cursor >= chars.len() {
        cursor = chars.len().saturating_sub(1);
    }
    if !is_identifier_char(chars[cursor]) {
        if cursor > 0 && is_identifier_char(chars[cursor - 1]) {
            cursor -= 1;
        } else {
            return None;
        }
    }

    let mut start = cursor;
    while start > 0 && is_identifier_char(chars[start - 1]) {
        start -= 1;
    }
    let mut end = cursor;
    while end + 1 < chars.len() && is_identifier_char(chars[end + 1]) {
        end += 1;
    }
    let symbol: String = chars[start..=end].iter().collect();
    if symbol.is_empty() {
        return None;
    }

    let start_byte = line_text
        .char_indices()
        .nth(start)
        .map(|(idx, _)| idx)
        .unwrap_or(0);
    let end_byte = line_text
        .char_indices()
        .nth(end + 1)
        .map(|(idx, _)| idx)
        .unwrap_or(line_text.len());
    let suffix = &line_text[end_byte..];
    let prefix = &line_text[..start_byte];
    let method_like = suffix.trim_start().starts_with('(') || prefix.trim_end().ends_with('.');

    Some(SymbolAtCursor {
        symbol,
        method_like,
    })
}

fn parse_yaml_property_entries(content: &str) -> Vec<YamlPropertyEntry> {
    let mut entries = Vec::new();
    let mut stack: Vec<(usize, String)> = Vec::new();

    for (line_idx, raw_line) in content.lines().enumerate() {
        let line = raw_line.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }

        let mut indent = line.chars().take_while(|c| *c == ' ').count();
        let mut segment = &line[indent..];
        if segment.starts_with('#') {
            continue;
        }
        if segment.starts_with("- ") {
            indent += 2;
            segment = &segment[2..];
        }
        if segment.starts_with('#') || segment.is_empty() {
            continue;
        }

        let Some(colon_pos) = segment.find(':') else {
            continue;
        };
        let key_zone = &segment[..colon_pos];
        let key_trimmed = key_zone.trim();
        if key_trimmed.is_empty() {
            continue;
        }

        let (key_clean, quoted) = if (key_trimmed.starts_with('"')
            && key_trimmed.ends_with('"')
            && key_trimmed.len() >= 2)
            || (key_trimmed.starts_with('\'')
                && key_trimmed.ends_with('\'')
                && key_trimmed.len() >= 2)
        {
            (&key_trimmed[1..key_trimmed.len() - 1], true)
        } else {
            (key_trimmed, false)
        };
        if key_clean.is_empty() {
            continue;
        }
        if !key_clean
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
        {
            continue;
        }

        while let Some((last_indent, _)) = stack.last() {
            if indent <= *last_indent {
                stack.pop();
            } else {
                break;
            }
        }

        let full_key = if let Some((_, parent)) = stack.last() {
            format!("{parent}.{key_clean}")
        } else {
            key_clean.to_string()
        };

        let zone_rel = key_zone.find(key_trimmed).unwrap_or(0);
        let mut key_start = indent + zone_rel;
        if quoted {
            key_start += 1;
        }
        let key_end = key_start + key_clean.len();
        entries.push(YamlPropertyEntry {
            full_key: full_key.clone(),
            line: line_idx as u32,
            key_start: key_start as u32,
            key_end: key_end as u32,
        });

        let value_part = segment[colon_pos + 1..].trim();
        if value_part.is_empty()
            || value_part.starts_with('#')
            || value_part == "|"
            || value_part == ">"
        {
            stack.push((indent, full_key));
        }
    }

    entries
}

fn yaml_key_at_cursor(content: &str, line: u32, character: u32) -> Option<String> {
    let entries = parse_yaml_property_entries(content);
    for entry in entries.iter().rev() {
        if entry.line == line && character >= entry.key_start && character <= entry.key_end {
            return Some(entry.full_key.clone());
        }
    }
    None
}

fn symbol_at_cursor_for_language(
    content: &str,
    line: u32,
    character: u32,
    language: LanguageKind,
) -> Option<SymbolAtCursor> {
    if language == LanguageKind::Yaml {
        return yaml_key_at_cursor(content, line, character).map(|key| SymbolAtCursor {
            symbol: key,
            method_like: false,
        });
    }
    symbol_at_cursor(content, line, character)
}

fn collect_language_files(workspace_root: &Path, language: LanguageKind) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let extensions = language.extensions();
    let walker = WalkBuilder::new(workspace_root)
        .hidden(false)
        .follow_links(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                return !should_skip_dir(&name);
            }
            true
        })
        .build();

    for entry in walker.flatten() {
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        let Some(ext) = entry.path().extension().and_then(OsStr::to_str) else {
            continue;
        };
        let ext = ext.to_ascii_lowercase();
        if extensions
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(ext.as_str()))
        {
            files.push(entry.path().to_path_buf());
        }
    }
    files
}

fn file_uri_from_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.starts_with('/') {
        format!("file://{normalized}")
    } else {
        format!("file:///{normalized}")
    }
}

fn build_location(
    workspace_root: &Path,
    file: &Path,
    content: &str,
    start_offset: usize,
    symbol_len: usize,
) -> Option<CodeIntelLocation> {
    let relative = file.strip_prefix(workspace_root).ok()?;
    let relative = relative.to_string_lossy().replace('\\', "/");
    let start = offset_to_line_character(content, start_offset);
    let end = CodeIntelPosition {
        line: start.line,
        character: start.character + symbol_len as u32,
    };
    Some(CodeIntelLocation {
        uri: file_uri_from_path(file),
        path: relative,
        range: CodeIntelRange { start, end },
    })
}

fn always_keep_line(_: &str, _: usize) -> bool {
    true
}

fn is_java_method_declaration_line(line_text: &str, symbol_start: usize) -> bool {
    let prefix = line_text[..symbol_start].trim_end();
    if prefix.is_empty() || prefix.ends_with('.') {
        return false;
    }
    let last = prefix
        .split_whitespace()
        .last()
        .unwrap_or_default()
        .trim_matches(|c: char| c == '<' || c == '>' || c == ',' || c == '?');
    if matches!(
        last,
        "if" | "for"
            | "while"
            | "switch"
            | "catch"
            | "new"
            | "return"
            | "throw"
            | "case"
            | "package"
            | "import"
    ) {
        return false;
    }
    true
}

fn collect_definition_matches<F>(
    workspace_root: &Path,
    files: &[PathBuf],
    re: &Regex,
    symbol_len: usize,
    keep_line: F,
) -> Vec<CodeIntelLocation>
where
    F: Fn(&str, usize) -> bool + Copy,
{
    let mut locations = Vec::new();
    for file in files {
        let Some(snapshot) = load_file_snapshot(workspace_root, file) else {
            continue;
        };
        for captures in re.captures_iter(&snapshot.content) {
            let Some(matched_symbol) = captures.get(1) else {
                continue;
            };
            let position = offset_to_line_character(&snapshot.content, matched_symbol.start());
            let Some((line_start, line_end)) =
                find_line_bounds(&snapshot.content, position.line as usize)
            else {
                continue;
            };
            let line_text = &snapshot.content[line_start..line_end];
            let line_relative_start = matched_symbol.start().saturating_sub(line_start);
            if !keep_line(line_text, line_relative_start) {
                continue;
            }
            if let Some(location) = build_location(
                workspace_root,
                &snapshot.absolute,
                &snapshot.content,
                matched_symbol.start(),
                symbol_len,
            ) {
                locations.push(location);
            }
        }
    }
    locations
}

fn find_class_like_definitions(
    workspace_root: &Path,
    language: LanguageKind,
    symbol: &str,
    files: &[PathBuf],
) -> Vec<CodeIntelLocation> {
    let escaped = regex::escape(symbol);
    let symbol_len = symbol.chars().count();
    let patterns: Vec<String> = match language {
        LanguageKind::Java => vec![format!(
            r"\b(?:class|interface|enum|record)\s+({escaped})\b"
        )],
        LanguageKind::Python => vec![format!(r"(?m)^[ \t]*class[ \t]+({escaped})\b")],
        LanguageKind::TsJs => vec![format!(
            r"(?m)^[ \t]*(?:export[ \t]+(?:default[ \t]+)?)?(?:abstract[ \t]+)?(?:class|interface|type|enum)[ \t]+({escaped})\b"
        )],
        LanguageKind::Go => vec![format!(r"(?m)^[ \t]*type[ \t]+({escaped})\b")],
        LanguageKind::Yaml => Vec::new(),
    };

    let mut locations = Vec::new();
    for pattern in patterns {
        let Ok(re) = Regex::new(&pattern) else {
            continue;
        };
        locations.extend(collect_definition_matches(
            workspace_root,
            files,
            &re,
            symbol_len,
            always_keep_line,
        ));
    }
    locations
}

fn find_callable_definitions(
    workspace_root: &Path,
    language: LanguageKind,
    symbol: &str,
    files: &[PathBuf],
) -> Vec<CodeIntelLocation> {
    let escaped = regex::escape(symbol);
    let symbol_len = symbol.chars().count();
    let mut locations = Vec::new();

    match language {
        LanguageKind::Java => {
            let Ok(re) = Regex::new(&format!(r"\b({escaped})\s*\(")) else {
                return locations;
            };
            locations.extend(collect_definition_matches(
                workspace_root,
                files,
                &re,
                symbol_len,
                is_java_method_declaration_line,
            ));
        }
        LanguageKind::Python => {
            let Ok(re) = Regex::new(&format!(
                r"(?m)^[ \t]*(?:async[ \t]+)?def[ \t]+({escaped})\b"
            )) else {
                return locations;
            };
            locations.extend(collect_definition_matches(
                workspace_root,
                files,
                &re,
                symbol_len,
                always_keep_line,
            ));
        }
        LanguageKind::TsJs => {
            let patterns = vec![
                format!(
                    r"(?m)^[ \t]*(?:export[ \t]+(?:default[ \t]+)?)?(?:async[ \t]+)?function(?:\s*\*)?[ \t]+({escaped})\b"
                ),
                format!(
                    r"(?m)^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+({escaped})[ \t]*=[ \t]*(?:async[ \t]+)?(?:function\b|\()"
                ),
                format!(
                    r"(?m)^[ \t]*(?:public|private|protected|static|readonly|async|get|set)?[ \t]*({escaped})[ \t]*\([^;\n]*\)[ \t]*(?::[^{{=\n]+)?\{{"
                ),
            ];
            for pattern in patterns {
                let Ok(re) = Regex::new(&pattern) else {
                    continue;
                };
                locations.extend(collect_definition_matches(
                    workspace_root,
                    files,
                    &re,
                    symbol_len,
                    always_keep_line,
                ));
            }
        }
        LanguageKind::Go => {
            let Ok(re) = Regex::new(&format!(
                r"(?m)^[ \t]*func[ \t]+(?:\([^)]*\)[ \t]*)?({escaped})\b"
            )) else {
                return locations;
            };
            locations.extend(collect_definition_matches(
                workspace_root,
                files,
                &re,
                symbol_len,
                always_keep_line,
            ));
        }
        LanguageKind::Yaml => {}
    }

    locations
}

fn find_references(
    workspace_root: &Path,
    language: LanguageKind,
    symbol: &str,
    method_like: bool,
    files: &[PathBuf],
) -> Vec<CodeIntelLocation> {
    let escaped = regex::escape(symbol);
    let symbol_len = symbol.chars().count();
    let pattern = match (language, method_like) {
        (LanguageKind::Python, _) => format!(r"\b({escaped})\b"),
        (_, true) => format!(r"\b({escaped})\s*\("),
        (_, false) => format!(r"\b({escaped})\b"),
    };

    let Ok(re) = Regex::new(&pattern) else {
        return Vec::new();
    };

    let mut locations = Vec::new();
    for file in files {
        let Some(snapshot) = load_file_snapshot(workspace_root, file) else {
            continue;
        };
        for captures in re.captures_iter(&snapshot.content) {
            let Some(matched_symbol) = captures.get(1) else {
                continue;
            };
            if let Some(location) = build_location(
                workspace_root,
                &snapshot.absolute,
                &snapshot.content,
                matched_symbol.start(),
                symbol_len,
            ) {
                locations.push(location);
            }
        }
    }
    locations
}

fn to_camel_case(segment: &str) -> String {
    let mut output = String::new();
    let mut upper_next = false;
    for ch in segment.chars() {
        if ch == '-' || ch == '_' || ch == '.' {
            upper_next = true;
            continue;
        }
        if upper_next {
            output.extend(ch.to_uppercase());
            upper_next = false;
        } else {
            output.push(ch);
        }
    }
    output
}

fn segment_candidates(segment: &str) -> Vec<String> {
    let mut values = HashSet::new();
    if !segment.is_empty() {
        values.insert(segment.to_string());
        values.insert(segment.to_ascii_lowercase());
        let camel = to_camel_case(segment);
        if !camel.is_empty() {
            values.insert(camel);
        }
    }
    values.into_iter().collect()
}

fn parse_config_properties_matches(
    workspace_root: &Path,
    snapshot: &FileSnapshot,
    key: &str,
    include_fields: bool,
) -> Vec<CodeIntelLocation> {
    let mut locations = Vec::new();
    let re_prefix_named = Regex::new(
        r#"@ConfigurationProperties\s*\((?s:[^)]*?)prefix\s*=\s*"([A-Za-z0-9_.-]+)"(?s:[^)]*?)\)"#,
    )
    .expect("valid regex");
    let re_prefix_pos = Regex::new(r#"@ConfigurationProperties\s*\(\s*"([A-Za-z0-9_.-]+)"\s*\)"#)
        .expect("valid regex");
    let re_class =
        Regex::new(r#"\b(class|record)\s+([A-Za-z_][A-Za-z0-9_]*)\b"#).expect("valid regex");
    let re_field = Regex::new(
        r#"(?m)^[ \t]*(?:private|protected|public)[ \t]+(?:static[ \t]+)?(?:final[ \t]+)?[A-Za-z_][A-Za-z0-9_<>,.?\[\]]*[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?:[=;])"#,
    )
    .expect("valid regex");

    let mut apply_annotation = |captures: regex::Captures<'_>| {
        let Some(prefix_match) = captures.get(1) else {
            return;
        };
        let prefix = prefix_match.as_str();
        if !(key == prefix || key.starts_with(&format!("{prefix}."))) {
            return;
        }
        if let Some(location) = build_location(
            workspace_root,
            &snapshot.absolute,
            &snapshot.content,
            prefix_match.start(),
            prefix.chars().count(),
        ) {
            locations.push(location);
        }

        let Some(annotation_match) = captures.get(0) else {
            return;
        };
        let class_search_start = annotation_match.end();
        let class_slice = &snapshot.content[class_search_start..];
        let Some(class_cap) = re_class.captures(class_slice) else {
            return;
        };
        let Some(class_name_match) = class_cap.get(2) else {
            return;
        };
        let class_name_offset = class_search_start + class_name_match.start();
        if let Some(location) = build_location(
            workspace_root,
            &snapshot.absolute,
            &snapshot.content,
            class_name_offset,
            class_name_match.as_str().chars().count(),
        ) {
            locations.push(location);
        }

        if !include_fields {
            return;
        }

        let remainder = key
            .strip_prefix(prefix)
            .map(|value| value.trim_start_matches('.'))
            .unwrap_or_default();
        if remainder.is_empty() {
            return;
        }
        let first_segment = remainder.split('.').next().unwrap_or_default();
        if first_segment.is_empty() {
            return;
        }
        let candidates = segment_candidates(first_segment);
        if candidates.is_empty() {
            return;
        }

        let Some(class_decl_match) = class_cap.get(0) else {
            return;
        };
        let class_decl_abs = class_search_start + class_decl_match.start();
        let class_body = &snapshot.content[class_decl_abs..];
        for field_cap in re_field.captures_iter(class_body) {
            let Some(field_name_match) = field_cap.get(1) else {
                continue;
            };
            let field_name = field_name_match.as_str();
            if !candidates.iter().any(|candidate| candidate == field_name) {
                continue;
            }
            let field_offset = class_decl_abs + field_name_match.start();
            if let Some(location) = build_location(
                workspace_root,
                &snapshot.absolute,
                &snapshot.content,
                field_offset,
                field_name.chars().count(),
            ) {
                locations.push(location);
            }
        }
    };

    for captures in re_prefix_named.captures_iter(&snapshot.content) {
        apply_annotation(captures);
    }
    for captures in re_prefix_pos.captures_iter(&snapshot.content) {
        apply_annotation(captures);
    }

    locations
}

fn find_yaml_to_java_definitions(
    workspace_root: &Path,
    key: &str,
    java_files: &[PathBuf],
) -> Vec<CodeIntelLocation> {
    let mut locations = Vec::new();
    for file in java_files {
        let Some(snapshot) = load_file_snapshot(workspace_root, file) else {
            continue;
        };
        locations.extend(parse_config_properties_matches(
            workspace_root,
            &snapshot,
            key,
            true,
        ));
    }
    locations
}

fn find_yaml_to_java_references(
    workspace_root: &Path,
    key: &str,
    java_files: &[PathBuf],
) -> Vec<CodeIntelLocation> {
    let mut locations = Vec::new();
    let escaped_key = regex::escape(key);
    let re_value = Regex::new(&format!(
        r#"@Value\s*\(\s*["']\$\{{({escaped_key})(?::[^}}]*)?\}}["']\s*\)"#
    ))
    .expect("valid regex");
    let re_property_method = Regex::new(&format!(
        r#"\b(?:getProperty|getRequiredProperty|containsProperty)\s*\(\s*["']({escaped_key})["']"#
    ))
    .expect("valid regex");

    for file in java_files {
        let Some(snapshot) = load_file_snapshot(workspace_root, file) else {
            continue;
        };

        for captures in re_value.captures_iter(&snapshot.content) {
            let Some(key_match) = captures.get(1) else {
                continue;
            };
            if let Some(location) = build_location(
                workspace_root,
                &snapshot.absolute,
                &snapshot.content,
                key_match.start(),
                key_match.as_str().chars().count(),
            ) {
                locations.push(location);
            }
        }

        for captures in re_property_method.captures_iter(&snapshot.content) {
            let Some(key_match) = captures.get(1) else {
                continue;
            };
            if let Some(location) = build_location(
                workspace_root,
                &snapshot.absolute,
                &snapshot.content,
                key_match.start(),
                key_match.as_str().chars().count(),
            ) {
                locations.push(location);
            }
        }

        locations.extend(parse_config_properties_matches(
            workspace_root,
            &snapshot,
            key,
            false,
        ));
    }

    locations
}

fn dedupe_locations(locations: Vec<CodeIntelLocation>) -> Vec<CodeIntelLocation> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for location in locations {
        let key = format!(
            "{}:{}:{}",
            location.path, location.range.start.line, location.range.start.character
        );
        if seen.insert(key) {
            deduped.push(location);
        }
    }
    deduped
}

fn sort_locations_by_relevance(
    locations: &mut Vec<CodeIntelLocation>,
    source_path: &str,
    language: LanguageKind,
    symbol: &str,
    method_like: bool,
) {
    let source = source_path.replace('\\', "/");
    let source_parent = Path::new(&source)
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let expected_type_file = match language {
        LanguageKind::Java if !method_like => Some(format!("{symbol}.java")),
        _ => None,
    };

    locations.sort_by(|left, right| {
        let left_same_file = left.path == source;
        let right_same_file = right.path == source;
        if left_same_file != right_same_file {
            return right_same_file.cmp(&left_same_file);
        }

        if let Some(expected_file_name) = expected_type_file.as_ref() {
            let left_file_name = Path::new(&left.path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            let right_file_name = Path::new(&right.path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            let left_expected = left_file_name == *expected_file_name;
            let right_expected = right_file_name == *expected_file_name;
            if left_expected != right_expected {
                return right_expected.cmp(&left_expected);
            }
        }

        let left_same_parent = !source_parent.is_empty() && left.path.starts_with(&source_parent);
        let right_same_parent = !source_parent.is_empty() && right.path.starts_with(&source_parent);
        if left_same_parent != right_same_parent {
            return right_same_parent.cmp(&left_same_parent);
        }

        left.path
            .cmp(&right.path)
            .then(left.range.start.line.cmp(&right.range.start.line))
            .then(left.range.start.character.cmp(&right.range.start.character))
    });
}

#[tauri::command]
pub async fn code_intel_definition(
    workspace_id: String,
    file_path: String,
    line: u32,
    character: u32,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let language = LanguageKind::from_path(&file_path).ok_or_else(|| {
        "Code intelligence currently supports YAML, Python, TS/JS, Go, and Java files".to_string()
    })?;

    let workspace_root = {
        let workspaces = state.workspaces.lock().await;
        let workspace_path = workspaces
            .get(&workspace_id)
            .map(|entry| PathBuf::from(&entry.path))
            .ok_or_else(|| "Workspace not found".to_string())?;
        workspace_path
            .canonicalize()
            .map_err(|err| format!("Failed to resolve workspace root: {err}"))?
    };

    let source = read_file_snapshot(&workspace_root, &file_path)?;
    let symbol = symbol_at_cursor_for_language(&source.content, line, character, language)
        .ok_or_else(|| "No symbol under cursor".to_string())?;

    let mut locations = if language == LanguageKind::Yaml {
        let java_files = collect_language_files(&workspace_root, LanguageKind::Java);
        let mut definitions =
            find_yaml_to_java_definitions(&workspace_root, &symbol.symbol, &java_files);
        if definitions.is_empty() {
            definitions =
                find_yaml_to_java_references(&workspace_root, &symbol.symbol, &java_files);
        }
        definitions
    } else {
        let language_files = collect_language_files(&workspace_root, language);
        let mut defs = if symbol.method_like {
            find_callable_definitions(&workspace_root, language, &symbol.symbol, &language_files)
        } else {
            find_class_like_definitions(&workspace_root, language, &symbol.symbol, &language_files)
        };
        if defs.is_empty() {
            defs = if symbol.method_like {
                find_class_like_definitions(
                    &workspace_root,
                    language,
                    &symbol.symbol,
                    &language_files,
                )
            } else {
                find_callable_definitions(
                    &workspace_root,
                    language,
                    &symbol.symbol,
                    &language_files,
                )
            };
        }
        defs
    };

    locations = dedupe_locations(locations);
    sort_locations_by_relevance(
        &mut locations,
        &file_path,
        language,
        &symbol.symbol,
        symbol.method_like,
    );
    if locations.len() > MAX_CODE_INTEL_RESULTS {
        locations.truncate(MAX_CODE_INTEL_RESULTS);
    }

    Ok(json!({
        "filePath": file_path,
        "line": line,
        "character": character,
        "language": language.name(),
        "result": locations,
    }))
}

#[tauri::command]
pub async fn code_intel_references(
    workspace_id: String,
    file_path: String,
    line: u32,
    character: u32,
    include_declaration: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let language = LanguageKind::from_path(&file_path).ok_or_else(|| {
        "Code intelligence currently supports YAML, Python, TS/JS, Go, and Java files".to_string()
    })?;

    let workspace_root = {
        let workspaces = state.workspaces.lock().await;
        let workspace_path = workspaces
            .get(&workspace_id)
            .map(|entry| PathBuf::from(&entry.path))
            .ok_or_else(|| "Workspace not found".to_string())?;
        workspace_path
            .canonicalize()
            .map_err(|err| format!("Failed to resolve workspace root: {err}"))?
    };

    let source = read_file_snapshot(&workspace_root, &file_path)?;
    let symbol = symbol_at_cursor_for_language(&source.content, line, character, language)
        .ok_or_else(|| "No symbol under cursor".to_string())?;

    let mut references = if language == LanguageKind::Yaml {
        let java_files = collect_language_files(&workspace_root, LanguageKind::Java);
        let definitions = dedupe_locations(find_yaml_to_java_definitions(
            &workspace_root,
            &symbol.symbol,
            &java_files,
        ));
        let mut refs = find_yaml_to_java_references(&workspace_root, &symbol.symbol, &java_files);
        if include_declaration.unwrap_or(false) {
            refs.extend(definitions.clone());
        } else {
            let definition_keys: HashSet<String> = definitions
                .into_iter()
                .map(|location| {
                    format!(
                        "{}:{}:{}",
                        location.path, location.range.start.line, location.range.start.character
                    )
                })
                .collect();
            refs.retain(|location| {
                let key = format!(
                    "{}:{}:{}",
                    location.path, location.range.start.line, location.range.start.character
                );
                !definition_keys.contains(&key)
            });
        }
        refs
    } else {
        let language_files = collect_language_files(&workspace_root, language);
        let mut refs = find_references(
            &workspace_root,
            language,
            &symbol.symbol,
            symbol.method_like,
            &language_files,
        );
        if !include_declaration.unwrap_or(false) {
            let mut definitions = if symbol.method_like {
                find_callable_definitions(
                    &workspace_root,
                    language,
                    &symbol.symbol,
                    &language_files,
                )
            } else {
                find_class_like_definitions(
                    &workspace_root,
                    language,
                    &symbol.symbol,
                    &language_files,
                )
            };
            if definitions.is_empty() {
                definitions = if symbol.method_like {
                    find_class_like_definitions(
                        &workspace_root,
                        language,
                        &symbol.symbol,
                        &language_files,
                    )
                } else {
                    find_callable_definitions(
                        &workspace_root,
                        language,
                        &symbol.symbol,
                        &language_files,
                    )
                };
            }
            let definition_keys: HashSet<String> = dedupe_locations(definitions)
                .into_iter()
                .map(|location| {
                    format!(
                        "{}:{}:{}",
                        location.path, location.range.start.line, location.range.start.character
                    )
                })
                .collect();
            refs.retain(|location| {
                let key = format!(
                    "{}:{}:{}",
                    location.path, location.range.start.line, location.range.start.character
                );
                !definition_keys.contains(&key)
            });
        }
        refs
    };

    references = dedupe_locations(references);
    sort_locations_by_relevance(
        &mut references,
        &file_path,
        language,
        &symbol.symbol,
        symbol.method_like,
    );
    if references.len() > MAX_CODE_INTEL_RESULTS {
        references.truncate(MAX_CODE_INTEL_RESULTS);
    }

    Ok(json!({
        "filePath": file_path,
        "line": line,
        "character": character,
        "includeDeclaration": include_declaration.unwrap_or(false),
        "language": language.name(),
        "result": references,
    }))
}
