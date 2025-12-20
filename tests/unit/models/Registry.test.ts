import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { Registry } from '../../../src/models/Registry.js';
import { Orchestrator } from '../../../src/orchestrator.js';

// Mock Orchestrator since Registry depends on it (via BaseRegistry/constructor)
jest.mock('../../../src/orchestrator.js');

interface TestItem {
    name: string;
    value: number;
}

class TestRegistry extends Registry<TestItem> { }

describe('Registry Model', () => {
    let registry: TestRegistry;
    let mockOrchestrator: jest.Mocked<Orchestrator>;

    beforeEach(() => {
        mockOrchestrator = {
            config: {},
            disk: {},
            driverRegistry: {},
            promptEngine: {},
            planner: {},
            executor: {},
            state: {}
        } as any;
        registry = new TestRegistry(mockOrchestrator);
    });

    it('should register and retrieve items', () => {
        const item = { name: 'item1', value: 100 };
        registry.register(item);

        expect(registry.get('item1')).toBe(item);
        expect(registry.getAll()).toContain(item);
    });

    it('should overwrite existing items with same name', () => {
        const item1 = { name: 'item1', value: 100 };
        const item2 = { name: 'item1', value: 200 };

        registry.register(item1);
        registry.register(item2);

        expect(registry.get('item1')).toBe(item2);
        expect(registry.getAll()).toHaveLength(1);
    });
});
