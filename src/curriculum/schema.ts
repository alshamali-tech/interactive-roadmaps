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

// ─── Widget System ──────────────────────────────────────────────────────────

/**
 * Props for a code-editor widget (interactive sandbox).
 */
export interface CodeEditorProps {
  language: string;
  initialCode: string;
  solution?: string;
  testCases?: { input: string; expected: string }[];
}

/**
 * Props for a quiz widget (multiple choice).
 */
export interface QuizProps {
  question: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  explanation?: string;
}

/**
 * Props for a diagram widget (Mermaid-like rendering).
 */
export interface DiagramProps {
  diagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'custom';
  source: string;
  caption?: string;
}

/**
 * Props for an embedded video widget.
 */
export interface VideoProps {
  url: string;
  title?: string;
  autoplay?: boolean;
}

/**
 * Props for a styled note/callout widget.
 */
export interface NoteProps {
  variant: 'info' | 'warning' | 'tip' | 'danger';
  title?: string;
  body: string;
}

/**
 * Props for a callout widget with optional emoji.
 */
export interface CalloutProps {
  emoji?: string;
  title?: string;
  body: string;
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
  | CalloutWidget;

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
