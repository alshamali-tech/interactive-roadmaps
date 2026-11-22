import type { CalloutProps } from '@/curriculum/schema';
import { InlineMarkdown } from '@/components/utils/InlineMarkdown';

/**
 * Callout widget — displays a message with an optional emoji and inline markdown body.
 *
 * Used for friendly, conversational asides within lesson content.
 */
export function CalloutWidget({ emoji, title, body }: CalloutProps) {
  return (
    <div className="my-5 rounded-lg border border-border p-4 bg-primary/5">
      <div className="flex items-start gap-3">
        {emoji && <span className="text-2xl shrink-0 leading-none">{emoji}</span>}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="text-sm font-semibold text-foreground mb-1">
              {title}
            </h4>
          )}
          <p className="text-sm text-foreground/85 leading-relaxed">
            <InlineMarkdown text={body} />
          </p>
        </div>
      </div>
    </div>
  );
}
