/**
 * URL/Text Extraction Service
 * 
 * Fetches clean, readable text from user-provided URLs or raw text inputs,
 * bypassing CORS restrictions using Jina AI's reader API.
 */

/**
 * Extracts clean markdown content from a URL using Jina AI's reader API.
 * 
 * @param url - The URL to extract content from
 * @returns Promise<string> - Clean markdown text, truncated to 15k chars
 * @throws Error - If URL is invalid, request fails, or content is too short
 */
export async function extractContentFromUrl(url: string): Promise<string> {
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format.');
  }

  const jinaUrl = `https://r.jina.ai/${url}`;
  
  const response = await fetch(jinaUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to extract content. The site might be blocking scrapers. (Status: ${response.status})`);
  }

  const text = await response.text();
  
  // Jina sometimes includes metadata at the top. We'll do a basic cleanup.
  // Look for the first actual heading or paragraph.
  const cleanText = text.replace(/^(Title:.*\n|URL:.*\n|Content:.*\n)+/i, '');
  
  if (cleanText.length < 100) {
    throw new Error('Extracted text is too short. The page might be empty or protected.');
  }

  // Truncate to prevent token limit issues with the LLM later (approx 15k chars)
  return cleanText.slice(0, 15000); 
}

/**
 * Validates and truncates raw text input.
 * 
 * @param text - The raw text to process
 * @returns Promise<string> - Text truncated to 15k chars
 * @throws Error - If text is too short
 */
export async function extractContentFromText(text: string): Promise<string> {
  const trimmedText = text.trim();
  if (trimmedText.length < 100) {
    throw new Error('Text is too short to generate a meaningful course.');
  }
  return trimmedText.slice(0, 15000);
}
