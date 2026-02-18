import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";

type RequestUserInputMessageProps = {
  requests: RequestUserInputRequest[];
  activeThreadId: string | null;
  activeWorkspaceId?: string | null;
  onSubmit: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => Promise<void> | void;
};

type SelectionState = Record<string, number | null>;
type NotesState = Record<string, string>;
type SecretVisibilityState = Record<string, boolean>;
type RequestDraftState = {
  selections: SelectionState;
  notes: NotesState;
  secretVisible: SecretVisibilityState;
};

function getRequestDraftKey(request: RequestUserInputRequest) {
  return `${request.workspace_id}:${String(request.request_id)}`;
}

export function RequestUserInputMessage({
  requests,
  activeThreadId,
  activeWorkspaceId,
  onSubmit,
}: RequestUserInputMessageProps) {
  const { t } = useTranslation();
  const activeRequests = useMemo(
    () =>
      requests.filter((request) => {
        if (!activeThreadId) {
          return false;
        }
        if (request.params.thread_id !== activeThreadId) {
          return false;
        }
        if (activeWorkspaceId && request.workspace_id !== activeWorkspaceId) {
          return false;
        }
        return true;
      }),
    [requests, activeThreadId, activeWorkspaceId],
  );
  const activeRequest = activeRequests[0];
  const [draftByRequest, setDraftByRequest] = useState<
    Record<string, RequestDraftState>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRequest) {
      return;
    }
    const requestKey = getRequestDraftKey(activeRequest);
    setDraftByRequest((current) => {
      if (current[requestKey]) {
        return current;
      }
      const nextSelections: SelectionState = {};
      const nextNotes: NotesState = {};
      const nextSecretVisible: SecretVisibilityState = {};
      activeRequest.params.questions.forEach((question, index) => {
        const key = question.id || `question-${index}`;
        nextSelections[key] = null;
        nextNotes[key] = "";
        nextSecretVisible[key] = false;
      });
      return {
        ...current,
        [requestKey]: {
          selections: nextSelections,
          notes: nextNotes,
          secretVisible: nextSecretVisible,
        },
      };
    });
  }, [activeRequest]);

  useEffect(() => {
    setSubmitError(null);
    setIsSubmitting(false);
  }, [activeRequest]);

  if (!activeRequest) {
    return null;
  }

  const { questions } = activeRequest.params;
  const totalRequests = activeRequests.length;
  const requestKey = getRequestDraftKey(activeRequest);
  const requestDraft = draftByRequest[requestKey];
  const selections = requestDraft?.selections ?? {};
  const notes = requestDraft?.notes ?? {};
  const secretVisible = requestDraft?.secretVisible ?? {};

  const buildAnswers = () => {
    const answers: RequestUserInputResponse["answers"] = {};
    questions.forEach((question, index) => {
      if (!question.id) {
        return;
      }
      const answerList: string[] = [];
      const key = question.id || `question-${index}`;
      const selectedIndex = selections[key];
      const options = question.options ?? [];
      const hasOptions = options.length > 0;
      if (hasOptions && selectedIndex !== null) {
        const selected = options[selectedIndex];
        const selectedValue =
          selected?.label?.trim() || selected?.description?.trim() || "";
        if (selectedValue) {
          answerList.push(selectedValue);
        }
      }
      const note = (notes[key] ?? "").trim();
      if (note) {
        if (hasOptions) {
          answerList.push(`user_note: ${note}`);
        } else {
          answerList.push(note);
        }
      }
      answers[question.id] = { answers: answerList };
    });
    return answers;
  };

  const handleSelect = (questionId: string, optionIndex: number) => {
    setDraftByRequest((current) => {
      const draft = current[requestKey];
      if (!draft) {
        return current;
      }
      return {
        ...current,
        [requestKey]: {
          ...draft,
          selections: { ...draft.selections, [questionId]: optionIndex },
        },
      };
    });
  };

  const handleNotesChange = (questionId: string, value: string) => {
    setDraftByRequest((current) => {
      const draft = current[requestKey];
      if (!draft) {
        return current;
      }
      return {
        ...current,
        [requestKey]: {
          ...draft,
          notes: { ...draft.notes, [questionId]: value },
        },
      };
    });
  };

  const handleToggleSecretVisible = (questionId: string) => {
    setDraftByRequest((current) => {
      const draft = current[requestKey];
      if (!draft) {
        return current;
      }
      const currentVisible = Boolean(draft.secretVisible[questionId]);
      return {
        ...current,
        [requestKey]: {
          ...draft,
          secretVisible: {
            ...draft.secretVisible,
            [questionId]: !currentVisible,
          },
        },
      };
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(activeRequest, { answers: buildAnswers() });
      setDraftByRequest((current) => {
        const next = { ...current };
        delete next[requestKey];
        return next;
      });
    } catch {
      setSubmitError(t("approval.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="message request-user-input-message">
      <div
        className="bubble request-user-input-card"
        role="group"
        aria-label={t("approval.userInputRequested")}
      >
        <div className="request-user-input-header">
          <div className="request-user-input-title">{t("approval.inputRequested")}</div>
          {totalRequests > 1 ? (
            <div className="request-user-input-queue">
              {t("approval.requestOf", { current: 1, total: totalRequests })}
            </div>
          ) : null}
        </div>
        <div className="request-user-input-body">
          {questions.length ? (
            questions.map((question, index) => {
              const questionId = question.id || `question-${index}`;
              const selectedIndex = selections[questionId];
              const options = question.options ?? [];
              const notePlaceholder = question.isOther
                ? t("approval.typeAnswerOptional")
                : options.length
                ? t("approval.addNotesOptional")
                : t("approval.typeAnswerOptional");
              return (
                <section key={questionId} className="request-user-input-question">
                  {question.header ? (
                    <div className="request-user-input-question-header">
                      {question.header}
                    </div>
                  ) : null}
                  <div className="request-user-input-question-text">
                    {question.question}
                  </div>
                  {options.length ? (
                    <div className="request-user-input-options">
                      {options.map((option, optionIndex) => (
                        <button
                          key={`${questionId}-${optionIndex}`}
                          type="button"
                          className={`request-user-input-option${
                            selectedIndex === optionIndex ? " is-selected" : ""
                          }`}
                          onClick={() => handleSelect(questionId, optionIndex)}
                        >
                          <div className="request-user-input-option-label">
                            {option.label}
                          </div>
                          {option.description ? (
                            <div className="request-user-input-option-description">
                              {option.description}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {question.isSecret ? (
                    <div className="request-user-input-secret-field">
                      <input
                        className="request-user-input-notes"
                        type={secretVisible[questionId] ? "text" : "password"}
                        placeholder={notePlaceholder}
                        value={notes[questionId] ?? ""}
                        onChange={(event) =>
                          handleNotesChange(questionId, event.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="request-user-input-toggle-secret"
                        onClick={() => handleToggleSecretVisible(questionId)}
                      >
                        {secretVisible[questionId]
                          ? t("approval.hideSecret")
                          : t("approval.showSecret")}
                      </button>
                    </div>
                  ) : (
                    <textarea
                      className="request-user-input-notes"
                      placeholder={notePlaceholder}
                      value={notes[questionId] ?? ""}
                      onChange={(event) =>
                        handleNotesChange(questionId, event.target.value)
                      }
                      rows={2}
                    />
                  )}
                </section>
              );
            })
          ) : (
            <div className="request-user-input-empty">
              {t("approval.noQuestionsProvided")}
            </div>
          )}
        </div>
        <div className="request-user-input-actions">
          {submitError ? (
            <div className="request-user-input-error">{submitError}</div>
          ) : null}
          <button className="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {t("approval.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
