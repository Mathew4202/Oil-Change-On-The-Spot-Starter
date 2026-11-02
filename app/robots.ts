import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/owner', '/api', '/receipt', '/pay', '/invoice', '/b/', '/r/', '/fleet/'] },
    sitemap: 'https://www.oilchangeonthespot.ca/sitemap.xml',
  };
}
