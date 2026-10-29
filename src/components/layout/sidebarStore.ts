import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  /** Whether the sidebar is open (mobile overlay) */
  open: boolean;
  /** Whether the desktop sidebar is collapsed (showing rail) */
  desktopCollapsed: boolean;
  /** Module expansion state */
  expandedModules: Record<string, boolean>;

  toggle: () => void;
  close: () => void;
  toggleDesktop: () => void;
  toggleModule: (moduleId: string) => void;
  isModuleExpanded: (moduleId: string) => boolean;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      open: false,
      desktopCollapsed: false,
      expandedModules: {},

      toggle: () => set((s) => ({ open: !s.open })),
      close: () => set({ open: false }),
      toggleDesktop: () => set((s) => ({ desktopCollapsed: !s.desktopCollapsed })),

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
    }),
    {
      name: 'interactive-roadmaps-sidebar',
    }
  )
);
