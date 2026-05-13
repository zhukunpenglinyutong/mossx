// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue } from './MessageQueue';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MessageQueue', () => {
  afterEach(() => {
    cleanup();
  });

  it('truncates long queued content while preserving the full text in the tooltip', () => {
    const longMessage = '1234567890'.repeat(24);

    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-1',
            content: longMessage,
            queuedAt: Date.now(),
          },
        ]}
        onRemove={() => {}}
      />,
    );

    const previewNode = screen.getByTitle(longMessage);
    expect(previewNode.textContent).not.toBe(longMessage);
    expect(previewNode.textContent?.endsWith('…')).toBe(true);
    expect(previewNode.textContent?.length).toBe(120);
    expect(previewNode.getAttribute('aria-label')).toBe(longMessage);
  });

  it('keeps short queued content unchanged', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-2',
            content: 'short message',
            queuedAt: Date.now(),
          },
        ]}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByText('short message')).toBeTruthy();
  });

  it('renders fuse and delete actions and forwards callbacks', () => {
    const onFuse = vi.fn();
    const onRemove = vi.fn();

    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-3',
            content: 'merge this follow-up',
            queuedAt: Date.now(),
          },
        ]}
        onFuse={onFuse}
        onRemove={onRemove}
        canFuse={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'chat.fuseFromQueue' }));
    fireEvent.click(screen.getByRole('button', { name: 'chat.deleteQueuedMessage' }));

    expect(onFuse).toHaveBeenCalledWith('queued-3');
    expect(onRemove).toHaveBeenCalledWith('queued-3');
  });

  it('disables fuse action when runtime capability is unavailable', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-4',
            content: 'disabled fuse',
            queuedAt: Date.now(),
          },
        ]}
        onFuse={() => {}}
        onRemove={() => {}}
        canFuse={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'chat.fuseFromQueue' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('composer.queueStatusWaiting')).toBeTruthy();
  });

  it('disables fuse action for queued slash commands', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-4b',
            content: '/clear keep history clean',
            queuedAt: Date.now(),
          },
        ]}
        onFuse={() => {}}
        onRemove={() => {}}
        canFuse={true}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'chat.fuseFromQueue' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('composer.queueStatusCommand')).toBeTruthy();
  });

  it('disables fuse action for empty queued content', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-empty',
            content: '   ',
            queuedAt: Date.now(),
          },
        ]}
        onFuse={() => {}}
        onRemove={() => {}}
        canFuse={true}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'chat.fuseFromQueue' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('composer.queueStatusWaiting')).toBeTruthy();
  });

  it('shows fusing state and locks item actions while the message is being merged', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-5',
            content: 'currently fusing',
            queuedAt: Date.now(),
            isFusing: true,
          },
        ]}
        onFuse={() => {}}
        onRemove={() => {}}
        canFuse={true}
        fusingMessageId="queued-5"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'chat.fusingQueuedMessage' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'chat.deleteQueuedMessage' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('composer.queueStatusFusing')).toBeTruthy();
  });

  it('explains when a queued message can be fused into the active turn', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-6',
            content: 'ready to fuse',
            queuedAt: Date.now(),
          },
        ]}
        onFuse={() => {}}
        onRemove={() => {}}
        canFuse={true}
      />,
    );

    expect(screen.getByText('composer.queueStatusFuseReady')).toBeTruthy();
  });
});
