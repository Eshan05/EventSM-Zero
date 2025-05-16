import type { NextConfig } from 'next'
// const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true', })

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true, },
  compiler: { removeConsole: process.env.NODE_ENV === "production" },
  // compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false, },
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.1.1:3000',
    'http://192.168.1.2:3000',
    'http://192.168.1.3:3000',
    'http://192.168.1.4:3000',
    'http://192.168.1.5:3000',
    'http://192.168.1.6:3000',
    'http://192.168.1.7:3000',
    'http://192.168.1.8:3000',
    'http://192.168.1.9:3000',
  ],
  images: {
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/(login|sign-in|signin|register|sign-up|signup)',
        destination: '/u',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
// export default withBundleAnalyzer(nextConfig)
// module.exports = withBundleAnalyzer(nextConfig)