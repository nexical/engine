import yaml from 'js-yaml';

import { ISignalJSON, Signal } from '../workflow/Signal.js';

export type OrchestratorStatus =
  | 'IDLE'
  | 'ARCHITECTING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INTERRUPTED';

export class EngineState {
  public session_id: string;
  public status: OrchestratorStatus;
  public current_state: string;
  public current_plan?: string;
  public loop_count: number;
  public tasks: {
    completed: string[];
    failed: string[];
    pending: string[];
  };
  public last_signal?: Signal;
  public user_prompt: string = '';
  public interactive: boolean = false;
  public context: Record<string, unknown> = {};
  public error?: string;

  constructor(session_id: string) {
    this.session_id = session_id;
    this.status = 'IDLE';
    this.current_state = 'ARCHITECTING';
    this.loop_count = 0;
    this.tasks = {
      completed: [],
      failed: [],
      pending: [],
    };
    this.user_prompt = '';
    this.context = {};
  }

  public initialize(prompt: string, interactive: boolean = false): void {
    this.user_prompt = prompt;
    this.interactive = interactive;
    this.status = 'IDLE';
    this.current_state = 'ARCHITECTING';
    this.loop_count = 0;
    this.tasks.failed = [];
    this.context = {};
  }

  updateStatus(status: OrchestratorStatus): void {
    this.status = status;
  }

  incrementLoop(): void {
    this.loop_count++;
  }

  resetLoop(): void {
    this.loop_count = 0;
  }

  recordSignal(signal: Signal): void {
    this.last_signal = signal;
  }

  completeTask(taskId: string): void {
    if (!this.tasks.completed.includes(taskId)) {
      this.tasks.completed.push(taskId);
    }
  }

  static fromYaml(yamlString: string): EngineState {
    const data = yaml.load(yamlString) as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid state YAML');
    }

    const session_id = (data.session_id as string) || 'unknown';
    const state = new EngineState(session_id);

    if (data.status) state.status = data.status as OrchestratorStatus;
    if (data.current_state) state.current_state = data.current_state as string;
    if (data.current_plan)
      state.current_plan =
        typeof data.current_plan === 'string' ? data.current_plan : JSON.stringify(data.current_plan);
    if (typeof data.loop_count === 'number') state.loop_count = data.loop_count;

    if (data.tasks) {
      const taskData = data.tasks as Record<string, unknown>;
      state.tasks = {
        completed: Array.isArray(taskData.completed) ? (taskData.completed as string[]) : [],
        failed: Array.isArray(taskData.failed) ? (taskData.failed as string[]) : [],
        pending: Array.isArray(taskData.pending) ? (taskData.pending as string[]) : [],
      };
    }

    if (data.last_signal) {
      state.last_signal = Signal.fromJSON(data.last_signal as ISignalJSON);
    }

    state.user_prompt = (data.user_prompt as string) || '';
    state.interactive = (data.interactive as boolean) || false;
    state.context = (data.context as Record<string, unknown>) || {};
    state.error = data.error as string | undefined;

    return state;
  }

  toYaml(): string {
    // We use JSON stringify/parse to ensure all objects (like Signals which are Errors)
    // are converted to plain objects via their toJSON methods before YAML dumping.
    return yaml.dump(JSON.parse(JSON.stringify(this)));
  }
}
