/**
 * Authored content validation.
 *
 * `docs/MCP_INSTRUCTIONS.md` tells the MCP content factory to validate generated
 * lessons against the Zod schemas before appending them to a module bundle. This
 * suite is that check, running on every `npm test` — so an invalid hand-authored
 * widget fails CI instead of being silently stripped by lessonParser at runtime.
 *
 * It exists so the workflow needs no bespoke CLI script: Vite resolves the
 * TypeScript sources and the `@` alias here, which plain `node` cannot do for
 * extensionless relative imports.
 */
import { describe, it, expect } from 'vitest';
import { WidgetConfigSchema, DiagramSchema } from './generatorSchema';
import type { WidgetConfig } from './generatorSchema';

type LooseLesson = {
  id?: string;
  title?: string;
  content?: { markdown?: string; widgets?: WidgetConfig[] };
};

// Eagerly pull in every authored content module. Adding a new module file needs
// no change here.
const contentModules = import.meta.glob('../content/**/*.ts', {
  eager: true,
}) as Record<string, Record<string, unknown>>;

function lessonsFrom(module: Record<string, unknown>): LooseLesson[] {
  return Object.values(module).flatMap((exported) =>
    Array.isArray(exported)
      ? exported.filter(
          (item): item is LooseLesson =>
            !!item && typeof item === 'object' && 'content' in (item as object)
        )
      : []
  );
}

const collected = Object.entries(contentModules).flatMap(([filePath, module]) =>
  lessonsFrom(module).map((lesson) => ({ filePath, lesson }))
);

describe('authored content validation', () => {
  it('finds at least one content module to validate', () => {
    // Guards against the glob silently matching nothing and the suite passing vacuously.
    expect(contentModules).not.toEqual({});
    expect(collected.length).toBeGreaterThan(0);
  });

  it.each(collected.map(({ filePath, lesson }) => [filePath, lesson.id ?? '(missing id)', lesson]))(
    'validates lesson %s in %s',
    (_filePath, _lessonId, lesson) => {
      expect(typeof lesson.title).toBe('string');
      expect((lesson.title ?? '').length).toBeGreaterThan(0);
      expect(Array.isArray(lesson.content?.widgets)).toBe(true);

      const widgets = lesson.content?.widgets ?? [];
      const markdown = lesson.content?.markdown ?? '';

      for (const widget of widgets) {
        const result = WidgetConfigSchema.safeParse(widget);
        if (!result.success) {
          throw new Error(
            `Widget "${String(widget?.id)}" in lesson "${_lessonId}" is invalid: ` +
              result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          );
        }
      }

      // Every widget needs a marker, and every marker needs a widget — an
      // unmatched reference renders as dead text or an unused component.
      // HTML comments are stripped first: content files park disabled markers
      // like <!-- {{widget:tcp-visualizer}} --> as authoring TODOs, and those
      // never reach the renderer, so flagging them would be a false positive.
      const liveMarkdown = markdown.replace(/<!--[\s\S]*?-->/g, '');
      const referenced = [...liveMarkdown.matchAll(/\{\{widget:([^}]+)\}\}/g)].map((m) =>
        m[1].trim()
      );
      const declared = widgets.map((w) => w.id);
      for (const id of referenced) {
        expect(declared, `markdown references {{widget:${id}}} with no matching widget`).toContain(id);
      }
      for (const id of declared) {
        expect(referenced, `widget "${id}" is declared but never placed in the markdown`).toContain(
          id
        );
      }

      // Diagrams are the newest widget type and the easiest to get wrong by hand.
      for (const widget of widgets) {
        if (widget.type !== 'context-diagram') continue;
        const diagram = (widget.props as { diagram?: unknown }).diagram;
        const result = DiagramSchema.safeParse(diagram);
        expect(
          result.success,
          `context-diagram "${widget.id}" failed DiagramSchema: ${
            result.success ? '' : result.error.issues.map((i) => i.message).join('; ')
          }`
        ).toBe(true);
      }
    }
  );
});
