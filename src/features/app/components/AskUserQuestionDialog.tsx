import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";

const OTHER_OPTION_MARKER = "__OTHER__";
const MAX_CUSTOM_INPUT_LENGTH = 2000;
const TIMEOUT_SECONDS = 300; // 5 minutes
const WARNING_THRESHOLD_SECONDS = 30;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type AskUserQuestionDialogProps = {
  requests: RequestUserInputRequest[];
  activeThreadId: string | null;
  activeWorkspaceId?: string | null;
  onSubmit: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => Promise<void> | void;
};

type SelectionState = Record<string, Set<string>>;
type CustomInputState = Record<string, string>;
type SecretVisState = Record<string, boolean>;

export function AskUserQuestionDialog({
  requests,
  activeThreadId,
  activeWorkspaceId,
  onSubmit,
}: AskUserQuestionDialogProps) {
  const { t } = useTranslation();

  const activeRequests = useMemo(
    () =>
      requests.filter((req) => {
        if (!activeThreadId) return false;
        if (req.params.thread_id !== activeThreadId) return false;
        if (activeWorkspaceId && req.workspace_id !== activeWorkspaceId) return false;
        return true;
      }),
    [requests, activeThreadId, activeWorkspaceId],
  );

  const activeRequest = activeRequests[0] ?? null;
  const requestId = activeRequest
    ? `${activeRequest.workspace_id}:${String(activeRequest.request_id)}`
    : null;

  const [selections, setSelections] = useState<SelectionState>({});
  const [customInputs, setCustomInputs] = useState<CustomInputState>({});
  const [secretVisible, setSecretVisible] = useState<SecretVisState>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMEOUT_SECONDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const customInputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRequestIdRef = useRef<string | null>(null);

  const isTimeWarning = remainingSeconds <= WARNING_THRESHOLD_SECONDS && remainingSeconds > 0;
  const isTimedOut = remainingSeconds <= 0;

  // Reset when a new request arrives
  useEffect(() => {
    if (requestId && requestId !== prevRequestIdRef.current) {
      prevRequestIdRef.current = requestId;
      setQuestionIndex(0);
      setIsCollapsed(false);
      setRemainingSeconds(TIMEOUT_SECONDS);
      setIsSubmitting(false);
      setSubmitError(null);

      if (activeRequest) {
        const nextSelections: SelectionState = {};
        const nextCustom: CustomInputState = {};
        const nextSecret: SecretVisState = {};
        activeRequest.params.questions.forEach((q, i) => {
          const key = q.id || `q-${i}`;
          nextSelections[key] = new Set();
          nextCustom[key] = "";
          nextSecret[key] = false;
        });
        setSelections(nextSelections);
        setCustomInputs(nextCustom);
        setSecretVisible(nextSecret);
      }
    }
  }, [requestId, activeRequest]);

  // Countdown timer
  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    if (!activeRequest) {
      clearTimer();
      return;
    }
    clearTimer();
    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [requestId, activeRequest]);

  const handleCancel = useCallback(() => {
    if (!activeRequest) return;
    // Submit empty answers to unblock the agent
    void onSubmit(activeRequest, { answers: {} });
  }, [activeRequest, onSubmit]);

  // Auto-cancel on timeout
  useEffect(() => {
    if (isTimedOut && activeRequest) {
      handleCancel();
    }
  }, [isTimedOut, activeRequest, handleCancel]);

  // ESC key
  useEffect(() => {
    if (!activeRequest) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeRequest, handleCancel]);

  if (!activeRequest) return null;

  const { questions } = activeRequest.params;
  if (!questions.length) return null;

  const safeIndex = Math.max(0, Math.min(questionIndex, questions.length - 1));
  const currentQ = questions[safeIndex];
  if (!currentQ) return null;

  const qKey = currentQ.id || `q-${safeIndex}`;
  const options = currentQ.options ?? [];
  const hasOptions = options.length > 0;
  const isMultiSelect = false; // Current type system doesn't have multiSelect per question
  const isLastQuestion = safeIndex === questions.length - 1;
  const currentSelections = selections[qKey] ?? new Set();
  const currentCustom = customInputs[qKey] ?? "";
  const isOtherSelected = currentSelections.has(OTHER_OPTION_MARKER);
  const currentSecretVis = secretVisible[qKey] ?? false;

  const hasRegularSelection = Array.from(currentSelections).some((l) => l !== OTHER_OPTION_MARKER);
  const hasValidCustom = isOtherSelected && currentCustom.trim().length > 0;
  const hasPlainText = !hasOptions && currentCustom.trim().length > 0;
  const canProceed = hasRegularSelection || hasValidCustom || hasPlainText || currentQ.isSecret;

  const handleOptionToggle = (label: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[qKey] ?? []);
      if (isMultiSelect) {
        if (set.has(label)) set.delete(label);
        else set.add(label);
      } else {
        set.clear();
        set.add(label);
      }
      next[qKey] = set;
      return next;
    });
    if (label === OTHER_OPTION_MARKER) {
      setTimeout(() => customInputRef.current?.focus(), 0);
    }
  };

  const handleCustomChange = (value: string) => {
    setCustomInputs((prev) => ({
      ...prev,
      [qKey]: value.slice(0, MAX_CUSTOM_INPUT_LENGTH),
    }));
  };

  const handleToggleSecret = () => {
    setSecretVisible((prev) => ({
      ...prev,
      [qKey]: !prev[qKey],
    }));
  };

  const buildAnswers = (): RequestUserInputResponse["answers"] => {
    const answers: RequestUserInputResponse["answers"] = {};
    questions.forEach((q, i) => {
      if (!q.id) return;
      const key = q.id || `q-${i}`;
      const answerList: string[] = [];
      const selected = selections[key] ?? new Set();
      const qOptions = q.options ?? [];
      const qHasOptions = qOptions.length > 0;

      // Regular selected options
      const selectedLabels = Array.from(selected).filter((l) => l !== OTHER_OPTION_MARKER);
      answerList.push(...selectedLabels);

      // "Other" custom text
      if (selected.has(OTHER_OPTION_MARKER)) {
        const custom = (customInputs[key] ?? "").trim();
        if (custom) answerList.push(custom);
      }

      // Plain text (no options)
      const note = (customInputs[key] ?? "").trim();
      if (!qHasOptions && note) {
        answerList.push(note);
      } else if (qHasOptions && note && !selected.has(OTHER_OPTION_MARKER)) {
        answerList.push(`user_note: ${note}`);
      }

      answers[q.id] = { answers: answerList };
    });
    return answers;
  };

  const handleNext = () => {
    if (isLastQuestion) {
      void handleSubmitFinal();
    } else {
      setQuestionIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (safeIndex > 0) setQuestionIndex((prev) => Math.max(0, prev - 1));
  };

  const handleSubmitFinal = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(activeRequest, { answers: buildAnswers() });
    } catch {
      setSubmitError(t("approval.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalRequests = activeRequests.length;

  return (
    <div className={`ask-user-question-overlay${isCollapsed ? " is-collapsed" : ""}`}>
      {!isCollapsed && (
        <div className="ask-user-question-backdrop" onClick={handleCancel} />
      )}
      <div
        className={[
          "ask-user-question-card",
          isCollapsed && "is-collapsed",
          isTimeWarning && "is-time-warning",
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-label={t("approval.userInputRequested")}
      >
        {/* Header */}
        <div className="ask-user-question-header">
          <div className="ask-user-question-title">
            {t("askUserQuestion.title")}
            {totalRequests > 1 ? (
              <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 11, color: "var(--text-faint)" }}>
                {t("approval.requestOf", { current: 1, total: totalRequests })}
              </span>
            ) : null}
          </div>
          <button
            className="ask-user-question-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? t("askUserQuestion.expand") : t("askUserQuestion.collapse")}
          >
            {isCollapsed ? "\u25B2" : "\u25BC"}
          </button>
        </div>

        {/* Timeout warning */}
        {isTimeWarning && !isCollapsed && (
          <div className="ask-user-question-timeout-banner">
            {t("askUserQuestion.timeoutWarning", { seconds: remainingSeconds })}
          </div>
        )}

        {/* Collapsed hint */}
        {isCollapsed ? (
          <div className="ask-user-question-collapsed-hint">
            <span className="ask-user-question-collapsed-progress">
              {t("askUserQuestion.progress", {
                current: safeIndex + 1,
                total: questions.length,
              })}
            </span>
            {isTimeWarning && (
              <span className="ask-user-question-collapsed-timer is-warning">
                {formatCountdown(remainingSeconds)}
              </span>
            )}
            <button
              className="ask-user-question-btn is-primary"
              onClick={() => setIsCollapsed(false)}
            >
              {t("askUserQuestion.clickToAnswer")}
            </button>
          </div>
        ) : (
          <>
            {/* Progress row */}
            {questions.length > 1 && (
              <div className="ask-user-question-progress-row">
                <span className="ask-user-question-progress">
                  {t("askUserQuestion.progress", {
                    current: safeIndex + 1,
                    total: questions.length,
                  })}
                </span>
                <span
                  className={`ask-user-question-timer${isTimeWarning ? " is-warning" : ""}`}
                >
                  {formatCountdown(remainingSeconds)}
                </span>
              </div>
            )}

            {/* Question body */}
            <div className="ask-user-question-body">
              {currentQ.header && (
                <span className="ask-user-question-tag">{currentQ.header}</span>
              )}
              <p className="ask-user-question-text">{currentQ.question}</p>

              {/* Options */}
              {hasOptions && (
                <div className="ask-user-question-options">
                  {options.map((option, optIdx) => {
                    const isSelected = currentSelections.has(option.label);
                    return (
                      <button
                        key={`${qKey}-opt-${optIdx}`}
                        type="button"
                        className={`ask-user-question-option${isSelected ? " is-selected" : ""}`}
                        onClick={() => handleOptionToggle(option.label)}
                      >
                        {isMultiSelect ? (
                          <span className={`ask-user-question-option-check${isSelected ? " is-selected" : ""}`}>
                            {isSelected ? "\u2713" : ""}
                          </span>
                        ) : (
                          <span className="ask-user-question-option-radio" />
                        )}
                        <span className="ask-user-question-option-content">
                          <span className="ask-user-question-option-label">{option.label}</span>
                          {option.description && (
                            <span className="ask-user-question-option-desc">{option.description}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}

                  {/* "Other" option */}
                  {currentQ.isOther !== false && (
                    <button
                      type="button"
                      className={`ask-user-question-option is-other${isOtherSelected ? " is-selected" : ""}`}
                      onClick={() => handleOptionToggle(OTHER_OPTION_MARKER)}
                    >
                      {isMultiSelect ? (
                        <span className={`ask-user-question-option-check${isOtherSelected ? " is-selected" : ""}`}>
                          {isOtherSelected ? "\u2713" : ""}
                        </span>
                      ) : (
                        <span className="ask-user-question-option-radio" />
                      )}
                      <span className="ask-user-question-option-content">
                        <span className="ask-user-question-option-label">
                          {t("askUserQuestion.otherOption")}
                        </span>
                        <span className="ask-user-question-option-desc">
                          {t("askUserQuestion.otherOptionDesc")}
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Custom input for "Other" or plain text questions */}
              {(isOtherSelected || !hasOptions) && !currentQ.isSecret && (
                <textarea
                  ref={customInputRef}
                  className="ask-user-question-custom-input"
                  value={currentCustom}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  placeholder={
                    hasOptions
                      ? t("askUserQuestion.customInputPlaceholder")
                      : t("approval.typeAnswerOptional")
                  }
                  rows={3}
                  maxLength={MAX_CUSTOM_INPUT_LENGTH}
                />
              )}

              {/* Secret field */}
              {currentQ.isSecret && (
                <div className="ask-user-question-secret-row">
                  <input
                    className="ask-user-question-custom-input"
                    type={currentSecretVis ? "text" : "password"}
                    placeholder={t("approval.typeAnswerOptional")}
                    value={currentCustom}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    style={{ minHeight: "auto", padding: "8px 12px" }}
                  />
                  <button
                    type="button"
                    className="ask-user-question-secret-toggle"
                    onClick={handleToggleSecret}
                  >
                    {currentSecretVis ? t("approval.hideSecret") : t("approval.showSecret")}
                  </button>
                </div>
              )}

              {isMultiSelect && (
                <p className="ask-user-question-hint">
                  {t("askUserQuestion.multiSelectHint")}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="ask-user-question-actions">
              <button
                className="ask-user-question-btn is-secondary"
                onClick={handleCancel}
              >
                {t("askUserQuestion.cancel")}
              </button>

              <div className="ask-user-question-actions-right">
                {submitError && (
                  <span className="ask-user-question-error">{submitError}</span>
                )}
                {safeIndex > 0 && (
                  <button
                    className="ask-user-question-btn is-secondary"
                    onClick={handleBack}
                  >
                    {t("askUserQuestion.back")}
                  </button>
                )}
                <button
                  className="ask-user-question-btn is-primary"
                  onClick={() => void handleNext()}
                  disabled={!canProceed || isSubmitting}
                >
                  {isLastQuestion
                    ? t("askUserQuestion.submit")
                    : t("askUserQuestion.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
