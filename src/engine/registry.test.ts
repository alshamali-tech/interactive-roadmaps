import { describe, it, expect } from 'vitest';
import { widgetRegistry } from './registry';

describe('Widget Registry', () => {
  it('registry contains all required widget types', () => {
    const requiredTypes = ['sandbox', 'mutator', 'node-graph', 'diagram', 'quiz', 'note', 'callout', 'video', 'code-editor'];
    requiredTypes.forEach(type => {
      expect(widgetRegistry.has(type)).toBe(true);
    });
  });

  it('registry values are valid React components', () => {
    const types = widgetRegistry.types();
    types.forEach(type => {
      const component = widgetRegistry.get(type);
      expect(component).toBeDefined();
      expect(typeof component === 'function' || typeof component === 'object').toBe(true);
    });
  });

  it('registry returns undefined for unknown widget types', () => {
    const component = widgetRegistry.get('nonexistent');
    expect(component).toBeUndefined();
  });

  it('registry size matches expected count', () => {
    expect(widgetRegistry.size).toBeGreaterThanOrEqual(9);
  });
});
