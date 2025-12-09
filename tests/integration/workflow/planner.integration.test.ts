import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import { Planner } from '../../../src/workflow/planner.js';
import { Orchestrator } from '../../../src/orchestrator.js';
import { SkillRegistry } from '../../../src/services/SkillRegistry.js';
import { FileSystemService } from '../../../src/services/FileSystemService.js';
import { Skill } from '../../../src/models/Skill.js';

// Mock dependencies
jest.mock('../../../src/services/SkillRegistry.js');
jest.mock('../../../src/services/FileSystemService.js');

describe('Planner Integration Tests', () => {
    let orchestrator: Orchestrator;
    let planner: Planner;
    let mockSkillRegistry: jest.Mocked<SkillRegistry>;
    let mockDisk: jest.Mocked<FileSystemService>;
    let mockSkill: jest.Mocked<Skill>;

    const mockPlanYaml = `
plan_name: Mock Plan
tasks:
  - id: task-1
    message: Do something
    dependencies: []
`;

    beforeEach(() => {
        // Setup mock Skill
        mockSkill = {
            name: 'mock-skill',
            execute: jest.fn<Skill['execute']>().mockResolvedValue(''),
            isSupported: jest.fn().mockReturnValue(true)
        } as unknown as jest.Mocked<Skill>;

        // Setup mock SkillRegistry
        mockSkillRegistry = {
            getDefault: jest.fn().mockReturnValue(mockSkill),
            register: jest.fn(),
            get: jest.fn().mockImplementation((name) => {
                if (name === 'cli') return mockSkill;
                return undefined;
            }),
            getAll: jest.fn(),
            load: jest.fn()
        } as unknown as jest.Mocked<SkillRegistry>;

        // Setup mock FileSystemService
        mockDisk = {
            exists: jest.fn().mockReturnValue(true),
            readFile: jest.fn().mockImplementation(((filePath: string) => {
                if (filePath.endsWith('plan.yml')) {
                    return mockPlanYaml;
                }
                return 'Mock Prompt Template';
            }) as any),
            writeFile: jest.fn(),
            writeFileAtomic: jest.fn(),
            appendFile: jest.fn(),
        } as unknown as jest.Mocked<FileSystemService>;

        // Setup partial Orchestrator mock
        orchestrator = {
            config: {
                projectPath: '/mock/project',
                appPath: '/mock/app',
                agentsPath: '/mock/skills',
                historyPath: '/mock/history',
                capabilitiesPath: '/mock/capabilities.json',
                architecturePath: '/mock/architecture.md',
                agentsDefinitionPath: '/mock/agents.md',
                logPath: '/mock/evolution.log',
                planPath: '/mock/plan.yml',
                personasPath: '/mock/personas',
                nexicalPath: '/mock/.nexical'
            },
            disk: mockDisk,
            skillRegistry: mockSkillRegistry,
            promptEngine: {
                render: jest.fn().mockReturnValue('Mock Prompt')
            }
        } as unknown as Orchestrator;

        // Instantiate Planner
        planner = new Planner(orchestrator);

        // Suppress console.error
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should generate a plan and save it to history', async () => {
        const prompt = 'Create a website';

        const plan = await planner.generatePlan(prompt);

        // Verify Skill was called
        expect(mockSkill.execute).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'planner' }),
            '',
            expect.objectContaining({
                userPrompt: prompt,
                params: expect.objectContaining({
                    prompt: 'Mock Prompt'
                })
            })
        );

        // Verify Plan structure
        expect(plan).toBeDefined();
        expect(plan.plan_name).toBe('Mock Plan');
        expect(plan.tasks).toHaveLength(1);
        expect(plan.tasks[0].id).toBe('task-1');
    });

    it('should throw error if CLI skill is not registered', async () => {
        mockSkillRegistry.get.mockReturnValue(undefined);

        await expect(planner.generatePlan('test')).rejects.toThrow('CLI skill not found for planner.');
    });

    it('should handle skill execution failure', async () => {
        mockSkill.execute.mockRejectedValue(new Error('Skill failed'));

        await expect(planner.generatePlan('test')).rejects.toThrow('Skill failed');
    });
});
