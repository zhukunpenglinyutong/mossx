import { useCallback, useEffect, useRef, useState } from 'react';
import { engineSendMessageSync } from '../../../../../services/tauri';
import type { EngineType } from '../../../../../types';
import { getNormalizedAssistantMessageText } from '../../../../../utils/threadItemsAssistantText';

const PROMPT_ENHANCER_FAILURE_MESSAGE = 'Failed to enhance prompt';
const PROMPT_ENHANCER_WORKSPACE_MESSAGE = 'Workspace is not ready for prompt enhancement';
const PROMPT_ENHANCER_FALLBACK_FAILURE_MESSAGE =
  'Prompt enhancement failed. Please keep the original prompt and try again.';
const PROMPT_ENHANCER_EMPTY_FALLBACK_MESSAGE = 'Codex returned an empty prompt enhancement';
const PROMPT_ENHANCER_TIMEOUT_MS = 60_000;
const PROMPT_ENHANCER_TIMEOUT_MESSAGE =
  `Prompt enhancement timed out after ${PROMPT_ENHANCER_TIMEOUT_MS / 1000} seconds. Please try again.`;

function buildPromptEnhancerInstruction(originalPrompt: string, engine: EngineType): string {
  const baseInstruction = [
    'You are a prompt rewriting assistant.',
    'Rewrite the user draft into a clearer, more actionable prompt for an AI assistant.',
    'Requirements:',
    '- Preserve the original intent, language, and explicit facts.',
    '- Do not answer the request itself.',
    '- If the draft is vague, improve structure and clarity without inventing new facts.',
    '- Use concise sections only when they help, such as Goal, Context, Constraints, Output, or Acceptance Criteria.',
    '- If the draft is already clear, lightly polish it.',
    '- Output only the rewritten prompt text with no explanation, no markdown fence, and no preamble.',
    '',
    'User draft:',
    originalPrompt,
  ];

  if (engine === 'claude') {
    baseInstruction.splice(
      8,
      0,
      '- Keep the rewrite concise and execution-oriented; avoid verbosity.',
      '- Output at most 6 short lines, plain text only, no markdown headings, no bullet nesting.',
      '- Remove filler and meta language; keep only actionable constraints and deliverable format.',
    );
  }

  return baseInstruction.join('\n');
}

function normalizeEnhancerEngine(currentProvider: string): EngineType {
  switch (currentProvider) {
    case 'codex':
    case 'gemini':
    case 'opencode':
      return currentProvider;
    case 'claude':
    default:
      return 'claude';
  }
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : PROMPT_ENHANCER_FAILURE_MESSAGE;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  return PROMPT_ENHANCER_FAILURE_MESSAGE;
}

function isClaudeEnhancerRetryableError(error: unknown): boolean {
  const message = resolveErrorMessage(error).toLowerCase();
  return [
    'claude exited with status',
    'claude stream-json startup timed out',
    'claude stream-json ended without a valid stream event',
    'claude response timed out',
    'rate limit',
    'overloaded',
    'network',
    'authentication',
    'auth',
    'model',
  ].some((needle) => message.includes(needle));
}

function resolvePromptEnhancerFailureMessage(primaryError: unknown, fallbackError?: unknown): string {
  const primaryMessage = resolveErrorMessage(primaryError);
  if (fallbackError === undefined) {
    return primaryMessage;
  }

  const fallbackMessage = resolveErrorMessage(fallbackError);
  if (
    primaryMessage === PROMPT_ENHANCER_FAILURE_MESSAGE
    && fallbackMessage === PROMPT_ENHANCER_FAILURE_MESSAGE
  ) {
    return PROMPT_ENHANCER_FALLBACK_FAILURE_MESSAGE;
  }

  return `Prompt enhancement failed. Claude: ${primaryMessage}. Fallback: ${fallbackMessage}`;
}

function normalizeEnhancedPromptResponse(text: unknown): string {
  if (typeof text !== 'string') {
    return '';
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  return getNormalizedAssistantMessageText(trimmed).trim();
}

function buildIsolatedSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `prompt-enhancer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function withTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutRequest = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeoutRequest]);
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

async function requestEnhancedPrompt(options: {
  workspaceId: string;
  prompt: string;
  engine: EngineType;
  model: string | null;
  sessionId: string;
}): Promise<string> {
  const response = await withTimeout(
    engineSendMessageSync(options.workspaceId, {
      text: options.prompt,
      engine: options.engine,
      model: options.model,
      accessMode: 'read-only',
      continueSession: false,
      sessionId: options.sessionId,
    }),
    PROMPT_ENHANCER_TIMEOUT_MS,
    PROMPT_ENHANCER_TIMEOUT_MESSAGE,
  );
  return normalizeEnhancedPromptResponse(response.text);
}

interface UsePromptEnhancerOptions {
  workspaceId?: string | null;
  editableRef: React.RefObject<HTMLDivElement | null>;
  getTextContent: () => string;
  currentProvider: string;
  selectedModel: string;
  setHasContent: (hasContent: boolean) => void;
  handleInput: () => void;
  stageNextCommitOptions?: (options: {
    source: 'programmatic';
    forceNewTransaction?: boolean;
    inputType?: string;
    timestamp?: number;
  }) => void;
}

interface UsePromptEnhancerReturn {
  isEnhancing: boolean;
  enhancingEngine: EngineType;
  showEnhancerDialog: boolean;
  originalPrompt: string;
  enhancedPrompt: string;
  canUseEnhancedPrompt: boolean;
  handleEnhancePrompt: () => void;
  handleUseEnhancedPrompt: () => void;
  handleKeepOriginalPrompt: () => void;
  handleCloseEnhancerDialog: () => void;
}

export function usePromptEnhancer({
  workspaceId,
  editableRef,
  getTextContent,
  currentProvider,
  selectedModel,
  setHasContent,
  handleInput,
  stageNextCommitOptions,
}: UsePromptEnhancerOptions): UsePromptEnhancerReturn {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancingEngine, setEnhancingEngine] = useState<EngineType>('claude');
  const [showEnhancerDialog, setShowEnhancerDialog] = useState(false);
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [canUseEnhancedPrompt, setCanUseEnhancedPrompt] = useState(false);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      activeRequestIdRef.current += 1;
    };
  }, []);

  const closeEnhancerDialog = useCallback(() => {
    activeRequestIdRef.current += 1;
    setShowEnhancerDialog(false);
    setIsEnhancing(false);
    setCanUseEnhancedPrompt(false);
  }, []);

  const handleEnhancePrompt = useCallback(() => {
    const content = getTextContent().trim();
    if (!content || isEnhancing) {
      return;
    }

    if (!workspaceId || workspaceId.trim().length === 0) {
      setOriginalPrompt(content);
      setEnhancedPrompt(PROMPT_ENHANCER_WORKSPACE_MESSAGE);
      setCanUseEnhancedPrompt(false);
      setShowEnhancerDialog(true);
      setIsEnhancing(false);
      return;
    }

    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    const engine = normalizeEnhancerEngine(currentProvider);
    const prompt = buildPromptEnhancerInstruction(content, engine);
    const fallbackPrompt =
      engine === 'claude' ? buildPromptEnhancerInstruction(content, 'codex') : null;
    const requestModel = selectedModel.trim().length > 0 ? selectedModel : null;
    const requestSessionId = buildIsolatedSessionId();

    setEnhancingEngine(engine);
    setOriginalPrompt(content);
    setEnhancedPrompt('');
    setCanUseEnhancedPrompt(false);
    setShowEnhancerDialog(true);
    setIsEnhancing(true);

    void (async () => {
      try {
        const rewrittenPrompt = await requestEnhancedPrompt({
          workspaceId,
          prompt,
          engine,
          model: requestModel,
          sessionId: requestSessionId,
        });
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        if (!rewrittenPrompt) {
          setEnhancedPrompt(PROMPT_ENHANCER_FAILURE_MESSAGE);
          setCanUseEnhancedPrompt(false);
          return;
        }
        setEnhancedPrompt(rewrittenPrompt);
        setCanUseEnhancedPrompt(true);
      } catch (error: unknown) {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        if (engine === 'claude' && isClaudeEnhancerRetryableError(error) && fallbackPrompt) {
          try {
            setEnhancingEngine('codex');
            const fallbackRewrittenPrompt = await requestEnhancedPrompt({
              workspaceId,
              prompt: fallbackPrompt,
              engine: 'codex',
              model: null,
              sessionId: buildIsolatedSessionId(),
            });
            if (activeRequestIdRef.current !== requestId) {
              return;
            }
            if (!fallbackRewrittenPrompt) {
              setEnhancedPrompt(
                resolvePromptEnhancerFailureMessage(error, PROMPT_ENHANCER_EMPTY_FALLBACK_MESSAGE),
              );
              setCanUseEnhancedPrompt(false);
              return;
            }
            setEnhancedPrompt(fallbackRewrittenPrompt);
            setCanUseEnhancedPrompt(true);
            return;
          } catch (fallbackError: unknown) {
            if (activeRequestIdRef.current !== requestId) {
              return;
            }
            setEnhancedPrompt(resolvePromptEnhancerFailureMessage(error, fallbackError));
            setCanUseEnhancedPrompt(false);
            return;
          }
        }
        setEnhancedPrompt(resolvePromptEnhancerFailureMessage(error));
        setCanUseEnhancedPrompt(false);
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setIsEnhancing(false);
        }
      }
    })();
  }, [
    currentProvider,
    getTextContent,
    isEnhancing,
    selectedModel,
    workspaceId,
  ]);

  const handleUseEnhancedPrompt = useCallback(() => {
    if (canUseEnhancedPrompt && enhancedPrompt && editableRef.current) {
      editableRef.current.innerText = enhancedPrompt;
      setHasContent(true);
      stageNextCommitOptions?.({
        source: 'programmatic',
        forceNewTransaction: true,
        inputType: 'prompt:enhancer',
      });
      handleInput();
    }
    closeEnhancerDialog();
  }, [
    canUseEnhancedPrompt,
    closeEnhancerDialog,
    editableRef,
    enhancedPrompt,
    handleInput,
    setHasContent,
    stageNextCommitOptions,
  ]);

  return {
    isEnhancing,
    enhancingEngine,
    showEnhancerDialog,
    originalPrompt,
    enhancedPrompt,
    canUseEnhancedPrompt,
    handleEnhancePrompt,
    handleUseEnhancedPrompt,
    handleKeepOriginalPrompt: closeEnhancerDialog,
    handleCloseEnhancerDialog: closeEnhancerDialog,
  };
}
