import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GraduationCap, Menu } from 'lucide-react';
import { useSidebarStore } from './sidebarStore';

export function Header() {
  const toggle = useSidebarStore((s) => s.toggle);

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 gap-3 sticky top-0 z-40">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={toggle}
        aria-label="Toggle sidebar"
      >
        <Menu className="size-5" />
      </Button>
      <Link to="/" className="flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">
          Software Engineer Academy
        </h1>
      </Link>
      <div className="flex-1" />
      <Button variant="outline" size="sm">
        Sign In
      </Button>
    </header>
  );
}
