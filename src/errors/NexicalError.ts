export abstract class NexicalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
