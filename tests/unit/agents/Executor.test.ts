import { jest } from '@jest/globals';

const mockExecSync = jest.fn<(command: string, options?: { cwd?: string }) => string>();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

import type { Executor } from '../../../src/agents/Executor.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { Task } from '../../../src/domain/Task.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { GitService } from '../../../src/services/GitService.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { Signal } from '../../../src/workflow/Signal.js';
import { Result } from '../../../src/domain/Result.js';

// Dynamic import for Executor class to ensure mock works
const { Executor: ExecutorClass } = await import('../../../src/agents/Executor.js');

describe('Executor', () => {
  let agent: Executor;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRegistry: jest.Mocked<ISkillRegistry>;
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockGit: jest.Mocked<GitService>;
  let mockBus: jest.Mocked<FileSystemBus>;
  let mockPromptEngine: jest.Mocked<IPromptEngine>;
  let mockSkill: any;
  let state: EngineState;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync.mockReset();

    mockProject = {
      paths: { root: '/tmp', signals: '/tmp/signals' },
      getConfig: jest.fn().mockReturnValue({}),
      getConstraints: jest.fn().mockReturnValue('constraints'),
      rootDirectory: '/tmp',
      fileSystem: { writeFile: jest.fn() },
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      loadPlan: jest.fn(),
      detectSignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      execute: jest.fn(),
      getEnvironmentSpec: jest.fn().mockReturnValue({}),
    };

    mockSkillRegistry = {
      getSkill: jest.fn().mockReturnValue(mockSkill),
    } as unknown as jest.Mocked<ISkillRegistry>;

    mockDriverRegistry = {} as unknown as jest.Mocked<DriverRegistry>;

    mockHost = {
      log: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;

    mockGit = {
      add: jest.fn(),
      commit: jest.fn(),
      worktreeAdd: jest.fn(),
      worktreeRemove: jest.fn(),
      worktreePrune: jest.fn(),
      merge: jest.fn(),
      getCurrentBranch: jest.fn().mockReturnValue('main'),
      deleteBranch: jest.fn(),
      cleanStaleWorktrees: jest.fn(),
      sparseCheckoutInit: jest.fn(),
      sparseCheckoutSet: jest.fn(),
      submoduleInit: jest.fn(),
      submoduleUpdate: jest.fn(),
      mergeBase: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    mockBus = {
      sendRequest: jest.fn(),
      waitForResponse: jest.fn(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      renderString: jest.fn(),
    } as unknown as jest.Mocked<IPromptEngine>;


    state = new EngineState('test-session');
    state.initialize('prompt');

    agent = new ExecutorClass(
      mockProject,
      mockWorkspace,
      mockSkillRegistry,
      mockDriverRegistry,
      mockHost,
      mockGit,
      mockBus,
      mockPromptEngine
    );
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('execute', () => {
    it('should execute tasks in the plan sequentially (via parallel logic with 1 task in layer)', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [new Task('1', 'task 1', 'msg', 'test-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'), 'task/1', 'main');
      expect(mockSkillRegistry.getSkill).toHaveBeenCalledWith('test-skill');
      expect(mockSkill.execute).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalled();
      expect(mockGit.merge).toHaveBeenCalledWith('task/1');
    });

    it('should execute parallel tasks using worktrees', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg1', 'skill1'),
        new Task('2', 'task 2', 'msg2', 'skill2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      expect(mockGit.worktreeAdd).toHaveBeenCalledTimes(2);
      expect(mockSkill.execute).toHaveBeenCalledTimes(2);
      expect(mockGit.merge).toHaveBeenCalledWith('task/1');
      expect(mockGit.merge).toHaveBeenCalledWith('task/2');
      expect(mockGit.worktreeRemove).toHaveBeenCalledTimes(2);
    });

    it('should handle parallel task failure', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg1', 'skill1'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Task 1 failed')));

      await expect(agent.execute(state)).rejects.toThrow('Task 1 failed');
      expect(state.tasks.failed).toContain('1');
      expect(mockGit.merge).not.toHaveBeenCalled();
      expect(mockGit.worktreeRemove).toHaveBeenCalled();
    });

    it('should throw if git is missing for parallel execution', async () => {
      const agentNoGit = new ExecutorClass(
        mockProject, mockWorkspace, mockSkillRegistry, mockDriverRegistry, mockHost,
        undefined as unknown as GitService, mockBus, mockPromptEngine
      );

      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await expect(agentNoGit.execute(state)).rejects.toThrow('Git is required');
    });

    it('should run worktree setup commands', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ worktree_setup: ['echo setup'] });
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      expect(mockExecSync).toHaveBeenCalledWith(
        'echo setup',
        expect.objectContaining({ cwd: expect.stringContaining('.worktrees/1') })
      );
    });

    it('should update submodules if enabled in config', async () => {
      (mockProject.getConfig as jest.Mock).mockReturnValue({ git: { submodules: true } });
      const mockPlan = new Plan('test plan', [new Task('1', 'task 1', 'desc 1', 'test-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);
      expect(mockGit.submoduleUpdate).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'));
    });

    it('should throw SignalDetectedError if signal is detected after task', async () => {
      const plan = new Plan('signal plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));
      mockWorkspace.detectSignal.mockResolvedValue({ type: 'STOP', reason: 'test', metadata: {} } as unknown as Signal);

      await expect(agent.execute(state)).rejects.toThrow('Signal detected in task 1: STOP');
    });

    it('should catch validation/merge failure', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));
      mockGit.merge.mockImplementation(() => {
        throw new Error('merge conflict');
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
    });
  });
});
