import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Archive from "lucide-react/dist/esm/icons/archive";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import RotateCw from "lucide-react/dist/esm/icons/rotate-cw";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Undo2 from "lucide-react/dist/esm/icons/undo-2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EngineIcon } from "../../../../engine/components/EngineIcon";
import type { WorkspaceInfo } from "../../../../../types";
import type { EngineType } from "../../../../../types";
import {
  useWorkspaceSessionCatalog,
  type WorkspaceSessionCatalogFilters,
} from "../hooks/useWorkspaceSessionCatalog";

type GroupedWorkspace = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type NoticeState =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

type SessionManagementSectionProps = {
  title: string;
  description: string;
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: GroupedWorkspace[];
  initialWorkspaceId?: string | null;
  onSessionsMutated?: (workspaceId: string) => void;
};

type WorkspaceOption = {
  id: string;
  label: string;
};

const ENGINE_FILTER_ALL_VALUE = "__all__";

const DEFAULT_FILTERS: WorkspaceSessionCatalogFilters = {
  keyword: "",
  engine: "",
  status: "active",
};

function getSortOrderValue(value: number | null | undefined) {
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

function buildWorkspaceOptions(
  workspaces: WorkspaceInfo[],
  groupedWorkspaces: GroupedWorkspace[],
): WorkspaceOption[] {
  const rootById = new Map<string, WorkspaceInfo>();
  const worktreesByParent = new Map<string, WorkspaceInfo[]>();

  workspaces.forEach((workspace) => {
    if ((workspace.kind ?? "main") === "worktree" && workspace.parentId) {
      const bucket = worktreesByParent.get(workspace.parentId) ?? [];
      bucket.push(workspace);
      worktreesByParent.set(workspace.parentId, bucket);
      return;
    }
    rootById.set(workspace.id, workspace);
  });

  const appendOptionsForWorkspace = (workspace: WorkspaceInfo, output: WorkspaceOption[]) => {
    const groupPrefix =
      groupedWorkspaces.find((group) => group.workspaces.some((item) => item.id === workspace.id))
        ?.name ?? "";
    output.push({
      id: workspace.id,
      label: groupPrefix ? `${groupPrefix} / ${workspace.name}` : workspace.name,
    });
    const worktrees = [...(worktreesByParent.get(workspace.id) ?? [])].sort((left, right) => {
      const sortDiff =
        getSortOrderValue(left.settings.sortOrder) - getSortOrderValue(right.settings.sortOrder);
      if (sortDiff !== 0) {
        return sortDiff;
      }
      return left.name.localeCompare(right.name);
    });
    worktrees.forEach((worktree) => {
      output.push({
        id: worktree.id,
        label: `${groupPrefix ? `${groupPrefix} / ` : ""}[worktree] ${worktree.name}`,
      });
    });
  };

  const orderedRoots = [...rootById.values()].sort((left, right) => {
    const sortDiff =
      getSortOrderValue(left.settings.sortOrder) - getSortOrderValue(right.settings.sortOrder);
    if (sortDiff !== 0) {
      return sortDiff;
    }
    return left.name.localeCompare(right.name);
  });

  const options: WorkspaceOption[] = [];
  orderedRoots.forEach((workspace) => appendOptionsForWorkspace(workspace, options));
  return options;
}

function normalizeEngineType(engine: string): EngineType {
  if (engine === "claude" || engine === "gemini" || engine === "opencode") {
    return engine;
  }
  return "codex";
}

function formatUpdatedAtDisplay(updatedAt: number, locale: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat(locale || undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function SessionManagementSection({
  title,
  description,
  workspaces,
  groupedWorkspaces,
  initialWorkspaceId = null,
  onSessionsMutated,
}: SessionManagementSectionProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const workspaceOptions = useMemo(
    () => buildWorkspaceOptions(workspaces, groupedWorkspaces),
    [groupedWorkspaces, workspaces],
  );
  const workspaceLabelById = useMemo(
    () => new Map(workspaceOptions.map((option) => [option.id, option.label])),
    [workspaceOptions],
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    initialWorkspaceId && workspaceOptions.some((item) => item.id === initialWorkspaceId)
      ? initialWorkspaceId
      : workspaceOptions[0]?.id ?? null,
  );
  const [filters, setFilters] = useState<WorkspaceSessionCatalogFilters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Record<string, true>>({});
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const {
    entries,
    nextCursor,
    partialSource,
    error,
    isLoading,
    isLoadingMore,
    isMutating,
    reload,
    loadMore,
    mutate,
  } = useWorkspaceSessionCatalog({ workspaceId, filters });

  const selectedCount = useMemo(() => Object.keys(selectedIds).length, [selectedIds]);
  const allSelected =
    entries.length > 0 && entries.every((entry) => Boolean(selectedIds[entry.sessionId]));

  const engineFilterLabel = useMemo(
    () => ({
      all: t("settings.sessionManagementEngineAll"),
      codex: t("settings.projectSessionEngineCodex"),
      claude: t("settings.projectSessionEngineClaude"),
      gemini: t("settings.projectSessionEngineGemini"),
      opencode: t("settings.projectSessionEngineOpencode"),
    }),
    [t],
  );

  const toggleSelection = (sessionId: string) => {
    setSelectedIds((current) => {
      if (current[sessionId]) {
        const next = { ...current };
        delete next[sessionId];
        return next;
      }
      return { ...current, [sessionId]: true };
    });
  };

  const resetSelection = () => {
    setSelectedIds({});
    setDeleteArmed(false);
  };

  const keepOnlySelected = (sessionIds: string[]) => {
    const next: Record<string, true> = {};
    sessionIds.forEach((sessionId) => {
      next[sessionId] = true;
    });
    setSelectedIds(next);
    setDeleteArmed(false);
  };

  const handleSelectAll = () => {
    const next: Record<string, true> = {};
    entries.forEach((entry) => {
      next[entry.sessionId] = true;
    });
    setSelectedIds(next);
  };

  const handleWorkspaceChange = (nextWorkspaceId: string | null) => {
    setWorkspaceId(nextWorkspaceId ?? null);
    resetSelection();
    setNotice(null);
  };

  const handleFiltersChange = (
    nextFilters: Partial<WorkspaceSessionCatalogFilters>,
  ) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
    resetSelection();
    setNotice(null);
  };

  const handleRefresh = async () => {
    await reload();
    resetSelection();
  };

  useEffect(() => {
    if (workspaceOptions.length === 0) {
      if (workspaceId !== null) {
        setWorkspaceId(null);
      }
      return;
    }
    if (workspaceId && workspaceLabelById.has(workspaceId)) {
      return;
    }
    setWorkspaceId(workspaceOptions[0]?.id ?? null);
  }, [workspaceId, workspaceLabelById, workspaceOptions]);

  const handleMutation = async (kind: "archive" | "unarchive" | "delete") => {
    const sessionIds = Object.keys(selectedIds);
    if (sessionIds.length === 0) {
      return;
    }
    if (kind === "delete" && !deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    try {
      const response = await mutate(kind, sessionIds);
      const succeeded = response.results.filter((item) => item.ok);
      const failed = response.results.filter((item) => !item.ok);
      if (failed.length === 0) {
        const successKey =
          kind === "archive"
            ? "settings.sessionManagementArchiveSuccess"
            : kind === "unarchive"
              ? "settings.sessionManagementUnarchiveSuccess"
              : "settings.sessionManagementDeleteSuccess";
        setNotice({
          kind: "success",
          text: t(successKey, { count: succeeded.length }),
        });
      } else {
        const unknownReason = t("settings.projectSessionDeleteUnknownReason");
        const failureText = failed
          .map((item) => item.error?.trim() || unknownReason)
          .join(" · ");
        setNotice({
          kind: "error",
          text: t("settings.sessionManagementMutationPartial", {
            succeeded: succeeded.length,
            failed: failed.length,
            reason: failureText,
          }),
        });
      }
      const shouldReloadInBackground = kind !== "delete" || failed.length > 0;
      if (shouldReloadInBackground) {
        void reload();
      }
      if (workspaceId && succeeded.length > 0) {
        onSessionsMutated?.(workspaceId);
      }
      if (failed.length > 0) {
        keepOnlySelected(failed.map((item) => item.sessionId));
      } else {
        resetSelection();
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className={`settings-project-sessions${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className={`settings-project-sessions-expand-btn${expanded ? " is-open" : ""}`}
        onClick={() => setExpanded((current) => !current)}
        data-testid="settings-project-sessions-expand-toggle"
      >
        {expanded ? (
          <ChevronDown className="settings-project-sessions-expand-icon" size={14} aria-hidden />
        ) : (
          <ChevronRight className="settings-project-sessions-expand-icon" size={14} aria-hidden />
        )}
        <span className="settings-project-sessions-expand-label">{title}</span>
        <span className="settings-project-sessions-expand-count">({entries.length})</span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="settings-project-sessions-header">
            <div className="settings-project-sessions-title-wrap">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p>{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefresh()}
                disabled={!workspaceId || isLoading || isMutating}
              >
                <RotateCw size={14} aria-hidden />
                {t("settings.projectSessionRefresh")}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(180px,1.1fr)_minmax(160px,.8fr)_minmax(140px,.7fr)_minmax(140px,.7fr)]">
            <Select value={workspaceId ?? undefined} onValueChange={handleWorkspaceChange}>
              <SelectTrigger data-testid="settings-project-sessions-workspace-picker-trigger">
                <SelectValue placeholder={t("settings.workspacePickerLabel")}>
                  {workspaceId ? workspaceLabelById.get(workspaceId) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {workspaceOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={filters.keyword}
              onChange={(event) => handleFiltersChange({ keyword: event.target.value })}
              placeholder={t("settings.sessionManagementSearchPlaceholder")}
              aria-label={t("settings.sessionManagementSearchPlaceholder")}
            />

            <Select
              value={filters.engine || ENGINE_FILTER_ALL_VALUE}
              onValueChange={(value) =>
                handleFiltersChange({
                  engine: value === ENGINE_FILTER_ALL_VALUE || value == null ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("settings.sessionManagementEngineAll")}>
                  {engineFilterLabel[
                    (filters.engine || "all") as keyof typeof engineFilterLabel
                  ] ?? t("settings.sessionManagementEngineAll")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ENGINE_FILTER_ALL_VALUE}>
                  {t("settings.sessionManagementEngineAll")}
                </SelectItem>
                <SelectItem value="codex">{engineFilterLabel.codex}</SelectItem>
                <SelectItem value="claude">{engineFilterLabel.claude}</SelectItem>
                <SelectItem value="gemini">{engineFilterLabel.gemini}</SelectItem>
                <SelectItem value="opencode">{engineFilterLabel.opencode}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(value) =>
                handleFiltersChange({
                  status: value as WorkspaceSessionCatalogFilters["status"],
                })
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {filters.status === "archived"
                    ? t("settings.sessionManagementStatusArchived")
                    : filters.status === "all"
                      ? t("settings.sessionManagementStatusAll")
                      : t("settings.sessionManagementStatusActive")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("settings.sessionManagementStatusActive")}</SelectItem>
                <SelectItem value="archived">
                  {t("settings.sessionManagementStatusArchived")}
                </SelectItem>
                <SelectItem value="all">{t("settings.sessionManagementStatusAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="settings-project-sessions-toolbar">
            <span className="settings-project-sessions-selected">
              {t("settings.projectSessionSelectedCount", { count: selectedCount })}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="settings-project-sessions-btn"
                onClick={handleSelectAll}
                disabled={entries.length === 0 || allSelected}
              >
                {t("settings.projectSessionSelectAll")}
              </button>
              <button
                type="button"
                className="settings-project-sessions-btn"
                onClick={resetSelection}
                disabled={selectedCount === 0}
              >
                {t("settings.projectSessionClearSelection")}
              </button>
              <button
                type="button"
                className="settings-project-sessions-btn"
                onClick={() => void handleMutation("archive")}
                disabled={selectedCount === 0 || isMutating}
              >
                <Archive size={14} aria-hidden />
                {t("settings.sessionManagementArchiveSelected")}
              </button>
              <button
                type="button"
                className="settings-project-sessions-btn"
                onClick={() => void handleMutation("unarchive")}
                disabled={selectedCount === 0 || isMutating}
              >
                <Undo2 size={14} aria-hidden />
                {t("settings.sessionManagementUnarchiveSelected")}
              </button>
              <button
                type="button"
                className="settings-project-sessions-btn is-danger"
                onClick={() => void handleMutation("delete")}
                disabled={selectedCount === 0 || isMutating}
                data-testid="settings-project-sessions-delete-selected"
              >
                <Trash2 size={14} aria-hidden />
                {deleteArmed
                  ? t("settings.projectSessionConfirmDeleteSelected", { count: selectedCount })
                  : t("settings.projectSessionDeleteSelected")}
              </button>
            </div>
          </div>

          {notice ? (
            <div className={`settings-project-sessions-notice is-${notice.kind}`}>{notice.text}</div>
          ) : null}
          {partialSource ? (
            <div className="settings-project-sessions-notice">
              {t("settings.sessionManagementPartialSource", { source: partialSource })}
            </div>
          ) : null}
          {error ? (
            <div className="settings-project-sessions-notice is-error">{error}</div>
          ) : null}

          {!workspaceId ? (
            <div className="settings-project-sessions-empty">
              {t("settings.projectSessionWorkspaceRequired")}
            </div>
          ) : isLoading ? (
            <div className="settings-project-sessions-empty">{t("settings.projectSessionLoading")}</div>
          ) : entries.length === 0 ? (
            <div className="settings-project-sessions-empty">{t("settings.projectSessionEmpty")}</div>
          ) : (
            <>
              <ul className="settings-project-sessions-list">
                {entries.map((entry) => {
                  const selected = Boolean(selectedIds[entry.sessionId]);
                  const engineLabel =
                    engineFilterLabel[normalizeEngineType(entry.engine)] ??
                    entry.engine;
                  return (
                    <li key={entry.sessionId}>
                      <label
                        className={`settings-project-sessions-item${selected ? " is-selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelection(entry.sessionId)}
                          aria-label={entry.title}
                        />
                        <span className="settings-project-sessions-item-engine" aria-hidden>
                          <EngineIcon engine={normalizeEngineType(entry.engine)} size={14} />
                        </span>
                        <span className="settings-project-sessions-item-content">
                          <span className="flex items-center gap-2">
                            <span className="settings-project-sessions-item-title">
                              {entry.title.trim() || t("settings.projectSessionItemUntitled")}
                            </span>
                            {entry.archivedAt ? (
                              <Badge variant="secondary" size="sm">
                                {t("settings.sessionManagementBadgeArchived")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="settings-project-sessions-item-meta">
                            <span>{engineLabel}</span>
                            <span>·</span>
                            <span>{formatUpdatedAtDisplay(entry.updatedAt, i18n.language)}</span>
                            {entry.sourceLabel ? (
                              <>
                                <span>·</span>
                                <span>{entry.sourceLabel}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {nextCursor ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadMore()}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore
                      ? t("settings.sessionManagementLoadingMore")
                      : t("settings.sessionManagementLoadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
