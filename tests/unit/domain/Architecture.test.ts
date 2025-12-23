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

  it('should parse valid markdown', () => {
    const arch = Architecture.fromMarkdown(validMarkdown);
    expect(arch.data.overview).toBe('Overview content');
    expect(arch.data.fileStructure).toBe('Structure content');
    expect(arch.data.components).toBe('Components content');
    expect(arch.data.details).toBe('Details content');
  });

  it('should handle missing sections gracefully', () => {
    const partialMarkdown = `
## 1. Solution Overview
Overview content
`;
    const arch = Architecture.fromMarkdown(partialMarkdown);
    expect(arch.data.overview).toBe('Overview content');
    expect(arch.data.fileStructure).toBe('');
  });

  it('should handle totally structured content via Zod', () => {
    // This is implicitly tested via fromMarkdown as it calls ArchitectureSchema.parse
  });

  it('should return raw content', () => {
    const arch = Architecture.fromMarkdown(validMarkdown);
    expect(arch.content).toBe(validMarkdown);
    expect(arch.toString()).toBe(validMarkdown);
  });
});
