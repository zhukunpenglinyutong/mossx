// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMemoryPanel } from "./ProjectMemoryPanel";
import { useProjectMemory } from "../hooks/useProjectMemory";
import { projectMemoryFacade } from "../services/projectMemoryFacade";

let activeLocale: "zh" | "en" = "en";

const I18N_MAP: Record<string, { zh: string; en: string }> = {
  "memory.selectWorkspace": { zh: "请选择工作区", en: "Select workspace" },
  "memory.loading": { zh: "加载中", en: "Loading" },
  "memory.empty": { zh: "暂无记忆", en: "No memories" },
  "memory.filteredEmpty": { zh: "当前筛选下没有记忆。", en: "No memories match the current filters." },
  "memory.searchPlaceholder": { zh: "搜索记忆", en: "Search memory" },
  "memory.workspacePickerLabel": { zh: "工作区", en: "Workspace" },
  "memory.workspacePickerEmpty": { zh: "暂无工作区", en: "No workspace" },
  "memory.autoCaptureWorkspace": { zh: "启用该工作区自动记忆", en: "Enable auto capture for this workspace" },
  "memory.contextInjectionEnabled": { zh: "启用对话记忆上下文注入", en: "Enable memory context injection for chat" },
  "memory.contextInjectionManualHint": { zh: "已改为聊天输入 @@ 手动关联记忆（一次性注入）。", en: "Switched to manual memory linking with @@ in chat (one-shot injection)." },
  "memory.manualInjectionMode": { zh: "手动关联注入策略", en: "Manual injection strategy" },
  "memory.manualInjectionModeDetail": { zh: "详细模式（detail）", en: "Detail mode (detail)" },
  "memory.manualInjectionModeSummary": { zh: "摘要模式（summary）", en: "Summary mode (summary)" },
  "memory.manualInjectionModeHint": { zh: "默认详细模式：发送时注入记忆 detail；幕布仍仅展示摘要。", en: "Default is detail mode: inject memory detail, while canvas still shows summary only." },
  "memory.kind.all": { zh: "全部类型", en: "All kinds" },
  "memory.kind.projectContext": { zh: "项目上下文", en: "Project context" },
  "memory.kind.conversation": { zh: "对话", en: "Conversation" },
  "memory.kind.codeDecision": { zh: "代码决策", en: "Code decision" },
  "memory.kind.knownIssue": { zh: "已知问题", en: "Known issue" },
  "memory.kind.note": { zh: "笔记", en: "Note" },
  "memory.importance.all": { zh: "全部优先级", en: "All priorities" },
  "memory.importance.high": { zh: "高", en: "High" },
  "memory.importance.medium": { zh: "中", en: "Medium" },
  "memory.importance.low": { zh: "低", en: "Low" },
  "memory.tagPlaceholder": { zh: "标签筛选", en: "Filter by tag" },
  "memory.quickTags": { zh: "快捷标签", en: "Quick tags" },
  "memory.selectRecord": { zh: "请选择记录", en: "Select a record" },
  "memory.unselectAll": { zh: "取消全选", en: "Unselect all" },
  "memory.selectAll": { zh: "全选", en: "Select all" },
  "memory.batchSetHigh": { zh: "批量设为高", en: "Set selected to High" },
  "memory.batchSetMedium": { zh: "批量设为中", en: "Set selected to Medium" },
  "memory.batchSetLow": { zh: "批量设为低", en: "Set selected to Low" },
  "memory.batchDelete": { zh: "删除选中", en: "Delete selected" },
  "memory.saving": { zh: "保存中...", en: "Saving..." },
  "memory.save": { zh: "保存", en: "Save" },
  "memory.delete": { zh: "删除", en: "Delete" },
  "memory.prevPage": { zh: "上一页", en: "Prev" },
  "memory.nextPage": { zh: "下一页", en: "Next" },
  "memory.closeHelp": { zh: "关闭帮助", en: "Close help" },
  "memory.batchDeleteConfirm": { zh: "确认删除 {{count}} 条", en: "Delete {{count}} selected memories?" },
  "memory.cancel": { zh: "取消", en: "Cancel" },
  "memory.confirmDelete": { zh: "确认删除", en: "Confirm delete" },
  "memory.clearAll": { zh: "清空所有记忆", en: "Clear all" },
  "memory.clearAllConfirm": { zh: "确认清空", en: "Clear all memories?" },
  "memory.title": { zh: "项目记忆", en: "Project Memory" },
  "memory.refresh": { zh: "刷新", en: "Refresh" },
  "memory.settings": { zh: "设置", en: "Settings" },
  "memory.help": { zh: "帮助", en: "Help" },
  "memory.closeManager": { zh: "关闭面板", en: "Close manager" },
  "memory.detailTagsPlaceholder": { zh: "标签（逗号分隔）", en: "Tags (comma separated)" },
  "memory.detailPreviewTitle": { zh: "格式预览", en: "Formatted preview" },
  "memory.detailPreviewEmpty": { zh: "暂无可预览内容", en: "No content to preview." },
  "memory.detailLoading": { zh: "正在加载完整记忆详情...", en: "Loading full memory detail..." },
  "memory.detailSaved": { zh: "记忆详情已保存。", en: "Memory detail saved." },
  "memory.editManualDetail": { zh: "手动笔记详情", en: "Manual note detail" },
  "memory.copyTurn": { zh: "复制整轮内容", en: "Copy full turn" },
  "memory.copyTurnSuccess": { zh: "整轮内容已复制。", en: "Full turn copied." },
  "memory.copyUnavailable": { zh: "剪贴板不可用。", en: "Clipboard is unavailable." },
  "memory.deleteConfirm": { zh: "确定删除这条记忆吗？此操作不可恢复。", en: "Delete this memory? This action cannot be undone." },
  "memory.turnUserInput": { zh: "用户输入", en: "User input" },
  "memory.turnAssistantResponse": { zh: "AI 回复", en: "AI response" },
  "memory.turnAssistantThinkingSummary": { zh: "AI 思考摘要", en: "AI thinking summary" },
  "memory.recordKind.conversationTurn": { zh: "整轮对话", en: "Turn" },
  "memory.recordKind.manualNote": { zh: "手动笔记", en: "Manual" },
  "memory.recordKind.legacy": { zh: "旧记录", en: "Legacy" },
  "memory.health.complete": { zh: "完整", en: "Complete" },
  "memory.health.all": { zh: "全部健康状态", en: "All health states" },
  "memory.health.inputOnly": { zh: "仅用户输入", en: "Input only" },
  "memory.health.assistantOnly": { zh: "仅 AI 回复", en: "AI only" },
  "memory.health.pendingFusion": { zh: "等待融合", en: "Pending" },
  "memory.health.captureFailed": { zh: "捕获失败", en: "Capture failed" },
  "memory.review.unreviewed": { zh: "待整理", en: "Unreviewed" },
  "memory.review.all": { zh: "全部整理状态", en: "All review states" },
  "memory.review.kept": { zh: "已保留", en: "Kept" },
  "memory.review.converted": { zh: "已转换", en: "Converted" },
  "memory.review.obsolete": { zh: "已过期", en: "Obsolete" },
  "memory.review.dismissed": { zh: "已忽略", en: "Dismissed" },
  "memory.workbenchOverview": { zh: "项目记忆工作台概览", en: "Project memory workbench overview" },
  "memory.workbenchTotal": { zh: "总数", en: "Total" },
  "memory.workbenchSelected": { zh: "已选", en: "Selected" },
  "memory.workbenchReview": { zh: "整理", en: "Review" },
  "memory.workbenchHealth": { zh: "健康", en: "Health" },
  "memory.memoryList": { zh: "记忆列表", en: "Memory list" },
  "memory.memoryDetail": { zh: "记忆详情", en: "Memory detail" },
  "memory.quickTagsMore": { zh: "+{{count}} 更多", en: "+{{count}} more" },
  "memory.quickTagsCollapse": { zh: "收起", en: "Show less" },
  "memory.sourceLocator": { zh: "原始对话", en: "Original turn" },
  "memory.sourceLocatorAvailable": { zh: "thread 与 turn 可用", en: "thread and turn available" },
  "memory.sourceLocatorUnavailable": { zh: "来源不可定位", en: "source unavailable" },
  "memory.copySourceLocator": { zh: "复制来源", en: "Copy source" },
  "memory.sourceLocatorCopied": { zh: "来源定位已复制。", en: "Source locator copied." },
  "memory.reviewActions": { zh: "整理操作", en: "Review actions" },
  "memory.reviewKeep": { zh: "保留", en: "Keep" },
  "memory.reviewConvert": { zh: "转为手动笔记", en: "Convert to manual note" },
  "memory.reviewObsolete": { zh: "标记过期", en: "Mark obsolete" },
  "memory.reviewDismiss": { zh: "忽略", en: "Dismiss" },
  "memory.reviewStateUpdated": { zh: "整理状态已更新为 {{state}}。", en: "Review state updated to {{state}}." },
  "memory.reviewConverted": { zh: "已转为手动笔记，并标记原始对话为已转换。", en: "Converted to a manual note and marked the original turn as converted." },
  "memory.diagnosticsTitle": { zh: "诊断与修复", en: "Diagnostics and repair" },
  "memory.diagnosticsRun": { zh: "运行诊断", en: "Run diagnostics" },
  "memory.diagnosticsRunning": { zh: "诊断中...", en: "Diagnosing..." },
  "memory.diagnosticsHint": { zh: "只检查 Project Memory 存储，不扫描项目源码。", en: "Checks only Project Memory storage, not project source files." },
  "memory.diagnosticsSummary": { zh: "诊断：总数 {{total}}，不完整 {{incomplete}}，重复 turn {{duplicates}} 组，坏文件 {{badFiles}} 个。", en: "Diagnostics: {{total}} total, {{incomplete}} incomplete, {{duplicates}} duplicate turn groups, {{badFiles}} bad files." },
  "memory.reconcileDryRun": { zh: "Dry run", en: "Dry run" },
  "memory.reconcileApply": { zh: "应用修复", en: "Apply repair" },
  "memory.reconcileRunning": { zh: "处理中...", en: "Running..." },
  "memory.reconcileDryRunDone": { zh: "Dry run 完成：可修复 {{count}} 项。", en: "Dry run completed: {{count}} fixable items." },
  "memory.reconcileApplyDone": { zh: "修复完成：已修复 {{count}} 项。", en: "Repair completed: fixed {{count}} items." },
  "memory.reconcileSummary": { zh: "Reconcile：可修复 {{fixable}}，已修复 {{fixed}}，跳过 {{skipped}}。", en: "Reconcile: {{fixable}} fixable, {{fixed}} fixed, {{skipped}} skipped." },
  "memory.reconcileApplyConfirm": { zh: "确认应用可确定的安全修复吗？无法合并的冲突会被跳过。", en: "Apply deterministic safe repairs? Conflicts that cannot be merged safely will be skipped." },
};

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const raw = I18N_MAP[key]?.[activeLocale] ?? key;
      if (!params) {
        return raw;
      }
      return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, p: string) => String(params[p] ?? ""));
    },
    i18n: {
      language: activeLocale,
      changeLanguage: vi.fn(async (next: string) => {
        activeLocale = next === "zh" ? "zh" : "en";
      }),
    },
  }),
}));

vi.mock("../../layout/components/PanelTabs", () => ({
  PanelTabs: () => <div data-testid="panel-tabs" />,
}));

vi.mock("../hooks/useProjectMemory", () => ({
  useProjectMemory: vi.fn(),
}));

vi.mock("../services/projectMemoryFacade", () => ({
  projectMemoryFacade: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    diagnostics: vi.fn(),
    reconcile: vi.fn(),
  },
}));

const mockUseProjectMemory = vi.mocked(useProjectMemory);
const mockFacade = vi.mocked(projectMemoryFacade);

const baseItem = {
  id: "memory-1",
  workspaceId: "ws-1",
  kind: "note",
  title: "Memory title",
  summary: "Memory summary",
  detail: "Memory detail",
  cleanText: "Memory detail",
  tags: [],
  importance: "high",
  source: "manual",
  fingerprint: "fp-1",
  createdAt: 1,
  updatedAt: 1,
};

function buildHookState(overrides: Record<string, unknown> = {}) {
  return {
    items: [baseItem],
    loading: false,
    error: null,
    query: "",
    kind: null,
    importance: null,
    tag: "",
    total: 80,
    page: 0,
    pageSize: 50,
    selectedId: baseItem.id,
    selectedItem: baseItem,
    detailLoading: false,
    detailError: null,
    workspaceAutoEnabled: true,
    settingsLoading: false,
    setQuery: vi.fn(),
    setKind: vi.fn(),
    setImportance: vi.fn(),
    setTag: vi.fn(),
    setPage: vi.fn(),
    setSelectedId: vi.fn(),
    toggleWorkspaceAutoCapture: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    updateMemory: vi.fn(async () => baseItem),
    deleteMemory: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("ProjectMemoryPanel", () => {
  beforeEach(() => {
    activeLocale = "en";
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
    mockUseProjectMemory.mockReturnValue(buildHookState() as never);
    mockFacade.create.mockResolvedValue(baseItem as never);
    mockFacade.update.mockResolvedValue(baseItem as never);
    mockFacade.delete.mockResolvedValue();
    mockFacade.list.mockResolvedValue({ items: [baseItem], total: 1 } as never);
    mockFacade.diagnostics.mockResolvedValue({
      workspaceId: "ws-1",
      total: 2,
      healthCounts: {
        complete: 1,
        input_only: 1,
        assistant_only: 0,
        pending_fusion: 0,
        capture_failed: 0,
      },
      duplicateTurnGroups: [],
      badFiles: [],
    } as never);
    mockFacade.reconcile.mockResolvedValue({
      workspaceId: "ws-1",
      dryRun: true,
      fixableCount: 1,
      fixedCount: 0,
      skippedCount: 0,
      duplicateGroups: 1,
      changedMemoryIds: [],
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it("updates kind/importance labels after language switch", () => {
    const { rerender } = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Note", { selector: ".project-memory-list-kind" })).toBeTruthy();
    expect(screen.getByText("High", { selector: ".project-memory-list-importance" })).toBeTruthy();

    activeLocale = "zh";
    rerender(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("笔记", { selector: ".project-memory-list-kind" })).toBeTruthy();
    expect(screen.getByText("高", { selector: ".project-memory-list-importance" })).toBeTruthy();
  });

  it("renders workspace picker in manager header and switches workspace", () => {
    const onSelectWorkspace = vi.fn();
    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        workspaces={[
          { id: "ws-1", name: "Main Project", path: "/repo/main", connected: true },
          { id: "ws-2", name: "Side Project", path: "/repo/side", connected: true },
        ]}
        onSelectWorkspace={onSelectWorkspace}
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    const picker = screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement;
    expect(picker.value).toBe("ws-1");

    fireEvent.change(picker, { target: { value: "ws-2" } });

    expect(onSelectWorkspace).toHaveBeenCalledWith("ws-2");
  });

  it("shows batch action buttons only after selection", async () => {
    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Set selected to High" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByRole("button", { name: "Set selected to High" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set selected to Medium" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set selected to Low" })).toBeTruthy();

    const highButton = screen.getByRole("button", { name: "Set selected to High" }) as HTMLButtonElement;
    fireEvent.click(highButton);

    await waitFor(() => {
      expect(mockFacade.update).toHaveBeenCalled();
    });
  });

  it("disables pagination buttons at first and last pages", () => {
    let hookState = buildHookState({ page: 0, total: 80, pageSize: 50 });
    mockUseProjectMemory.mockImplementation(() => hookState as never);

    const { rerender } = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    const prevAtFirst = screen.getByRole("button", { name: "Prev" }) as HTMLButtonElement;
    const nextAtFirst = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;

    expect(prevAtFirst.disabled).toBe(true);
    expect(nextAtFirst.disabled).toBe(false);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    hookState = buildHookState({ page: 1, total: 80, pageSize: 50 });
    rerender(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    const prevAtLast = screen.getByRole("button", { name: "Prev" }) as HTMLButtonElement;
    const nextAtLast = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;

    expect(prevAtLast.disabled).toBe(false);
    expect(nextAtLast.disabled).toBe(true);
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("resets filters and keeps the requested memory selected when focus signal arrives", () => {
    const hookState = buildHookState({
      query: "stale",
      kind: "note",
      importance: "high",
      tag: "tag-a",
    });
    mockUseProjectMemory.mockReturnValue(hookState as never);

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
        focusMemoryId="memory-1"
        focusRequestKey={2}
      />,
    );

    expect(hookState.setQuery).toHaveBeenCalledWith("");
    expect(hookState.setKind).toHaveBeenCalledWith(null);
    expect(hookState.setImportance).toHaveBeenCalledWith(null);
    expect(hookState.setTag).toHaveBeenCalledWith("");
    expect(hookState.setPage).toHaveBeenCalledWith(0);
  });

  it("renders markdown formatting in detail preview sections", async () => {
    const detail = [
      "用户输入：这是啥",
      "助手输出摘要：这是摘要",
      "助手输出：## 规范清单",
      "- 第一条",
      "- 第二条",
      "**请遵守**",
    ].join("\n");
    const markdownItem = {
      ...baseItem,
      detail,
      cleanText: detail,
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [markdownItem],
        selectedId: markdownItem.id,
        selectedItem: markdownItem,
      }) as never,
    );

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Formatted preview")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "规范清单" })).toBeTruthy();
    });
    expect(screen.getByText("第一条")).toBeTruthy();
    expect(screen.getByText("第二条")).toBeTruthy();
    expect(screen.getByText("请遵守")).toBeTruthy();
  });

  it("keeps manual memory editable", async () => {
    const hookState = buildHookState();
    mockUseProjectMemory.mockReturnValue(hookState as never);
    const view = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    const textarea = view.container.querySelector(".project-memory-detail-text") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, { target: { value: "Updated manual detail" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(hookState.updateMemory).toHaveBeenCalledWith("memory-1", {
        detail: "Updated manual detail",
        source: "manual",
      });
    });
    expect(view.container.querySelector(".project-memory-detail-title")).toBeNull();
  });

  it("keeps legacy memories visible and editable", () => {
    const legacyItem = {
      ...baseItem,
      id: "legacy-memory-1",
      recordKind: "legacy",
      source: "auto",
      title: "Legacy title",
      summary: "Legacy summary",
      detail: "Legacy detail",
      cleanText: "Legacy detail",
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [legacyItem],
        selectedId: legacyItem.id,
        selectedItem: legacyItem,
      }) as never,
    );

    const view = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Legacy").length).toBeGreaterThan(0);
    expect(screen.getByText("Legacy summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(view.container.querySelector(".project-memory-detail-text")).toBeTruthy();
  });

  it("renders conversation turn detail as read-only full user input and AI response", async () => {
    const turnItem = {
      ...baseItem,
      id: "turn-memory-1",
      schemaVersion: 2,
      recordKind: "conversation_turn",
      kind: "conversation",
      source: "conversation_turn",
      engine: "codex",
      threadId: "codex-thread-1",
      turnId: "turn-1",
      userInput: "完整用户输入",
      assistantResponse: "完整 AI 回复",
      summary: "turn summary",
      detail: null,
      cleanText: "projection",
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [turnItem],
        selectedId: turnItem.id,
        selectedItem: turnItem,
      }) as never,
    );

    const view = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Turn").length).toBeGreaterThan(0);
    expect(screen.getByText("CODEX")).toBeTruthy();
    expect(screen.getAllByText("User input").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI response").length).toBeGreaterThan(0);
    expect(screen.getAllByText("完整用户输入").length).toBeGreaterThan(0);
    expect(screen.getAllByText("完整 AI 回复").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(view.container.querySelector(".project-memory-detail-text")).toBeNull();
    expect(view.container.querySelector(".project-memory-detail-preview")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy full turn" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("完整用户输入"),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("完整 AI 回复"),
    );
  });

  it("keeps long assistant response out of the compact list body", () => {
    const longAssistantResponse = "AI_RESPONSE_SHOULD_ONLY_APPEAR_IN_DETAIL";
    const turnItem = {
      ...baseItem,
      id: "turn-memory-compact",
      recordKind: "conversation_turn",
      kind: "conversation",
      source: "conversation_turn",
      engine: "codex",
      threadId: "codex-thread-compact",
      turnId: "turn-compact",
      title: "Compact memory title",
      summary: "Compact summary visible in list",
      userInput: "User prompt visible in detail",
      assistantResponse: longAssistantResponse,
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [turnItem],
        selectedId: turnItem.id,
        selectedItem: turnItem,
      }) as never,
    );

    const view = render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    const compactList = view.container.querySelector(".project-memory-list");
    expect(compactList?.textContent).toContain("Compact memory title");
    expect(compactList?.textContent).toContain("Compact summary visible in list");
    expect(compactList?.textContent).not.toContain(longAssistantResponse);
    expect(screen.getByText(longAssistantResponse)).toBeTruthy();
  });

  it("collapses quick tags when there are too many tags", () => {
    const itemWithManyTags = {
      ...baseItem,
      tags: Array.from({ length: 10 }, (_, index) => `tag-${index + 1}`),
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [itemWithManyTags],
        selectedItem: itemWithManyTags,
      }) as never,
    );

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    const moreButton = screen.getByRole("button", { name: "+2 more" });
    expect(moreButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(moreButton);

    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("shows source locator availability and copies thread locator", async () => {
    const turnItem = {
      ...baseItem,
      id: "turn-memory-source",
      recordKind: "conversation_turn",
      kind: "conversation",
      source: "conversation_turn",
      engine: "codex",
      threadId: "codex-thread-source",
      turnId: "turn-source",
      userInput: "User prompt",
      assistantResponse: "AI reply",
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [turnItem],
        selectedId: turnItem.id,
        selectedItem: turnItem,
      }) as never,
    );

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("thread and turn available")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("threadId: codex-thread-source"),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("turnId: turn-source"),
    );
  });

  it("shows source locator unavailable state without thread and turn ids", () => {
    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("source unavailable")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Copy source" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters Review Inbox and health issues in the workbench list", () => {
    const reviewedItem = {
      ...baseItem,
      id: "reviewed-memory",
      title: "Reviewed memory",
      reviewState: "kept",
    };
    const issueItem = {
      ...baseItem,
      id: "issue-memory",
      title: "Input only turn",
      recordKind: "conversation_turn",
      source: "conversation_turn",
      kind: "conversation",
      userInput: "用户输入",
      assistantResponse: null,
    };
    mockUseProjectMemory.mockReturnValue(
      buildHookState({
        items: [reviewedItem, issueItem],
        selectedId: issueItem.id,
        selectedItem: issueItem,
        total: 2,
      }) as never,
    );

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Reviewed memory")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("All review states"), {
      target: { value: "unreviewed" },
    });
    const memoryList = screen.getByLabelText("Memory list");
    expect(within(memoryList).queryByText("Reviewed memory")).toBeNull();
    expect(within(memoryList).getByText("Input only turn")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("All health states"), {
      target: { value: "complete" },
    });
    expect(screen.getByText("No memories match the current filters.")).toBeTruthy();
  });

  it("updates review state and converts conversation turns to manual notes", async () => {
    const turnItem = {
      ...baseItem,
      id: "review-turn",
      recordKind: "conversation_turn",
      kind: "conversation",
      source: "conversation_turn",
      threadId: "thread-1",
      turnId: "turn-1",
      userInput: "用户输入",
      assistantResponse: "AI 回复",
    };
    const hookState = buildHookState({
      items: [turnItem],
      selectedId: turnItem.id,
      selectedItem: turnItem,
    });
    mockUseProjectMemory.mockReturnValue(hookState as never);

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => {
      expect(hookState.updateMemory).toHaveBeenCalledWith("review-turn", {
        reviewState: "kept",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Convert to manual note" }));
    await waitFor(() => {
      expect(mockFacade.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          recordKind: "manual_note",
          source: "manual",
        }),
      );
    });
    expect(hookState.updateMemory).toHaveBeenCalledWith("review-turn", {
      reviewState: "converted",
    });
  });

  it("runs diagnostics, dry-run, and confirmed reconcile apply", async () => {
    const hookState = buildHookState();
    mockUseProjectMemory.mockReturnValue(hookState as never);
    mockFacade.reconcile
      .mockResolvedValueOnce({
        workspaceId: "ws-1",
        dryRun: true,
        fixableCount: 2,
        fixedCount: 0,
        skippedCount: 0,
        duplicateGroups: 1,
        changedMemoryIds: [],
      } as never)
      .mockResolvedValueOnce({
        workspaceId: "ws-1",
        dryRun: false,
        fixableCount: 2,
        fixedCount: 2,
        skippedCount: 0,
        duplicateGroups: 1,
        changedMemoryIds: ["memory-1"],
      } as never);

    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));
    await waitFor(() => {
      expect(mockFacade.diagnostics).toHaveBeenCalledWith("ws-1");
    });
    expect(
      screen.getByText("Diagnostics: 2 total, 1 incomplete, 0 duplicate turn groups, 0 bad files."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dry run" }));
    await waitFor(() => {
      expect(mockFacade.reconcile).toHaveBeenCalledWith("ws-1", true);
    });
    expect(screen.getByText("Reconcile: 2 fixable, 0 fixed, 0 skipped.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply repair" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Apply repair" }).at(-1)!);
    await waitFor(() => {
      expect(mockFacade.reconcile).toHaveBeenCalledWith("ws-1", false);
    });
    expect(hookState.refresh).toHaveBeenCalled();
  });

  it("keeps context injection switch disabled and unchecked", () => {
    window.localStorage.removeItem("projectMemory.manualSelectionInjectionMode");
    render(
      <ProjectMemoryPanel
        workspaceId="ws-1"
        filePanelMode="memory"
        onFilePanelModeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const contextToggle = screen.getByLabelText(
      "Enable memory context injection for chat",
    ) as HTMLInputElement;
    expect(contextToggle.checked).toBe(false);
    expect(contextToggle.disabled).toBe(true);
    expect(
      screen.getByText("Switched to manual memory linking with @@ in chat (one-shot injection)."),
    ).toBeTruthy();
    expect(
      screen.getByText("Default is detail mode: inject memory detail, while canvas still shows summary only."),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Detail mode (detail)")).toBeTruthy();
  });
});
