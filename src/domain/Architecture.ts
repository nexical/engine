export class Architecture {
  constructor(public readonly raw: string) {}

  public get content(): string {
    return this.raw;
  }

  public static fromMarkdown(md: string): Architecture {
    return new Architecture(md);
  }

  public toString(): string {
    return this.raw;
  }
}
