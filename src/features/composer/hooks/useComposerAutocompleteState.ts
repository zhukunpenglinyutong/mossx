import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutocompleteItem } from "./useComposerAutocomplete";
import { useComposerAutocomplete } from "./useComposerAutocomplete";
import type { CustomCommandOption, CustomPromptOption } from "../../../types";
import {
  buildCommandInsertText,
  buildPromptInsertText,
  findNextPromptArgCursor,
  findPromptArgRangeAtCursor,
  getPromptArgumentHint,
} from "../../../utils/customPrompts";
import { isComposingEvent } from "../../../utils/keys";
import { projectMemoryFacade } from "../../project-memory/services/projectMemoryFacade";

type Skill = { name: string; description?: string };
type ManualMemorySuggestion = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  kind: string;
  importance: string;
  updatedAt: number;
  tags: string[];
};

type UseComposerAutocompleteStateArgs = {
  text: string;
  selectionStart: number | null;
  disabled: boolean;
  skills: Skill[];
  prompts: CustomPromptOption[];
  commands?: CustomCommandOption[];
  files: string[];
  directories?: string[];
  workspaceId?: string | null;
  onManualMemorySelect?: (memory: ManualMemorySuggestion) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setText: (next: string) => void;
  setSelectionStart: (next: number | null) => void;
};

const MAX_FILE_SUGGESTIONS = 500;
const MAX_MEMORY_SUGGESTIONS = 50;
const FILE_TRIGGER_PREFIX = new RegExp("^(?:\\s|[\"'`]|\\(|\\[|\\{)$");

function isFileTriggerActive(text: string, cursor: number | null) {
  if (!text || cursor === null) {
    return false;
  }
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) {
    return false;
  }
  const prevChar = atIndex > 0 ? beforeCursor[atIndex - 1] : "";
  if (prevChar && !FILE_TRIGGER_PREFIX.test(prevChar)) {
    return false;
  }
  const afterAt = beforeCursor.slice(atIndex + 1);
  return afterAt.length === 0 || !/\s/.test(afterAt);
}

function getFileTriggerQuery(text: string, cursor: number | null) {
  if (!text || cursor === null) {
    return null;
  }
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }
  const prevChar = atIndex > 0 ? beforeCursor[atIndex - 1] : "";
  if (prevChar && !FILE_TRIGGER_PREFIX.test(prevChar)) {
    return null;
  }
  const afterAt = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(afterAt)) {
    return null;
  }
  return afterAt;
}

function getMemoryTriggerQuery(text: string, cursor: number | null) {
  if (!text || cursor === null) {
    return null;
  }
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@@");
  if (atIndex < 0) {
    return null;
  }
  const prevChar = atIndex > 0 ? beforeCursor[atIndex - 1] : "";
  if (prevChar && !FILE_TRIGGER_PREFIX.test(prevChar)) {
    return null;
  }
  const afterAt = beforeCursor.slice(atIndex + 2);
  if (/\s/.test(afterAt)) {
    return null;
  }
  return afterAt;
}

export function useComposerAutocompleteState({
  text,
  selectionStart,
  disabled,
  skills,
  prompts,
  commands = [],
  files,
  directories = [],
  workspaceId = null,
  onManualMemorySelect,
  textareaRef,
  setText,
  setSelectionStart,
}: UseComposerAutocompleteStateArgs) {
  const [manualMemorySuggestions, setManualMemorySuggestions] = useState<
    ManualMemorySuggestion[]
  >([]);

  const manualMemoryQuery = useMemo(
    () => getMemoryTriggerQuery(text, selectionStart),
    [selectionStart, text],
  );

  useEffect(() => {
    if (!workspaceId || manualMemoryQuery === null) {
      setManualMemorySuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void projectMemoryFacade
        .list({
          workspaceId,
          query: manualMemoryQuery.trim() || null,
          importance: null,
          kind: null,
          tag: null,
          page: 0,
          pageSize: MAX_MEMORY_SUGGESTIONS,
        })
        .then((response) => {
          if (cancelled) {
            return;
          }
          setManualMemorySuggestions(
            response.items.map((item) => ({
              id: item.id,
              title: item.title?.trim() || item.summary?.trim() || item.id,
              summary: item.summary?.trim() || "",
              detail:
                item.detail?.trim() ||
                item.cleanText?.trim() ||
                item.summary?.trim() ||
                "",
              kind: item.kind || "note",
              importance: item.importance || "normal",
              updatedAt: item.updatedAt || item.createdAt || Date.now(),
              tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
            })),
          );
        })
        .catch(() => {
          if (!cancelled) {
            setManualMemorySuggestions([]);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [manualMemoryQuery, workspaceId]);

  const manualMemoryItems = useMemo<AutocompleteItem[]>(
    () =>
      manualMemorySuggestions.map((memory) => ({
        id: `memory:${memory.id}`,
        label: memory.title,
        description: memory.summary,
        kind: "manual-memory",
        memoryId: memory.id,
        memoryTitle: memory.title,
        memorySummary: memory.summary,
        memoryDetail: memory.detail,
        memoryKind: memory.kind,
        memoryImportance: memory.importance,
        memoryUpdatedAt: memory.updatedAt,
        memoryTags: memory.tags,
      })),
    [manualMemorySuggestions],
  );

  const skillItems = useMemo<AutocompleteItem[]>(
    () =>
      skills.map((skill) => ({
        id: `skill:${skill.name}`,
        label: skill.name,
        description: skill.description,
        insertText: skill.name,
      })),
    [skills],
  );

  const slashSkillItems = useMemo<AutocompleteItem[]>(
    () =>
      skills.map((skill) => ({
        id: `slash-skill:${skill.name}`,
        label: skill.name,
        description: skill.description,
        insertText: skill.name,
      })),
    [skills],
  );

  const fileItems = useMemo<AutocompleteItem[]>(
    () =>
      isFileTriggerActive(text, selectionStart)
        ? (() => {
            const query = getFileTriggerQuery(text, selectionStart) ?? "";
            const directoryItems: AutocompleteItem[] = directories
              .slice(0, MAX_FILE_SUGGESTIONS)
              .map((path) => ({
                id: `dir:${path}`,
                label: `${path}/`,
                insertText: `${path}/`,
                isDirectory: true,
              }));
            const fileItemsList: AutocompleteItem[] = (query
              ? files
              : files.slice(0, MAX_FILE_SUGGESTIONS)
            ).map((path) => ({
              id: path,
              label: path,
              insertText: path,
              isDirectory: false,
            }));
            return [...directoryItems, ...fileItemsList];
          })()
        : [],
    [directories, files, selectionStart, text],
  );

  const promptItems = useMemo<AutocompleteItem[]>(
    () =>
      prompts
        .filter((prompt) => prompt.name)
        .map((prompt) => {
          const insert = buildPromptInsertText(prompt);
          return {
            id: `prompt:${prompt.name}`,
            label: `prompts:${prompt.name}`,
            description: prompt.description,
            hint: getPromptArgumentHint(prompt),
            insertText: insert.text,
            cursorOffset: insert.cursorOffset,
          };
        }),
    [prompts],
  );

  const commandItems = useMemo<AutocompleteItem[]>(
    () =>
      commands
        .filter((command) => command.name)
        .map((command) => {
          const insert = buildCommandInsertText(command);
          return {
            id: `command:${command.name}`,
            label: command.name,
            description: command.description,
            hint: getPromptArgumentHint(command),
            insertText: insert.text,
            cursorOffset: insert.cursorOffset,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [commands],
  );

  const slashCommandItems = useMemo<AutocompleteItem[]>(() => {
    const commands: AutocompleteItem[] = [
      {
        id: "fork",
        label: "fork",
        description: "branch into a new thread",
        insertText: "fork",
      },
      {
        id: "mcp",
        label: "mcp",
        description: "list configured MCP tools",
        insertText: "mcp",
      },
      {
        id: "new",
        label: "new",
        description: "start a new chat",
        insertText: "new",
      },
      {
        id: "review",
        label: "review",
        description: "start a code review",
        insertText: "review",
      },
      {
        id: "resume",
        label: "resume",
        description: "refresh the active thread",
        insertText: "resume",
      },
      {
        id: "status",
        label: "status",
        description: "show session status",
        insertText: "status",
      },
      {
        id: "export",
        label: "export",
        description: "export current session to JSON",
        insertText: "export",
      },
      {
        id: "import",
        label: "import",
        description: "import a session from JSON file or URL",
        insertText: "import",
      },
      {
        id: "lsp",
        label: "lsp",
        description: "run OpenCode LSP diagnostics or symbol lookup",
        insertText: "lsp",
      },
      {
        id: "share",
        label: "share",
        description: "share current session and return link",
        insertText: "share",
      },
    ];
    return commands.sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const slashItems = useMemo<AutocompleteItem[]>(
    () => [...slashCommandItems, ...slashSkillItems, ...commandItems, ...promptItems],
    [commandItems, promptItems, slashCommandItems, slashSkillItems],
  );

  const triggers = useMemo(
    () => [
      { trigger: "/", items: slashItems },
      { trigger: "$", items: skillItems },
      { trigger: "@@", items: manualMemoryItems },
      { trigger: "@", items: fileItems },
    ],
    [fileItems, manualMemoryItems, skillItems, slashItems],
  );

  const {
    active: isAutocompleteOpen,
    trigger: activeTrigger,
    matches: autocompleteMatches,
    highlightIndex,
    setHighlightIndex,
    moveHighlight,
    range: autocompleteRange,
    close: closeAutocomplete,
  } = useComposerAutocomplete({
    text,
    selectionStart,
    triggers,
  });

  const applyAutocomplete = useCallback(
    (item: AutocompleteItem) => {
      if (!autocompleteRange || !activeTrigger) {
        return;
      }
      const triggerLength = activeTrigger.length;
      const triggerIndex = Math.max(0, autocompleteRange.start - triggerLength);
      const cursor = selectionStart ?? autocompleteRange.end;
      const promptRange =
        activeTrigger === "@" ? findPromptArgRangeAtCursor(text, cursor) : null;
      if (activeTrigger === "@@" && item.kind === "manual-memory" && item.memoryId) {
        const before = text.slice(0, triggerIndex);
        const after = text.slice(autocompleteRange.end);
        const nextText = `${before}${after}`;
        setText(nextText);
        closeAutocomplete();
        onManualMemorySelect?.({
          id: item.memoryId,
          title: item.memoryTitle ?? item.label,
          summary: item.memorySummary ?? item.description ?? "",
          detail: item.memoryDetail ?? "",
          kind: item.memoryKind ?? "note",
          importance: item.memoryImportance ?? "normal",
          updatedAt: item.memoryUpdatedAt ?? Date.now(),
          tags: item.memoryTags ?? [],
        });
        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) {
            return;
          }
          const nextCursor = before.length;
          textarea.focus();
          textarea.setSelectionRange(nextCursor, nextCursor);
          setSelectionStart(nextCursor);
        });
        return;
      }
      const before =
        activeTrigger === "@"
          ? text.slice(0, triggerIndex)
          : text.slice(0, autocompleteRange.start);
      const after = text.slice(autocompleteRange.end);
      const insert = item.insertText ?? item.label;
      const actualInsert = activeTrigger === "@"
        ? insert.replace(/^@+/, "")
        : insert;
      const needsSpace = promptRange
        ? false
        : after.length === 0
          ? true
          : !/^\s/.test(after);
      const nextText = `${before}${actualInsert}${needsSpace ? " " : ""}${after}`;
      setText(nextText);
      closeAutocomplete();
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        const insertCursor = Math.min(
          actualInsert.length,
          Math.max(0, item.cursorOffset ?? actualInsert.length),
        );
        const cursor =
          before.length +
          insertCursor +
          (item.cursorOffset === undefined ? (needsSpace ? 1 : 0) : 0);
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        setSelectionStart(cursor);
      });
    },
    [
      activeTrigger,
      autocompleteRange,
      closeAutocomplete,
      onManualMemorySelect,
      selectionStart,
      setSelectionStart,
      setText,
      text,
      textareaRef,
    ],
  );

  const handleTextChange = useCallback(
    (next: string, cursor: number | null) => {
      setText(next);
      setSelectionStart(cursor);
    },
    [setSelectionStart, setText],
  );

  const handleSelectionChange = useCallback(
    (cursor: number | null) => {
      setSelectionStart(cursor);
    },
    [setSelectionStart],
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        return;
      }
      if (isComposingEvent(event)) {
        return;
      }
      if (isAutocompleteOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveHighlight(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveHighlight(-1);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const selected =
            autocompleteMatches[highlightIndex] ?? autocompleteMatches[0];
          if (selected) {
            applyAutocomplete(selected);
          }
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const selected =
            autocompleteMatches[highlightIndex] ?? autocompleteMatches[0];
          if (selected) {
            applyAutocomplete(selected);
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeAutocomplete();
          return;
        }
        if ((event.key === " " || event.key === "Spacebar") && activeTrigger === "@@") {
          event.preventDefault();
          const selected =
            autocompleteMatches[highlightIndex] ?? autocompleteMatches[0];
          if (selected) {
            applyAutocomplete(selected);
          }
          return;
        }
      }
      if (event.key === "Tab") {
        const cursor = selectionStart ?? text.length;
        const nextCursor = findNextPromptArgCursor(text, cursor);
        if (nextCursor !== null) {
          event.preventDefault();
          requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) {
              return;
            }
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
            setSelectionStart(nextCursor);
          });
        }
      }
    },
    [
      applyAutocomplete,
      autocompleteMatches,
      closeAutocomplete,
      disabled,
      highlightIndex,
      activeTrigger,
      isAutocompleteOpen,
      moveHighlight,
      selectionStart,
      setSelectionStart,
      text,
      textareaRef,
    ],
  );

  return {
    isAutocompleteOpen,
    activeAutocompleteTrigger: activeTrigger,
    autocompleteMatches,
    highlightIndex,
    setHighlightIndex,
    applyAutocomplete,
    handleInputKeyDown,
    handleTextChange,
    handleSelectionChange,
  };
}
