/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tell Next.js' SWC compiler to optimise known icon-only packages
  // (`lucide-react`, `react-icons`, etc.) so each export is loaded as a
  // separate module and unused icons can be tree-shaken out (#106).
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'lodash',
      'lodash-es',
      'ramda',
    ],
  },
};

export default nextConfig;
