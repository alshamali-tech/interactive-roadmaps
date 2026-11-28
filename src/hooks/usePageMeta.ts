/**
 * P3 — per-route document head management
 *
 * The app is a client-rendered SPA with a single static index.html, so crawlers
 * and link previews only ever see what is written into the live document. This
 * hook upserts the tags a page needs. It is intentionally dependency-free.
 *
 * Note: search engines and most crawlers will still see the static shell first.
 * Genuinely indexed per-route content needs prerendering at build time — recorded
 * in the architecture notes rather than solved here.
 */
import { useEffect } from 'react';

export interface PageMeta {
  /** Full title including the site suffix. */
  title: string;
  description?: string;
  /** Absolute or root-relative image URL for OpenGraph/Twitter previews. */
  image?: string;
  /** 'website' for index pages, 'article' for lessons. */
  type?: 'website' | 'article';
}

const SITE_NAME = 'Interactive Roadmaps';

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
}

function canonicalFromPath(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/\/$/, '')}` || origin;
}

export function usePageMeta({ title, description, image, type = 'website' }: PageMeta): void {
  useEffect(() => {
    document.title = title;

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });

    if (description) {
      upsertMeta('meta[name="description"]', { name: 'description', content: description });
      upsertMeta('meta[property="og:description"]', {
        property: 'og:description',
        content: description,
      });
      upsertMeta('meta[name="twitter:description"]', {
        name: 'twitter:description',
        content: description,
      });
    }

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalFromPath() });

    if (image) {
      upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });
      upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });
    }
  }, [title, description, image, type]);
}
