import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { tracks } from '@/curriculum/graph';

export function Layout() {
  const location = useLocation();

  useEffect(() => {
    let title = 'Software Engineer Academy';

    if (location.pathname === '/') {
      title = 'Home · Software Engineer Academy';
    } else {
      const lessonMatch = location.pathname.match(/\/lesson\/([^/]+)/);
      if (lessonMatch) {
        const lessonId = lessonMatch[1];
        for (const track of tracks) {
          for (const mod of track.modules) {
            for (const lesson of mod.lessons) {
              if (lesson.id === lessonId) {
                title = `${lesson.title} · Software Engineer Academy`;
              }
            }
          }
        }
      }
    }

    document.title = title;
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
