/**
 * Widget Registry — Central mapping from string type identifiers to React components.
 *
 * The curriculum schema references widgets by string type (e.g., 'code-editor', 'quiz').
 * This registry resolves those strings to actual React components at render time.
 *
 * New widget types can be registered dynamically via `widgetRegistry.register()`.
 * The registry is strictly typed — all widget props must extend the base WidgetProps interface.
 */

import type { ComponentType } from 'react';
import type { WidgetConfig } from '@/curriculum/schema';
import { CodeEditorWidget } from '@/components/widgets/CodeEditorWidget';
import { QuizWidget } from '@/components/widgets/QuizWidget';
import { Sandbox } from '@/components/universal/Sandbox';
import { DiagramWidget } from '@/components/widgets/DiagramWidget';
import { NoteWidget } from '@/components/widgets/NoteWidget';
import { CalloutWidget } from '@/components/widgets/CalloutWidget';
import { VideoWidget } from '@/components/widgets/VideoWidget';
import { Mutator } from '@/components/universal/Mutator';
import { NodeGraph } from '@/components/universal/NodeGraph';
import { TradeOff } from '@/components/universal/TradeOff';
import { TcpIpHandshake } from '@/components/custom/TcpIpHandshake';

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
 * 1. Each widget in the curriculum schema has a `type` field (e.g., `'code-editor'`, `'quiz'`).
 * 2. Components are registered against those type strings via `register()`.
 * 3. At render time, `resolve()` or `get()` retrieves the correct component.
 *
 * ## Registering a new widget type
 *
 * ```ts
 * import { MySandboxWidget } from '@/components/widgets/MySandboxWidget';
 * widgetRegistry.register('sandbox', MySandboxWidget);
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
   *   .register('code-editor', CodeEditorWidget)
   *   .register('quiz', QuizWidget)
   *   .register('sandbox', SandboxWidget);
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

// Register built-in widget components against their schema type strings.
// New widget types can be added here or registered externally via `widgetRegistry.register()`.
widgetRegistry
  .register('code-editor', CodeEditorWidget)
  .register('quiz', QuizWidget)
  .register('sandbox', Sandbox)
  .register('diagram', DiagramWidget)
  .register('note', NoteWidget)
  .register('callout', CalloutWidget)
  .register('video', VideoWidget)
  .register('mutator', Mutator)
  .register('node-graph', NodeGraph)
  .register('trade-off', TradeOff)
  .register('tcp-ip', TcpIpHandshake);
