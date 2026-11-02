import type { MetadataRoute } from 'next';

// The public pages Google should list (the address with www is the main one; the plain address forwards to it)
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.oilchangeonthespot.ca';
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' = 'monthly') => ({ url: `${base}${path}`, lastModified: now, changeFrequency, priority });
  return [
    page('/', 1.0, 'weekly'), page('/booking', 0.9, 'weekly'), page('/services', 0.8), page('/maintenance-plan', 0.7), page('/fleet-request', 0.7),
    page('/about', 0.6), page('/faq', 0.6), page('/gallery', 0.5), page('/contact', 0.6), page('/privacy', 0.2), page('/terms', 0.2),
  ];
}
