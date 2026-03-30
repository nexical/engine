import { jest } from '@jest/globals';

import { ISkill } from '../../../../src/domain/Driver.js';
import { IFileSystem } from '../../../../src/domain/IFileSystem.js';
import { IRuntimeHost } from '../../../../src/domain/RuntimeHost.js';
import { ISkillContext } from '../../../../src/domain/SkillConfig.js';
import { AICLIDriver } from '../../../../src/drivers/base/AICLIDriver.js';
import { IPromptEngine } from '../../../../src/services/PromptEngine.js';

class TestAICLIDriver extends AICLIDriver {
  public override name = 'test-ai-cli';
  public override description = 'Test driver';

  protected override getExecutable(_skill: ISkill): string {
    return 'echo';
  }
  protected override getArguments(_skill: ISkill): string[] {
    return ['arg'];
  }
}

describe('AICLIDriver', () => {
  let driver: TestAICLIDriver;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockConfig: Record<string, unknown>;
  let mockContext: ISkillContext;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    mockFileSystem = {
      readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue(''),
      exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(false),
      isDirectory: jest.fn<IFileSystem['isDirectory']>().mockResolvedValue(false),
      deleteFile: jest.fn<IFileSystem['deleteFile']>().mockResolvedValue(undefined),
      writeFile: jest.fn<IFileSystem['writeFile']>().mockResolvedValue(undefined),
      listFiles: jest.fn<IFileSystem['listFiles']>().mockResolvedValue([]),
    } as unknown as jest.Mocked<IFileSystem>;

    mockConfig = {
      rootDirectory: '/test',
    };
    mockPromptEngine = {
      render: jest.fn<IPromptEngine['render']>().mockImplementation((name: string) => name),
      renderString: jest.fn<IPromptEngine['renderString']>().mockImplementation((tmpl: string) => tmpl),
    } as unknown as jest.Mocked<IPromptEngine>;

    mockContext = {
      taskId: 'task-123',
      userPrompt: 'do something',
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {},
    } as unknown as ISkillContext;

    driver = new TestAICLIDriver(mockHost, mockConfig, mockFileSystem);
    // Mock executeShell to avoid actual execution
    (driver as unknown as { executeShell: jest.Mock<() => Promise<string>> }).executeShell = jest
      .fn<() => Promise<string>>()
      .mockResolvedValue('success');
  });

  it('should use default allowed signals if not provided', async () => {
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    // Check formatArgs passed to renderString
    const calls = mockPromptEngine.renderString.mock.calls;
    const args = calls[0][1];
    const allowedSignals = args.allowed_signals as string;

    expect(allowedSignals).toBeDefined();
    expect(allowedSignals).toContain('- "COMPLETE": Task completed successfully.');
    expect(allowedSignals).toContain('- "REARCHITECT": Fundamental architectural flaws detected');
  });

  it('should use provided allowed signals map', async () => {
    mockContext.params = {
      allowed_signals: {
        DONE: 'Finished.',
        BROKEN: 'It burst.',
      },
    };
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    const calls = mockPromptEngine.renderString.mock.calls;
    const args = calls[0][1];
    const allowedSignals = args.allowed_signals as string;

    expect(allowedSignals).toContain('- "DONE": Finished.');
    expect(allowedSignals).toContain('- "BROKEN": It burst.');
  });

  it('should attempt to read template from file system', async () => {
    mockFileSystem.readFile.mockResolvedValue('TEMPLATE CONTENT {{ allowed_signals }}');
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(expect.stringContaining('.ai/templates/cli_footer.md'));

    const calls = mockPromptEngine.renderString.mock.calls;
    const promptTemplate = calls[0][0];
    expect(promptTemplate).toContain('TEMPLATE CONTENT');
  });

  it('should fallback to default footer if file read fails', async () => {
    mockFileSystem.exists.mockResolvedValue(false); // prompt file missing
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));

    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

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
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    const args = mockPromptEngine.renderString.mock.calls[0][1];
    const allowedSignals = args.allowed_signals as string;
    expect(allowedSignals).toContain('- "CUSTOM": Custom signal');
  });

  it('should fallback and log warning if allowed_signals JSON is invalid', async () => {
    mockContext.params = {
      allowed_signals: '{ invalid json',
    };
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    expect(mockHost.log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('allowed_signals param is not a valid JSON map'),
    );
    const args = mockPromptEngine.renderString.mock.calls[0][1];
    const allowedSignals = args.allowed_signals as string;
    expect(allowedSignals).toContain('- "COMPLETE": Task completed successfully.');
  });

  it('should handle missing prompt_template and context props', async () => {
    // missing prompt_template, missing taskId, missing userPrompt, missing workspaceRoot
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));
    const emptyContext = {
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      params: {
        allowed_signals: {},
      },
    } as unknown as ISkillContext;

    await driver.run({ name: 'test', description: 'test', prompt_template: '' } as ISkill, emptyContext);

    const calls = mockPromptEngine.renderString.mock.calls;
    // renderString(promptTemplate, formatArgs)
    const formatArgs = calls[0][1];

    expect(formatArgs.user_request).toBe('');
    expect(formatArgs.task_id).toBe('unknown');
    // Check renderString calls
    const renderStringCalls = mockPromptEngine.renderString.mock.calls;
    expect(renderStringCalls.some((call) => call[0].includes('# SYSTEM INSTRUCTION: MANDATORY'))).toBe(true);
  });

  it('should use systemConfig root if workspaceRoot is missing', async () => {
    mockFileSystem.readFile.mockRejectedValue(new Error('no footer'));

    // context without workspaceRoot
    const minimalContext = {
      promptEngine: mockPromptEngine,
      fileSystem: mockFileSystem,
      taskId: 'test-task',
      params: {
        allowed_signals: {},
      },
    } as unknown as ISkillContext;

    await driver.run({ name: 'test', description: 'test', prompt_template: '' } as ISkill, minimalContext);

    const calls = mockPromptEngine.renderString.mock.calls;
    const formatArgs = calls[0][1];
    expect(formatArgs.signal_file_path as string).toContain('/test/.ai/signals'); // from mockConfig.rootDirectory
  });

  it('should handle allowed_signals not being string or object', async () => {
    const invalidSignals = 123 as unknown as Record<string, string>;
    mockContext.params = {
      allowed_signals: invalidSignals,
    };
    await driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, mockContext);

    const args = mockPromptEngine.renderString.mock.calls[0][1];
    const allowedSignals = args.allowed_signals as string;
    expect(allowedSignals).toContain('- "COMPLETE": Task completed successfully.');
  });

  it('should throw if PromptEngine is missing', async () => {
    const contextNoEngine = { ...mockContext, promptEngine: undefined as unknown as IPromptEngine };
    await expect(
      driver.run({ name: 'test', description: 'test', prompt_template: 'Hello' } as ISkill, contextNoEngine),
    ).rejects.toThrow('PromptEngine is required');
  });

  it('should test parseSchema', () => {
    const result = (driver as unknown as { parseSchema: (s: unknown) => { success: boolean } }).parseSchema({
      name: 'test',
      description: 'test',
      prompt_template: 'tmpl',
    });
    expect(result.success).toBe(true);
  });

  it('should test isSupported default', async () => {
    const supported = await driver.isSupported();
    expect(supported).toBe(false);
  });
});
