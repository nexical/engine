/**
 * @file WorkspaceManagement.test.ts
 *
 * SCOPE:
 * This test verifies the Workspace service functionality.
 * It checks the archiving of old artifacts (e.g. rotating 'current' to 'archive')
 * and the serialization/persistence of the EngineState to disk.
 *
 * COVERAGE:
 * - Workspace.archiveArtifacts().
 * - Workspace.saveState() / loadState().
 * - File system interactions for project data.
 */

import fs from 'fs-extra';
import path from 'path';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Workspace Management Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async (): Promise<void> => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async (): Promise<void> => {
    await fixture.cleanup();
  });

  test('should archive artifacts and serialize state correctly (Scenario 6 & 9)', async (): Promise<void> => {
    const orchestrator = await fixture.initOrchestrator();

    const workspace = orchestrator.workspace;
    const project = orchestrator.project;

    // 1. Test Archiving (Scenario 6)
    // Create a dummy architecture file
    await fs.ensureDir(path.dirname(project.paths.architectureCurrent));
    await fs.writeFile(project.paths.architectureCurrent, 'V1 Architecture');

    // Archive it
    await workspace.archiveArtifacts();

    // Verify current file is gone and archive has it
    expect(fs.existsSync(project.paths.architectureCurrent)).toBe(false);
    const archiveDir = project.paths.archive;
    const archivedFiles = await fs.readdir(archiveDir);
    expect(archivedFiles.length).toBeGreaterThan(0);
    expect(archivedFiles[0]).toContain('.architecture.md');

    // 2. Test State Persistence (Scenario 9)
    const state = orchestrator.session.state;
    state.updateStatus('ARCHITECTING');
    state.user_prompt = 'Complex Prompt with "Quotes" and \n Newlines';

    await workspace.saveState(state);

    const stateFile = project.paths.state;
    expect(fs.existsSync(stateFile)).toBe(true);

    const loadedState = await workspace.loadState();
    expect(loadedState).toBeDefined();
    expect(loadedState?.status).toBe('ARCHITECTING');
    expect(loadedState?.user_prompt).toBe(state.user_prompt);
    expect(loadedState?.session_id).toBe(state.session_id);
  });
});
