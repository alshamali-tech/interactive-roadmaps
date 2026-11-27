/**
 * Widget Registry — Central mapping from string type identifiers to React components.
 *
 * The curriculum schema references widgets by string type (e.g., 'sandbox', 'mutator').
 * This registry resolves those strings to actual React components at render time.
 *
 * New widget types can be registered dynamically via `widgetRegistry.register()`.
 * The registry is strictly typed — all widget props must extend the base WidgetProps interface.
 */

import type { ComponentType } from 'react';
import type { WidgetConfig } from '@/curriculum/schema';
import { Sandbox } from '@/components/universal/Sandbox';
import { Mutator } from '@/components/universal/Mutator';
import { ContextDiagram } from '@/components/universal/ContextDiagram';
import { TradeOff } from '@/components/universal/TradeOff';
import { SocraticChat } from '@/components/universal/SocraticChat';

// ─── Base Types ──────────────────────────────────────────────────────────────

/**
 * Base interface that all widget prop interfaces must extend.
 *
 * Provides a common contract for the widget registry system.
 * Any object with string keys is compatible with this interface.
 * Individual widget components define their own specific prop types
 * that extend this base.
 */
export interface WidgetProps {
  [key: string]: unknown;
}

/**
 * A React component that can be registered as a widget renderer.
 *
 * The component receives the widget's `props` object directly as its React props.
 * Must accept props that extend the base WidgetProps interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WidgetComponent<P extends WidgetProps = any> = ComponentType<P>;

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * The widget registry — a type-safe mapping from string identifiers to React components.
 *
 * ## How it works
 *
 * 1. Each widget in the curriculum schema has a `type` field (e.g., `'sandbox'`, `'mutator'`).
 * 2. Components are registered against those type strings via `register()`.
 * 3. At render time, `resolve()` or `get()` retrieves the correct component.
 *
 * ## Registering a new widget type
 *
 * ```ts
 * import { MyWidget } from '@/components/widgets/MyWidget';
 * widgetRegistry.register('my-widget', MyWidget);
 * ```
 *
 * ## Rendering a widget
 *
 * ```ts
 * const Component = widgetRegistry.get(widget.type);
 * if (Component) {
 *   return <Component {...widget.props} />;
 * }
 * ```
 */
class WidgetRegistry {
  private components = new Map<string, WidgetComponent>();

  /**
   * Register a widget component for a given type identifier.
   *
   * The `type` string should match the `type` field used in `WidgetConfig`
   * discriminated union entries within the curriculum schema.
   *
   * @param type - String identifier for the widget type (e.g., 'sandbox', 'mutator')
   * @param component - React component that renders this widget type
   * @returns `this` for method chaining
   *
   * @example
   * ```ts
   * widgetRegistry
   *   .register('sandbox', Sandbox)
   *   .register('mutator', Mutator)
   *   .register('trade-off', TradeOff);
   * ```
   */
  register<P extends WidgetProps>(
    type: string,
    component: WidgetComponent<P>
  ): this {
    if (this.components.has(type)) {
      console.warn(
        `[WidgetRegistry] Overwriting existing widget type: "${type}"`
      );
    }
    this.components.set(type, component as WidgetComponent);
    return this;
  }

  /**
   * Retrieve the React component registered for a given widget type.
   *
   * @param type - The widget type identifier
   * @returns The component, or `undefined` if nothing is registered for this type
   */
  get<P extends WidgetProps = WidgetProps>(
    type: string
  ): WidgetComponent<P> | undefined {
    return this.components.get(type) as WidgetComponent<P> | undefined;
  }

  /**
   * Check whether a widget type has been registered.
   */
  has(type: string): boolean {
    return this.components.has(type);
  }

  /**
   * Get all registered widget type identifiers.
   */
  types(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Resolve a `WidgetConfig` to its React component.
   *
   * This is the primary way to render widgets from curriculum data.
   * Uses the widget's `type` field to look up the registered component.
   *
   * @param widget - A widget configuration from the curriculum schema
   * @returns The component, or `null` if the type is not registered
   *
   * @example
   * ```tsx
   * const Component = widgetRegistry.resolve(widget);
   * if (Component) {
   *   return <Component {...widget.props} />;
   * }
   * return <UnknownWidgetFallback />;
   * ```
   */
  resolve(widget: WidgetConfig): WidgetComponent | null {
    return this.components.get(widget.type) ?? null;
  }

  /**
   * Remove a registered widget type.
   * Useful for testing or dynamic unregistration.
   */
  unregister(type: string): boolean {
    return this.components.delete(type);
  }

  /**
   * Clear all registered widgets.
   * Primarily useful for testing.
   */
  clear(): void {
    this.components.clear();
  }

  /**
   * Get the number of registered widget types.
   */
  get size(): number {
    return this.components.size;
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

/**
 * The singleton widget registry instance.
 *
 * Pre-registers all built-in widget types on module load.
 * Additional widget types can be registered at any time via
 * `widgetRegistry.register(type, component)`.
 */
export const widgetRegistry = new WidgetRegistry();

// ─── Built-in Widget Registration ────────────────────────────────────────────

/**
 * Register built-in widget components with comprehensive documentation.
 * 
 * Each widget serves a specific pedagogical purpose in the curriculum system.
 * Use the selection guide below to choose the appropriate widget for your lesson.
 */

// Register built-in widget components against their schema type strings.
// New widget types can be added here or registered externally via `widgetRegistry.register()`.
widgetRegistry
  /**
   * **Sandbox Widget** (`sandbox`)
   * 
   * Interactive code execution environment for hands-on learning.
   * 
   * **What it does:** Provides a split-pane interface with input (text or code) and output display.
   * Supports real-time token counting, multiple input/output types (text, JSON, HTML), and custom processing functions.
   * 
   * **When to use:** 
   * - Teaching concepts that benefit from experimentation (e.g., token counting, data transformation)
   * - Demonstrating cause-and-effect relationships
   * - Allowing learners to test hypotheses in real-time
   * 
   * **Required props:**
   * - `inputType`: 'text' | 'code' | 'json'
   * - `outputType`: 'text' | 'json' | 'html'
   * - `processFunction`: JavaScript function string that transforms input to output
   * 
   * **Optional props:**
   * - `initialState`: Default input value
   * - `label`: Widget title
   * - `placeholder`: Input placeholder text
   * - `tokenLimit`: Maximum token count with visual progress bar
   * - `widgetId`: Unique ID for localStorage persistence
   */
  .register('sandbox', Sandbox)
  
  /**
   * **Mutator Widget** (`mutator`)
   * 
   * Code debugging challenge widget for problem-solving practice.
   * 
   * **What it does:** Presents broken code in a Monaco editor with hidden test cases.
   * Learners must identify and fix bugs to make all tests pass.
   * 
   * **When to use:**
   * - Teaching debugging skills
   * - Reinforcing code comprehension through repair exercises
   * - Assessing understanding of specific programming concepts
   * 
   * **Required props:**
   * - `language`: Programming language (e.g., 'javascript', 'typescript')
   * - `brokenCode`: The buggy code snippet to fix
   * - `testCases`: Array of test strings in format "functionCall(args) => expected"
   * - `hint`: Help text shown in collapsible section
   * 
   * **Optional props:**
   * - `title`: Challenge title
   * - `difficulty`: 'easy' | 'medium' | 'hard'
   */
  .register('mutator', Mutator)
  
  /**
   * **Context Diagram Widget** (`context-diagram`)
   *
   * Read-only, interactive architecture/flow diagram rendered with React Flow
   * (@xyflow/react) — NOT Mermaid. Positions come from the W1.5 auto-layout,
   * so authored data carries no coordinates.
   *
   * **What it does:** Renders a validated W1.2 diagram: nodes styled by type
   * (input/process/decision/output/storage/service), zoom + pan on desktop, and
   * a vertical card stack under 768px. Nodes are not draggable; clicking a node
   * that has a description opens a detail panel. Malformed data degrades to a
   * fallback card via an internal error boundary.
   *
   * **When to use:**
   * - Visualizing system architecture and component relationships
   * - Teaching design patterns and data flow
   * - Explaining protocols and communication sequences
   *
   * **Required props:**
   * - `diagram`: a Diagram validated by DiagramSchema — `type`
   *   ('flow' | 'relationship' | 'architecture' | 'sequence'), `title`,
   *   `nodes[]` (2-8) and `edges[]` (1-10)
   *
   * **Optional props:**
   * - `onExplainThisDiagram`: (diagram) => void — shows the "Explain This
   *   Diagram" button; injected by MarkdownRenderer for this widget type
   *
   * Cast to WidgetComponent because ContextDiagramProps has no index signature
   * and therefore does not structurally satisfy WidgetProps. The cast is a
   * TypeScript formality: the schema (generatorSchema.ts `props.diagram`) and
   * the parser (lessonParser.ts) both emit exactly this shape.
   */
  .register('context-diagram', ContextDiagram as unknown as WidgetComponent<WidgetProps>)
  
  /**
   * **Trade-Off Widget** (`trade-off`)
   * 
   * Decision-making exercise for evaluating architectural choices.
   * 
   * **What it does:** Presents multiple options with trade-offs across dimensions like cost, performance,
   * complexity, and scalability. Learners select an option and see consequences with real-world scenarios.
   * 
   * **When to use:**
   * - Teaching systems thinking and architectural decision-making
   * - Exploring trade-offs in technology selection
   * - Developing critical evaluation skills
   * 
   * **Required props:**
   * - `options`: Array of option objects with `id`, `label`, `description`, and metric scores (1-10)
   * 
   * **Optional props:**
   * - `requireJustification`: Boolean to require written justification before showing consequences
   * - `title`: Exercise title
   * - `explanation`: Context or background information
   */
  .register('trade-off', TradeOff)
  
  /**
   * **Socratic Chat Widget** (`socratic-chat`)
   * 
   * AI-powered Socratic dialogue for guided discovery learning.
   * 
   * **What it does:** Presents a problem or concept, then engages learners in a Socratic dialogue
   * where the AI asks probing questions to guide them toward understanding rather than providing answers.
   * 
   * **When to use:**
   * - Teaching complex concepts through guided discovery
   * - Developing critical thinking and problem-solving skills
   * - Encouraging metacognition and self-reflection
   * 
   * **Required props:**
   * - `problemStatement`: The problem or concept to explore
   * 
   * **Optional props:**
   * - `persona`: AI tutor persona (e.g., 'encouraging', 'challenging', 'curious')
   * - `challengeLevel`: 'beginner' | 'intermediate' | 'advanced'
   * - `interviewMode`: Boolean to enable structured interview format
   * - `maxTurns`: Maximum conversation turns before conclusion
   */
  .register('socratic-chat', SocraticChat as unknown as WidgetComponent<WidgetProps>);
