# Proposal: Harden Session Start And Claude List Window

## Summary

Codex new conversation creation is not idempotent while the backend start call is slow, so multiple frontend callers can observe "no active thread", call `startThreadForWorkspace`, and later materialize several new Codex conversations. Claude sidebar listing also still has a hardcoded native list window that can be smaller than the user's project session display setting and smaller than the catalog page, causing real JSONL sessions to disappear or reappear depending on which source wins a refresh.

This change makes Codex start single-flight for the same workspace/engine/folder and aligns Claude native listing with the project session display count contract without changing sidebar root-collapse behavior.

## Problem

- Codex `startThreadForWorkspace` awaits `startThreadService(workspaceId)` directly. Concurrent callers do not share the in-flight request, so one slow start can become several backend starts.
- Claude native listing calls `listClaudeSessionsService(workspace.path, 50)`, while the project session display setting allows up to 200 visible roots and the catalog first page is 200.
- The display setting is a UI visibility preference, not a membership resolver. The fix must not use it to drop children, folders, archive/hidden filtering, or project scope correctness.

## Goals

- Ensure concurrent Codex start requests for the same workspace/engine/folder reuse one backend creation.
- Preserve activation semantics for callers that reuse an in-flight Codex start.
- Replace the Claude hardcoded native list window with an effective limit derived from existing project session display settings and catalog page size.
- Keep parent/child session projection, folder tree assignment, archive/hidden/delete filtering, and load-older cursor behavior intact.

## Non-Goals

- Do not redesign backend Claude pagination.
- Do not change the user-facing meaning of "项目会话显示数量"; it remains a root display/collapse preference.
- Do not single-flight local pending starts for Claude/Gemini/OpenCode in this change.
