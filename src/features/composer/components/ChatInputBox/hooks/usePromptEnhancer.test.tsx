/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { engineSendMessageSync } from '../../../../../services/tauri';
import { usePromptEnhancer } from './usePromptEnhancer';

vi.mock('../../../../../services/tauri', () => ({
  engineSendMessageSync: vi.fn(),
}));

function renderPromptEnhancer(options?: {
  currentProvider?: string;
  selectedModel?: string;
  draft?: string;
}) {
  const editableRef = { current: null };
  const setHasContent = vi.fn();
  const handleInput = vi.fn();

  const hook = renderHook(() =>
    usePromptEnhancer({
      workspaceId: 'ws-1',
      editableRef,
      getTextContent: () => options?.draft ?? '报告管理页面加载数据时，标题的获取逻辑是什么',
      currentProvider: options?.currentProvider ?? 'claude',
      selectedModel: options?.selectedModel ?? 'claude-sonnet-4-5',
      setHasContent,
      handleInput,
    }),
  );

  return { ...hook, setHasContent, handleInput };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('usePromptEnhancer', () => {
  it('falls back to Codex when Claude enhancement exits before returning text', async () => {
    const sendSync = vi.mocked(engineSendMessageSync);
    sendSync
      .mockRejectedValueOnce(new Error('Claude exited with status: exit status: 1'))
      .mockResolvedValueOnce({
        engine: 'codex',
        text: '请说明报告管理页面加载数据时标题字段的来源、兜底逻辑和异常处理。',
      });

    const { result } = renderPromptEnhancer();

    act(() => {
      result.current.handleEnhancePrompt();
    });

    await waitFor(() => {
      expect(result.current.isEnhancing).toBe(false);
      expect(result.current.canUseEnhancedPrompt).toBe(true);
    });

    expect(result.current.enhancingEngine).toBe('codex');
    expect(result.current.enhancedPrompt).toBe(
      '请说明报告管理页面加载数据时标题字段的来源、兜底逻辑和异常处理。',
    );
    expect(sendSync).toHaveBeenCalledTimes(2);
    expect(sendSync.mock.calls[0]?.[1].engine).toBe('claude');
    expect(sendSync.mock.calls[0]?.[1].model).toBe('claude-sonnet-4-5');
    expect(sendSync.mock.calls[1]?.[1].engine).toBe('codex');
    expect(sendSync.mock.calls[1]?.[1].model).toBeNull();
  });

  it('normalizes duplicated Claude enhancement text before showing the result', async () => {
    const sendSync = vi.mocked(engineSendMessageSync);
    sendSync.mockResolvedValueOnce({
      engine: 'claude',
      text: [
        '请检查 Claude Code 提示词增强是否仍会重复返回同一段信息。',
        '请给出复现条件、根因判断和最小修复方案。',
        '',
        '请检查 Claude Code 提示词增强是否仍会重复返回同一段信息。',
        '请给出复现条件、根因判断和最小修复方案。',
      ].join('\n'),
    });

    const { result } = renderPromptEnhancer({
      currentProvider: 'claude',
      draft: '提示词增强返回重复信息，重点看 Claude Code。',
    });

    act(() => {
      result.current.handleEnhancePrompt();
    });

    await waitFor(() => {
      expect(result.current.isEnhancing).toBe(false);
      expect(result.current.canUseEnhancedPrompt).toBe(true);
    });

    expect(result.current.enhancedPrompt).toBe(
      '请检查 Claude Code 提示词增强是否仍会重复返回同一段信息。请给出复现条件、根因判断和最小修复方案。',
    );
    expect(
      result.current.enhancedPrompt.match(/请检查 Claude Code 提示词增强/g),
    ).toHaveLength(1);
    expect(sendSync).toHaveBeenCalledTimes(1);
  });

  it('normalizes duplicated Codex enhancement text before showing the result', async () => {
    const sendSync = vi.mocked(engineSendMessageSync);
    sendSync.mockResolvedValueOnce({
      engine: 'codex',
      text: [
        '请检查 Codex 提示词增强是否仍会重复返回同一段信息。',
        '请给出复现条件、根因判断和最小修复方案。',
        '',
        '请检查 Codex 提示词增强是否仍会重复返回同一段信息。',
        '请给出复现条件、根因判断和最小修复方案。',
      ].join('\n'),
    });

    const { result } = renderPromptEnhancer({
      currentProvider: 'codex',
      selectedModel: 'gpt-5.1-codex',
      draft: '提示词增强返回重复信息，重点看 Codex。',
    });

    act(() => {
      result.current.handleEnhancePrompt();
    });

    await waitFor(() => {
      expect(result.current.isEnhancing).toBe(false);
      expect(result.current.canUseEnhancedPrompt).toBe(true);
    });

    expect(result.current.enhancingEngine).toBe('codex');
    expect(result.current.enhancedPrompt).toBe(
      '请检查 Codex 提示词增强是否仍会重复返回同一段信息。请给出复现条件、根因判断和最小修复方案。',
    );
    expect(result.current.enhancedPrompt.match(/请检查 Codex 提示词增强/g)).toHaveLength(1);
    expect(sendSync).toHaveBeenCalledTimes(1);
    expect(sendSync.mock.calls[0]?.[1].engine).toBe('codex');
    expect(sendSync.mock.calls[0]?.[1].model).toBe('gpt-5.1-codex');
  });

  it('shows both Claude and fallback errors when prompt enhancement cannot recover', async () => {
    const sendSync = vi.mocked(engineSendMessageSync);
    sendSync
      .mockRejectedValueOnce(new Error('Claude stream-json ended without a valid stream event'))
      .mockRejectedValueOnce(new Error('Codex response timed out'));

    const { result } = renderPromptEnhancer();

    act(() => {
      result.current.handleEnhancePrompt();
    });

    await waitFor(() => {
      expect(result.current.isEnhancing).toBe(false);
      expect(result.current.canUseEnhancedPrompt).toBe(false);
    });

    expect(result.current.enhancedPrompt).toContain('Prompt enhancement failed.');
    expect(result.current.enhancedPrompt).toContain(
      'Claude: Claude stream-json ended without a valid stream event',
    );
    expect(result.current.enhancedPrompt).toContain('Fallback: Codex response timed out');
    expect(sendSync).toHaveBeenCalledTimes(2);
  });

  it('keeps Claude diagnostics when Codex fallback returns an empty rewrite', async () => {
    const sendSync = vi.mocked(engineSendMessageSync);
    sendSync
      .mockRejectedValueOnce(new Error('Claude exited with status: exit status: 1'))
      .mockResolvedValueOnce({
        engine: 'codex',
        text: '   ',
      });

    const { result } = renderPromptEnhancer();

    act(() => {
      result.current.handleEnhancePrompt();
    });

    await waitFor(() => {
      expect(result.current.isEnhancing).toBe(false);
      expect(result.current.canUseEnhancedPrompt).toBe(false);
    });

    expect(result.current.enhancedPrompt).toContain('Claude: Claude exited with status');
    expect(result.current.enhancedPrompt).toContain(
      'Fallback: Codex returned an empty prompt enhancement',
    );
    expect(sendSync).toHaveBeenCalledTimes(2);
  });
});
