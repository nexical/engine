
import { jest } from '@jest/globals';
import { Session } from '../../../src/domain/Session.js';
import { IProject } from '../../../src/domain/Project.js';
import { IWorkspace } from '../../../src/domain/Workspace.js';
import { Brain } from '../../../src/agents/Brain.js';
import { RuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { EngineState } from '../../../src/domain/State.js';

// Mock Workflow
jest.mock('../../../src/workflow/Workflow.js', () => {
    return {
        Workflow: jest.fn().mockImplementation(() => ({
            start: jest.fn().mockResolvedValue(undefined)
        }))
    };
});

describe('Session', () => {
    let session: Session;
    let mockProject: jest.Mocked<IProject>;
    let mockWorkspace: jest.Mocked<IWorkspace>;
    let mockBrain: jest.Mocked<Brain>;
    let mockHost: jest.Mocked<RuntimeHost>;

    beforeEach(() => {
        mockProject = {} as unknown as jest.Mocked<IProject>;
        mockWorkspace = {
            loadState: jest.fn(),
            saveState: jest.fn()
        } as unknown as jest.Mocked<IWorkspace>;
        mockBrain = {
            getEvolution: jest.fn().mockReturnValue({ recordFailure: jest.fn() })
        } as unknown as jest.Mocked<Brain>;
        mockHost = {
            log: jest.fn(),
            error: jest.fn(),
            emit: jest.fn()
        } as unknown as jest.Mocked<RuntimeHost>;

        session = new Session(mockProject, mockWorkspace, mockBrain, mockHost);
    });

    it('should be defined', () => {
        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        expect(session.state).toBeInstanceOf(EngineState);
    });

    describe('start', () => {
        it('should initialize state and run workflow', async () => {
            const spyInitialize = jest.spyOn(session.state, 'initialize');
            await session.start('prompt', true);
            expect(spyInitialize).toHaveBeenCalledWith('prompt', true);
        });

        it('should use default interactive value (false) if not provided', async () => {
            const spyInitialize = jest.spyOn(session.state, 'initialize');
            await session.start('prompt');
            expect(spyInitialize).toHaveBeenCalledWith('prompt', false);
        });
    });

    describe('resume', () => {
        it('should load state and run workflow', async () => {
            const mockLoadedState = new EngineState('loaded_id');
            mockLoadedState.status = 'PLANNING';
            mockWorkspace.loadState.mockResolvedValue(mockLoadedState);

            await session.resume();

            expect(session.state).toBe(mockLoadedState);
            expect(mockHost.log).toHaveBeenCalledWith('info', expect.stringContaining('Resuming session'));
        });

        it('should throw if no state found', async () => {
            mockWorkspace.loadState.mockResolvedValue(undefined);
            await expect(session.resume()).rejects.toThrow('No saved state found');
        });
    });
});
