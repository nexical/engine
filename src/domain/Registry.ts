import { IRuntimeHost } from './RuntimeHost.js';

export class Registry<T extends { name: string }> {
  protected items: Map<string, T> = new Map();

  constructor(protected host?: IRuntimeHost) {}

  register(item: T): void {
    if (this.items.has(item.name)) {
      if (this.host) {
        this.host.log('warn', `Item '${item.name}' is already registered. Overwriting.`);
      }
    }
    this.items.set(item.name, item);
  }

  get(name: string): T | undefined {
    return this.items.get(name);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }
}
