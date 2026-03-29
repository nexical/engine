import { jest } from '@jest/globals';

import { IProject } from '../../../src/domain/Project.js';
import { IRuntimeHost } from '../../../src/domain/RuntimeHost.js';
import { DriverRegistry } from '../../../src/drivers/DriverRegistry.js';
import { SkillRegistry } from '../../../src/services/SkillRegistry.js';

describe('SkillRegistry', () => {
  let mockProject: {
    paths: { skills: string };
    fileSystem: {
      isDirectory: jest.Mock;
      listFiles: jest.Mock;
      readFile: jest.Mock;
    };
  };
  let mockHost: {
    log: jest.Mock;
  };
  let mockDriverRegistry: DriverRegistry;

  beforeEach(() => {
    mockProject = {
      paths: {
        skills: '/project/skills',
      },
      fileSystem: {
        isDirectory: jest.fn(),
        listFiles: jest.fn(),
        readFile: jest.fn(),
      },
    };
    mockHost = {
      log: jest.fn(),
    };
    mockDriverRegistry = {} as unknown as DriverRegistry;
  });

  describe('init', () => {
    it('should load skills from both default and project paths', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );

      mockProject.fileSystem.isDirectory.mockReturnValue(true);
      mockProject.fileSystem.listFiles
        .mockReturnValueOnce(['test1.skill.yml']) // Default path
        .mockReturnValueOnce(['test2.skill.yaml']); // User path

      mockProject.fileSystem.readFile
        .mockReturnValueOnce('name: test1\ndescription: desc1')
        .mockReturnValueOnce('name: test2\ndescription: desc2');

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
      mockProject.fileSystem.isDirectory.mockReturnValue(false);

      await registry.init();

      expect(mockProject.fileSystem.listFiles).not.toHaveBeenCalled();
    });

    it('should handle invalid YAML or schema errors', async () => {
      const registry = new SkillRegistry(
        mockProject as unknown as IProject,
        mockDriverRegistry as unknown as DriverRegistry,
        mockHost as unknown as IRuntimeHost,
      );
      mockProject.fileSystem.isDirectory.mockReturnValue(true);
      mockProject.fileSystem.listFiles.mockReturnValue(['invalid.skill.yml']);
      mockProject.fileSystem.readFile.mockReturnValue('invalid: yaml: :'); // Syntax error

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
      mockProject.fileSystem.isDirectory.mockReturnValue(true);
      mockProject.fileSystem.listFiles.mockReturnValue(['test.skill.yml', 'README.md', 'other.yml']);

      mockProject.fileSystem.readFile
        .mockReturnValueOnce('name: test\ndescription: desc')
        .mockReturnValueOnce('name: other\ndescription: desc');

      await registry.init();

      expect(registry.getSkill('test')).toBeDefined();
      expect(registry.getSkill('other')).toBeDefined();
      expect(mockProject.fileSystem.readFile).toHaveBeenCalledTimes(4);
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
      mockProject.fileSystem.isDirectory.mockReturnValue(true);
      mockProject.fileSystem.listFiles.mockReturnValue(['s1.skill.yml']);
      mockProject.fileSystem.readFile.mockReturnValue('name: s1\ndescription: d1');
      await registry.init();

      const skills = registry.getSkills();
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0].name).toBe('s1');
    });
  });
});
