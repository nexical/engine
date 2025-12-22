export class DIContainer {
    private services = new Map<string, any>();
    private factories = new Map<string, () => any>();

    register<T>(key: string, instance: T): void {
        this.services.set(key, instance);
    }

    registerFactory<T>(key: string, factory: () => T): void {
        this.factories.set(key, factory);
    }

    resolve<T>(key: string): T {
        if (this.services.has(key)) {
            return this.services.get(key);
        }

        if (this.factories.has(key)) {
            const instance = this.factories.get(key)!();
            // Singleton by default for factories? 
            // Usually factories produce new instances or we cache them. 
            // For this simple container, let's cache if we want singletons, or execution-scope.
            // Let's assume singleton for now as that's what ServiceFactory did.
            this.services.set(key, instance);
            return instance;
        }

        throw new Error(`Service '${key}' not registered in DIContainer.`);
    }

    reset(): void {
        this.services.clear();
        this.factories.clear();
    }
}
