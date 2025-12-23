export interface IRuntimeHost {
  /**
   * Log a message to the host system.
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown): void;

  /**
   * Update the status of the current operation.
   */
  status(status: string): void;

  /**
   * Ask the user (or system) a question.
   */
  ask(question: string, type?: 'text' | 'confirm' | 'select', options?: string[]): Promise<string | boolean>;

  /**
   * Emit a structured event for observability.
   */
  emit(event: string, data: unknown): void;
}
