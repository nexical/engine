/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { AICLIDriver } from '../../../../src/drivers/base/AICLIDriver.js';
import { ISkillContext } from '../../../../src/domain/SkillConfig.js';
import path from 'path';

class TestAICLIDriver extends AICLIDriver {
  name = 'test-ai-cli';
  description = 'Test driver';

  protected getExecutable(skill: any): string {
    return 'echo';
  }
  protected getArguments(skill: any): string[] {
    return ['arg'];
  }
}

describe('AICLIDriver', () => {
  let driver: TestAICLIDriver;
  let mockHost: any;
  let mockFileSystem: any;
  let mockConfig: any;
  let mockContext: ISkillContext;
  let mockPromptEngine: any;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
    };
    mockFileSystem = {
      readFile: jest.fn(),
    };
    mockConfig = {
      rootDirectory: '/test',
    };
    mockPromptEngine = {
      renderString: jest.fn((tmpl: string) => tmpl),
    };
    mockContext = {
      taskId: 'task-123',
      userPrompt: 'do something',
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {},
    } as unknown as ISkillContext;

    driver = new TestAICLIDriver(mockHost, mockConfig, mockFileSystem);
    // Mock executeShell to avoid actual execution
    (driver as any).executeShell = jest.fn<() => Promise<string>>().mockResolvedValue('success');
  });

  it('should use default allowed signals if not provided', async () => {
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    // Check formatArgs passed to renderString
    const calls = mockPromptEngine.renderString.mock.calls;
    const args = calls[0][1] as Record<string, string>;

    expect(args.allowed_signals).toBeDefined();
    expect(args.allowed_signals).toContain('- "COMPLETE": Task completed successfully.');
    expect(args.allowed_signals).toContain('- "REARCHITECT": Fundamental architectural flaws detected');
  });

  it('should use provided allowed signals map', async () => {
    mockContext.params = {
      allowed_signals: {
        DONE: 'Finished.',
        BROKEN: 'It burst.'
      }
    };
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    const calls = mockPromptEngine.renderString.mock.calls;
    const args = calls[0][1] as Record<string, string>;
    expect(args.allowed_signals).toContain('- "DONE": Finished.');
    expect(args.allowed_signals).toContain('- "BROKEN": It burst.');
  });

  it('should attempt to read template from file system', async () => {
    mockFileSystem.readFile.mockResolvedValue('TEMPLATE CONTENT {{ allowed_signals }}');
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(expect.stringContaining('.ai/templates/cli_footer.md'));

    const calls = mockPromptEngine.renderString.mock.calls;
    const promptTemplate = calls[0][0];
    expect(promptTemplate).toContain('TEMPLATE CONTENT');
  });

  it('should fallback to default footer if file read fails', async () => {
    mockFileSystem.readFile.mockRejectedValue(new Error('File not found'));
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Could not load cli_footer.md'));

    const calls = mockPromptEngine.renderString.mock.calls;
    const promptTemplate = calls[0][0];
    expect(promptTemplate).toContain('# SYSTEM INSTRUCTION: MANDATORY');
    expect(promptTemplate).toContain('You have the following signals available to you:');
    expect(promptTemplate).toContain('"status": "SIGNAL_NAME"');
  });
});
