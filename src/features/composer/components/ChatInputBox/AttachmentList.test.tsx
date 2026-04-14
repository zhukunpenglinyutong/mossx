// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentList } from './AttachmentList';

const mockedApi = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mockedApi.convertFileSrc,
}));

describe('AttachmentList', () => {
  afterEach(() => {
    cleanup();
    mockedApi.convertFileSrc.mockClear();
  });

  it('uses convertFileSrc for UNC image paths on Windows', () => {
    render(
      <AttachmentList
        attachments={[
          {
            id: 'att-1',
            fileName: 'shot.png',
            mediaType: 'image/png',
            data: '\\\\server\\share\\shot.png',
          },
        ]}
      />,
    );

    expect(mockedApi.convertFileSrc).toHaveBeenCalledWith('\\\\server\\share\\shot.png');
    expect(screen.getByAltText('shot.png').getAttribute('src')).toBe(
      'asset://\\\\server\\share\\shot.png',
    );
  });
});
