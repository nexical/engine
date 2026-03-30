import { jest } from '@jest/globals';

import { IDriver } from '../../../src/domain/Driver.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Skill } from '../../../src/domain/Skill.js';
import { ISkillConfig, ISkillContext } from '../../../src/domain/SkillConfig.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { Signal } from '../../../src/workflow/Signal.js';

describe('Skill', () => {
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockClarificationHandler: jest.Mock<(question: string) => Promise<string>>;
  let mockCommandRunner: jest.Mock<(command: string, args?: string[]) => Promise<string>>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let context: ISkillContext;

  interface IMockDriver {
    execute: jest.Mock<(config: unknown, context: ISkillContext) => Promise<Result<string, Error>>>;
  }

  beforeEach(() => {
    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockEvolution = {
      retrieve: jest.fn<IEvolutionService['retrieve']>(),
      recordEvent: jest.fn<IEvolutionService['recordEvent']>(),
    } as unknown as jest.Mocked<IEvolutionService>;

    mockClarificationHandler = jest.fn<(question: string) => Promise<string>>();
    mockCommandRunner = jest.fn<(command: string, args?: string[]) => Promise<string>>();
    mockDriverRegistry = {
      get: jest.fn<DriverRegistry['get']>(),
    } as unknown as jest.Mocked<DriverRegistry>;
    mockFileSystem = {} as unknown as jest.Mocked<IFileSystem>;

    context = {
      taskId: 'test-task',
      logger: mockHost,
      clarificationHandler: mockClarificationHandler,
      commandRunner: mockCommandRunner,
      driverRegistry: mockDriverRegistry,
      fileSystem: mockFileSystem,
      evolution: mockEvolution,
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

  describe('validate', () => {
    it('should pass for valid config', () => {
      const skill = new Skill({ name: 'test', description: 'desc' });
      expect(() => skill.validate()).not.toThrow();
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
    });

    describe('execute', () => {
      it('should execute standard pipeline successfully', async () => {
        const config: ISkillConfig = {
          name: 'test-skill',
          description: 'desc',
          execution: { provider: 'test-driver' },
        };
        const skill = new Skill(config);

        const mockDriver: IMockDriver = {
          execute: jest.fn(),
        };
        mockDriver.execute.mockResolvedValue(Result.ok('executed'));
        mockDriverRegistry.get.mockReturnValue(mockDriver as unknown as IDriver<ISkillContext, string>);

        const result = await skill.execute(context);

        expect(result.isOk()).toBe(true);
        expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Starting execution'), {
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
          const mockDriver: IMockDriver = {
            execute: jest.fn(),
          };
          mockDriver.execute.mockResolvedValue(Result.ok('ok'));
          mockDriverRegistry.get.mockReturnValue(mockDriver as unknown as IDriver<ISkillContext, string>);

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

        it('should fail if pre-analysis command throws non-error', async () => {
          const config: ISkillConfig = {
            name: 'test',
            description: 'desc',
            pre_analysis_commands: ['fail'],
          };
          const skill = new Skill(config);
          mockCommandRunner.mockRejectedValue('string error');

          const result = await skill.execute(context);
          expect(result.isFail()).toBe(true);
          expect(result.error()?.message).toBe('Pre-analysis commands failed: string error');
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

          const mockAnalysisDriver: IMockDriver = {
            execute: jest.fn(),
          };
          mockAnalysisDriver.execute.mockResolvedValue(Result.ok('analyzed'));
          const mockExeDriver: IMockDriver = {
            execute: jest.fn(),
          };
          mockExeDriver.execute.mockResolvedValue(Result.ok('executed'));

          mockDriverRegistry.get
            .mockReturnValueOnce(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>)
            .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>);

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

          const clarificationSignal = Signal.clarificationNeeded(['Question?']);
          const mockAnalysisDriver: IMockDriver = {
            execute: jest.fn(),
          };
          mockAnalysisDriver.execute
            .mockResolvedValueOnce(Result.fail(clarificationSignal))
            .mockResolvedValueOnce(Result.ok('analyzed'));
          const mockExeDriver: IMockDriver = {
            execute: jest.fn(),
          };
          mockExeDriver.execute.mockResolvedValue(Result.ok('executed'));

          mockDriverRegistry.get
            .mockReturnValueOnce(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>)
            .mockReturnValueOnce(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>)
            .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>);

          mockClarificationHandler.mockResolvedValue('Answer');

          await skill.execute(context);

          expect(mockClarificationHandler).toHaveBeenCalledWith('Question?');
          expect(mockAnalysisDriver.execute).toHaveBeenCalledTimes(2);
        });

        it('should handle clarification loop with multiple questions', async () => {
          const config: ISkillConfig = {
            name: 'test',
            description: 'desc',
            analysis_enabled: true,
            analysis: { provider: 'analysis-driver' },
            execution: { provider: 'exe-driver' },
          };
          const skill = new Skill(config);

          const clarificationSignal = Signal.clarificationNeeded(['Q1', 'Q2']);
          const mockAnalysisDriver: IMockDriver = { execute: jest.fn() };
          mockAnalysisDriver.execute
            .mockResolvedValueOnce(Result.fail(clarificationSignal))
            .mockResolvedValueOnce(Result.ok('analyzed'));
          const mockExeDriver: IMockDriver = { execute: jest.fn() };
          mockExeDriver.execute.mockResolvedValue(Result.ok('executed'));

          mockDriverRegistry.get
            .mockReturnValueOnce(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>)
            .mockReturnValueOnce(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>)
            .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>);

          await skill.execute(context);

          expect(mockClarificationHandler).toHaveBeenCalledWith('Q1\nQ2');
        });

        it('should fail if analysis returns non-clarification error', async () => {
          const config: ISkillConfig = {
            name: 'test',
            description: 'desc',
            analysis_enabled: true,
            analysis: { provider: 'analysis-driver' },
          };
          const skill = new Skill(config);

          const mockAnalysisDriver: IMockDriver = { execute: jest.fn() };
          mockAnalysisDriver.execute.mockResolvedValue(Result.fail(new Error('Analysis failed')));
          mockDriverRegistry.get.mockReturnValue(mockAnalysisDriver as unknown as IDriver<ISkillContext, string>);

          const result = await skill.execute(context);
          expect(result.isFail()).toBe(true);
          expect(result.error()?.message).toBe('Analysis failed');
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
      });
    });

    describe('Post-Execution & Verification', () => {
      it('should retry if verification fails', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'exe' },
          verification: { provider: 'ver' },
          verification_strategy: { max_retries: 2 },
        };
        const skill = new Skill(config);
        const mockExeDriver: IMockDriver = {
          execute: jest.fn(),
        };
        mockExeDriver.execute.mockResolvedValue(Result.ok('ok'));
        const mockVerDriver: IMockDriver = {
          execute: jest.fn(),
        };
        mockVerDriver.execute
          .mockResolvedValueOnce(Result.fail(new Error('ver failed')))
          .mockResolvedValueOnce(Result.ok('verified'));

        mockDriverRegistry.get
          .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>)
          .mockReturnValueOnce(mockVerDriver as unknown as IDriver<ISkillContext, string>)
          .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>)
          .mockReturnValueOnce(mockVerDriver as unknown as IDriver<ISkillContext, string>);

        const result = await skill.execute(context);
        expect(result.isOk()).toBe(true);
        expect(mockExeDriver.execute).toHaveBeenCalledTimes(2);
        expect(mockVerDriver.execute).toHaveBeenCalledTimes(2);
      });

      it('should fail after max retries', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'exe' },
          verification_strategy: { max_retries: 1 },
        };
        const skill = new Skill(config);
        const mockExeDriver: IMockDriver = { execute: jest.fn() };
        mockExeDriver.execute.mockResolvedValue(Result.ok('ok'));

        mockDriverRegistry.get.mockReturnValue(mockExeDriver as unknown as IDriver<ISkillContext, string>);

        // Add a validator that always fails
        context.validators = [
          (): Promise<Result<boolean, Error>> => Promise.resolve(Result.fail(new Error('Validation failed'))),
        ];

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe('Skill failed after 1 attempts');
        expect(mockExeDriver.execute).toHaveBeenCalledTimes(2); // Initial (0) + 1 retry = 2
      });

      it('should fail if post-execution command fails', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'exe' },
          post_execution_commands: ['fail'],
          verification_strategy: { max_retries: 0 },
        };
        const skill = new Skill(config);
        const mockExeDriver: IMockDriver = { execute: jest.fn() };
        mockExeDriver.execute.mockResolvedValue(Result.ok('ok'));
        mockDriverRegistry.get.mockReturnValue(mockExeDriver as unknown as IDriver<ISkillContext, string>);

        mockCommandRunner.mockRejectedValue(new Error('Post fail'));

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe('Skill failed after 0 attempts');
      });

      it('should fail if verification driver fails', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'exe' },
          verification: { provider: 'ver' },
          verification_strategy: { max_retries: 0 },
        };
        const skill = new Skill(config);
        const mockExeDriver: IMockDriver = { execute: jest.fn() };
        mockExeDriver.execute.mockResolvedValue(Result.ok('ok'));
        const mockVerDriver: IMockDriver = { execute: jest.fn() };
        mockVerDriver.execute.mockResolvedValue(Result.fail(new Error('Ver fail')));

        mockDriverRegistry.get
          .mockReturnValueOnce(mockExeDriver as unknown as IDriver<ISkillContext, string>)
          .mockReturnValueOnce(mockVerDriver as unknown as IDriver<ISkillContext, string>);

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
      });

      it('should fail if driver provider is not found', async () => {
        const config: ISkillConfig = {
          name: 'test',
          description: 'desc',
          execution: { provider: 'missing' },
        };
        const skill = new Skill(config);
        mockDriverRegistry.get.mockReturnValue(undefined);

        const result = await skill.execute(context);
        expect(result.isFail()).toBe(true);
        expect(result.error()?.message).toBe("Driver provider 'missing' not found");
      });
    });
  });
});
