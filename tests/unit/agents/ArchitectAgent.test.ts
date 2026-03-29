/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { jest } from '@jest/globals';

import { Architecture } from '../../../src/domain/Architecture.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { FileSystemBus, IBusMessage } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { SignalType } from '../../../src/workflow/Signal.js';

// Mock ShellService
const mockShellExecute = jest.fn<(...args: any[]) => Promise<any>>();
const MockShellService = jest.fn(() => ({
  execute: mockShellExecute,
}));

jest.unstable_mockModule('../../../src/services/ShellService.js', () => ({
  ShellService: MockShellService,
}));

// Dynamic import
const { ArchitectAgent } = await import('../../../src/agents/ArchitectAgent.js');

describe('ArchitectAgent', () => {
  let agent: any; // Using any for private internals access in tests
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBus: jest.Mocked<FileSystemBus>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockSkill: { execute: jest.Mock<(...args: any[]) => Promise<Result<string, Error>>> };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHost = {
      log: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockProject = {
      getConstraints: jest.fn().mockReturnValue('constraints'),
      paths: {
        architecturePrompt: 'arch_prompt',
        architectureCurrent: 'arch_current',
        personas: 'personas_path',
      },
      getConfig: jest.fn().mockReturnValue({}),
      rootDirectory: '/root',
      fileSystem: {},
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      saveArchitecture: jest.fn(),
      getArchitecture: jest.fn(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      execute: jest.fn(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn((name: string) => {
        if (name === 'architect') return mockSkill;
        return undefined;
      }),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
      retrieve: jest.fn(),
      getLogSummary: jest.fn(),
    } as unknown as jest.Mocked<IEvolutionService>;

    mockBus = {
      watchInbox: jest.fn(),
      sendResponse: jest.fn(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      renderString: jest.fn(),
    } as unknown as jest.Mocked<IPromptEngine>;

    agent = new ArchitectAgent(
      mockProject,
      mockWorkspace,
      mockSkillRegistry,
      mockDriverRegistry,
      mockEvolution,
      mockHost,
      mockBus,
      mockPromptEngine,
    );
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('design', () => {
    it('should execute design process successfully', async () => {
      const mockArch = { data: {} } as unknown as Architecture;
      const validYaml = 'architecture: valid';

      mockSkill.execute.mockResolvedValue(Result.ok(validYaml));
      mockWorkspace.getArchitecture.mockResolvedValue(mockArch);

      await agent.design('Test request');

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('architect');
      expect(mockSkill.execute).toHaveBeenCalled();
    });

    it('should throw if skill execution fails', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));
      await expect(agent.design('req')).rejects.toThrow('Skill failed');
    });

    it('should throw if skill is not found', async () => {
      mockSkillRegistry.getSkill.mockReturnValue(undefined);
      await expect(agent.design('req')).rejects.toThrow(/Skill 'architect' not found/);
    });

    it('should provide working context handlers', async () => {
      // We hijack the skill execution to access the context passed to it
      let capturedContext: any;
      mockSkill.execute.mockImplementation(async (context: any) => {
        capturedContext = context;
        return Result.ok('architecture: true');
      });
      mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);

      await agent.design('req');

      expect(capturedContext).toBeDefined();

      // Test clarificationHandler
      mockHost.ask.mockResolvedValue('answer');
      const ans = await capturedContext.clarificationHandler('question?');
      expect(mockHost.ask).toHaveBeenCalledWith('question?');
      expect(ans).toBe('answer');

      // Test commandRunner
      mockShellExecute.mockResolvedValue({ stdout: 'output' });
      const out = await capturedContext.commandRunner('echo', ['hello']);
      expect(mockShellExecute).toHaveBeenCalledWith('echo', ['hello']);
      expect(out).toBe('output');

      await capturedContext.commandRunner('ls');
      expect(mockShellExecute).toHaveBeenCalledWith('ls', []);
    });

    it('should handle non-string answers in context clarification', async () => {
      let capturedContext: any;
      mockSkill.execute.mockImplementation(async (context: any) => {
        capturedContext = context;
        return Result.ok('ok');
      });
      mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);

      await agent.design('req');

      mockHost.ask.mockResolvedValue(123 as any); // number
      const ans = await capturedContext.clarificationHandler('q?');
      expect(ans).toBe('123');
    });
  });

  describe('runOracleMode', () => {
    it('should start watching inbox', () => {
      // verify it calls watchInbox
      agent.runOracleMode();
      // We don't await the promise because it's designed to hang forever

      expect(mockBus.watchInbox).toHaveBeenCalled();
    });

    describe('handleInboxMessage', () => {
      let messageHandler: (msg: IBusMessage) => Promise<void>;

      beforeEach(() => {
        agent.runOracleMode();
        // Capture the handler passed to watchInbox
        messageHandler = mockBus.watchInbox.mock.calls[0][0] as any;
      });

      it('should handle CLARIFICATION_NEEDED signal', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: {
              questions: ['Q1', 'Q2'],
            },
          },
        };

        mockHost.ask.mockResolvedValueOnce('A1').mockResolvedValueOnce('A2');

        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalledWith('Q1');
        expect(mockHost.ask).toHaveBeenCalledWith('Q2');
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: {
            Q1: 'A1',
            Q2: 'A2',
          },
        });
      });

      it('should handle CLARIFICATION_NEEDED with single reason if questions missing', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Why?',
          },
        };

        mockHost.ask.mockResolvedValue('Because');

        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalledWith('Why?');
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { 'Why?': 'Because' },
        });
      });

      it('should not send response if correlationId is missing', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q',
          },
        };

        mockHost.ask.mockResolvedValue('A');
        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalled();
        expect(mockBus.sendResponse).not.toHaveBeenCalled();
      });

      it('should handle autonomous answer from feedback skill', async () => {
        const mockFeedbackSkill = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(
            Result.ok(
              JSON.stringify({
                action: 'ANSWER',
                response: 'Autonomous Answer',
              }),
            ),
          ),
        };
        mockSkillRegistry.getSkill.mockReturnValue(mockFeedbackSkill as any);

        const msg = {
          id: 'msg-auto',
          source: 'executor',
          correlationId: 'corr-id-auto',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Question 1'] },
          },
        };

        await messageHandler(msg as any);

        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr-id-auto', {
          answers: { 'Question 1': 'Autonomous Answer' },
        });
      });

      it('should handle non-string answer from host.ask', async () => {
        mockSkillRegistry.getSkill.mockReturnValue(undefined);
        mockHost.ask.mockResolvedValue(42 as any);

        const msg = {
          id: 'msg-num',
          source: 'executor',
          correlationId: 'corr-id-num',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Numeric?'] },
          },
        };

        await messageHandler(msg as any);

        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr-id-num', {
          answers: { 'Numeric?': '42' },
        });
      });

      it('should handle non-interactive mode failure to answer', async () => {
        const nonInteractiveAgent = new ArchitectAgent(
          mockProject,
          mockWorkspace,
          mockSkillRegistry,
          mockDriverRegistry,
          mockEvolution,
          mockHost,
          mockBus,
          mockPromptEngine,
        );
        (nonInteractiveAgent as any).runOracleMode('non_interactive');
        const niHandler = mockBus.watchInbox.mock.calls[mockBus.watchInbox.mock.calls.length - 1][0] as any;

        mockSkillRegistry.getSkill.mockReturnValue(undefined);

        const msg = {
          id: 'msg-silent',
          source: 'executor',
          correlationId: 'corr-id-silent',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Silent?'] },
          },
        };

        await niHandler(msg as any);

        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr-id-silent', {
          answers: { 'Silent?': expect.stringContaining('I cannot answer this in non-interactive mode') },
        });
        expect(mockHost.log).toHaveBeenCalledWith(
          'warn',
          expect.stringContaining('Non-interactive mode: Failed to answer'),
        );
      });

      it('should handle non-string answers in inbox handler', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Count?',
          },
        };

        (mockHost.ask as any).mockResolvedValue('42');

        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalledWith('Count?');
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { 'Count?': '42' },
        });
      });

      it('should handle unknown signals with warning', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'test',
          payload: {
            status: 'UNKNOWN_TYPE',
          },
        };

        await messageHandler(msg);

        expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Unknown message type'));
      });

      it('should log errors during processing', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q',
          },
        };

        mockHost.ask.mockRejectedValue(new Error('Input failed'));

        await messageHandler(msg);

        expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to handle inbox message'));
      });

      it('should return early on invalid payload type', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'test',
          payload: 'not-an-object' as any,
        };

        await messageHandler(msg);

        // Should just return without logging warn/error for unknown type if payload isn't an object
        expect(mockHost.log).not.toHaveBeenCalledWith('warn', expect.stringContaining('Unknown message type'));
        expect(mockHost.log).not.toHaveBeenCalledWith('error', expect.any(String));
      });

      it('should use feedback skill for autonomous answering', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Q1'] },
          },
        };

        const mockFeedbackSkill = {
          execute: jest
            .fn<() => Promise<Result<string, Error>>>()
            .mockResolvedValue(Result.ok(JSON.stringify({ action: 'ANSWER', response: 'Auto-A1' }))),
          getEnvironmentSpec: jest.fn().mockReturnValue({}),
        };

        mockSkillRegistry.getSkill.mockImplementation((name) => {
          if (name === 'feedback') return mockFeedbackSkill as any;
          if (name === 'architect') return mockSkill as any;
          return undefined;
        });

        await messageHandler(msg);

        expect(mockFeedbackSkill.execute).toHaveBeenCalled();
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: 'Auto-A1' },
        });
        expect(mockHost.log).toHaveBeenCalledWith(
          'info',
          expect.stringContaining('Architect answered autonomously: Q1'),
        );
      });

      it('should handle feedback skill parse error', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Q1'] },
          },
        };

        const mockFeedbackSkill = {
          execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('invalid-json')),
          getEnvironmentSpec: jest.fn().mockReturnValue({}),
        };

        mockSkillRegistry.getSkill.mockImplementation((name) => {
          if (name === 'feedback') return mockFeedbackSkill as any;
          return undefined;
        });

        mockHost.ask.mockResolvedValue('Manual answer');

        await messageHandler(msg);

        expect(mockHost.log).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Failed to parse feedback skill response'),
        );
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: 'Manual answer' },
        });
      });

      it('should handle non-interactive mode failure to answer autonomously', async () => {
        // Redefine agent for non_interactive mode
        const nonInteractiveAgent = new ArchitectAgent(
          mockProject,
          mockWorkspace,
          mockSkillRegistry,
          mockDriverRegistry,
          mockEvolution,
          mockHost,
          mockBus,
          mockPromptEngine,
        );
        (nonInteractiveAgent as any).runOracleMode('non_interactive');
        const niHandler = mockBus.watchInbox.mock.calls[mockBus.watchInbox.mock.calls.length - 1][0] as any;

        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Q1'] },
          },
        };

        // No autonomous answer
        mockSkillRegistry.getSkill.mockReturnValue(undefined);

        await niHandler(msg);

        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: expect.stringContaining('I cannot answer this in non-interactive mode') },
        });
        expect(mockHost.log).toHaveBeenCalledWith(
          'warn',
          expect.stringContaining('Non-interactive mode: Failed to answer'),
        );
      });

      it('should handle payload as null', async () => {
        const msg: IBusMessage = {
          id: 'm1',
          source: 't',
          payload: null as any,
        };
        await messageHandler(msg);
        expect(mockHost.log).not.toHaveBeenCalledWith('warn', expect.stringContaining('Unknown message type'));
      });

      it('should cover String(error) in handleInboxMessage catch block', async () => {
        const msg: IBusMessage = {
          id: 'm1',
          source: 't',
          payload: { status: SignalType.CLARIFICATION_NEEDED, reason: 'Q' },
        };
        // Mock feedback skill retrieval to throw a string
        mockSkillRegistry.getSkill.mockImplementation(() => {
          throw 'string throw';
        });
        await messageHandler(msg);
        expect(mockHost.log).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Failed to handle inbox message: string throw'),
        );
      });

      it('should cover anonymous handlers in feedback skill context', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: { questions: ['Q1'] },
          },
        };

        let feedbackContext: any;
        const mockFeedbackSkill = {
          execute: jest.fn<(ctx: any) => Promise<Result<string, Error>>>().mockImplementation(async (ctx: any) => {
            feedbackContext = ctx;
            return Result.ok(JSON.stringify({ action: 'ANSWER', response: 'A1' }));
          }),
          getEnvironmentSpec: jest.fn().mockReturnValue({}),
        };

        mockSkillRegistry.getSkill.mockImplementation((name) => {
          if (name === 'feedback') return mockFeedbackSkill as any;
          return undefined;
        });

        await messageHandler(msg);

        // Call the anonymous handlers to cover them
        const ans = await feedbackContext.clarificationHandler();
        const out = await feedbackContext.commandRunner();
        expect(ans).toBe('');
        expect(out).toBe('');
      });
    });

    describe('design edge cases', () => {
      it('should handle project config fallbacks', async () => {
        mockProject.getConfig.mockReturnValue({ max_worktrees: 4 } as any); // Minimal valid config
        mockSkill.execute.mockResolvedValue(Result.ok('architecture: ok'));
        mockWorkspace.getArchitecture.mockResolvedValue({} as Architecture);

        await agent.design('req');

        const capturedParams = (mockSkill.execute.mock.calls[0][0] as any).params;
        expect(capturedParams.project_name).toBe('Nexical Project');
        expect(capturedParams.environment).toBe('development');
      });

      it('should handle skill.execute returning fail without error', async () => {
        mockSkill.execute.mockResolvedValue(Result.fail(undefined as any));
        await expect(agent.design('req')).rejects.toThrow('Skill execution failed');
      });
    });
  });
});
