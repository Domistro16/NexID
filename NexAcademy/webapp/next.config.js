const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname),
  // Keep this explicit so Next.js 16 Turbopack builds don't fail when webpack config exists.
  turbopack: {},
  // Allow larger file uploads for video lessons (500MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
    ],
  },
  // Externalize problematic server-side packages
  serverExternalPackages: [
    'pino',
    'thread-stream',
    'pino-pretty',
    '@prisma/client',
    'prisma',
  ],
  // Webpack configuration (use webpack instead of Turbopack for production builds)
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      '@react-native-async-storage/async-storage': false,
    };
    // Externalize pino to avoid thread-stream issues on client
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pino': 'pino/browser',
      };
    }
    return config;
  },
  // Transpile @reown and @privy packages
  transpilePackages: ['@reown/appkit', '@reown/appkit-controllers', '@reown/appkit-utils', '@privy-io/react-auth', '@privy-io/wagmi'],
};

module.exports = nextConfig;
