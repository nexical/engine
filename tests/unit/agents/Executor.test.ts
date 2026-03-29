/* eslint-disable */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { jest } from '@jest/globals';

const mockExecSync = jest.fn<(command: string, options?: { cwd?: string }) => string>();
const mockEnsureDirSync = jest.fn();
const mockShellExecute = jest.fn<(...args: any[]) => Promise<any>>();
const mockCopySync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

jest.unstable_mockModule('fs-extra', () => ({
  default: {
    ensureDirSync: mockEnsureDirSync,
    copySync: mockCopySync,
  },
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
import { SignalService } from '../../../src/services/SignalService.js';
import { ISkillRegistry } from '../../../src/services/SkillRegistry.js';
import { Signal } from '../../../src/workflow/Signal.js';

// Dynamic import for Executor class to ensure mock works
let ExecutorClass: any;

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
  let mockSignalService: jest.Mocked<SignalService>;
  let mockSkill: {
    execute: jest.Mock<(...args: any[]) => Promise<Result<string, Error>>>;
    getEnvironmentSpec: jest.Mock;
  };
  let state: EngineState;

  beforeEach(async () => {
    // Import module dynamically
    const module = await import('../../../src/agents/Executor.js');
    ExecutorClass = module.Executor;

    jest.clearAllMocks();
    mockExecSync.mockReset();
    mockEnsureDirSync.mockReset();
    mockCopySync.mockReset();

    mockProject = {
      paths: { root: '/tmp', signals: '/tmp/signals' },
      getConfig: jest.fn().mockReturnValue({}),
      getConstraints: jest.fn().mockReturnValue('constraints'),
      rootDirectory: '/tmp',
      fileSystem: {
        writeFile: jest.fn(),
        exists: jest.fn(),
        readFile: jest.fn(),
        deleteFile: jest.fn(),
      },
    } as unknown as jest.Mocked<IProject>;

    mockWorkspace = {
      loadPlan: jest.fn(),
      detectSignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<IWorkspace>;

    mockSkill = {
      execute: jest.fn<() => Promise<Result<string, Error>>>().mockResolvedValue(Result.ok('success')),
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
      runCommand: jest.fn(),
    } as unknown as jest.Mocked<GitService>;

    mockBus = {
      sendRequest: jest.fn(),
      waitForResponse: jest.fn(),
    } as unknown as jest.Mocked<FileSystemBus>;

    mockPromptEngine = {
      renderString: jest.fn(),
    } as unknown as jest.Mocked<IPromptEngine>;

    mockSignalService = {
      getHighestPrioritySignal: jest.fn<() => Promise<Signal | null>>().mockResolvedValue(null),
    } as unknown as jest.Mocked<SignalService>;

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
      mockSignalService,
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

    it('should hydrate workspace if specified in skill', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ hydration: ['config.json'] });
      mockSkill.execute.mockResolvedValue(Result.ok('success'));

      await agent.execute(state);

      // Now we verify fs-extra calls instead of execSync
      expect(mockEnsureDirSync).toHaveBeenCalled();
      expect(mockCopySync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('config.json'),
      );
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

    it('should catch validation/merge failure and abort', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockGit.merge.mockImplementation(() => {
        throw new Error('merge conflict');
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
      expect(mockGit.runCommand).toHaveBeenCalledWith(['merge', '--abort']);
    });

    it('should log warning if cleanStaleWorktrees fails in constructor', () => {
      mockGit.cleanStaleWorktrees.mockImplementation(() => {
        throw new Error('git fail');
      });
      new ExecutorClass(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        mockGit,
        mockBus,
        mockPromptEngine,
        mockSignalService,
      );
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to clean stale worktrees'));
    });

    it('should return early if all tasks are completed', async () => {
      const plan = new Plan('done plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      state.tasks.completed = ['1'];

      await agent.execute(state);

      expect(mockHost.log).toHaveBeenCalledWith('info', 'All tasks in plan are already completed.');
      expect(mockGit.worktreeAdd).not.toHaveBeenCalled();
    });

    it('should throw if Git is missing', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      (agent as any).git = undefined;

      await expect(agent.execute(state)).rejects.toThrow('Git is required');
    });

    it('should handle skill not found', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'missing-skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkillRegistry.getSkill.mockReturnValue(undefined);

      await expect(agent.execute(state)).rejects.toThrow("Skill 'missing-skill' not found");
    });

    it('should update submodules if configured', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockProject.getConfig.mockReturnValue({ max_worktrees: 4, git: { submodules: true } } as any);

      await agent.execute(state);
      expect(mockGit.submoduleUpdate).toHaveBeenCalled();
    });

    it('should run worktree setup commands', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ worktree_setup: ['npm install'] });

      await agent.execute(state);
      expect(mockExecSync).toHaveBeenCalledWith('npm install', expect.any(Object));
    });

    it('should detect priority signals during execution', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSignalService.getHighestPrioritySignal.mockResolvedValue(Signal.rearchitect('rev'));

      await expect(agent.execute(state)).rejects.toThrow();
      expect(state.tasks.failed).toContain('1');
    });

    it('should handle stash fail and pop fail', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      // Force stash push success then pop fail
      mockGit.runCommand.mockImplementation((args: any) => {
        if (args[0] === 'stash' && args[1] === 'push') return 'Saved working directory';
        if (args[0] === 'stash' && args[1] === 'pop') throw new Error('pop fail');
        return '';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Stash pop failed'));
    });

    it('should handle cleanup failures', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockGit.worktreeRemove.mockImplementation(() => {
        throw new Error('rm fail');
      });
      mockGit.worktreePrune.mockImplementation(() => {
        throw new Error('prune fail');
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to cleanup worktree'));
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to prune worktrees'));
    });

    it('should skip layer if all tasks are already completed', async () => {
      // Layer 1: all completed, Layer 2: one pending
      const t1 = new Task('1', 't1', 'm1', 's1');
      const t2 = new Task('2', 't2', 'm2', 's2');
      const plan = new Plan('test', [t1, t2]);

      // Force layers: [[t1], [t2]]
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      jest.spyOn(plan, 'getExecutionLayers').mockReturnValue([[t1], [t2]]);

      state.tasks.completed = ['1'];

      await agent.execute(state);

      // t1 should be skipped (no worktreeAdd for '1')
      expect(mockGit.worktreeAdd).not.toHaveBeenCalledWith(
        expect.stringContaining('/1'),
        expect.any(String),
        expect.any(String),
      );
      expect(mockGit.worktreeAdd).toHaveBeenCalledWith(
        expect.stringContaining('/2'),
        expect.any(String),
        expect.any(String),
      );
    });

    it('should handle sparse checkout if configured in skill', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.getEnvironmentSpec.mockReturnValue({ sparse_checkout: ['src/'] });

      await agent.execute(state);

      expect(mockGit.sparseCheckoutInit).toHaveBeenCalled();
      expect(mockGit.sparseCheckoutSet).toHaveBeenCalledWith(expect.any(String), ['src/']);
    });

    it('should handle context handlers (commandRunner and clarificationHandler)', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (ctx: any) => {
        capturedContext = ctx;
        return Result.ok('ok');
      });

      await agent.execute(state);

      if (!capturedContext) throw new Error('Context not captured');

      // Test commandRunner
      mockExecSync.mockReturnValue('cmd output');
      const out = await capturedContext.commandRunner('echo', ['hi']);
      expect(mockExecSync).toHaveBeenCalledWith('echo hi', expect.any(Object));
      expect(out).toBe('cmd output');

      // Test clarificationHandler
      mockBus.waitForResponse.mockResolvedValue({
        id: 'res1',
        source: 'architect',
        correlationId: 'corr1',
        type: 'response',
        payload: { answers: { 'What?': 'That' } },
      });

      const ans = await capturedContext.clarificationHandler('What?');
      expect(mockBus.sendRequest).toHaveBeenCalled();
      expect(ans).toBe('That');
    });

    it('should handle merge abort failure', async () => {
      const plan = new Plan('plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockGit.merge.mockImplementation(() => {
        throw new Error('merge error');
      });
      mockGit.runCommand.mockImplementation((args: any) => {
        if (args[0] === 'merge' && args[1] === '--abort') throw new Error('abort fail');
        return '';
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to abort merge'));
    });

    it('should handle AnalystAgent failure in finally block', async () => {
      const plan = new Plan('plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      // We need to trigger the catch block of the analyst agent inside the finally block
      // AnalystAgent is instantiated inside Executor.execute
      // But it's hard to mock it unless we mock the constructor or its methods.
      // Since it's imported normally, let's just make it throw.
      // Wait, AnalystAgent is imported at the top of Executor.ts.
      // We can't easily mock it now because it's already bound.
      // BUT, we can mock the FileSystem to make it throw during analyst.analyze()

      (mockProject.fileSystem.exists as jest.Mock).mockImplementation(() => {
        throw new Error('FileSystem crash');
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('AnalystAgent failed to run'));
    });

    it('should cover String(e) fallback in constructor', () => {
      mockGit.cleanStaleWorktrees.mockImplementation(() => {
        throw 'string constructor error';
      });
      new ExecutorClass(
        mockProject,
        mockWorkspace,
        mockSkillRegistry,
        mockDriverRegistry,
        mockHost,
        mockGit,
        mockBus,
        mockPromptEngine,
        mockSignalService,
      );
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to clean stale worktrees: string constructor error'),
      );
    });

    it('should cover String(e) fallback in task failure', async () => {
      const plan = new Plan('fail plan', [new Task('1', 't', 'm', 's')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockImplementation(() => {
        throw 'task throw';
      });

      await agent.execute(state).catch(() => {});
      expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Task 1 failed: task throw'));
    });

    it('should cover String(e) fallback in merge failure', async () => {
      const plan = new Plan('merge fail plan', [new Task('1', 't', 'm', 's')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('ok'));
      mockGit.merge.mockImplementation(() => {
        throw 'merge throw';
      });

      await expect(agent.execute(state)).rejects.toThrow('Manual resolution required');
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Merge failed for task 1 from branch task/1: merge throw'),
      );
    });

    it('should cover String(e) fallback in stash failure', async () => {
      const plan = new Plan('stash fail plan', [new Task('1', 't', 'm', 's')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('ok'));

      mockGit.runCommand.mockImplementation((args: any) => {
        if (args[0] === 'stash' && args[1] === 'push') throw 'stash throw';
        return '';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to stash changes: stash throw'),
      );
    });

    it('should cover String(e) fallback in worktree cleanup', async () => {
      const plan = new Plan('cleanup fail plan', [new Task('1', 't', 'm', 's')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('ok'));
      mockGit.worktreeRemove.mockImplementation(() => {
        throw 'rm throw';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to cleanup worktree /tmp/.worktrees/1: rm throw'),
      );
    });

    it('should cover String(e) fallback in worktree prune', async () => {
      const plan = new Plan('prune fail plan', [new Task('1', 't', 'm', 's')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);
      mockSkill.execute.mockResolvedValue(Result.ok('ok'));
      mockGit.worktreePrune.mockImplementation(() => {
        throw 'prune throw';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Failed to prune worktrees: prune throw'),
      );
    });

    it('should handle userPrompt fallbacks in context', async () => {
      const task = new Task('1', '', '', 'skill'); // empty description and message
      const plan = new Plan('plan', [task]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (ctx: any) => {
        capturedContext = ctx;
        return Result.ok('ok');
      });

      state.user_prompt = 'global prompt';
      await agent.execute(state);

      expect(capturedContext?.userPrompt).toBe('global prompt');
    });

    it('should handle clarificationHandler empty/missing responses', async () => {
      const plan = new Plan('plan', [new Task('1', 't', 'm', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (ctx: any) => {
        capturedContext = ctx;
        return Result.ok('ok');
      });

      await agent.execute(state);

      // Case 1: Missing answers key
      mockBus.waitForResponse.mockResolvedValue({
        id: 'r1',
        source: 'a',
        type: 'response',
        payload: {},
      });
      const ans1 = await capturedContext?.clarificationHandler('Q?');
      expect(ans1).toBe('');

      // Case 2: Missing specific question in answers
      mockBus.waitForResponse.mockResolvedValue({
        id: 'r2',
        source: 'a',
        type: 'response',
        payload: { answers: { Other: 'A' } },
      });
      const ans2 = await capturedContext?.clarificationHandler('Q?');
      expect(ans2).toBe('');
    });

    it('should cover result.isFail() without error object', async () => {
      const plan = new Plan('plan', [new Task('1', 't', 'm', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      mockSkill.execute.mockResolvedValue(Result.fail(undefined as any));

      await agent.execute(state).catch(() => {});
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Task 1 failed: Skill execution failed'),
      );
    });

    it('should run commandRunner branch without args', async () => {
      const plan = new Plan('plan', [new Task('1', 't', 'm', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      let capturedContext: ISkillContext | undefined;
      mockSkill.execute.mockImplementation(async (ctx: any) => {
        capturedContext = ctx;
        return Result.ok('ok');
      });

      await agent.execute(state);

      mockExecSync.mockReturnValue('ok');
      await capturedContext?.commandRunner('ls'); // no args
      expect(mockExecSync).toHaveBeenCalledWith('ls ', expect.any(Object));
    });

    it('should handle stash fail and pop fail with string error', async () => {
      const plan = new Plan('plan', [new Task('1', 'task', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      // Force stash push success then pop fail with string
      mockGit.runCommand.mockImplementation((args: any) => {
        if (args[0] === 'stash' && args[1] === 'push') return 'Saved working directory';
        if (args[0] === 'stash' && args[1] === 'pop') throw 'pop string fail';
        return '';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Stash pop failed (conflict?): pop string fail'),
      );
    });

    it('should handle AnalystAgent failure with string error', async () => {
      const plan = new Plan('plan', [new Task('1', 'msg', 'desc', 'skill')]);
      mockWorkspace.loadPlan.mockResolvedValue(plan);

      (mockProject.fileSystem.exists as jest.Mock).mockImplementation(() => {
        throw 'analyst string crash';
      });

      await agent.execute(state);
      expect(mockHost.log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('AnalystAgent failed to run: analyst string crash'),
      );
    });
  });
});
