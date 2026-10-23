import { create } from 'zustand';

interface SidebarState {
  /** Whether the sidebar is open (mobile overlay) */
  open: boolean;
  /** Module expansion state — plain object for proper reactivity */
  expandedModules: Record<string, boolean>;

  toggle: () => void;
  close: () => void;
  toggleModule: (moduleId: string) => void;
  isModuleExpanded: (moduleId: string) => boolean;
}

/**
 * Lightweight store for mobile sidebar toggle state
 * and module-level expansion state.
 *
 * Uses a plain Record<string, boolean> instead of Set so that
 * Zustand selectors can detect changes and trigger re-renders.
 */
export const useSidebarStore = create<SidebarState>()((set, get) => ({
  open: false,
  expandedModules: {},

  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),

  toggleModule: (moduleId: string) =>
    set((s) => ({
      expandedModules: {
        ...s.expandedModules,
        [moduleId]: !s.expandedModules[moduleId],
      },
    })),

  isModuleExpanded: (moduleId: string) => {
    return !!get().expandedModules[moduleId];
  },
}));
