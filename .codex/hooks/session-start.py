#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Codex Session Start Hook - Inject minimal Trellis context into Codex sessions.

Output format follows Codex hook protocol:
  stdout JSON → { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
"""

from __future__ import annotations

import json
import os
import sys
import warnings
from io import StringIO
from pathlib import Path

warnings.filterwarnings("ignore")


def should_skip_injection() -> bool:
    return os.environ.get("CODEX_NON_INTERACTIVE") == "1"


def main() -> None:
    if should_skip_injection():
        sys.exit(0)

    try:
        hook_input = json.loads(sys.stdin.read())
        project_dir = Path(hook_input.get("cwd", ".")).resolve()
    except (json.JSONDecodeError, KeyError):
        project_dir = Path(".").resolve()

    scripts_dir = project_dir / ".trellis" / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    from common.session_start_context import (  # type: ignore[import-not-found]
        build_current_state_summary,
        build_guideline_pointer_context,
        build_openspec_context,
        build_project_entry_context,
        build_workflow_toc,
        get_task_status_summary,
    )

    trellis_dir = project_dir / ".trellis"
    output = StringIO()

    output.write("""<session-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</session-context>

""")

    output.write("<current-state>\n")
    output.write(build_current_state_summary(project_dir))
    output.write("\n</current-state>\n\n")

    output.write("<project-entry>\n")
    output.write(build_project_entry_context(project_dir))
    output.write("\n</project-entry>\n\n")

    output.write("<workflow>\n")
    output.write(build_workflow_toc(trellis_dir / "workflow.md"))
    output.write("\n</workflow>\n\n")

    output.write("<openspec>\n")
    output.write(build_openspec_context(project_dir))
    output.write("\n</openspec>\n\n")

    output.write("<rule-pointers>\n")
    output.write(build_guideline_pointer_context(project_dir))
    output.write("\n</rule-pointers>\n\n")

    task_status = get_task_status_summary(trellis_dir)
    output.write(f"<task-status>\n{task_status}\n</task-status>\n\n")

    output.write("""<ready>
Context loaded. AGENTS.md remains the canonical repo entry.
Treat workflow.md, spec indexes, and OpenSpec entry docs as navigation surfaces.
Read the downstream files they point to only when the task requires them.
Treat active tasks as background context by default.
Only ask whether to continue an old task when the user's request is explicitly about resuming work, or is too ambiguous to route safely.
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
