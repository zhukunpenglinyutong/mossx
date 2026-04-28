pub(super) fn build_commit_message_prompt(diff: &str, language: Option<&str>) -> String {
    let normalized_language = language
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "zh".to_string());

    let intro = match normalized_language.as_str() {
        "en" => {
            "Please generate a commit message. The commit message must follow the Conventional Commits specification and be written entirely in English.\
Please provide the complete commit message: the title should follow the Conventional Commits format, and the body should describe the content, reasons, and impact of this change in detail."
        }
        _ => {
            "请生成一次提交（commit）信息，提交信息需遵循 Conventional Commits 规范，并且全部使用中文。\
请提供完整提交信息：标题按 Conventional Commits 格式编写，正文需详细描述本次变更的内容、原因和影响。"
        }
    };

    format!("{intro}\n\nChanges:\n{diff}")
}
