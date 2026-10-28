import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { tracks } from '@/curriculum/graph';
import { useProgressStore } from '@/engine/progress';
import {
  BookOpen,
  Clock,
  ArrowRight,
  CheckCircle2,
  Flame,
  Hash,
} from 'lucide-react';
import type { Difficulty } from '@/curriculum/schema';

export function Home() {
  const navigate = useNavigate();
  const { trackId } = useParams();
  const { completedLessons, getLessonStatus } = useProgressStore();

  // Filter tracks if a specific trackId is in the URL
  const displayTracks = trackId
    ? tracks.filter((t) => t.id === trackId)
    : tracks;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <div className="space-y-3">
        <Badge variant="secondary" className="text-xs font-medium">
          🚀 Welcome to the Academy
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
          {trackId ? displayTracks[0]?.title ?? 'Track' : 'Learning Tracks'}
        </h2>
        <p className="text-muted-foreground text-lg">
          {trackId
            ? displayTracks[0]?.description ?? ''
            : 'Choose a track to begin your journey through the curriculum. Lessons unlock as you complete prerequisites.'}
        </p>
      </div>

      {/* Overall Progress */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-green-500" />
          <span>
            <strong className="text-foreground">{completedLessons.length}</strong> lessons
            completed
          </span>
        </div>
      </div>

      {/* Track Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {displayTracks.map((track) => {
          const totalLessons = track.modules.reduce((sum, m) => sum + m.lessons.length, 0);
          const totalDuration = track.modules.reduce(
            (sum, m) =>
              sum +
              m.lessons.reduce((s, l) => s + l.metadata.estimatedMinutes, 0),
            0
          );

          const allTags = Array.from(
            new Set(track.modules.flatMap((m) => m.lessons.flatMap((l) => l.metadata.tags)))
          ).slice(0, 5);

          const difficultyOrder: Record<Difficulty, number> = {
            beginner: 0,
            intermediate: 1,
            advanced: 2,
          };
          const maxDifficulty = track.modules
            .flatMap((m) => m.lessons.map((l) => l.metadata.difficulty))
            .reduce<Difficulty>(
              (max, d) => (difficultyOrder[d] > difficultyOrder[max] ? d : max),
              'beginner'
            );

          const trackLessonIds = track.modules.flatMap((m) => m.lessons.map((l) => l.id));
          const completedInTrack = trackLessonIds.filter((id) =>
            completedLessons.includes(id)
          ).length;

          const progressPercent =
            totalLessons > 0 ? Math.round((completedInTrack / totalLessons) * 100) : 0;

          return (
            <Card key={track.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{track.title}</CardTitle>
                  <DifficultyBadge difficulty={maxDifficulty} />
                </div>
                <CardDescription>{track.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="size-4" />
                    {totalLessons} lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" />
                    {totalDuration} min
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Hash className="size-4" />
                    {track.modules.length} modules
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-[0.65rem] bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {track.modules.map((mod) => {
                    const modCompleted = mod.lessons.filter(
                      (l) => completedLessons.includes(l.id)
                    ).length;
                    return (
                      <div
                        key={mod.id}
                        className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-foreground">{mod.title}</span>
                          <span className="ml-2">— {mod.lessons.length} lessons</span>
                        </div>
                        {modCompleted > 0 && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {modCompleted}/{mod.lessons.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={() => {
                    // Navigate to the FIRST UNCOMPLETED available lesson,
                    // falling back to the first lesson if all are done
                    const allLessons = track.modules.flatMap((m) => m.lessons);
                    const nextLesson = allLessons.find(
                      (l) => getLessonStatus(l.id) === 'available'
                    );
                    const fallback = allLessons[0];
                    const target = nextLesson ?? fallback;
                    if (target) {
                      const status = getLessonStatus(target.id);
                      if (status !== 'locked') {
                        navigate(`/lesson/${target.id}`);
                        return;
                      }
                    }
                    navigate('/');
                  }}
                  className="w-full"
                >
                  {completedInTrack > 0 ? 'Continue Track' : 'Start Track'}
                  <ArrowRight className="size-4 ml-1" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const config = {
    beginner: {
      label: 'Beginner',
      icon: BookOpen,
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    intermediate: {
      label: 'Intermediate',
      icon: Flame,
      className:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    advanced: {
      label: 'Advanced',
      icon: Flame,
      className:
        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
  };
  const { label, icon: Icon, className } = config[difficulty];
  return (
    <Badge variant="secondary" className={`text-[0.65rem] ${className}`}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
