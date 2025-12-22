export enum SignalType {
    NEXT = 'NEXT',
    WAIT = 'WAIT',
    FAIL = 'FAIL',
    COMPLETE = 'COMPLETE',
    RETRY = 'RETRY',
    REPLAN = 'REPLAN',
    REARCHITECT = 'REARCHITECT'
}

export class Signal {
    constructor(
        public readonly type: SignalType,
        public readonly reason: string = '',
        public readonly metadata: Record<string, unknown> = {}
    ) { }

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
}
