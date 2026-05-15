import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import X from "lucide-react/dist/esm/icons/x";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import Calendar from "lucide-react/dist/esm/icons/calendar";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Repeat from "lucide-react/dist/esm/icons/repeat";
import Settings2 from "lucide-react/dist/esm/icons/settings-2";
import Hash from "lucide-react/dist/esm/icons/hash";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import type { EngineStatus, EngineType } from "../../../types";
import type {
  KanbanNewThreadResultMode,
  KanbanRecurringUnit,
  KanbanRecurringExecutionMode,
  KanbanScheduleMode,
  KanbanTask,
  KanbanTaskChain,
  KanbanTaskSchedule,
  KanbanTaskStatus,
} from "../types";
import { pickImageFiles, generateThreadTitle } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { RichTextInput } from "../../../components/common/RichTextInput";
import { useInlineHistoryCompletion } from "../../composer/hooks/useInlineHistoryCompletion";
import { recordHistory as recordInputHistory } from "../../composer/hooks/useInputHistoryStore";
import { loadTaskDraft, saveTaskDraft, clearTaskDraft } from "../utils/kanbanStorage";
import { buildTaskChain, validateChainSelection } from "../utils/chaining";
import { buildTaskScheduleFromForm } from "../utils/scheduling";

type CreateTaskInput = {
  workspaceId: string;
  panelId: string;
  title: string;
  description: string;
  engineType: EngineType;
  modelId: string | null;
  branchName: string;
  images: string[];
  autoStart: boolean;
  schedule?: KanbanTaskSchedule;
  chain?: KanbanTaskChain;
};

type TaskCreateModalProps = {
  isOpen: boolean;
  workspaceId: string;
  workspaceBackendId: string;
  panelId: string;
  defaultStatus: KanbanTaskStatus;
  engineStatuses: EngineStatus[];
  onSubmit: (input: CreateTaskInput) => void;
  onCancel: () => void;
  availableTasks: KanbanTask[];
  editingTask?: KanbanTask;
  onUpdate?: (taskId: string, changes: Partial<KanbanTask>) => void;
};

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function toDateTimeLocalInput(timestamp: number | null | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-") + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function TaskCreateModal({
  isOpen,
  workspaceId,
  workspaceBackendId,
  panelId,
  defaultStatus,
  engineStatuses,
  onSubmit,
  onCancel,
  availableTasks,
  editingTask,
  onUpdate,
}: TaskCreateModalProps) {
  const { t, i18n } = useTranslation();
  const titleRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    applySuggestion: applyInlineCompletion,
    clear: clearInlineCompletion,
    hasSuggestion: hasInlineSuggestion,
    suffix: inlineCompletionSuffix,
    updateQuery: updateInlineCompletionQuery,
  } = useInlineHistoryCompletion();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [engineType, setEngineType] = useState<EngineType>("claude");
  const [modelId, setModelId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"manual" | "once" | "recurring">("manual");
  const [runAtText, setRunAtText] = useState("");
  const [recurringInterval, setRecurringInterval] = useState(1);
  const [recurringUnit, setRecurringUnit] = useState<KanbanRecurringUnit>("days");
  const [recurringExecutionMode, setRecurringExecutionMode] =
    useState<KanbanRecurringExecutionMode>("same_thread");
  const [newThreadResultMode, setNewThreadResultMode] =
    useState<KanbanNewThreadResultMode>("pass");
  const [maxRounds, setMaxRounds] = useState(10);
  const [previousTaskId, setPreviousTaskId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const scheduleModeOptions: Array<{
    value: KanbanScheduleMode;
    icon: typeof Calendar;
    label: string;
  }> = [
    { value: "manual", icon: Calendar, label: t("kanban.task.schedule.manual") },
    { value: "once", icon: Clock3, label: t("kanban.task.schedule.once") },
    { value: "recurring", icon: Repeat, label: t("kanban.task.schedule.recurring") },
  ];
  const scheduleModeIndex = Math.max(
    0,
    scheduleModeOptions.findIndex((option) => option.value === scheduleMode),
  );

  // branchName is always "main" - no UI control needed
  const branchName = "main";

  const availableEngines = engineStatuses.filter((e) => e.installed);
  const selectedEngine = engineStatuses.find(
    (e) => e.engineType === engineType
  );
  const availableModels = selectedEngine?.models ?? [];
  const chainCandidates = availableTasks.filter(
    (task) => task.id !== editingTask?.id && task.status === "todo",
  );

  const resolveValidationMessage = useCallback(
    (reason: string): string => {
      const keyMap: Record<string, string> = {
        invalid_once_time: "kanban.task.validation.invalidOnceTime",
        invalid_recurring_interval: "kanban.task.validation.invalidRecurringInterval",
        invalid_recurring_rule: "kanban.task.validation.invalidRecurringRule",
        chain_requires_todo_task: "kanban.task.validation.chainRequiresTodoTask",
        downstream_cannot_be_scheduled: "kanban.task.validation.downstreamCannotBeScheduled",
        chain_self_cycle: "kanban.task.validation.chainSelfCycle",
        chain_previous_not_found: "kanban.task.validation.chainPreviousNotFound",
        chain_requires_todo_upstream: "kanban.task.validation.chainRequiresTodoUpstream",
        chain_multi_downstream: "kanban.task.validation.chainMultiDownstream",
        chain_cycle_detected: "kanban.task.validation.chainCycleDetected",
      };
      return t(keyMap[reason] ?? "kanban.task.validation.generic");
    },
    [t],
  );

  const handlePickImages = async () => {
    try {
      const paths = await pickImageFiles();
      if (paths.length > 0) {
        setImages((prev) => [...prev, ...paths]);
      }
    } catch {
      // user cancelled
    }
  };

  const formatEngineName = (type: EngineType): string => {
    switch (type) {
      case "claude":
        return "Claude Code";
      case "codex":
        return "Codex";
      default:
        return type;
    }
  };

  const resolveTaskScheduleModeLabel = useCallback(
    (mode: KanbanScheduleMode): string => {
      if (mode === "once") {
        return t("kanban.task.schedule.once");
      }
      if (mode === "recurring") {
        return t("kanban.task.schedule.recurring");
      }
      return t("kanban.task.schedule.manual");
    },
    [t],
  );

  const formatUpstreamTaskLabel = useCallback(
    (task: KanbanTask): string => {
      const mode = task.schedule?.mode ?? "manual";
      return `[${resolveTaskScheduleModeLabel(mode)}] ${task.title}`;
    },
    [resolveTaskScheduleModeLabel],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setEngineType(editingTask.engineType);
      setModelId(editingTask.modelId);
      setImages(editingTask.images);
      setAutoStart(editingTask.autoStart);
      setScheduleMode(editingTask.schedule?.mode ?? "manual");
      setRunAtText(toDateTimeLocalInput(editingTask.schedule?.runAt ?? null));
      setRecurringInterval(editingTask.schedule?.interval ?? 1);
      setRecurringUnit(editingTask.schedule?.unit ?? "days");
      setRecurringExecutionMode(editingTask.schedule?.recurringExecutionMode ?? "same_thread");
      setNewThreadResultMode(editingTask.schedule?.newThreadResultMode ?? "pass");
      setMaxRounds(Math.min(50, Math.max(1, editingTask.schedule?.maxRounds ?? 10)));
      setPreviousTaskId(editingTask.chain?.previousTaskId ?? "");
    } else {
      const draft = loadTaskDraft(panelId);
      if (draft && (draft.title || draft.description)) {
        setTitle(draft.title);
        setDescription(draft.description);
        setEngineType(draft.engineType as EngineType);
        setModelId(draft.modelId);
        setImages(draft.images);
      } else {
        setTitle("");
        setDescription("");
        setImages([]);
      }
      setAutoStart(defaultStatus !== "todo");
      setScheduleMode("manual");
      setRunAtText("");
      setRecurringInterval(1);
      setRecurringUnit("days");
      setRecurringExecutionMode("same_thread");
      setNewThreadResultMode("pass");
      setMaxRounds(10);
      setPreviousTaskId("");
    }
    setFormError(null);
    clearInlineCompletion();
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [clearInlineCompletion, defaultStatus, editingTask, isOpen, panelId]);

  useEffect(() => {
    if (!isOpen || availableEngines.length === 0) {
      return;
    }
    if (!availableEngines.find((engine) => engine.engineType === engineType)) {
      setEngineType(availableEngines[0]?.engineType ?? "codex");
    }
  }, [availableEngines, engineType, isOpen]);

  useEffect(() => {
    const engine = engineStatuses.find((e) => e.engineType === engineType);
    if (engine?.models.length) {
      const defaultModel = engine.models.find((m) => m.isDefault);
      setModelId(defaultModel?.id ?? engine.models[0]?.id ?? null);
    } else {
      setModelId(null);
    }
  }, [engineType, engineStatuses]);

  useEffect(() => {
    if (scheduleMode !== "manual" && previousTaskId) {
      setPreviousTaskId("");
    }
  }, [scheduleMode, previousTaskId]);

  useEffect(() => {
    if (scheduleMode !== "manual" && autoStart) {
      setAutoStart(false);
    }
  }, [scheduleMode, autoStart]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDesc = description.trim();
    if (trimmedDesc) {
      recordInputHistory(trimmedDesc);
    }
    clearInlineCompletion();

    const nextStatus = editingTask?.status ?? (autoStart ? "inprogress" : "todo");
    if (nextStatus !== "todo" && scheduleMode !== "manual") {
      setFormError(t("kanban.task.validation.scheduleTodoOnly"));
      return;
    }

    const builtSchedule = buildTaskScheduleFromForm({
      mode: scheduleMode,
      runAtText,
      interval: recurringInterval,
      unit: recurringUnit,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurringExecutionMode,
      newThreadResultMode,
      maxRounds,
    });
    if (!builtSchedule.ok) {
      setFormError(resolveValidationMessage(builtSchedule.reason));
      return;
    }

    const chainValidation = validateChainSelection({
      tasks: availableTasks,
      taskId: editingTask?.id,
      status: nextStatus,
      previousTaskId: previousTaskId || null,
      scheduleMode,
    });
    if (!chainValidation.ok) {
      setFormError(resolveValidationMessage(chainValidation.reason));
      return;
    }

    const chain = buildTaskChain(availableTasks, previousTaskId || null);
    const normalizedSchedule =
      builtSchedule.schedule?.mode === "recurring" &&
      builtSchedule.schedule.recurringExecutionMode === "new_thread"
        ? {
            ...builtSchedule.schedule,
            seriesId: editingTask?.schedule?.seriesId ?? editingTask?.id ?? null,
          }
        : builtSchedule.schedule;

    if (editingTask && onUpdate) {
      onUpdate(editingTask.id, {
        title: trimmedTitle,
        description: trimmedDesc,
        engineType,
        modelId,
        images,
        autoStart,
        schedule: normalizedSchedule,
        chain,
        execution: {
          ...(editingTask.execution ?? {}),
          blockedReason: null,
        },
      });
    } else {
      clearTaskDraft(panelId);
      onSubmit({
        workspaceId,
        panelId,
        title: trimmedTitle,
        description: trimmedDesc,
        engineType,
        modelId,
        branchName: branchName.trim() || "main",
        images,
        autoStart,
        schedule: normalizedSchedule,
        chain,
      });
    }
  };

  const handleGenerateTitle = async () => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc || isGeneratingTitle) return;
    setIsGeneratingTitle(true);
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const language = i18n.language.toLowerCase().startsWith("zh") ? "zh" : "en";
      const generated = await Promise.race([
        generateThreadTitle(workspaceBackendId, "temp-title-gen", trimmedDesc, language),
        new Promise<never>((_, reject) =>
          timeoutHandle = setTimeout(() => reject(new Error("timeout")), 15_000),
        ),
      ]);
      const result = generated.trim();
      if (result) {
        setTitle(result);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      pushErrorToast({
        title: t("kanban.task.generateTitleFailed"),
        message: msg === "timeout" ? t("kanban.task.generateTitleTimeout") : msg,
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      setIsGeneratingTitle(false);
    }
  };

  const handleAttachImages = (paths: string[]) => {
    setImages((prev) => [...prev, ...paths]);
  };

  const handleRemoveImage = (path: string) => {
    setImages((prev) => prev.filter((p) => p !== path));
  };

  const handleDescriptionChange = useCallback(
    (next: string) => {
      setDescription(next);
      updateInlineCompletionQuery(next);
    },
    [updateInlineCompletionQuery],
  );

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        hasInlineSuggestion
      ) {
        e.preventDefault();
        const fullText = applyInlineCompletion();
        if (fullText) {
          setDescription(fullText);
          requestAnimationFrame(() => {
            const textarea = descTextareaRef.current;
            if (textarea) {
              textarea.setSelectionRange(fullText.length, fullText.length);
            }
          });
        }
      }
    },
    [applyInlineCompletion, hasInlineSuggestion],
  );

  const handleCancel = () => {
    if (!editingTask) {
      if (title.trim() || description.trim()) {
        saveTaskDraft(panelId, { title, description, engineType, modelId, images });
      } else {
        clearTaskDraft(panelId);
      }
    }
    clearInlineCompletion();
    onCancel();
  };

  if (!isOpen) return null;
  const showAutoStartToggle = !editingTask && scheduleMode === "manual";

  return (
    <div className="kanban-modal-overlay">
      <div className="kanban-modal kanban-task-modal">
        <div className="kanban-modal-header">
          <h2>{editingTask ? t("kanban.task.editTitle") : t("kanban.task.createTitle")}</h2>
          <button className="kanban-icon-btn" onClick={handleCancel}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="kanban-modal-body">
            <div className="kanban-task-title-row">
              <input
                ref={titleRef}
                className="kanban-input kanban-task-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("kanban.task.titlePlaceholder")}
              />
              <button
                type="button"
                className="kanban-icon-btn kanban-task-generate-btn"
                onClick={handleGenerateTitle}
                disabled={!description.trim() || isGeneratingTitle}
                title={t("kanban.task.generateTitle")}
              >
                {isGeneratingTitle ? <Loader2 size={16} className="kanban-spin" /> : <Sparkles size={16} />}
              </button>
            </div>

            <RichTextInput
              value={description}
              onChange={handleDescriptionChange}
              placeholder={t("kanban.task.descPlaceholder")}
              attachments={images}
              onAddAttachment={handlePickImages}
              onAttachImages={handleAttachImages}
              onRemoveAttachment={handleRemoveImage}
              enableResize={true}
              initialHeight={120}
              minHeight={80}
              maxHeight={300}
              className="kanban-rich-input"
              textareaRef={descTextareaRef}
              onKeyDown={handleDescKeyDown}
              ghostTextSuffix={inlineCompletionSuffix}
              footerLeft={
                <>
                  <button
                    type="button"
                    className="kanban-icon-btn kanban-rich-input-attach"
                    onClick={handlePickImages}
                    title={t("kanban.task.addImage")}
                  >
                    <ImagePlus size={16} />
                  </button>
                  <div className="kanban-task-selector">
                    <select
                      className="kanban-select"
                      value={engineType}
                      onChange={(e) =>
                        setEngineType(e.target.value as EngineType)
                      }
                    >
                      {engineStatuses.map((engine) => (
                        <option
                          key={engine.engineType}
                          value={engine.engineType}
                          disabled={!engine.installed}
                        >
                          {formatEngineName(engine.engineType)}
                          {!engine.installed ? ` (${t("kanban.task.notInstalled")})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="kanban-task-selector">
                    <select
                      className="kanban-select"
                      value={modelId ?? ""}
                      onChange={(e) => setModelId(e.target.value || null)}
                    >
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))}
                      {availableModels.length === 0 && (
                        <option value="">{t("kanban.task.noModels")}</option>
                      )}
                    </select>
                  </div>
                </>
              }
            />

            <div className="kanban-task-config-block is-compact">
              <div className="kanban-task-config-row">
                <span className="kanban-task-config-label">
                  <Calendar size={13} className="kanban-task-config-label-icon" />
                  {t("kanban.task.schedule.modeLabel")}
                </span>
                <div
                  className="kanban-task-mode-segmented"
                  role="radiogroup"
                  aria-label={t("kanban.task.schedule.modeLabel")}
                >
                  <span
                    className="kanban-task-mode-segmented-thumb"
                    aria-hidden
                    style={{
                      transform: `translateX(${scheduleModeIndex * 100}%)`,
                    }}
                  />
                  {scheduleModeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = scheduleMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`kanban-task-mode-segmented-btn${isActive ? " is-active" : ""}`}
                        onClick={() => setScheduleMode(option.value)}
                      >
                        <Icon size={13} className="kanban-task-mode-segmented-icon" />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {scheduleMode === "once" && (
                <div className="kanban-task-config-row">
                  <span className="kanban-task-config-label">
                    <Clock3 size={13} className="kanban-task-config-label-icon" />
                    {t("kanban.task.schedule.runAt")}
                  </span>
                  <input
                    className="kanban-input kanban-task-date-input"
                    type="datetime-local"
                    value={runAtText}
                    onChange={(e) => setRunAtText(e.target.value)}
                  />
                </div>
              )}

              {scheduleMode === "recurring" && (
                <>
                  <div className="kanban-task-config-row">
                    <span className="kanban-task-config-label">
                      <Repeat size={13} className="kanban-task-config-label-icon" />
                      {t("kanban.task.schedule.every")}
                    </span>
                    <div className="kanban-task-config-inline">
                      <input
                        className="kanban-input kanban-task-recurring-interval-input"
                        type="number"
                        min={1}
                        value={recurringInterval}
                        onChange={(e) => setRecurringInterval(Math.max(1, Number(e.target.value) || 1))}
                      />
                      <select
                        className="kanban-select"
                        value={recurringUnit}
                        onChange={(e) => setRecurringUnit(e.target.value as KanbanRecurringUnit)}
                      >
                        <option value="minutes">{t("kanban.task.schedule.minutes")}</option>
                        <option value="hours">{t("kanban.task.schedule.hours")}</option>
                        <option value="days">{t("kanban.task.schedule.days")}</option>
                        <option value="weeks">{t("kanban.task.schedule.weeks")}</option>
                      </select>
                    </div>
                  </div>

                  <div className="kanban-task-config-row">
                    <span className="kanban-task-config-label">
                      <Settings2 size={13} className="kanban-task-config-label-icon" />
                      {t("kanban.task.schedule.executionModeLabel")}
                    </span>
                    <select
                      className="kanban-select"
                      value={recurringExecutionMode}
                      onChange={(e) =>
                        setRecurringExecutionMode(e.target.value as KanbanRecurringExecutionMode)
                      }
                    >
                      <option value="same_thread">
                        {t("kanban.task.schedule.sameThread")}
                      </option>
                      <option value="new_thread">
                        {t("kanban.task.schedule.newThread")}
                      </option>
                    </select>
                  </div>

                  {recurringExecutionMode === "same_thread" && (
                    <div className="kanban-task-config-row">
                      <span className="kanban-task-config-label">
                        <Hash size={13} className="kanban-task-config-label-icon" />
                        {t("kanban.task.schedule.maxRounds")}
                      </span>
                      <input
                        className="kanban-input kanban-task-rounds-input"
                        type="number"
                        min={1}
                        max={50}
                        value={maxRounds}
                        onChange={(e) =>
                          setMaxRounds(
                            Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                          )
                        }
                      />
                    </div>
                  )}

                  {recurringExecutionMode === "new_thread" && (
                    <div className="kanban-task-config-row">
                      <span className="kanban-task-config-label">
                        <GitBranch size={13} className="kanban-task-config-label-icon" />
                        {t("kanban.task.schedule.resultPassing")}
                      </span>
                      <select
                        className="kanban-select"
                        value={newThreadResultMode}
                        onChange={(e) =>
                          setNewThreadResultMode(e.target.value as KanbanNewThreadResultMode)
                        }
                      >
                        <option value="pass">
                          {t("kanban.task.schedule.passResult")}
                        </option>
                        <option value="none">
                          {t("kanban.task.schedule.blockResult")}
                        </option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {scheduleMode === "manual" && (
                <div className="kanban-task-config-row">
                  <span className="kanban-task-config-label">
                    <Link2 size={13} className="kanban-task-config-label-icon" />
                    {t("kanban.task.chain.upstreamLabel")}
                  </span>
                  <select
                    className="kanban-select"
                    value={previousTaskId}
                    onChange={(e) => setPreviousTaskId(e.target.value)}
                  >
                    <option value="">{t("kanban.task.chain.none")}</option>
                    {chainCandidates.map((task) => (
                      <option key={task.id} value={task.id}>
                        {formatUpstreamTaskLabel(task)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {formError && (
              <div className="kanban-task-form-error" role="alert">
                {formError}
              </div>
            )}
          </div>

          <div className="kanban-modal-footer">
            {showAutoStartToggle ? (
              <label className="kanban-toggle-label">
                <input
                  type="checkbox"
                  className="kanban-toggle-input"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                />
                <span className="kanban-toggle-switch" />
                <span>{t("kanban.task.start")}</span>
              </label>
            ) : <div />}
            <button
              type="submit"
              className="kanban-btn kanban-btn-primary"
              disabled={!title.trim()}
            >
              {editingTask ? t("kanban.task.update") : t("kanban.task.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
