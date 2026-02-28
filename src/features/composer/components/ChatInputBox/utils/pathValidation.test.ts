import { describe, expect, it } from 'vitest';
import { validateFilePath } from './pathValidation';

describe('validateFilePath', () => {
  describe('valid paths', () => {
    it('accepts a simple relative path', () => {
      expect(validateFilePath('src/index.ts')).toBe('src/index.ts');
    });

    it('accepts an absolute Unix path', () => {
      expect(validateFilePath('/home/user/project/file.ts')).toBe('/home/user/project/file.ts');
    });

    it('accepts a Windows-style path', () => {
      const winPath = 'C:\\Users\\user\\project\\file.ts';
      expect(validateFilePath(winPath)).toBe(winPath);
    });

    it('accepts a path with dots in filenames', () => {
      expect(validateFilePath('src/my.component.test.tsx')).toBe('src/my.component.test.tsx');
    });

    it('accepts a path starting with ./ (current directory)', () => {
      expect(validateFilePath('./src/file.ts')).toBe('./src/file.ts');
    });
  });

  describe('empty and whitespace paths', () => {
    it('returns null for empty string', () => {
      expect(validateFilePath('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(validateFilePath('   ')).toBeNull();
    });

    it('returns null for tab-only string', () => {
      expect(validateFilePath('\t')).toBeNull();
    });
  });

  describe('path traversal rejection', () => {
    it('rejects path containing /../', () => {
      expect(validateFilePath('/home/user/../etc/passwd')).toBeNull();
    });

    it('rejects path starting with ../', () => {
      expect(validateFilePath('../secret/file.txt')).toBeNull();
    });

    it('rejects path ending with /..', () => {
      expect(validateFilePath('/home/user/..')).toBeNull();
    });

    it('rejects Windows path traversal (backslash converted to forward slash)', () => {
      expect(validateFilePath('C:\\Users\\..\\..\\etc\\passwd')).toBeNull();
    });
  });

  describe('sensitive path rejection', () => {
    it('rejects /etc/passwd', () => {
      expect(validateFilePath('/etc/passwd')).toBeNull();
    });

    it('rejects /etc/shadow', () => {
      expect(validateFilePath('/etc/shadow')).toBeNull();
    });

    it('rejects paths containing /proc/', () => {
      expect(validateFilePath('/proc/self/environ')).toBeNull();
    });

    it('rejects paths containing /sys/', () => {
      expect(validateFilePath('/sys/kernel/version')).toBeNull();
    });

    it('rejects paths containing /.ssh/', () => {
      expect(validateFilePath('/home/user/.ssh/id_rsa')).toBeNull();
    });

    it('rejects paths containing /.env', () => {
      expect(validateFilePath('/app/.env')).toBeNull();
    });

    it('rejects paths containing /.aws/', () => {
      expect(validateFilePath('/home/user/.aws/credentials')).toBeNull();
    });

    it('rejects paths containing /.gnupg/', () => {
      expect(validateFilePath('/home/user/.gnupg/secring.gpg')).toBeNull();
    });

    it('rejects sensitive paths case-insensitively', () => {
      expect(validateFilePath('/ETC/PASSWD')).toBeNull();
      expect(validateFilePath('/home/user/.SSH/id_rsa')).toBeNull();
    });
  });

  describe('trimming behavior', () => {
    it('trims leading and trailing whitespace before validation', () => {
      expect(validateFilePath('  src/file.ts  ')).toBe('src/file.ts');
    });

    it('returns the trimmed original path (not normalized)', () => {
      const winPath = '  C:\\Users\\file.ts  ';
      // validateFilePath returns trimmed but keeps original separators
      expect(validateFilePath(winPath)).toBe('C:\\Users\\file.ts');
    });
  });
});
