import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { Planner as PlannerType } from '../../src/planner.js';
import type { Plan } from '../../src/models/Plan.js';

const mockPlanUtils = {
    toYaml: jest.fn(),
    fromYaml: jest.fn()
};

jest.unstable_mockModule('../../src/models/Plan.js', () => ({
    PlanUtils: mockPlanUtils
}));

const { Planner } = await import('../../src/planner.js');

describe('Planner', () => {
    let planner: PlannerType;
    let mockOrchestrator: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockPlugin = {
            execute: (jest.fn() as any).mockResolvedValue('tasks: []')
        };

        mockOrchestrator = {
            config: {
                appPath: '/app',
                agentsPath: '/agents',
                historyPath: '/history'
            },
            disk: {
                exists: jest.fn().mockReturnValue(true),
                readFile: jest.fn().mockReturnValue('template'),
                writeFile: jest.fn()
            },
            agentRegistry: {
                getDefault: jest.fn().mockReturnValue(mockPlugin)
            }
        };

        mockPlanUtils.toYaml.mockReturnValue('yaml content');
        mockPlanUtils.fromYaml.mockReturnValue({ tasks: [] });

        planner = new Planner(mockOrchestrator);
    });

    describe('constructor', () => {
        it('should load planner prompt from project if exists', () => {
            expect(mockOrchestrator.disk.exists).toHaveBeenCalledWith('/agents/planner.md');
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/planner.md');
        });

        it('should load planner prompt from core if project missing', () => {
            mockOrchestrator.disk.exists.mockReturnValue(false);
            // Re-instantiate to trigger constructor logic
            new Planner(mockOrchestrator);
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/app/prompts/planner.md');
        });
    });

    describe('generatePlan', () => {
        it('should generate a plan successfully', async () => {
            const plan = await planner.generatePlan('user prompt');

            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/capabilities.yml');
            expect(mockPlugin.execute).toHaveBeenCalled();
            expect(mockPlanUtils.fromYaml).toHaveBeenCalledWith('tasks: []');
            expect(plan).toEqual({ tasks: [] });
        });

        it('should handle missing capabilities file', async () => {
            mockOrchestrator.disk.exists.mockImplementation((path: string) => {
                if (path.includes('planner.md')) return true;
                if (path.includes('capabilities.yml')) return false;
                return false;
            });

            await planner.generatePlan('user prompt');

            expect(mockOrchestrator.disk.readFile).not.toHaveBeenCalledWith('/agents/capabilities.yml');
            expect(mockOrchestrator.disk.readFile).toHaveBeenCalledWith('/agents/planner.md');
        });

        it('should save plan to history', async () => {
            await planner.generatePlan('user prompt');

            expect(mockPlanUtils.toYaml).toHaveBeenCalledWith({ tasks: [] });
            expect(mockOrchestrator.disk.writeFile).toHaveBeenCalledWith(
                expect.stringMatching(/\/history\/plan-\d{4}-\d{2}-\d{2}\.\d{2}-\d{2}-\d{2}\.yml/),
                'yaml content'
            );
        });

        it('should throw if no default plugin', async () => {
            mockOrchestrator.agentRegistry.getDefault.mockReturnValue(undefined);
            await expect(planner.generatePlan('user prompt')).rejects.toThrow('No default agent plugin registered');
        });

        it('should handle execution errors', async () => {
            mockPlugin.execute.mockRejectedValue(new Error('Execution failed'));
            await expect(planner.generatePlan('user prompt')).rejects.toThrow('Execution failed');
        });
    });
});
