/**
 * Vitest setup file — runs before every test file.
 * Imports @testing-library/jest-dom matchers and provides browser API
 * mocks that jsdom does not implement natively.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ── Auto-cleanup after each test ─────────────────────────────────
afterEach(() => {
  cleanup();
});

// ── ResizeObserver Mock ──────────────────────────────────────────
class ResizeObserverMock {
  private callback: ResizeObserverCallback;
  private observedElements: Set<Element> = new Set();
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe(target: Element): void { this.observedElements.add(target); }
  unobserve(target: Element): void { this.observedElements.delete(target); }
  disconnect(): void { this.observedElements.clear(); }
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// ── matchMedia Mock ──────────────────────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ── getBoundingClientRect Mock ───────────────────────────────────
Element.prototype.getBoundingClientRect = function (): DOMRect {
  return { x: 0, y: 0, width: 200, height: 50, top: 0, right: 200, bottom: 50, left: 0, toJSON: () => ({}) };
};

// ── Scroll Mocks ─────────────────────────────────────────────────
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

// ── createObjectURL Mock ─────────────────────────────────────────
if (typeof URL.createObjectURL === 'undefined') { URL.createObjectURL = () => 'blob:mock-url'; }
if (typeof URL.revokeObjectURL === 'undefined') { URL.revokeObjectURL = () => {}; }

// ── PointerEvent Polyfill ────────────────────────────────────────
if (typeof PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    pointerId = 0; width = 1; height = 1; pressure = 0;
    tangentialPressure = 0; tiltX = 0; tiltY = 0; twist = 0;
    pointerType = ''; isPrimary = false;
    constructor(type: string, p: PointerEventInit & MouseEventInit = {}) {
      super(type, p);
      this.pointerId = p.pointerId ?? 0;
      this.pointerType = p.pointerType ?? '';
      this.isPrimary = p.isPrimary ?? false;
    }
  }
  (globalThis as Record<string, unknown>).PointerEvent = PE;
}
