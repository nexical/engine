import { EngineState } from '../../../src/domain/State.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';

describe('EngineState', () => {
  let state: EngineState;

  beforeEach(() => {
    state = new EngineState('session-id');
  });

  it('should initialize with default values', () => {
    expect(state.session_id).toBe('session-id');
    expect(state.status).toBe('IDLE');
    expect(state.loop_count).toBe(0);
    expect(state.tasks.completed).toEqual([]);
    expect(state.tasks.failed).toEqual([]);
    expect(state.tasks.pending).toEqual([]);
    expect(state.user_prompt).toBe('');
    expect(state.interactive).toBe(false);
    expect(state.context).toEqual({});
  });

  it('should initialize with provided values', () => {
    state.initialize('new prompt', true);
    expect(state.user_prompt).toBe('new prompt');
    expect(state.interactive).toBe(true);
    expect(state.status).toBe('IDLE');
  });

  it('should use default interactive value in initialize', () => {
    state.initialize('prompt');
    expect(state.interactive).toBe(false);
  });

  it('should update status', () => {
    state.updateStatus('EXECUTING');
    expect(state.status).toBe('EXECUTING');
  });

  it('should increment loop', () => {
    state.incrementLoop();
    expect(state.loop_count).toBe(1);
  });

  it('should reset loop', () => {
    state.incrementLoop();
    state.resetLoop();
    expect(state.loop_count).toBe(0);
  });

  it('should record signal', () => {
    const signal = Signal.fail('reason');
    state.recordSignal(signal);
    expect(state.last_signal).toBe(signal);
  });

  it('should complete task only once', () => {
    state.completeTask('task1');
    state.completeTask('task1');
    expect(state.tasks.completed).toEqual(['task1']);
  });

  describe('serialization', () => {
    it('should serialize and deserialize with all fields', () => {
      state.updateStatus('PLANNING');
      state.completeTask('task1');
      state.current_plan = 'plan-id';
      state.loop_count = 5;
      state.user_prompt = 'prompt';
      state.interactive = true;
      state.context = { key: 'value' };
      const signal = new Signal(SignalType.FAIL, 'test');
      state.recordSignal(signal);

      const yaml = state.toYaml();
      const deserialized = EngineState.fromYaml(yaml);

      expect(deserialized.session_id).toBe(state.session_id);
      expect(deserialized.status).toBe(state.status);
      expect(deserialized.tasks.completed).toContain('task1');
      expect(deserialized.current_plan).toBe('plan-id');
      expect(deserialized.loop_count).toBe(5);
      expect(deserialized.user_prompt).toBe('prompt');
      expect(deserialized.interactive).toBe(true);
      expect(deserialized.context).toEqual({ key: 'value' });
      // Signal doesn't have a fromData/fromYaml yet, it's just cast.
      expect(deserialized.last_signal).toBeDefined();
      expect(deserialized.last_signal?.type).toBe('FAIL');
    });

    it('should deserialize with default missing fields', () => {
      const yaml = 'loop_count: 0'; // no session_id
      const deserialized = EngineState.fromYaml(yaml);
      expect(deserialized.session_id).toBe('unknown');
      expect(deserialized.status).toBe('IDLE');
    });

    it('should throw on invalid YAML', () => {
      expect(() => EngineState.fromYaml('null')).toThrow('Invalid state YAML');
    });

    it('should handle missing tasks branches', () => {
      const yaml = 'session_id: test\ntasks: {}';
      const deserialized = EngineState.fromYaml(yaml);
      expect(deserialized.tasks.completed).toEqual([]);
    });

    it('should handle non-string current_plan in fromYaml', () => {
      const yaml = 'session_id: test\ncurrent_plan: { id: 123 }';
      const deserialized = EngineState.fromYaml(yaml);
      expect(deserialized.current_plan).toBe('{"id":123}');
    });
  });
});
