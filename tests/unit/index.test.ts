
import * as Index from '../../src/index';

describe('Index Exports', () => {
    it('should export Orchestrator', () => {
        expect(Index.Orchestrator).toBeDefined();
    });

    it('should export BaseDriver', () => {
        expect(Index.BaseDriver).toBeDefined();
    });

    it('should export Project', () => {
        expect(Index.Project).toBeDefined();
    });

    it('should export Workspace', () => {
        expect(Index.Workspace).toBeDefined();
    });

    it('should export Signal', () => {
        expect(Index.Signal).toBeDefined();
    });

    it('should export SignalType', () => {
        expect(Index.SignalType).toBeDefined();
    });

    it('should export EngineState', () => {
        expect(Index.EngineState).toBeDefined();
    });
});
