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
      // old membership and plan forms: the maintenance plan is priced per car now
      { source: "/memberships", destination: "/maintenance-plan", permanent: true },
      { source: "/membership-request", destination: "/maintenance-plan", permanent: true },
      { source: "/maintenance-plan-request", destination: "/maintenance-plan", permanent: true },
      { source: "/custom-plan-request", destination: "/maintenance-plan", permanent: true },
      { source: "/thank-you", destination: "/", permanent: false },
    ];
  },
};
module.exports = nextConfig;
