/**
 * Core Data Models for the Software Engineer Academy Curriculum DAG
 *
 * The curriculum is modeled as a Directed Acyclic Graph (DAG).
 * Lessons are nodes; prerequisites define directed edges pointing
 * to prerequisite lessons that must be completed first.
 *
 * Content is structured as module-level data bundles — each Module
 * contains all its Lessons so the sidebar can render the full
 * curriculum tree without per-lesson file fetches.
 */

import type { WidgetProps } from '@/engine/registry';

// ─── Widget System ──────────────────────────────────────────────────────────

/**
 * Props for a code-editor widget (interactive sandbox).
 */
export interface CodeEditorProps extends WidgetProps {
  language: string;
  initialCode: string;
  solution?: string;
  testCases?: { input: string; expected: string }[];
}

/**
 * Props for a quiz widget (multiple choice).
 */
export interface QuizProps extends WidgetProps {
  question: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  explanation?: string;
}

/**
 * Props for a diagram widget (Mermaid-like rendering).
 */
export interface DiagramProps extends WidgetProps {
  diagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'custom';
  source: string;
  caption?: string;
}

/**
 * Props for an embedded video widget.
 */
export interface VideoProps extends WidgetProps {
  url: string;
  title?: string;
  autoplay?: boolean;
}

/**
 * Props for a styled note/callout widget.
 */
export interface NoteProps extends WidgetProps {
  variant: 'info' | 'warning' | 'tip' | 'danger';
  title?: string;
  body: string;
}

/**
 * Props for a callout widget with optional emoji.
 */
export interface CalloutProps extends WidgetProps {
  emoji?: string;
  title?: string;
  body: string;
}

/**
 * Props for a mutator widget — the code fixer challenge widget.
 *
 * Presents a broken code snippet in a Monaco editor alongside hidden
 * deterministic tests. The user must identify and fix the bug(s) to
 * make all tests pass.
 *
 * Test cases use the format: `functionCall(arg1, arg2) => expected`
 *
 * @example
 * ```ts
 * {
 *   language: 'javascript',
 *   brokenCode: 'function add(a, b) {\n  return a - b;\n}',
 *   testCases: ['add(2, 3) => 5', 'add(-1, 1) => 0'],
 *   hint: 'Look at the operator — is subtraction correct for addition?',
 * }
 * ```
 */
export interface MutatorProps extends WidgetProps {
  /** Programming language for the Monaco editor (e.g., 'javascript', 'typescript') */
  language: string;
  /** The broken code snippet that the user must fix */
  brokenCode: string;
  /** Array of test case strings in the format "functionCall(args) => expected" */
  testCases: string[];
  /** A hint to help the user if they're stuck (shown in a collapsible section) */
  hint: string;
  /** Optional title displayed in the widget header */
  title?: string;
}

/**
 * Props for a node-graph widget — the drag-and-drop pipeline builder.
 *
 * Renders a React Flow canvas with custom node types (input, process,
 * condition, output) and edges. Includes a "Run Pipeline" button that
 * simulates topological execution order with animated status indicators.
 *
 * @example
 * ```ts
 * {
 *   initialNodes: [
 *     { id: 'source', type: 'input', position: { x: 0, y: 0 }, label: 'Data Source' },
 *     { id: 'filter', type: 'process', position: { x: 250, y: 0 }, label: 'Filter' },
 *     { id: 'output', type: 'output', position: { x: 500, y: 0 }, label: 'Output' },
 *   ],
 *   initialEdges: [
 *     { id: 'e1', source: 'source', target: 'filter' },
 *     { id: 'e2', source: 'filter', target: 'output' },
 *   ],
 * }
 * ```
 */
export interface NodeGraphProps extends WidgetProps {
  /** Initial nodes on the canvas. Each node has an id, optional type, position, label, and description. */
  initialNodes: Array<{
    /** Unique node identifier */
    id: string;
    /** Visual node type — determines color and styling */
    type?: 'input' | 'process' | 'output' | 'condition';
    /** Canvas position {x, y} in pixels */
    position: { x: number; y: number };
    /** Display label shown inside the node */
    label: string;
    /** Optional secondary description text */
    description?: string;
  }>;
  /** Initial edges (connections) between nodes */
  initialEdges: Array<{
    /** Unique edge identifier */
    id: string;
    /** Source node id */
    source: string;
    /** Target node id */
    target: string;
    /** Optional label displayed on the edge */
    label?: string;
    /** Whether the edge has a flowing animation */
    animated?: boolean;
  }>;
  /** Optional title displayed in the widget header */
  title?: string;
  /** Enable playground mode — adds toolbar for adding nodes and clearing canvas */
  playground?: boolean;
}

/**
 * Props for a sandbox widget — the universal Input → Process → Output primitive.
 *
 * The sandbox provides a split-screen UI where the user types in the input pane
 * and sees the transformed result in the output pane in real-time.
 *
 * The optional `processFunction` is a string of JavaScript that must define a
 * function `process(input)` returning the output value. If omitted, the sandbox
 * runs in "echo" mode (output mirrors input verbatim).
 *
 * @example
 * ```ts
 * {
 *   inputType: 'text',
 *   outputType: 'html',
 *   initialState: 'Hello, World!',
 *   processFunction: `
 *     function process(input) {
 *       return '<h1>' + input + '</h1>';
 *     }
 *   `,
 * }
 * ```
 */
export interface SandboxProps extends WidgetProps {
  /** Whether the input pane is a plain textarea or a code editor */
  inputType: 'text' | 'code';
  /** Whether the output pane renders text or HTML */
  outputType: 'text' | 'html';
  /** Initial content of the input pane */
  initialState: string;
  /**
   * Optional JavaScript source string that must define a function
   * `process(input)` returning the output value. Omit for echo mode.
   */
  processFunction?: string;
  /** Display label shown in the sandbox header */
  label?: string;
  /** Placeholder text for the input pane */
  placeholder?: string;
}

// ─── Widget Discriminated Union ─────────────────────────────────────────────

export interface CodeEditorWidget {
  id: string;
  type: 'code-editor';
  props: CodeEditorProps;
}

export interface QuizWidget {
  id: string;
  type: 'quiz';
  props: QuizProps;
}

export interface DiagramWidget {
  id: string;
  type: 'diagram';
  props: DiagramProps;
}

export interface VideoWidget {
  id: string;
  type: 'video';
  props: VideoProps;
}

export interface NoteWidget {
  id: string;
  type: 'note';
  props: NoteProps;
}

export interface CalloutWidget {
  id: string;
  type: 'callout';
  props: CalloutProps;
}

export interface SandboxWidget {
  id: string;
  type: 'sandbox';
  props: SandboxProps;
}

export interface MutatorWidget {
  id: string;
  type: 'mutator';
  props: MutatorProps;
}

export interface NodeGraphWidget {
  id: string;
  type: 'node-graph';
  props: NodeGraphProps;
}

/**
 * Discriminated union of all widget configurations.
 * Use `widget.type` to narrow the type at runtime.
 */
export type WidgetConfig =
  | CodeEditorWidget
  | QuizWidget
  | DiagramWidget
  | VideoWidget
  | NoteWidget
  | CalloutWidget
  | SandboxWidget
  | MutatorWidget
  | NodeGraphWidget;

// ─── Lesson ─────────────────────────────────────────────────────────────────

/**
 * Lesson difficulty level.
 */
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * A Lesson is a single node in the curriculum DAG.
 */
export interface Lesson {
  /** Unique identifier (serves as DAG node key) */
  id: string;
  /** Display title of the lesson */
  title: string;
  /** Optional short description */
  description?: string;
  /** Array of lesson IDs that must be completed before this lesson */
  prerequisites: string[];
  /** Rich metadata for display and filtering */
  metadata: {
    /** Difficulty level */
    difficulty: Difficulty;
    /** Estimated time to complete in minutes */
    estimatedMinutes: number;
    /** Tags for search and categorization */
    tags: string[];
    /** Semantic version of the lesson content */
    version: string;
  };
  /** The actual lesson content — markdown with embedded widgets */
  content: {
    /** Markdown source text */
    markdown: string;
    /** Interactive widget configurations referenced in the markdown */
    widgets: WidgetConfig[];
  };
}

// ─── Module ─────────────────────────────────────────────────────────────────

/**
 * A Module is a bundle of related lessons.
 * The sidebar loads modules as data bundles — all lessons within a module
 * are available together without individual file fetches.
 */
export interface Module {
  /** Unique identifier for the module */
  id: string;
  /** Display title of the module */
  title: string;
  /** Description of what this module covers */
  description: string;
  /** All lessons in this module (the data bundle) */
  lessons: Lesson[];
}

// ─── Track ──────────────────────────────────────────────────────────────────

/**
 * A Track is a complete learning path consisting of ordered modules.
 */
export interface Track {
  /** Unique identifier for the track */
  id: string;
  /** Display title of the track */
  title: string;
  /** Overview description of the track */
  description: string;
  /** Ordered modules within this track */
  modules: Module[];
}

// ─── DAG Validation ─────────────────────────────────────────────────────────

/**
 * Validates that a curriculum graph is a valid DAG:
 * - All prerequisite references point to existing lesson IDs
 * - No circular dependencies exist
 */
export function validateDAG(tracks: Track[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Collect all lesson IDs across all tracks
  const allLessonIds = new Set<string>();
  for (const track of tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        allLessonIds.add(lesson.id);
      }
    }
  }

  // Check that all prerequisites reference existing lessons
  for (const track of tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const prereq of lesson.prerequisites) {
          if (!allLessonIds.has(prereq)) {
            errors.push(
              `Lesson "${lesson.id}" references non-existent prerequisite "${prereq}"`
            );
          }
        }
      }
    }
  }

  // Check for circular dependencies using DFS
  const adjacencyList = new Map<string, string[]>();
  for (const track of tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        adjacencyList.set(lesson.id, lesson.prerequisites);
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const deps = adjacencyList.get(nodeId) || [];
    for (const dep of deps) {
      if (hasCycle(dep)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const nodeId of allLessonIds) {
    if (hasCycle(nodeId)) {
      errors.push(`Circular dependency detected involving lesson "${nodeId}"`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
