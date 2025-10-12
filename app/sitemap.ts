import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://your-domain.com'; // <-- CHANGE
  const now = new Date();

  return [
    { url: `${base}/`,        lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/request`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/services`,lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
