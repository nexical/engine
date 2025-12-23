
import { jest } from '@jest/globals';
import { Result } from '../../../src/domain/Result.js';

// Mocks
const mockDriverRegistry = {
    get: jest.fn(),
    getDefault: jest.fn()
};

const mockPromptEngine = {
    render: jest.fn()
};

const mockProject = {
    paths: {
        skills: '/skills',
        personas: '/personas',
        skillPrompt: 'skill_prompt.j2'
    },
    fileSystem: {
        isDirectory: jest.fn(),
        listFiles: jest.fn(),
        readFile: jest.fn(),
        exists: jest.fn()
    }
};

const mockHost = {
    log: jest.fn()
};

const mockYaml = {
    load: jest.fn()
};

const MockSkillSchema = {
    parse: jest.fn()
};

const mockDriver = {
    name: 'mock-driver',
    isSupported: jest.fn(),
    validateSkill: jest.fn(),
    execute: jest.fn()
};

jest.unstable_mockModule('path', () => ({
    default: { join: (...args: string[]) => args.join('/') }
}));

jest.unstable_mockModule('js-yaml', () => ({
    default: mockYaml
}));

jest.unstable_mockModule('../../../src/domain/Driver.js', () => ({
    SkillSchema: MockSkillSchema
}));

jest.unstable_mockModule('../../../src/drivers/DriverRegistry.js', () => ({
    DriverRegistry: jest.fn()
}));

// SkillRunner is imported here, but we will re-import it in beforeEach to ensure fresh mocks
let SkillRunner: typeof import('../../../src/services/SkillRunner.js').SkillRunner;

describe('SkillRunner', () => {
    let runner: InstanceType<typeof SkillRunner>;

    beforeEach(async () => {
        jest.clearAllMocks();
        // Re-import SkillRunner to ensure it picks up any fresh mocks
        ({ SkillRunner } = await import('../../../src/services/SkillRunner.js'));

        // Default happy path setup
        mockProject.fileSystem.isDirectory.mockReturnValue(true);
        mockProject.fileSystem.listFiles.mockReturnValue(['test.skill.yaml']);
        mockProject.fileSystem.readFile.mockReturnValue('yaml content');

        mockYaml.load.mockReturnValue({ name: 'test-skill', provider: 'mock-driver' });
        MockSkillSchema.parse.mockReturnValue({ name: 'test-skill', provider: 'mock-driver' });

        mockDriverRegistry.get.mockReturnValue(mockDriver);
        mockDriverRegistry.getDefault.mockReturnValue(mockDriver);
        mockDriver.isSupported.mockResolvedValue(true);
        mockDriver.validateSkill.mockResolvedValue(true);

        mockDriver.execute.mockResolvedValue(Result.ok('success'));

        runner = new SkillRunner(mockProject as any, mockDriverRegistry as any, mockPromptEngine as any, mockHost as any);
    });

    describe('init', () => {
        it('should load skills from yaml and yml', async () => {
            mockProject.fileSystem.listFiles.mockReturnValue(['test.skill.yaml', 'other.skill.yml']);
            mockYaml.load
                .mockReturnValueOnce({ name: 'skill1', provider: 'mock-driver' })
                .mockReturnValueOnce({ name: 'skill2', provider: 'mock-driver' });
            MockSkillSchema.parse
                .mockReturnValueOnce({ name: 'skill1', provider: 'mock-driver' })
                .mockReturnValueOnce({ name: 'skill2', provider: 'mock-driver' });

            await runner.init();
            expect(mockProject.fileSystem.listFiles).toHaveBeenCalledWith('/skills');
            expect(mockYaml.load).toHaveBeenCalledTimes(2);
            expect(runner.getSkills()).toHaveLength(2);
        });

        it('should skip non-skill files', async () => {
            mockProject.fileSystem.listFiles.mockReturnValue(['test.txt', 'readme.md']);
            await runner.init();
            expect(mockYaml.load).not.toHaveBeenCalled();
            expect(runner.getSkills()).toHaveLength(0);
        });

        it('should skip if skills dir missing', async () => {
            mockProject.fileSystem.isDirectory.mockReturnValue(false);
            await runner.init();
            expect(mockProject.fileSystem.listFiles).not.toHaveBeenCalled();
        });

        it('should handle skill loading errors', async () => {
            mockYaml.load.mockImplementation(() => { throw new Error('parse error'); });
            await runner.init();
            expect(mockHost.log).toHaveBeenCalledWith('error', expect.stringContaining('Error loading skill profile'));
        });
    });

    describe('validateAvailableSkills', () => {
        beforeEach(async () => {
            await runner.init();
        });

        it('should validate successfully', async () => {
            await runner.validateAvailableSkills();
            expect(mockHost.log).toHaveBeenCalledWith('debug', expect.stringContaining('Validated 1 skills'));
        });

        it('should validate successfully with default driver', async () => {
            MockSkillSchema.parse.mockReturnValue({ name: 'no-provider-skill' });
            await runner.init();
            await runner.validateAvailableSkills();
            expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
        });

        it('should throw if any skill fails validation', async () => {
            mockDriver.validateSkill.mockResolvedValue(false);
            await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
        });

        it('should fail if driver missing', async () => {
            mockDriverRegistry.get.mockReturnValue(undefined);
            await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
        });

        it('should fail if default driver missing for provider-less skill', async () => {
            MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' }); // no provider
            await runner.init(); // reload

            mockDriverRegistry.getDefault.mockReturnValue(undefined);
            await expect(runner.validateAvailableSkills()).rejects.toThrow("needs a default driver but none is available.");
        });

        it('should handle skill validation when driver is not found', async () => {
            // This is hard to trigger because validateAvailableSkills usually throws earlier if driver is missing.
            // But if getDefault() returns undefined, it hits line 68.
            MockSkillSchema.parse.mockReturnValue({ name: 'skill-no-driver' });
            await runner.init();
            mockDriverRegistry.getDefault.mockReturnValue(undefined);
            await expect(runner.validateAvailableSkills()).rejects.toThrow('needs a default driver');
        });

        it('should fail if driver not supported', async () => {
            mockDriver.isSupported.mockResolvedValue(false);
            await expect(runner.validateAvailableSkills()).rejects.toThrow('Skill validation failed');
        });

        it('should handle driver errors during validation', async () => {
            mockDriver.validateSkill.mockImplementation(() => { throw new Error('validation crash'); });
            await expect(runner.validateAvailableSkills()).rejects.toThrow('validation crash');
        });
    });

    describe('runSkill', () => {
        beforeEach(async () => {
            await runner.init();
            mockPromptEngine.render.mockReturnValue('rendered prompt');
        });

        it('should run skill successfully', async () => {
            await runner.runSkill({ id: '1', skill: 'test-skill', description: 'desc', params: {} } as any, 'prompt');
            expect(mockDriver.execute).toHaveBeenCalled();
        });

        it('should fail if skill not found', async () => {
            await expect(runner.runSkill({ skill: 'unknown' } as any, 'prompt')).rejects.toThrow('not found');
        });

        it('should load persona if present', async () => {
            mockProject.fileSystem.exists.mockReturnValue(true);
            mockProject.fileSystem.readFile.mockReturnValue('persona content');

            await runner.runSkill({ skill: 'test-skill', persona: 'coder' } as any, 'prompt');

            expect(mockProject.fileSystem.readFile).toHaveBeenCalledWith('/personas/coder.md');
            expect(mockPromptEngine.render).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ persona_context: 'persona content' })
            );
        });

        it('should warn if persona missing', async () => {
            mockProject.fileSystem.exists.mockReturnValue(false);

            await runner.runSkill({ skill: 'test-skill', persona: 'coder' } as any, 'prompt');

            expect(mockHost.log).toHaveBeenCalledWith('warn', expect.stringContaining('Persona file not found'));
        });

        it('should use default driver if none specified', async () => {
            MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' });
            await runner.init();

            await runner.runSkill({ skill: 'test-skill' } as any, 'prompt');
            expect(mockDriverRegistry.getDefault).toHaveBeenCalled();
        });

        it('should throw if no driver found execution', async () => {
            mockDriverRegistry.get.mockReturnValue(undefined);
            await expect(runner.runSkill({ skill: 'test-skill' } as any, 'prompt')).rejects.toThrow(/Driver '.*' not found/);
        });

        it('should throw if no default driver found during execution', async () => {
            MockSkillSchema.parse.mockReturnValue({ name: 'test-skill' }); // no provider
            await runner.init();

            mockDriverRegistry.getDefault.mockReturnValue(undefined);
            await expect(runner.runSkill({ skill: 'test-skill' } as any, 'prompt')).rejects.toThrow("No driver found for execution.");
        });

        it('should throw if driver execute returns failure', async () => {
            (mockDriver.execute as jest.Mock).mockReturnValue(Promise.resolve(Result.fail(new Error('execution failed'))));
            await expect(runner.runSkill({ skill: 'test-skill' } as any, 'prompt')).rejects.toThrow('execution failed');
        });
    });
});
