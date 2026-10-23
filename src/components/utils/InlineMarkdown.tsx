import type { ReactNode } from 'react';

/**
 * Renders inline markdown formatting within a string of text.
 *
 * Supports:
 * - **bold** → <strong>
 * - *italic* → <em>
 * - `code` → <code> with monospace styling
 *
 * This is intentionally simple — it does NOT support nested formatting
 * (e.g., `**bold and *italic***`) or links/images. For full markdown
 * rendering, use the MarkdownRenderer in Lesson.tsx.
 */
export function InlineMarkdown({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={`i-${match.index}`} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={`c-${match.index}`}
          className="bg-muted/60 text-foreground/90 rounded px-1.5 py-0.5 text-[0.85em] font-mono"
        >
          {match[4]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push any remaining plain text after the last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
