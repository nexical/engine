import { Signal, SignalType } from './Signal.js';

export interface ITransition {
  trigger: SignalType;
  target: string;
}

export interface IStateDefinition {
  name: string;
  transitions: ITransition[];
  onError?: string; // Target state in case of unhandled error
}

export interface IWorkflowConfig {
  initialState: string;
  states: IStateDefinition[];
  maxLoops?: number;
}

export class WorkflowGraph {
  private config: IWorkflowConfig;
  private transitionMap: Map<string, Map<SignalType, string>>;

  constructor(config: IWorkflowConfig) {
    this.config = config;
    this.transitionMap = new Map();
    this.validateAndBuild();
  }

  private validateAndBuild(): void {
    for (const stateDef of this.config.states) {
      const map = new Map<SignalType, string>();
      for (const trans of stateDef.transitions) {
        map.set(trans.trigger, trans.target);
      }
      this.transitionMap.set(stateDef.name, map);
    }
  }

  public getNextState(currentStateName: string, signal: Signal): string | undefined {
    const stateTransitions = this.transitionMap.get(currentStateName);
    if (!stateTransitions) return undefined;

    return stateTransitions.get(signal.type);
  }

  public getErrorTarget(currentStateName: string): string | undefined {
    const stateDef = this.config.states.find((s) => s.name === currentStateName);
    return stateDef?.onError;
  }

  public getInitialState(): string {
    return this.config.initialState;
  }

  public getConfig(): IWorkflowConfig {
    return this.config;
  }
}

export const DefaultWorkflowConfig: IWorkflowConfig = {
  initialState: 'ARCHITECTING',
  states: [
    {
      name: 'ARCHITECTING',
      transitions: [
        { trigger: SignalType.NEXT, target: 'PLANNING' },
        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' },
      ],
    },
    {
      name: 'PLANNING',
      transitions: [
        { trigger: SignalType.NEXT, target: 'EXECUTING' },
        { trigger: SignalType.REPLAN, target: 'PLANNING' },
        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' },
      ],
    },
    {
      name: 'EXECUTING',
      transitions: [
        { trigger: SignalType.COMPLETE, target: 'COMPLETED' },
        { trigger: SignalType.REPLAN, target: 'PLANNING' },
        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' },
      ],
    },
  ],
};
