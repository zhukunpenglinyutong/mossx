import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ImagePlus, Sparkles, Loader2 } from "lucide-react";
import type { EngineStatus, EngineType } from "../../../types";
import type { KanbanTask, KanbanTaskStatus } from "../types";
import { pickImageFiles, generateThreadTitle } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import { RichTextInput } from "../../../components/common/RichTextInput";
import { useInlineHistoryCompletion } from "../../composer/hooks/useInlineHistoryCompletion";
import { recordHistory as recordInputHistory } from "../../composer/hooks/useInputHistoryStore";
import { loadTaskDraft, saveTaskDraft, clearTaskDraft } from "../utils/kanbanStorage";

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
  editingTask?: KanbanTask;
  onUpdate?: (taskId: string, changes: Partial<KanbanTask>) => void;
};

export function TaskCreateModal({
  isOpen,
  workspaceId,
  workspaceBackendId,
  panelId,
  defaultStatus,
  engineStatuses,
  onSubmit,
  onCancel,
  editingTask,
  onUpdate,
}: TaskCreateModalProps) {
  const { t, i18n } = useTranslation();
  const titleRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inlineCompletion = useInlineHistoryCompletion();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [engineType, setEngineType] = useState<EngineType>("claude");
  const [modelId, setModelId] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [autoStart, setAutoStart] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  // branchName is always "main" - no UI control needed
  const branchName = "main";

  const availableEngines = engineStatuses.filter((e) => e.installed);
  const selectedEngine = engineStatuses.find(
    (e) => e.engineType === engineType
  );
  const availableModels = selectedEngine?.models ?? [];

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

  useEffect(() => {
    if (isOpen) {
      if (editingTask) {
        setTitle(editingTask.title);
        setDescription(editingTask.description);
        setEngineType(editingTask.engineType);
        setModelId(editingTask.modelId);
        setImages(editingTask.images);
        setAutoStart(editingTask.autoStart);
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
      }
      inlineCompletion.clear();
      if (availableEngines.length > 0 && !availableEngines.find((e) => e.engineType === engineType)) {
        setEngineType(availableEngines[0].engineType);
      }
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const engine = engineStatuses.find((e) => e.engineType === engineType);
    if (engine?.models.length) {
      const defaultModel = engine.models.find((m) => m.isDefault);
      setModelId(defaultModel?.id ?? engine.models[0].id);
    } else {
      setModelId(null);
    }
  }, [engineType, engineStatuses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDesc = description.trim();
    if (trimmedDesc) {
      recordInputHistory(trimmedDesc);
    }
    inlineCompletion.clear();

    if (editingTask && onUpdate) {
      onUpdate(editingTask.id, {
        title: trimmedTitle,
        description: trimmedDesc,
        engineType,
        modelId,
        images,
        autoStart,
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
      inlineCompletion.updateQuery(next);
    },
    [inlineCompletion],
  );

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        inlineCompletion.hasSuggestion
      ) {
        e.preventDefault();
        const fullText = inlineCompletion.applySuggestion();
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
    [inlineCompletion],
  );

  const handleCancel = () => {
    if (!editingTask) {
      if (title.trim() || description.trim()) {
        saveTaskDraft(panelId, { title, description, engineType, modelId, images });
      } else {
        clearTaskDraft(panelId);
      }
    }
    inlineCompletion.clear();
    onCancel();
  };

  if (!isOpen) return null;

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
              ghostTextSuffix={inlineCompletion.suffix}
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
          </div>

          <div className="kanban-modal-footer">
            {!editingTask && (
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
            )}
            {editingTask && <div />}
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
