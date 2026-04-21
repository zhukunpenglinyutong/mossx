use super::*;

pub(super) const MODE_BLOCKED_REASON: &str =
    "requestUserInput is blocked while effective_mode=code";
pub(super) const MODE_BLOCKED_SUGGESTION: &str =
    "Switch to Plan mode and resend the prompt when user input is needed.";
pub(super) const MODE_BLOCKED_REASON_CODE_REQUEST_USER_INPUT: &str =
    "request_user_input_blocked_in_default_mode";
pub(super) const MODE_BLOCKED_REASON_CODE_PLAN_READONLY: &str = "plan_readonly_violation";
pub(super) const MODE_BLOCKED_PLAN_REASON: &str =
    "This operation is blocked while effective_mode=plan.";
pub(super) const MODE_BLOCKED_PLAN_SUGGESTION: &str =
    "Switch to Default mode and retry the write operation.";
pub(super) const LOCAL_PLAN_BLOCKER_REQUEST_PREFIX: &str = "ccgui-plan-blocker:";
pub(super) const LOCAL_PLAN_APPLY_REQUEST_PREFIX: &str = "ccgui-plan-apply:";
pub(super) const PLAN_APPLY_ACTION_QUESTION_ID: &str = "plan_apply_action";
pub(super) const PLAN_BLOCKER_GENERIC_REASON: &str =
    "Plan 模式检测到阻断条件，需要你先确认下一步后再继续。";
pub(super) const PLAN_BLOCKER_USER_INPUT_REQUIRED_REASON: &str =
    "Plan 模式检测到需要你补充关键信息，继续前请先确认输入。";

#[derive(Debug, Default, Clone)]
pub(super) struct PlanTurnState {
    pub(super) active_turn_id: Option<String>,
    pub(super) has_user_input_request: bool,
    pub(super) synthetic_block_active: bool,
    pub(super) has_plan_update: bool,
    pub(super) last_plan_step_count: usize,
    pub(super) has_tool_activity: bool,
    pub(super) has_failed_tool_activity: bool,
    pub(super) agent_message_buffer: String,
}

pub(super) fn should_block_request_user_input(
    method: &str,
    effective_mode: Option<&str>,
    enforcement_enabled: bool,
    strict_local_profile: bool,
) -> bool {
    enforcement_enabled
        && strict_local_profile
        && method == "item/tool/requestUserInput"
        && effective_mode == Some("code")
}

pub(super) fn build_mode_blocked_event(
    thread_id: &str,
    blocked_method: &str,
    effective_mode: &str,
    reason_code: &str,
    reason: &str,
    suggestion: &str,
    request_id: Option<Value>,
) -> Value {
    json!({
        "method": "collaboration/modeBlocked",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "blockedMethod": blocked_method,
            "blocked_method": blocked_method,
            "effectiveMode": effective_mode,
            "effective_mode": effective_mode,
            "reasonCode": reason_code,
            "reason_code": reason_code,
            "reason": reason,
            "suggestion": suggestion,
            "requestId": request_id,
            "request_id": request_id,
        }
    })
}

pub(super) fn normalize_command_tokens_from_item(item: &Value) -> Vec<String> {
    if let Some(command) = item.get("command") {
        if let Some(command_str) = command.as_str() {
            return command_str
                .split_whitespace()
                .map(|token| token.trim_matches(&['"', '\''][..]).to_lowercase())
                .filter(|token| !token.is_empty())
                .collect();
        }
        if let Some(command_array) = command.as_array() {
            return command_array
                .iter()
                .filter_map(Value::as_str)
                .map(|token| token.trim_matches(&['"', '\''][..]).to_lowercase())
                .filter(|token| !token.is_empty())
                .collect();
        }
    }
    Vec::new()
}

pub(super) fn is_repo_mutating_command_tokens(tokens: &[String]) -> bool {
    if tokens.is_empty() {
        return false;
    }
    let first = tokens[0].as_str();
    if first != "git" {
        return false;
    }
    let second = tokens
        .get(1)
        .map(|token| token.as_str())
        .unwrap_or_default();
    matches!(
        second,
        "add"
            | "commit"
            | "push"
            | "pull"
            | "merge"
            | "rebase"
            | "cherry-pick"
            | "revert"
            | "reset"
            | "stash"
            | "am"
            | "apply"
            | "rm"
            | "mv"
            | "checkout"
            | "switch"
            | "restore"
            | "clean"
            | "tag"
            | "branch"
            | "fetch"
    )
}

pub(super) fn detect_repo_mutating_blocked_method(value: &Value) -> Option<String> {
    let method = extract_event_method(value)?;
    if method.starts_with("item/") && method.ends_with("/requestApproval") {
        return Some(method.to_string());
    }
    if method != "item/started" && method != "item/updated" {
        return None;
    }
    let item = value.get("params")?.get("item")?;
    let item_type = item
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    let item_name = item
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    let item_tool_type = item
        .get("toolType")
        .or_else(|| item.get("tool_type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();
    let item_kind = item
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();

    if item_type == "filechange"
        || item_type == "apply_patch"
        || item_name == "apply_patch"
        || item_tool_type == "filechange"
        || item_tool_type == "apply_patch"
    {
        return Some("item/tool/apply_patch".to_string());
    }

    if item_type == "commandexecution"
        || item_tool_type == "commandexecution"
        || item_kind == "command"
    {
        let tokens = normalize_command_tokens_from_item(item);
        if is_repo_mutating_command_tokens(&tokens) {
            let rendered = tokens.join(" ");
            return Some(if rendered.is_empty() {
                "item/tool/commandExecution".to_string()
            } else {
                format!("item/tool/commandExecution:{rendered}")
            });
        }
    }
    None
}

pub(super) fn extract_turn_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;
    params
        .get("turnId")
        .or_else(|| params.get("turn_id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            params
                .get("turn")
                .and_then(|turn| turn.get("id"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}

pub(super) fn detect_plan_blocker_reason(value: &Value) -> Option<&'static str> {
    let method = extract_event_method(value)?;
    if method == "turn/completed" {
        let params = value.get("params")?;
        let semantic_text = [
            flatten_text_like_value(params.get("text").unwrap_or(&Value::Null)),
            flatten_text_like_value(params.get("result").unwrap_or(&Value::Null)),
            flatten_text_like_value(params.get("turn").unwrap_or(&Value::Null)),
        ]
        .join("\n");
        return detect_plan_blocker_reason_from_semantic_text(&semantic_text);
    }
    if method != "item/completed" {
        return None;
    }
    let params = value.get("params")?;
    let item = params.get("item")?;
    let status = item
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let result_text =
        flatten_text_like_value(item.get("result").unwrap_or(&Value::Null)).to_lowercase();
    let error_text =
        flatten_text_like_value(item.get("error").unwrap_or(&Value::Null)).to_lowercase();
    let message_text =
        flatten_text_like_value(item.get("text").unwrap_or(&Value::Null)).to_lowercase();

    if result_text.contains("not_git_repo")
        || result_text.contains("not a git repository")
        || error_text.contains("not a git repository")
    {
        return Some("当前目录不是 Git 仓库，无法基于真实代码上下文继续计划。");
    }

    let missing_path_or_context = [
        "no such file or directory",
        "not found",
        "does not exist",
        "cannot access",
        "missing",
        "empty directory",
        "未找到",
        "不存在",
        "缺失",
        "空目录",
    ]
    .iter()
    .any(|needle| result_text.contains(needle) || error_text.contains(needle));

    if missing_path_or_context {
        return Some("Plan 模式下发现关键路径或上下文缺失，继续推进前需要你确认范围与目标位置。");
    }

    let semantic_text = [
        message_text.as_str(),
        result_text.as_str(),
        error_text.as_str(),
    ]
    .join("\n");
    if let Some(reason) = detect_plan_blocker_reason_from_semantic_text(&semantic_text) {
        return Some(reason);
    }

    if status == "failed" {
        return Some("Plan 模式下的关键检查命令失败，缺少继续推进所需前置条件。");
    }

    None
}

fn detect_plan_blocker_reason_from_semantic_text(text: &str) -> Option<&'static str> {
    let normalized = text.trim();
    if normalized.is_empty() {
        return None;
    }
    if looks_like_plan_blocker_prompt(normalized) {
        return Some(PLAN_BLOCKER_GENERIC_REASON);
    }
    if looks_like_user_info_followup_prompt(normalized) {
        return Some(PLAN_BLOCKER_USER_INPUT_REQUIRED_REASON);
    }
    None
}

pub(super) fn looks_like_executable_plan_text(text: &str) -> bool {
    let normalized = text.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }
    let has_plan_and_tests = (normalized.contains("实施计划")
        || normalized.contains("执行计划")
        || normalized.contains("implementation plan"))
        && (normalized.contains("测试点")
            || normalized.contains("验证点")
            || normalized.contains("test cases")
            || normalized.contains("verification"));
    let structured_step_count = normalized
        .lines()
        .map(str::trim_start)
        .filter(|line| {
            let mut chars = line.chars();
            let first = chars.next();
            let second = chars.next();
            first.map(|c| c.is_ascii_digit()).unwrap_or(false) && second == Some('.')
                || line.starts_with("- ")
                || line.starts_with("* ")
                || line.starts_with("步骤")
        })
        .count();
    has_plan_and_tests || structured_step_count >= 3
}

pub(super) fn extract_plan_step_count(value: &Value) -> usize {
    value
        .get("params")
        .and_then(|params| params.get("plan"))
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0)
}

fn is_tool_or_command_item(item: &Value) -> bool {
    let type_like = [
        item.get("kind").and_then(Value::as_str).unwrap_or_default(),
        item.get("type").and_then(Value::as_str).unwrap_or_default(),
        item.get("toolType")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        item.get("tool_type")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        item.get("name").and_then(Value::as_str).unwrap_or_default(),
    ]
    .join(" ")
    .to_lowercase();

    type_like.contains("tool")
        || type_like.contains("command")
        || type_like.contains("shell")
        || type_like.contains("terminal")
        || type_like.contains("run")
}

fn item_suggests_failure(item: &Value) -> bool {
    let status = item
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if status == "failed" || status == "error" || status == "canceled" || status == "cancelled" {
        return true;
    }
    let result_text =
        flatten_text_like_value(item.get("result").unwrap_or(&Value::Null)).to_lowercase();
    let error_text =
        flatten_text_like_value(item.get("error").unwrap_or(&Value::Null)).to_lowercase();
    [
        "exit code",
        "non-zero",
        "command failed",
        "error:",
        "not found",
        "no such file or directory",
        "permission denied",
        "timed out",
        "failed",
    ]
    .iter()
    .any(|needle| result_text.contains(needle) || error_text.contains(needle))
}

fn flatten_text_like_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        Value::String(v) => v.clone(),
        Value::Array(values) => values
            .iter()
            .map(flatten_text_like_value)
            .filter(|part| !part.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => map
            .values()
            .map(flatten_text_like_value)
            .filter(|part| !part.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

pub(super) fn is_plan_blocker_stream_method(method: &str) -> bool {
    matches!(
        method,
        "item/agentMessage/delta"
            | "item/reasoning/textDelta"
            | "item/reasoning/delta"
            | "item/reasoning/summaryTextDelta"
    )
}

pub(super) fn extract_stream_delta_text(value: &Value) -> Option<String> {
    let method = extract_event_method(value)?;
    if !is_plan_blocker_stream_method(method) {
        return None;
    }
    value
        .get("params")
        .and_then(|params| {
            params
                .get("delta")
                .or_else(|| params.get("text"))
                .or_else(|| params.get("summary"))
        })
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

pub(super) fn looks_like_plan_blocker_prompt(text: &str) -> bool {
    let normalized = text.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    let blocker_markers = [
        "出现一个阻塞",
        "出现阻塞",
        "阻塞",
        "阻塞点",
        "卡住",
        "卡点",
        "受阻",
        "blocker",
        "阻断",
        "无法把计划",
        "无法将计划",
        "无法继续",
        "缺少前端源码",
        "没有 src",
        "无 src",
        "还没看到前端源码",
        "当前仓库只有",
        "only docs",
        "missing src",
        "no src",
        "not a git repository",
        "只有 .git",
        ".git 元数据",
        "几乎只有",
    ];
    let question_markers = [
        "先发一个选项问题",
        "先发一个选项",
        "先给你选项",
        "选项让你决定",
        "选项问题",
        "请你选择",
        "需要你确认",
        "等待你选择",
        "决定下一步",
        "先确认下一步",
        "继续前请先确认",
        "requestuserinput",
        "askuserquestion",
    ];
    let strong_context_gap_markers = [
        "没有可执行前端代码",
        "没有前端代码",
        "缺少前端代码",
        "缺少可分析的前端代码",
        "没有前端源码",
        "缺少前端源码",
        "missing src",
        "no src",
        "only docs",
        "not a git repository",
        "只有 .git",
        ".git 元数据",
        "几乎只有",
    ];
    let plan_progress_markers = [
        "计划",
        "规划",
        "落地",
        "实施",
        "下一步",
        "继续",
        "分析",
        "定位",
        "真实代码",
        "真实文件",
    ];
    let blocking_verbs = [
        "无法",
        "不能",
        "没有",
        "缺少",
        "未找到",
        "不存在",
        "还没看到",
    ];
    let structural_gap_hints = [
        "docs/",
        " docs ",
        "src/",
        " src ",
        "前端源码",
        "前端",
        "frontend",
        ".git",
        "元数据",
    ];
    let has_blocker_marker = blocker_markers
        .iter()
        .any(|needle| normalized.contains(needle));
    let has_question_marker = question_markers
        .iter()
        .any(|needle| normalized.contains(needle));
    let has_strong_context_gap_marker = strong_context_gap_markers
        .iter()
        .any(|needle| normalized.contains(needle));
    let has_plan_progress_marker = plan_progress_markers
        .iter()
        .any(|needle| normalized.contains(needle));
    let has_blocking_verb = blocking_verbs
        .iter()
        .any(|needle| normalized.contains(needle));
    let has_structural_gap_hint = structural_gap_hints
        .iter()
        .any(|needle| normalized.contains(needle));
    (has_blocker_marker && (has_question_marker || (has_blocking_verb && has_structural_gap_hint)))
        || (has_strong_context_gap_marker
            && has_blocking_verb
            && (has_plan_progress_marker || has_question_marker))
}

pub(super) fn looks_like_user_info_followup_prompt(text: &str) -> bool {
    let normalized = text.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }
    if looks_like_plan_blocker_prompt(&normalized) {
        return false;
    }

    let has_question = normalized.contains('?')
        || normalized.contains('？')
        || normalized.contains("请问")
        || normalized.contains("can you")
        || normalized.contains("could you")
        || normalized.contains("would you");
    let has_imperative_request =
        normalized.contains("请") || normalized.contains("麻烦") || normalized.contains("请把");
    let has_request_marker = [
        "请提供",
        "请告诉",
        "告诉我",
        "发我",
        "给我",
        "请补充",
        "需要你",
        "我还不知道",
        "还不清楚",
        "无法确定",
        "please provide",
        "i need",
        "need your",
        "share your",
        "provide your",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));
    let has_user_reference = normalized.contains("你")
        || normalized.contains("你的")
        || normalized.contains("you")
        || normalized.contains("your");

    (has_question || has_imperative_request) && has_request_marker && has_user_reference
}

fn is_repo_path_blocker_reason(reason: &str) -> bool {
    let normalized = reason.trim().to_lowercase();
    ["路径", "目录", "仓库", "git", "上下文", "context"]
        .iter()
        .any(|needle| normalized.contains(needle))
}

fn build_plan_blocker_question(reason: &str) -> String {
    if is_repo_path_blocker_reason(reason) {
        format!("{reason} 为避免误判路径，我需要你先确认下一步：")
    } else {
        format!("{reason} 我会在收到你的选择后继续：")
    }
}

fn build_plan_blocker_options(reason: &str) -> Vec<Value> {
    if is_repo_path_blocker_reason(reason) {
        vec![
            json!({
                "label": "提供正确仓库路径 (Recommended)",
                "description": "切换到真实代码仓后，我会基于仓库现状输出计划。"
            }),
            json!({
                "label": "就在当前目录继续",
                "description": "按当前目录继续，仅输出通用方案并明确假设边界。"
            }),
            json!({
                "label": "仅做设计阶段",
                "description": "不依赖仓库结构，只给高层设计和任务拆分。"
            }),
        ]
    } else {
        vec![
            json!({
                "label": "直接补充关键信息 (Recommended)",
                "description": "我将按你补充的信息继续当前任务。"
            }),
            json!({
                "label": "先给可选输入格式",
                "description": "我先给你可填写模板，你确认后再继续。"
            }),
            json!({
                "label": "先按通用假设继续",
                "description": "我会标注假设边界并继续规划。"
            }),
        ]
    }
}

pub(super) fn build_plan_blocker_user_input_event(
    thread_id: &str,
    turn_id: Option<&str>,
    request_id: &str,
    reason: &str,
) -> Value {
    let question = build_plan_blocker_question(reason);
    let options = build_plan_blocker_options(reason);
    json!({
        "method": "item/tool/requestUserInput",
        "id": request_id,
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": turn_id.unwrap_or(""),
            "turn_id": turn_id.unwrap_or(""),
            "itemId": format!("plan-blocker-{request_id}"),
            "item_id": format!("plan-blocker-{request_id}"),
            "questions": [{
                "id": "plan_blocker_resolution",
                "header": "Plan 模式阻断",
                "question": question,
                "options": options
            }]
        }
    })
}

fn build_plan_apply_user_input_event(
    thread_id: &str,
    turn_id: Option<&str>,
    request_id: &str,
) -> Value {
    json!({
        "method": "item/tool/requestUserInput",
        "id": request_id,
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": turn_id.unwrap_or(""),
            "turn_id": turn_id.unwrap_or(""),
            "itemId": format!("plan-apply-{request_id}"),
            "item_id": format!("plan-apply-{request_id}"),
            "questions": [{
                "id": PLAN_APPLY_ACTION_QUESTION_ID,
                "header": "Implement this plan?",
                "question": "Implement this plan?",
                "options": [
                    {
                        "label": "Yes, implement this plan (Recommended)",
                        "description": "Switch to Default and start coding."
                    },
                    {
                        "label": "No, stay in Plan mode",
                        "description": "Continue planning with the model."
                    }
                ]
            }]
        }
    })
}

impl WorkspaceSession {
    pub(super) async fn try_interrupt_turn(&self, thread_id: &str, turn_id: &str) {
        if let Err(error) = self
            .fire_and_forget_request(
                "turn/interrupt",
                json!({
                    "threadId": thread_id,
                    "turnId": turn_id,
                }),
            )
            .await
        {
            log::warn!(
                "[collaboration_mode_enforcement] failed to interrupt plan turn thread_id={} turn_id={} error={}",
                thread_id,
                turn_id,
                error
            );
            return;
        }
        log::info!(
            "[collaboration_mode_enforcement] interrupt_sent thread_id={} turn_id={} reason=plan_blocker_user_input",
            thread_id,
            turn_id
        );
    }

    pub(super) async fn intercept_request_user_input_if_needed(
        &self,
        value: &Value,
    ) -> Option<Value> {
        let method = extract_event_method(value)?;
        if method != "item/tool/requestUserInput" {
            return None;
        }

        let thread_id = extract_thread_id(value)?;
        let effective_mode = self.get_thread_effective_mode(&thread_id).await;
        let strict_local_profile = strict_local_collaboration_profile_enabled();
        let block = should_block_request_user_input(
            method,
            effective_mode.as_deref(),
            self.mode_enforcement_enabled(),
            strict_local_profile,
        );
        if !block {
            log::debug!(
                "[collaboration_mode_enforcement] decision=pass thread_id={} effective_mode={} method={}",
                thread_id,
                effective_mode.unwrap_or_else(|| "unknown".to_string()),
                method
            );
            return None;
        }

        let request_id = value.get("id").cloned();
        if let Some(id) = request_id.clone() {
            if let Err(error) = self.send_response(id, json!({ "answers": {} })).await {
                log::warn!(
                    "[collaboration_mode_enforcement] failed to auto-respond blocked request thread_id={} error={}",
                    thread_id,
                    error
                );
            }
        }

        log::info!(
            "[collaboration_mode_enforcement] decision=blocked thread_id={} effective_mode=code method={}",
            thread_id,
            method
        );
        Some(build_mode_blocked_event(
            &thread_id,
            method,
            "code",
            MODE_BLOCKED_REASON_CODE_REQUEST_USER_INPUT,
            MODE_BLOCKED_REASON,
            MODE_BLOCKED_SUGGESTION,
            request_id,
        ))
    }

    pub(super) async fn intercept_plan_repo_mutation_if_needed(
        &self,
        value: &Value,
    ) -> Option<Value> {
        if !self.mode_enforcement_enabled() || !strict_local_collaboration_profile_enabled() {
            return None;
        }
        let thread_id = extract_thread_id(value)?;
        let effective_mode = self.get_thread_effective_mode(&thread_id).await;
        if effective_mode.as_deref() != Some("plan") {
            return None;
        }
        let blocked_method = detect_repo_mutating_blocked_method(value)?;
        log::info!(
            "[collaboration_mode_enforcement] decision=blocked thread_id={} effective_mode=plan blocked_method={} reason={}",
            thread_id,
            blocked_method,
            MODE_BLOCKED_REASON_CODE_PLAN_READONLY
        );
        {
            let mut states = self.plan_turn_state.lock().await;
            let state = states.entry(thread_id.clone()).or_default();
            state.synthetic_block_active = true;
        }
        Some(build_mode_blocked_event(
            &thread_id,
            &blocked_method,
            "plan",
            MODE_BLOCKED_REASON_CODE_PLAN_READONLY,
            MODE_BLOCKED_PLAN_REASON,
            MODE_BLOCKED_PLAN_SUGGESTION,
            None,
        ))
    }

    pub(super) async fn track_plan_turn_state(&self, value: &Value) {
        if !strict_local_collaboration_profile_enabled() {
            return;
        }
        let Some(thread_id) = extract_thread_id(value) else {
            return;
        };
        let Some(method) = extract_event_method(value) else {
            return;
        };
        let mut states = self.plan_turn_state.lock().await;
        match method {
            "turn/started" => {
                let state = states.entry(thread_id).or_default();
                state.active_turn_id = extract_turn_id(value);
                state.has_user_input_request = false;
                state.synthetic_block_active = false;
                state.has_plan_update = false;
                state.last_plan_step_count = 0;
                state.has_tool_activity = false;
                state.has_failed_tool_activity = false;
                state.agent_message_buffer.clear();
            }
            "item/started" | "item/updated" | "item/completed" => {
                let item = value
                    .get("params")
                    .and_then(|params| params.get("item"))
                    .cloned();
                if let Some(item) = item {
                    let state = states.entry(thread_id).or_default();
                    if state.active_turn_id.is_none() {
                        state.active_turn_id = extract_turn_id(value);
                    }
                    if is_tool_or_command_item(&item) {
                        state.has_tool_activity = true;
                        if item_suggests_failure(&item) {
                            state.has_failed_tool_activity = true;
                        }
                    }
                }
            }
            "item/tool/requestUserInput" => {
                let state = states.entry(thread_id).or_default();
                if state.active_turn_id.is_none() {
                    state.active_turn_id = extract_turn_id(value);
                }
                state.has_user_input_request = true;
            }
            method if is_plan_blocker_stream_method(method) => {
                let Some(delta) = extract_stream_delta_text(value) else {
                    return;
                };
                let state = states.entry(thread_id).or_default();
                state.agent_message_buffer.push_str(&delta);
                const PLAN_BLOCKER_BUFFER_MAX_CHARS: usize = 8000;
                if state.agent_message_buffer.len() > PLAN_BLOCKER_BUFFER_MAX_CHARS {
                    let keep_from = state
                        .agent_message_buffer
                        .char_indices()
                        .nth(
                            state
                                .agent_message_buffer
                                .chars()
                                .count()
                                .saturating_sub(PLAN_BLOCKER_BUFFER_MAX_CHARS / 2),
                        )
                        .map(|(index, _)| index)
                        .unwrap_or(0);
                    state.agent_message_buffer =
                        state.agent_message_buffer[keep_from..].to_string();
                }
            }
            "turn/planUpdated" | "turn/plan/updated" => {
                let state = states.entry(thread_id).or_default();
                if state.active_turn_id.is_none() {
                    state.active_turn_id = extract_turn_id(value);
                }
                state.has_plan_update = true;
                state.last_plan_step_count = extract_plan_step_count(value);
            }
            "turn/completed" | "turn/error" => {
                let state = states.entry(thread_id).or_default();
                if state.active_turn_id.is_none() {
                    state.active_turn_id = extract_turn_id(value);
                }
            }
            _ => {}
        }
    }

    pub(super) async fn maybe_emit_plan_blocker_user_input(&self, value: &Value) -> Option<Value> {
        if !strict_local_collaboration_profile_enabled() {
            return None;
        }
        let thread_id = extract_thread_id(value)?;
        let effective_mode = self.get_thread_effective_mode(&thread_id).await;
        if effective_mode.as_deref() != Some("plan") {
            let has_plan_signal = {
                let states = self.plan_turn_state.lock().await;
                states
                    .get(&thread_id)
                    .map(|state| state.has_plan_update)
                    .unwrap_or(false)
            };
            if !has_plan_signal {
                return None;
            }
        }
        let method = extract_event_method(value)?;
        let reason = if is_plan_blocker_stream_method(method) {
            let aggregated = {
                let states = self.plan_turn_state.lock().await;
                states
                    .get(&thread_id)
                    .map(|state| state.agent_message_buffer.as_str())
                    .unwrap_or_default()
                    .to_string()
            };
            if !looks_like_plan_blocker_prompt(&aggregated) {
                return None;
            }
            PLAN_BLOCKER_GENERIC_REASON
        } else if method == "turn/completed" {
            if let Some(reason) = detect_plan_blocker_reason(value) {
                reason
            } else {
                let (
                    has_tool_activity,
                    has_failed_tool_activity,
                    last_plan_step_count,
                    buffered_text,
                ) = {
                    let states = self.plan_turn_state.lock().await;
                    let state = states.get(&thread_id);
                    (
                        state.map(|item| item.has_tool_activity).unwrap_or(false),
                        state
                            .map(|item| item.has_failed_tool_activity)
                            .unwrap_or(false),
                        state.map(|item| item.last_plan_step_count).unwrap_or(0),
                        state
                            .map(|item| item.agent_message_buffer.clone())
                            .unwrap_or_default(),
                    )
                };
                if let Some(reason) = detect_plan_blocker_reason_from_semantic_text(&buffered_text)
                {
                    reason
                } else {
                    log::info!(
                        "[collaboration_mode_enforcement][plan_blocker_probe] thread_id={} method=turn/completed has_tool_activity={} has_failed_tool_activity={} has_plan_update={} last_plan_step_count={} buffered_len={}",
                        thread_id,
                        has_tool_activity,
                        has_failed_tool_activity,
                        last_plan_step_count > 0,
                        last_plan_step_count,
                        buffered_text.chars().count(),
                    );
                    if last_plan_step_count > 0
                        || looks_like_executable_plan_text(&buffered_text)
                        || !has_tool_activity
                    {
                        return None;
                    }
                    if has_failed_tool_activity {
                        "Plan 模式关键检查失败，需要你先确认下一步后再继续。"
                    } else {
                        "Plan 模式未产出可执行计划，需要你先确认下一步后再继续。"
                    }
                }
            }
        } else {
            detect_plan_blocker_reason(value)?
        };
        let (already_asked, turn_id) = {
            let states = self.plan_turn_state.lock().await;
            let state = states.get(&thread_id);
            (
                state
                    .map(|item| item.has_user_input_request)
                    .unwrap_or(false),
                state.and_then(|item| item.active_turn_id.clone()),
            )
        };
        if already_asked {
            return None;
        }
        {
            let mut states = self.plan_turn_state.lock().await;
            let state = states.entry(thread_id.clone()).or_default();
            state.has_user_input_request = true;
            state.synthetic_block_active = true;
        }
        let sequence = self.local_request_seq.fetch_add(1, Ordering::SeqCst);
        let request_id = format!("{LOCAL_PLAN_BLOCKER_REQUEST_PREFIX}{sequence}");
        self.local_user_input_requests
            .lock()
            .await
            .insert(request_id.clone(), thread_id.clone());
        if let Some(current_turn_id) = turn_id.as_deref() {
            self.try_interrupt_turn(&thread_id, current_turn_id).await;
        }
        Some(build_plan_blocker_user_input_event(
            &thread_id,
            turn_id.as_deref(),
            &request_id,
            reason,
        ))
    }

    pub(super) async fn should_suppress_after_synthetic_plan_block(&self, value: &Value) -> bool {
        if !strict_local_collaboration_profile_enabled() {
            return false;
        }
        let Some(thread_id) = extract_thread_id(value) else {
            return false;
        };
        let Some(method) = extract_event_method(value) else {
            return false;
        };
        let synthetic_block_active = {
            let states = self.plan_turn_state.lock().await;
            states
                .get(&thread_id)
                .map(|state| state.synthetic_block_active)
                .unwrap_or(false)
        };
        if !synthetic_block_active {
            return false;
        }
        if method == "item/tool/requestUserInput" {
            return false;
        }
        if method == "turn/error" {
            return true;
        }
        if method == "turn/completed" {
            return false;
        }
        method.starts_with("item/")
            || method == "processing/heartbeat"
            || method == "turn/planUpdated"
            || method == "turn/plan/updated"
    }

    pub(super) async fn maybe_emit_plan_apply_user_input(&self, value: &Value) -> Option<Value> {
        if !strict_local_collaboration_profile_enabled() {
            return None;
        }
        let method = extract_event_method(value)?;
        if method != "turn/completed" {
            return None;
        }
        let thread_id = extract_thread_id(value)?;
        let effective_mode = self.get_thread_effective_mode(&thread_id).await;
        if effective_mode.as_deref() != Some("plan") {
            return None;
        }
        let (already_asked, has_plan_update, turn_id) = {
            let states = self.plan_turn_state.lock().await;
            let state = states.get(&thread_id);
            (
                state
                    .map(|item| item.has_user_input_request)
                    .unwrap_or(false),
                state.map(|item| item.has_plan_update).unwrap_or(false),
                state.and_then(|item| item.active_turn_id.clone()),
            )
        };
        if already_asked || !has_plan_update {
            return None;
        }
        {
            let mut states = self.plan_turn_state.lock().await;
            let state = states.entry(thread_id.clone()).or_default();
            state.has_user_input_request = true;
        }
        let sequence = self.local_request_seq.fetch_add(1, Ordering::SeqCst);
        let request_id = format!("{LOCAL_PLAN_APPLY_REQUEST_PREFIX}{sequence}");
        self.local_user_input_requests
            .lock()
            .await
            .insert(request_id.clone(), thread_id.clone());
        Some(build_plan_apply_user_input_event(
            &thread_id,
            turn_id.as_deref(),
            &request_id,
        ))
    }

    pub(super) async fn clear_terminal_plan_turn_state(
        &self,
        thread_id: Option<&str>,
        method: Option<&str>,
    ) {
        if !matches!(method, Some("turn/completed") | Some("turn/error")) {
            return;
        }
        let Some(thread_id) = thread_id else {
            return;
        };
        self.plan_turn_state.lock().await.remove(thread_id);
    }
}
