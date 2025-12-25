/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { jest } from '@jest/globals';

const mockExecSync = jest.fn<(command: string, options?: { cwd?: string }) => string>();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

import type { Executor } from '../../../src/agents/Executor.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { Result } from '../../../src/domain/Result.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { ISkillContext } from '../../../src/domain/SkillConfig.js';
import { EngineState } from '../../../src/domain/State.js';
import { Task } from '../../../src/domain/Task.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { FileSystemBus } from '../../../src/services/FileSystemBus.js';
import { GitService } from '../../../src/services/GitService.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { Signal } from '../../../src/workflow/Signal.js';

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
  let mockSkill: {
    execute: jest.Mock<(...args: any[]) => Promise<Result<string, Error>>>;
    getEnvironmentSpec: jest.Mock;
  };
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
      mockPromptEngine,
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
      const plan = new Plan('test plan', [new Task('1', 'task 1', 'msg1', 'skill1')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkill.execute.mockResolvedValue(Result.fail(new Error('Task 1 failed')));

      await agent.execute(state).catch(() => {});
      expect(state.tasks.failed).toContain('1');
      expect(mockGit.merge).not.toHaveBeenCalled();
      expect(mockGit.worktreeRemove).toHaveBeenCalled();
    });

    it('should throw if git is missing for parallel execution', async () => {
      const agentNoGit = new ExecutorClass(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        undefined as unknown as GitService,
        mockBus,
        mockPromptEngine,
      );

      const mockPlan = new Plan('test plan', [new Task('1', 'task 1', 'desc 1', 'skill 1')]);
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
        expect.objectContaining({ cwd: expect.stringContaining('.worktrees/1') }),
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

    it('should initialize sparse checkout if specified in skill', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ sparse_checkout: ['src'] });
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      expect(mockGit.sparseCheckoutInit).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'));
      expect(mockGit.sparseCheckoutSet).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'), ['src']);
    });

    it('should hydrate workspace if specified in skill', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ hydration: ['config.json'] });
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      // mkdir -p is called first
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('mkdir -p'));
      // cp is called
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('cp -r'));
    });

    it('should throw SignalDetectedError if signal is detected after task', async () => {
      const plan = new Plan('signal plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));
      mockWorkspace.detectSignal.mockResolvedValue({ type: 'STOP', reason: 'test', metadata: {} } as unknown as Signal);

      await expect(agent.execute(state)).rejects.toThrow('Signal detected in task 1: STOP');
    });

    it('should skip execution if all tasks are completed', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      state.tasks.completed.push('1');

      await agent.execute(state);

      expect(mockHost.log).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('All tasks in plan are already completed'),
      );
      expect(mockGit.worktreeAdd).not.toHaveBeenCalled();
    });

    it('should skip empty layers', async () => {
      // Create a plan where layer 1 is done but layer 2 is needed
      const task1 = new Task('1', 'task1', 'desc', 'skill');
      const task2 = new Task('2', 'task2', 'desc', 'skill');
      task2.dependencies = ['1']; // Forces task2 to be in layer 2

      const plan = new Plan('plan', [task1, task2]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      // Mark task 1 as done
      state.tasks.completed.push('1');

      await agent.execute(state);

      // Should skip layer 1 and execute layer 2
      expect(mockGit.worktreeAdd).toHaveBeenCalledTimes(1);
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(
        expect.stringContaining('2'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should throw if skill not found for task', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'unknown-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRegistry.getSkill.mockReturnValue(undefined); // Missing skill

      await expect(agent.execute(state)).rejects.toThrow("Skill 'unknown-skill' not found");
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

    it('should provide working context handlers (commandRunner and clarificationHandler)', async () => {
      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        capturedContext = context;
        return Result.ok('success');
      });
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({});

      await agent.execute(state);

      expect(capturedContext).toBeDefined();

      // commandRunner
      mockExecSync.mockReturnValue('output');
      const out = await capturedContext!.commandRunner('echo', ['hello']);
      expect(mockExecSync).toHaveBeenCalledWith(
        'echo hello',
        expect.objectContaining({ cwd: expect.stringContaining('.worktrees/1') }),
      );
      expect(out).toBe('output');

      // Default args
      await capturedContext!.commandRunner('ls');
      expect(mockExecSync).toHaveBeenCalledWith('ls ', expect.anything());

      // clarificationHandler
      const q = 'Question?';
      mockBus.waitForResponse.mockResolvedValue({
        id: 'res',
        source: 'test',
        payload: { answers: { [q]: 'Answer' } },
      });

      const ans = await capturedContext!.clarificationHandler(q);
      expect(mockBus.sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'task-1',
          type: 'request',
        }),
      );
      expect(ans).toBe('Answer');

      // Missing answer
      mockBus.waitForResponse.mockResolvedValue({
        id: 'res2',
        source: 'test',
        payload: { answers: {} },
      });
      const empty = await capturedContext!.clarificationHandler('Other?');
      expect(empty).toBe('');
    });
  });

  describe('cleanup handling', () => {
    it('should handle constructor stale cleanup failure gracefully', async () => {
      // We need to re-instantiate with a throwing git mock
      const throwingGit = {
        ...mockGit,
        cleanStaleWorktrees: jest.fn().mockImplementation(() => {
          throw new Error('Cleanup failed');
        }),
      } as unknown as jest.Mocked<GitService>;

      const agentWithError = new ExecutorClass(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        throwingGit,
        mockBus,
        mockPromptEngine,
      );
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to clean stale worktrees'));
    });

    it('should handle cleanup failures gracefully', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      mockGit.worktreeRemove.mockImplementation(() => {
        throw new Error('Remove failed');
      });
      mockGit.worktreePrune.mockImplementation(() => {
        throw new Error('Prune failed');
      });

      await agent.execute(state);

      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to prune worktrees'));
    });

    it('should handle non-Error exceptions in constructor cleanup', () => {
      const throwingGit = {
        ...mockGit,
        cleanStaleWorktrees: jest.fn().mockImplementation(() => {
          throw new Error('agent error');
        }),
      } as unknown as jest.Mocked<GitService>;

      new ExecutorClass(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        throwingGit,
        mockBus,
        mockPromptEngine,
      );

      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to clean stale worktrees: agent error'),
      );
    });

    it('should handle non-Error exceptions in task failure', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.fail(new Error('fail')));
      // Mock execute to throw non-error
      mockSkill.execute.mockReturnValue(Promise.reject('string fail'));

      await expect(agent.execute(state)).rejects.toEqual('string fail');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Task 1 failed: string fail'));
    });

    it('should handle non-Error exceptions in prune failure', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      mockGit.worktreePrune.mockImplementation(() => {
        throw 'string prune fail';
      });

      await agent.execute(state);

      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to prune worktrees: string prune fail'),
      );
    });
  });

  describe('prompt fallback', () => {
    it('should fall back to userPrompt if task description and message are missing', async () => {
      const state = new EngineState('session');
      // Task with empty desc and message
      const task = new Task('1', '', '', 'skill');
      const plan = new Plan('plan', [task]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      state.user_prompt = 'Global Prompt';

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        capturedContext = context;
        return Result.ok('success');
      });

      await agent.execute(state);

      expect(capturedContext!.userPrompt).toBe('Global Prompt');
    });

    it('should use task message if description is missing', async () => {
      const state = new EngineState('session');
      const task = new Task('1', '', 'Task Message', 'skill');
      const plan = new Plan('plan', [task]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (context: ISkillContext) => {
        capturedContext = context;
        return Result.ok('success');
      });

      await agent.execute(state);

      expect(capturedContext!.userPrompt).toBe('Task Message');
    });

    it('should handle non-Error exceptions in merge failure', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));
      mockGit.merge.mockImplementation(() => {
        throw 'string merge fail';
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Merge failed for task 1 from branch task/1: string merge fail'),
      );
    });

    it('should handle non-Error exceptions in worktree cleanup loop', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      // Mock remove to throw string
      mockGit.worktreeRemove.mockImplementation(() => {
        throw 'string remove fail';
      });

      await agent.execute(state);

      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('string remove fail'));
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
    });
  });
});
