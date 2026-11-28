import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from '@/components/core/ErrorBoundary';

/**
 * App shell: sidebar, header, and the main content region.
 *
 * Two deliberate choices:
 * - The ErrorBoundary is keyed by pathname, so navigating away from a broken
 *   route always clears the failure instead of trapping the user on an error card.
 * - No document.title logic lives here. Child page effects run before this
 *   component's effects, so a title set by a page would be overwritten; each page
 *   owns its head via usePageMeta instead.
 */
export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 overflow-y-auto focus:outline-none">
          <ErrorBoundary resetKey={location.pathname} subject="this page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
