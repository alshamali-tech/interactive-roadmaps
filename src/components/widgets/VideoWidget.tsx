import { Video, ExternalLink } from 'lucide-react';
import type { VideoProps } from '@/curriculum/schema';

/**
 * Video widget — placeholder for embedded video content.
 *
 * Currently displays a "coming soon" message with the video title/URL.
 * Future: integrate with a video player component for YouTube/Vimeo/self-hosted videos.
 */
export function VideoWidget({ url, title }: VideoProps) {
  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <Video className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Video</span>
      </div>
      <div className="p-8 bg-muted/20 text-center">
        <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Video className="size-8 text-primary" />
        </div>
        <p className="text-sm text-foreground font-medium">
          {title ?? 'Video Content'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Video playback coming soon
        </p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="size-3" />
            Open in new tab
          </a>
        )}
      </div>
    </div>
  );
}
