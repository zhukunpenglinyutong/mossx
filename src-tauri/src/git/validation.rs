pub(crate) fn validate_local_branch_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    let full_ref = format!("refs/heads/{trimmed}");
    if !git2::Reference::is_valid_name(&full_ref) {
        return Err(format!("Invalid branch name: {trimmed}"));
    }
    Ok(trimmed.to_string())
}
