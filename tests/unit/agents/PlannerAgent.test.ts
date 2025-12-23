
import { jest } from '@jest/globals';
import { PlannerAgent } from '../../../src/agents/PlannerAgent.js';
import { IProject } from '../../../src/domain/Project.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { ISkillRunner } from '../../../src/services/SkillRunner.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { Driver } from '../../../src/domain/Driver.js';
import { Architecture } from '../../../src/domain/Architecture.js';
import { ExecutionResult } from '../../../src/domain/ExecutionResult.js';

describe('PlannerAgent', () => {
    let agent: PlannerAgent;
    let mockProject: jest.Mocked<IProject>;
    let mockWorkspace: jest.Mocked<IWorkspace>;
    let mockPromptEngine: jest.Mocked<IPromptEngine>;
    let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
    let mockSkillRunner: jest.Mocked<ISkillRunner>;
    let mockEvolution: jest.Mocked<IEvolutionService>;
    let mockDriver: jest.Mocked<Driver>;

    beforeEach(() => {
        mockProject = {
            getConstraints: jest.fn().mockReturnValue('constraints'),
            paths: {
                plannerPrompt: 'planner_prompt',
                planCurrent: 'plan_current',
                personas: 'personas_path'
            },
            getConfig: jest.fn().mockReturnValue({ agents: { planner: { skill: 'planner_skill', driver: 'test_driver' } } })
        } as unknown as jest.Mocked<IProject>;

        mockWorkspace = {
            loadPlan: jest.fn(),
        } as unknown as jest.Mocked<IWorkspace>;

        mockPromptEngine = {
            render: jest.fn().mockReturnValue('rendered prompt'),
        } as unknown as jest.Mocked<IPromptEngine>;

        mockDriver = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<Driver>;

        mockDriverRegistry = {
            get: jest.fn().mockReturnValue(mockDriver),
            getDefault: jest.fn(),
        } as unknown as jest.Mocked<IDriverRegistry>;

        mockSkillRunner = {
            getSkills: jest.fn().mockReturnValue([]),
        } as unknown as jest.Mocked<ISkillRunner>;

        mockEvolution = {
            getLogSummary: jest.fn(),
        } as unknown as jest.Mocked<IEvolutionService>;

        agent = new PlannerAgent(mockProject, mockWorkspace, mockPromptEngine, mockDriverRegistry, mockSkillRunner, mockEvolution);
    });

    it('should be defined', () => {
        expect(agent).toBeDefined();
    });

    describe('plan', () => {
        it('should create a plan successfully', async () => {
            const mockArch = { data: {} } as Architecture;
            const mockResult = {
                isFail: () => false
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);

            const mockPlan = { plan_name: 'test' };
            mockWorkspace.loadPlan.mockResolvedValue(mockPlan as any);

            const result = await agent.plan(mockArch, 'user request');

            expect(mockPromptEngine.render).toHaveBeenCalled();
            expect(mockDriverRegistry.get).toHaveBeenCalledWith('test_driver');
            expect(mockDriver.execute).toHaveBeenCalled();
            expect(mockWorkspace.loadPlan).toHaveBeenCalled();
            expect(result).toBe(mockPlan);
        });

        it('should throw if driver execution fails', async () => {
            const mockArch = { data: {} } as Architecture;
            const mockResult = {
                isFail: () => true,
                error: () => new Error('Driver failed')
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);

            await expect(agent.plan(mockArch, 'req')).rejects.toThrow('Driver failed');
        });

        it('should use default values if config is missing', async () => {
            const mockArch = { data: {} } as Architecture;
            const mockResult = {
                isFail: () => false
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);
            mockWorkspace.loadPlan.mockResolvedValue({} as any);

            mockProject.getConfig.mockReturnValue({}); // Empty config

            await agent.plan(mockArch, 'req');

            expect(mockDriverRegistry.get).toHaveBeenCalledWith('gemini');
            expect(mockDriver.execute).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'planner' }),
                expect.anything()
            );
        });

        it('should fallback to default driver if requested driver not found', async () => {
            const mockArch = { data: {} } as Architecture;
            const mockResult = {
                isFail: () => false
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);
            mockWorkspace.loadPlan.mockResolvedValue({} as any);

            mockDriverRegistry.get.mockReturnValue(undefined);
            mockDriverRegistry.getDefault.mockReturnValue(mockDriver);

            await agent.plan(mockArch, 'req');

            expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
            expect(mockDriver.execute).toHaveBeenCalled();
        });

        it('should throw if no driver available', async () => {
            const mockArch = { data: {} } as Architecture;
            mockDriverRegistry.get.mockReturnValue(undefined);
            mockDriverRegistry.getDefault.mockReturnValue(undefined);

            await expect(agent.plan(mockArch, 'req')).rejects.toThrow("No driver available");
        });
    });
});
