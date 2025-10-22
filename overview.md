# AI Architect: Development Specification

## 1. Overview

This document outlines the complete technical specification for the "AI Architect" desktop application. The application is a minimalist, AI-first Integrated Development Environment (IDE) for generating static websites. It operates as a desktop "Orchestrator," using a chat-based interface to direct a series of AI agents (powered by the Gemini CLI) to build, iterate on, and deploy websites.

The core principle is a "hands-off" user experience. The user provides high-level instructions via chat, and the application's backend handles all the complex orchestration, file management, and deployment tasks.

## 2. Core Technologies

- **Runtime:** Electron
- **Language:** TypeScript
- **UI Framework:** React
- **Styling:** Tailwind CSS
- **AI Integration:** Gemini CLI (executed as a child process)
- **Testing:** Jest, React Testing Library, Playwright for Electron

## 3. Application States & UI/UX

The application exists in one of two primary window states, managed by the main Electron process. The design is minimalist, full-screen, and frameless (no default menu bar).

### State 1: Project Hub

This is the initial state of the application when no project is open. Its sole purpose is to create or open a project.

**Layout:** Centered content on a dark background.

_Components:_

- Logo: The application's logo.
- Project Selector: A single UI element that combines:
- A text input for typing a new project name.
- A dropdown/select box that filters existing projects as the user types.
- A "Create" button that becomes active when the typed name is new.
- An "Open" button that becomes active when an existing project is selected.

### State 2: Editor

This is the main application interface, active when a project is open. It operates in full-screen mode.

**Layout:** A three-part vertical layout.

_Components:_

- Header: A thin bar at the top containing the Logo, Share Preview Button, and Publish Button.
- Canvas: The main content area embedding a live website preview via an Electron BrowserView.
- Chat Interface: The primary user interaction panel at the bottom.

## 4. Final Directory Structure

```
/ai-architect-app/
│
├── /agent-definitions/
│   ├── capabilities.yml
│   └── /agents/
│       ├── planner.agent.yml
│       ├── researcher.agent.yml
│       ├── content-manager.agent.yml
│       ├── designer.agent.yml
│       └── illustrator.agent.yml
│
├── /electron/
│   ├── /main/
│   │   ├── index.ts
│   │   ├── windows.ts
│   │   ├── executor.ts
│   │   └── compiler.ts
│   │
│   ├── /preload/
│   │   └── index.ts
│   │
│   ├── /services/
│   │   ├── github.service.ts
│   │   ├── cloudflare.service.ts
│   │   ├── gemini.service.ts
│   │   ├── filesystem.service.ts
│   │   └── deployment.service.ts
│   │
│   └── /common/
│       └── types.ts
│
├── /src/
│   ├── /pages/
│   │   ├── ProjectHub.tsx
│   │   └── Editor.tsx
│   │
│   ├── /components/
│   │   ├── /editor/
│   │   │   ├── Header.tsx
│   │   │   ├── Canvas.tsx
│   │   │   └── /chat/
│   │   │       ├── Chat.tsx
│   │   │       ├── ChatHistory.tsx
│   │   │       └── CommandBar.tsx
│   │   │
│   │   └── /shared/
│   │       ├── Button.tsx
│   │       ├── FilePill.tsx
│   │       ├── FileUpload.tsx
│   │       ├── Logo.tsx
│   │       ├── SelectBox.tsx
│   │       └── TextInput.tsx
│   │
│   ├── /assets/
│   │   └── logo.svg
│   │
│   ├── main.tsx
│   ├── App.tsx
│   └── index.css
│
├── package.json
├── tsconfig.json
└── tailwind.config.cjs
```

## 5. Data Models & Types

All shared TypeScript interfaces reside in **electron/common/types.ts**.

```
// electron/common/types.ts

export interface Project {
  name: string;
  path: string; // Absolute path to the project directory
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  files?: string[]; // Array of local file paths
  timestamp: Date;
}

export interface AgentDefinition {
  name: string;
  description: string;
  version: number;
  executable: string;
  cli_options?: { [key: string]: string };
  prompt_template: string;
}

export interface Task {
  name: string;
  agent: string; // Corresponds to an AgentDefinition name
  notice: string; // Message to show the user
  prompt?: string; // Prompt to be passed to the agent
  action?: string; // For hard-coded services (e.g., 'compiler.run')
  params?: { [key: string]: any };
  output?: string;
}

export interface Plan {
  plan_name: string;
  tasks: Task[];
}
```

## 6. Agent & Capability Definitions

These YAML files configure the AI's tools.

**capabilities.yml** Structure

A list of agent names and their descriptions, used by the Planner Agent.

```
- name: "ContentManager"
  description: "Writes, updates, or refactors YAML content in the main project.yml file. Use for any content changes, adding pages, or modifying site structure."
- name: "IllustratorAgent"
  description: "Generates new images from a text prompt. Use when the user asks for a new picture, logo, or icon."

... and so on for all agents
```

```
\*.agent.yml Structure
```

Defines a single agent's properties and prompt template.

e.g., **/agent-definitions/agents/illustrator.agent.yml**

```
name: "IllustratorAgent"
description: "Generates images based on a text prompt."
version: 1.0
executable: "gemini"
cli_options:
command: "--generate-image"
output_flag: "--output-file"
prompt_template: |
Generate a high-resolution, photorealistic image based on the following description:

---

{user_prompt}

---
```

Save the output to the specified file path.

## 7. Backend API & Function Prototypes

### 7.1. Preload API (electron/preload/index.ts)

This is the secure contract between the Frontend (React) and the Backend (Electron Main).

```
// The interface for window.electronAPI
export interface IElectronAPI {
  // Project Management
  listProjects: () => Promise<Project[]>;
  openProject: (projectName: string) => Promise<void>;
  createProject: (projectName: string) => Promise<void>;
  getCurrentProject: () => Promise<Project | null>;

  // File Dialog
  openFileDialog: () => Promise<string[] | undefined>;

  // Chat Interaction
  sendMessage: (message: Pick<ChatMessage, 'text' | 'files'>) => Promise<void>;
  // This is the correct pattern for main-to-renderer communication
  onNewMessage: (callback: (event: IpcRendererEvent, message: ChatMessage) => void) => () => void; // Returns a function to remove the listener

  // Deployment
  deployPreview: () => Promise<{ success: boolean, url?: string }>;
  publishSite: () => Promise<{ success: boolean, url?: string }>;
}
```

### 7.2. Main Process Logic (electron/main/)

```
// electron/main/windows.ts
export function createHubWindow(): BrowserWindow;
export function createEditorWindow(project: Project): BrowserWindow;

// electron/main/executor.ts
export namespace Executor {
  export function runPlan(planFilePath: string, project: Project): Promise<void>;
}

// electron/main/compiler.ts
export namespace Compiler {
  export function run(project: Project): Promise<void>;
}

// electron/main/index.ts (IPC Handlers)
// This file will contain the app lifecycle events and the implementation
// for the IElectronAPI interface, routing calls from the UI to the
// appropriate services or logic.
app.on('ready', () => { /_ ... _/ });
ipcMain.handle('sendMessage', async (event, message) => { /_ ... trigger planner & executor ... _/ });
ipcMain.handle('publishSite', async () => { /_ ... call DeploymentService.runProductionDeployment ... _/ });
```

### 7.3. Services (electron/services/)

```
// electron/services/gemini.service.ts
export namespace GeminiService {
  export function execute(prompt: string, args?: string[]): Promise<string>;
  export function createPlan(userInput: string, project: Project): Promise<string>; // Returns path to the new task.yml
}

// electron/services/deployment.service.ts
export namespace DeploymentService {
  export function runPreviewDeployment(project: Project): Promise<{ success: boolean; url?: string }>;
  export function runProductionDeployment(project: Project): Promise<{ success: boolean; url?: string }>;
}

// electron/services/github.service.ts
export namespace GithubService {
  export function commitAndPush(projectPath: string, message: string, branch: string): Promise<void>;
  export function createRepo(name: string): Promise<{ success: boolean, url?: string }>;
}

// electron/services/cloudflare.service.ts
export namespace CloudflareService {
  export function waitForBuild(projectName: string, deploymentType: 'preview' | 'production'): Promise<{ success: boolean; url: string }>;
}

// electron/services/filesystem.service.ts
export namespace FileSystemService {
  export function listProjects(): Promise<Project[]>;
  export function createProject(name: string): Promise<Project>;
  export function readAgentDefinition(agentName: string): Promise<AgentDefinition>;
  export function savePlan(projectPath: string, plan: Plan): Promise<string>;
  export function readProjectConfig(projectPath: string): Promise<any>; // Reads project.yml
  export function writeProjectConfig(projectPath: string, data: any): Promise<void>;
}
```

## 8. Frontend Component Interfaces (Props)

These interfaces define the contract for each React component.

```
// in /src/pages/ProjectHub.tsx
export interface ProjectHubProps {}

// in /src/pages/Editor.tsx
export interface EditorProps {}

// in /src/components/shared/Logo.tsx
export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

// in /src/components/shared/Button.tsx
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
}

// in /src/components/shared/TextInput.tsx
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// in /src/components/shared/SelectBox.tsx
export interface SelectBoxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// in /src/components/hub/ProjectSelector.tsx
export interface ProjectSelectorProps {
  projects: Project[];
  onOpen: (projectName: string) => void;
  onCreate: (projectName: string) => void;
}

// in /src/components/editor/Header.tsx
export interface HeaderProps {
  project: Project;
}

// in /src/components/editor/Canvas.tsx
export interface CanvasProps {} // This component will be a simple wrapper

// in /src/components/editor/chat/Chat.tsx
export interface ChatProps {
  project: Project;
}

// in /src/components/editor/chat/ChatHistory.tsx
export interface ChatHistoryProps {
  messages: ChatMessage[];
}

// in /src/components/shared/FileUpload.tsx
export interface FileUploadProps {
  onFilesSelected: (filePaths: string[]) => void;
}

// in /src/components/shared/FilePill.tsx
export interface FilePillProps {
  filePath: string;
  onRemove: (path: string) => void;
}

// in /src/components/editor/chat/CommandBar.tsx
export interface CommandBarProps {
  isExecuting: boolean;
}
```
