import { jest } from '@jest/globals';

const mockExecSync = jest.fn<(command: string, options?: { cwd?: string }) => string>();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

import { DeveloperAgent } from '../../../src/agents/DeveloperAgent.js';
import { Plan } from '../../../src/domain/Plan.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';
import { Task } from '../../../src/domain/Task.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { GitService } from '../../../src/services/GitService.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';
import { Signal } from '../../../src/workflow/Signal.js';

describe('DeveloperAgent', () => {
  let agent: DeveloperAgent;
  let mockProject: jest.Mocked<IProject>;
  let mockWorkspace: jest.Mocked<IWorkspace>;
  let mockSkillRunner: jest.Mocked<ISkillRunner>;
  let mockHost: jest.Mocked<IRuntimeHost>;
  let mockGit: jest.Mocked<GitService>;
  let state: EngineState;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync.mockReset();

    mockProject = {
      paths: { root: '/tmp', signals: '/tmp/signals' },
      getConfig: jest.fn().mockReturnValue({}),
      getConstraints: jest.fn().mockReturnValue('constraints'),
    } as unknown as jest.Mocked<IProject>;
    mockWorkspace = {
      loadPlan: jest.fn(),
      detectSignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<IWorkspace>;
    mockSkillRunner = {
      runSkill: jest.fn(),
      getSkills: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<ISkillRunner>;
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

    state = new EngineState('test-session');
    state.initialize('prompt');

    agent = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, mockGit);
  });

  it('should be defined', () => {
    expect(agent).toBeDefined();
  });

  describe('execute', () => {
    it('should execute tasks in the plan sequentially', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [new Task('1', 'task 1', 'msg', 'test-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkillRunner.getSkills.mockReturnValue([{ name: 'test-skill', provider: 'test' }]);

      await agent.execute(state);

      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'), 'task/1', 'main');
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1' }),
        'msg',
        expect.stringContaining('.worktrees/1'),
      );
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

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill1', provider: 'test' },
        { name: 'skill2', provider: 'test' },
      ]);

      await agent.execute(state);

      // Should call worktree logic
      expect(mockGit.worktreeAdd).toHaveBeenCalledTimes(2);
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'), 'task/1', 'main');
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/2'), 'task/2', 'main');

      // Should run skills with worktree paths
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1' }),
        expect.anything(),
        expect.stringContaining('.worktrees/1'),
      );
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(
        expect.objectContaining({ id: '2' }),
        expect.anything(),
        expect.stringContaining('.worktrees/2'),
      );

      // Should copy .ai directory
      // implementation calls: execSync(`cp -r "${aiDir}" "${aiTarget}"`) -> 1 argument
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('cp -r'));

      // Should merge
      expect(mockGit.merge).toHaveBeenCalledWith('task/1');
      expect(mockGit.merge).toHaveBeenCalledWith('task/2');

      // Should cleanup
      expect(mockGit.worktreeRemove).toHaveBeenCalledTimes(2);
      expect(mockGit.worktreePrune).toHaveBeenCalledTimes(1);
    });

    it('should handle parallel task failure', async () => {
      const state = new EngineState('test-session');
      const plan = new Plan('test plan', [
        new Task('1', 'task 1', 'msg1', 'skill1'),
        new Task('2', 'task 2', 'msg2', 'skill2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill1', provider: 'test' },
        { name: 'skill2', provider: 'test' },
      ]);

      mockSkillRunner.runSkill.mockImplementation(async (task) => {
        if (task.id === '1') throw new Error('Task 1 failed');
        return Promise.resolve();
      });

      await expect(agent.execute(state)).rejects.toThrow('Task 1 failed');
      expect(state.tasks.failed).toContain('1');

      // Should NOT merge if failed (assuming fail-fast)
      expect(mockGit.merge).not.toHaveBeenCalled();
      // Should still cleanup (finally block)
      expect(mockGit.worktreeRemove).toHaveBeenCalled();
    });

    it('should throw if git is missing for parallel execution', async () => {
      const agentNoGit = new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, undefined);
      const mockPlan = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      await expect(agentNoGit.execute(state)).rejects.toThrow('Git is required');
    });

    it('should run worktree setup commands', async () => {
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill 1', worktree_setup: ['npm install'] }]);

      // It's a single task, so it runs SEQUENTIALLY by default in existing logic?
      // Wait, getExecutionLayers will return [[Task 1]]. Length=1.
      // My logic: if (tasks.length === 1) -> executeSequentialTask.
      // Sequential task DOES NOT USE WORKTREES.
      // So worktree_setup is ignored for sequential tasks?
      // The user request said: "Every sequential task uses the default branch... but when we have parallel tasks we create a git worktree".
      // So yes, worktrees are ONLY for parallel tasks.

      // Verification: Add a parallel task set to force worktree usage.
      const mockPlan2 = new Plan('test plan', [
        new Task('1', 'task 1', 'desc 1', 'skill 1'),
        new Task('2', 'task 2', 'desc 2', 'skill 2'),
      ]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan2);
      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill 1', worktree_setup: ['echo setup 1'] },
        { name: 'skill 2', worktree_setup: ['echo setup 2'] },
      ]);

      await agent.execute(state);

      expect(mockExecSync).toHaveBeenCalledWith(
        'echo setup 1',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ cwd: expect.stringContaining('.worktrees/1') }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'echo setup 2',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        expect.objectContaining({ cwd: expect.stringContaining('.worktrees/2') }),
      );
    });

    it('should update submodules if enabled in config', async () => {
      (mockProject.getConfig as jest.Mock).mockReturnValue({ git: { submodules: true } });
      const mockPlan = new Plan('test plan for submodules', [new Task('1', 'task 1', 'desc 1', 'test-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(mockPlan);

      mockSkillRunner.getSkills.mockReturnValue([{ name: 'test-skill', provider: 'test' }]);

      await agent.execute(state);
      expect(mockGit.submoduleUpdate).toHaveBeenCalledWith(expect.stringContaining('.worktrees/1'));
    });

    it('should log warning if cleanStaleWorktrees fails in constructor', () => {
      mockGit.cleanStaleWorktrees.mockImplementation(() => {
        throw new Error('clean failed');
      });
      new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, mockGit);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to clean stale worktrees: clean failed'),
      );
    });

    it('should return early if all tasks are already completed', async () => {
      const state = new EngineState('test-session');
      state.tasks.completed = ['1'];
      const plan = new Plan('test plan', [new Task('1', 'task 1', 'msg', 'test-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('info', 'All tasks in plan are already completed.');
      expect(mockGit.worktreeAdd).not.toHaveBeenCalled();
    });

    it('should handle sparse checkout if configured in skill', async () => {
      const plan = new Plan('sparse plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test', sparse_checkout: ['src/'] }]);

      await agent.execute(state);
      expect(mockGit.sparseCheckoutInit).toHaveBeenCalled();
      expect(mockGit.sparseCheckoutSet).toHaveBeenCalledWith(expect.any(String), ['src/']);
    });

    it('should handle hydration logic', async () => {
      const plan = new Plan('hydration plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test', hydration: ['data/'] }]);

      await agent.execute(state);
      // execSync is called for mkdir -p and cp -r
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('mkdir -p'));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('cp -r'));
    });

    it('should throw SignalDetectedError if signal is detected after task', async () => {
      const plan = new Plan('signal plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockWorkspace.detectSignal.mockResolvedValue({ type: 'STOP', reason: 'test', metadata: {} } as unknown as Signal);

      await expect(agent.execute(state)).rejects.toThrow('Signal detected in task 1: STOP');
    });

    it('should throw manual resolution error if merge fails (Error object)', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockGit.merge.mockImplementation(() => {
        throw new Error('merge conflict');
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
    });

    it('should throw manual resolution error if merge fails (string error)', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockGit.merge.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'merge conflict string';
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
    });

    it('should handle non-Error objects in cleanup and prune (strings)', async () => {
      const plan = new Plan('cleanup fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockGit.worktreeRemove.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'remove failed string';
      });
      mockGit.worktreePrune.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'prune failed string';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to prune worktrees: prune failed string'),
      );
    });

    it('should handle Error objects in cleanup and prune', async () => {
      const plan = new Plan('cleanup fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockGit.worktreeRemove.mockImplementation(() => {
        throw new Error('remove failed object');
      });
      mockGit.worktreePrune.mockImplementation(() => {
        throw new Error('prune failed object');
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to prune worktrees: prune failed object'),
      );
    });

    it('should cover checkSignals private method (signal detected)', async () => {
      mockWorkspace.detectSignal.mockResolvedValue({
        type: 'TERMINATE',
        reason: 'test',
        metadata: {},
      } as unknown as Signal);
      // Accessing private for coverage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await expect((agent as any).checkSignals('1')).rejects.toThrow('Signal detected in task 1: TERMINATE');
    });

    it('should cover checkSignals private method (no signal)', async () => {
      mockWorkspace.detectSignal.mockResolvedValue(null);
      // Accessing private for coverage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (agent as any).checkSignals('1');
      expect(mockHost.log).not.toHaveBeenCalledWith('info', expect.stringContaining('Signal detected after task'));
    });

    it('should handle non-Error in cleanStaleWorktrees in constructor (string)', () => {
      mockGit.cleanStaleWorktrees.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'constructor clean error string';
      });
      new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, mockGit);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to clean stale worktrees: constructor clean error string'),
      );
    });

    it('should handle Error object in cleanStaleWorktrees in constructor', () => {
      mockGit.cleanStaleWorktrees.mockImplementation(() => {
        throw new Error('constructor clean error object');
      });
      new DeveloperAgent(mockProject, mockWorkspace, mockSkillRunner, mockHost, mockGit);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to clean stale worktrees: constructor clean error object'),
      );
    });
    it('should continue if a layer has no pending tasks', async () => {
      const state = new EngineState('test-session');
      state.tasks.completed = ['1'];
      const t1 = new Task('1', 'm1', 'd1', 's1');
      const t2 = new Task('2', 'm2', 'd2', 's2', undefined, undefined, ['1']);
      const plan = new Plan('test plan', [t1, t2]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 's2', provider: 'test' }]);

      await agent.execute(state);
      // Layer 0 ([t1]) has 0 pending tasks -> hits continue.
      // Layer 1 ([t2]) has 1 pending task -> executed.
      expect(mockGit.worktreeAdd).toHaveBeenCalledTimes(1);
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(expect.stringContaining('.worktrees/2'), 'task/2', 'main');
    });

    it('should fallback to message and user prompt if description is missing', async () => {
      const plan = new Plan('prompt plan', [new Task('1', 'msg1', '', 'skill1'), new Task('2', '', '', 'skill2')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([
        { name: 'skill1', provider: 'test' },
        { name: 'skill2', provider: 'test' },
      ]);

      await agent.execute(state);
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(expect.anything(), 'msg1', expect.any(String));
      expect(mockSkillRunner.runSkill).toHaveBeenCalledWith(expect.anything(), 'prompt', expect.any(String)); // 'prompt' is base state prompt
    });

    it('should handle non-Error exceptions in task execution and cleanup', async () => {
      const plan = new Plan('error plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRunner.getSkills.mockReturnValue([{ name: 'skill', provider: 'test' }]);
      mockSkillRunner.runSkill.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'hard failure';
      });
      mockGit.worktreeRemove.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'cleanup failure';
      });

      await expect(agent.execute(state)).rejects.toBe('hard failure');
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Task 1 failed: hard failure'));
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
    });

    it('should reach unreachable return in executeLayer', async () => {
      // Accessing private for coverage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (agent as any).executeLayer([], 'prompt', state);
      expect(mockGit.worktreeAdd).not.toHaveBeenCalled();
    });
  });
});
