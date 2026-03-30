import { jest } from '@jest/globals';

import type { ArchitectAgent as ArchitectAgentType } from '../../../src/agents/ArchitectAgent.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { IFileSystem } from '../../../src/domain/IFileSystem.js';
import { IProject, ProjectProfile } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Skill } from '../../../src/domain/Skill.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { FileSystemBus, IBusMessage } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { SignalType } from '../../../src/workflow/Signal.js';

// Mock ShellService
const mockShellExecute = jest.fn<(cmd: string, args: string[]) => Promise<{ stdout: string }>>();
const MockShellService = jest.fn(() => ({
  execute: mockShellExecute,
}));

jest.unstable_mockModule('../../../src/services/ShellService.js', () => ({
  ShellService: MockShellService,
}));

// Mock uuid
jest.unstable_mockModule('uuid', () => ({
  v4: (): string => 'test-uuid',
}));

// Dynamic import after mocks
const { ArchitectAgent } = await import('../../../src/agents/ArchitectAgent.js');

describe('ArchitectAgent', () => {
  let agent: ArchitectAgentType;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockEvolution: jest.Mocked<IEvolutionService>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockBus: jest.Mocked<FileSystemBus>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;

  interface IMockSkill extends Partial<Skill> {
    name: string;
    description: string;
    execute: jest.Mock<(context: ISkillContext) => Promise<Result<string, Error>>>;
  }

  let mockSkill: IMockSkill;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHost = {
      log: jest.fn<IRuntimeHost['log']>(),
      status: jest.fn<IRuntimeHost['status']>(),
      ask: jest.fn<IRuntimeHost['ask']>(),
      emit: jest.fn<IRuntimeHost['emit']>(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockProject = {
      getConstraints: jest.fn<IProject['getConstraints']>().mockResolvedValue('constraints'),
      paths: {
        architectureCurrent: 'arch_current',
        personas: 'personas_path',
        signals: 'signals_dir',
      },
      getConfig: jest.fn<IProject['getConfig']>().mockResolvedValue({
        project_name: 'Test Project',
      } as unknown as ProjectProfile),
      rootDirectory: '/root',
      fileSystem: {
        exists: jest.fn<IFileSystem['exists']>().mockResolvedValue(true),
        isDirectory: jest.fn<IFileSystem['isDirectory']>().mockResolvedValue(true),
        listFiles: jest.fn<IFileSystem['listFiles']>().mockResolvedValue([]),
        readFile: jest.fn<IFileSystem['readFile']>().mockResolvedValue('content'),
      } as unknown as jest.Mocked<IFileSystem>,
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      saveArchitecture: jest.fn<IWorkspace['saveArchitecture']>(),
      getArchitecture: jest.fn<IWorkspace['getArchitecture']>().mockResolvedValue(Architecture.fromMarkdown('arch')),
      loadPlan: jest.fn<IWorkspace['loadPlan']>(),
      savePlan: jest.fn<IWorkspace['savePlan']>(),
      archiveArtifacts: jest.fn<IWorkspace['archiveArtifacts']>(),
      detectSignal: jest.fn<IWorkspace['detectSignal']>(),
      clearSignals: jest.fn<IWorkspace['clearSignals']>(),
      saveState: jest.fn<IWorkspace['saveState']>(),
      loadState: jest.fn<IWorkspace['loadState']>(),
      flush: jest.fn<IWorkspace['flush']>(),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      name: 'architect',
      description: 'architect desc',
      execute: jest.fn<(ctx: ISkillContext) => Promise<Result<string, Error>>>(),
    };

    mockSkillRegistry = {
      getSkill: jest.fn<ISkillRegistry['getSkill']>().mockImplementation((name: string) => {
        if (name === 'architect') return mockSkill as unknown as Skill;
        return undefined;
      }),
      getSkills: jest.fn<ISkillRegistry['getSkills']>().mockReturnValue([]),
      init: jest.fn<ISkillRegistry['init']>(),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {
      get: jest.fn<DriverRegistry['get']>(),
      register: jest.fn<DriverRegistry['register']>(),
    } as unknown as jest.Mocked<DriverRegistry>;

    mockEvolution = {
      retrieve: jest.fn<IEvolutionService['retrieve']>().mockResolvedValue('evolution'),
      recordEvent: jest.fn<IEvolutionService['recordEvent']>(),
    } as unknown as jest.Mocked<IEvolutionService>;

    mockBus = {
      watchInbox: jest.fn<FileSystemBus['watchInbox']>(),
      sendResponse: jest.fn<FileSystemBus['sendResponse']>(),
      sendRequest: jest.fn<FileSystemBus['sendRequest']>(),
      stop: jest.fn<FileSystemBus['stop']>(),
      waitForResponse: jest.fn<FileSystemBus['waitForResponse']>(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      render: jest.fn<IPromptEngine['render']>(),
      renderString: jest.fn<IPromptEngine['renderString']>(),
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
      const validYaml = 'architecture: valid';
      mockSkill.execute.mockResolvedValue(Result.ok(validYaml));

      await agent.design('Test request');

      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('architect');
      expect(mockSkill.execute).toHaveBeenCalled();
      expect(mockWorkspace.saveArchitecture).toHaveBeenCalled();
    });

    it('should throw if skill is not found', async () => {
      mockSkillRegistry.getSkill.mockReturnValue(undefined);
      await expect(agent.design('req')).rejects.toThrow(/Skill 'architect' not found/);
    });

    it('should handle skill execution failure', async () => {
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Skill failed')));
      await expect(agent.design('req')).rejects.toThrow('Skill failed');
    });

    it('should use clarificationHandler in design', async () => {
      mockSkill.execute.mockImplementation(async (context) => {
        if (context.clarificationHandler) {
          const answer = await context.clarificationHandler('Why?');
          return Result.ok(`answer: ${answer}`);
        }
        return Result.ok('ok');
      });

      mockHost.ask.mockResolvedValue('Because');

      const result = await agent.design('Test');
      expect(mockHost.ask).toHaveBeenCalledWith('Why?');
      expect(result).toBeDefined();
    });

    it('should use commandRunner in design', async () => {
      mockSkill.execute.mockImplementation(async (context) => {
        if (context.commandRunner) {
          const stdout = await context.commandRunner('ls', ['-la']);
          return Result.ok(`files: ${stdout}`);
        }
        return Result.ok('ok');
      });

      mockShellExecute.mockResolvedValue({ stdout: 'file1' });

      await agent.design('Test');
      expect(mockShellExecute).toHaveBeenCalledWith('ls', ['-la']);
    });
  });

  describe('runOracleMode', () => {
    it('should start watching inbox', () => {
      const promise = agent.runOracleMode();
      expect(mockBus.watchInbox).toHaveBeenCalled();
      // We don't await because it hangs forever per implementation
      expect(promise).toBeInstanceOf(Promise);
    });

    describe('handleInboxMessage', () => {
      let messageHandler: (msg: IBusMessage) => Promise<void>;

      beforeEach(() => {
        void agent.runOracleMode();
        messageHandler = mockBus.watchInbox.mock.calls[0][0] as (msg: IBusMessage) => Promise<void>;
      });

      it('should handle CLARIFICATION_NEEDED signal', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: {
              questions: ['Q1'],
            },
          },
        };

        mockHost.ask.mockResolvedValue('A1');

        await messageHandler(msg);

        expect(mockHost.ask).toHaveBeenCalledWith('Q1');
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: 'A1' },
        });
      });

      it('should handle CLARIFICATION_NEEDED with autonomous answer from feedback skill', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            metadata: {
              questions: ['Q1'],
            },
          },
        };

        const mockFeedbackSkill = {
          execute: jest.fn<Skill['execute']>().mockResolvedValue(
            Result.ok(
              JSON.stringify({
                action: 'ANSWER',
                response: 'Auto A1',
              }),
            ),
          ),
        };

        mockSkillRegistry.getSkill.mockImplementation((name: string) => {
          if (name === 'architect') return mockSkill as unknown as Skill;
          if (name === 'feedback') return mockFeedbackSkill as unknown as Skill;
          return undefined;
        });

        await messageHandler(msg);

        expect(mockFeedbackSkill.execute).toHaveBeenCalled();
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: 'Auto A1' },
        });
      });

      it('should fallback to simple message if questions metadata is missing', async () => {
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
      });

      it('should fallback to non-interactive mode answer if user cannot be asked', async () => {
        const agentNonInteractive = new ArchitectAgent(
          mockProject,
          mockWorkspace,
          mockSkillRegistry,
          mockDriverRegistry,
          mockEvolution,
          mockHost,
          mockBus,
          mockPromptEngine,
        );
        void agentNonInteractive.runOracleMode('non_interactive');
        const handler = mockBus.watchInbox.mock.calls[1][0] as (msg: IBusMessage) => Promise<void>;

        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q1',
          },
        };

        await handler(msg);

        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: expect.stringContaining('cannot answer this in non-interactive mode') as unknown as string },
        });
      });

      it('should ignore invalid signal payload', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          payload: 'invalid', // Not an object
        };

        await messageHandler(msg);
        expect(mockHost.log).not.toHaveBeenCalledWith('error', expect.anything());
      });

      it('should warn on unknown signal status', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          payload: {
            status: 'UNKNOWN_TYPE',
          },
        };

        await messageHandler(msg);
        expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Unknown message type'));
      });

      it('should log error if feedback skill response is invalid JSON', async () => {
        const msg: IBusMessage = {
          id: 'msg1',
          source: 'planner',
          correlationId: 'corr1',
          payload: {
            status: SignalType.CLARIFICATION_NEEDED,
            reason: 'Q1',
          },
        };

        const mockFeedbackSkill = {
          execute: jest.fn<Skill['execute']>().mockResolvedValue(Result.ok('invalid json')),
        };

        mockSkillRegistry.getSkill.mockImplementation((name: string) => {
          if (name === 'architect') return mockSkill as unknown as Skill;
          if (name === 'feedback') return mockFeedbackSkill as unknown as Skill;
          return undefined;
        });

        // Fallback will use host.ask
        mockHost.ask.mockResolvedValue('A1');

        await messageHandler(msg);

        expect(mockHost.log).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Failed to parse feedback skill response'),
        );
        expect(mockBus.sendResponse).toHaveBeenCalledWith('corr1', {
          answers: { Q1: 'A1' },
        });
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
    });
  });
});
