import { Architecture } from '../../../src/domain/Architecture.js';

describe('Architecture', () => {
  it('should store raw markdown', () => {
    const validMarkdown = '# Architecture\nSome content';
    const arch = Architecture.fromMarkdown(validMarkdown);
    expect(arch.content).toBe(validMarkdown);
    expect(arch.toString()).toBe(validMarkdown);
  });

  it('should handle empty string', () => {
    const arch = Architecture.fromMarkdown('');
    expect(arch.content).toBe('');
  });
});
