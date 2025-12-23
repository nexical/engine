export class DIContainer {
  private services = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();

  register<T>(key: string, instance: T): void {
    this.services.set(key, instance);
  }

  registerFactory<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
  }

  resolve<T>(key: string): T {
    if (this.services.has(key)) {
      return this.services.get(key) as T;
    }

    if (this.factories.has(key)) {
      const instance = this.factories.get(key)!();
      // Singleton behavior: cache the instance
      this.services.set(key, instance);
      return instance as T;
    }

    throw new Error(`Service '${key}' not registered in DIContainer.`);
  }

  reset(): void {
    this.services.clear();
    this.factories.clear();
  }
}
