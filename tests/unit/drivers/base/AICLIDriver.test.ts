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
      exists: jest.fn(),
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
        BROKEN: 'It burst.',
      },
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
    mockFileSystem.exists.mockReturnValue(false); // prompt file missing
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));
    mockPromptEngine.renderString.mockReturnValue('rendered');

    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Could not load cli_footer.md'));

    const calls = mockPromptEngine.renderString.mock.calls;
    const promptTemplate = calls[0][0];
    expect(promptTemplate).toContain('# SYSTEM INSTRUCTION: MANDATORY');
    expect(promptTemplate).toContain('You have the following signals available to you:');
    expect(promptTemplate).toContain('"status": "SIGNAL_NAME"');
    expect(promptTemplate).toContain('JSON Content Structure:');
  });

  it('should parse allowed_signals from JSON string', async () => {
    mockContext.params = {
      allowed_signals: JSON.stringify({ CUSTOM: 'Custom signal' }),
    };
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    const args = mockPromptEngine.renderString.mock.calls[0][1] as Record<string, string>;
    expect(args.allowed_signals).toContain('- "CUSTOM": Custom signal');
  });

  it('should fallback and log warning if allowed_signals JSON is invalid', async () => {
    mockContext.params = {
      allowed_signals: '{ invalid json',
    };
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    expect(mockHost.log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('allowed_signals param is not a valid JSON map'),
    );
    const args = mockPromptEngine.renderString.mock.calls[0][1] as Record<string, string>;
    expect(args.allowed_signals).toContain('- "COMPLETE": Task completed successfully.');
  });

  it('should handle missing prompt_template and context props', async () => {
    // missing prompt_template, missing taskId, missing userPrompt, missing workspaceRoot
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));
    const emptyContext = {
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {},
    } as any;

    await driver.run({ name: 'test' } as any, emptyContext);

    const calls = mockPromptEngine.renderString.mock.calls;
    // renderString(promptTemplate, formatArgs)
    const formatArgs = calls[0][1] as any;

    expect(formatArgs.user_request).toBe('');
    expect(formatArgs.task_id).toBe('unknown');
    // Check renderString calls
    const renderStringCalls = (mockPromptEngine.renderString as jest.Mock).mock.calls;
    expect(renderStringCalls.some((call) => (call[0] as string).includes('# SYSTEM INSTRUCTION: MANDATORY'))).toBe(
      true,
    );
  });

  it('should use systemConfig root if workspaceRoot is missing', async () => {
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));

    // context without workspaceRoot
    const minimalContext = {
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      taskId: 'test-task',
      params: {},
    };

    await driver.run({ name: 'test' } as any, minimalContext as any);

    const calls = (mockPromptEngine.renderString as jest.Mock).mock.calls;
    const formatArgs = calls[0][1] as any;
    expect(formatArgs.signal_file_path).toContain('/test/.ai/signals'); // from mockConfig.rootDirectory
  });

  it('should handle allowed_signals not being string or object', async () => {
    mockContext.params = {
      allowed_signals: 123, // number
    };
    await driver.run({ prompt_template: 'Hello' } as any, mockContext);

    const args = mockPromptEngine.renderString.mock.calls[0][1] as Record<string, string>;
    expect(args.allowed_signals).toContain('- "COMPLETE": Task completed successfully.');
  });

  it('should throw if PromptEngine is missing', async () => {
    (mockContext as any).promptEngine = undefined;
    await expect(driver.run({ prompt_template: 'Hello' } as any, mockContext)).rejects.toThrow(
      'PromptEngine is required',
    );
  });

  it('should test parseSchema', () => {
    const result = (driver as any).parseSchema({ name: 'test', prompt_template: 'tmpl' });
    expect(result.success).toBe(true);
  });

  it('should test isSupported default', async () => {
    const supported = await driver.isSupported();
    expect(supported).toBe(false);
  });
});
