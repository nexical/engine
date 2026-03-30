import { jest } from '@jest/globals';

import { Registry } from '../../../src/domain/Registry.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';

interface ITestItem {
  name: string;
  value: number;
}

class TestRegistry extends Registry<ITestItem> {}

describe('Registry', () => {
  let registry: TestRegistry;
  let mockHost: jest.Mocked<IRuntimeHost>;

  beforeEach(() => {
    mockHost = {
      log: jest.fn(),
      emit: jest.fn(),
      status: jest.fn(),
      ask: jest.fn(),
    } as unknown as jest.Mocked<IRuntimeHost>;
    registry = new TestRegistry(mockHost);
  });

  it('should register and retrieve items', () => {
    const item = { name: 'item1', value: 1 };
    registry.register(item);
    expect(registry.get('item1')).toBe(item);
  });

  it('should warn and overwrite on duplicate registration', () => {
    const item1 = { name: 'item1', value: 1 };
    const item2 = { name: 'item1', value: 2 };

    registry.register(item1);
    registry.register(item2);

    expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('already registered'));
    expect(registry.get('item1')).toBe(item2);
  });

  it('should return all items', () => {
    registry.register({ name: 'item1', value: 1 });
    registry.register({ name: 'item2', value: 2 });
    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it('should not log if host is not provided on duplicate registration', () => {
    const r = new TestRegistry();
    const item1 = { name: 'item1', value: 1 };
    const item2 = { name: 'item1', value: 2 };

    r.register(item1);
    expect(() => r.register(item2)).not.toThrow();
    expect(r.get('item1')).toBe(item2);
  });
});
