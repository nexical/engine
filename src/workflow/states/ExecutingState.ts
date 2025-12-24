import { EngineState } from '../../domain/State.js';
import { SignalDetectedError } from '../../errors/SignalDetectedError.js';
import { Signal, SignalType } from '../Signal.js';
import { State } from './State.js';

export class ExecutingState extends State {
  get name(): string {
    return 'EXECUTING';
  }

  async run(state: EngineState): Promise<Signal> {
    try {
      const developer = this.brain.createDeveloper(this.workspace);
      await developer.execute(state);
      return Signal.COMPLETE;
    } catch (error) {
      if (error instanceof SignalDetectedError) {
        return error.signal;
      }

      // Fallback for cases where instanceof might fail (ESM/Jest quirks)
      const errObj = error as Record<string, unknown>;

      const metadata = (errObj?.metadata || {}) as Record<string, unknown>;
      const rawSignal = (errObj?.signal || metadata.signal) as Record<string, unknown> | undefined;

      if (errObj && typeof errObj === 'object' && (errObj.code === 'SIGNAL_DETECTED' || rawSignal)) {
        if (rawSignal && typeof rawSignal.type === 'string') {
          const reason = typeof rawSignal.reason === 'string' ? rawSignal.reason : '';
          const meta =
            rawSignal.metadata && typeof rawSignal.metadata === 'object'
              ? (rawSignal.metadata as Record<string, unknown>)
              : {};
          return new Signal(rawSignal.type as SignalType, reason, meta);
        }
        return Signal.fail('Signal detected but missing signal object or type');
      }

      const message = error instanceof Error ? error.message : String(error);
      return Signal.fail(`Execution failed: ${message}`);
    }
  }
}
