#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Codex Session Start Hook - Inject Trellis context into Codex sessions.

Output format follows Codex hook protocol:
  stdout JSON → { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import warnings
from io import StringIO
from pathlib import Path

warnings.filterwarnings("ignore")


def should_skip_injection() -> bool:
    return os.environ.get("CODEX_NON_INTERACTIVE") == "1"


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def run_script(script_path: Path) -> str:
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        cmd = [sys.executable, "-W", "ignore", str(script_path)]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=str(script_path.parent.parent.parent),
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def _normalize_task_ref(task_ref: str) -> str:
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


def _resolve_task_dir(trellis_dir: Path, task_ref: str) -> Path:
    normalized = _normalize_task_ref(task_ref)
    path_obj = Path(normalized)
    if path_obj.is_absolute():
        return path_obj
    if normalized.startswith(".trellis/"):
        return trellis_dir.parent / path_obj
    return trellis_dir / "tasks" / path_obj


def _get_task_status(trellis_dir: Path) -> str:
    current_task_file = trellis_dir / ".current-task"
    if not current_task_file.is_file():
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    task_ref = _normalize_task_ref(current_task_file.read_text(encoding="utf-8").strip())
    if not task_ref:
        return "Status: NO ACTIVE TASK\nNext: Describe what you want to work on"

    task_dir = _resolve_task_dir(trellis_dir, task_ref)
    if not task_dir.is_dir():
        return f"Status: STALE POINTER\nTask: {task_ref}\nNext: Task directory not found. Run: python3 ./.trellis/scripts/task.py finish"

    task_json_path = task_dir / "task.json"
    task_data: dict = {}
    if task_json_path.is_file():
        try:
            task_data = json.loads(task_json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, PermissionError):
            pass

    task_title = task_data.get("title", task_ref)
    task_status = task_data.get("status", "unknown")

    if task_status == "completed":
        return f"Status: COMPLETED\nTask: {task_title}\nNext: Archive with `python3 ./.trellis/scripts/task.py archive {task_dir.name}` or start a new task"

    has_context = False
    for jsonl_name in ("implement.jsonl", "check.jsonl", "spec.jsonl"):
        jsonl_path = task_dir / jsonl_name
        if jsonl_path.is_file() and jsonl_path.stat().st_size > 0:
            has_context = True
            break

    has_prd = (task_dir / "prd.md").is_file()

    if not has_prd:
        return f"Status: NOT READY\nTask: {task_title}\nMissing: prd.md not created\nNext: Write PRD, then research → init-context → start"

    if not has_context:
        return f"Status: NOT READY\nTask: {task_title}\nMissing: Context not configured (no jsonl files)\nNext: Complete Phase 2 (research → init-context → start) before implementing"

    return f"Status: READY\nTask: {task_title}\nNext: Continue with implement or check"


def _build_workflow_toc(workflow_path: Path) -> str:
    """Build a compact section index for workflow.md (lazy-load the full file on demand).

    Replaces full-file injection to keep additionalContext payload small.
    The full file is accessible via: Read tool on .trellis/workflow.md
    """
    content = read_file(workflow_path)
    if not content:
        return "No workflow.md found"

    toc_lines = [
        "# Development Workflow — Section Index",
        "Full guide: .trellis/workflow.md  (read on demand)",
        "",
    ]
    for line in content.splitlines():
        if line.startswith("## "):
            toc_lines.append(line)

    toc_lines += [
        "",
        "To read a section: use the Read tool on .trellis/workflow.md",
    ]
    return "\n".join(toc_lines)


def _build_project_entry_context(project_dir: Path) -> str:
    agents_md = project_dir / "AGENTS.md"
    content = read_file(agents_md)
    if not content:
        return "AGENTS.md not found."

    return "\n".join([
        "# Project Entry",
        "Canonical repo entry: AGENTS.md",
        "Treat this as the highest-priority project instruction document.",
        "",
        content,
    ])


def _build_openspec_context(project_dir: Path) -> str:
    openspec_dir = project_dir / "openspec"
    if not openspec_dir.is_dir():
        return "OpenSpec: not found in current project."

    specs_dir = openspec_dir / "specs"
    changes_dir = openspec_dir / "changes"
    project_md = openspec_dir / "project.md"
    openspec_config = project_dir / ".openspec-config"

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

    summary_lines = [
        "## OpenSpec Context",
        f"- Root: {openspec_dir}",
        f"- Specs count: {specs_count}",
        f"- Active changes: {len(active_changes)}",
        f"- Config file: {'present' if openspec_config.is_file() else 'missing'} ({openspec_config.name})",
    ]

    if active_changes:
        summary_lines.append("- Recent active changes:")
        for change_dir in active_changes[:8]:
            summary_lines.append(f"  - {change_dir.name}")

    if project_md.is_file():
        project_lines = [line.strip() for line in read_file(project_md).splitlines() if line.strip()]
        heading_lines = [line for line in project_lines if line.startswith("#")][:5]
        if heading_lines:
            summary_lines.append("- project.md headings:")
            for heading in heading_lines:
                summary_lines.append(f"  - {heading}")

    summary_lines.append("- Workflow: proposal/design/tasks -> apply -> verify -> sync/archive")
    return "\n".join(summary_lines)


def main() -> None:
    if should_skip_injection():
        sys.exit(0)

    # Read hook input from stdin
    try:
        hook_input = json.loads(sys.stdin.read())
        project_dir = Path(hook_input.get("cwd", ".")).resolve()
    except (json.JSONDecodeError, KeyError):
        project_dir = Path(".").resolve()

    trellis_dir = project_dir / ".trellis"

    output = StringIO()

    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")

    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script))
    output.write("\n</current-state>\n\n")

    output.write("<project-entry>\n")
    output.write(_build_project_entry_context(project_dir))
    output.write("\n</project-entry>\n\n")

    output.write("<workflow>\n")
    output.write(_build_workflow_toc(trellis_dir / "workflow.md"))
    output.write("\n</workflow>\n\n")

    output.write("<openspec>\n")
    output.write(_build_openspec_context(project_dir))
    output.write("\n</openspec>\n\n")

    output.write("<guidelines>\n")
    output.write("**Note**: The guidelines below are index files — they list available guideline documents and their locations.\n")
    output.write("During actual development, you MUST read the specific guideline files listed in each index's Pre-Development Checklist.\n\n")

    spec_dir = trellis_dir / "spec"
    if spec_dir.is_dir():
        for sub in sorted(spec_dir.iterdir()):
            if not sub.is_dir() or sub.name.startswith("."):
                continue

            if sub.name == "guides":
                index_file = sub / "index.md"
                if index_file.is_file():
                    output.write(f"## {sub.name}\n")
                    output.write(read_file(index_file))
                    output.write("\n\n")
                continue

            index_file = sub / "index.md"
            if index_file.is_file():
                output.write(f"## {sub.name}\n")
                output.write(read_file(index_file))
                output.write("\n\n")
            else:
                for nested in sorted(sub.iterdir()):
                    if not nested.is_dir():
                        continue
                    nested_index = nested / "index.md"
                    if nested_index.is_file():
                        output.write(f"## {sub.name}/{nested.name}\n")
                        output.write(read_file(nested_index))
                        output.write("\n\n")

    output.write("</guidelines>\n\n")

    task_status = _get_task_status(trellis_dir)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. AGENTS.md is already injected above and remains the canonical repo entry.
Treat workflow.md and spec index files as navigation surfaces; read the specific downstream docs they point to when the task requires them.
Wait for the user's first message, then handle it following the project entry, workflow guide, and relevant specs.
Treat any active task as background context by default.
Only ask whether to continue it when the user's first message is explicitly about resuming work, or is too ambiguous to route safely.
</ready>""")

    context = output.getvalue()
    result = {
        "suppressOutput": True,
        "systemMessage": f"Trellis context injected ({len(context)} chars)",
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        },
    }

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
