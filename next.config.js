/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // Old quote-request pages now go straight to real booking
  async redirects() {
    return [
      { source: "/request", destination: "/booking", permanent: true },
      { source: "/book", destination: "/booking", permanent: true },
      { source: "/quote", destination: "/booking", permanent: true },
      { source: "/services", destination: "/#services", permanent: true },
    ];
  },
};
module.exports = nextConfig;
