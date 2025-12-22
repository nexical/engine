import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { Workflow } from '../../../src/workflow/Workflow.js';
import { EngineState } from '../../../src/models/State.js';
import { RuntimeContext } from '../../../src/interfaces/RuntimeContext.js';

// Mock Agents
jest.mock('../../../src/agents/ArchitectAgent.js', () => {
    return {
        ArchitectAgent: jest.fn().mockImplementation(() => {
            return {
                run: jest.fn().mockImplementation(async (context, state) => {
                    // Simulate state update
                    context.host.log('info', "ArchitectAgent running");
                })
            };
        })
    };
});
jest.mock('../../../src/agents/PlannerAgent.js', () => {
    return {
        PlannerAgent: jest.fn().mockImplementation(() => {
            return {
                run: jest.fn().mockImplementation(async (context, state) => {
                    context.host.log('info', "PlannerAgent running");
                    state.current_plan = "test-plan";
                })
            };
        })
    };
});
jest.mock('../../../src/agents/DeveloperAgent.js', () => {
    return {
        DeveloperAgent: jest.fn().mockImplementation(() => {
            return {
                run: jest.fn().mockImplementation(async (context, state) => {
                    context.host.log('info', "DeveloperAgent running");
                })
            };
        })
    };
});

describe('Workflow Engine', () => {
    let workflow: Workflow;
    let context: RuntimeContext;
    let state: EngineState;

    beforeEach(() => {
        // Setup Mocks
        const mockHost = {
            log: jest.fn(),
            ask: jest.fn(),
            status: jest.fn()
        };
        const mockDisk = {
            readFile: jest.fn().mockImplementation((filePath: string) => {
                if (filePath.includes('plan.yml')) {
                    return "plan_name: test-plan\ntasks: []";
                }
                return 'mock-content';
            }),
            exists: jest.fn().mockReturnValue(true),
            writeFileAtomic: jest.fn(),
            listFiles: jest.fn().mockReturnValue([]),
            move: jest.fn()
        };
        const mockConfig = {
            architecturePath: '/mock/arch.md',
            planPath: '/mock/plan.yml',
            logPath: '/mock/log.yml',
            statePath: '/mock/state.yml',
            planDirectory: '/mock/plans',
            signalsDirectory: '/mock/signals',
            archiveDirectory: '/mock/archive',
            constraintsPath: '/mock/constraints.md',
            architecturePromptFile: '/mock/arch_prompt.txt',
            personasDirectory: '/mock/personas',
            architectureDirectory: '/mock/arch_history',
            plannerPromptFile: '/mock/planner_prompt.txt'
        };

        const mockDriver = {
            execute: jest.fn().mockResolvedValue({})
        };

        const mockRegistry = {
            get: jest.fn().mockReturnValue(mockDriver)
        };

        const mockPromptEngine = {
            render: jest.fn().mockReturnValue('mock-rendered-prompt')
        };

        const mockSkillRunner = {
            validateAvailableSkills: jest.fn(),
            getSkills: jest.fn().mockReturnValue([])
        };

        context = {
            host: mockHost,
            disk: mockDisk,
            config: mockConfig,
            driverRegistry: mockRegistry,
            promptEngine: mockPromptEngine,
            skillRunner: mockSkillRunner,
            interactive: false
        } as any;

        state = new EngineState('test-session');
        state.updateStatus = jest.fn((s) => state.status = s);

        workflow = new Workflow(context, state);
    });

    it('should run through the standard lifecycle (Architect -> Plan -> Execute -> Complete)', async () => {
        // Mock Planner specifically because it might return something that needs parsing?
        // Planner calls promptEngine.render (mocked)
        // Planner calls driver.execute (mocked).
        // Planner expects valid YAML plan from driver?
        // If driver returns {}, Planner might fail to parse "plan".
        // Planner.generatePlan returns `Plan` object.
        // Let's verify Planner.ts behavior on empty response.
        // It likely parses response.
        // If driver returns empty object, `output` is undefined -> crash?

        // We might need to mock module Planner if it's complex.
        // But let's try to mock the specific calls.

        // Architect and Planner rely on driver output.
        // For Architect, it just runs.
        // For Planner, it returns a Plan.

        // We need to inject a valid plan YAML coming from the Driver mock for "Planner" calls.
        // But DriverRegistry.get('gemini') returns the same driver mock.
        // We can make driver.execute return based on input?
        // Or simplified: Just mock the Plan object?
        // But strictly, we removed module mocks.

        // Let's TRY to run it. If it fails, we fix the Driver mock.

        // Planner calls `driver.execute`.
        // Then it parses `response.content`.
        // So mockDriver.execute should return `{ content: "plan_name: test\ntasks: []" }`.

        (context.driverRegistry.get('gemini') as any).execute.mockResolvedValue({
            content: "plan_name: test-plan\ntasks: []"
        });

        await workflow.start('Create a Hello World app');

        expect(context.host.log).toHaveBeenCalledWith('info', 'State: ARCHITECTING');
        expect(context.host.log).toHaveBeenCalledWith('info', 'State: PLANNING');
        expect(context.host.log).toHaveBeenCalledWith('info', 'State: EXECUTING');
        expect(context.host.log).toHaveBeenCalledWith('info', 'Workflow Completed.');

        expect(state.status).toBe('COMPLETED');
    });
});
