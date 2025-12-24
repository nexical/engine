/**
 * @file AgentIntegration.test.ts
 *
 * SCOPE:
 * This test verifies the integration of the ArchitectAgent with the rest of the system.
 * It checks if the agent correctly renders prompts using the configured templates
 * and successfully delegates execution to the registered driver.
 *
 * COVERAGE:
 * - ArchitectAgent.design() method interactions.
 * - Prompt rendering pipeline (PromptEngine).
 * - DriverRegistry lookup and execution.
 */

import { jest } from '@jest/globals';

import { ProjectFixture } from './utils/ProjectFixture.js';

describe('Agent Integration', () => {
  let fixture: ProjectFixture;

  beforeEach(async () => {
    fixture = new ProjectFixture();
    await fixture.setup();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  test('ArchitectAgent should render prompt and call driver', async () => {
    await fixture.writeConfig({ project_name: 'AgentTest' });

    // Create specific prompts required for this test
    await fixture.writePrompt('architect.md', 'User Request: {{ user_request }}');
    await fixture.writePrompt('skill.md', '{{ user_prompt }}');

    const orchestrator = await fixture.initOrchestrator();

    // Register a mock driver that returns a valid architecture result
    const mockResult = { components: [] };
    // We want to verify the prompt was rendered correctly.
    let captureParams: any = null;
    fixture.registerMockDriver('gemini', async (skill: any, ctx: any) => {
      captureParams = ctx;
      return {
        isFail: () => false,
        unwrap: () => JSON.stringify(mockResult),
        error: () => null,
      };
    });

    // Mock Workspace to bypass file reading if needed, though ProjectFixture sets up paths
    // But the agent design method interacts with workspace to load things in some flows.
    // For this specific test, we want to ensure the PromptEngine logic works:
    // ArchitectAgent -> PromptEngine -> render('architect.md', ...)

    // We rely on the real Workspace/FileSystem from the fixture for standard artifacts.
    // But we might need to mock getArchitecture if the agent checks it first.
    jest.spyOn(orchestrator.workspace, 'getArchitecture').mockResolvedValue({ id: 'test-arch' } as any);

    const architect = orchestrator.brain.createArchitect(orchestrator.workspace);
    const result = await architect.design('Create a blog');

    expect(result).toBeDefined();
    expect(captureParams).toBeDefined();
    // The driver receives { userPrompt: ..., params: { prompt: ... } }
    expect(captureParams.params.prompt).toContain('User Request: Create a blog');

    // Verify the driver was called with the rendered prompt
    // We access the mockDriver implementation via the registry for verification
    // But simpler to just spy on the specific mock function if we had access.
    // Since fixture registers the callback, we can't easily spy on the "execute" method itself
    // unless we expose it. However, we can assert on the RESULT or behavior.

    // Alternatively, use a spy on the driver registry or just trust the result flows.
    // Better: ProjectFixture allows us to define the mock driver behavior, but
    // verifying "toHaveBeenCalledWith" requires reference to the specific mock function.
    // We can create an independent spy and use it in the callback.

    // For this level of integration, verifying the result contains expected data
    // (which proves the driver ran) is often enough.
    // But to test PROMPT RENDERING, we check if the driver received the RENDERED string.

    // Let's modify the mock to capture the call args.
    // Or better, let's just assert result is what we passed.
  });
});
