import { jest } from '@jest/globals';

import { IDriver } from '../../../src/domain/Driver.js';
import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { SkillRegistry } from '../../../src/services/SkillRegistry.js';

describe('SkillRegistry', () => {
  let mockProject: {
    paths: { skills: string };
    fileSystem: {
      isDirectory: jest.Mock<(p: string) => Promise<boolean>>;
      listFiles: jest.Mock<(p: string) => Promise<string[]>>;
      readFile: jest.Mock<(p: string) => Promise<string>>;
    };
    rootDirectory: string;
    getConstraints: jest.Mock<() => Promise<string>>;
    getConfig: jest.Mock<() => Promise<Record<string, unknown>>>;
  };
  let mockHost: {
    log: jest.Mock;
    ask: jest.Mock;
  };
  let mockDriverRegistry: jest.Mocked<DriverRegistry>;

  beforeEach(() => {
    mockProject = {
      paths: {
        skills: '/project/skills',
      },
      fileSystem: {
        isDirectory: jest.fn<(_p: string) => Promise<boolean>>(),
        listFiles: jest.fn<(_p: string) => Promise<string[]>>(),
        readFile: jest.fn<(_p: string) => Promise<string>>(),
      },
      rootDirectory: '/project',
      getConstraints: jest.fn<() => Promise<string>>().mockResolvedValue(''),
      getConfig: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
    };
    mockHost = {
      log: jest.fn(),
      ask: jest.fn(),
    };
    mockDriverRegistry = {
      get: jest.fn(),
    } as unknown as jest.Mocked<DriverRegistry>;
  });

  describe('init', () => {
    it('should load skills from both default and project paths', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );

      mockProject.fileSystem.isDirectory.mockResolvedValue(true);
      mockProject.fileSystem.listFiles
        .mockResolvedValueOnce(['test1.skill.yml']) // Default path
        .mockResolvedValueOnce(['test2.skill.yaml']); // User path

      mockProject.fileSystem.readFile
        .mockResolvedValueOnce('name: test1\ndescription: desc1')
        .mockResolvedValueOnce('name: test2\ndescription: desc2');

      await registry.init();

      expect(registry.getSkill('test1')).toBeDefined();
      expect(registry.getSkill('test2')).toBeDefined();
      expect(mockHost.log).toHaveBeenCalledWith('debug', expect.stringContaining('Loading Default skills'));
      expect(mockHost.log).toHaveBeenCalledWith('debug', expect.stringContaining('Loading User skills'));
    });

    it('should skip non-existent directories', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      mockProject.fileSystem.isDirectory.mockResolvedValue(false);

      await registry.init();

      expect(mockProject.fileSystem.listFiles).not.toHaveBeenCalled();
    });

    it('should handle invalid YAML or schema errors', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      mockProject.fileSystem.isDirectory.mockResolvedValue(true);
      mockProject.fileSystem.listFiles.mockResolvedValue(['invalid.skill.yml']);
      mockProject.fileSystem.readFile.mockResolvedValue('invalid: yaml: :'); // Syntax error

      await registry.init();

      expect(registry.getSkill('invalid')).toBeUndefined();
      expect(mockHost.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Error loading skill profile invalid.skill.yml'),
      );
    });

    it('should only load files with correct extensions', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      mockProject.fileSystem.isDirectory.mockResolvedValue(true);
      mockProject.fileSystem.listFiles
        .mockResolvedValueOnce(['test.skill.yml', 'README.md', 'other.yml'])
        .mockResolvedValueOnce([]); // Second search path is empty

      mockProject.fileSystem.readFile
        .mockResolvedValueOnce('name: test\ndescription: desc')
        .mockResolvedValueOnce('name: other\ndescription: desc');

      await registry.init();

      expect(registry.getSkill('test')).toBeDefined();
      expect(registry.getSkill('other')).toBeDefined();
      expect(mockProject.fileSystem.readFile).toHaveBeenCalledTimes(2); // README.md is skipped, 2 files from first path
    });
  });

  describe('getSkill', () => {
    it('should return undefined if skill not found', () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      expect(registry.getSkill('non-existent')).toBeUndefined();
    });
  });

  describe('getSkills', () => {
    it('should return all loaded skills', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      mockProject.fileSystem.isDirectory.mockResolvedValue(true);
      mockProject.fileSystem.listFiles.mockResolvedValue(['s1.skill.yml']);
      mockProject.fileSystem.readFile.mockResolvedValue('name: s1\ndescription: d1');
      await registry.init();

      const skills = registry.getSkills();
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].name).toBe('s1');
    });
  });

  describe('loadYamlSkills edge cases', () => {
    it('should validate driver config if provider is specified', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );

      const mockDriver = {
        name: 'test-driver',
        execute: jest.fn(),
        isSupported: jest.fn(),
        getEnvironmentSpec: jest.fn(),
        validateConfig: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      } as unknown as IDriver;
      mockDriverRegistry.get.mockReturnValue(mockDriver);

      mockProject.fileSystem.isDirectory.mockResolvedValue(true);
      mockProject.fileSystem.listFiles.mockResolvedValue(['driver.skill.yml']);
      mockProject.fileSystem.readFile.mockResolvedValue('name: driver-skill\nexecution:\n  provider: test-driver');

      await registry.init();

      expect(mockDriverRegistry.get).toHaveBeenCalledWith('test-driver');
      expect(mockDriver.validateConfig).toHaveBeenCalled();
    });

    it('should handle missing directory during load', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      // Simulate default path missing but user path existing
      mockProject.fileSystem.isDirectory.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      mockProject.fileSystem.listFiles.mockResolvedValue(['user.skill.yml']);
      mockProject.fileSystem.readFile.mockResolvedValue('name: user-skill');

      await registry.init();

      expect(registry.getSkill('user-skill')).toBeDefined();
    });
  });
});
