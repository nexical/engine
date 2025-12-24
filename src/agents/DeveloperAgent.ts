import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { EngineState } from '../domain/State.js';
import { IWorkspace } from '../domain/Workspace.js';
import { SignalDetectedError } from '../errors/SignalDetectedError.js';
import { GitService } from '../services/GitService.js';
import { ISkillRunner } from '../services/SkillRunner.js';

export class DeveloperAgent {
  public readonly name = 'Developer';
  public readonly description = 'Executes the implementation plan by running skills.';

  constructor(
    private project: IProject,
    private workspace: IWorkspace,
    private skillRunner: ISkillRunner,
    private host: IRuntimeHost,
    private git?: GitService,
  ) {}

  async execute(state: EngineState): Promise<void> {
    const prompt = state.user_prompt;

    // Load Plan using Workspace instead of direct fs access
    const plan = await this.workspace.loadPlan();

    this.host.log('info', `Executing plan: ${plan.plan_name} with ${plan.tasks.length} tasks.`);

    // Sync pending tasks in state
    state.tasks.pending = plan.tasks.map((t) => t.id).filter((id) => !state.tasks.completed.includes(id));

    this.host.log('debug', `[DEBUG] Plan tasks IDs: ${JSON.stringify(plan.tasks.map((t) => t.id))}`);
    this.host.log('debug', `[DEBUG] Completed tasks IDs: ${JSON.stringify(state.tasks.completed)}`);

    // Filter out completed tasks
    const tasksToExecute = plan.tasks.filter((task) => !state.tasks.completed.includes(task.id));
    this.host.log('debug', `[DEBUG] Tasks to execute count: ${tasksToExecute.length}`);

    if (tasksToExecute.length === 0) {
      this.host.log('info', 'All tasks in plan are already completed.');
      return;
    }

    const skillRunner = this.skillRunner;

    for (const task of tasksToExecute) {
      this.host.log('info', `Starting task: ${task.id} - ${task.message}`);

      // Resolve dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        const missingDeps = task.dependencies.filter((depId) => !state.tasks.completed.includes(depId));
        if (missingDeps.length > 0) {
          this.host.log('warn', `Skipping task ${task.id} due to missing dependencies: ${missingDeps.join(', ')}`);
          continue;
        }
      }

      try {
        // Delegate execution to SkillRunner
        await skillRunner.runSkill(task, prompt);
      } catch (e) {
        this.host.log('error', `Task ${task.id} failed: ${e instanceof Error ? e.message : String(e)}`);
        state.tasks.failed.push(task.id);
        // We stop execution of the plan on the first failure to allow for replanning
        throw e;
      }

      state.completeTask(task.id);
      this.host.log('info', `Task ${task.id} completed.`);

      // Optional: Git Commit
      if (this.git) {
        try {
          this.git.add('.');
          this.git.commit(`[nexical] Completed task: ${task.id} - ${task.message}`);
        } catch (e) {
          this.host.log('warn', `Git commit failed for task ${task.id}: ${e instanceof Error ? e.message : String(e)}`);
          // We don't fail the whole workflow just because git failed
        }
      }

      // Check for signals after each task
      await this.checkSignals(task.id);
    }
  }

  private async checkSignals(taskId: string): Promise<void> {
    const signal = await this.workspace.detectSignal();
    if (signal) {
      this.host.log('info', `Signal detected after task ${taskId}: ${signal.type}`);
      throw new SignalDetectedError(signal, taskId);
    }
  }
}
