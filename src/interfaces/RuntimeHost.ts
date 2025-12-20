export interface RuntimeHost {
    /**
     * Log a message to the host system.
     */
    log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void;

    /**
     * Update the status of the current operation.
     */
    status(status: string): void;

    /**
     * Ask the user (or system) a question.
     */
    ask(question: string, type?: 'text' | 'confirm' | 'select', options?: string[]): Promise<string | boolean>;
}
