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
      getSkill: jest.fn().mockReturnValue(mockSkill),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
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
      const mockArch = { data: {} } as Architecture;
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
            type: SignalType.CLARIFICATION_NEEDED,
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
            type: SignalType.CLARIFICATION_NEEDED,
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
            type: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q',
          },
        };

        mockHost.ask.mockResolvedValue('A');
        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalled();
        expect(mockBus.sendResponse).not.toHaveBeenCalled();
      });

      it('should handle non-string answers in inbox handler', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            type: SignalType.CLARIFICATION_NEEDED,
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
            type: 'UNKNOWN_TYPE',
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
            type: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q',
          },
        };

        mockHost.ask.mockRejectedValue(new Error('Input failed'));

        await messageHandler(msg);

        expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to handle inbox message'));
      });
    });
  });
});
