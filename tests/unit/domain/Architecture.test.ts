import { Architecture } from '../../../src/domain/Architecture.js';

describe('Architecture', () => {
  const validMarkdown = `
## 1. Solution Overview
Overview content

## 2. Proposed File Structure
Structure content

## 3. Key Components & Contracts
Components content

## 4. Implementation Details
Details content
`;

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
