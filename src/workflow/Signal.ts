export enum SignalType {
  NEXT = 'NEXT',
  WAIT = 'WAIT',
  FAIL = 'FAIL',
  COMPLETE = 'COMPLETE',
  RETRY = 'RETRY',
  REPLAN = 'REPLAN',
  REARCHITECT = 'REARCHITECT',
  CLARIFICATION_NEEDED = 'CLARIFICATION_NEEDED',
}

export interface ISignalJSON {
  type: SignalType;
  reason: string;
  metadata: Record<string, unknown>;
}

export class Signal extends Error {
  constructor(
    public readonly type: SignalType,
    public readonly reason: string = '',
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(reason);
    this.name = 'Signal';
  }

  static NEXT = new Signal(SignalType.NEXT);
  static COMPLETE = new Signal(SignalType.COMPLETE);
  static WAIT = new Signal(SignalType.WAIT);

  static fail(reason: string): Signal {
    return new Signal(SignalType.FAIL, reason);
  }

  static retry(reason: string): Signal {
    return new Signal(SignalType.RETRY, reason);
  }

  static replan(reason: string, metadata: Record<string, unknown> = {}): Signal {
    return new Signal(SignalType.REPLAN, reason, metadata);
  }

  static rearchitect(reason: string, metadata: Record<string, unknown> = {}): Signal {
    return new Signal(SignalType.REARCHITECT, reason, metadata);
  }

  static clarificationNeeded(questions: string[], context: Record<string, unknown> = {}): Signal {
    return new Signal(SignalType.CLARIFICATION_NEEDED, 'Clarification needed', { ...context, questions });
  }

  toJSON(): ISignalJSON {
    return {
      type: this.type,
      reason: this.reason,
      metadata: this.metadata,
    };
  }

  static fromJSON(json: ISignalJSON): Signal {
    return new Signal(json.type, json.reason, json.metadata);
  }
}
