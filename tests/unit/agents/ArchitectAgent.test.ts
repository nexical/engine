
import { jest } from '@jest/globals';
import { ArchitectAgent } from '../../../src/agents/ArchitectAgent.js';
import { IProject } from '../../../src/domain/Project.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { IPromptEngine } from '../../../src/services/PromptEngine.js';
import { IDriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { IEvolutionService } from '../../../src/services/EvolutionService.js';
import { Driver } from '../../../src/domain/Driver.js';
import { ExecutionResult } from '../../../src/domain/ExecutionResult.js';

describe('ArchitectAgent', () => {
    let agent: ArchitectAgent;
    let mockProject: jest.Mocked<IProject>;
    let mockWorkspace: jest.Mocked<IWorkspace>;
    let mockPromptEngine: jest.Mocked<IPromptEngine>;
    let mockDriverRegistry: jest.Mocked<IDriverRegistry>;
    let mockEvolution: jest.Mocked<IEvolutionService>;
    let mockDriver: jest.Mocked<Driver>;

    beforeEach(() => {
        mockProject = {
            getConstraints: jest.fn().mockReturnValue('constraints'),
            paths: {
                architecturePrompt: 'arch_prompt_path',
                architectureCurrent: 'arch_current_path',
                personas: 'personas_path'
            },
            getConfig: jest.fn().mockReturnValue({ agents: { architect: { skill: 'arch_skill', driver: 'test_driver' } } })
        } as unknown as jest.Mocked<IProject>;

        mockWorkspace = {
            getArchitecture: jest.fn(),
            archiveArtifacts: jest.fn(),
        } as unknown as jest.Mocked<IWorkspace>;

        mockPromptEngine = {
            render: jest.fn().mockReturnValue('rendered content'),
        } as unknown as jest.Mocked<IPromptEngine>;

        mockDriver = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<Driver>;

        mockDriverRegistry = {
            get: jest.fn().mockReturnValue(mockDriver),
            getDefault: jest.fn(),
        } as unknown as jest.Mocked<IDriverRegistry>;

        mockEvolution = {
            getLogSummary: jest.fn().mockReturnValue('evolution log'),
        } as unknown as jest.Mocked<IEvolutionService>;

        agent = new ArchitectAgent(mockProject, mockWorkspace, mockPromptEngine, mockDriverRegistry, mockEvolution);
    });

    it('should be defined', () => {
        expect(agent).toBeDefined();
    });

    describe('design', () => {
        it('should execute design process successfully', async () => {
            const mockResult = {
                isFail: () => false,
                data: 'some data'
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);

            const mockArchitecture = { id: 'arch1' };
            mockWorkspace.getArchitecture.mockResolvedValue(mockArchitecture as any);

            const result = await agent.design('user request');

            expect(mockPromptEngine.render).toHaveBeenCalled();
            expect(mockDriverRegistry.get).toHaveBeenCalledWith('test_driver');
            expect(mockDriver.execute).toHaveBeenCalled();
            expect(mockWorkspace.getArchitecture).toHaveBeenCalledWith('current');
            expect(mockWorkspace.archiveArtifacts).toHaveBeenCalled();
            expect(result).toBe(mockArchitecture);
        });

        it('should throw if no driver available', async () => {
            mockDriverRegistry.get.mockReturnValue(undefined);
            mockDriverRegistry.getDefault.mockReturnValue(undefined);

            await expect(agent.design('req')).rejects.toThrow("No driver available");
        });

        it('should throw if driver execution fails', async () => {
            const mockResult = {
                isFail: () => true,
                error: () => new Error('Driver failed')
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);

            await expect(agent.design('req')).rejects.toThrow('Driver failed');
        });

        it('should use default values if config is missing', async () => {
            const mockResult = {
                isFail: () => false,
                data: 'data'
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);
            mockWorkspace.getArchitecture.mockResolvedValue({} as any);

            mockProject.getConfig.mockReturnValue({}); // Empty config

            await agent.design('req');

            expect(mockDriverRegistry.get).toHaveBeenCalledWith('gemini');
            expect(mockDriver.execute).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'architect' }),
                expect.anything()
            );
        });

        it('should fallback to default driver if requested driver not found', async () => {
            const mockResult = {
                isFail: () => false,
                data: 'data'
            } as ExecutionResult<any>;
            mockDriver.execute.mockResolvedValue(mockResult);
            mockWorkspace.getArchitecture.mockResolvedValue({} as any);

            mockDriverRegistry.get.mockReturnValue(undefined);
            mockDriverRegistry.getDefault.mockReturnValue(mockDriver);

            await agent.design('req');

            expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
            expect(mockDriver.execute).toHaveBeenCalled();
        });
    });
});

