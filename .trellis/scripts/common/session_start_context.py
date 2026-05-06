#!/usr/bin/env python3
"""
Shared helpers for Claude/Codex session-start context assembly.
"""

from __future__ import annotations

from pathlib import Path

from .git import run_git
from .paths import get_current_task
from .session_context import get_context_json
from .tasks import load_task


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def normalize_task_ref(task_ref: str) -> str:
    normalized = task_ref.strip()
    if not normalized:
        return ""

    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return str(path_obj)

    normalized = normalized.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]

    if normalized.startswith("tasks/"):
        return f".trellis/{normalized}"

    return normalized


def resolve_task_dir(trellis_dir: Path, task_ref: str) -> Path:
    normalized = normalize_task_ref(task_ref)
    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return path_obj
    if normalized.startswith(".trellis/"):
        return trellis_dir.parent / path_obj
    return trellis_dir / "tasks" / path_obj


def get_task_status_summary(trellis_dir: Path) -> str:
    current_task_file = trellis_dir / ".current-task"
    if not current_task_file.is_file():
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    task_ref = normalize_task_ref(current_task_file.read_text(encoding="utf-8").strip())
    if not task_ref:
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    task_dir = resolve_task_dir(trellis_dir, task_ref)
    if not task_dir.is_dir():
        return (
            "Status: STALE POINTER\n"
            f"Task: {task_ref}\n"
            "Next: Task directory not found. Run: "
            "python3 ./.trellis/scripts/task.py finish"
        )

    task_json_path = task_dir / "task.json"
    task_data: dict = {}
    if task_json_path.is_file():
        try:
            import json

            task_data = json.loads(task_json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            pass

    task_title = task_data.get("title", task_ref)
    task_status = task_data.get("status", "unknown")

    if task_status == "completed":
        return (
            "Status: COMPLETED\n"
            f"Task: {task_title}\n"
            "Next: Archive with "
            f"`python3 ./.trellis/scripts/task.py archive {task_dir.name}` "
            "or start a new task"
        )

    has_context = False
    for jsonl_name in ("implement.jsonl", "check.jsonl", "spec.jsonl"):
        jsonl_path = task_dir / jsonl_name
        if jsonl_path.is_file() and jsonl_path.stat().st_size > 0:
            has_context = True
            break

    has_prd = (task_dir / "prd.md").is_file()

    if not has_prd:
        return (
            "Status: NOT READY\n"
            f"Task: {task_title}\n"
            "Missing: prd.md not created\n"
            "Next: Write PRD, then research → init-context → start"
        )

    if not has_context:
        return (
            "Status: NOT READY\n"
            f"Task: {task_title}\n"
            "Missing: Context not configured (no jsonl files)\n"
            "Next: Complete Phase 2 (research → init-context → start) before implementing"
        )

    return f"Status: READY\nTask: {task_title}\nNext: Continue with implement or check"


def build_workflow_toc(workflow_path: Path) -> str:
    content = read_file(workflow_path)
    if not content:
        return "No workflow.md found"

    toc_lines = [
        "# Development Workflow — Section Index",
        "Full guide: .trellis/workflow.md (read on demand)",
        "",
    ]
    for line in content.splitlines():
        if line.startswith("## "):
            toc_lines.append(line)

    toc_lines += [
        "",
        "Read specific sections on demand instead of treating this hook as the full workflow manual.",
    ]
    return "\n".join(toc_lines)


def build_project_entry_context(project_dir: Path) -> str:
    agents_md = project_dir / "AGENTS.md"
    content = read_file(agents_md)
    if not content:
        return "AGENTS.md not found."

    return "\n".join(
        [
            "# Project Entry",
            "Canonical repo entry: AGENTS.md",
            "Treat this as the highest-priority project instruction document.",
            "",
            content,
        ]
    )


def build_current_state_summary(project_dir: Path) -> str:
    context = get_context_json(project_dir)
    git = context.get("git", {})
    tasks = context.get("tasks", {})
    journal = context.get("journal", {})

    lines = [
        "# Current State Summary",
        f"- Developer: {context.get('developer') or 'unknown'}",
        f"- Branch: {git.get('branch', 'unknown')}",
    ]

    change_count = int(git.get("uncommittedChanges") or 0)
    if change_count == 0:
        lines.append("- Working tree: clean")
    else:
        lines.append(f"- Working tree: {change_count} uncommitted change(s)")
        _, short_out, _ = run_git(["status", "--short"], cwd=project_dir)
        changed_paths = [line.rstrip() for line in short_out.splitlines() if line.strip()][:5]
        if changed_paths:
            lines.append("- Changed paths (top 5):")
            lines.extend([f"  - {line}" for line in changed_paths])

    recent_commits = git.get("recentCommits") or []
    if recent_commits:
        lines.append("- Recent commits:")
        for commit in recent_commits[:3]:
            lines.append(f"  - {commit.get('hash', '')} {commit.get('message', '')}".rstrip())

    current_task = get_current_task(project_dir)
    if current_task:
        task = load_task(project_dir / current_task)
        if task:
            lines.append(f"- Current task: {task.title} ({task.status})")
        else:
            lines.append(f"- Current task: {current_task}")
        if (project_dir / current_task / "prd.md").is_file():
            lines.append(f"- Current task PRD: {current_task}/prd.md")
    else:
        lines.append("- Current task: none")

    active_tasks = tasks.get("active") or []
    lines.append(
        "- Active tasks: "
        f"{len(active_tasks)} total "
        "(read `python3 ./.trellis/scripts/get_context.py --mode record` on demand)"
    )

    journal_file = journal.get("file")
    if journal_file:
        lines.append(f"- Journal: {journal_file} ({journal.get('lines', 0)} lines)")

    return "\n".join(lines)


def build_openspec_context(project_dir: Path, max_changes: int = 4) -> str:
    openspec_dir = project_dir / "openspec"
    if not openspec_dir.is_dir():
        return "OpenSpec: not found in current project."

    specs_dir = openspec_dir / "specs"
    changes_dir = openspec_dir / "changes"

    specs_count = 0
    if specs_dir.is_dir():
        specs_count = sum(1 for item in specs_dir.iterdir() if item.is_dir())

    active_changes: list[Path] = []
    if changes_dir.is_dir():
        active_changes = [
            item
            for item in changes_dir.iterdir()
            if item.is_dir() and item.name != "archive"
        ]
        active_changes.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    lines = [
        "# OpenSpec Entry",
        "- Entry: openspec/README.md",
        "- Detailed overview: openspec/project.md",
        f"- Main specs: {specs_count}",
        f"- Active changes: {len(active_changes)}",
    ]

    if active_changes:
        lines.append(f"- Recent active changes (top {min(max_changes, len(active_changes))}):")
        for change_dir in active_changes[:max_changes]:
            lines.append(f"  - {change_dir.name}")

    lines.append(
        "- Read the specific change directory on demand instead of relying on session-start summaries."
    )
    return "\n".join(lines)


def build_guideline_pointer_context(project_dir: Path) -> str:
    trellis_dir = project_dir / ".trellis"
    pointers: list[str] = []

    for label, rel_path in (
        ("Frontend rules index", ".trellis/spec/frontend/index.md"),
        ("Backend rules index", ".trellis/spec/backend/index.md"),
        ("Thinking guides index", ".trellis/spec/guides/index.md"),
        (
            "Governance boundary guide",
            ".trellis/spec/guides/project-instruction-layering-guide.md",
        ),
        ("OpenSpec entry", "openspec/README.md"),
        ("OpenSpec overview", "openspec/project.md"),
    ):
        if (project_dir / rel_path).is_file():
            pointers.append(f"- {label}: {rel_path}")

    lines = [
        "# Rule Pointers",
        "Read these documents on demand based on task type. They are not pre-read implementation detail.",
    ]
    lines.extend(pointers)

    if (trellis_dir / "workflow.md").is_file():
        lines.append("- Workflow manual: .trellis/workflow.md")

    lines.append(
        "- When a task needs deeper implementation rules, open the downstream files listed by the relevant index."
    )
    return "\n".join(lines)
