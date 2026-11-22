/**
 * Lightweight token counter that approximates GPT-style tokenization.
 * This is a simplified version for display purposes only.
 * For production use with accurate token counting, consider using
 * @microsoft/tiktokenizer or similar libraries.
 */

/**
 * Counts approximate tokens in a string.
 * Rules:
 * - Each word (separated by whitespace) counts as 1 token
 * - Punctuation marks (.,!?;: etc.) count as separate tokens
 * - Long words (>5 chars) are split into ~4 character chunks
 * - Empty strings return 0
 */
export function countTokens(text: string): number {
  if (!text || !text.trim()) {
    return 0;
  }

  // Split on whitespace (including newlines)
  const words = text.trim().split(/\s+/);
  let tokenCount = 0;

  for (const word of words) {
    if (!word) continue;

    // Split word into parts: alphanumeric sequences and punctuation
    const parts = word.match(/[a-zA-Z0-9]+|[^\s\w]/g) || [];
    
    for (const part of parts) {
      // Check if it's a word (alphanumeric) or punctuation
      if (/^[a-zA-Z0-9]+$/.test(part)) {
        // Word: split into ~4 character chunks if longer than 5 chars
        if (part.length <= 5) {
          tokenCount += 1;
        } else {
          tokenCount += Math.ceil(part.length / 4);
        }
      } else {
        // Punctuation: each character is a token
        tokenCount += part.length;
      }
    }
  }

  return tokenCount;
}
