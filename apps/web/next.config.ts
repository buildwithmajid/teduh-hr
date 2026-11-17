import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:3100';

const nextConfig: NextConfig = {
  // Semua panggilan /api/* diteruskan ke NestJS, sehingga browser hanya bicara ke satu origin
  // dan cookie refresh token (httpOnly, SameSite=Strict, path /api/auth) tetap first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
