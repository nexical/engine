import { BaseDriver, EngineState, Orchestrator, Project, Signal, SignalType, Workspace } from '../../src/index.js';

describe('Index Exports', () => {
  it('should export Orchestrator', () => {
    expect(Orchestrator).toBeDefined();
  });

  it('should export BaseDriver', () => {
    expect(BaseDriver).toBeDefined();
  });

  it('should export Project', () => {
    expect(Project).toBeDefined();
  });

  it('should export Workspace', () => {
    expect(Workspace).toBeDefined();
  });

  it('should export Signal', () => {
    expect(Signal).toBeDefined();
  });

  it('should export SignalType', () => {
    expect(SignalType).toBeDefined();
  });

  it('should export EngineState', () => {
    expect(EngineState).toBeDefined();
  });
});
