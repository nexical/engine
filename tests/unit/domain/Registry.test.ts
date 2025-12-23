import { jest } from '@jest/globals';

import { Registry } from '../../../src/domain/Registry.js';

interface ITestItem {
  name: string;
  value: number;
}

class TestRegistry extends Registry<ITestItem> {}

describe('Registry', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  it('should register and retrieve items', () => {
    const item = { name: 'item1', value: 1 };
    registry.register(item);
    expect(registry.get('item1')).toBe(item);
  });

  it('should warn and overwrite on duplicate registration', () => {
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const item1 = { name: 'item1', value: 1 };
    const item2 = { name: 'item1', value: 2 };

    registry.register(item1);
    registry.register(item2);

    expect(spyWarn).toHaveBeenCalled();
    expect(registry.get('item1')).toBe(item2);
    spyWarn.mockRestore();
  });

  it('should return all items', () => {
    registry.register({ name: 'item1', value: 1 });
    registry.register({ name: 'item2', value: 2 });
    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });
});
