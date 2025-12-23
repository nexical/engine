
import { jest } from '@jest/globals';

const mockRender = jest.fn();
const mockConfigure = jest.fn();
const mockEnvironment = jest.fn();
const mockFileSystemLoader = jest.fn();

jest.unstable_mockModule('nunjucks', () => ({
    configure: mockConfigure,
    Environment: mockEnvironment,
    FileSystemLoader: mockFileSystemLoader,
    default: {
        configure: mockConfigure,
        Environment: mockEnvironment,
        FileSystemLoader: mockFileSystemLoader
    }
}));

const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('template content'),
};
jest.unstable_mockModule('fs-extra', () => ({ default: mockFs, ...mockFs }));

const { PromptEngine } = await import('../../../src/services/PromptEngine.js');

describe('PromptEngine', () => {
    let engine: InstanceType<typeof PromptEngine>;
    let mockHost: any;
    let mockEnv: any;

    beforeEach(() => {
        mockHost = { log: jest.fn() };
        mockEnv = { render: mockRender };
        // Environment constructor call needs to return instance
        mockEnvironment.mockReturnValue(mockEnv);
        // FileSystemLoader constructor call
        mockFileSystemLoader.mockReturnValue({});

        mockFs.existsSync.mockReturnValue(true);

        engine = new PromptEngine({ promptDirectory: '/prompts', appDirectory: '/app' }, mockHost);
    });

    it('should render template', () => {
        mockRender.mockReturnValue('rendered content');
        const result = engine.render('template.j2', {});
        expect(result).toBe('rendered content');
        expect(mockRender).toHaveBeenCalled();
    });

    it('should log error on render failure', () => {
        mockRender.mockImplementation(() => { throw new Error('fail'); });

        expect(() => engine.render('template.j2', {})).toThrow('fail');
        expect(mockHost.log).toHaveBeenCalledWith('error', expect.any(String));
        expect(mockHost.log).not.toHaveBeenCalledWith('warn', expect.anything());
    });

    it('should warn if no prompt paths found', () => {
        (mockFs.existsSync as jest.Mock).mockReturnValue(false);
        // Re-initialize PromptEngine to trigger the path checking logic
        new PromptEngine({ promptDirectory: '/prompts', appDirectory: '/app' }, mockHost);
        expect(mockHost.log).toHaveBeenCalledWith('debug', expect.stringContaining('NOT FOUND'));
        expect(mockHost.log).toHaveBeenCalledWith('warn', 'No valid prompt search paths found. Prompt rendering may fail.');
    });
});
