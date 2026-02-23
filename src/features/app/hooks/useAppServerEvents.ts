import { useEffect, useRef } from "react";
import type {
  AppServerEvent,
  ApprovalRequest,
  RequestUserInputRequest,
} from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";

type AgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
};

type AgentCompleted = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
};

type AppServerEventHandlers = {
  onWorkspaceConnected?: (workspaceId: string) => void;
  onThreadStarted?: (workspaceId: string, thread: Record<string, unknown>) => void;
  onThreadSessionIdUpdated?: (
    workspaceId: string,
    threadId: string,
    sessionId: string,
    engine?: "claude" | "opencode" | "codex" | "gemini" | null,
  ) => void;
  onBackgroundThreadAction?: (
    workspaceId: string,
    threadId: string,
    action: string,
  ) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onRequestUserInput?: (request: RequestUserInputRequest) => void;
  onAgentMessageDelta?: (event: AgentDelta) => void;
  onAgentMessageCompleted?: (event: AgentCompleted) => void;
  onAppServerEvent?: (event: AppServerEvent) => void;
  onTurnStarted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnCompleted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onProcessingHeartbeat?: (workspaceId: string, threadId: string, pulse: number) => void;
  onContextCompacted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnError?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { message: string; willRetry: boolean },
  ) => void;
  onTurnPlanUpdated?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { explanation: unknown; plan: unknown },
  ) => void;
  onItemStarted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onItemUpdated?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onItemCompleted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onReasoningSummaryDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onReasoningSummaryBoundary?: (workspaceId: string, threadId: string, itemId: string) => void;
  onReasoningTextDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onCommandOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTerminalInteraction?: (
    workspaceId: string,
    threadId: string,
    itemId: string,
    stdin: string,
  ) => void;
  onFileChangeOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTurnDiffUpdated?: (workspaceId: string, threadId: string, diff: string) => void;
  onThreadTokenUsageUpdated?: (
    workspaceId: string,
    threadId: string,
    tokenUsage: Record<string, unknown>,
  ) => void;
  onAccountRateLimitsUpdated?: (
    workspaceId: string,
    rateLimits: Record<string, unknown>,
  ) => void;
  /**
   * 获取指定 workspace 当前活动的 Codex thread ID
   * 用于处理没有 threadId 的 token_count 事件
   * 奶奶请看：这就是那个"智能收件室"的功能，当信没有收件人时，它会自动查找正在使用的房间
   */
  getActiveCodexThreadId?: (workspaceId: string) => string | null;
};

export function useAppServerEvents(handlers: AppServerEventHandlers) {
  const threadAgentDeltaSeenRef = useRef<Record<string, true>>({});
  const threadAgentCompletedSeenRef = useRef<Record<string, true>>({});
  useEffect(() => {
    const unlisten = subscribeAppServerEvents((payload) => {
      handlers.onAppServerEvent?.(payload);

      const { workspace_id, message } = payload;
      const method = String(message.method ?? "");

      if (method === "codex/connected") {
        handlers.onWorkspaceConnected?.(workspace_id);
        return;
      }

      const requestId = message.id;
      const hasRequestId =
        typeof requestId === "number" || typeof requestId === "string";

      if (method.includes("requestApproval") && hasRequestId) {
        handlers.onApprovalRequest?.({
          workspace_id,
          request_id: requestId,
          method,
          params: (message.params as Record<string, unknown>) ?? {},
        });
        return;
      }

      if (method === "item/tool/requestUserInput" && hasRequestId) {
        const params = (message.params as Record<string, unknown>) ?? {};
        const questionsRaw = Array.isArray(params.questions) ? params.questions : [];
        const questions = questionsRaw
          .map((entry) => {
            const question = entry as Record<string, unknown>;
            const optionsRaw = Array.isArray(question.options) ? question.options : [];
            const options = optionsRaw
              .map((option) => {
                const record = option as Record<string, unknown>;
                const label = String(record.label ?? "").trim();
                const description = String(record.description ?? "").trim();
                if (!label && !description) {
                  return null;
                }
                return { label, description };
              })
              .filter((option): option is { label: string; description: string } => Boolean(option));
            return {
              id: String(question.id ?? "").trim(),
              header: String(question.header ?? ""),
              question: String(question.question ?? ""),
              isOther: Boolean(question.isOther ?? question.is_other),
              isSecret: Boolean(question.isSecret ?? question.is_secret),
              options: options.length ? options : undefined,
            };
          })
          .filter((question) => question.id);
        handlers.onRequestUserInput?.({
          workspace_id,
          request_id: requestId,
          params: {
            thread_id: String(params.threadId ?? params.thread_id ?? ""),
            turn_id: String(params.turnId ?? params.turn_id ?? ""),
            item_id: String(params.itemId ?? params.item_id ?? ""),
            questions,
          },
        });
        return;
      }

      if (method === "item/agentMessage/delta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          threadAgentDeltaSeenRef.current[threadId] = true;
          handlers.onAgentMessageDelta?.({
            workspaceId: workspace_id,
            threadId,
            itemId,
            delta,
          });
        }
        return;
      }

      if (method === "turn/started") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(
          params.threadId ?? params.thread_id ?? turn?.threadId ?? turn?.thread_id ?? "",
        );
        const turnId = String(turn?.id ?? params.turnId ?? params.turn_id ?? "");
        if (threadId) {
          delete threadAgentDeltaSeenRef.current[threadId];
          delete threadAgentCompletedSeenRef.current[threadId];
          handlers.onTurnStarted?.(workspace_id, threadId, turnId);
        }
        return;
      }

      if (method === "thread/started") {
        const params = message.params as Record<string, unknown>;
        const thread = (params.thread as Record<string, unknown> | undefined) ?? null;
        const threadId = String(thread?.id ?? params.threadId ?? params.thread_id ?? "");
        const sessionId = String(params.sessionId ?? params.session_id ?? "");
        const rawEngine = String(params.engine ?? "").toLowerCase();
        const eventEngine =
          rawEngine === "claude" ||
          rawEngine === "opencode" ||
          rawEngine === "codex" ||
          rawEngine === "gemini"
            ? rawEngine
            : null;

        // If we have a real sessionId (not "pending"), notify for thread ID update
        if (threadId && sessionId && sessionId !== "pending") {
          handlers.onThreadSessionIdUpdated?.(
            workspace_id,
            threadId,
            sessionId,
            eventEngine,
          );
        }

        if (thread && threadId) {
          handlers.onThreadStarted?.(workspace_id, thread);
        }
        return;
      }

      if (method === "turn/error") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        const willRetry = Boolean(params.willRetry ?? params.will_retry);
        const errorValue = params.error;
        const messageText =
          typeof errorValue === "string"
            ? errorValue
            : typeof errorValue === "object" && errorValue
              ? String((errorValue as Record<string, unknown>).message ?? "")
              : "";
        if (threadId) {
          handlers.onTurnError?.(workspace_id, threadId, turnId, {
            message: messageText,
            willRetry,
          });
        }
        return;
      }

      if (method === "codex/backgroundThread") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const action = String(params.action ?? "hide");
        if (threadId) {
          handlers.onBackgroundThreadAction?.(workspace_id, threadId, action);
        }
        return;
      }

      if (method === "error") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        const error = (params.error as Record<string, unknown> | undefined) ?? {};
        const messageText = String(error.message ?? "");
        const willRetry = Boolean(params.willRetry ?? params.will_retry);
        if (threadId) {
          handlers.onTurnError?.(workspace_id, threadId, turnId, {
            message: messageText,
            willRetry,
          });
        }
        return;
      }

      if (method === "turn/completed") {
        const params = message.params as Record<string, unknown>;
        const turn = params.turn as Record<string, unknown> | undefined;
        const threadId = String(
          params.threadId ?? params.thread_id ?? turn?.threadId ?? turn?.thread_id ?? "",
        );
        const turnId = String(turn?.id ?? params.turnId ?? params.turn_id ?? "");
        if (threadId) {
          const seenDelta = Boolean(threadAgentDeltaSeenRef.current[threadId]);
          const seenCompleted = Boolean(threadAgentCompletedSeenRef.current[threadId]);
          const result = (params.result as Record<string, unknown> | undefined) ?? undefined;
          const textFromResult = [
            typeof params.text === "string" ? params.text : "",
            typeof result?.text === "string" ? String(result.text) : "",
            typeof result?.output_text === "string" ? String(result.output_text) : "",
            typeof result?.outputText === "string" ? String(result.outputText) : "",
            typeof result?.content === "string" ? String(result.content) : "",
          ]
            .map((item) => item.trim())
            .find((item) => item.length > 0);
          if (!seenDelta && !seenCompleted && textFromResult) {
            handlers.onAgentMessageCompleted?.({
              workspaceId: workspace_id,
              threadId,
              itemId: turnId || `assistant-final-${Date.now()}`,
              text: textFromResult,
            });
            threadAgentCompletedSeenRef.current[threadId] = true;
          }
          delete threadAgentDeltaSeenRef.current[threadId];
          delete threadAgentCompletedSeenRef.current[threadId];
          handlers.onTurnCompleted?.(workspace_id, threadId, turnId);

          // Try to extract usage data from turn/completed (Codex may include it here)
          const usage =
            (params.usage as Record<string, unknown> | undefined) ??
            (params.result as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;

          if (usage) {
            const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
            const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
            const cachedInputTokens = Number(
              usage.cached_input_tokens ??
              usage.cache_read_input_tokens ??
              usage.cachedInputTokens ??
              usage.cacheReadInputTokens ?? 0
            );
            const modelContextWindow = Number(
              usage.model_context_window ??
              usage.modelContextWindow ??
              200000 // Default for Codex (will be updated by runtime events)
            );

            if (inputTokens > 0 || outputTokens > 0) {
              const tokenUsage = {
                total: {
                  inputTokens,
                  outputTokens,
                  cachedInputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
                last: {
                  inputTokens,
                  outputTokens,
                  cachedInputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
                modelContextWindow,
              };
              handlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
            }
          }
        }
        return;
      }

      if (method === "processing/heartbeat") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const pulse = Number(params.pulse ?? 0);
        if (threadId && Number.isFinite(pulse) && pulse > 0) {
          handlers.onProcessingHeartbeat?.(workspace_id, threadId, pulse);
        }
        return;
      }

      if (method === "thread/compacted") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        if (threadId && turnId) {
          handlers.onContextCompacted?.(workspace_id, threadId, turnId);
        }
        return;
      }

      if (method === "turn/plan/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const turnId = String(params.turnId ?? params.turn_id ?? "");
        if (threadId) {
          handlers.onTurnPlanUpdated?.(workspace_id, threadId, turnId, {
            explanation: params.explanation,
            plan: params.plan,
          });
        }
        return;
      }

      if (method === "turn/diff/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const diff = String(params.diff ?? "");
        if (threadId && diff) {
          handlers.onTurnDiffUpdated?.(workspace_id, threadId, diff);
        }
        return;
      }

      if (method === "thread/tokenUsage/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const tokenUsage =
          (params.tokenUsage as Record<string, unknown> | undefined) ??
          (params.token_usage as Record<string, unknown> | undefined);
        if (threadId && tokenUsage) {
          handlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
        }
        return;
      }

      // Handle Codex token_count events (Codex sends usage data this way)
      // Format: {"method":"token_count","params":{"info":{"total_token_usage":{...}}}}
      // 奶奶请看：这里是处理 Codex "报告信"的地方
      if (method === "token_count") {
        const params = message.params as Record<string, unknown>;
        const info = params.info as Record<string, unknown> | undefined;
        let threadId = String(params.threadId ?? params.thread_id ?? "");

        // 如果事件中没有 threadId，尝试从当前活动的 Codex thread 获取
        // 这就像收件室帮忙查找"当前正在使用的房间号"
        if (!threadId && handlers.getActiveCodexThreadId) {
          const activeThreadId = handlers.getActiveCodexThreadId(workspace_id);
          if (activeThreadId) {
            threadId = activeThreadId;
          }
        }

        // 如果还是没有 threadId，就跳过这个事件（不再使用 "codex-default"）
        if (!threadId) {
          return;
        }

        if (info) {
          // Extract usage from total_token_usage or last_token_usage
          const usageData =
            (info.total_token_usage as Record<string, unknown> | undefined) ??
            (info.totalTokenUsage as Record<string, unknown> | undefined) ??
            (info.last_token_usage as Record<string, unknown> | undefined) ??
            (info.lastTokenUsage as Record<string, unknown> | undefined);

          if (usageData) {
            // Convert to the format expected by onThreadTokenUsageUpdated
            const inputTokens = Number(usageData.input_tokens ?? usageData.inputTokens ?? 0);
            const outputTokens = Number(usageData.output_tokens ?? usageData.outputTokens ?? 0);
            const cachedInputTokens = Number(
              usageData.cached_input_tokens ??
              usageData.cache_read_input_tokens ??
              usageData.cachedInputTokens ??
              usageData.cacheReadInputTokens ?? 0
            );
            const modelContextWindow = Number(
              usageData.model_context_window ??
              usageData.modelContextWindow ??
              info.model_context_window ??
              info.modelContextWindow ??
              200000 // Default for Codex (will be updated by runtime events)
            );

            const tokenUsage = {
              total: {
                inputTokens,
                outputTokens,
                cachedInputTokens,
                totalTokens: inputTokens + outputTokens,
              },
              last: {
                inputTokens,
                outputTokens,
                cachedInputTokens,
                totalTokens: inputTokens + outputTokens,
              },
              modelContextWindow,
            };

            handlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
          }
        }
        return;
      }

      if (method === "account/rateLimits/updated") {
        const params = message.params as Record<string, unknown>;
        const rateLimits =
          (params.rateLimits as Record<string, unknown> | undefined) ??
          (params.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          handlers.onAccountRateLimitsUpdated?.(workspace_id, rateLimits);
        }
        return;
      }

      if (method === "item/completed") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item) {
          handlers.onItemCompleted?.(workspace_id, threadId, item);

          // Try to extract usage data from item/completed (Codex may include it here)
          const usage =
            (item.usage as Record<string, unknown> | undefined) ??
            (params.usage as Record<string, unknown> | undefined);

          if (usage) {
            const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
            const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
            const cachedInputTokens = Number(
              usage.cached_input_tokens ??
              usage.cache_read_input_tokens ??
              usage.cachedInputTokens ??
              usage.cacheReadInputTokens ?? 0
            );
            const modelContextWindow = Number(
              usage.model_context_window ??
              usage.modelContextWindow ??
              200000 // Default for Codex (will be updated by runtime events)
            );

            if (inputTokens > 0 || outputTokens > 0) {
              const tokenUsage = {
                total: {
                  inputTokens,
                  outputTokens,
                  cachedInputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
                last: {
                  inputTokens,
                  outputTokens,
                  cachedInputTokens,
                  totalTokens: inputTokens + outputTokens,
                },
                modelContextWindow,
              };
              handlers.onThreadTokenUsageUpdated?.(workspace_id, threadId, tokenUsage);
            }
          }
        }
        if (threadId && item?.type === "agentMessage") {
          const itemId = String(item.id ?? "");
          const text = String(item.text ?? "");
          if (itemId && !threadAgentCompletedSeenRef.current[threadId]) {
            handlers.onAgentMessageCompleted?.({
              workspaceId: workspace_id,
              threadId,
              itemId,
              text,
            });
            threadAgentCompletedSeenRef.current[threadId] = true;
          }
        }
        return;
      }

      if (method === "item/started") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item) {
          handlers.onItemStarted?.(workspace_id, threadId, item);
        }
        return;
      }

      if (method === "item/updated") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const item = params.item as Record<string, unknown> | undefined;
        if (threadId && item) {
          handlers.onItemUpdated?.(workspace_id, threadId, item);
        }
        return;
      }

      if (method === "item/reasoning/summaryTextDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onReasoningSummaryDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/reasoning/summaryPartAdded") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        if (threadId && itemId) {
          handlers.onReasoningSummaryBoundary?.(workspace_id, threadId, itemId);
        }
        return;
      }

      if (method === "item/reasoning/textDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onReasoningTextDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      // Compatibility for Codex app-server variants that emit reasoning deltas
      // without the "textDelta" suffix.
      if (method === "item/reasoning/delta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onReasoningTextDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/commandExecution/outputDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onCommandOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }

      if (method === "item/commandExecution/terminalInteraction") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const stdin = String(params.stdin ?? "");
        if (threadId && itemId) {
          handlers.onTerminalInteraction?.(workspace_id, threadId, itemId, stdin);
        }
        return;
      }

      if (method === "item/fileChange/outputDelta") {
        const params = message.params as Record<string, unknown>;
        const threadId = String(params.threadId ?? params.thread_id ?? "");
        const itemId = String(params.itemId ?? params.item_id ?? "");
        const delta = String(params.delta ?? "");
        if (threadId && itemId && delta) {
          handlers.onFileChangeOutputDelta?.(workspace_id, threadId, itemId, delta);
        }
        return;
      }
    });

    return () => {
      unlisten();
    };
  }, [handlers]);
}
