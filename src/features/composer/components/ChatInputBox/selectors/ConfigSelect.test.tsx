// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfigSelect } from './ConfigSelect';

vi.mock('@lobehub/icons', () => ({
  Claude: { Color: () => <span data-testid="mock-claude-icon" /> },
  Gemini: { Color: () => <span data-testid="mock-gemini-icon" /> },
}));

vi.mock('../../../../../assets/model-icons/openai.svg', () => ({
  default: 'mock-openai-icon.svg',
}));

describe('ConfigSelect usage entry', () => {
  it('hides streaming and thinking toggles for codex while preserving them for claude', async () => {
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);

    await waitFor(() => {
      expect(container.querySelector('.selector-option-streaming-toggle')).toBeFalsy();
      expect(container.querySelector('.selector-option-thinking-toggle')).toBeFalsy();
    });

    rerender(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-streaming-toggle')).toBeTruthy();
      expect(container.querySelector('.selector-option-thinking-toggle')).toBeTruthy();
    });
  });

  it('hides the provider switch entry inside the config menu', async () => {
    const { container } = render(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
        providerVersions={{ claude: '2.1.81' }}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);

    await waitFor(() => {
      expect(container.textContent).not.toContain('Claude Code (2.1.81)');
    });
  });

  it('shows speed only for codex, while fork and review quick entries are visible for codex and claude', async () => {
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('.selector-option-speed')).toBeTruthy();
      expect(container.querySelector('.selector-option-fork-quick')).toBeTruthy();
      expect(container.querySelector('.selector-option-review-quick')).toBeTruthy();
    });

    rerender(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-speed')).toBeFalsy();
      expect(container.querySelector('.selector-option-fork-quick')).toBeTruthy();
      expect(container.querySelector('.selector-option-review-quick')).toBeTruthy();
    });

    rerender(
      <ConfigSelect
        currentProvider="gemini"
        onProviderChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-speed')).toBeFalsy();
      expect(container.querySelector('.selector-option-fork-quick')).toBeFalsy();
      expect(container.querySelector('.selector-option-review-quick')).toBeFalsy();
    });
  });

  it('triggers codex speed callback and updates selected state', async () => {
    const onCodexSpeedModeChange = vi.fn();
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        codexSpeedMode="standard"
        onCodexSpeedModeChange={onCodexSpeedModeChange}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const speedEntry = container.querySelector('.selector-option-speed');
    expect(speedEntry).toBeTruthy();

    fireEvent.mouseEnter(speedEntry as HTMLElement);
    const fastEntry = container.querySelector('.selector-option-speed-fast');
    expect(fastEntry).toBeTruthy();
    fireEvent.click(fastEntry as HTMLElement);
    expect(onCodexSpeedModeChange).toHaveBeenCalledWith('fast');

    rerender(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        codexSpeedMode="fast"
        onCodexSpeedModeChange={onCodexSpeedModeChange}
      />,
    );
    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    fireEvent.mouseEnter(container.querySelector('.selector-option-speed') as HTMLElement);
    await waitFor(() => {
      expect(
        container.querySelector('.selector-option-speed-fast .codicon-check'),
      ).toBeTruthy();
    });
  });

  it('triggers codex review quick callback', async () => {
    const onCodexReviewQuickStart = vi.fn();
    const { container } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        onCodexReviewQuickStart={onCodexReviewQuickStart}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const reviewEntry = container.querySelector('.selector-option-review-quick');
    expect(reviewEntry).toBeTruthy();
    fireEvent.click(reviewEntry as HTMLElement);
    expect(onCodexReviewQuickStart).toHaveBeenCalledTimes(1);
  });

  it('triggers fork quick callback for codex and claude providers', async () => {
    const onForkQuickStart = vi.fn();
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        onForkQuickStart={onForkQuickStart}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    fireEvent.click(container.querySelector('.selector-option-fork-quick') as HTMLElement);
    expect(onForkQuickStart).toHaveBeenCalledTimes(1);

    rerender(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
        onForkQuickStart={onForkQuickStart}
      />,
    );
    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    fireEvent.click(container.querySelector('.selector-option-fork-quick') as HTMLElement);
    expect(onForkQuickStart).toHaveBeenCalledTimes(2);
  });

  it('triggers review quick callback for claude provider', async () => {
    const onCodexReviewQuickStart = vi.fn();
    const { container } = render(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
        onCodexReviewQuickStart={onCodexReviewQuickStart}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const reviewEntry = container.querySelector('.selector-option-review-quick');
    expect(reviewEntry).toBeTruthy();
    fireEvent.click(reviewEntry as HTMLElement);
    expect(onCodexReviewQuickStart).toHaveBeenCalledTimes(1);
  });

  it('shows live usage entry only when provider is codex', async () => {
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelector('.selector-option-live-usage')).toBeTruthy();
    });

    rerender(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-live-usage')).toBeFalsy();
    });
  });

  it('triggers usage refresh callback from live usage entry', async () => {
    const onRefreshAccountRateLimits = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        onRefreshAccountRateLimits={onRefreshAccountRateLimits}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const usageEntry = container.querySelector('.selector-option-live-usage');
    expect(usageEntry).toBeTruthy();

    fireEvent.click(usageEntry as HTMLElement);
    await waitFor(() => {
      expect(onRefreshAccountRateLimits).toHaveBeenCalled();
    });
  });

  it('shows and toggles plan mode switch only for codex', async () => {
    const onSelectCollaborationMode = vi.fn();
    const { container, rerender } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        selectedCollaborationModeId="code"
        onSelectCollaborationMode={onSelectCollaborationMode}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const planModeRow = container.querySelector('.selector-option-plan-mode');
    expect(planModeRow).toBeTruthy();

    const planSwitch = container.querySelector('.selector-option-plan-mode .ant-switch');
    expect(planSwitch).toBeTruthy();
    fireEvent.click(planSwitch as HTMLElement);
    await waitFor(() => {
      expect(onSelectCollaborationMode).toHaveBeenCalledWith('plan');
    });

    rerender(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
        selectedCollaborationModeId="code"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-plan-mode')).toBeTruthy();
      expect(
        container.querySelector('.selector-option-plan-mode .ant-switch-disabled'),
      ).toBeTruthy();
    });

    rerender(
      <ConfigSelect
        currentProvider="claude"
        onProviderChange={() => {}}
        selectedCollaborationModeId="code"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.selector-option-plan-mode')).toBeFalsy();
    });
  });

  it('defaults plan mode switch to off when mode is unset', async () => {
    const { container } = render(
      <ConfigSelect
        currentProvider="codex"
        onProviderChange={() => {}}
      />,
    );

    fireEvent.click(container.querySelector('.config-button') as HTMLElement);
    const planSwitch = container.querySelector('.selector-option-plan-mode .ant-switch');
    expect(planSwitch).toBeTruthy();
    expect(planSwitch?.classList.contains('ant-switch-checked')).toBe(false);
  });
});
