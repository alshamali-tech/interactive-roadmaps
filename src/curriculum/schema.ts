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
  /** Maximum number of hints available to the user (default: 1) */
  maxHints?: number;
  /** Callback invoked when the user clicks "Proceed to Next Lesson" after success */
  onNextLesson?: () => void;
}

/**
 * Props for a context-diagram widget — AI-generated interactive diagrams.
 *
 * Renders a read-only, interactive diagram using React Flow. Users can
 * click nodes to see details but cannot drag or modify the structure.
 * Replaces the old NodeGraph widget.
 *
 * @example
 * ```ts
 * {
 *   diagram: {
 *     type: 'flow',
 *     title: 'Request Processing',
 *     nodes: [
 *       { id: 'start', label: 'Start', type: 'input' },
 *       { id: 'process', label: 'Process', type: 'process' },
 *       { id: 'end', label: 'End', type: 'output' },
 *     ],
 *     edges: [
 *       { from: 'start', to: 'process' },
 *       { from: 'process', to: 'end' },
 *     ],
 *   },
 * }
 * ```
 */
export interface ContextDiagramProps extends WidgetProps {
  /** The diagram data (nodes, edges, type, title) */
  diagram: import('@/engine/generatorSchema').Diagram;
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
  /** Whether the output pane renders text, HTML, or JSON */
  outputType: 'text' | 'html' | 'json';
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
  /** Optional token limit. If set, shows a progress bar that turns red when exceeded */
  tokenLimit?: number;
  /** Unique widget ID for localStorage persistence */
  widgetId?: string;
}

/**
 * A single option within a TradeOff decision matrix.
 *
 * Each option represents a technology, approach, or solution that the
 * user can evaluate against the others.
 */
export interface TradeOffOption {
  /** Unique identifier for this option */
  id: string;
  /** Display name (e.g., "PostgreSQL", "Cassandra") */
  name: string;
  /** Brief one-line description of the option */
  description: string;
  /** Array of advantages / positive aspects */
  pros: string[];
  /** Array of disadvantages / negative aspects */
  cons: string[];
  /** Quantitative metrics on a 1–10 scale */
  metrics: {
    /** Cost (1 = cheap, 10 = expensive) */
    cost: number;
    /** Performance (1 = slow, 10 = fast) */
    performance: number;
    /** Complexity (1 = simple, 10 = complex) */
    complexity: number;
    /** Scalability (1 = limited, 10 = highly scalable) */
    scalability: number;
  };
}

/**
 * Props for a trade-off widget — the decision matrix that teaches
 * engineering trade-offs.
 *
 * Presents a real-world scenario and a set of clickable option cards.
 * Upon selection the widget reveals pros/cons, a metrics comparison
 * table, scenario-based consequence cards, "what if" stress scenarios,
 * and an optional AI-graded written justification.
 *
 * @example
 * ```ts
 * {
 *   scenario: 'You need a database for 100k writes/sec. Choose wisely.',
 *   options: [
 *     { id: 'pg', name: 'PostgreSQL', description: '...', pros: [...], cons: [...], metrics: {...} },
 *     { id: 'cass', name: 'Cassandra', description: '...', pros: [...], cons: [...], metrics: {...} },
 *   ],
 *   explanation: 'For write-heavy workloads, Cassandra is typically the best choice.',
 * }
 * ```
 */
export interface TradeOffProps extends WidgetProps {
  /** The question / context presented to the user */
  scenario: string;
  /** Array of choices (minimum 2, maximum 5 — extras are truncated) */
  options: TradeOffOption[];
  /** Optional explanation shown below the consequences after selection */
  explanation?: string;
  /**
   * When true, the user must write a justification of at least 2 sentences
   * before the consequences are revealed. The justification is sent to the
   * AI for feedback when a provider is connected (offline fallback otherwise).
   * Default: false.
   */
  requireJustification?: boolean;
}

/**
 * A single challenge question for challenge mode.
 */
export interface ChallengeQuestionConfig {
  /** The challenge question text */
  question: string;
  /** The expected correct answer */
  modelAnswer: string;
}

/**
 * Props for a socratic-chat widget — AI-powered chat with three modes.
 *
 * - tutor (default): General Socratic help during lessons
 * - interview: Mock technical interviews with scored feedback
 * - challenge: Quick knowledge checks with immediate pass/fail feedback
 *
 * @example
 * ```ts
 * {
 *   mode: 'interview',
 *   topic: 'JavaScript Fundamentals',
 *   difficulty: 'mid',
 *   timeLimit: 30,
 *   maxQuestions: 5,
 * }
 * ```
 */
export interface SocraticChatProps extends WidgetProps {
  /** Chat mode: 'tutor' (default), 'interview', or 'challenge' */
  mode?: 'tutor' | 'interview' | 'challenge';
  /** Topic for interview mode (required when mode='interview') */
  topic?: string;
  /** Difficulty level for interview/challenge modes */
  difficulty?: 'junior' | 'mid' | 'senior';
  /** Time limit in minutes for interview/challenge modes */
  timeLimit?: number;
  /** Maximum questions for interview mode (default: 5) */
  maxQuestions?: number;
  /** Array of challenge questions for challenge mode */
  challengeQuestions?: ChallengeQuestionConfig[];
}

// ─── Widget Discriminated Union ─────────────────────────────────────────────

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

export interface ContextDiagramWidget {
  id: string;
  type: 'context-diagram';
  props: ContextDiagramProps;
}

export interface TradeOffWidget {
  id: string;
  type: 'trade-off';
  props: TradeOffProps;
}

export interface SocraticChatWidget {
  id: string;
  type: 'socratic-chat';
  props: SocraticChatProps;
}

/**
 * Discriminated union of all widget configurations.
 * Use `widget.type` to narrow the type at runtime.
 */
export type WidgetConfig =
  | SandboxWidget
  | MutatorWidget
  | ContextDiagramWidget
  | TradeOffWidget
  | SocraticChatWidget;

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
