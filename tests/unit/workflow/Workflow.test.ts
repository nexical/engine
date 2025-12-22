import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { Workflow } from '../../../src/workflow/Workflow.js';
import { EngineState } from '../../../src/domain/State.js';
import { Project } from '../../../src/domain/Project.js';
import { Brain } from '../../../src/agents/Brain.js';
import { Workspace } from '../../../src/domain/Workspace.js';
import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { Signal, SignalType } from '../../../src/workflow/Signal.js';
import { ArchitectingState } from '../../../src/workflow/states/ArchitectingState.js';
import { PlanningState } from '../../../src/workflow/states/PlanningState.js';
import { ExecutingState } from '../../../src/workflow/states/ExecutingState.js';

describe('Workflow Engine', () => {
    let workflow: Workflow;
    let brain: Brain;
    let project: Project;
    let workspace: Workspace;
    let host: RuntimeHost;
    let state: EngineState;

    beforeEach(() => {
        host = {
            log: jest.fn(),
            ask: jest.fn(),
            status: jest.fn()
        } as any;

        project = {
            paths: {
                architectureCurrent: '/mock/arch.md',
                planCurrent: '/mock/plan.yml',
                log: '/mock/log.yml',
                state: '/mock/state.yml',
                signals: '/mock/signals'
            },
            rootDirectory: '/mock'
        } as any;

        brain = {
            init: jest.fn(),
            getEvolution: jest.fn().mockReturnValue({
                recordFailure: jest.fn(),
                getLogSummary: jest.fn().mockReturnValue('mock log')
            })
        } as any;

        workspace = {
            getArchitecture: jest.fn<() => Promise<any>>().mockResolvedValue({ content: 'arch' }),
            loadPlan: jest.fn<() => Promise<any>>().mockResolvedValue({ plan_name: 'test', tasks: [] }),
            detectSignal: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            clearSignals: jest.fn<() => Promise<void>>()
        } as any;

        state = new EngineState('test-session');
        workflow = new Workflow(brain, project, workspace, host);
    });

    it('should run through the standard lifecycle (Architect -> Plan -> Execute -> Complete)', async () => {
        jest.spyOn(ArchitectingState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(PlanningState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(ExecutingState.prototype, 'run').mockResolvedValue(Signal.COMPLETE);

        await workflow.start(state);

        expect(host.log).toHaveBeenCalledWith('info', expect.stringContaining('Enter State: ARCHITECTING'));
        expect(host.log).toHaveBeenCalledWith('info', expect.stringContaining('Enter State: PLANNING'));
        expect(host.log).toHaveBeenCalledWith('info', expect.stringContaining('Enter State: EXECUTING'));
        expect(state.status).toBe('COMPLETED');
    });

    it('should handle REPLAN signal by transitioning to PLANNING', async () => {
        let executionCount = 0;
        jest.spyOn(ArchitectingState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(PlanningState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(ExecutingState.prototype, 'run').mockImplementation(async () => {
            executionCount++;
            if (executionCount === 1) return Signal.replan("Needs more tasks");
            return Signal.COMPLETE;
        });

        await workflow.start(state);

        expect(executionCount).toBe(2);
        expect(state.status).toBe('COMPLETED');
    });

    it('should handle REARCHITECT signal by transitioning to ARCHITECTING', async () => {
        let executionCount = 0;
        jest.spyOn(ArchitectingState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(PlanningState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(ExecutingState.prototype, 'run').mockImplementation(async () => {
            executionCount++;
            if (executionCount === 1) return Signal.rearchitect("Architecture invalid");
            return Signal.COMPLETE;
        });

        await workflow.start(state);

        expect(executionCount).toBe(2);
        expect(state.status).toBe('COMPLETED');
    });

    it('should fail if maximum retry limit is reached', async () => {
        jest.spyOn(ArchitectingState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        jest.spyOn(PlanningState.prototype, 'run').mockResolvedValue(Signal.NEXT);
        // Constantly return REPLAN
        jest.spyOn(ExecutingState.prototype, 'run').mockResolvedValue(Signal.replan("Infinite failure"));

        await workflow.start(state);

        expect(state.loop_count).toBeGreaterThan(10);
        expect(state.status).toBe('FAILED');
        expect(host.log).toHaveBeenCalledWith('error', expect.stringContaining('Maximum retry limit reached'));
    });
});
