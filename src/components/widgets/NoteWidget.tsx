import { Info, AlertTriangle, Lightbulb, AlertOctagon } from 'lucide-react';
import type { NoteProps } from '@/curriculum/schema';
import { cn } from '@/lib/utils';
import { InlineMarkdown } from '@/components/utils/InlineMarkdown';

const variantConfig = {
  info: {
    icon: Info,
    border: 'border-blue-400 dark:border-blue-600',
    bg: 'bg-blue-50/60 dark:bg-blue-950/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-amber-400 dark:border-amber-600',
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  tip: {
    icon: Lightbulb,
    border: 'border-emerald-400 dark:border-emerald-600',
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  danger: {
    icon: AlertOctagon,
    border: 'border-red-400 dark:border-red-600',
    bg: 'bg-red-50/60 dark:bg-red-950/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
} as const;

/**
 * Note widget — displays a styled callout with an icon and inline markdown body.
 *
 * Variants: `info`, `warning`, `tip`, `danger` — each with distinct colors and icons.
 */
export function NoteWidget({ variant, title, body }: NoteProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'my-5 rounded-lg border-l-4 p-4',
        config.border,
        config.bg
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn('size-[18px] shrink-0 mt-0.5', config.iconColor)}
        />
        <div className="flex-1 min-w-0">
          {title && (
            <div className="text-sm font-semibold text-foreground mb-1">
              {title}
            </div>
          )}
          <p className="text-sm text-foreground/85 leading-relaxed">
            <InlineMarkdown text={body} />
          </p>
        </div>
      </div>
    </div>
  );
}
