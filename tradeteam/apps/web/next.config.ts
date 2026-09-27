import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: false, // compression is done by the Node server (and/or reverse proxy)
  transpilePackages: ['@tradeteam/shared'],
  images: { unoptimized: true },
  experimental: { optimizePackageImports: ['lightweight-charts'] },
  // `next dev` on its own (port 3001) proxies API calls to the Node server.
  async rewrites() {
    return process.env.API_ORIGIN
      ? [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN}/api/:path*` }]
      : [];
  },
};

export default config;
