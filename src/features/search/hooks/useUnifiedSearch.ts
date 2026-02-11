import { useEffect, useMemo, useState } from "react";
import type {
  ConversationItem,
  CustomCommandOption,
  SkillOption,
  ThreadSummary,
} from "../../../types";
import type { KanbanTask } from "../../kanban/types";
import type { HistoryItem } from "../../composer/hooks/useInputHistoryStore";
import { takeLimited } from "../perf/chunker";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_PROVIDER_LIMITS,
  SEARCH_TOTAL_LIMIT,
} from "../perf/limits";
import { reportSearchMetrics } from "../perf/searchMetrics";
import { searchCommands } from "../providers/commandsProvider";
import { searchFiles } from "../providers/filesProvider";
import { searchHistory } from "../providers/historyProvider";
import { searchKanbanTasks } from "../providers/kanbanProvider";
import { searchMessages } from "../providers/messageProvider";
import { searchSkills } from "../providers/skillsProvider";
import { searchThreads } from "../providers/threadProvider";
import { loadSearchRecencyMap } from "../ranking/recencyStore";
import { compareSearchResults } from "../ranking/score";
import type { SearchContentFilter, SearchResult } from "../types";

type WorkspaceSearchSource = {
  workspaceId: string;
  workspaceName: string;
  files: string[];
  threads: ThreadSummary[];
};

type UseUnifiedSearchOptions = {
  query: string;
  contentFilters: SearchContentFilter[];
  workspaceSources: WorkspaceSearchSource[];
  kanbanTasks: KanbanTask[];
  threadItemsByThread: Record<string, ConversationItem[]>;
  historyItems: HistoryItem[];
  skills: SkillOption[];
  commands: CustomCommandOption[];
  activeWorkspaceId?: string | null;
  maxResults?: number;
  workspaceNameByPath?: Map<string, string>;
};

export type ComputeUnifiedSearchOptions = Omit<UseUnifiedSearchOptions, "query" | "scope"> & {
  query: string;
  recencyMap?: Record<string, number>;
  reportMetrics?: boolean;
};

function shouldIncludeSection(
  filters: SearchContentFilter[],
  section: Exclude<SearchContentFilter, "all">,
): boolean {
  return filters.includes("all") || filters.includes(section);
}

function attachWorkspaceLabel(
  result: SearchResult,
  workspaceNameById: Map<string, string>,
  workspaceNameByPath?: Map<string, string>,
): SearchResult {
  if (!result.workspaceId) {
    return result;
  }
  const workspaceName = workspaceNameById.get(result.workspaceId)
    ?? workspaceNameByPath?.get(result.workspaceId);
  if (!workspaceName) {
    return result;
  }
  return {
    ...result,
    workspaceName,
  };
}

export function useUnifiedSearch({
  query,
  contentFilters,
  workspaceSources,
  kanbanTasks,
  threadItemsByThread,
  historyItems,
  skills,
  commands,
  activeWorkspaceId,
  maxResults = SEARCH_TOTAL_LIMIT,
  workspaceNameByPath,
}: UseUnifiedSearchOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return useMemo(() => {
    return computeUnifiedSearchResults({
      query: debouncedQuery,
      contentFilters,
      workspaceSources,
      kanbanTasks,
      threadItemsByThread,
      historyItems,
      skills,
      commands,
      activeWorkspaceId,
      maxResults,
      recencyMap: loadSearchRecencyMap(),
      reportMetrics: true,
      workspaceNameByPath,
    });
  }, [
    debouncedQuery,
    historyItems,
    kanbanTasks,
    maxResults,
    contentFilters,
    commands,
    skills,
    activeWorkspaceId,
    threadItemsByThread,
    workspaceSources,
    workspaceNameByPath,
  ]);
}

export function computeUnifiedSearchResults({
  query,
  contentFilters,
  workspaceSources,
  kanbanTasks,
  threadItemsByThread,
  historyItems,
  skills,
  commands,
  activeWorkspaceId,
  maxResults = SEARCH_TOTAL_LIMIT,
  recencyMap,
  reportMetrics = false,
  workspaceNameByPath,
}: ComputeUnifiedSearchOptions): SearchResult[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [] as SearchResult[];
  }

  const startedAt = performance.now();
  const recentOpenMap = recencyMap ?? loadSearchRecencyMap();
  const workspaceNameById = new Map(
    workspaceSources.map((source) => [source.workspaceId, source.workspaceName]),
  );

  const merged: SearchResult[] = [];

  for (const source of workspaceSources) {
    if (shouldIncludeSection(contentFilters, "files")) {
      merged.push(
        ...takeLimited(
          searchFiles(normalizedQuery, source.files, source.workspaceId),
          Math.max(8, Math.floor(SEARCH_PROVIDER_LIMITS.files / Math.max(workspaceSources.length, 1))),
        ),
      );
    }
    if (shouldIncludeSection(contentFilters, "threads")) {
      merged.push(
        ...takeLimited(
          searchThreads(normalizedQuery, source.threads, source.workspaceId),
          Math.max(8, Math.floor(SEARCH_PROVIDER_LIMITS.threads / Math.max(workspaceSources.length, 1))),
        ),
      );
    }
    if (shouldIncludeSection(contentFilters, "messages")) {
      merged.push(
        ...takeLimited(
          searchMessages({
            query: normalizedQuery,
            workspaceId: source.workspaceId,
            threads: source.threads,
            threadItemsByThread,
          }),
          Math.max(8, Math.floor(SEARCH_PROVIDER_LIMITS.messages / Math.max(workspaceSources.length, 1))),
        ),
      );
    }
  }

  if (shouldIncludeSection(contentFilters, "kanban")) {
    merged.push(
      ...takeLimited(searchKanbanTasks(normalizedQuery, kanbanTasks), SEARCH_PROVIDER_LIMITS.kanban),
    );
  }
  if (shouldIncludeSection(contentFilters, "history")) {
    merged.push(
      ...takeLimited(searchHistory(normalizedQuery, historyItems), SEARCH_PROVIDER_LIMITS.history),
    );
  }
  if (shouldIncludeSection(contentFilters, "skills")) {
    merged.push(
      ...takeLimited(
        searchSkills(normalizedQuery, skills, activeWorkspaceId),
        SEARCH_PROVIDER_LIMITS.skills,
      ),
    );
  }
  if (shouldIncludeSection(contentFilters, "commands")) {
    merged.push(
      ...takeLimited(searchCommands(normalizedQuery, commands), SEARCH_PROVIDER_LIMITS.commands),
    );
  }

  const withScopeLabel = merged.map((entry) => attachWorkspaceLabel(entry, workspaceNameById, workspaceNameByPath));
  withScopeLabel.sort((a, b) => compareSearchResults(a, b, recentOpenMap));
  const sliced = withScopeLabel.slice(0, maxResults);

  if (reportMetrics) {
    reportSearchMetrics({
      query: normalizedQuery,
      elapsedMs: Math.round(performance.now() - startedAt),
      resultCount: sliced.length,
    });
  }

  return sliced;
}
