import { describe, expect, it } from 'vitest';

import { CODEX_MODELS } from './types';

describe('CODEX_MODELS', () => {
  it('matches the current Codex built-in model list', () => {
    expect(CODEX_MODELS.map(model => model.id)).toEqual([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
      'gpt-5.3-codex-spark',
      'gpt-5.2',
    ]);
    expect(CODEX_MODELS.some(model => model.id === 'gpt-5.3')).toBe(false);
    expect(CODEX_MODELS.some(model => model.id === 'gpt-5.2-codex')).toBe(false);
  });
});
