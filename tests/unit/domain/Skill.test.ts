/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { jest } from '@jest/globals';

import { Result } from '../../../src/domain/Result.js';
import { Skill } from '../../../src/domain/Skill.js';
import { ISkillConfig, ISkillContext } from '../../../src/domain/SkillConfig.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('Skill', () => {
  let mockLogger: any;
  let mockClarificationHandler: jest.Mock<(question: string) => Promise<string>>;
  let mockCommandRunner: jest.Mock<(command: string, args?: string[]) => Promise<string>>;
  let mockDriverRegistry: any;
  let mockFileSystem: any;
  let context: ISkillContext;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      ask: jest.fn(),
      status: jest.fn(),
      emit: jest.fn(),
    };
    mockClarificationHandler = jest.fn<(question: string) => Promise<string>>();
    mockCommandRunner = jest.fn<(command: string, args?: string[]) => Promise<string>>();
    mockDriverRegistry = {
      get: jest.fn(),
    };
    mockFileSystem = {};

    context = {
      taskId: 'test-task',
      logger: mockLogger,
      clarificationHandler: mockClarificationHandler,
      commandRunner: mockCommandRunner,
      driverRegistry: mockDriverRegistry,
      fileSystem: mockFileSystem,
      workspaceRoot: '/test',
      validators: [],
    };
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      const config: ISkillConfig = {
        name: 'test-skill',
        description: 'test description',
      };
      const skill = new Skill(config);
      expect(skill.name).toBe('test-skill');
      expect(skill.description).toBe('test description');
    });

    it('should throw if config is missing name', () => {
      const config = { description: 'test' } as unknown as ISkillConfig;
      expect(() => new Skill(config)).toThrow();
    });
  });

  describe('getEnvironmentSpec', () => {
    it('should return default environment spec', () => {
      const config: ISkillConfig = { name: 'test', description: 'desc' };
      const skill = new Skill(config);
      const spec = skill.getEnvironmentSpec();
      expect(spec.dependencies).toEqual([]);
      expect(spec.worktree_setup).toEqual([]);
      expect(spec.hydration).toEqual([]);
      expect(spec.sparse_checkout).toEqual([]);
    });

    it('should return provided environment spec', () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        dependencies: ['dep1'],
        worktree_setup: ['setup1'],
        hydration: ['hyd1'],
        sparse_checkout: ['sparse1'],
      };
      const skill = new Skill(config);
      const spec = skill.getEnvironmentSpec();
      expect(spec.dependencies).toEqual(['dep1']);
      expect(spec.worktree_setup).toEqual(['setup1']);
      expect(spec.hydration).toEqual(['hyd1']);
      expect(spec.sparse_checkout).toEqual(['sparse1']);
    });
  });

  describe('execute', () => {
    it('should execute standard 5-step pipeline successfully', async () => {
      const config: ISkillConfig = {
        name: 'test-skill',
        description: 'desc',
        execution: { provider: 'test-driver' },
      };
      const skill = new Skill(config);

      const mockDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('executed')),
      };
      mockDriverRegistry.get.mockReturnValue(mockDriver);

      const result = await skill.execute(context);

      expect(result.isOk()).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith('info', expect.stringContaining('Starting execution'), {
        taskId: 'test-task',
      });
      expect(mockDriver.execute).toHaveBeenCalledWith(config.execution, context);
    });

    describe('Step 1: Pre-Analysis', () => {
      it('should run pre-analysis commands', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          pre_analysis_commands: ['cmd1 arg1', 'cmd2'],
          execution: { provider: 'test-driver' },
        };
        const skill = new Skill(config);
        mockDriverRegistry.get.mockReturnValue({
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
        });

        await skill.execute(context);

        expect(mockCommandRunner).toHaveBeenCalledWith('cmd1', ['arg1']);
        expect(mockCommandRunner).toHaveBeenCalledWith('cmd2', []);
      });

      it('should fail if pre-analysis command fails', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          pre_analysis_commands: ['fail'],
        };
        const skill = new Skill(config);
        mockCommandRunner.mockRejectedValue(new Error('cmd failed'));

        const result = await skill.execute(context);

        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe('cmd failed');
      });

      it('should handled non-Error failure in pre-analysis', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          pre_analysis_commands: ['fail'],
        };
        const skill = new Skill(config);
        mockCommandRunner.mockRejectedValue('string error');

        const result = await skill.execute(context);

        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toContain('string error');
      });
    });

    describe('Step 2: Analysis', () => {
      it('should run analysis if enabled', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          analysis_enabled: true,
          analysis: { provider: 'analysis-driver' },
          execution: { provider: 'exe-driver' },
        };
        const skill = new Skill(config);

        const mockAnalysisDriver = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('analyzed')),
        };
        const mockExeDriver = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('executed')),
        };

        mockDriverRegistry.get.mockReturnValueOnce(mockAnalysisDriver).mockReturnValueOnce(mockExeDriver);

        await skill.execute(context);

        expect(mockAnalysisDriver.execute).toHaveBeenCalledWith(config.analysis, context);
        expect(mockExeDriver.execute).toHaveBeenCalled();
      });

      it('should handle clarification signal during analysis', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          analysis_enabled: true,
          analysis: { provider: 'analysis-driver' },
          execution: { provider: 'exe-driver' },
        };
        const skill = new Skill(config);

        const clarificationSignal = Signal.clarificationNeeded(['What is the meaning of life?']);
        const mockAnalysisDriver = {
          execute: jest
            .fn<() => Promise<Result<string, Error>>>()
            .mockResolvedValueOnce(Result.fail(clarificationSignal))
            .mockResolvedValueOnce(Result.ok('analyzed')),
        };
        const mockExeDriver = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('executed')),
        };

        mockDriverRegistry.get
          .mockReturnValueOnce(mockAnalysisDriver)
          .mockReturnValueOnce(mockAnalysisDriver)
          .mockReturnValueOnce(mockExeDriver);

        mockClarificationHandler.mockResolvedValue('42');

        await skill.execute(context);

        expect(mockClarificationHandler).toHaveBeenCalledWith('What is the meaning of life?');
        expect(context['previous_clarification']).toBe('42');
        expect(mockAnalysisDriver.execute).toHaveBeenCalledTimes(2);
        expect(mockExeDriver.execute).toHaveBeenCalled();
      });

      it('should fail if analysis returns real error', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          analysis_enabled: true,
          analysis: { provider: 'analysis-driver' },
        };
        const skill = new Skill(config);

        mockDriverRegistry.get.mockReturnValue({
          execute: jest
            .fn<() => Promise<Result<string, Error>>>()
            .mockResolvedValue(Result.fail(new Error('analysis failed'))),
        });

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe('analysis failed');
      });

      it('should use signal reason if questions metadata missing', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          analysis_enabled: true,
          analysis: { provider: 'analysis-driver' },
          execution: { provider: 'exe-driver' },
        };
        const skill = new Skill(config);

        // Manually construct signal without questions metadata
        const signal = new Signal(SignalType.CLARIFICATION_NEEDED, 'Manual Question');

        const mockAnalysisDriver = {
          execute: jest
            .fn<() => Promise<Result<string, Error>>>()
            .mockResolvedValueOnce(Result.fail(signal))
            .mockResolvedValueOnce(Result.ok('analyzed')),
        };
        const mockExeDriver = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('executed')),
        };

        mockDriverRegistry.get
          .mockReturnValueOnce(mockAnalysisDriver)
          .mockReturnValueOnce(mockAnalysisDriver)
          .mockReturnValueOnce(mockExeDriver);

        mockClarificationHandler.mockResolvedValue('Answer');

        await skill.execute(context);

        expect(mockClarificationHandler).toHaveBeenCalledWith('Manual Question');
      });
    });

    describe('Step 3: Execution', () => {
      it('should fail if execution driver is missing', async () => {
        const config: ISkillConfig = { name: 'test', description: 'desc' };
        const skill = new Skill(config);
        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe('Execution driver not configured');
      });

      it('should fail if driver provider not found', async () => {
        const config: ISkillConfig = { name: 'test', description: 'desc', execution: { provider: 'missing' } };
        const skill = new Skill(config);
        mockDriverRegistry.get.mockReturnValue(undefined);

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe("Driver provider 'missing' not found");
      });

      it('should skip analysis driver if config missing provider', async () => {
        // This hits line 156 directly for non-execution phase
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'exe' },
          analysis_enabled: true,
          analysis: {} as any, // Invalid config to trigger branch? Or just partial
        };
        // Actually if analysis_enabled is true but analysis config is missing provider, it should hit line 156
        // But SkillConfig validation might prevent this.
        // Let's force it via type casting or use a valid config that has 'analysis' property but no 'provider' if schema allows optional?
        // Schema likely requires provider.
        // Let's inspect runDriver usage. It's called for 'analysis' only if config.analysis_enabled && config.analysis.
        // So config.analysis MUST exist.
        // If config.analysis.provider is missing?

        const skill = new Skill({ ...config, analysis: { provider: '' } } as any);
        // If provider is empty string, it's falsey.

        mockDriverRegistry.get.mockReturnValue({
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('exe')),
        });

        const result = await skill.execute(context);
        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('validate', () => {
    it('should validate standard config', () => {
      const config: ISkillConfig = { name: 'test', description: 'desc' };
      const skill = new Skill(config);
      expect(() => skill.validate()).not.toThrow();
    });

    // Note: Constructor validates too, but public method allows re-validation if config was mutable (it's private though)
    // or just direct method access check.
  });

  describe('Skipped Phases', () => {
    it('should skip analysis if not enabled/configured', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        // analysis_enabled false by default
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('exe')),
      });

      const result = await skill.execute(context);
      expect(result.isOk()).toBe(true);
      // Analysis skipped silently
    });
  });

  describe('Step 4 & 5: Post-Execution & Verification', () => {
    it('should run post-execution commands', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        post_execution_commands: ['post-cmd'],
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      });

      await skill.execute(context);
      expect(mockCommandRunner).toHaveBeenCalledWith('post-cmd', []);
    });

    it('should retry if post-execution command fails', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        post_execution_commands: ['fail-cmd'],
        verification_strategy: { max_retries: 1 },
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      });

      mockCommandRunner.mockRejectedValueOnce(new Error('cmd failed')).mockResolvedValue('ok');

      const result = await skill.execute(context);
      expect(result.isOk()).toBe(true);
      expect(mockCommandRunner).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Post-execution command failed: cmd failed'),
      );
    });

    it('should run verification driver', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        verification: { provider: 'ver' },
      };
      const skill = new Skill(config);
      const mockExeDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      };
      const mockVerDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('verified')),
      };

      mockDriverRegistry.get.mockReturnValueOnce(mockExeDriver).mockReturnValueOnce(mockVerDriver);

      const result = await skill.execute(context);
      expect(result.isOk()).toBe(true);
      expect(mockVerDriver.execute).toHaveBeenCalled();
    });

    it('should run injected validators', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      });

      const mockValidator = jest.fn<() => Promise<Result<boolean, Error>>>().mockResolvedValue(Result.ok(true));
      context.validators.push(mockValidator);

      await skill.execute(context);
      expect(mockValidator).toHaveBeenCalledWith(context);
    });

    it('should retry if verification fails', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        verification: { provider: 'ver' },
        verification_strategy: { max_retries: 2 },
      };
      const skill = new Skill(config);
      const mockExeDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      };
      const mockVerDriver = {
        execute: jest
          .fn<() => Promise<Result<string, Error>>>()
          .mockResolvedValueOnce(Result.fail(new Error('ver failed')))
          .mockResolvedValueOnce(Result.ok('verified')),
      };

      mockDriverRegistry.get
        .mockReturnValueOnce(mockExeDriver) // Try 1: Exe
        .mockReturnValueOnce(mockVerDriver) // Try 1: Ver
        .mockReturnValueOnce(mockExeDriver) // Try 2: Exe
        .mockReturnValueOnce(mockVerDriver); // Try 2: Ver

      const result = await skill.execute(context);
      expect(result.isOk()).toBe(true);
      expect(mockExeDriver.execute).toHaveBeenCalledTimes(2);
      expect(mockVerDriver.execute).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('failed: Verification driver failed: ver failed. Retrying...'),
      );
    });

    it('should handle non-Error failure in post-execution command', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        post_execution_commands: ['fail-cmd'],
        verification_strategy: { max_retries: 0 },
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      });

      mockCommandRunner.mockRejectedValue('string error');

      const result = await skill.execute(context);
      expect(result.isFail()).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Post-execution command failed: string error'),
      );
    });

    it('should handle unknown error in validator failure', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        verification_strategy: { max_retries: 0 },
      };
      const skill = new Skill(config);
      mockDriverRegistry.get.mockReturnValue({
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      });
      // Mock validator returning a fail without an error (or with null message)
      const mockValidator = jest
        .fn<() => Promise<Result<boolean, Error>>>()
        .mockResolvedValue(Result.fail(null as any));
      context.validators.push(mockValidator);

      const result = await skill.execute(context);
      expect(result.isFail()).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith('warn', expect.stringContaining('Validator failed: Unknown error'));
    });

    it('should handle unknown error in verification driver failure', async () => {
      const config: ISkillConfig = {
        name: 'test',
        description: 'desc',
        execution: { provider: 'exe' },
        verification: { provider: 'ver' },
        verification_strategy: { max_retries: 0 },
      };
      const skill = new Skill(config);
      const mockExeDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('ok')),
      };
      const mockVerDriver = {
        execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.fail(null as any)),
      };
      mockDriverRegistry.get.mockReturnValueOnce(mockExeDriver).mockReturnValueOnce(mockVerDriver);

      const result = await skill.execute(context);
      expect(result.isFail()).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Verification driver failed: Unknown error'),
      );
    });
  });
});
