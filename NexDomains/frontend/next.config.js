/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // Handle Web3 packages that need transpilation
    transpilePackages: [
        '@web3auth/modal',
        '@web3auth/base',
        '@web3auth/ethereum-provider',
        '@web3auth/auth-adapter',
        '@metamask/sdk',
        '@privy-io/react-auth',
        '@privy-io/wagmi',
    ],

    // Use webpack instead of Turbopack for production builds
    // Turbopack has issues with some node_modules containing non-JS files
    experimental: {
        // Disable Turbopack for production builds
    },

    // Silence Turbopack warning - we use webpack config intentionally
    turbopack: {},

    // Server external packages to avoid bundling native modules
    serverExternalPackages: [
        'canvas',
        'pino-pretty',
        'pino',
        'thread-stream',
    ],

    // Webpack configuration for handling problematic packages
    webpack: (config, { isServer }) => {
        // Ignore non-JS files in problematic packages
        config.module.rules.push({
            test: /\.(md|txt|LICENSE|sh|zip)$/,
            type: 'asset/source',
            generator: {
                emit: false,
            },
        });

        // Fallback for React Native packages not available in web
        config.resolve.fallback = {
            ...config.resolve.fallback,
            '@react-native-async-storage/async-storage': false,
        };

        // Externalize Node.js-specific packages
        if (isServer) {
            config.externals = config.externals || [];
            config.externals.push({
                'thread-stream': 'commonjs thread-stream',
                'pino': 'commonjs pino',
            });
        }

        return config;
    },
};

module.exports = nextConfig;
