// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildComposerSendReadiness } from '../../utils/composerSendReadiness';
import { ComposerReadinessBar } from './ComposerReadinessBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ComposerReadinessBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders target and expandable context source action', () => {
    const onExpandContextSources = vi.fn();
    const readiness = buildComposerSendReadiness({
      engine: 'codex',
      providerLabel: 'Codex',
      modelLabel: 'gpt-5.5',
      modeLabel: 'Auto Mode',
      modeImpactLabel: 'Full access',
      draftText: 'continue',
      context: {
        selectedMemoryCount: 1,
        fileReferenceCount: 2,
        selectedAgentName: 'reviewer',
      },
    });

    const { container } = render(
      <ComposerReadinessBar
        readiness={readiness}
        onExpandContextSources={onExpandContextSources}
      />,
    );

    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('gpt-5.5')).toBeTruthy();
    expect(screen.getByText('Auto Mode')).toBeTruthy();
    expect(screen.getByText('Full access')).toBeTruthy();
    expect(
      screen.getByText(
        'composer.manualMemorySelection · composer.readinessContextFileReference · composer.readinessContextAgent',
      ),
    ).toBeTruthy();
    screen.getByRole('button', { name: 'composer.contextLedgerExpand' }).click();
    expect(onExpandContextSources).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.composer-readiness-icon svg')).toBeTruthy();
    expect(getComputedStyle(container.querySelector('.composer-readiness-icon')!).backgroundColor).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(container.querySelector('.composer-readiness-icon .codicon-circle-filled')).toBeNull();
    expect(screen.queryByText('composer.readinessActivity.idle')).toBeNull();
    expect(container.querySelector('[data-primary-action="send"]')).toBeTruthy();
  });

  it('keeps disabled reason in state without rendering the activity copy', () => {
    const readiness = buildComposerSendReadiness({
      engine: 'codex',
      providerLabel: 'Codex',
      modelLabel: 'gpt-5.5',
      draftText: 'continue',
      runtimeLifecycleState: 'recovering',
    });

    render(<ComposerReadinessBar readiness={readiness} />);

    expect(screen.queryByText('composer.readinessDisabled.runtime-recovering')).toBeNull();
    expect(screen.queryByText('composer.readinessActivity.blocked')).toBeNull();
  });

  it('hides empty context placeholder copy', () => {
    const readiness = buildComposerSendReadiness({
      engine: 'codex',
      providerLabel: 'Codex',
      modelLabel: 'gpt-5.5',
      draftText: 'continue',
    });

    render(<ComposerReadinessBar readiness={readiness} />);

    expect(screen.queryByText('composer.readinessContextEmpty')).toBeNull();
    expect(screen.queryByText('no-extra-context')).toBeNull();
  });

  it('renders request jump action only when a pending request blocks send', () => {
    const onJumpToRequest = vi.fn();
    const readiness = buildComposerSendReadiness({
      engine: 'codex',
      providerLabel: 'Codex',
      modelLabel: 'gpt-5.5',
      draftText: 'answer',
      requestUserInputState: 'pending',
    });

    render(
      <ComposerReadinessBar
        readiness={readiness}
        onJumpToRequest={onJumpToRequest}
      />,
    );

    screen.getByRole('button', { name: 'composer.readinessJumpToRequest' }).click();
    expect(onJumpToRequest).toHaveBeenCalledTimes(1);
  });
});
