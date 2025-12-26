export enum SignalType {
  NEXT = 'STATUS_NEXT',
  WAIT = 'WAIT',
  FAIL = 'FAIL',
  COMPLETE = 'COMPLETE',
  RETRY = 'RETRY',
  REPLAN = 'REPLAN',
  REARCHITECT = 'REARCHITECT',
  CLARIFICATION_NEEDED = 'CLARIFICATION_NEEDED',
}

export interface ISignalJSON {
  status: string; // Mapped from SignalType
  reason: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export class Signal extends Error {
  constructor(
    public readonly type: SignalType,
    public readonly reason: string = '',
    public readonly metadata: Record<string, unknown> = {},
    public readonly artifacts: string[] = [],
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
      status: this.type,
      reason: this.reason,
      artifacts: this.artifacts,
      metadata: this.metadata,
    };
  }

  static fromJSON(json: ISignalJSON): Signal {
    // Map status string back to SignalType if needed, or cast if 1:1
    // We assume the JSON 'status' field holds values matching SignalType enum values (or their string representations)
    // The plan implies 'status' property in JSON.

    // Reverse lookup or direct cast.
    // Let's assume strict mapping for now.
    const type = Object.values(SignalType).includes(json.status as SignalType)
      ? (json.status as SignalType)
      : SignalType.FAIL; // Fallback?

    return new Signal(type, json.reason, json.metadata, json.artifacts);
  }
}
