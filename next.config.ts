import type { NextConfig } from 'next'
// const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true', })

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true, },
  compiler: { removeConsole: process.env.NODE_ENV === "production" },
  // compiler: { removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false, },
  allowedDevOrigins: ['*'],
  images: {
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