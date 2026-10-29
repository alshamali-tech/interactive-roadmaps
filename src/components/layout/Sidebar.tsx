import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useProgressStore } from '@/engine/progress';
import { tracks } from '@/curriculum/graph';
import { cn } from '@/lib/utils';
import {
  Lock,
  CheckCircle2,
  CirclePlay,
  BookOpen,
  X,
  ChevronRight,
  ChevronDown,
  Package,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from './sidebarStore';

export function Sidebar() {
  const getLessonStatus = useProgressStore((s) => s.getLessonStatus);
  const completedLessons = useProgressStore((s) => s.completedLessons);
  const open = useSidebarStore((s) => s.open);
  const close = useSidebarStore((s) => s.close);
  const desktopCollapsed = useSidebarStore((s) => s.desktopCollapsed);
  const toggleDesktop = useSidebarStore((s) => s.toggleDesktop);
  const toggleModule = useSidebarStore((s) => s.toggleModule);
  const expandedModules = useSidebarStore((s) => s.expandedModules);
  const location = useLocation();

  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : true
  );

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Auto-expand modules containing current lesson
  useEffect(() => {
    const match = location.pathname.match(/\/lesson\/([^/]+)/);
    if (match) {
      const currentId = match[1];
      for (const track of tracks) {
        for (const mod of track.modules) {
          if (mod.lessons.some((l) => l.id === currentId)) {
            if (!useSidebarStore.getState().isModuleExpanded(mod.id)) {
              useSidebarStore.getState().toggleModule(mod.id);
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (!isDesktop && open) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const showSidebar = isDesktop ? !desktopCollapsed : open;

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Collapsed desktop rail */}
      {isDesktop && desktopCollapsed && (
        <aside className="w-14 border-r border-border bg-card flex flex-col items-center py-3 sticky top-0 h-screen shrink-0">
          <button
            onClick={toggleDesktop}
            aria-label="Expand sidebar"
            className="p-2 rounded-md hover:bg-muted transition-colors mb-4"
          >
            <PanelLeft className="size-5 text-muted-foreground" />
          </button>
          <NavLink
            to="/"
            className="p-2 rounded-md hover:bg-muted transition-colors"
            title="Home"
          >
            <BookOpen className="size-5 text-primary" />
          </NavLink>
        </aside>
      )}

      {/* Full sidebar panel */}
      <aside
        className={cn(
          'w-72 border-r border-border bg-card flex flex-col overflow-y-auto shrink-0',
          'transition-all duration-300 ease-in-out',
          isDesktop
            ? 'relative top-0 z-0 h-screen sticky top-0'
            : 'fixed top-0 left-0 h-full z-50',
          showSidebar
            ? 'translate-x-0'
            : !isDesktop
              ? '-translate-x-full'
              : 'hidden'
        )}
      >
        {/* Header with collapse button */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="size-4 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">
              {isDesktop ? 'Curriculum' : 'Navigation'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={isDesktop ? toggleDesktop : close}
            aria-label={isDesktop ? 'Collapse sidebar' : 'Close sidebar'}
          >
            {isDesktop ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <X className="size-4" />
            )}
          </Button>
        </div>

        <nav className="flex-1 p-4 space-y-6">
          {tracks.map((track) => (
            <div key={track.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 mb-3">
                <BookOpen className="size-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">
                  {track.title}
                </span>
              </div>

              {track.modules.map((mod) => {
                const expanded = !!expandedModules[mod.id];
                const moduleLessonIds = mod.lessons.map((l) => l.id);
                const completedInModule = moduleLessonIds.filter((id) =>
                  completedLessons.includes(id)
                ).length;
                const totalInModule = mod.lessons.length;
                const allCompleted = completedInModule === totalInModule;

                return (
                  <div key={mod.id} className="mb-2">
                    <button
                      onClick={() => toggleModule(mod.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-2.5 rounded-md text-left',
                        'hover:bg-muted/70 active:bg-muted transition-all group',
                        expanded && 'bg-muted/40'
                      )}
                      aria-expanded={expanded}
                    >
                      <div
                        className={cn(
                          'shrink-0 transition-transform duration-200',
                          expanded ? 'rotate-0' : '-rotate-90'
                        )}
                      >
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      </div>

                      <Package
                        className={cn(
                          'size-4 shrink-0 transition-colors',
                          allCompleted
                            ? 'text-green-500'
                            : expanded
                              ? 'text-primary'
                              : 'text-muted-foreground'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {mod.title}
                        </div>
                        <div className="text-[0.65rem] text-muted-foreground">
                          {completedInModule}/{totalInModule} lessons
                        </div>
                      </div>
                      {allCompleted && (
                        <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                      )}
                    </button>

                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-300 ease-in-out',
                        expanded
                          ? 'max-h-[500px] opacity-100'
                          : 'max-h-0 opacity-0'
                      )}
                    >
                      <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2 py-1">
                        {mod.lessons.map((lesson) => {
                          const status = getLessonStatus(lesson.id);
                          return (
                            <NavLink
                              key={lesson.id}
                              to={
                                status === 'locked'
                                  ? '#'
                                  : `/lesson/${lesson.id}`
                              }
                              onClick={(e) => {
                                if (status === 'locked') e.preventDefault();
                              }}
                              className={({ isActive }) =>
                                cn(
                                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
                                  isActive
                                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary -ml-[11px] pl-[7px]'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                                  status === 'locked' &&
                                    'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-foreground/80'
                                )
                              }
                            >
                              <StatusIcon status={status} />
                              <span className="truncate text-[0.8rem]">
                                {lesson.title}
                              </span>
                              {status !== 'locked' && (
                                <ChevronRight className="size-3 text-muted-foreground/50 ml-auto" />
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Software Engineer Academy</p>
        </div>
      </aside>
    </>
  );
}

function StatusIcon({ status }: { status: 'locked' | 'available' | 'completed' }) {
  if (status === 'completed')
    return <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />;
  if (status === 'available')
    return <CirclePlay className="size-3.5 text-primary shrink-0" />;
  return <Lock className="size-3.5 text-muted-foreground shrink-0" />;
}
