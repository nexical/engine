import { Signal } from '../workflow/Signal.js';
import { NexicalError } from './NexicalError.js';

export class SignalDetectedError extends NexicalError {
  constructor(
    public signal: Signal,
    public taskId: string = '',
  ) {
    super(`Signal detected${taskId ? ` in task ${taskId}` : ''}: ${signal.type}`, 'SIGNAL_DETECTED', {
      signal,
      taskId,
    });
  }
}
